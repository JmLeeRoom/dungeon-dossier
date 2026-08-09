# PNG 에셋 통합 및 UI 바인딩 개발 설계서

> **PNG Asset Integration & UI Binding Design Protocol Activated.**

| 항목 | 값 |
|---|---|
| 프로젝트 | 던전 수사 조서 (Dungeon Detective Kim Taehoon) |
| 문서 목적 | 구현 완료된 PNG 채택 범위, 정규 키, UI 슬롯, Manifest V3.0, 로더·화면 binding 및 검증 결과의 기준선 기록 |
| 감사 대상 | `docs/NHN AI_image/{Characters,background,UI}/`, `docs/NHN AI PNG Asset Naming Convention.xlsx`, 현재 `dungeon-dossier` 에셋/UI 코드 |
| 런타임 허용 형식 | 소문자 확장자 `.png`만 허용 |
| 참조 전용 | `docs/NHN AI_image/ref/` 전체 — 런타임 복사·등록 금지 |
| 코드 감사 기준일 | 2026-08-09, 구현 완료 작업 트리 |
| 문서 상태 | **Implemented & Verification-Green Specification** — 에셋 파이프라인·런타임 binding·Workbench·배포 검증 구현 완료, §1.3의 콘텐츠/아트 승인 항목만 잔존 |

---

## 1. Executive Summary

### 1.1 결론

원본 파일, 명명 규칙 엑셀, 구현 코드와 생성물을 대조한 결과, 대상 폴더의 source PNG **93개는 채택 72개와 제외 21개로 전수 회계**됐다. 채택분은 캐릭터 20개, 배경 13개, UI 39개이며 `tools/assets/nhn-png-allowlist.json`과 결정론적 importer가 정확한 source→target 관계를 고정한다. `ref/`, PSD 및 비규격 작업 파일은 importer·catalog·runtime·dist에서 차단된다.

엑셀은 단일 탭 `시트1`, A1:H82이며 81개 데이터 행 중 72개가 런타임 대상이고 9개가 `ref`다. importer는 workbook 행, allowlist, 파일명 파서, IHDR와 SHA-256을 교차 검증하며 현재 NHN source/target/catalog parity는 **72/72**다. 엑셀 원본 파일명은 바꾸지 않고, 과거 4개 분해 셀의 타입 차이는 importer의 명시적 정규화 계약으로 흡수했다.

구현 완료 후의 핵심 구조는 다음 네 가지다.

1. 에피소드당 3노드 투영과 미래 노드 redaction/fog 계약은 보존됐고, 보드 renderer만 crazyboard·generic marker·KNOWN photo·pin PNG로 스키닝됐다. VEILED 모델에는 content ID·label·asset key가 없다.
2. 생성 catalog는 **127 entries = legacy 55 + NHN 72**를 회계한다. URL discovery는 eager지만 Pixi decode는 route-selective key set만 수행하고, 동일 URL의 병렬 요청은 single-flight로 합쳐진다.
3. Manifest V3.0의 `image: basename | null` 호환 계약은 유지됐다. shipping manifest는 canonical **16 slots 모두 non-null·locked**이며 `placementRegistry.ts`가 basename→catalog key/URL→resolved placement를 실제 화면에 공급한다.
4. `vite.config.ts`는 `assets/` 정적 복사를 제거하고 Vite hash 산출물을 단일 delivery로 사용한다. catalog 127 entries는 동일 byte를 포함한 source 특성상 **111 unique digests**이며, fresh dist에는 같은 digest의 정적/hash 이중 배포가 없다.

최종 UI 감사에서 투명 production 초상화 뒤의 불투명 placeholder panel을 제거했고, fresh Workbench의 빈 checkerboard는 canonical 16개 shipping image를 표시 전용으로 투영해 해결했다. 이어서 채워진 투명 PNG 슬롯의 checkerboard도 제거하고, 동일 좌표를 공유하는 용의자 base/upset/lose와 파트너 base/used는 한 상태만 보이도록 수정했다. 이 보정들은 회귀 테스트가 있으며 Workbench 기본 URL은 editor state·localStorage·manifest·save payload를 변경하지 않는다.

현재 구현의 중심은 **결정론적 72-file importer**, **전체 127-file runtime catalog**, **V3-compatible placement registry**, **공통 required/optional asset port**, **route-selective fail-fast preload**, **화면별 명시 binding**이다. `runtimeContentUrl()`도 Vite base를 사용하므로 `/dungeon-dossier/` 같은 non-root 배포에서 content JSON이 host root로 이탈하지 않는다. UI는 engine을 직접 import하지 않고 기존 app/DTO projection 경계를 유지한다.

### 1.2 핵심 설계 결정

1. 파일명은 변경하지 않고 정규 키를 `category/name/state`로 생성한다. 예: `idle_mulkung_upset.png` → `idle/mulkung/upset`.
2. 소스 복사는 72개 allowlist만 허용한다. `ref/`, `PSD/`, 루트의 비규격 캐릭터 PNG, 모든 `.psd`는 차단한다.
3. Manifest V3.0의 현 `image: string | null`, 실제 stage 필드명과 기존 16개 slot ID를 보존했다. 생성 catalog가 basename을 정규 key와 URL로 해석하고 shipping serializer/save validator가 16개 required 슬롯의 non-null·lock을 강제한다. `image` 자체를 key로 바꾸려면 별도 V4와 3→4 migration이 필요하다.
4. 생성 catalog는 신규 72개뿐 아니라 `assets/` 전체 127개를 기록한다. 각 항목은 `provenance`, `status`, `palettePolicy`, dimensions, digest, bundle을 가진다.
5. 1280×800 원본은 640×400 논리 캔버스에서 기본 0.5배로 사용한다. 단, 기존 `fg-desk`는 1280×321을 x0/y239/640×161로 의도적으로 배치한 예외이며 `preserveAspectRatio: false`를 유지한다.
6. URL discovery는 동기 key lookup을 위해 eager로 유지하되 texture decode는 route/key bundle 단위로 지연한다. 중복 요청은 URL별 single-flight이고 Pixi cache는 route 전환 뒤에도 유지한다.
7. 상태별 용의자 PNG는 차분 파츠가 아니라 완성 프레임으로 **교체 렌더**하며, remount 후 좌우 shake 동작을 같은 컨테이너에서 보존했다. 파트너는 기존 base/used visibility 전환을 유지한다.
8. 3노드/안개 데이터 계약, `PublicDTO` redaction, UI→engine import 금지 규칙은 변경하지 않는다. 신규 art key는 app presentation 단계에서만 붙이고 VEILED 노드에는 content ID·label·asset key를 넣지 않는다.

### 1.3 P0 결정 결과와 잔여 승인 항목

| P0 | 구현 결정 | 현재 판정 |
|---|---|---|
| 카드 기준 규격 | 원본 **768×1024**를 canonical card-local canvas로 채택하고 hand/modal root에서 등비 축소한다. copy는 raster layer 위의 독립 최상위 layer다. | **Closed / tests GREEN** |
| 팔레트 검사 정책 | legacy/generated 55개는 `strict16`, NHN 72개는 catalog의 `approved-production` + exact SHA-256 정책을 적용한다. digest가 달라진 production PNG는 Workbench save와 palette gate가 거부한다. | **Closed / 127 PNG GREEN** |

다음 항목은 코드·자동 검증을 막지 않지만 최종 콘텐츠/아트 의미를 확정하려면 별도 승인이 필요하다.

- `bg_event_scene0~2.png`의 authored cutscene beat ID mapping. 유사한 장면이라는 이유로 자동 연결하지 않는다.
- `bensi`, `kimyongsa`, 파트너/김인턴 사진의 정확한 콘텐츠 identity alias.
- 620×620 대형 `ui_stamp_logic/pushy`의 화면 feedback 의미·타이밍. 카드 내부 `ui_card_stamp_*`와 혼용하지 않는다.
- 최종 run ending 전용 illustration. `ui_game_clear/fail`은 encounter 결과용이며 final ending으로 재사용하지 않는다.
- 신규 NHN art가 없는 legacy 용의자와의 혼합 스타일을 출시 상태로 승인할지, 추가 전달물을 받을지 결정한다.

### 1.4 현재 브랜치 검증 상태

아래 값은 구현 완료 작업 트리를 **Node 22.13.0**에서 재검증한 acceptance 기준이다.

