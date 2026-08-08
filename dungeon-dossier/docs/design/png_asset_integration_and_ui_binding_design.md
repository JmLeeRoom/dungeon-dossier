# PNG 에셋 통합 및 UI 바인딩 개발 설계서

> **PNG Asset Integration & UI Binding Design Protocol Activated.**

| 항목 | 값 |
|---|---|
| 프로젝트 | 던전 수사 조서 (Dungeon Detective Kim Taehoon) |
| 문서 목적 | 코드 구현 전 PNG 채택 범위, 정규 키, UI 슬롯, Manifest V3.0, 로더 및 검증 계약 확정 |
| 감사 대상 | `docs/NHN AI_image/{Characters,background,UI}/`, `docs/NHN AI PNG Asset Naming Convention.xlsx`, 현재 `dungeon-dossier` 에셋/UI 코드 |
| 런타임 허용 형식 | 소문자 확장자 `.png`만 허용 |
| 참조 전용 | `docs/NHN AI_image/ref/` 전체 — 런타임 복사·등록 금지 |
| 코드 감사 기준일 | 2026-08-08, 현재 작업 트리 |
| 문서 상태 | **Current-Code Audited Implementation Specification** — 기존 동작을 보존하면서 §1.3의 P0 결정을 확정한 뒤 구현 |

---

## 1. Executive Summary

### 1.1 결론

원본 파일, 명명 규칙 엑셀, 현재 UI·앱 조립·Workbench·빌드 코드를 다시 대조한 결과, 신규 NHN 전달물의 런타임 채택 대상은 **72개 PNG**로 확정할 수 있다. 구성은 캐릭터 20개, 배경 13개, UI 39개이며 모두 파일명 기반 키로 중복 없이 등록 가능하다. 대상 폴더를 재귀 복사하면 작업용 PNG 21개와 PSD 33개까지 유입되므로, 복사는 반드시 이 문서의 **명시적 allowlist**를 사용한다.

엑셀은 카테고리별 여러 탭이 아니라 단일 탭 `시트1` 하나이며, 실제 범위는 A1:H82이다. 81개 데이터 행 중 72개가 런타임 대상이고 9개가 `ref` 행이다. 현재 파일명 파서와 엑셀 분해값은 72개 중 68개가 일치하며, 4개 셀만 정규화하면 1:1 대칭이 완성된다.

현재 코드에서 가장 중요한 정정은 다음 네 가지다.

1. 에피소드당 3노드 투영과 미래 노드 redaction/fog는 이미 `gameFlowPresentation.ts`, `strip/model.ts`, `createRunStripScreen.ts`에 구현되어 있다. 이 작업은 진행 머신을 새로 만드는 일이 아니라 **검증된 모델 계약을 유지한 채 보드 renderer만 PNG로 스키닝**하는 일이다.
2. `runtimeAssetRegistry.ts`는 `assets/**/*.png` URL을 eager discovery한 뒤 모든 URL을 `Assets.load`한다. 반면 Manifest V3.0은 Workbench의 16개 배치 슬롯용이며 런타임 화면이 읽지 않는다. catalog·registry·manifest·화면 binding 사이에 실제 연결 계층이 없다.
3. Manifest V3.0의 `slots.*.image`는 현재 **PNG basename 또는 `null`**이다. 이를 같은 버전에서 asset key 필수값으로 바꾸면 Workbench 저장 계약과 기존 테스트를 깨므로, V3는 보존하고 생성 catalog의 `fileName → key → runtimePath` 인덱스로 연결한다.
4. 현재 `assets/`에는 legacy PNG 55개가 이미 있다. 신규 72개만 catalog에 넣고 registry와 완전 일치를 요구할 수 없으므로 전환기 전체 catalog는 **127개(legacy 55 + NHN 72)**를 회계해야 한다. 기존 `dist`에서는 정적 복사본과 Vite hash 산출물이 함께 존재하는 PNG 이중 배포도 실제 확인됐다.

따라서 구현의 중심은 **결정론적 72-file importer**, **전체 127-file runtime catalog**, **V3-compatible placement registry**, **공통 required/optional asset port**, **route 단위 preload**, **화면별 명시 binding**이다. UI는 engine을 직접 import하지 않고 기존 app/DTO projection 경계를 유지한다.

### 1.2 핵심 설계 결정

1. 파일명은 변경하지 않고 정규 키를 `category/name/state`로 생성한다. 예: `idle_mulkung_upset.png` → `idle/mulkung/upset`.
2. 소스 복사는 72개 allowlist만 허용한다. `ref/`, `PSD/`, 루트의 비규격 캐릭터 PNG, 모든 `.psd`는 차단한다.
3. Manifest V3.0의 현 `image: string | null`, 실제 stage 필드명, 기존 16개 slot ID를 보존한다. 생성 catalog가 basename을 정규 key와 URL로 해석하고, 배포용 profile validator가 required 슬롯의 non-null을 보증한다. `image` 자체를 key로 바꾸려면 별도 V4와 3→4 migration이 필요하다.
4. 생성 catalog는 신규 72개만이 아니라 전환기 `assets/` 전체 127개를 기록한다. 각 항목은 `provenance`, `status`, `palettePolicy`, dimensions, digest, bundle을 가진다.
5. 1280×800 원본은 640×400 논리 캔버스에서 기본 0.5배로 사용한다. 단, 기존 `fg-desk`는 1280×321을 x0/y239/640×161로 의도적으로 배치한 예외이며 `preserveAspectRatio: false`를 유지한다.
6. URL discovery는 동기 key lookup을 위해 eager로 유지하되, texture decode는 route/key bundle 단위로 지연한다. 1차 구현은 Pixi cache를 유지하고 unload/ref-count는 범위 밖으로 둔다.
7. 상태별 용의자 PNG는 차분 파츠가 아니라 완성 프레임이므로 **교체 렌더**하고, 기존 remount 후 좌우 shake 동작은 같은 컨테이너에 유지한다. 파트너는 이미 base/used visibility 전환을 지원하므로 별도 mode를 만들지 않는다.
8. 3노드/안개 데이터 계약, `PublicDTO` redaction, UI→engine import 금지 규칙은 변경하지 않는다. 신규 art key는 app presentation 단계에서만 붙이고 VEILED 노드에는 content ID·label·asset key를 넣지 않는다.

### 1.3 구현 전 P0 승인 항목

| P0 | 감사 결과 | 권고 결정 | 승인되지 않을 때의 영향 |
|---|---|---|---|
| 카드 기준 규격 | 명세·현 코드는 640×725이나 실제 `ui_card_base.png`는 **768×1024**이다. 비율도 0.883과 0.750으로 달라 단순 축소 시 일치하지 않는다. | 원본 768×1024를 canonical card canvas로 채택하고 hand/modal 컨테이너에서 등비 축소한다. | 640×725가 필수라면 아트팀의 승인된 재출력본이 필요하다. 무단 늘림·자르기 금지. |
| 팔레트 검사 정책 | 현재 검사기는 모든 PNG를 최대 16색으로 제한한다. 채택 후보 72개는 모두 16색을 초과한다. | SHA-256이 고정된 승인 production art에는 별도 정책을 적용하고, 생성 placeholder에는 16색 제한을 유지한다. | 현 정책을 그대로 두면 `pnpm check`는 구조적으로 GREEN이 될 수 없다. 전량 자동 양자화는 시각 품질 승인 없이는 금지. |

다음 항목은 코드 구현을 막지는 않지만 콘텐츠 binding을 완료하려면 승인해야 한다.

- `bensi`, `kimyongsa`, 파트너 사진의 정확한 콘텐츠 alias.
- 24개 authored evidence ID를 6개 PNG에 연결하는 명시적 many-to-one 표.
- 공개 claim이 없는 facet을 `HIDDEN_SLOT`로 보일지 여부와 `DEACTIVATED`의 UI 조건. hidden claim의 ID나 문구를 DTO에 다시 노출해서는 안 된다.
- `ui_game_clear/fail`을 encounter 결과 direction overlay로 사용할 최종 타이밍. reason별 dead scene과 최종 run ending art는 별도 계약으로 유지한다.

### 1.4 현재 브랜치 검증 상태

이번 감사에서는 문서 외 에셋/UI 코드를 변경하지 않았고, 현재 작업 트리의 실제 회귀 상태를 다시 확인했다.

| 명령 | 2026-08-08 결과 | 해석 |
|---|---|---|
| `corepack pnpm test` | **113 files / 978 tests 통과** | 현재 unit/integration baseline GREEN |
| UI·app·architecture·Workbench 선별 Vitest | **31 files / 265 tests 통과** | 현 UI 흐름과 주요 asset seam 회귀 없음 |
| `corepack pnpm typecheck` | 통과 | TypeScript baseline GREEN |
| `corepack pnpm lint` | 통과 | lint baseline GREEN |
| `corepack pnpm arch` | 222 modules, 577 dependencies, violation 0 | UI→engine 직접 의존 금지 포함 architecture GREEN |
| `corepack pnpm palette:check` | 기존 PNG 55개 통과 | 신규 72개는 아직 target에 없으며 승인 production 정책 구현 전 |
| Node.js | 실행 환경 24.14; 패키지 요구 범위 `>=22.13 <23` 경고 | 최종 acceptance는 Node 22.13+ / 22.x에서 재실행 |

`corepack pnpm build`, 전체 `corepack pnpm check`, Playwright는 이번 문서 갱신 중 재실행하지 않았다. 또한 Vite 8은 현재 extensionless/directory import 몇 곳에 future native-config 경고를 출력하므로, 에셋 변경과 별개로 `vite.config.ts`와 Workbench save 모듈 import specifier를 명시적으로 정리한다.

---

## 2. Audit Scope and Method

### 2.1 대상과 제외 범위

| 범위 | 파일 수 | 처리 |
|---|---:|---|
| `Characters/` 하위 PNG | 41 | 그중 `iloveimg-resized/` 20개만 채택; 21개 제외 |
| `background/` 직계 PNG | 13 | 전부 채택 |
| `UI/` 직계 PNG | 39 | 전부 채택 |
| 위 세 폴더의 PSD | 33 | 런타임 및 로더에서 전부 차단 |
| `ref/` 전체 | 174개: PNG 169, PSD 4, PUR 1 | 참조 전용; 복사·manifest·glob 대상에서 제외 |
| 최종 런타임 채택 | **PNG 72** | 명시적 allowlist로만 복사 |

대상 세 폴더에는 총 93개 PNG가 있고, 이 문서의 채택 표 72행과 제외 표 21행이 모든 파일을 빠짐없이 회계한다. `ref/`는 사용자 제약상 런타임 대상이 아니므로 개별 169행을 나열하지 않고 디렉터리 단위 차단 규칙으로 관리한다.

### 2.2 감사 방법

- 파일 시스템에서 확장자, 상대 경로, PNG IHDR 해상도·색상 형식·인터레이스 여부 및 SHA-256 중복을 읽었다.
- 엑셀은 원본을 변경하지 않고 OOXML ZIP/XML을 읽어 탭, 행, 셀 타입과 값을 추출했다.
- 스프레드시트 전용 렌더링 런타임이 이 세션에 노출되지 않아 엑셀의 시각 렌더 QA는 수행하지 못했다. 본 결과는 구조·셀값 감사이며, 구현 전에 Excel 또는 LibreOffice에서 한 차례 육안 확인한다.
- 현재 `assetRegistry.ts`, `runtimeAssetRegistry.ts`, Manifest V3.0, Workbench 저장기, 팔레트 검사기, 카드·태그·초상화·이벤트 화면 소비 코드를 대조했다.
- 원본 이미지 몇 종을 직접 렌더 확인해 투명 배경, 레이어 역할 및 완성 프레임 여부를 검토했다.

### 2.3 엑셀 구조 요약

| 항목 | 실제 값 |
|---|---|
| 시트 | `시트1` 하나 |
| 유효 범위 | A1:H82 |
| 헤더 | 폴더, 파일명, 1차 구분, 2차 구분, 3차 구분, 에피소드, 스테이지, 비고 |
| 데이터 행 | 81: characters 20, background 13, UI 39, ref 9 |
| 수식·병합·Excel Table | 없음 |
| 파일명 중복 | 없음 |
| 확장자 | 81행 모두 `.png` |

엑셀의 `에피소드`와 `스테이지` 열은 숫자, `tutorial`, `all`, `battle`, `map select`, 빈값이 혼재한다. 따라서 이 두 열을 숫자형 런타임 필드로 직접 읽지 않고, importer에서 문자열 metadata로 보존한 뒤 별도의 콘텐츠 ID 매핑으로 정규화한다.

---

## 3. Asset Directory & File Inventory

### 3.1 채택 경로 규칙

| 소스 종류 | 허용 소스 패턴 | 타겟 디렉터리 | 키 예시 |
|---|---|---|---|
| 캐릭터 | `docs/NHN AI_image/Characters/iloveimg-resized/*.png`의 allowlist | `dungeon-dossier/assets/portraits/` | `idle/mulkung/base` |
| 배경 | `docs/NHN AI_image/background/*.png`의 allowlist | `assets/bg/`; desk만 `assets/fg/` | `bg/event/rest` |
| 카드 | `docs/NHN AI_image/UI/ui_card_*.png` | `assets/cards/`; evidence는 `assets/evidence/` | `ui/card/illust00` |
| 기타 UI | `docs/NHN AI_image/UI/*.png`의 allowlist | `assets/ui/` | `ui/tag/shield` |