| 명령/게이트 | 2026-08-09 결과 | 해석 |
|---|---|---|
| `corepack pnpm test` | **127 files / 1,092 tests 통과** | unit·integration·contract 전체 GREEN |
| `corepack pnpm simulate:smoke` | **24 tests 통과** | BEST/flag/replay smoke GREEN |
| `corepack pnpm simulate:full` | **43 tests 통과** | 전체 simulation matrix GREEN |
| `corepack pnpm content:validate` | **24 JSON 통과** | content schema/reference GREEN |
| `corepack pnpm arch` | **233 modules / 642 dependencies / violations 0** | UI→engine 경계 포함 architecture GREEN |
| `corepack pnpm assets:validate` | source **93 = 72 adopted + 21 excluded**, catalog **127 = 55 + 72** | workbook/allowlist/target/catalog/digest GREEN |
| Manifest shipping contract | **16/16 image non-null, 16/16 locked** | Workbench serialize/save validation GREEN |
| `corepack pnpm palette:check` | **127 PNG 통과** | strict16 55 + exact-digest production 72 GREEN |
| `corepack pnpm lint` / `typecheck` / `build` | 모두 통과 | Node 22.13.0 acceptance GREEN |
| `corepack pnpm e2e:browser` | **10/10 통과**, Chromium DPR1·DPR2 | boot, asset registry, i18n, 9-node BEST run GREEN |
| `corepack pnpm e2e:preview` | **1/1 통과**, game + Workbench, `/dungeon-dossier/` | fresh production build, base-aware content와 Workbench 16/16 shipping preview GREEN |

fresh build의 PNG delivery에는 PSD/ref/정적 복사 중복이 없다. 유일한 비차단 경고는 minified game chunk **560.83 kB**가 500 kB 권고치를 넘는다는 점이며, 기능·에셋 무결성 실패는 아니다.

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
- 스프레드시트 전용 렌더링 런타임이 이 세션에 노출되지 않아 엑셀의 시각 렌더 QA는 수행하지 못했다. 다만 수식·병합·Excel Table이 없는 데이터 명세이고 importer가 workbook row와 source byte를 전수 검증하므로 런타임 acceptance에는 구조·셀값 감사 결과를 사용했다.
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

`src/ui/core/assetRegistry.ts`와 `tools/assets/assetKey.mjs`는 같은 3분할 규칙을 구현한다. browser parser에서 과거 `/iu` 플래그를 제거했고 importer, catalog builder, palette checker, Workbench client/server 모두 **case-sensitive 소문자 `.png`**만 허용한다. parser parity는 contract test로 고정돼 있다.

```text
stem       = 파일명에서 마지막 .png를 제거한 문자열
tokens     = stem을 "_"로 분리
category   = 첫 토큰
state      = 마지막 토큰
name       = 사이의 토큰을 "_"로 다시 결합
assetKey   = category + "/" + name + "/" + state
```

신규 NHN 파일에서 파생되는 키는 ASCII lower-case 세 segment 규칙으로 검증한다. 반면 현재 legacy 55개 중에는 한국어 segment가 있으므로 전체 runtime `AssetKey`는 NFC 정규화한 non-empty 세 segment를 보증하고, NHN subset에만 더 엄격한 ASCII 규칙을 적용한다.

| 파일명 | category | name | state | 정규 키 |
|---|---|---|---|---|
| `bg_interrogationroom_base.png` | bg | interrogationroom | base | `bg/interrogationroom/base` |
| `idle_mulkung_upset.png` | idle | mulkung | upset | `idle/mulkung/upset` |
| `ui_card_evidence03.png` | ui | card | evidence03 | `ui/card/evidence03` |
| `ui_card_stamp_logic.png` | ui | card_stamp | logic | `ui/card_stamp/logic` |
| `ui_stamp_logic.png` | ui | stamp | logic | `ui/stamp/logic` |

디렉터리는 키에 포함하지 않는다. 같은 파일명을 두 타겟 폴더에 둘 수 없으며, key/basename/case-folded target path 중복은 validation을 실패시킨다. 파일명은 padding과 원문 철자를 보존한다. `teahoon`을 `taehoon`으로, `00`을 `0`으로 런타임에서 묵시 변환하지 않는다.

### 4.2 엑셀과 파서의 4개 불일치 정규화

엑셀 72개 런타임 행 가운데 아래 4행만 raw C/D/E cell과 filename parser 결과가 다르다. 원본 workbook과 파일명을 바꾸지 않고 importer의 명시적 cell normalization이 목표 C/D/E로 정규화한 뒤 filename-derived key와 검증한다.

| 엑셀 행 | 파일명 | 현재 C/D/E | 목표 C/D/E | 최종 키 |
|---:|---|---|---|---|
| 51 | `ui_card_stamp_logic.png` | ui / card / stamp_logic | ui / **card_stamp** / **logic** | `ui/card_stamp/logic` |
| 52 | `ui_card_stamp_pushy.png` | ui / card / stamp_pushy | ui / **card_stamp** / **pushy** | `ui/card_stamp/pushy` |
| 65 | `ui_pin_00.png` | ui / pin / 숫자 0.0 | ui / pin / 텍스트 **00** | `ui/pin/00` |
| 68 | `ui_system_00.png` | ui / system / 숫자 0.0 | ui / system / 텍스트 **00** | `ui/system/00` |

Importer는 Excel의 숫자형 셀에서 key segment를 만들지 않는다. 파일명 stem이 padding을 보존하는 canonical key source이고, C/D/E는 그 결과를 검증하는 규칙이다. 현재 정규화 후 **72/72**가 1:1 일치한다.

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

엑셀 파일은 브라우저 런타임에서 읽지 않는다. `tools/assets/build-runtime-catalog.mjs`가 엑셀·allowlist·실제 PNG를 검증한 뒤 타입 안전한 `src/ui/core/generated/runtimeAssetCatalogData.ts`를 생성해 체크인한다. importer의 엄격한 72-file invariant와 runtime registry의 전체 127-file invariant는 서로 다른 검사다.

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

전체 catalog는 **127개 = legacy 55개 + NHN 72개**를 회계한다. NHN 72개에는 workbook row/source path/provenance가 필수이고, legacy 55개에는 `legacy-placeholder`와 `strict16`이 명시돼 있다. `placeholder/missing/fallback`도 조용한 예외가 아니라 catalog의 legacy fallback entry로 기록된다.

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
| `bg-room` | `bg/interrogationroom/base` | 1280×800 | x0, y0, 640×400 | 0.5 등비 | 최하단; placement registry 소비 완료 |
| `suspect-base/state/lose` | content suspect ID → `idle/{token}/{base,upset,lose}` | 512×512 | x212, y34, 216×216 | 0.421875 등비 | 신규 세 상태는 전체 프레임 **replace**; shake container 유지 |
| `fg-desk` | `bg/interrogationroom/desk` | 1280×321 | x0, y239, **640×161** | 명시 custom size, aspect unlock | 바닥 1px gap 방지를 위한 기존 의도적 절상; `preserveAspectRatio: false` |
| `partner-base/used` | `idle/coffee/{base,used}` | 512×512 | x546, y296, 88×88 | 0.171875 등비 | 기존 두 sprite visibility toggle 유지 |
| `icon-composure` | `ui/icon/composure` | 32×32 | x139, y5, 16×16 | 0.5 등비 | 수치 텍스트·색상 의미 유지 |
| `icon-coercion` | `ui/icon/pushy` | 32×32 | x326, y5, 16×16 | 0.5 등비 | 기존 coercion slot ID와 PNG token 차이는 binding으로 해결 |
| `statements.tag.*` | `ui/tag/{state}` | 830×330 | 권고 폭 98, 높이 약 39 | 등비 축소 | 반복 layout; §5.4의 보안·상태 계약 적용 |
| locked card overlay | `ui/debuff/kiss` | 580×580 | 카드 art 영역 contain | 카드별 overlay | HUD가 아님; `lockedUntilTurn`에서 파생 |

`createEncounterSession.ts`는 승인된 content ID에 대해 `SuspectAssetSet`과 파트너 key를 app-layer binding으로 공급한다. 신규 상태 PNG는 base 위에 겹치지 않고 활성 URL 한 장만 생성하며, 화면 remount 뒤 `bootstrap.ts`가 이전/현재 상태를 비교해 새 controller의 shake를 호출한다. production 초상화는 투명 여백을 가진 완성 프레임이므로 sprite 뒤에 불투명 placeholder panel을 그리지 않는다. 이 조건은 `tests/ui/suspect-portrait-widget.test.ts`가 Graphics child 0개로 고정한다. `bensi`, `kimyongsa`, 파트너 identity가 확정되지 않은 항목만 명시적 legacy alias/fallback 상태로 남아 있다.

`ui_debuff_kiss`는 새 engine 상태가 필요하지 않다. 서큐버스 modifier의 `LOCK_CARD`와 snapshot의 `cards[cardId].lockedUntilTurn`이 이미 있으므로 `InterrogationCardView`에 `locked`, `lockTurnsRemaining`, `debuffAssetKey`를 투영하고 fan/modal 입력 차단과 overlay에 사용한다.

### 5.3 카드 5계층

canonical layout은 실제 `ui_card_base.png`와 같은 **768×1024 card-local 좌표계**로 확정됐다. 손패와 확대 modal은 같은 layout/resolver를 사용하고 root container만 등비 scale한다.

코드의 레이어 순서는 `cardLayers.ts`와 `cardWidget.ts` 기준 base → illust → stamp → post → evidence → copy다. copy는 raster layer와 분리된 최상위 container이며, lock overlay는 카드 상태에 따라 그 위에 추가된다. 장식 sprite는 입력을 받지 않고 root의 명시적 `hitArea`만 상호작용 범위를 결정한다.

| z | 카드 로컬 슬롯 | 정규 키 | 원본 | 결합 방식 |
|---:|---|---|---:|---|
| 0 | `card.base` | `ui/card/base` | 768×1024 | full canvas |
| 10 | `card.illustration` | `ui/card/illust00~05` | 256×256 | 카드별 명시 key; 이미지 슬롯 등비 배치 |
| 20 | `card.attributeStamp` | `ui/card_stamp/{logic,pushy}` | 344×176 | 카드 내부 속성 인장 |
| 30 | `card.attachment` | `ui/card/post` 또는 `ui/card/pushy` | 675×312 / 344×176 | 투명 overlay; stretch 없이 anchor+scale |
| 40 | `card.evidence[]` | `ui/card/evidence00~05` | 256×256 | evidence ID별 명시 key; 0~3장 bounded overlap/rotation |
| 50 | `card.copy` | code text | — | 제목, 비용, 설명; 이미지와 독립 |
| 60 | `card.lockOverlay` | `ui/debuff/kiss` | 580×580 | 잠긴 카드에만 표시; fan/modal 입력 차단과 동기화 |

“5계층”은 base/illust/stamp-or-attachment/evidence/copy의 **역할 계층**을 뜻하며 sprite가 항상 다섯 장이라는 뜻이 아니다. evidence는 최대 3장으로 제한되고 겹침 간격·회전은 공통 layout 함수가 고정한다. fan/modal은 같은 resolver를 사용하며 포스트잇과 evidence의 순서도 동일하다.

`createEncounterSession.currentModel()`은 card ID와 evidence ID의 명시 binding으로 `artAssetKey`와 `evidenceAssetKeys`를 채운다. 배열 index나 modulo 선택은 제거됐고 engine/public DTO에는 UI key를 넣지 않는다.

| presentation binding | 예 | 규칙 |
|---|---|---|
| `InterrogationCardView.artAssetKey` | `ui/card/illust02` | card ID → key 명시 table; intent/modulo 추정 금지 |
| `InterrogationScreenModel.evidenceAssetKeys[evidenceId]` | `ui/card/evidence03` | authored 24 evidence ID → 6 PNG의 deterministic many-to-one table |
| augment token `BLUE` | `ui/card_stamp/logic` | 명시 binding |
| augment token `RED` | `ui/card_stamp/pushy` | 명시 binding |
| augment token `WHO/WHEN/WHERE/WHAT/HOW/WHY` | `ui/card/post` | post-it attachment가 붙은 모든 facet에 공통 사용 |
| augment token `CLIP` | `ui/card/pushy` | 명시 binding |

`cardLayout.ts`, `cardLayers.ts`, `cardWidget.ts`, `cardFan.ts`, `cardDetailModal.ts`, `createInterrogationScreen.ts`가 하나의 composition 계약을 구현한다. root의 명시적 `hitArea`, 장식 sprite의 `eventMode = "none"`, engine/UI attachment 순서 parity가 회귀 테스트로 고정돼 있다.

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

830×330 소스의 비율 약 2.515를 보존하도록 태그 plate는 폭 98, 높이 약 39의 contain 배치를 사용한다. tag row, drop bounds와 card fan 상단은 함께 조정됐고 `deskLayout` 및 tag plate 회귀 테스트가 겹침과 상태별 sprite를 고정한다.

### 5.5 수사 보드·에피소드 맵

`gameFlowPresentation.ts`는 활성 에피소드만 3개 slot으로 투영하고, `strip/model.ts`는 미래 노드를 `{ visibility: "VEILED", role }`로 redaction한다. `createRunStripScreen.ts`는 이 계약을 보존한 채 crazyboard·generic VEILED marker·KNOWN photo·pin PNG를 렌더하며 connector/completion/fog 상태는 기존 동작을 유지한다.

| UI 영역 | asset key | 구현 상태 |
|---|---|---|
| 보드 배경 | `bg/event/crazyboard` | 1280×800을 0.5배로 배치; 기존 card/connector 좌표 유지 |
| VEILED 노드 | `ui/board/event` | renderer 상수로 generic silhouette만 사용; 모델에 key를 넣지 않음 |
| KNOWN 인물/전투 노드 | `ui/photo/{character}` | `KnownStripNodeView.artAssetKey?`에 app layer가 명시 mapping |
| 노드 핀 | `ui/pin/00` | 사진·메모 위 장식; input hit area에는 영향 없음 |
| 형사 프로필 | `ui/photo/teahoon` | 원본 철자를 보존한 보드 장식/프로필 binding |

`createRunStripScreen`은 공통 asset port를 받는다. `VEILED` 모델에는 node ID, label, photo key가 없고 미래 에피소드 사진도 preload하지 않는다. strip 진입 preload는 배경·generic marker·pin·현재 KNOWN node 사진으로 제한된다.

### 5.6 이벤트·결과 화면

| 화면/상태 | asset key | 현재 구현/승인 상태 |
|---|---|---|
| non-combat event | `bg/event/{rest,safe,phone,town}` | event ID → background key의 명시 app binding 구현 완료 |
| event decoration | `bg/event/{post,stamp}` | 181×156 overlay key/anchor를 배경과 분리해 구현 완료 |
| cutscene beat | `bg/event/scene0~2` | renderer seam은 준비됐으나 authored beat ID 승인이 없어 **미연결** |
| decision feedback | `ui/stamp/{logic,pushy}` | 620×620 대형 stamp의 semantic/timing 승인 전이므로 **미연결**; 카드 stamp와 분리 |
| encounter clear/fail | `ui/game/{clear,fail}` | outcome/result binding과 preload 구현 완료 |
| dead scene background | `bg/event/dead` | reason별 dead illustration과 분리된 배경 layer 구현 완료 |
| reason별 dead illustration | 기존 `dead/*` keys | 필수 계약 유지; 단일 `ui/game/fail`로 대체하지 않음 |
| final run ending | optional `illustrationAssetKey` | 전용 art 승인 대기; encounter 결과 art와 분리 유지 |

event art는 engine schema를 확장하지 않고 `gameFlowPresentation.ts`의 presentation binding이 event ID를 background/overlay key에 결합해 `EventSceneModel`로 전달한다. `createEventScreen.ts`는 배경·decoration과 읽기 패널을 분리하며 선택·결과를 포함한 모든 mount 경로에서 공통 asset port를 사용한다.

cutscene은 기존 beat별 background/portrait key seam을 그대로 사용한다. `bg_event_scene0~2`는 임의 추정 mapping을 제거했으며 기획이 authored beat ID를 승인한 뒤 기존 seam에만 연결한다. `bg_event_post/stamp`의 cutscene 재사용 역시 별도 overlay key/anchor 계약 없이는 허용하지 않는다.

대형 `ui_stamp_logic/pushy` feedback은 event pattern D의 즉시 route 흐름과 semantic 승인이 없어 연결하지 않았다. 채택하려면 commit 후 result overlay, option ID → feedback key, duration, skip/input 정책을 함께 승인해야 하며 카드 내부 소형 `ui_card_stamp_*`와 혼용하지 않는다.