타겟 하위 폴더는 배포 조직을 위한 것이고 정규 키에는 관여하지 않는다. 키는 파일명 stem만으로 생성되므로 파일명은 원본과 동일하게 유지한다.

### 3.2 캐릭터 PNG — 채택 20개

모든 파일은 RGBA, 8-bit, non-interlaced, 512×512이다.

| 원본 경로 (`docs/NHN AI_image/` 기준) | 타겟 (`dungeon-dossier/` 기준) | 정규 키 | 해상도 | 용도 |
|---|---|---|---:|---|
| `Characters/iloveimg-resized/idle_bensi_base.png` | `assets/portraits/idle_bensi_base.png` | `idle/bensi/base` | 512×512 | bensi 기본 상태; 실제 캐릭터 매핑 승인 필요 |
| `Characters/iloveimg-resized/idle_bensi_upset.png` | `assets/portraits/idle_bensi_upset.png` | `idle/bensi/upset` | 512×512 | bensi 동요 상태 |
| `Characters/iloveimg-resized/idle_bensi_lose.png` | `assets/portraits/idle_bensi_lose.png` | `idle/bensi/lose` | 512×512 | bensi 패배 상태 |
| `Characters/iloveimg-resized/idle_coffee_base.png` | `assets/portraits/idle_coffee_base.png` | `idle/coffee/base` | 512×512 | 김인턴 파트너 기본 상태 |
| `Characters/iloveimg-resized/idle_coffee_used.png` | `assets/portraits/idle_coffee_used.png` | `idle/coffee/used` | 512×512 | 김인턴 능력 사용 상태 |
| `Characters/iloveimg-resized/idle_goblin_base.png` | `assets/portraits/idle_goblin_base.png` | `idle/goblin/base` | 512×512 | 고블린 기본 상태 |
| `Characters/iloveimg-resized/idle_goblin_upset.png` | `assets/portraits/idle_goblin_upset.png` | `idle/goblin/upset` | 512×512 | 고블린 동요 상태 |
| `Characters/iloveimg-resized/idle_goblin_lose.png` | `assets/portraits/idle_goblin_lose.png` | `idle/goblin/lose` | 512×512 | 고블린 패배 상태 |
| `Characters/iloveimg-resized/idle_kimyongsa_base.png` | `assets/portraits/idle_kimyongsa_base.png` | `idle/kimyongsa/base` | 512×512 | 김용사/타락한 용사 후보 기본 상태 |
| `Characters/iloveimg-resized/idle_kimyongsa_upset.png` | `assets/portraits/idle_kimyongsa_upset.png` | `idle/kimyongsa/upset` | 512×512 | 동요 상태 |
| `Characters/iloveimg-resized/idle_kimyongsa_lose.png` | `assets/portraits/idle_kimyongsa_lose.png` | `idle/kimyongsa/lose` | 512×512 | 패배 상태 |
| `Characters/iloveimg-resized/idle_minota_base.png` | `assets/portraits/idle_minota_base.png` | `idle/minota/base` | 512×512 | 튜토리얼 미노타우로스 기본 상태 |
| `Characters/iloveimg-resized/idle_minota_upset.png` | `assets/portraits/idle_minota_upset.png` | `idle/minota/upset` | 512×512 | 미노타우로스 동요 상태 |
| `Characters/iloveimg-resized/idle_minota_lose.png` | `assets/portraits/idle_minota_lose.png` | `idle/minota/lose` | 512×512 | 미노타우로스 패배 상태 |
| `Characters/iloveimg-resized/idle_mulkung_base.png` | `assets/portraits/idle_mulkung_base.png` | `idle/mulkung/base` | 512×512 | 튜토리얼 물컹이 기본 상태 |
| `Characters/iloveimg-resized/idle_mulkung_upset.png` | `assets/portraits/idle_mulkung_upset.png` | `idle/mulkung/upset` | 512×512 | 물컹이 동요 상태 |
| `Characters/iloveimg-resized/idle_mulkung_lose.png` | `assets/portraits/idle_mulkung_lose.png` | `idle/mulkung/lose` | 512×512 | 물컹이 패배 상태 |
| `Characters/iloveimg-resized/idle_succuba_base.png` | `assets/portraits/idle_succuba_base.png` | `idle/succuba/base` | 512×512 | 에피소드 1 서큐버스 기본 상태 |
| `Characters/iloveimg-resized/idle_succuba_upset.png` | `assets/portraits/idle_succuba_upset.png` | `idle/succuba/upset` | 512×512 | 서큐버스 동요 상태 |
| `Characters/iloveimg-resized/idle_succuba_lose.png` | `assets/portraits/idle_succuba_lose.png` | `idle/succuba/lose` | 512×512 | 서큐버스 패배 상태 |

### 3.3 배경 PNG — 채택 13개

`bg_event_post.png`, `bg_event_stamp.png`, `bg_interrogationroom_desk.png`는 RGBA이고 나머지는 opaque RGB이다. 모두 8-bit, non-interlaced이다.

| 원본 경로 (`docs/NHN AI_image/` 기준) | 타겟 (`dungeon-dossier/` 기준) | 정규 키 | 해상도 | 용도 |
|---|---|---|---:|---|
| `background/bg_event_crazyboard.png` | `assets/bg/bg_event_crazyboard.png` | `bg/event/crazyboard` | 1280×800 | 수사 보드 전체 배경 |
| `background/bg_event_dead.png` | `assets/bg/bg_event_dead.png` | `bg/event/dead` | 1280×800 | 사망/실패 이벤트 배경 후보 |
| `background/bg_event_phone.png` | `assets/bg/bg_event_phone.png` | `bg/event/phone` | 1280×800 | 전화 이벤트 배경 |
| `background/bg_event_post.png` | `assets/bg/bg_event_post.png` | `bg/event/post` | 181×156 | 게시물/포스트 이벤트 투명 오버레이 |
| `background/bg_event_rest.png` | `assets/bg/bg_event_rest.png` | `bg/event/rest` | 1280×800 | 휴식 이벤트 배경 |
| `background/bg_event_safe.png` | `assets/bg/bg_event_safe.png` | `bg/event/safe` | 1280×800 | 금고 이벤트 배경 |
| `background/bg_event_scene0.png` | `assets/bg/bg_event_scene0.png` | `bg/event/scene0` | 1280×800 | 범용 이벤트 컷씬 0 |
| `background/bg_event_scene1.png` | `assets/bg/bg_event_scene1.png` | `bg/event/scene1` | 1280×800 | 범용 이벤트 컷씬 1 |
| `background/bg_event_scene2.png` | `assets/bg/bg_event_scene2.png` | `bg/event/scene2` | 1280×800 | 범용 이벤트 컷씬 2 |
| `background/bg_event_stamp.png` | `assets/bg/bg_event_stamp.png` | `bg/event/stamp` | 181×156 | 도장 이벤트 투명 오버레이 |
| `background/bg_event_town.png` | `assets/bg/bg_event_town.png` | `bg/event/town` | 1280×800 | 마을 이벤트 배경 |
| `background/bg_interrogationroom_base.png` | `assets/bg/bg_interrogationroom_base.png` | `bg/interrogationroom/base` | 1280×800 | 취조실 메인 배경 |
| `background/bg_interrogationroom_desk.png` | `assets/fg/bg_interrogationroom_desk.png` | `bg/interrogationroom/desk` | 1280×321 | 취조실 하단 책상 전경 |

### 3.4 UI·카드·단서 PNG — 채택 39개

모두 RGBA, 8-bit, non-interlaced이다. 실제 해상도를 기준으로 하며 명세에 적힌 희망 규격과 다르면 렌더 transform으로 처리한다.

| 원본 경로 (`docs/NHN AI_image/` 기준) | 타겟 (`dungeon-dossier/` 기준) | 정규 키 | 해상도 | 용도 |
|---|---|---|---:|---|
| `UI/ui_board_event.png` | `assets/ui/ui_board_event.png` | `ui/board/event` | 1024×1024 | 보드 자체가 아니라 물음표 포스트잇형 이벤트 노드 마커 |
| `UI/ui_card_base.png` | `assets/cards/ui_card_base.png` | `ui/card/base` | **768×1024** | 카드 서류 베이스; 640×725 아님 |
| `UI/ui_card_evidence00.png` | `assets/evidence/ui_card_evidence00.png` | `ui/card/evidence00` | 256×256 | 물적 증거 폴라로이드 |
| `UI/ui_card_evidence01.png` | `assets/evidence/ui_card_evidence01.png` | `ui/card/evidence01` | 256×256 | 인물 증거 폴라로이드 |
| `UI/ui_card_evidence02.png` | `assets/evidence/ui_card_evidence02.png` | `ui/card/evidence02` | 256×256 | 장부 계열 증거 |
| `UI/ui_card_evidence03.png` | `assets/evidence/ui_card_evidence03.png` | `ui/card/evidence03` | 256×256 | 튜토리얼 커피 증거 |
| `UI/ui_card_evidence04.png` | `assets/evidence/ui_card_evidence04.png` | `ui/card/evidence04` | 256×256 | 에피소드 1 장부 증거 |
| `UI/ui_card_evidence05.png` | `assets/evidence/ui_card_evidence05.png` | `ui/card/evidence05` | 256×256 | 설계도 증거; 엑셀의 에피소드 3 표기는 콘텐츠 확인 필요 |
| `UI/ui_card_illust00.png` | `assets/cards/ui_card_illust00.png` | `ui/card/illust00` | 256×256 | 유도 신문 카드 일러스트 |
| `UI/ui_card_illust01.png` | `assets/cards/ui_card_illust01.png` | `ui/card/illust01` | 256×256 | 서류철 툭 던지기 카드 일러스트 |
| `UI/ui_card_illust02.png` | `assets/cards/ui_card_illust02.png` | `ui/card/illust02` | 256×256 | 모순 지적 카드 일러스트 |
| `UI/ui_card_illust03.png` | `assets/cards/ui_card_illust03.png` | `ui/card/illust03` | 256×256 | 결정적 물증 카드 일러스트 |
| `UI/ui_card_illust04.png` | `assets/cards/ui_card_illust04.png` | `ui/card/illust04` | 256×256 | 물리적 위협 카드 일러스트 |
| `UI/ui_card_illust05.png` | `assets/cards/ui_card_illust05.png` | `ui/card/illust05` | 256×256 | 방해/사용불가 카드 일러스트 |
| `UI/ui_card_post.png` | `assets/cards/ui_card_post.png` | `ui/card/post` | 675×312 | 형광 포스트잇/추가 능력 오버레이 |
| `UI/ui_card_pushy.png` | `assets/cards/ui_card_pushy.png` | `ui/card/pushy` | 344×176 | 강압/클립 계열 오버레이 |
| `UI/ui_card_stamp_logic.png` | `assets/cards/ui_card_stamp_logic.png` | `ui/card_stamp/logic` | 344×176 | 카드 내부 논리 속성 인장 |
| `UI/ui_card_stamp_pushy.png` | `assets/cards/ui_card_stamp_pushy.png` | `ui/card_stamp/pushy` | 344×176 | 카드 내부 강압 속성 인장 |
| `UI/ui_debuff_kiss.png` | `assets/ui/ui_debuff_kiss.png` | `ui/debuff/kiss` | 580×580 | 서큐버스 키스/사용불가 디버프 |
| `UI/ui_game_clear.png` | `assets/ui/ui_game_clear.png` | `ui/game/clear` | 1024×506 | 자백 성공 결과 연출 |
| `UI/ui_game_fail.png` | `assets/ui/ui_game_fail.png` | `ui/game/fail` | 1024×506 | 수사 실패 결과 연출 |
| `UI/ui_icon_composure.png` | `assets/ui/ui_icon_composure.png` | `ui/icon/composure` | 32×32 | 푸른 평정심 아이콘 |
| `UI/ui_icon_pushy.png` | `assets/ui/ui_icon_pushy.png` | `ui/icon/pushy` | 32×32 | 붉은 강압도 아이콘 |
| `UI/ui_photo_bensi.png` | `assets/ui/ui_photo_bensi.png` | `ui/photo/bensi` | 256×256 | 보드/프로필용 bensi 사진 |
| `UI/ui_photo_goblin.png` | `assets/ui/ui_photo_goblin.png` | `ui/photo/goblin` | 256×256 | 보드/프로필용 고블린 사진 |
| `UI/ui_photo_kimyongsa.png` | `assets/ui/ui_photo_kimyongsa.png` | `ui/photo/kimyongsa` | 256×256 | 보드/프로필용 김용사 사진 |
| `UI/ui_photo_minota.png` | `assets/ui/ui_photo_minota.png` | `ui/photo/minota` | 256×256 | 보드/프로필용 미노타우로스 사진 |
| `UI/ui_photo_mulkung.png` | `assets/ui/ui_photo_mulkung.png` | `ui/photo/mulkung` | 256×256 | 보드/프로필용 물컹이 사진 |
| `UI/ui_photo_succuba.png` | `assets/ui/ui_photo_succuba.png` | `ui/photo/succuba` | 256×256 | 보드/프로필용 서큐버스 사진 |
| `UI/ui_photo_teahoon.png` | `assets/ui/ui_photo_teahoon.png` | `ui/photo/teahoon` | 256×256 | 형사 김태훈 사진; 철자 보존 |
| `UI/ui_pin_00.png` | `assets/ui/ui_pin_00.png` | `ui/pin/00` | 128×128 | 수사 보드 핀 |
| `UI/ui_stamp_logic.png` | `assets/ui/ui_stamp_logic.png` | `ui/stamp/logic` | 620×620 | 카드 밖 대형 논리 도장 피드백 |
| `UI/ui_stamp_pushy.png` | `assets/ui/ui_stamp_pushy.png` | `ui/stamp/pushy` | 620×620 | 카드 밖 대형 강압 도장 피드백 |
| `UI/ui_system_00.png` | `assets/ui/ui_system_00.png` | `ui/system/00` | 415×310 | 시스템/텍스트 복합 창; 버튼 atlas로 추정 금지 |
| `UI/ui_tag_base.png` | `assets/ui/ui_tag_base.png` | `ui/tag/base` | 830×330 | 진술 태그 기본 칩 |
| `UI/ui_tag_broken.png` | `assets/ui/ui_tag_broken.png` | `ui/tag/broken` | 830×330 | 파괴된 진술 태그 |
| `UI/ui_tag_deactivate.png` | `assets/ui/ui_tag_deactivate.png` | `ui/tag/deactivate` | 830×330 | 비활성 진술 태그 |
| `UI/ui_tag_hidden.png` | `assets/ui/ui_tag_hidden.png` | `ui/tag/hidden` | 830×330 | 숨겨진 진술 태그 |
| `UI/ui_tag_shield.png` | `assets/ui/ui_tag_shield.png` | `ui/tag/shield` | 830×330 | 방어막 진술 태그 |