`src/ui/core/imageFit.ts`의 contain/cover/center helper가 event/cutscene/ending/dead의 비율 보존 배치를 공통화한다. 1024×506 result art는 고정 rect stretch 없이 contain/center되며 final ending은 별도 art가 승인될 때만 같은 helper를 사용한다.

### 5.7 버튼 및 시스템 창

승인된 PNG 목록에는 독립 버튼 이미지가 없다. `ui_system_00.png`는 415×310 복합 창이며 atlas frame metadata가 없으므로 버튼 sheet로 자르지 않는다. 구현 1차에서는 기존 Graphics 버튼과 접근 가능한 hit area를 유지한다. 버튼 아트가 필요하면 다음 중 하나를 별도 승인한다.

1. 상태별 독립 `.png` export와 명명 규칙 추가.
2. atlas PNG + frame JSON을 스키마에 추가.

어느 경우에도 PSD를 런타임에서 변환하거나 로드하지 않는다.

여러 화면의 Graphics button 통합은 PNG binding의 완료 조건에 포함하지 않았다. 기존 keyboard/hit-area 동작은 browser 회귀로 보존됐으며, 공통 `actionButton` 추출은 독립적인 UI 리팩터링으로 남는다. 장식 sprite는 버튼 bounds나 입력 우선순위를 변경하지 않는다.

### 5.8 Dossier·evidence tray·reward 범위

`dossier`와 `evidenceTray.ts`는 현재 Graphics와 텍스트 중심이며 취조 화면 내부에서 사용된다. 승인된 evidence 6종을 tray/dossier thumbnail에 재사용할 수 있지만 반드시 §5.3의 evidence ID mapping을 사용한다. 공급된 reward 전용 PNG는 없으므로 reward 화면은 1차 통합에서 Graphics를 유지하고 임의 asset을 재사용하지 않는다. 에셋 누락 오류를 보여주는 error banner도 이미지 없이 렌더해야 이미지 실패 자체를 안전하게 보고할 수 있다.

---

## 6. Current Architecture Audit

### 6.1 구현 완료 계층과 책임

현재 계층 경계는 다음과 같다. asset binding은 이 방향을 유지하며 architecture gate가 역방향 import를 차단한다.

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

| 영역 | 구현 완료 상태 | 계약/판정 |
|---|---|---|
| stage/resize | `integerScale.ts`의 640×400 logical, 1280×800 render, stage scale 2, nearest sampling | 기존 pixel-grid 계약 보존 |
| composition root | `bootstrap.ts`가 app projection 후 `UiAssetPort`와 route별 required key set을 화면에 주입 | engine/UI 경계 보존, mount 전 preload 보장 |
| content URL | `runtimeContentUrl.ts`가 `import.meta.env.BASE_URL` 기준으로 `content/` URL 생성 | `/`와 `/dungeon-dossier/` 모두 production preview GREEN |
| scene lifecycle | `SceneManager`는 view child만 destroy하고 shared Pixi texture cache 유지 | selective decode 및 route 간 재사용과 호환 |
| filename/catalog | 소문자 `.png`, NFC-compatible runtime key, duplicate/path/digest 진단 | catalog/glob **127/127**, NHN **72/72** |
| runtime discovery | Vite eager URL discovery + key별 `Assets.load` decode | boot preload-all 제거, URL별 single-flight 구현 |
| asset service | `uiAssetPort.ts`가 required/optional resolve와 key/bundle preload를 공통 제공 | required miss는 context-rich flow error, optional만 `undefined`/명시 fallback |
| Manifest V3/Workbench | checked-in `assets/asset_manifest.json`, basename/null 호환, canonical 16 slots | shipping serialize/save 시 **16 non-null + 16 locked** 강제 |
| dimensions/placement | 기존 ID를 보존하며 신규 source dimension append, `placementRegistry.ts`가 resolved rect 제공 | manifest 좌표를 runtime 화면이 실제 소비 |
| Workbench routing/preview | catalog의 exact `fileName → runtimePath`로 저장 target을 결정하고 canonical manifest basename→catalog path→Vite URL로 기본 미리보기를 해석 | 기본 미리보기는 표시 전용이며 state/localStorage/save payload를 변경하지 않음; 투명 slot host 합성과 상호 배타적 캐릭터 상태 표시; locked asset overwrite·path escape·digest mismatch 거부 |
| interrogation | room/desk/HUD/portrait/partner/card/evidence/tag를 명시 binding | whole-frame portrait replace + shake, production sprite 뒤 불투명 fallback panel 없음, legacy alias만 승인 대기 |
| card/tag | 768×1024 card-local, copy top layer, bounded evidence, lock overlay, 98×39 tag plate | modulo/stretch 제거, fan/modal parity GREEN |
| strip board | 활성 episode 3노드/VEILED redaction 유지 + crazyboard/marker/photo/pin skin | 미래 content/key preload 없음 |
| event/cutscene | event ID별 background/decoration binding, 기존 cutscene key seam 유지 | scene0~2 beat mapping은 승인 전 미연결 |
| result/dead/ending | clear/fail/dead binding과 aspect-fit 구현 | final ending 전용 art만 승인 대기 |
| controls | 기존 Graphics button과 keyboard/hit-area 계약 유지 | PNG sheet 추정 분할 없음; 공통 button 추출은 별도 리팩터링 |

### 6.2 build delivery 및 digest 회계

`vite.config.ts`는 Vite import URL을 canonical asset delivery로 사용하며 `staticDirectories`에서는 `content`와 `schemas`만 복사한다. `assets/` 정적 복사는 제거돼 `dist/assets/...`와 `dist/_app/...`의 이중 배포가 더 이상 발생하지 않는다.

runtime catalog는 127 entries를 가진다. legacy placeholder에 byte-identical 상태 변형이 있어 source 전체의 SHA-256은 **111 unique digests**지만, fresh dist는 각 unique digest를 한 번만 emit한다. `tools/assets/validate-dist.mjs`가 PSD/ref 유입, 누락 digest, 정적/hash 중복을 build 후 검사하며 현재 모두 0이다.

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

`bootstrap.ts`는 boot에서 core fallback만 decode하고, 각 route가 산출한 required key preload를 await한 뒤 화면을 mount한다. overlapping preload는 URL별 single-flight이며 required decode/resolve 실패는 해당 route의 flow error로 전달된다.

| 진입점 | preload 대상 | 주의점 |
|---|---|---|
| boot → strip | crazyboard, generic VEILED marker, pin, 현재 KNOWN node 사진 | 미래 node key/id/label을 산출하거나 preload하지 않음 |
| `openCurrentNode()` → encounter | room/desk, suspect 3상태, partner, route에서 발생 가능한 card/evidence/tag/icon/debuff | initial hand 뒤 동적 draw/augment도 cache miss가 없도록 가능한 card overlay subset 포함 |
| `openCurrentNode()` → event | 현재 event background/overlay와 authored BEFORE/AFTER cutscene art | 승인 없는 scene0~2 추정 mapping은 제외 |
| encounter commit → outcome | 해당 direction/clear/fail 및 선택된 dead branch art | overlay/mount 전에 preload 완료 |
| reward/ending/next strip | 선택된 branch 또는 다음 strip key만 | 전체 result/board bundle decode 금지 |

### 6.4 화면별 asset readiness

| 화면 | readiness | 잔여 조건 |
|---|---|---|
| interrogation/card/tag | required binding, placement, state/lock/attachment 렌더 완료 | bensi/kimyongsa/partner identity 승인 |
| strip | KNOWN art + generic VEILED board skin, selective preload 완료 | mixed legacy art 출시 승인 |
| event | event ID별 background/decoration binding 완료 | 대형 feedback stamp 의미 승인 |
| cutscene | background/portrait seam과 shared fit/port 완료 | scene0~2 authored beat mapping 승인 |
| direction/result | clear/fail binding 및 preload 완료 | 없음 |
| dead | reason art + dead background 분리 완료 | 없음 |
| final ending | optional illustration seam과 contain 준비 완료 | 전용 ending art 승인/전달 |
| dossier/evidence tray | 기존 Graphics/text 기능 보존 | thumbnail 확장은 비필수 후속 범위 |
| reward/title/buttons | 공급된 전용 discrete PNG 없음 | 기존 Graphics 유지; 임의 재사용 금지 |

---

## 7. Asset Manifest V3.0 Implemented Contract

### 7.1 책임 분리

Manifest V3.0은 **기존 Workbench 배치값**, 생성 catalog는 **파일 identity**, UI binding은 **게임 의미 선택**, placement registry는 **런타임 적용**을 책임진다.

```text
XLSX + 72-file allowlist ── import/validate ──┐
existing assets 55 ──────── scan/validate ────┤
                                              ▼
                       generated/runtimeAssetCatalogData.ts
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

Manifest에 inventory metadata를 억지로 넣지 않고 `schema_version: "3.0"`을 유지했다. 별도 generated catalog와 `placementRegistry.ts`가 file identity와 runtime placement를 연결하며, 취조실 배경·책상·HUD 등 canonical placement consumer가 실제 화면에서 이 값을 사용한다.

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

V3에서 이를 required asset key로 바꾸지 않았다. editor 모델은 `null`을 표현할 수 있지만 shipping serializer와 save endpoint는 canonical slot topology를 강제한다. catalog의 unique `fileName` 인덱스와 다음 두 validation profile이 구현돼 있다.

- `editor`: `image: null` 허용. non-null이면 exact catalog basename이고 소문자 `.png`여야 한다.
- `shipping`: canonical 16 slots 모두 non-null·locked이며 basename → catalog key → glob URL이 정확히 하나여야 한다.

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

256×256 illustration은 기존 `card_illust`를 재사용하고, 1280×321 desk는 `desk_foreground`, 32×32 icon은 `icon_composure`/`icon_coercion`을 사용한다. 존재하지 않는 `desk_1280x321`, `icon_32` 같은 ID는 만들지 않았다. canonical card slot은 `card_base_768x1024`로 이행됐고 legacy dimension ID는 호환을 위해 삭제하지 않았다.

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

| 슬롯 종류 | shipped `isLocked` | 현재 판정 |
|---|---|---|
| 전체 배경, 책상 foreground | true | stage 기준 구성 고정 |
| HUD 아이콘 | true | 입력·텍스트와 정렬 계약 고정 |
| `card-base`, `card-art-*`, `ev-*` Workbench preview slot | true | 16-slot shipping composition 보호 |
| 용의자·파트너 canonical anchor | true | shipping anchor 고정 |
| 카드 내부 layer, 반복 손패·태그·노드 instance | manifest에 instance별 저장하지 않음 | shared resolver + template transform + layout engine으로 생성 |

Workbench 편집 상태는 잠금 토글을 지원하지만 `buildShippingAssetManifest()`와 save endpoint는 canonical 16-slot image/dimension/lock topology로 직렬화·검증한다. null image, 누락/추가 slot, wrong dimension, unlocked shipping slot은 파일을 쓰기 전에 거부된다.

fresh Workbench는 `workbench/shipping-preview.mts`에서 canonical 16개 manifest basename을 catalog의 `runtimePath`와 Vite URL에 연결해 기본 이미지를 표시한다. 이 fallback은 **view-only projection**이다. 업로드한 image state가 있으면 즉시 override하지만, 번들 URL 자체는 `WorkbenchState`, localStorage, manifest JSON 또는 save request에 기록되지 않는다. 채워진 투명 슬롯의 host background는 transparent이며, 동일 placement를 공유하는 용의자 3상태와 파트너 2상태는 inspector 선택 상태 또는 기본 base 한 장만 표시한다. catalog 누락, Vite URL 누락, 정규화 후 runtime path 중복은 시작 시 fail-fast다.

`src/ui/core/placementRegistry.ts`의 `requireAssetPlacement(slotId)`는 다음 의미의 값을 반환한다.

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

해석 순서는 slot → manifest basename → catalog fileName index → key/URL → `resolveTransformSize`다. 취조실의 고정 배경·책상·HUD는 이 registry를 소비하고, 손패·태그·노드처럼 반복 생성되는 instance는 manifest에 하나씩 저장하지 않고 template transform과 layout engine으로 계산한다.

### 7.6 Manifest 교차 검증기

schema/contract 테스트, Workbench save validation, `assets:validate`와 build 단계가 다음 invariant를 검사한다.

1. Manifest `schema_version`은 정확히 `3.0`이다.
2. stage는 `width:640`, `height:400`, `render_width:1280`, `render_height:800`, `render_scale:2`다.
3. canonical 16개 `slots.*.image` basename이 catalog에 정확히 하나 존재하고, 모두 non-null·locked다.
4. 모든 required UI/content binding key가 catalog와 Vite glob에 존재한다. optional lookup은 exact miss를 `undefined`로 보고한다.
5. catalog의 모든 runtime path가 소문자 `.png`이며 실제 IHDR 크기와 digest가 metadata와 일치한다.
6. key, basename, target path, case-folded target path 충돌이 없다.
7. `ref`, `PSD`, `.psd`, `.pur`가 catalog·manifest·dist 어디에도 없다.
8. `preserveAspectRatio: true`이면 scaleX/scaleY 비균등 또는 비율이 다른 custom size를 schema refine가 거부한다.
9. `fg-desk`처럼 승인된 distortion은 `preserveAspectRatio:false`와 exact expected rect를 profile validator가 확인한다.
10. catalog entry는 `active` 또는 의도된 `legacy-fallback` 상태를 가져야 하며, 무표시 orphan을 허용하지 않는다.

---

## 8. Runtime Registry and Loading Implementation

### 8.1 구현 API와 실패 의미

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

`uiAssetPort.ts`가 화면별 lookup을 위 공통 API로 통합한다. `resolveRequiredUrl()` miss는 screen/content/slot/bundle/expected key를 포함한 `MissingRequiredAssetError`이며, `resolveOptionalUrl()`만 `undefined`를 반환한다. 과도기 `resolveUrl()` fallback은 명시적으로 남아 있고 required screen path에서는 사용하지 않는다.

Registry는 Vite glob URL과 generated catalog path를 결합한다. **URL discovery는 eager**로 유지해 화면의 sync lookup을 보존하고, `Assets.load` decode만 `preloadAssetKeys()`에서 수행한다. decoded URL cache와 `inFlightByUrl`이 중복·overlap 요청을 single-flight로 합치며, glob/catalog 불일치는 module 초기화와 contract test에서 즉시 오류다.

### 8.2 번들 분리

| 번들 | 포함 | 로드 시점 |
|---|---|---|
| `core` | 명시 fallback과 최초 오류 UI에 필요한 최소 자산 | boot; 오류 UI 자체는 Graphics 유지 |
| `board` | crazyboard, generic marker, pin, 현재 KNOWN node photo | 최초 strip 직전 및 episode 변경 직전 |
| `interrogation` | room/desk, 현재 suspect 3상태, partner, route에서 동적으로 등장 가능한 card/evidence/tag/icon/debuff subset | encounter 진입 직전 |
| `event` | 현재 event background/overlay와 BEFORE/AFTER cutscene beat art | node 확정 후, event/cutscene mount 전 |
| `result` | 해당 direction과 clear/fail 또는 선택된 dead/ending branch art | outcome 확정 직후, overlay/mount 전 |

bundle은 catalog의 거친 소속이고 실제 preload는 현재 route에서 산출한 key subset으로 실행한다. board bundle 전체를 로드해 미래 episode 사진을 새게 하지 않으며 `mountStrip`, encounter/event, outcome/dead/ending 진입점은 모두 필요한 branch key를 await 또는 선행 prefetch한다.

### 8.3 키 사용 방식

- UI 코드는 PNG 경로나 파일명을 직접 조립하지 않고 `src/app/uiAssetBindings.ts`가 투영한 key를 사용한다.
- `createEncounterSession.ts`는 승인된 suspect에 content ID → explicit asset set lookup을 사용하며 미승인 bensi/kimyongsa/partner alias는 추정하지 않는다.
- engine/public DTO는 gameplay 정보만 유지하고 app projection이 `InterrogationScreenModel`, `EventSceneModel`, `KnownStripNodeView`에 art key를 붙인다.
- 화면은 mount 전 preload가 끝났다는 계약 아래 `resolveRequiredUrl`/`resolveOptionalUrl`을 사용하고 target 디렉터리를 알지 않는다.
- 상태 전환은 `SuspectAssetSet { base, upset, lose }` whole-frame replacement로 모델링한다.
- missing key error에는 content ID, placement slot, expected key, bundle ID를 포함한다.
- VEILED strip node에는 key 자체를 넣지 않는다. generic marker는 renderer-level board binding이다.
- runtime JSON URL은 `runtimeContentUrl()`이 Vite `BASE_URL`에 상대적으로 생성하며 절대 `/content/...`를 조립하지 않는다.

`SceneManager`는 scene child를 파괴하지만 shared texture는 의도적으로 유지한다. 1차 구현은 **selective preload + Pixi cache retention**으로 고정하고 route 이탈 unload/cancel/ref-count는 구현·테스트 범위에서 제외한다. 메모리 계측이 필요성을 입증한 뒤 `ManagedUiLayer` 기반 bundle lease를 별도 설계한다.

### 8.4 팔레트 정책

`tools/assets/palettePolicy.mjs`가 palette/digest 정책을 공통화하며 palette checker와 Workbench save handler가 같은 catalog policy를 사용한다.

```text
default PNG                          → strict16 검사
catalog.palettePolicy=strict16       → strict16 검사
catalog.palettePolicy=approved-production
  + sha256가 승인 allowlist와 일치   → 색수 보고 후 통과
  + digest 불일치                    → 실패