### 3.5 대상 폴더 내 제외 PNG — 21개

다음 파일들은 `.png`지만 런타임 채택본과 같은 논리 자산의 원본 크기/작업용 export이므로 복사하지 않는다.

| 제외 원본 경로 (`docs/NHN AI_image/` 기준) | 해상도 | 제외 사유 |
|---|---:|---|
| `Characters/idle_bensi_base.png` | 1229×848 | 루트의 비정규 크기 export; 512×512 채택본과 논리 중복 |
| `Characters/PSD/idle_bensi_base.png` | 1024×1024 | 작업용 export; resized 채택본과 중복 |
| `Characters/PSD/idle_bensi_upset.png` | 1024×1024 | 작업용 export |
| `Characters/PSD/idle_bensi_lose.png` | 1024×1024 | 작업용 export |
| `Characters/PSD/idle_coffee_base.png` | 1024×1024 | 작업용 export |
| `Characters/PSD/idle_coffee_used.png` | 1024×1024 | 작업용 export |
| `Characters/PSD/idle_goblin_base.png` | 1024×1024 | 작업용 export |
| `Characters/PSD/idle_goblin_upset.png` | 1024×1024 | 작업용 export |
| `Characters/PSD/idle_goblin_lose.png` | 1024×1024 | 작업용 export |
| `Characters/PSD/idle_kimyongsa_base.png` | 1024×1024 | 작업용 export |
| `Characters/PSD/idle_kimyongsa_upset.png` | 1024×1024 | 작업용 export |
| `Characters/PSD/idle_kimyongsa_lose.png` | 1024×1024 | 작업용 export |
| `Characters/PSD/idle_minota_base.png` | 1024×1024 | 작업용 export |
| `Characters/PSD/idle_minota_upset.png` | 1024×1024 | 작업용 export |
| `Characters/PSD/idle_minota_lose.png` | 1024×1024 | 작업용 export |
| `Characters/PSD/idle_mulkung_base.png` | 1024×1024 | 작업용 export |
| `Characters/PSD/idle_mulkung_upset.png` | 1024×1024 | 작업용 export |
| `Characters/PSD/idle_mulkung_lose.png` | 1024×1024 | 작업용 export |
| `Characters/PSD/idle_succuba_base.png` | 1024×1024 | 작업용 export |
| `Characters/PSD/idle_succuba_upset.png` | 1024×1024 | 작업용 export |
| `Characters/PSD/idle_succuba_lose.png` | 1024×1024 | 작업용 export |

선택 72개와 제외 21개 사이에 SHA-256이 완전히 같은 파일은 없지만, 파일명·의미가 같은 logical duplicate group이 20개 존재한다. 따라서 hash 중복 제거만으로는 올바른 채택본을 고를 수 없고 경로 allowlist가 필수다.

### 3.6 PSD 및 참조 파일 차단

대상 폴더에는 캐릭터 9개, 배경 5개, UI 19개로 총 33개 PSD가 있다. 특히 `ui_icon_buttons.psd`, `ui_package_00.psd`, `ui_position.psd`는 대응하는 승인 PNG가 없다. 따라서 버튼은 현재 Graphics/코드 렌더를 유지하며, 별도 PNG export가 승인되기 전에는 PSD를 로더에서 읽거나 자동 변환하지 않는다.

엑셀의 `ref` 9행은 `bg_event_crazyboard_ref.png`, `bg_event_end_ref.png`, `bg_event_phone_ref.png`, `bg_event_rest_ref.png`, `bg_event_safe_ref.png`, `bg_event_town_ref.png`, `scene_audio.png`, `scene_display.png`, `scene_start.png`이다. 실제 `ref/`에는 이보다 많은 169개 PNG가 있으므로 엑셀 행 allowlist가 아니라 **최상위 `ref/` 전체 경로 차단**을 적용한다.

Importer의 차단 조건은 다음과 같다.

1. source path가 `ref/` 또는 디렉터리 세그먼트 `PSD`를 포함하면 즉시 실패한다.
2. 확장자가 정확히 `.png`가 아니면 실패한다. 대소문자 변형도 정규화 없이 차단해 저장소 규칙을 단순화한다.
3. allowlist 72개 외 파일은 발견 보고만 하고 복사하지 않는다.
4. 복사 후 대상 개수, 정규 키, 해상도, SHA-256을 생성 catalog와 대조한다.

---

## 4. Naming Convention and 1:1 Key Contract

### 4.1 정규 키 문법

현재 `src/ui/core/assetRegistry.ts`의 3분할 규칙은 유지하되 확장자와 호환 키 계약을 분리한다. 현 정규식은 `/iu` 플래그 때문에 `.PNG`도 허용하므로 사용자 제약과 다르다. importer, registry parser, palette checker, Workbench client/server 모두 **case-sensitive 소문자 `.png`**만 허용하도록 동일한 helper를 사용해야 한다.

```text
stem       = 파일명에서 마지막 .png를 제거한 문자열
tokens     = stem을 "_"로 분리
category   = 첫 토큰
state      = 마지막 토큰
name       = 사이의 토큰을 "_"로 다시 결합
assetKey   = category + "/" + name + "/" + state
```

신규 NHN 파일에서 파생되는 키는 ASCII lower-case 세 segment 규칙으로 검증한다. 반면 현재 legacy 55개 중에는 한국어 segment가 있으므로 전체 runtime `AssetKey`를 ASCII 정규식 하나로 제한하면 기존 화면이 깨진다. 전환기 runtime key는 NFC 정규화한 non-empty 세 segment와 `/` 금지만 보증하고, `NhnAssetKey`에만 더 엄격한 ASCII 규칙을 적용한다.

| 파일명 | category | name | state | 정규 키 |
|---|---|---|---|---|
| `bg_interrogationroom_base.png` | bg | interrogationroom | base | `bg/interrogationroom/base` |
| `idle_mulkung_upset.png` | idle | mulkung | upset | `idle/mulkung/upset` |
| `ui_card_evidence03.png` | ui | card | evidence03 | `ui/card/evidence03` |
| `ui_card_stamp_logic.png` | ui | card_stamp | logic | `ui/card_stamp/logic` |
| `ui_stamp_logic.png` | ui | stamp | logic | `ui/stamp/logic` |

디렉터리는 키에 포함하지 않는다. 같은 파일명을 두 타겟 폴더에 둘 수 없으며, 키 중복 시 빌드가 실패해야 한다. 파일명은 padding과 원문 철자를 보존한다. `teahoon`을 `taehoon`으로, `00`을 `0`으로 런타임에서 묵시 변환하지 않는다.

### 4.2 엑셀과 파서의 4개 불일치 정규화

엑셀 72개 런타임 행 가운데 아래 4행만 현재 파서 결과와 다르다. 파일명을 바꾸거나 파서를 확장하는 대신, 엑셀 셀을 다음처럼 **텍스트 값으로 정규화하는 변경안**을 별도 승인 후 반영한다.

| 엑셀 행 | 파일명 | 현재 C/D/E | 목표 C/D/E | 최종 키 |
|---:|---|---|---|---|
| 51 | `ui_card_stamp_logic.png` | ui / card / stamp_logic | ui / **card_stamp** / **logic** | `ui/card_stamp/logic` |
| 52 | `ui_card_stamp_pushy.png` | ui / card / stamp_pushy | ui / **card_stamp** / **pushy** | `ui/card_stamp/pushy` |
| 65 | `ui_pin_00.png` | ui / pin / 숫자 0.0 | ui / pin / 텍스트 **00** | `ui/pin/00` |
| 68 | `ui_system_00.png` | ui / system / 숫자 0.0 | ui / system / 텍스트 **00** | `ui/system/00` |

Importer는 Excel의 숫자형 셀에서 key segment를 만들지 않는다. 파일명 stem이 padding을 보존하는 canonical key source이고, C/D/E는 그 결과를 검증하는 규칙이다. 정규화 후 72/72가 1:1 일치해야 한다.

### 4.3 엑셀 품질 이슈와 정규화 정책

| 이슈 | 정책 |
|---|---|
| 폴더 셀은 `characters`, 실제 폴더는 `Characters` | importer의 source mapping에 명시하고 Linux CI에서는 실제 case를 엄격히 사용 |
| 비고의 `enermy` 오타 | 의미 metadata에서 `enemy`로 정정하되 키에는 영향 없음 |
| `scene0~2`와 `evidence00~05`의 padding 방식 차이 | 현 파일명 그대로 보존 |
| `evidence05`가 에피소드 3으로 표기 | 현 콘텐츠가 tutorial/1/4 체계이므로 기획 확인 전 episode binding 금지 |
| `base`, `upset`, `lose` 행 순서가 캐릭터마다 다름 | 행 순서가 아니라 E열 state/파일명으로 결합 |
| episode/stage 빈칸 및 혼합 타입 | optional string metadata로 수집하고 콘텐츠 ID는 별도 명시 매핑 |
| `bg_event_crazyboard`와 `ui_board_event` | 각각 전체 배경과 노드 마커로 별도 유지 |
| `ui_card_stamp_*`와 `ui_stamp_*` | 카드 내부 소형 인장과 화면 피드백용 대형 도장으로 별도 유지 |
| `bg_event_dead`와 `ui_game_fail` | 배경과 결과 오버레이로 별도 유지 |

### 4.4 콘텐츠 의미 alias

런타임 키는 원본 토큰을 보존하고, 한국어 도메인 ID와의 결합은 명시적 alias table에서 수행한다. 다음 표에서 `확정 필요`인 항목은 파일명이 비슷하다는 이유로 자동 결합하지 않는다.

| 도메인 역할 | asset token/key | 상태 | 처리 |
|---|---|---|---|
| 물컹이 용의자 | `idle/mulkung/*` | 확정 가능 | 튜토리얼 일반 전투에 3상태 결합 |
| 미노타우로스 | `idle/minota/*` | 확정 가능 | 튜토리얼 보스에 3상태 결합 |
| 고블린 | `idle/goblin/*` | 확정 가능 | 에피소드 1 용의자에 결합 |
| 서큐버스 | `idle/succuba/*` | 확정 가능 | 에피소드 1 보스에 결합 |
| 김용사/타락한 용사 | `idle/kimyongsa/*` | 확정 필요 | 콘텐츠의 정확한 suspect ID 승인 후 결합 |
| bensi | `idle/bensi/*` | 확정 필요 | 현재 dwarf/harpy 등 어느 인물인지 임의 추정 금지 |
| 김인턴 파트너 | `idle/coffee/base`, `idle/coffee/used` | 엑셀상 partner | 전투 파트너 standing으로 사용 |
| 형사 김태훈 | `ui/photo/teahoon` | 확정 가능 | 보드/프로필 사진으로 사용 |
| 파트너 사진 | 사용자 명세는 `ui/photo/mulkung`, 엑셀에는 coffee photo 없음 | **충돌** | `ui/photo/mulkung`을 물컹이와 김인턴 양쪽에 재사용할지 기획 승인 필요 |
| harpy/orc/dwarf/cyclops 등 현 캐릭터 | 신규 PNG 없음 | 미충족 | 기존 placeholder 유지 또는 `image: null`; 거짓 alias 금지 |

### 4.5 생성 catalog 계약

엑셀 파일을 브라우저 런타임에서 읽지 않는다. 구현 도구가 엑셀과 allowlist를 검증한 뒤 타입 안전한 `runtimeAssetCatalog.json`을 생성해 체크인한다. 신규 importer의 엄격한 72-file invariant와 실제 runtime registry의 전 파일 invariant는 서로 다른 검사다.