```

approved-production 예외는 경로 glob이 아니라 checksum과 catalog entry 양쪽에 묶인다. Workbench를 통해 importer-owned production path를 다른 bytes로 덮어쓰면 저장 전에 거부된다. 새 버전은 importer/catalog 재생성과 digest review를 거쳐야 한다.

현재 소유권은 legacy/generated placeholder 55개=`strict16`, 신규 승인 전달물 72개=`approved-production + exact sha256`이다. Production art는 importer-only로 보호되고 palette gate는 전체 127 PNG를 통과한다.

---

## 9. Implementation Status and Remaining Roadmap

### 9.1 Phase 0 — 엔지니어링 P0 결정 완료

| 결정 | 결과 | 상태 |
|---|---|---|
| 카드 canonical 규격 | 768×1024 card-local + context root 등비 scale | 완료 |
| production palette | strict16 55 + exact-digest approved-production 72 | 완료 |
| evidence/tag/result UI 의미 | explicit evidence table, HIDDEN/DEACTIVATED presentation, clear/fail binding | 완료 |
| 회귀 기준 | Node 22.13.0 full gates + browser/preview matrix | 완료 |
| 콘텐츠 identity/장면 의미 | scene0~2, bensi/kimyongsa/partner, large stamp, final ending | 승인 대기; 구현 gate와 분리 |

### 9.2 Phase 1 — 결정론적 import 파이프라인 완료

| 파일 | 구현 결과 |
|---|---|
| `tools/assets/nhn-png-allowlist.json` | 72개 source path, target path, workbook row의 단일 allowlist |
| `tools/assets/import-nhn-assets.mjs` | XLSX/allowlist/key/dimension/hash 검증, exact target copy, `--check` drift 검사 |
| `tools/assets/build-runtime-catalog.mjs` | legacy 55 + NHN 72의 127-entry catalog 결정론적 생성 |
| `src/ui/core/generated/runtimeAssetCatalogData.ts` | fileName/key/runtimePath/dimension/bundle/policy/digest 고정 |
| `assets/{portraits,bg,fg,cards,evidence,ui}/` | allowlist의 NHN 72개만 추가, ref/PSD 차단 |
| `package.json` | `assets:import`, `assets:catalog`, `assets:validate`와 `check` 연결 |

`assets:validate`는 source PNG **93 = 72 adopted + 21 excluded**, target/catalog/digest **72/72**, 전체 catalog/glob **127/127**을 확인한다. workbook의 4개 타입 차이는 importer 정규화로 처리해 원본 XLSX를 묵시적으로 변경하지 않는다.

### 9.3 Phase 2 — Registry·Manifest 계약 연결 완료

| 파일 | 구현 결과 |
|---|---|
| `assetRegistry.ts`, `runtimeAssetCatalog.ts` | strict PNG identity, generated catalog schema/index/bundle query, duplicate 진단 |
| `runtimeAssetRegistry.ts` | eager URL discovery, catalog/glob 일치 검사, selective decode와 URL single-flight |
| `uiAssetPort.ts` | required/optional/fallback 의미 분리와 context-rich 오류 |
| `assetDimensions.ts`, `assetManifest.ts` | legacy ID 호환 + 신규 dimension, V3/aspect refine |
| `assets/asset_manifest.json`, `workbenchManifestContract.ts` | 16-slot canonical basename/dimension/lock topology |
| `placementRegistry.ts` | manifest basename→catalog→runtime URL→resolved rect 소비 |
| `uiAssetBindings.ts` | content/event/suspect/card/evidence/state → asset key app binding |
| `bootstrap.ts` | route-selective async preload와 common port 주입 |
| `runtimeContentUrl.ts` | Vite base-aware content URL |
| `vite.config.ts`, `validate-dist.mjs` | asset 단일 delivery와 fresh dist invariant |

### 9.4 Phase 3 — 취조 화면·카드·태그 완료

| 파일/영역 | 구현 결과 |
|---|---|
| `createEncounterSession.ts`, interrogation model | approved suspect set, card art, evidence map, lock/debuff projection |
| `createInterrogationScreen.ts`, `suspectPortraitWidget.ts` | placement/asset port, whole-frame state replacement, shake |
| `cardLayout.ts`, `cardLayers.ts`, `cardWidget.ts` | 768×1024 composition, copy top layer, bounded evidence, lock overlay |
| `cardFan.ts`, `cardDetailModal.ts` | shared resolver/layout, hitArea, locked input parity |
| `tagChip.ts`, desk layout | PNG states, safe hidden/deactivated projection, ratio-preserving row |
| `imageFit.ts` | event/cutscene/result/dead/ending 공통 contain/cover/center |

대응 PNG가 없거나 identity 승인이 없는 캐릭터는 잘못된 신규 art로 치환하지 않고 legacy asset을 유지한다. 이는 binding 결함이 아니라 §11의 명시적 콘텐츠 승인 대기 상태다.

### 9.5 Phase 4 — 보드·이벤트·결과 완료

| 파일/영역 | 구현 결과 |
|---|---|
| `gameFlowPresentation.ts`, strip model/screen | KNOWN art, VEILED redaction, 3-node board PNG skin |
| event model/screen | event ID별 background/decoration과 readable panel |
| cutscene playback/overlay | 기존 beat seam, shared port/fit; unapproved scene0~2는 미연결 |
| interrogation directions | clear/fail result binding과 required preload |
| dead scene | reason art + dead background layer, aspect fit |
| ending model/screen | optional final illustration seam, result와 역할 분리 |
| `bootstrap.ts` | strip/event/outcome/dead/ending route preload 연결 |

3노드 로직은 `src/ui/screens/strip/`의 기존 경로에만 존재한다. reward 전용 PNG가 없으므로 reward renderer와 버튼은 Graphics로 보존한다.

### 9.6 Phase 5 — Workbench·배포·품질 게이트 완료

| 영역 | 구현 결과 |
|---|---|
| Workbench model | 기존 16 slot ID, 신규 dimension, lock/aspect/serialize 계약 |
| shipping manifest | canonical image/dimension/locked topology 생성; 16/16 exact |
| fresh preview | canonical basename→catalog runtimePath→Vite URL로 16/16 기본 이미지 표시; 사용자 upload가 override; 투명 host 합성과 캐릭터 상태 독점 표시 |
| preview persistence boundary | 기본 번들 URL은 display-only이며 Workbench state/localStorage/manifest JSON/save payload 불변 |
| save handler | exact catalog routing, PNG/path/manifest/digest 사전 검증, partial write 방지 |
| palette | 공통 strict16/approved-production 정책, 전체 127 PNG GREEN |
| production asset 보호 | NHN 72개 importer-only, altered bytes overwrite 거부 |
| build/dist | 단일 PNG delivery, PSD/ref/duplicate digest 0, chunk warning만 잔존 |
| browser | DPR1/2 10/10 + fresh game/Workbench subpath preview 1/1 |

### 9.7 남은 승인 전용 roadmap

> Workbench 밖의 오디오·optional direction·legacy fallback·미연결 파일까지 포함한 최신 잔여 목록은 [`remaining_asset_gap_audit.md`](./remaining_asset_gap_audit.md)를 기준으로 한다.

1. Narrative/Game Design이 scene0~2 authored beat, bensi/kimyongsa/partner identity, large stamp semantic, final ending art를 승인한다.
2. 승인표만 `uiAssetBindings.ts`/presentation catalog에 추가하고 existing required preload와 mapping tests를 확장한다.
3. Art/UI가 mixed legacy style의 출시 허용 여부를 판단하고, 불허 시 누락 캐릭터 PNG를 같은 naming/importer 계약으로 추가한다.
4. 560.83 kB game chunk는 route split의 측정 이득이 확인될 때 별도 성능 리팩터링으로 처리한다.

이 잔여 항목은 현재 importer/catalog/manifest/runtime/Workbench/browser GREEN을 되돌리지 않는다. 승인 전에는 파일명·장면 유사도·display name을 근거로 자동 alias를 만들지 않는다.

---

## 10. Test and Verification Matrix

### 10.1 Import 및 inventory 테스트

| 테스트 | 구현 결과 | 상태 |
|---|---|---|
| source accounting | 대상 세 폴더 PNG **93 = 채택 72 + 제외 21** | GREEN |
| NHN target count | target와 `provenance=nhn-2026` catalog **72/72** | GREEN |
| runtime catalog count | catalog/glob **127 = legacy 55 + NHN 72** | GREEN |
| unique byte accounting | 127 entries, **111 unique SHA-256 digests** | GREEN |
| category count | characters 20, background 13, UI 39 | GREEN |
| extension/forbidden | 소문자 `.png`만 허용; PSD/PUR/ref/PSD path runtime 0 | GREEN |
| dimensions/key parity | workbook/allowlist/IHDR/parser **72/72** | GREEN |
| uniqueness | key, basename, target path, case-folded target path 충돌 0 | GREEN |
| checksum | catalog와 target digest **72/72** | GREEN |
| reproducibility | `--check` 재실행 drift 0 | GREEN |
| dist delivery | missing digest 0, PSD/ref 0, static/hash duplicate digest 0 | GREEN |

### 10.2 Unit/contract 테스트

기존 회귀를 삭제하거나 느슨하게 만들지 않고 아래 계약을 구현·갱신했다.

- asset dimensions/transform/placement: legacy ID 보존, 신규 source ID, desk 640×161 예외, aspect refine, manifest basename bridge.
- Workbench model/save handler: 16 slot topology, shipping non-null/locked, exact routing, PNG/path/digest, no partial write.
- Workbench fresh preview: 16 manifest basename→catalog path→Vite URL 완전성, 누락/중복 fail-fast, 표시 fallback과 persisted/editor state 분리, 투명 slot host와 상호 배타적 캐릭터 상태 합성.
- portrait/session: explicit approved binding, transparent portrait 뒤 fallback panel 부재, whole-frame replace, shake, legacy fallback.
- interrogation/card/tag: art map, lock, 98×39 tag row, copy top layer, 0~3 evidence, hitArea와 modal/fan parity.
- strip/game flow: 정확히 3 KNOWN/VEILED slot, 미래 정보 무누출, decoration geometry와 preload redaction.
- event/cutscene/result/dead/ending: explicit event map, shared port/fit, 역할 분리, unapproved scene mapping 부재.
- runtime registry: catalog/glob parity, selective decode, overlap single-flight, required/optional miss.
- base-aware content: root와 non-root `BASE_URL`의 content path 정규화.

주요 신규/확장 contract test는 다음과 같다.

1. `tests/tools/import-nhn-assets.test.ts`: 93=72+21, workbook parity, check/write 재현성, forbidden path/ext.
2. `tests/ui/asset-catalog-bindings.test.ts`: provenance 55/72, 전체 127, binding key 완전성.
3. `tests/ui/runtime-asset-registry.test.ts`: eager URL discovery, selective decode, single-flight, required/optional miss.
4. `tests/ui/asset-placement-registry.test.ts`: V3 basename, rect/rotation/lock, desk 예외.
5. `tests/ui/image-fit.test.ts`: contain/cover/center와 pixel-grid 동작.
6. `tests/ui/tag-chip-plates.test.ts`, card widget tests: plate state와 five-layer composition.
7. `tests/ui/event-assets.test.ts`, `ending-assets.test.ts`, result/dead tests: 명시 mapping과 역할 분리.
8. `tests/tools/palette-policy.test.ts`: strict16, 승인 digest, digest mismatch와 전체 tree split.
9. `tests/content-io/runtime-content-url.test.ts`: base-aware content URL과 path traversal 차단.
10. `tests/ui/workbench-shipping-preview.test.ts`: 16/16 shipping preview 해석, 누락·중복 path fail-fast, 용의자·파트너 상태 독점 표시.
11. `tests/browser-preview/production-preview.spec.ts`: fresh build game/Workbench subpath boot, 16개 실제 이미지, 투명 slot host, 상태 전환과 shipping manifest.

최신 full Vitest의 실제 file/test 수는 §1.4의 acceptance 표를 단일 기준으로 사용한다.

### 10.3 시각 검증 matrix

unit geometry와 실제 1280×800 browser render를 함께 검증한다.

| 화면 | 자동 검증 결과 | 수동 승인 잔여 |
|---|---|---|
| 취조실 | base/upset/lose, transparent sprite 뒤 불투명 fallback panel 0, desk/HUD/partner, shake geometry GREEN | bensi/kimyongsa/partner identity |
| 카드 | hand/modal composition, illust/evidence/attachment/stamp/copy/lock/hit area GREEN | 없음 |
| 태그 | DEFAULT/SHIELDED/BROKEN/HIDDEN/DEACTIVATED plate와 row bounds GREEN | 없음 |
| 보드 | crazyboard/marker/KNOWN photo/pin, 3-node/VEILED leakage·geometry GREEN | mixed legacy style 출시 승인 |
| 이벤트 | explicit backgrounds/decorations와 panel readability GREEN | large stamp semantic |
| 컷씬 | 기존 authored background/portrait seam GREEN | scene0~2 authored beat mapping |
| 결과/dead | clear/fail/dead role, contain/center, preload GREEN | final run ending art |
| 반응형 | Chromium DPR1·DPR2, CSS 1280×800와 backing buffer GREEN | 없음 |
| Workbench | fresh state에서 canonical 16개 PNG가 표시되고 upload override·persist/save 분리, 투명 합성, 용의자·파트너 단일 상태 표시 GREEN | 없음 |

자동 검증은 비율 왜곡·fallback panel·텍스트 가림·hit area·state ghost 회귀를 다룬다. 의미 승인이 필요한 미연결 art는 억지로 화면에 표시하지 않는 것이 현재의 합격 조건이다.

### 10.4 성능 및 배포 테스트

- boot는 `core`만 decode하고 strip/encounter/event/result가 각 required subset을 요청한다. 전체 127-entry preload-all은 발생하지 않는다.
- 같은 URL/key의 중첩 요청은 `inFlightByUrl` single-flight contract test를 통과한다.
- scene destroy 후 shared Pixi texture cache를 유지하며 route unload/cancel은 현 acceptance 범위가 아니다.
- source catalog 127 entries는 111 unique digests이고 dist의 static/hash duplicate digest는 0이다.
- `/dungeon-dossier/` production preview에서 game과 Workbench가 모두 boot하며 HTTP 4xx/5xx, console/page/request error가 0이다.
- browser matrix는 keyboard/overlay/card/tag 상호작용과 9-node BEST route의 missing asset·raw i18n·console error 0을 검증한다.
- minified game chunk **560.83 kB** 경고는 성능 backlog다. 500 kB 권고 초과를 기능 실패로 보지는 않되 route code split 전후를 측정해야 한다.

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
corepack pnpm simulate:full
corepack pnpm build
corepack pnpm e2e:browser
corepack pnpm e2e:preview
```