```ts
type RuntimeAssetCatalogEntry = {
  readonly key: AssetKey;
  readonly fileName: `${string}.png`;
  readonly runtimePath: `${string}.png`;
  readonly width: number;
  readonly height: number;
  readonly bundles: readonly ("core" | "interrogation" | "board" | "event" | "result")[];
  readonly provenance: "nhn-2026" | "legacy-placeholder";
  readonly status: "active" | "legacy-fallback";
  readonly palettePolicy: "strict16" | "approved-production";
  readonly sha256: string;
  readonly sourceWorkbookRow?: number;
  readonly sourcePath?: string;
};
```

전체 catalog는 전환 시점 기준 **127개 = 현재 legacy 55개 + 신규 NHN 72개**를 회계한다. NHN 72개에는 workbook row/source path/provenance가 필수이고, legacy 55개에는 `legacy-placeholder`와 `strict16`을 명시한다. `placeholder/missing/fallback`도 조용한 예외가 아니라 catalog의 legacy fallback entry로 기록한다.

`runtimePath`와 `fileName`은 반드시 소문자 `.png`로 끝나야 하고 NHN `sourcePath`에는 `/ref/` 또는 `/PSD/`가 없어야 한다. key, path, 크기와 digest는 importer/catalog builder가 생성하며 사람이 여러 파일에 수기로 중복 입력하지 않는다. catalog validator는 다음 두 결과를 별도로 보고한다.

- NHN subset: source/target/catalog/digest **72/72** 일치.
- Runtime set: catalog/Vite glob **127/127** 일치. legacy 제거가 진행되면 고정 숫자 대신 catalog의 provenance별 기대값을 갱신한다.

---

## 5. UI Slot Mapping Architecture

### 5.1 네 가지 ID를 분리한다

| 식별자 | 예 | 책임 |
|---|---|---|
| source row/file | 엑셀 33행 / `bg_interrogationroom_base.png` | 아트 전달물 추적 |
| asset key | `bg/interrogationroom/base` | 런타임 이미지의 불변 identity |
| Manifest V3 placement slot ID | `bg-room` | Workbench가 저장하는 위치·크기·lock; 기존 16개 ID 호환 유지 |
| content binding ID | `suspect_tutorial_slime.base` | 게임 도메인 객체가 사용할 asset key 선택 |

현재 Workbench의 고정 slot은 `bg-room`, 용의자 3상태, `fg-desk`, 카드 4개, 증거 3개, HUD 아이콘 2개, 파트너 2개로 정확히 16개이며 테스트에 고정돼 있다. 이 문서에서 설명을 위해 `interrogation.background` 같은 semantic 이름을 쓰더라도 V3 slot을 묵시적으로 rename하지 않는다. 새 semantic ID가 필요하면 `src/app/uiAssetBindings.ts` 또는 placement alias 계층에서 V3 ID에 매핑한다.

한 asset이 여러 화면에서 재사용될 수 있으므로 asset, placement slot, content binding의 개수는 같을 필요가 없다. 1:1 대칭은 **각 basename/key/path 참조가 정확히 하나의 catalog entry로 해석되고, 각 catalog key가 정확히 하나의 PNG URL과 digest를 가진다**는 뜻이다.

### 5.2 취조실·전투 화면

좌표는 640×400 논리 캔버스 기준이다. `createGameApplication.ts`는 1280×800 Pixi renderer의 stage를 2배로 설정하고 nearest sampling을 사용한다. 아래 값은 현재 화면·Workbench의 실제 계약이며 card와 tag만 별도 승인 후 변경한다.

| 현 slot/영역 | asset key 또는 binding | source px | logical 배치 | scale/fit | 전환/비고 |
|---|---|---:|---|---|---|
| `bg-room` | `bg/interrogationroom/base` | 1280×800 | x0, y0, 640×400 | 0.5 등비 | 최하단; 현재 hardcoded legacy key 교체 |
| `suspect-base/state/lose` | content suspect ID → `idle/{token}/{base,upset,lose}` | 512×512 | x212, y34, 216×216 | 0.421875 등비 | 신규 세 상태는 전체 프레임 **replace**; shake container 유지 |
| `fg-desk` | `bg/interrogationroom/desk` | 1280×321 | x0, y239, **640×161** | 명시 custom size, aspect unlock | 바닥 1px gap 방지를 위한 기존 의도적 절상; `preserveAspectRatio: false` |
| `partner-base/used` | `idle/coffee/{base,used}` | 512×512 | x546, y296, 88×88 | 0.171875 등비 | 기존 두 sprite visibility toggle 유지 |
| `icon-composure` | `ui/icon/composure` | 32×32 | x139, y5, 16×16 | 0.5 등비 | 수치 텍스트·색상 의미 유지 |
| `icon-coercion` | `ui/icon/pushy` | 32×32 | x326, y5, 16×16 | 0.5 등비 | 기존 coercion slot ID와 PNG token 차이는 binding으로 해결 |
| `statements.tag.*` | `ui/tag/{state}` | 830×330 | 권고 폭 98, 높이 약 39 | 등비 축소 | 반복 layout; §5.4의 보안·상태 계약 적용 |
| locked card overlay | `ui/debuff/kiss` | 580×580 | 카드 art 영역 contain | 카드별 overlay | HUD가 아님; `lockedUntilTurn`에서 파생 |

`createEncounterSession.ts`는 현재 `portrait_asset_name` 또는 display name으로 legacy key를 조립하고 파트너 key도 고정한다. 이 seam은 유지하되 content alias table이 `SuspectAssetSet`을 명시적으로 공급하도록 바꾼다. 신규 상태 PNG는 base 위에 겹치지 않고 활성 URL 한 장만 생성한다. 화면은 제출 후 remount되고 `bootstrap.ts`가 이전/현재 상태를 비교해 새 controller의 shake를 호출하므로, texture 교체 완료 후 같은 동작을 보존한다.

`ui_debuff_kiss`는 새 engine 상태가 필요하지 않다. 서큐버스 modifier의 `LOCK_CARD`와 snapshot의 `cards[cardId].lockedUntilTurn`이 이미 있으므로 `InterrogationCardView`에 `locked`, `lockTurnsRemaining`, `debuffAssetKey`를 투영하고 fan/modal 입력 차단과 overlay에 사용한다.

### 5.3 카드 5계층

현재 canonical layout은 640×725이고 실제 `ui_card_base.png`는 768×1024이므로 §1.3의 P0 결정이 먼저다. 권고안은 768×1024를 card-local 좌표계로 채택하고 손패·확대 modal에서 루트 컨테이너만 등비 scale하는 것이다.

코드의 현재 레이어 순서는 `cardLayers.ts` 기준 base → illust → stamp → post → evidence이다. 중요한 차이는 `drawCardCopy()`가 독립 최상위 레이어가 아니라 `cardArtwork.ts`의 base container 안에 들어간다는 점이다. 따라서 후속 raster layer가 제목·비용·설명을 가릴 수 있다. 목표 구조에서 copy를 최상위로 보장하려면 `cardArtwork.ts`가 별도 child를 반환하도록 실제 구현을 바꿔야 한다.

| z | 카드 로컬 슬롯 | 정규 키 | 원본 | 결합 방식 |
|---:|---|---|---:|---|
| 0 | `card.base` | `ui/card/base` | 768×1024 | full canvas |
| 10 | `card.illustration` | `ui/card/illust00~05` | 256×256 | 카드별 명시 key; 이미지 슬롯 등비 배치 |
| 20 | `card.attributeStamp` | `ui/card_stamp/{logic,pushy}` | 344×176 | 카드 내부 속성 인장 |
| 30 | `card.attachment` | `ui/card/post` 또는 `ui/card/pushy` | 675×312 / 344×176 | 투명 overlay; stretch 없이 anchor+scale |
| 40 | `card.evidence[]` | `ui/card/evidence00~05` | 256×256 | evidence ID별 명시 key; 0~3장 bounded overlap/rotation |
| 50 | `card.copy` | code text | — | 제목, 비용, 설명; 이미지와 독립 |
| 60 | `card.lockOverlay` | `ui/debuff/kiss` | 580×580 | 잠긴 카드에만 표시; fan/modal 입력 차단과 동기화 |

“5계층”은 base/illust/stamp-or-attachment/evidence/copy의 **역할 계층**을 뜻하며 sprite가 항상 다섯 장이라는 뜻이 아니다. 현재 evidence는 최대 3장이다. 256×256 source를 여러 장 붙일 때 카드 밖으로 넘치지 않도록 최대 장수, 겹침 간격과 회전을 한 layout 함수에서 고정하고 fan/modal이 같은 resolver를 사용한다. 포스트잇과 evidence의 순서를 카드별 조건문으로 바꾸지 않는다.

현재 `InterrogationCardView.artAssetKey?` seam은 이미 있지만 `createEncounterSession.currentModel()`이 채우지 않고, evidence는 `createInterrogationScreen.ts`에서 배열 index `% 3`으로 선택한다. 다음처럼 app presentation binding으로 교체한다. engine/public DTO에 UI key를 밀어 넣지 않는다.

| presentation binding | 예 | 규칙 |
|---|---|---|
| `InterrogationCardView.artAssetKey` | `ui/card/illust02` | card ID → key 명시 table; intent/modulo 추정 금지 |
| `InterrogationScreenModel.evidenceAssetKeys[evidenceId]` | `ui/card/evidence03` | authored 24 evidence ID → 6 PNG의 승인된 many-to-one table |
| augment token `BLUE` | `ui/card_stamp/logic` | 기획 승인 후 고정 |
| augment token `RED` | `ui/card_stamp/pushy` | 기획 승인 후 고정 |
| augment token `WHO/WHEN/WHERE/WHAT/HOW/WHY` | `ui/card/post` | post-it attachment가 붙은 모든 facet에 공통 사용 |
| augment token `CLIP` | `ui/card/pushy` | 기획 승인 후 고정 |

`cardLayout.ts`, `cardLayers.ts`, `cardArtwork.ts`, `cardFan.ts`, `cardDetailModal.ts`, `createInterrogationScreen.ts`를 한 단위로 바꾼다. root에 명시적 `hitArea`를 두고 장식 sprite는 `eventMode = "none"`으로 설정해 artwork 크기 변화가 카드 클릭 범위를 바꾸지 않게 한다. `src/engine/cardAttachment.ts`와 UI layer contract의 순서 중복도 parity test로 고정하거나 공통 presentation 상수로 정리한다.

### 5.4 진술 태그 상태

| UI 표시 상태 | asset key | 데이터·보안 계약 |
|---|---|---|
| DEFAULT | `ui/tag/base` | Graphics 배경을 PNG로 교체 |
| SHIELDED | `ui/tag/shield` | 기존 state에 직접 결합 |
| BROKEN | `ui/tag/broken` | 기존 state에 직접 결합 |
| HIDDEN_SLOT | `ui/tag/hidden` | 공개 token 없는 facet의 안전한 boolean만 사용; 숨긴 claim ID/문구를 DTO에 재노출 금지 |
| DEACTIVATED | `ui/tag/deactivate` | engine enum 확장이 아니라 현재 선택 불가/소모 상태에서 UI가 파생 |
| SHAKEN | Graphics fallback 또는 별도 승인 key | `deactivate`와 동일하다고 추정하지 않음 |

`toPublicDTO`는 HIDDEN claim을 이미 제거한다. 이 보안 경계를 유지한 채 UI가 six-facet slot의 존재 여부만 전달받게 한다. PNG plate로 바꿔도 label, selected outline, resistance shield child, focus/disabled affordance는 code layer로 유지한다.

830×330 소스의 비율은 약 2.515이다. 현재 `TAG_ROW_HEIGHT=26`, y205, 98×26 layout은 왜곡된다. 권고 폭 98이면 높이는 약 39이므로 tag row y를 약 192로 올리고 drop bounds·card fan 상단·`deskLayout.test.ts`를 함께 갱신한다. 98×26을 유지하려면 아트팀의 nine-slice 또는 승인 crop export가 필요하다.

### 5.5 수사 보드·에피소드 맵

3노드/안개 기능은 신규 범위가 아니다. 현재 `gameFlowPresentation.ts`가 활성 에피소드만 3개 slot으로 투영하고, `strip/model.ts`가 미래 노드를 `{ visibility: "VEILED", role }`로 redaction하며, `createRunStripScreen.ts`가 148×128 카드 3개와 fog/connector/completion stamp를 Graphics로 렌더한다. 기존 누출 방지 테스트를 그대로 보존하고 renderer만 스킨 교체한다.

| UI 영역 | asset key | 구현 요구 |
|---|---|---|
| 보드 배경 | `bg/event/crazyboard` | 1280×800을 0.5배로 배치; 기존 card/connector 좌표 유지 |
| VEILED 노드 | `ui/board/event` | renderer 상수로 generic silhouette만 사용; 모델에 key를 넣지 않음 |
| KNOWN 인물/전투 노드 | `ui/photo/{character}` | `KnownStripNodeView.artAssetKey?`에 app layer가 명시 mapping |
| 노드 핀 | `ui/pin/00` | 사진·메모 위 장식; input hit area에는 영향 없음 |
| 형사 프로필 | `ui/photo/teahoon` | 원본 철자를 보존한 보드 장식/프로필 binding |

`createRunStripScreen` options에 공통 asset lookup을 추가한다. `VEILED` 모델에는 node ID, label, photo key를 절대 넣지 않고, 미래 에피소드 사진도 preload하지 않는다. board는 첫 화면이므로 배경·generic marker·현재 KNOWN node 사진만 boot-critical set에 포함한다.

### 5.6 이벤트·결과 화면