`corepack pnpm check`는 lint→arch→typecheck→full Vitest→content→assets→palette→smoke→build를 순서대로 실행한다. `e2e:browser:turbo`는 빠른 DPR1 회귀용이고 최종 acceptance는 전체 `e2e:browser`와 별도 fresh production `e2e:preview`를 사용한다.

**100% GREEN**의 정의는 다음 모두를 만족하는 것이다.

- 명령 exit code가 전부 0이다.
- 실패 테스트, unhandled rejection, missing asset warning이 0이다.
- NHN subset 72/72와 runtime catalog/glob 127/127이 각각 통과한다.
- shipping Manifest 16개 slot이 non-null·locked이고 basename이 catalog key/URL로 전부 해석된다.
- palette checker가 승인 production 파일 수를 명시하고 digest mismatch 0을 보고한다.
- build 산출물에 PSD/ref/중복 PNG가 없다.
- VEILED node model/log/preload에 미래 content ID·label·asset key가 없다.
- 자동 browser/preview matrix가 통과하고, 승인되지 않은 콘텐츠 art는 명시적으로 미연결 상태다.

현재 자동 pipeline은 위 정의로 GREEN이다. 다만 §11의 장면/identity/ending/mixed-style 승인 완료를 곧바로 의미하지 않으며, 승인 전 미연결 상태를 결함으로 숨기거나 임의 alias로 메우지 않는다.