| 화면/상태 | asset key | 현재 seam과 목표 |
|---|---|---|
| non-combat event | `bg/event/{rest,safe,phone,town}` | 현재 `EventSceneModel`에는 art가 없음; app presentation의 event ID → art binding으로 추가 |
| event decoration | `bg/event/{post,stamp}` | 181×156 overlay key와 anchor를 별도 전달; 배경으로 취급 금지 |
| cutscene beat | `bg/event/scene0~2` | 기존 `background_asset_key` schema → `toCutsceneBeatViews` → overlay renderer seam 재사용 |
| decision feedback | `ui/stamp/{logic,pushy}` | 카드 내부 `ui/card_stamp/*`와 별개인 620×620 화면 feedback; option ID → key와 표시 시간 명시 |
| encounter clear/fail | `ui/game/{clear,fail}` | five-direction outcome overlay 뒤/안의 result art로 결합할 타이밍 승인 필요 |
| dead scene background | `bg/event/dead` | reason별 dead illustration과 별도인 배경 layer |
| reason별 dead illustration | 기존 `dead/*` keys | 현재 필수 계약과 640×220 layout 유지; 단일 `ui/game/fail`로 대체 금지 |
| final run ending | optional `illustrationAssetKey` | `ENDING_PRESENTATIONS`에 명시 key를 채울 때만 사용; encounter 결과와 분리 |

event art를 위해 engine domain schema를 먼저 확장하지 않는다. `src/app/gameFlowPresentation.ts`의 presentation binding catalog가 event ID를 background/overlay key에 결합하고 `EventSceneModel`로 전달한다. `createEventScreen.ts`의 현 580×352 불투명 panel은 단순히 배경 sprite를 뒤에 추가하면 art를 가리므로, panel alpha·내부 영역·텍스트 대비를 함께 재설계한다. event 화면은 선택·결과 단계마다 재생성되므로 `bootstrap.ts`의 모든 `createEventScreen` 호출 경로에 asset port를 전달한다.

cutscene은 이미 beat별 background/portrait key를 전달하므로 중복 필드를 만들지 않는다. `bg_event_scene0~2`만 기존 seam에 명시 binding한다. `bg_event_post/stamp`를 cutscene decoration으로도 쓰려면 별도의 overlay key/anchor 계약이 필요하다.

대형 `ui_stamp_logic/pushy` feedback은 현재 event pattern D가 option 적용 직후 곧바로 route하는 흐름에 그대로 끼울 수 없다. 이를 사용하려면 commit 후 짧은 result overlay 단계를 추가하고 option ID → feedback key, duration, skip/input 정책을 명시한다. 카드 내부 소형 `ui_card_stamp_*`와 혼용하지 않는다.

`createEndingScreen.ts`는 현재 illustration을 640×240으로, `createDeadSceneScreen.ts`는 640×220으로 강제 크기 지정한다. 신규 1024×506 결과 art를 stretch하지 않도록 `src/ui/core/imageFit.ts`의 `contain`/`cover`/center/pixel-grid snap helper를 만들고 event/cutscene/ending/dead에서 공유한다.

### 5.7 버튼 및 시스템 창

승인된 PNG 목록에는 독립 버튼 이미지가 없다. `ui_system_00.png`는 415×310 복합 창이며 atlas frame metadata가 없으므로 버튼 sheet로 자르지 않는다. 구현 1차에서는 기존 Graphics 버튼과 접근 가능한 hit area를 유지한다. 버튼 아트가 필요하면 다음 중 하나를 별도 승인한다.

1. 상태별 독립 `.png` export와 명명 규칙 추가.
2. atlas PNG + frame JSON을 스키마에 추가.

어느 경우에도 PSD를 런타임에서 변환하거나 로드하지 않는다.

현재 여러 화면이 private Graphics button 구현을 반복한다. PNG 통합과 함께 `src/ui/widgets/actionButton.ts`를 만들고 hover/focus/disabled/selected outline, keyboard activation, 명시 hit area를 한 곳에 고정한다. 장식 sprite가 버튼 bounds나 입력 우선순위를 바꾸지 않게 한다.

### 5.8 Dossier·evidence tray·reward 범위

`dossier`와 `evidenceTray.ts`는 현재 Graphics와 텍스트 중심이며 취조 화면 내부에서 사용된다. 승인된 evidence 6종을 tray/dossier thumbnail에 재사용할 수 있지만 반드시 §5.3의 evidence ID mapping을 사용한다. 공급된 reward 전용 PNG는 없으므로 reward 화면은 1차 통합에서 Graphics를 유지하고 임의 asset을 재사용하지 않는다. 에셋 누락 오류를 보여주는 error banner도 이미지 없이 렌더해야 이미지 실패 자체를 안전하게 보고할 수 있다.

---

## 6. Current Architecture Audit

### 6.1 현재 코드의 역할과 gap

현재 계층 경계는 다음과 같다. 신규 asset binding도 이 방향을 거슬러서는 안 된다.

```text
content / engine state
        │
        ▼
src/app projection + bootstrap composition
        │  UI-safe model + asset keys
        ▼
src/ui/screens → src/ui/widgets
        │
        ├── UiAssetPort → catalog/runtime URLs/Pixi cache
        └── AssetPlacementRegistry → Manifest V3 transforms
```

`tests/arch/layer-imports.test.ts`가 UI→engine 직접 import를 금지한다. art key는 engine domain object에 무조건 추가하는 대신 app projection 또는 UI binding catalog에서 결합한다.

| 영역 | 현재 구현 | 보존/수정 판단 |
|---|---|---|
| stage/resize | `integerScale.ts`의 640×400 logical, 1280×800 render, stage scale 2, nearest sampling | 보존. 640×400보다 작은 viewport는 scale 1로 clamp되어 clipping되는 현 정책을 문서화하고 literal 640/400은 공통 상수로 치환 |
| composition root | `src/app/bootstrap.ts`가 preload, asset fallback, model projection, scene mount를 한 파일에서 담당 | asset port와 async scene transition을 추출하되 앱/엔진 경계 보존 |
| scene lifecycle | `SceneManager`가 view child를 destroy하되 공유 texture cache는 보존 | 1차 lazy decode와 호환. 임의 `texture.destroy()` 금지 |
| filename parser | filename stem을 3분할하고 duplicate key 차단 | 소문자 `.png` strictness와 Unicode/NFC 호환 계약 보강 |
| runtime discovery | Vite eager URL glob + boot 시 전체 `Assets.load` | URL discovery는 유지, decode만 key/bundle preload로 변경 |
| asset service | interrogation/direction lookup interface가 중복되고 required miss도 fallback으로 대체 | 공통 `UiAssetPort`로 통합; required fail-fast와 optional exact lookup 분리 |
| Manifest V3/Workbench | 실제 stage schema와 16개 canonical slot, basename/null 저장; checked-in `assets/asset_manifest.json`은 아직 없음 | V3 호환 유지. 승인 manifest와 runtime placement consumer, catalog basename bridge 추가 |
| dimension catalog | 10개 ID: bg, desk, portrait, partner, legacy card/art/evidence, icons | 새 원본 크기 ID를 append; 기존 ID rename 금지 |
| Workbench target routing | 파일 prefix를 단일 디렉터리에 연결 | desk/card evidence처럼 같은 prefix가 여러 target으로 갈라져 exact catalog routing 필요 |
| interrogation | background/portrait/partner key seam은 있으나 desk/HUD/card art는 hardcoded | explicit binding과 placement 적용; whole-frame portrait mode 추가 |
| card | 640×725, copy가 base child, evidence index modulo, 최대 evidence 3 | P0 규격 결정, copy 독립 layer, 명시 mapping, bounded evidence layout |
| strip board | 활성 episode 3노드와 VEILED redaction/fog 구현 완료 | model/진행 로직 보존, Graphics renderer만 PNG skinning |
| event | `EventSceneModel`과 화면이 Graphics-only | app presentation에 art binding; 불투명 panel layout도 동시 조정 |
| cutscene | beat background/portrait asset key seam이 이미 존재 | 신규 scene art를 기존 seam에 연결; 새 schema 중복 금지 |
| ending/dead | asset key seam은 있으나 고정 rect로 stretch | 역할 분리 유지 + 공통 aspect-fit helper 적용 |
| theme/widgets | palette와 일부 label만 공통, spacing/size/button 구현 반복 | stage/layout token과 공통 `actionButton` 도입 |

### 6.2 현재 build delivery 중복 위험

`vite.config.ts`는 `assets` 디렉터리를 `dist/assets`로 복사하는 동시에, `assetsInlineLimit: 0`인 Vite glob import가 같은 PNG를 hash 파일로 emit할 수 있다. 신규 72개 압축 크기는 약 18.0 MiB이고 디코드 RGBA 추정량은 약 88.05 MiB이다. 기존 55개를 전환 기간 동안 함께 두면 디코드 추정량이 약 149.66 MiB가 된다.

기존 `dist`를 read-only로 감사한 결과 PNG 94개가 39개 digest 중복 그룹에 포함돼 정적 `dist/assets/...`와 hashed `dist/_app/...`가 함께 존재했다. 이는 가능성만이 아니라 현재 설정에서 확인된 결함이다. 다만 기존 산출물 기준 수치이므로 수정 후 fresh build에서 다시 측정한다.

권고안은 Vite import URL을 canonical delivery로 사용하고 `staticDirectories`에서 **`assets`만 제거**하는 것이다. `content`와 `schemas` 정적 복사는 유지한다. font는 CSS import, audio는 기존 glob을 통해 계속 emit되는지 fresh build로 확인한다. catalog/manifest JSON은 명시 import 또는 raw URL 계약을 가져야 한다. dist에서 동일 SHA-256 PNG가 두 URL로 발견되면 CI를 실패시킨다.

### 6.3 실제 화면 흐름과 preload 경계

```text
bootstrap
  → board-critical preload → mountStrip
  → openCurrentNode
      ├─ event/cutscene preload → event/cutscene
      └─ encounter preload → mountInterrogation
            → encounter outcome/direction preload
            → reward | dead | next strip | final ending
```

현재 `bootstrap.ts`는 registry 전체 preload가 끝난 뒤 fallback adapter를 만들고 화면을 mount한다. 변경 후에도 화면이 texture보다 먼저 생성되지 않도록 공통 `transitionToScene({ requiredKeys, mount })` 같은 async 경계를 둔다.

| 진입점 | preload 대상 | 주의점 |
|---|---|---|
| boot → strip | crazyboard, generic VEILED marker, 현재 KNOWN node 사진 | 미래 node key/id/label은 산출하지도 preload하지도 않음 |
| `openCurrentNode()` → encounter | room/desk, 현재 suspect 3상태, partner, 현재 hand/card/evidence/tag/icon | encounter subset만; legacy art 없는 suspect는 명시 fallback profile |
| `openCurrentNode()` → event | 현재 event background/overlay, BEFORE/AFTER cutscene beat art | `createEventScreen`의 모든 호출 경로에 port 전달 |
| encounter commit → outcome | 해당 direction/clear/fail art | overlay를 보여주기 전에 preload 완료 |
| dead/reward/ending | 선택된 branch art만 | 현재 sync mount를 async transition으로 감싸거나 직전 단계에서 prefetch |

### 6.4 화면별 asset readiness

| 화면 | 현 asset key seam | 구현 범위 |
|---|---|---|
| interrogation | background, suspect states, partner keys 존재 | hardcoded desk/HUD/card/evidence 제거, shared port/placement 적용 |
| cutscene | background/portrait keys 존재 | shared fit/port로 통합 |
| direction | required/optional lookup 존재 | 공통 port로 교체; result timing binding |
| ending | optional illustration key 존재 | presentations에 key 공급 + contain |
| dead | reason별 required key 존재 | reason art 보존 + background/result layer 분리 |
| strip | asset service 없음 | KNOWN art와 board skin용 options 추가 |
| event | asset field/service 없음 | app presentation art model 및 모든 mount call 갱신 |
| dossier/evidence tray | asset service 없음 | evidence thumbnail은 phase 4 optional extension |
| reward/title | 전용 신규 art 없음 | 1차 범위에서 Graphics 유지; title은 현재 route 밖이면 별도 cleanup |

---

## 7. Asset Manifest V3.0 Update Plan

### 7.1 책임 분리

Manifest V3.0은 **기존 Workbench 배치값**, 생성 catalog는 **파일 identity**, UI binding은 **게임 의미 선택**, placement registry는 **런타임 적용**을 책임진다.

```text
XLSX + 72-file allowlist ── import/validate ──┐
existing assets 55 ──────── scan/validate ────┤
                                              ▼
                              runtimeAssetCatalog.json
                         fileName ↔ key ↔ runtimePath
                                  │             │
            asset_manifest.json ──┘             └── src/app/uiAssetBindings.ts
            slot + basename/null                     content/state → key
                     │                                      │
                     └──── AssetPlacementRegistry ──────────┘
                                          │
                                          ▼
                                  screen/widget renderer
```

Manifest에 inventory metadata를 억지로 넣어 V3 strict schema를 깨지 않는다. 별도 catalog를 추가하고 `schema_version: "3.0"`은 유지한다. runtime 화면이 manifest를 전혀 읽지 않는 현재 gap을 `AssetPlacementRegistry`가 해소해야 하며, 교차 검증만 추가하고 실제 consumer를 만들지 않는 구현은 불완전하다.

### 7.2 V3 `image` 필드 호환 계약

실제 `AssetManifestSlotSchema`는 다음 의미를 가진다.

```ts
{
  dimension: AssetDimensionId,
  image: string | null,       // Workbench가 저장한 PNG basename
  transform: AssetTransform,
  isLocked: boolean,
}
```

V3에서 이를 required asset key로 바꾸지 않는다. Workbench는 빈 slot에 `null`, 채운 slot에 PNG basename을 저장하는 현재 동작을 유지한다. 대신 catalog에 unique `fileName` 인덱스를 만들고 다음 두 validation profile을 둔다.

- `editor`: `image: null` 허용. non-null이면 exact catalog basename이고 소문자 `.png`여야 한다.
- `shipping`: 화면별 required slot은 non-null이어야 하며 basename → catalog key → glob URL이 정확히 하나여야 한다. optional/legacy slot만 null 허용.

Manifest에 key를 직접 저장해야 하는 제품 요구가 생기면 `schema_version: "4.0"`, slot의 `asset_key`, 명시적 3→4 migration, Workbench/fixture 동시 이행으로 처리한다. 같은 V3 이름으로 의미를 바꾸는 것은 금지한다.

### 7.3 추가 dimension ID

기존 10개 ID(`bg_interrogation`, `desk_foreground`, `suspect_base`, `suspect_state_parts`, `partner`, `card_base`, `card_illust`, `evidence`, `icon_composure`, `icon_coercion`)는 fixture와 Workbench가 사용하므로 rename하지 않는다. 다음 ID만 append한다.

| 추가 dimension ID | source px | 대표 자산 | 렌더 정책 |
|---|---:|---|---|
| `event_bg_1280x800` | 1280×800 | crazyboard/rest/safe/scene | stage에서 0.5 |
| `event_overlay_181x156` | 181×156 | post/stamp | 등비 anchor |
| `board_marker_1024` | 1024×1024 | ui_board_event | contain |
| `card_base_768x1024` | 768×1024 | ui_card_base | card-local canonical |
| `card_evidence_256` | 256×256 | ui_card_evidence00~05 | 등비; bounded multi-evidence layout |
| `card_post_675x312` | 675×312 | ui_card_post | card-local anchor |
| `card_badge_344x176` | 344×176 | pushy/card stamps | card-local anchor |
| `debuff_580` | 580×580 | kiss | contain |
| `result_1024x506` | 1024×506 | clear/fail | contain, center |
| `photo_256` | 256×256 | ui_photo_* | 보드 node frame |
| `pin_128` | 128×128 | ui_pin_00 | overlay |
| `feedback_stamp_620` | 620×620 | ui_stamp_* | 화면 feedback animation |
| `system_panel_415x310` | 415×310 | ui_system_00 | 패널 단위만 사용 |
| `tag_830x330` | 830×330 | ui_tag_* | 등비, nine-slice 아님 |

256×256 illustration은 기존 `card_illust`를 재사용하고, 1280×321 desk는 `desk_foreground`, 32×32 icon은 `icon_composure`/`icon_coercion`을 사용한다. 존재하지 않는 `desk_1280x321`, `icon_32` 같은 ID를 manifest 예시에 쓰지 않는다. 현 `card_base`는 640×725 legacy contract로 남기고 P0 결정 후 신규 `card_base_768x1024`로 binding을 이행한다.

### 7.4 Manifest 예시

아래는 현재 V3 schema와 Workbench slot ID에 실제로 parse되는 예시다. `stage` field 이름, basename/null, desk 예외를 그대로 반영한다.

```json
{
  "schema_version": "3.0",
  "stage": {
    "width": 640,
    "height": 400,
    "render_width": 1280,
    "render_height": 800,
    "render_scale": 2
  },
  "slots": {
    "bg-room": {
      "dimension": "bg_interrogation",
      "image": "bg_interrogationroom_base.png",
      "transform": {
        "x": 0,
        "y": 0,
        "rotation": 0,
        "scaleX": 0.5,
        "scaleY": 0.5,
        "preserveAspectRatio": true
      },
      "isLocked": true
    },
    "fg-desk": {
      "dimension": "desk_foreground",
      "image": "bg_interrogationroom_desk.png",
      "transform": {
        "x": 0,
        "y": 239,
        "rotation": 0,
        "scaleX": 0.5,
        "scaleY": 0.5,
        "customWidth": 640,
        "customHeight": 161,
        "preserveAspectRatio": false
      },
      "isLocked": true
    },
    "icon-composure": {
      "dimension": "icon_composure",
      "image": "ui_icon_composure.png",
      "transform": {
        "x": 139,
        "y": 5,
        "rotation": 0,
        "scaleX": 0.5,
        "scaleY": 0.5,
        "preserveAspectRatio": true
      },
      "isLocked": true
    }
  }
}
```

`fg-desk`는 321/2=160.5를 161로 올려 stage 바닥의 1px gap을 막는 현 코드의 명시적 예외다. 그 외 `customWidth/customHeight`는 원본 비율을 깨는 편법으로 쓰지 않는다. contain/cover는 공통 `imageFit` helper에서 deterministic하게 계산한다.

### 7.5 lock 및 runtime placement 정책

| 슬롯 종류 | shipped `isLocked` | 이유 |
|---|---|---|
| 전체 배경, 책상 foreground | true | stage 기준 구성 고정 |
| HUD 아이콘, 결과 anchor | true | 입력·텍스트와 정렬 계약 |
| `card-base`, `card-art-*`, `ev-*` Workbench preview slot | 승인 후 true | 기존 16-slot preview composition 보호 |
| 용의자·파트너 canonical anchor | 승인 확정 후 true | Workbench 조정 기간에는 unlock 가능 |
| 카드 내부 layer, 반복 손패·태그·노드 instance | manifest에 instance별 저장하지 않음 | shared resolver + template transform + layout engine으로 생성 |

Workbench는 편집 세션에서 잠금을 해제할 수 있지만 배포 manifest에는 승인된 canonical 값과 lock 상태를 저장한다.

`src/ui/core/placementRegistry.ts`를 추가해 `resolvePlacement(slotId)`가 다음 값을 반환하게 한다.

```ts
type ResolvedPlacement = {
  readonly slotId: string;
  readonly assetKey?: AssetKey;
  readonly url?: string;
  readonly x: number;
  readonly y: number;
  readonly rotation: number;
  readonly width: number;
  readonly height: number;
  readonly isLocked: boolean;
};
```

해석 순서는 slot → manifest basename/null → catalog fileName index → key/URL → `resolveTransformSize`다. 취조실의 고정 배경·책상·HUD부터 hardcoded 좌표를 이 registry 소비로 바꾸고, 손패·태그·노드처럼 반복 생성되는 instance는 manifest에 하나씩 저장하지 않고 template transform과 layout engine으로 계산한다.

### 7.6 Manifest 교차 검증기

빌드 전에 다음 invariant를 모두 검사한다.

1. Manifest `schema_version`은 정확히 `3.0`이다.
2. stage는 `width:640`, `height:400`, `render_width:1280`, `render_height:800`, `render_scale:2`다.
3. non-null `slots.*.image` basename이 catalog에 정확히 하나 존재하고, shipping-required slot은 null이 아니다.
4. 모든 required UI/content binding key가 catalog와 Vite glob에 존재한다. optional lookup은 exact miss를 `undefined`로 보고한다.
5. catalog의 모든 runtime path가 소문자 `.png`이며 실제 IHDR 크기와 digest가 metadata와 일치한다.
6. key, basename, target path, case-folded target path 충돌이 없다.
7. `ref`, `PSD`, `.psd`, `.pur`가 catalog·manifest·dist 어디에도 없다.
8. `preserveAspectRatio: true`이면 scaleX/scaleY 비균등 또는 비율이 다른 custom size를 거부한다. 현재 schema는 scaleX≠scaleY를 아직 막지 않으므로 refine와 테스트를 추가한다.
9. `fg-desk`처럼 승인된 distortion은 `preserveAspectRatio:false`와 exact expected rect를 profile validator가 확인한다.
10. catalog entry는 `active` 또는 의도된 `legacy-fallback` 상태를 가져야 하며, 무표시 orphan을 허용하지 않는다.

---

## 8. Runtime Registry and Loading Design

### 8.1 목표 API

```ts
type AssetBundleId = "core" | "interrogation" | "board" | "event" | "result";

type AssetResolveContext = {
  readonly screen: string;
  readonly contentId?: string;
  readonly slotId?: string;
  readonly bundle?: AssetBundleId;
};

interface UiAssetPort {
  has(key: AssetKey): boolean;
  resolveRequiredUrl(key: AssetKey, context: AssetResolveContext): string;
  resolveOptionalUrl(key: AssetKey): string | undefined;
  preloadKeys(keys: readonly AssetKey[]): Promise<void>;
  preloadBundle(bundle: AssetBundleId, keys?: readonly AssetKey[]): Promise<void>;
}
```

현재 `InterrogationAssetLookup`, `DirectionAssetLookup` 등 화면별 lookup이 중복되고, `bootstrap.ts`의 `resolveUrl`은 missing required key까지 `placeholder/missing/fallback`으로 조용히 치환한다. 위 공통 port로 통합해 required/optional 의미를 함수 이름부터 분리한다. required miss는 screen/content/slot/bundle/expected key를 포함한 flow error이고, optional miss만 `undefined` 또는 명시된 legacy fallback profile로 처리한다.

Registry는 Vite glob의 URL과 generated catalog path를 결합한다. **URL discovery는 eager**로 유지해 화면의 sync lookup을 보존하고, `Assets.load` decode만 `preloadKeys`에서 수행한다. glob에만 있거나 catalog에만 있는 파일, 한 key가 두 URL로 파싱되는 상황은 개발 모드와 CI 모두에서 즉시 오류다.

### 8.2 번들 분리

| 번들 | 포함 | 로드 시점 |
|---|---|---|
| `core` | 명시 fallback과 최초 오류 UI에 필요한 최소 자산 | boot; 오류 UI 자체는 Graphics 유지 |
| `board` | crazyboard, generic marker, pin, 현재 KNOWN node photo | 최초 strip 직전 및 episode 변경 직전 |
| `interrogation` | room/desk, 현재 suspect 3상태, partner, 실제 hand/card/evidence/tag/icon/debuff subset | encounter 진입 직전 |
| `event` | 현재 event background/overlay와 BEFORE/AFTER cutscene beat art | node 확정 후, event/cutscene mount 전 |
| `result` | 해당 direction과 clear/fail 또는 선택된 dead/ending branch art | outcome 확정 직후, overlay/mount 전 |

bundle은 catalog의 거친 소속이고 실제 preload는 현재 screen model에서 산출한 key subset과 교집합으로 실행한다. 특히 board bundle 전체를 로드해 미래 episode 사진을 새게 하지 않는다. `mountStrip`, `mountEnding`, outcome route처럼 현재 sync인 진입점은 공통 async scene transition으로 감싸거나 직전 단계에서 정확한 branch key를 prefetch한다.

### 8.3 키 사용 방식

- UI 코드에서 PNG 경로나 파일명을 직접 문자열로 쓰지 않고 `src/app/uiAssetBindings.ts`가 투영한 typed key를 사용한다.
- `createEncounterSession.ts`의 display-name 조합은 content suspect ID → explicit alias lookup으로 교체한다.
- engine/public DTO는 gameplay 정보만 유지하고 app projection이 `InterrogationScreenModel`, `EventSceneModel`, `KnownStripNodeView`에 art key를 붙인다.
- 화면은 mount 전 preload가 끝났다는 계약 아래 `resolveRequiredUrl`/`resolveOptionalUrl`만 사용하고 target 디렉터리를 알지 않는다.
- 상태 전환은 `SuspectAssetSet { base, upset, lose, stateMode: "replace" }`로 모델링한다.
- missing key error에는 content ID, placement slot, expected key, bundle ID를 포함한다.
- VEILED strip node에는 key 자체를 넣지 않는다. generic marker는 renderer-level board binding이다.

`SceneManager`는 scene child를 파괴하지만 shared texture는 의도적으로 유지한다. 1차 구현은 **selective preload + Pixi cache retention**으로 고정하고 route 이탈 unload/cancel/ref-count는 구현·테스트 범위에서 제외한다. 메모리 계측이 필요성을 입증한 뒤 `ManagedUiLayer` 기반 bundle lease를 별도 설계한다.

### 8.4 팔레트 정책

현재 `tools/palette-check/index.mjs`와 Workbench save handler가 visible-color 계산을 중복 구현하고, 최대 16색 제한은 신규 전달물 72개 전부와 충돌한다. 공통 policy/digest validator로 추출한다.

```text
default PNG                          → strict16 검사
catalog.palettePolicy=strict16       → strict16 검사
catalog.palettePolicy=approved-production
  + sha256가 승인 allowlist와 일치   → 색수 보고 후 통과
  + digest 불일치                    → 실패
```

이 예외는 경로 glob만으로 허용하지 않고 checksum과 catalog entry 양쪽에 묶는다. Workbench를 통해 production art를 덮어쓸 경우 digest가 달라져 저장이 거부되어야 한다. 새 버전을 채택하려면 importer 재실행과 리뷰가 필요하다. 만약 16색 아트 스타일이 제품의 절대 조건이면 별도의 양자화 출력 폴더에서 변환하고 원본 대비 렌더 diff와 아트 승인 후 그 파일의 digest를 채택한다.