---

## 11. Risk Register and Open Decisions

현재 자동 검증을 막는 P0 위험은 없다. 아래 표는 구현으로 닫힌 항목과 제품 승인 또는 성능 추적이 남은 항목을 구분한 현행 register다.

| 우선순위 | 상태 | 위험/결정 | 현재 통제 | 종료 조건 |
|---|---|---|---|---|
| P0 | **Closed** | 카드 규격 충돌 | 768×1024 canonical layout, fan/modal shared resolver와 회귀 테스트 적용 | 완료 |
| P0 | **Closed** | 16색 gate와 production art 충돌 | legacy 55 `strict16`, NHN 72 exact-digest `approved-production`으로 분리 | 127 PNG GREEN |
| P1 | **Closed** | evidence/tag/result의 암묵 mapping·역할 혼합 | ID별 explicit binding, 98×39 ratio, clear/fail/dead/ending 역할 분리 테스트 | 완료 |
| P1 | **Closed** | required miss 은폐, manifest 좌표 미소비, dist 이중 배포 | fail-fast port, placement registry 소비, fresh dist digest 중복 0 | 완료 |
| P1 | **Closed** | 투명 production 초상화 뒤 불투명 placeholder 노출 | production portrait는 sprite-only; Graphics fallback panel 부재 회귀 테스트 | 완료 |
| P1 | **Closed** | fresh Workbench의 빈/슬롯 checkerboard 및 겹친 캐릭터 상태 | 16개 shipping basename 표시 전용 투영, 채운 host transparent, 용의자·파트너 단일 상태 표시; persist/save 분리 테스트 | 완료 |
| P1 | **Pending approval** | `bg_event_scene0~2` authored beat 미확정 | 승인 전 cutscene에 자동 연결하지 않음 | Narrative/Game Design의 beat ID 표 승인 |
| P1 | **Pending approval** | `bensi`, `kimyongsa`, 파트너 identity alias 미확정 | 승인된 ID만 신규 art 사용, 나머지는 명시적 legacy binding 유지 | Game Design/Narrative alias 표 승인 |
| P1 | **Pending approval** | 620×620 대형 stamp의 의미·타이밍 미확정 | card-local stamp와 분리하고 event feedback에 미연결 | UI/Game Design의 screen/state/timing 승인 |
| P1 | **Pending asset** | final run ending 전용 illustration 부재 | encounter clear/fail 이미지를 ending으로 재사용하지 않음 | final ending art 전달·키·fit 승인 |
| P2 | **Pending approval** | 신규 NHN art가 없는 캐릭터의 mixed legacy style | 누락 character에 임의 alias를 만들지 않음 | Art/UI의 출시 허용 또는 추가 PNG 전달 |
| P2 | **Monitor** | minified game chunk **560.83 kB** | 기능·무결성 gate와 분리해 경고 추적 | route split 전후 측정 후 예산 충족 또는 예외 승인 |

---

## 12. Definition of Done

### 문서·구현 자동 검증 완료 조건

- [x] 대상 세 폴더의 PNG 93개를 채택 72/제외 21로 전수 회계했다.
- [x] 72개 모두에 source, target, key, 실제 해상도와 용도를 지정했다.
- [x] XLSX의 실제 단일 탭, 행 구조, 4개 key 불일치와 metadata 문제를 기록했다.
- [x] 배경, 책상, 용의자, 파트너, 카드 5계층, 태그, 보드, 이벤트, 결과 및 버튼의 바인딩 방식을 정의했다.
- [x] 현재 3노드/VEILED 보드가 이미 구현됐음을 확인하고 renderer-only skinning 범위를 정의했다.
- [x] Manifest V3.0의 실제 basename/null·stage·16-slot 계약과 runtime placement bridge를 정의했다.
- [x] 신규 72개와 기존 55개를 구분한 전체 127-entry catalog 구현과 111 unique digest 회계를 기록했다.
- [x] 파일 복사, runtime registry, Workbench, palette, Vite 배포와 테스트 결과를 파일 단위로 기록했다.
- [x] 카드 768×1024 canonical 규격과 legacy/production 팔레트 정책을 확정·구현했다.
- [x] importer dry-run/write가 deterministic하며 target NHN PNG가 정확히 72개다.
- [x] XLSX/allowlist/target의 NHN subset이 72/72, full catalog/Vite glob이 127/127 일치한다.
- [x] Manifest V3.0 canonical 16개가 non-null·locked이고 basename→catalog→URL→placement로 전부 해석된다.
- [x] required miss는 context-rich error이며 optional/명시 legacy fallback만 허용된다.
- [x] 취조/카드/태그/보드/이벤트/결과 화면이 승인 PNG를 비율 왜곡 없이 표시한다.
- [x] production 초상화는 base→upset→lose whole-frame 교체와 shake를 수행하고 뒤에 불투명 fallback panel을 만들지 않는다.
- [x] 기존 3-node/VEILED 모델과 미래 content ID·label·asset key 무누출 테스트가 통과한다.
- [x] boot는 core만 decode하고 각 route의 required subset을 mount 전에 single-flight preload한다.
- [x] fresh Workbench는 canonical 16개 shipping PNG를 checkerboard 없이 합성하고 용의자·파트너 상태를 한 장씩 표시하며, 기본 URL이 state/localStorage/manifest/save payload로 유입되지 않는다.
- [x] PSD와 `ref/` 파일이 source import, runtime registry, build output에 0개다.
- [x] fresh build의 PNG digest 중복이 0이고 `/dungeon-dossier/` game/Workbench preview가 통과한다.
- [x] Node 22.13.0의 lint/type/build/assets/palette/content/arch/test/simulation/browser/preview 자동 게이트가 GREEN이다.

### 제품·아트 승인 잔여 조건

- [ ] `bg_event_scene0~2.png`의 authored cutscene beat mapping을 승인한다.
- [ ] `bensi`, `kimyongsa`, 파트너/김인턴 identity alias를 승인한다.
- [ ] 620×620 대형 stamp의 화면 의미와 timing을 승인한다.
- [ ] final run ending 전용 art를 전달하고 binding을 승인한다.
- [ ] mixed legacy character style의 출시 허용 또는 대체 PNG 전달을 승인한다.

위 다섯 항목은 자동 구현 DoD와 분리된 제품 승인 조건이다. game chunk 560.83 kB는 비차단 성능 backlog로 추적한다.

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
13. **Transparent art stays transparent**: production portrait sprite 뒤에 불투명 placeholder panel을 추가하지 않는다.
14. **Workbench preview is view-only**: shipping preview URL은 화면 표시에만 쓰고 editor state, localStorage, manifest JSON, save payload에 저장하지 않는다.
15. **Workbench transparency/state exclusivity**: 채워진 투명 PNG의 host는 transparent이며 동일 placement를 공유하는 캐릭터 상태는 한 장만 표시한다.

## Appendix B. Source-of-Truth Priority

서로 충돌할 때의 우선순위는 다음과 같다.

1. 승인된 제품/아트 결정 기록.
2. 이 문서의 72-file allowlist와 실제 PNG byte metadata.
3. 정규화된 XLSX의 파일명 및 C/D/E naming decomposition.
4. 전체 runtime generated catalog의 identity/provenance/digest.
5. Manifest V3.0 placement basename과 app/UI content binding key.
6. 런타임 registry discovery 결과.

아래 단계가 위 단계를 자동으로 덮어쓰지 않는다. 단, V3 schema/slot ID 같은 **현행 호환 계약**을 바꾸려면 문서만으로 재정의하지 않고 version migration을 먼저 설계한다. 파일명이 비슷하다는 이유만으로 기획상 인물 ID를 자동 추정하지 않는다.