권고 소유권은 legacy/generated placeholder 55개=`strict16`, 신규 승인 전달물 72개=`approved-production + exact sha256`이다. Production art는 일반 Workbench upload 경로로 덮어쓰지 않고 importer-only로 보호한다. 새 버전 채택은 source allowlist/digest review와 catalog 재생성으로만 수행한다.

---

## 9. Implementation Roadmap and File-Level Action Items

### 9.1 Phase 0 — 제품 결정과 회귀 기준 고정

| 작업 | 산출물/판정 |
|---|---|
| 카드 canonical 규격 결정 | 768×1024 채택 또는 승인된 640×725 재출력 중 하나 |
| production palette 정책 결정 | checksum-backed 예외 또는 승인된 양자화본 |
| `bensi`, `kimyongsa`, 파트너 photo 의미 확정 | content ID → asset token 표 승인 |
| evidence/태그/result 의미 결정 | 24→6 evidence 표, HIDDEN_SLOT 정책, clear/fail timing 승인 |
| `evidence05` episode 표기 확인 | workbook/content metadata 확정 |
| 회귀 기준 | 현재 GREEN 결과를 Node 22에서 재현하고 결과 기록 |

Importer dry-run·inventory test는 먼저 만들 수 있지만, card layout과 production palette gate를 P0 승인 전에 merge하지 않는다.

### 9.2 Phase 1 — 결정론적 import 파이프라인

| 파일 | 변경 계획 |
|---|---|
| `tools/assets/nhn-png-allowlist.json` (신규) | 이 문서의 72개 source path, target path, workbook row를 선언 |
| `tools/assets/import-nhn-png.mjs` (신규) | XLSX/allowlist/key/dimension/hash 검증 후 정확한 target만 복사; dry-run 기본 지원 |
| `tools/assets/build-runtime-catalog.mjs` (신규) | 기존 55개와 NHN 72개를 합쳐 provenance/status 포함 127-entry catalog 생성 |
| `src/ui/core/generated/runtimeAssetCatalog.json` (신규 생성) | fileName, key, target PNG, dimensions, bundles, palette policy, digest 고정 |
| `docs/NHN AI PNG Asset Naming Convention.xlsx` | 승인 후 51/52/65/68행 셀 타입·분해값 정규화; 원본 파일명 유지 |
| `assets/{portraits,bg,fg,cards,evidence,ui}/` | allowlist 72개만 추가; recursive copy 금지 |
| `package.json` | 현재 없는 `assets:import`, `assets:validate` script를 추가하고 `check`에 validate 포함 |

Importer의 기본 모드는 dry-run이며 `--write`를 명시해야 복사한다. `--check`는 생성물이 최신인지 비교만 하고 파일을 바꾸지 않는다. target routing은 prefix 추정이 아니라 allowlist의 exact source→runtime path를 사용한다. 모든 extension check는 case-sensitive `.png`다.

### 9.3 Phase 2 — Registry·Manifest 계약 연결

| 파일 | 변경 계획 |
|---|---|
| `src/ui/core/assetRegistry.ts` | strict lowercase extension, Unicode/NFC-compatible runtime key, duplicate 진단 강화 |
| `src/ui/core/assetCatalog.ts` (신규) | 생성 JSON schema 검증, readonly catalog index와 bundle query 제공 |
| `src/ui/core/runtimeAssetRegistry.ts` | eager URL discovery + catalog 대조 유지, key/bundle selective decode 추가, preload-all 제거 |
| `src/ui/core/uiAssetPort.ts` (신규) | required/optional lookup과 context-rich 오류의 공통 interface/adapter |
| `src/ui/core/assetDimensions.ts` | §7.3 ID append; 기존 10개 ID와 legacy 640×725 보존 |
| `src/ui/core/assetManifest.ts` | V3 basename/null 보존, preserveAspectRatio일 때 비균등 scale 차단 보강 |
| `assets/asset_manifest.json` | V3.0 stage/slot transform/lock의 승인본 체크인 |
| `src/ui/core/placementRegistry.ts` (신규) | manifest basename→catalog key/URL→resolved rect를 runtime에 공급 |
| `src/app/uiAssetBindings.ts` (신규) | content/event/suspect/card/evidence ID → asset key의 app-layer mapping |
| `src/ui/core/assetBindingValidator.ts` (신규) | catalog ↔ glob ↔ manifest ↔ required bindings 완전성 검사 |
| `src/app/bootstrap.ts` | 중복 lookup 제거, common port 주입, async scene preload transition 도입 |
| `vite.config.ts` | `staticDirectories`에서 `assets`만 제거; content/schemas 유지; extensionless import 경고도 정리 |

### 9.4 Phase 3 — 취조 화면·카드·태그 채우기

| 파일/영역 | 변경 계획 |
|---|---|
| `src/app/createEncounterSession.ts` | display-name/legacy key 조합을 suspect ID alias lookup으로 교체; card art와 lock view 투영 |
| `src/ui/screens/interrogation/model.ts` | `SuspectAssetSet.stateMode`, evidence ID→key map, card lock/debuff fields 추가 |
| `src/app/bootstrap.ts` | model 생성·전 화면 remount·shake 비교 흐름을 유지하며 공통 asset/placement port 주입 |
| `src/ui/screens/interrogation/createInterrogationScreen.ts` | hardcoded room/desk/HUD/card/evidence keys 제거; placement registry와 required binding 사용 |
| `src/ui/widgets/portrait.ts` | `stateMode`에 `"replace"`와 `"overlay"` 추가; 신규 art는 replace, 기존 placeholder는 필요 시 overlay |
| `src/app/suspectTransition.ts` | 기존 base→upset→lose 규칙과 shake 타이밍 유지; texture swap 완료 후 animation 시작 |
| `src/ui/widgets/cardLayout.ts` | canonical 768×1024 card-local layout 및 context root scale 도입 |
| `src/ui/widgets/cardLayers.ts`, `src/engine/cardAttachment.ts` | layer order 확정과 parity 보장 |
| `src/ui/widgets/cardArtwork.ts` | copy를 base child에서 독립 최상위 layer로 분리; art/evidence/attachment resolver 적용 |
| `src/ui/widgets/cardFan.ts`, `cardDetailModal.ts` | 같은 resolver/layout, explicit hitArea, locked input 차단, kiss overlay 적용 |
| `src/ui/widgets/evidenceTray.ts`, 필요 시 `dossier/*` | 승인 evidence map 기반 thumbnail; modulo 제거 |
| `src/ui/widgets/tagChip.ts`, desk layout | PNG plate, HIDDEN_SLOT/DEACTIVATED 파생, 98×39 row/drop bounds 갱신 |
| `src/ui/core/imageFit.ts` (신규) | contain/cover/center/render-grid snap을 공통화 |
| `src/ui/widgets/actionButton.ts` (신규) | 반복 Graphics button의 hit/focus/disabled/keyboard 계약 공통화 |

기존 캐릭터 중 대응 PNG가 없는 대상은 즉시 잘못된 신규 art로 치환하지 않는다. migration 기간에는 content binding이 없는 캐릭터만 기존 placeholder를 사용하며, 개발 로그와 coverage report에서 누락 목록을 노출한다.

### 9.5 Phase 4 — 보드·이벤트·결과 채우기

| 파일/영역 | 변경 계획 |
|---|---|
| `src/app/gameFlowPresentation.ts` | KNOWN strip art와 event art binding을 app layer에서 투영; VEILED redaction 보존 |
| `src/ui/screens/strip/model.ts` | KNOWN view에만 optional art key seam; VEILED union에는 ID/label/key 추가 금지 |
| `src/ui/screens/strip/createRunStripScreen.ts` | 기존 3-card/fog/connector/status 동작을 보존하고 crazyboard/marker/photo/pin으로 skinning |
| `src/ui/screens/event/model.ts` | UI-safe background/overlay key와 anchor 추가 |
| `src/ui/screens/event/createEventScreen.ts` | image background/overlay, panel alpha/layout, 공통 fit/asset port 적용 |
| `src/app/cutscenePlayback.ts` 및 cutscene overlay | 기존 beat key seam에 scene0~2 mapping; 중복 schema 금지 |
| `src/ui/screens/interrogation/directions.ts` | 공통 port와 clear/fail result layer timing 적용 |
| `src/app/deadScene.ts`, `src/ui/screens/ending/createDeadSceneScreen.ts` | reason별 art 보존, dead background 별도 layer, fit helper 적용 |
| `src/app/gameRunState.ts`, ending model/screen | 최종 ending key를 명시하고 encounter result와 분리; contain/center 적용 |
| `src/app/bootstrap.ts` | strip/event의 모든 mount call, outcome/reward/dead/ending route에 preload transition 연결 |

strip의 3노드 로직을 `nodeMap.ts` 같은 새 화면으로 복제하지 않는다. 구현 대상은 현재 실제 경로인 `src/ui/screens/strip/`다. reward 전용 art가 없으므로 reward renderer는 이번 phase에서 보존한다.

### 9.6 Phase 5 — Workbench와 품질 게이트

| 파일 | 변경 계획 |
|---|---|
| `workbench/model.mts` | 기존 16 slot ID 유지, 신규 dimension/profile, whole-state replace preview 추가 |
| Workbench asset routing | prefix→directory 추정을 catalog의 exact `fileName → runtimePath` lookup으로 교체; legacy prefix fallback은 별도 표시 |
| `tools/workbench-save/handler.ts` | case-sensitive PNG-only/path allowlist, V3 basename/null 유지, 공통 palette policy 적용 |
| `tools/palette-check/index.mjs` | visible-color/digest 검사를 공통 모듈로 추출; strict16 + approved-production 정책 |
| production asset 보호 | NHN 72개는 importer-only; 일반 Workbench overwrite는 digest mismatch로 거부 |
| `vite.config.ts` 및 dist validator | PNG 단일 delivery, fresh build digest dedupe, base-path 검증 |
| tests/Playwright | §10의 기존 회귀 갱신, 신규 contract, full browser matrix와 production preview smoke |

### 9.7 의존 순서

```text
P0 승인
  → importer/catalog
    → registry + UiAssetPort + V3 placement bridge
      → shared imageFit/actionButton primitives
        → interrogation + card + tag
        → strip skin + event + cutscene + result
          → workbench save/palette policy + dist delivery
            → full verification + visual approval
```

각 phase는 해당 contract tests가 GREEN인 상태로 다음 단계에 진입한다. UI 구현은 catalog/port/placement contract가 통과한 뒤 시작해 화면마다 임시 경로 문자열이 퍼지는 것을 막는다.

---

## 10. Test and Verification Plan

### 10.1 Import 및 inventory 테스트

| 테스트 | 기대값 |
|---|---|
| source accounting | 대상 세 폴더 PNG 93 = 채택 72 + 제외 21 |
| NHN target count | 신규 target와 `provenance=nhn-2026` catalog exactly 72 |
| runtime catalog count | 전환기 catalog/glob 127 = legacy 55 + NHN 72; 제거 시 provenance 기대값 동시 갱신 |
| category count | characters 20, background 13, UI 39 |
| extension case | runtime/import/workbench 모두 소문자 `.png`만 허용; `.PNG` 거부 |
| forbidden extensions | catalog/target/dist의 `.psd`, `.pur`, 기타 확장자 0 |
| forbidden paths | `/ref/`, `/PSD/` source 0 |
| dimensions | 이 문서 표와 IHDR가 72/72 일치 |
| key parity | XLSX 정규화 후 72/72 parser key 일치 |
| uniqueness | key, basename, target path, case-folded target path 모두 중복 0 |
| checksum | catalog digest와 target digest 72/72 일치 |
| reproducibility | importer 2회 실행 시 두 번째 diff 0 |

### 10.2 Unit/contract 테스트

기존 회귀를 삭제하거나 느슨하게 만들지 않고 아래 파일을 새 계약에 맞춰 갱신한다.

- `tests/ui/assetDimensions.test.ts`, `assetTransform.test.ts`: 기존 10 ID 보존, append ID, desk 640×161 예외, aspect refine.
- `tests/ui/workbench-model.test.ts`, `workbench-character-parts.test.ts`, `workbench-save-request.test.ts`, `tests/tools/workbench-save-handler.test.ts`: 16 slot ID, V3 basename/null, exact routing, PNG case, production digest.
- `tests/ui/portrait-placeholder-catalog.test.ts`, `tests/app/encounter-session.test.ts`, `tests/ui/portrait-widget.test.ts`, `portrait-shake.test.ts`: alias/replace/legacy fallback/shake.
- `tests/ui/interrogation-models.test.ts`, `deskLayout.test.ts`: explicit art maps, card lock, tag 39px row/drop bounds.
- `tests/ui/cardLayering.test.ts`, `card-artwork.test.ts`, `card-widget-interactions.test.ts`: copy top layer, 0~3 evidence, hitArea, locked input.
- `tests/app/game-flow-presentation.test.ts`, `tests/ui/game-flow-screens.test.ts`: 3 KNOWN/VEILED 모델의 무누출 계약을 그대로 유지하며 renderer art만 검증.
- cutscene, direction, dead/ending 기존 테스트: shared port/fit 적용 후 key와 role 분리 회귀.

신규 contract 테스트는 다음과 같다.

1. `tests/tools/import-nhn-png.test.ts`: 93=72+21, workbook parity, dry-run/write 재현성, forbidden path/ext.
2. `tests/ui/assetCatalog.test.ts`: provenance별 55/72, 전체 127, IHDR, digest, bundle/status.
3. `tests/ui/assetBindingValidator.test.ts`: catalog↔glob↔manifest basename↔binding mismatch 진단.
4. `tests/ui/runtimeAssetRegistry.test.ts`: eager URL discovery, selective decode, single-flight, required/optional miss.
5. `tests/ui/placementRegistry.test.ts`: V3 basename 해석, null profile, rect/rotation/lock, desk 예외.
6. `tests/ui/imageFit.test.ts`: contain/cover/center와 2x render-grid snapping.
7. `tests/ui/tagChip.test.ts`: 안전한 HIDDEN_SLOT, DEACTIVATED, 기존 4상태, selected/focus child 유지.
8. `tests/ui/event-assets.test.ts`, `ending-assets.test.ts`: 명시 mapping, panel/fit, clear/fail/dead/ending 분리.
9. `tests/tools/palette-check.test.ts`: strict16 실패, 승인 digest 통과, 경로만 맞고 digest가 다른 경우 실패.
10. fresh-build dist test: static/hash duplicate digest 0, PSD/ref 0, non-root base URL 유효.

### 10.3 시각 검증 matrix

1280×800 render 캡처와 640×400 logical 캔버스 캡처를 모두 남긴다.

| 화면 | 필수 캡처/검사 |
|---|---|
| 취조실 | mapping 완료 캐릭터의 base/upset/lose, coffee base/used; desk 640×161 floor join, occlusion, alpha halo, shake 종료 위치 |
| 카드 | hand/hover/selected/modal, illust 6종, evidence 0~3장, attachment/stamp/copy, lock kiss; text clipping과 hit area |
| 태그 | DEFAULT/SHIELDED/BROKEN/HIDDEN_SLOT/DEACTIVATED + SHAKEN fallback; 98×39 row/drop collision |
| 보드 | crazyboard, generic VEILED marker, KNOWN photo, pin; 정확히 3노드와 미래 key/label 무누출 |
| 이벤트/컷씬 | 배경 9종, 181×156 decoration, panel readability, 기존 beat portrait/background |
| 결과 | direction+clear/fail timing, reason별 dead art/background, final ending을 각각 contain/center |
| 반응형 | 640×400, 1280×800, 브라우저 resize; pixel snapping 및 검은 여백 정책 |

시각 승인 기준은 비율 왜곡 없음, 투명 가장자리 halo 없음, 필수 텍스트 가림 없음, hit area와 sprite 위치 일치, state 전환 중 double-character ghost 없음이다.

### 10.4 성능 및 배포 테스트

- 초기 route에서 preload한 key와 전송/decoded byte를 기록하고 전체 127개 decode가 발생하지 않는지 검사한다.
- 같은 URL/key를 여러 화면에서 요청해도 texture decode가 한 번인지 확인한다.
- v1은 scene destroy 후 shared Pixi texture cache를 유지한다. route unload/cancel을 acceptance로 요구하지 않고 장시간 run의 peak memory만 계측한다.
- `dist`에서 동일 SHA-256 PNG가 hashed URL과 `dist/assets` 양쪽에 중복되지 않는지 검사한다.
- Windows와 Linux의 case-sensitive CI에서 동일 catalog가 생성되는지 확인한다.
- base path가 `/`가 아닌 preview에서도 URL이 유효한지 확인한다.
- 장식 sprite 추가 전후 keyboard Space/Digit1-9 흐름, overlay input suppression, card/tag hit target을 브라우저에서 회귀한다.

### 10.5 최종 명령과 GREEN 정의

최종 검증은 패키지 요구 범위인 Node 22에서 수행한다.

```powershell
corepack pnpm assets:import --check
corepack pnpm assets:validate
corepack pnpm palette:check
corepack pnpm lint
corepack pnpm arch
corepack pnpm typecheck
corepack pnpm test
corepack pnpm content:validate
corepack pnpm simulate:smoke
corepack pnpm build
corepack pnpm e2e:browser
```

`assets:import`와 `assets:validate`는 현재 존재하지 않으므로 Phase 1에서 추가하고 `check`에도 포함한다. 마지막에는 `corepack pnpm check`를 실행한다. `e2e:browser:turbo`는 DPR1의 한 빠른 케이스뿐이므로 최종 gate를 대신할 수 없다. 전체 `e2e:browser`와 fresh production build를 띄운 preview smoke를 별도로 수행한다.

**100% GREEN**의 정의는 다음 모두를 만족하는 것이다.

- 명령 exit code가 전부 0이다.
- 실패 테스트, unhandled rejection, missing asset warning이 0이다.
- NHN subset 72/72와 runtime catalog/glob 127/127이 각각 통과한다.
- shipping Manifest의 required basename이 catalog key/URL로 전부 해석되고 null이 0이다.
- palette checker가 승인 production 파일 수를 명시하고 digest mismatch 0을 보고한다.
- build 산출물에 PSD/ref/중복 PNG가 없다.
- VEILED node model/log/preload에 미래 content ID·label·asset key가 없다.
- 요구 화면의 시각 캡처가 아트·UI 검토를 통과한다.

`pnpm test`만 통과한 상태는 100% GREEN으로 간주하지 않는다. build, palette, content validation과 시각 확인까지 완료되어야 한다.

---

## 11. Risk Register and Open Decisions

| 우선순위 | 위험/미결정 | 영향 | 소유자 | 종료 조건 |
|---|---|---|---|---|
| P0 | 카드 768×1024 vs 640×725 | 전체 card layout 재작업 가능 | UI Technical Director + Art | canonical 규격 서면 승인 |
| P0 | 16색 gate vs production art | check/Workbench 저장 전면 실패 | Tech Art + Build | checksum 정책 또는 승인 양자화본 |
| P1 | bensi/kimyongsa 실제 콘텐츠 ID | 잘못된 캐릭터 노출 | Game Design | alias table 승인 |
| P1 | coffee 파트너와 `ui_photo_mulkung` 충돌 | 김인턴/물컹이 정체성 혼동 | Narrative/UI | partner photo 정책 승인 또는 신규 PNG |
| P1 | 24 evidence ID vs PNG 6개 | modulo 재도입 또는 잘못된 단서 art | Content/UI | 승인된 many-to-one table |
| P1 | evidence05 에피소드 3 표기 | 존재하지 않는 episode binding 가능 | Content Design | workbook/content 수정 |
| P1 | 태그 원본 비율과 현 98×26 | 늘어짐 또는 행 충돌 | UI/Art | 39px 높이 또는 새 export/nine-slice 승인 |
| P1 | V3 `image`를 key로 바꾸는 semantic break | Workbench/fixture/기존 manifest 파손 | UI Tools | V3 basename/null 유지 또는 정식 V4 migration |
| P1 | required miss가 조용한 fallback으로 치환 | 잘못된 art가 production에서 은폐 | App/UI | 공통 port와 fail-fast contract 테스트 |
| P1 | Manifest 좌표가 runtime에서 미소비 | Workbench에서 조정해도 게임에 미반영 | UI Platform | placement registry를 실제 screen이 소비 |
| P1 | Vite 이중 배포 확인됨 | 번들 크기 증가·캐시 중복 | Frontend/Build | fresh dist digest 중복 0 |
| P1 | clear/fail/dead/ending 역할 혼합 | 결과 흐름·서사 art 오표시 | Game Design/UI | layer와 timing table 승인 |
| P1 | HIDDEN tag 구현 중 claim leakage | 미래/숨김 정보 노출 | App/UI/Security | boolean-only HIDDEN_SLOT 및 leakage test |
| P2 | 버튼 PNG 부재 | 일부 UI가 Graphics 유지 | Art/UI | discrete PNG 또는 atlas+JSON 제공 |
| P2 | 현 캐릭터 일부의 신규 art 부재 | 혼합 스타일 기간 발생 | Content/Art | placeholder coverage 0 또는 명시 승인 |
| P2 | bootstrap 단일 파일의 preload/mount 복잡도 | branch별 port 주입 누락 | App | async transition helper와 route coverage |
| P2 | Node 24 로컬 실행 | engine mismatch가 최종 결과를 왜곡 | Build | Node 22.x CI/acceptance 재실행 |

---

## 12. Definition of Done

### 문서 단계 완료 조건

- [x] 대상 세 폴더의 PNG 93개를 채택 72/제외 21로 전수 회계했다.
- [x] 72개 모두에 source, target, key, 실제 해상도와 용도를 지정했다.
- [x] XLSX의 실제 단일 탭, 행 구조, 4개 key 불일치와 metadata 문제를 기록했다.
- [x] 배경, 책상, 용의자, 파트너, 카드 5계층, 태그, 보드, 이벤트, 결과 및 버튼의 바인딩 방식을 정의했다.
- [x] 현재 3노드/VEILED 보드가 이미 구현됐음을 확인하고 renderer-only skinning 범위를 정의했다.
- [x] Manifest V3.0의 실제 basename/null·stage·16-slot 계약과 runtime placement bridge를 정의했다.
- [x] 신규 72개와 기존 55개를 구분한 전체 127-entry catalog 이행안을 정의했다.
- [x] 파일 복사, runtime registry, Workbench, palette, Vite 배포와 테스트 계획을 파일 단위로 정의했다.
- [x] 현재 unit/type/lint/architecture/palette baseline이 GREEN임을 재검증하고 미실행 gate를 분리해 기록했다.

### 구현 단계 완료 조건

- [ ] 카드 규격·팔레트 정책의 P0 두 항목과 콘텐츠 alias/evidence/tag/result 결정이 완료됐다.
- [ ] importer dry-run과 write 결과가 deterministic하고 신규 target 72개만 존재한다.
- [ ] XLSX/allowlist/target의 NHN subset이 72/72, full catalog/Vite glob이 전환기 127/127 일치한다.
- [ ] Manifest V3.0의 required basename이 catalog key와 runtime URL로 전부 해석되고 placement를 실제 화면이 소비한다.
- [ ] required miss는 context-rich error이고 optional/legacy fallback만 명시적으로 허용된다.
- [ ] 취조/카드/태그/보드/이벤트/결과 화면이 승인 PNG를 비율 왜곡 없이 표시한다.
- [ ] 캐릭터 상태 전환은 base→upset→lose whole-frame 교체와 shake를 정상 수행한다.
- [ ] 기존 3-node/VEILED 모델과 미래 정보 무누출 테스트가 그대로 통과한다.
- [ ] boot에서 전체 catalog를 decode하지 않고 화면 진입 전에 필요한 subset만 preload한다.
- [ ] PSD와 `ref/` 파일이 source import, runtime registry, build output에 0개다.
- [ ] fresh build의 PNG digest 중복이 0이고 non-root preview가 정상이다.
- [ ] 모든 자동 명령과 시각 검증이 100% GREEN이다.

---

## Appendix A. Binding Invariants

구현 리뷰에서 아래 문장을 그대로 체크리스트로 사용한다.

1. **PNG only**: 런타임 asset URL은 catalog에 등록된 소문자 `.png`만 가능하다.
2. **No implicit mapping**: 행 순서, 배열 index, modulo, 한국어 display name, 폴더 위치로 asset을 추정하지 않는다.
3. **One key, one image**: 한 asset key는 정확히 한 PNG URL과 digest를 가진다.
4. **V3 basename bridge**: manifest의 non-null basename은 catalog에서 정확히 한 key로 해석되고, UI/content binding은 exact key를 사용한다.
5. **Preserve source aspect**: 별도 아트 승인이 없는 한 모든 image는 등비 렌더한다.
6. **Whole-state portraits**: 신규 base/upset/lose는 동시에 겹치지 않고 한 장씩 교체한다.
7. **Explicit presentation art**: card, evidence, event, suspect art는 ID별 명시 app/UI binding으로 선택하며 engine/public DTO 경계를 오염시키지 않는다.
8. **Lazy decode by route**: URL은 eager discovery할 수 있지만 사용하지 않는 episode·event·result texture는 decode하지 않는다.
9. **Reference means never runtime**: `ref/`는 어떤 build glob, manifest, importer allowlist에도 들어가지 않는다.
10. **Fog means no data**: VEILED node에는 content ID, label, photo key가 없고 generic marker만 renderer가 가진다.
11. **Fallback is explicit**: required miss는 실패하고 optional/legacy fallback만 catalog policy로 허용한다.
12. **Green means full pipeline**: test뿐 아니라 typecheck, palette, content, build, full browser, visual QA가 모두 통과해야 한다.

## Appendix B. Source-of-Truth Priority

서로 충돌할 때의 우선순위는 다음과 같다.

1. 승인된 제품/아트 결정 기록.
2. 이 문서의 72-file allowlist와 실제 PNG byte metadata.
3. 정규화된 XLSX의 파일명 및 C/D/E naming decomposition.
4. 전체 runtime generated catalog의 identity/provenance/digest.
5. Manifest V3.0 placement basename과 app/UI content binding key.
6. 런타임 registry discovery 결과.

아래 단계가 위 단계를 자동으로 덮어쓰지 않는다. 단, V3 schema/slot ID 같은 **현행 호환 계약**을 바꾸려면 문서만으로 재정의하지 않고 version migration을 먼저 설계한다. 파일명이 비슷하다는 이유만으로 기획상 인물 ID를 자동 추정하지 않는다.
