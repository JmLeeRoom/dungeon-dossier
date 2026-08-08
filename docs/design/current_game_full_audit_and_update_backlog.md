# 던전 수사 조서 — 현재 게임 전수 감사 및 수정·업데이트 정본 백로그

| 항목 | 내용 |
|---|---|
| 문서 ID | `docs/design/current_game_full_audit_and_update_backlog.md` |
| 버전 | v1.2 |
| 감사 기준일 | 2026-08-07 (Asia/Seoul) |
| 최종 실행 cutoff | 2026-08-07 18:05 KST (v1.2 재계측) |
| 코드 기준 | `dungeon-dossier/` `main@3bbb3cb` + 최종 계측 시 dirty 작업 트리 85개 항목(본 문서 포함) |
| 실행 계약 | Node `22.13.0`, pnpm `11.18.0` |
| 감사 범위 | 엔진·규칙, 런·저장·보상, 15노드 오토플레이, 1280×800 PixiJS UI, 워크벤치·i18n, 무코드 콘텐츠·자동화 |
| 최종 판정 | **`NOT READY` — 실브라우저 매트릭스는 확보됐으나 승인 에셋·오디오와 잔여 P0가 미완료** |
| 상세 목표 설계 | [카드·판정 피드백·워크벤치 설계](./card_contradiction_workbench_design.md), [컷씬·D/E/F 이벤트·데드씬 설계](./event_system_custom_scale_deadscene_design.md) |

---

## 0. 문서 역할과 판정 원칙

이 문서는 과거 프롬프트의 완료 선언을 반복하지 않는다. 실제 소스, 현재 콘텐츠, 테스트의 assertion, 에셋 파일, 실행 결과를 대조해 **무엇이 이미 동작하는지**, **무엇이 새로 들어왔지만 아직 배선되지 않았는지**, **무엇이 실제 결함인지**, **무엇을 아직 증명하지 못했는지**를 분리한다.

판정의 신뢰 순서는 다음과 같다.

1. 현재 checkout의 실행 가능한 코드와 데이터
2. 테스트 이름이 아니라 실제 assertion과 실행 결과
3. 실제 브라우저·WebGL·오디오·포인터·키보드 관측 증거
4. 설계 문서와 Phase 문서의 주장

| 상태 | 정의 |
|---|---|
| `PASS` | 해당 범위를 실제 실행했고 요구 결과가 확인됨 |
| `PARTIAL` | 일부 계층은 구현됐으나 앱·콘텐츠·저장·오토플레이 중 하나 이상이 미배선 |
| `FAIL` | 재현 가능한 계약 위반 또는 자동 게이트 실패 |
| `BLOCKED` | 필요한 실행 수단이 없어 이번 감사에서 직접 증명하지 못함 |
| `NOT CONFIGURED` | 저장소 자체에 검증 runner·CI·증거 수집기가 없음 |
| `NOT READY` | P0가 남아 최종 제품 기준 출하 선언 불가 |

우선순위는 다음과 같다.

| 우선순위 | 의미 |
|---|---|
| P0 | 최신 목표 출하와 “100% 완성” 선언을 차단하는 항목 |
| P1 | 데이터 무결성, 핵심 UX, 자동화 신뢰성, 제작 파이프라인에 직접 영향을 주는 결함 |
| P2 | 견고성·성능·접근성·유지보수성과 관측성 보강 |
| P3 | 최종 아트·문서·미세 UX 폴리시 |

> **작업 트리 주의:** 감사 도중 사용자의 병행 변경으로 D/E/F, 세이브 v2, 컷씬, 데드씬 관련 파일이 추가·수정됐다. 따라서 감사 초반의 98 test file / 790 test 녹색 기준선은 최종 판정 근거로 사용하지 않고, 마지막에 다시 계측한 103 test file / 850 test 결과를 정본으로 삼는다.

> **cutoff 이후 변경:** 16:20 이후 `tests/engine/retry-policy.test.ts`, `tests/ui/dead-scene.test.ts` 등 추가 병행 변경이 다시 시작됐다. 진행 중인 파일은 이 문서의 PASS에 소급 포함하지 않았으며, 다음 구현 checkpoint에서 전체 게이트와 수치를 다시 계측해야 한다.

---

## 1. 경영진 요약

### 1.1 확인된 안정 기반

- 판정표는 유효한 `432`개 조합을 모두 저작 행에 매칭한다. 중립 `R_INSUFFICIENT_GROUNDS`는 정상 유효 입력의 누락을 감추는 기본값이 아니라, 의도적으로 table miss를 만든 hostile 입력에서만 검증된다.
- 상태 머신은 “8개 상태”가 아니다. 현재 구현은 **21개 전체 상태**, 그중 **14개 턴 흐름 상태**, 이를 묶는 **8개 디자인 단계**다. 정상 순환, 명시적 종료, invalid transition이 테스트된다.
- `EncounterCoordinator.submit()`은 판정 도중 예외가 나면 machine과 encounter snapshot 전체를 제출 직전 `BUILD_ARGUMENT`로 롤백한다. 과거의 `RESOLVE` 영구 락업은 현재 재현되지 않는다.
- canonical strip은 15노드이며 현재 콘텐츠는 9개 심문과 6개 A/B/C 이벤트를 완주한다.
- 반복 가능한 CARD/RESOURCE 보상은 다시 효과를 적용하고, `claimedRewardIds`는 보상 정의 ID의 unique 집합으로 유지된다.
- 640×400 논리 stage, 1280×800 renderer, root 2배 scale, `NEAREST`, `antialias:false`, CSS `pixelated` 기반은 구현돼 있다.
- 5계층 카드, fan hover, 중앙 확대 modal, 점선 drag link, 용의자 base/upset/lose, 파트너 base/used·쿨다운 모델은 Node 기반 UI 테스트가 존재한다.
- 24개 JSON은 현재 Zod·T1~T3 검증을 통과한다.
- headless legal fuzz는 누적 1,000회 accepted submission과 unexpected error 0을 단언한다. 다만 이는 한 런의 1,000턴도, RunSession/PixiJS/browser fuzz도 아니다.
- adversarial fuzz는 9개 encounter × 5 seed와 실패 후 snapshot 롤백을 검증한다.

### 1.2 병행 구현으로 새로 들어온 부분

최신 작업 트리는 아래 기능을 “완전 미구현” 상태에서 “코어 또는 화면 부품 구현, 통합 미완료” 상태로 이동시켰다.

| 기능 | 현재 존재하는 것 | 아직 없는 연결 |
|---|---|---|
| 이벤트 D | 스키마, 카드 튜닝·fallback·save v2, `gameFlowPresentation`, 사용자 event screen, bootstrap·RunSession 경계 | 실제 콘텐츠, autoplay scene/action/report, app/browser 회귀 |
| 이벤트 E | 스키마, topic/attempt/cost/effect·save v2, 사용자 UI, bootstrap·RunSession 경계 | 실제 콘텐츠, autoplay scene/action/report, app/browser 회귀 |
| 이벤트 F | 스키마, 증거 획득·등급·route/effect·save v2, 사용자 UI, bootstrap·RunSession 경계 | 실제 콘텐츠, autoplay scene/action/report, app/browser 회귀 |
| 세이브 v2 | `CURRENT_SAVE_VERSION = 2`, v1→v2 migration, D/E/F·retry 필드 serialize/restore, checked-in schema 동기화 | 전체 런 계약 fingerprint, 손상 원본 보존 UX, 브라우저 복원 증거 |
| 컷씬 | event host schema, beat/choice/timing/treatment, Pixi overlay, choice effect collector, bootstrap BEFORE host와 단위 테스트 | 실제 콘텐츠, AFTER host, save/autoplay/report, browser 회귀 |
| 데드씬 | 실패 사유 4종 table, model/screen, retry RunState/RunSession 정책, bootstrap failure route, autoplay port, PNG 4개 | autoplay driver action, retry/return 의미 회귀, OGG, 브라우저 증거 |

### 1.3 최종 판정

| 관점 | 판정 | 근거 |
|---|---|---|
| 판정·상태 머신 코어 | **PASS** | 432 조합, 상태 전이, rollback, determinism 테스트 |
| 기존 A/B/C headless 기반 | **PASS (Node 테스트 범위)** | 최종 재실행에서 103 files / 850 tests 통과 |
| D/E/F·컷씬·데드씬 | **PARTIAL** | D/E/F app/UI, BEFORE 컷씬, 데드씬 host까지 추가됐으나 실제 content·AFTER·autoplay driver·browser 증거가 없음 |
| 세이브 v2 | **PARTIAL** | migration·필드·schema는 존재하나 전체 의미 복원·손상 원본 보존 계약 미완성 |
| 브라우저 플레이 품질 | **BLOCKED / NOT CONFIGURED** | 이번 환경의 브라우저 플러그인 안전 문서 누락, 저장소 native browser E2E도 없음 |
| 승인 에셋·오디오 파이프라인 | **FAIL** | checked-in manifest 0, runtime sidecar consumer 0, OGG 0 |
| 자동 릴리스 게이트 | **PASS WITH WARNING** | `pnpm check` exit 0, build chunk 경고 유지 |
| “100% 프로덕션 완성” | **NOT READY** | 미해결 P0 6개와 브라우저 증거 공백 |

---

## 2. 최종 실측 기준선

### 2.1 저장소·환경

- branch/commit: `main@3bbb3cb`
- 최종 계측 dirty 항목: 85개. 본 감사가 만든 결과물은 이 문서 1개뿐이며, 기존/병행 변경은 사용자 작업으로 보존한다.
- `package.json` 계약: Node `>=22.13.0 <23`, pnpm `>=11.18.0`
- 재현 실행: `npx.cmd -y node@22.13.0`으로 pnpm `11.18.0`을 구동
- 불일치: `.nvmrc`와 GitHub Actions는 Node `20.19.0`을 사용한다.
- host 기본 Node 24는 패키지 계약 밖이므로 게이트 근거로 사용하지 않았다.

### 2.2 코드·테스트·데이터 인벤토리

| 영역 | 전체 파일 | 텍스트 파일 | 텍스트 라인 | 핵심 실측 |
|---|---:|---:|---:|---|
| `src/` | 219 | 211 | 28,366 | TypeScript 209, CSS 2, `.gitkeep` 8 |
| `tests/` | 110 | 106 | 18,255 | `*.test.ts` 103, helper TS 3, `.gitkeep` 4 |
| `content/` | 31 | 24 | 5,992 | 실제 JSON 24 |
| `schemas/` | 12 | 12 | 7,471 | checked-in Draft 2020-12 schema 12종 |
| `tools/` | 11 | 8 | 3,055 | validate, simulate, palette, placeholder 등 |
| `workbench/` | 5 | 5 | 3,645 | 별도 Vite entry, state version 3 |
| `assets/` | 74 | 13 | 445 | PNG 55, portrait state-parts JSON 12, OGG 0 |

### 2.3 현재 콘텐츠 실측

| 항목 | 수량 |
|---|---:|
| 사건 | 3 |
| 주장 | 54 |
| 증거 | 24 |
| proof rule | 20 |
| 심문 encounter | 9 |
| inquiry route | 18 |
| non-combat event | 7 |
| canonical strip event | A 2, B 2, C 2, D/E/F 0 |
| canonical strip node | ENCOUNTER 6, EVENT 6, BOSS 3, 합계 15 |
| 카드 / initial deck | 14 / 6 |
| 보상 | 19 |
| flag | 13 |
| relic / enhancement | 3 / 4 |
| 한국어 string | 322 |
| 컷씬 콘텐츠 | 0 |
| 데드씬 PNG | 4 |
| OGG | 0 |

### 2.4 최종 자동 게이트

| 명령 | 결과 | 최종 증거 |
|---|---|---|
| `pnpm lint` | **PASS** | 병행 수정 후 오류 0 |
| `pnpm typecheck` | **PASS** | `tsconfig.json` + `tsconfig.node.json` |
| `pnpm test` | **PASS** | 111 files / 924 tests (v1.2 재계측) |
| schema sync focused | **PASS** | 1 file / 2 tests, D/E/F case schema와 save v2가 Zod source와 동기화 |
| `pnpm content:validate` | **PASS** | 24 JSON |
| `pnpm palette:check` | **PASS** | 55 PNG |
| `pnpm arch` | **PASS** | 221 modules / 573 dependencies |
| `pnpm build` | **PASS WITH WARNING** | 1,017 modules, game chunk 528.52 kB, 500 kB 초과 경고 |
| `pnpm simulate:full` | **PASS** | 6 files / 42 tests |
| `pnpm check` | **PASS** | 16:15 통합 체인 exit 0; 이후 cutscene/dead 변경도 모든 constituent gate를 16:20에 개별 재통과 |

16:01~16:18의 사용자 병행 작업이 case/save schema, D/E/F app/UI, BEFORE cutscene host, dead/retry route를 순차적으로 갱신했다. 변경을 보존하고 안정화 뒤 다시 실행한 결과 schema sync, lint, typecheck, 850 tests, simulate:full, content, palette, architecture, build가 통과했다. 이 환경에는 bare `pnpm` shim이 없어 Node 22.13.0을 고정한 임시 로컬 Corepack shim으로 통합 package script를 실행했으며, shim은 즉시 삭제했다.

### 2.5 실브라우저 증거 (v1.2에서 갱신)

저장소에 Playwright 1.56.0 + Chromium 러너가 devDependency·script·CI job으로 들어왔다
(`playwright.config.ts`, `tests/browser/`, `pnpm e2e:install` / `pnpm e2e:browser`,
CI job `browser-matrix`). 아래는 2026-08-07 18:0x에 실제 Chromium에서 측정한 결과다.

| 시나리오 | 상태 | 근거 |
|---|---|---|
| BR-01/02 일반 게임 1280×800, DPR 1/2 | **PASS** | canvas CSS 1280×800 고정, backing DPR 1→1280×800 / DPR 2→2560×1600, `image-rendering: pixelated`, asset registry 55 |
| BR-04 turbo BEST 15노드 | **PASS** | `result: PASS`, 15노드, 9전투 전부 BEST_RESOLUTION, `ending-true`, raw i18n 0, missing asset 0, console error 0 |
| ending screenshot·report JSON | **PASS** | `artifacts/browser/br04-ending.png`, `br04-turbo-report.json` |
| `/workbench/` 포인터·transform·lock·reload | **NOT CONFIGURED** | spec 미작성 (BR-03) |
| video BEST wall-clock | **NOT CONFIGURED** | spec 미작성 (BR-05) |
| failure seeds → 데드씬 4종 | **NOT CONFIGURED** | spec 미작성 (BR-06) |
| keyboard-only·screen reader·axe | **NOT CONFIGURED** | spec·의존성 미작성 (BR-07) |
| 실제 OGG decode/playback | **IMPOSSIBLE** | OGG 파일 0개 (BR-08) |

**이 매트릭스가 즉시 잡아낸 실결함 2건** — 이전까지 어떤 게이트도 잡지 못한 것들이다.

1. 보상/강화 화면이 카드 ID(`card_query_who` 등 8종)를 이름 대신 노출했다. `ownedCardViews`가
   카드의 저작된 `name_key` 대신 ID로 키를 조립하고 있었다. 수정 후 raw i18n 0.
2. 실험적으로 배선했던 `evidenceGradeById` 등급 덮어쓰기가 `enc_ep001_succubus`를
   BEST_RESOLUTION → PARTIAL_RESOLUTION으로 뒤집었다. 덮어쓴 등급이 전부 저작값과 동일했으므로
   원인은 등급이 아니라 **case 객체 복제**다. 검증되지 않은 배선이라 되돌리고
   `createEncounterSession.ts`에 사유를 남겼다. `evidenceGradeById`는 다시 write-only 상태다.

---

## 3. 6대 분야 추적 감사

### 3.1 심문 엔진·게임 규칙

**확인된 강점**

- `resolutionTable.ts`의 432 조합 전수와 hostile fallback이 구분돼 있다.
- submit transaction rollback이 machine과 encounter를 함께 복구한다.
- claim invariant, proof, modifier, judgment, leakage, determinism 테스트가 폭넓다.
- persist-first run commit 경계가 존재한다.

**남은 결함**

- 런 자원 증감은 0 하한만 적용하고 `balance.json`의 stress max 100, trust max 3 상한을 적용하지 않는다.
- 여러 proof rule이 같은 target/direction을 가질 때 semantic validator는 합산하지만 runtime은 첫 `find()` 결과만 사용한다.
- Tier-2 도달성은 노드 순서와 획득 시점을 과대근사해 뒤 노드 증거로 앞 노드 proof를 통과시킬 수 있다.
- A/C의 넓은 `EffectSchema`와 런 소비자의 제한된 effect vocabulary 사이에 폐쇄성 보장이 없다. `applyRunEffects`의 미처리 effect는 DEV warning 후 drop될 수 있다.
- engine 경계에서 evidence ID의 unknown/unacquired/duplicate 입력을 일관되게 거부하지 않는다.
- case-local flag hook과 common hook의 소유권 및 runtime 소비 경로가 일치하지 않는다.

**판정: `PASS` 기반 + P1 의미 무결성 보강 필요**

### 3.2 런 세션·저장·보상

**확인된 강점**

- 15노드, pending reward, claim, node advance, terminal 상태 모델이 있다.
- 카드/자원 반복 보상과 unique `claimedRewardIds` 계약이 있다.
- save v2와 v1→v2 migration이 존재한다.
- D/E/F 상태인 `cardTuning`, `canvassedTopicIds`, `evidenceGradeById`, `openRouteIds`, `retryCount`가 serialize/restore된다.
- 일부 ID와 retry 범위는 restore 경계에서 검사한다.

**남은 결함**

- RELIC/ENHANCEMENT는 이미 소유해도 보상 pool fallback에서 다시 제시될 수 있고 claim은 unique append라 실질 보상이 없는 선택이 된다.
- 저장에는 전체 run rules/content fingerprint가 없어 같은 ID를 유지한 의미 변경을 탐지하지 못한다.
- 손상·구버전·미래 버전 복원 실패 시 원본을 사용자에게 백업하거나 내보내지 않고 지우는 경로가 있다.
- canonical strip prefix, terminal, pending reward, node kind별 semantic state를 한 번에 검증하는 경계가 불완전하다.
- D/E/F RunSession commit과 실패 retry state는 추가됐으나 실제 저작 콘텐츠를 통한 app save/reload 회귀가 없고, cutscene beat/choice·dead-scene 화면 전환 상태는 저장 계약에 연결되지 않았다.

**판정: `PARTIAL`**

### 3.3 15노드 오토플레이·비디오 모드

**확인된 강점**

- L1 harness와 L2 driver/policy/report/hud가 구분돼 있다.
- canonical strip 기반 15노드 headless 경로와 node 7 restore 테스트가 있다.
- legal accepted submission 1,000회와 adversarial rollback 테스트가 있다.
- video pacing 설정과 단위 테스트가 있다.

**남은 결함**

- autoplay port의 EVENT pattern 표기는 A~F로 넓어지고 DEAD_SCENE도 추가됐지만, EVENT callback DTO와 driver는 A/B/그 외=C 의미만 구현해 D/E/F를 조사 C로 오처리한다.
- CUTSCENE scene이 없고 DEAD_SCENE은 driver switch에서 처리되지 않는다. 공통 revision/action token도 없다.
- legal fuzz는 여러 fresh coordinator에 걸친 aggregate이며, 한 장기 런·RunSession·event/reward·Pixi/browser를 fuzz하지 않는다.
- autoplay가 사용자 화면의 명령형 판정 피드백 queue/ack를 관측하지 않는다.
- report는 runtime schema가 없고 event pattern, presentation evidence, window error, unhandled rejection, failed request를 충분히 수집하지 않는다.
- policy와 headless 경로에 특정 콘텐츠 ID가 하드코딩돼 있어 데이터 변경에 취약하다.
- driver lifecycle의 start/destroy/console wrapper cleanup 계약이 약하다.
- 이름이 `e2e`인 테스트가 실제로는 Node integration이다.
- PR CI가 핵심 15노드 route matrix를 직접 gate하지 않는다.

**판정: `PARTIAL / BROWSER BLOCKED`**

### 3.4 PixiJS 1280×800 UI

**확인된 강점**

- 640×400 logical, 1280×800 render, 2배 root scale, nearest/pixelated 기반이 있다.
- 카드 layer 순서, hover, modal, drag link 모델이 테스트된다.
- 용의자·파트너 상태 모델과 에셋 키가 있다.
- A~F event model/screen과 bootstrap callback, D/E/F RunSession commit 경계가 추가됐다.
- event host schema·BEFORE cutscene playback, 데드씬 화면·retry route, 4개 PNG가 추가됐다.

**남은 결함**

- 사람용 interrogation screen model에는 autoplay용 `cardPlayability`가 전달되지 않아 effective CP cost, card lock, action lock, 비활성 사유를 카드에서 설명하지 못한다.
- 대부분의 UI가 pointer 중심이며 완전한 키보드 focus order, Enter/Escape, screen reader label이 없다.
- optional 에셋 하나의 실패가 `Assets.load` 묶음 전체 bootstrap 실패로 이어질 수 있다.
- desk 원본 1280×321을 논리 높이 161, y 239로 올려 322 HD로 늘린다. 목표가 정확한 반픽셀 160.5/y 239.5라면 geometry 계약을 하나로 통일해야 한다.
- 작은 viewport에서 1× 이하 축소가 없어 clip될 수 있고 ResizeObserver 기반 재배치가 없다.
- game bundle 528.52 kB로 현재 경고 한도를 넘었다.
- AFTER cutscene은 host되지 않고 cutscene/dead 화면은 실제 콘텐츠·autoplay·browser 회귀가 없다.

**판정: `PARTIAL`**

### 3.5 워크벤치·i18n·에셋

**확인된 강점**

- transform, rotation, scale, lock, reset, export와 localStorage v3 모델이 있다.
- pointer corner drag는 aspect lock을 존중한다.
- 12개 portrait state-parts sidecar와 55개 PNG가 있다.
- 한국어 strings 저장소와 322개 string이 있다.

**남은 결함**

- 런타임은 워크벤치의 `asset_manifest.json`과 portrait sidecar를 읽지 않는다.
- checked-in 승인 manifest가 0개다.
- `withSlotScale` 등 숫자/버튼 경로는 aspect lock을 우회할 수 있고 schema는 lock=true인데 scaleX≠scaleY도 허용한다.
- preview가 63px, runtime이 64px이 되는 reciprocal snap 차이가 있다.
- pointermove마다 full render/data URL/stringify가 발생해 큰 PNG에서 비용이 크다.
- sidecar import는 version/array 중심이고 character ID, 중복 state, 실제 key 결합 검증이 부족하다.
- PNG ingest는 IHDR/header 중심이고 완전 decode·CRC·비동기 race 방어가 부족하다.
- base64 localStorage는 quota, 손상, 미래 버전 백업에 취약하다. 문서가 주장하는 IndexedDB 구현은 없다.
- player-facing 화면과 autoplay raw-key 수집 범위에 `QUERY`, `EVENT A`, facet token, `FREE REVIEW` 등 개발 토큰이 남을 수 있다.

**판정: `PARTIAL`**

### 3.6 무코드 콘텐츠·자동화

**확인된 강점**

- 24 JSON이 현재 validator를 통과한다.
- 55 PNG가 palette gate를 통과한다.
- architecture gate와 production build가 통과한다.
- schema export drift를 잡는 byte-for-byte 테스트가 있고 최종 cutoff에서 2건 모두 통과한다.

**남은 결함**

- D/E/F와 save v2의 checked-in schema는 최신 Zod source와 동기화됐지만, D/E/F·cutscene 실제 콘텐츠가 0개라 저작 가능성·도달성·현지화·복원 계약은 아직 실증되지 않았다.
- 외부 dialogue 파일은 독립 검증되지만 encounter/stem/speaker/claim 정확 집합과 join하는 검증이 약하다.
- bundle validator가 전역 duplicate owner와 event-choice acquire ownership을 완전히 닫지 않는다.
- asset registry key가 실제 파일·크기·decode까지 이어지는 정적 검증이 없다.
- coverage threshold, browser artifact, screenshot/pixel-diff, accessibility gate가 없다.

**판정: 현재 A/B/C 콘텐츠 `PASS` / 최신 목표 `PARTIAL`**

---

## 4. 이미 해결됐거나 잘못 알려진 항목

아래 항목은 다시 “버그”로 구현하지 말고 회귀 테스트만 유지한다.

### 4.1 판정표 78개 누락

과거 문서의 78개 누락 주장은 현재 checkout에 적용되지 않는다. 432 유효 조합 전수가 저작 행에 매칭된다. 중립 fallback은 정상 조합 누락의 은폐 수단으로 사용하지 않는다.

### 4.2 보상 카드 unique instance ID

현재 deck pile은 카드 정의 ID 배열이며 동일 ID 반복으로 물리 복사본을 표현한다. per-copy 강화·내구도·스티커가 제품 요구가 되기 전에는 instance ID 계층을 추가하지 않는다. 현재 수정 대상은 반복 CARD/RESOURCE 효과와 unique collectible no-op 방지다.

### 4.3 “8단계 상태 머신”

정확한 표현은 21개 구현 상태 / 14개 턴 흐름 상태 / 8개 디자인 단계다.

### 4.4 “세이브 v2 미구현”

세이브 v2, migration, D/E/F·retry 필드와 동기화된 checked-in schema는 이미 존재한다. 필요한 작업은 전체 의미 계약, 손상 원본 보존, app/browser 회귀다.

### 4.5 640×400과 1280×800

640×400은 논리 좌표, 1280×800은 renderer 기본 화면, root scale은 2다. DPR에 따라 backing buffer가 더 커질 수 있으므로 canvas backing buffer를 항상 1280×800으로 강제하지 않는다.

### 4.6 워크벤치 storage key `.v2`

state version 3과 storage key 이름이 다른 것만으로 결함은 아니다. 기존 데이터 발견을 위한 호환 key일 수 있으므로 migration assertion으로 판단한다.

### 4.7 flow error boundary와 전역 예외 처리

`flowErrorBoundary.ts`는 game-flow callback 복구 경계다. `window.error`/`unhandledrejection` supervisor는 별도 요구이며 하나로 오인하지 않는다.

### 4.8 video 설정 단위 테스트

`actionDelayMs: 950`, `runTimeoutMs: 360_000`, `targetDurationSec: 150` 같은 설정 테스트는 wall-clock 완주 증거가 아니다.

### 4.9 silent audio fallback

오디오 누락이 게임 규칙을 멈추지 않게 하는 silent fallback은 유효하다. 릴리스 에셋 gate에서 필수 23개 논리 사운드가 모두 존재해야 한다는 계약과는 별개다.

---

## 5. 수정·업데이트 마스터 백로그

### 5.1 감사 중 해소된 기준선 결함

#### GATE-P0-00 — 자동 게이트 복구: **RESOLVED**

감사 중간에는 데드씬 asset lookup 인터페이스 불일치로 lint 3건과 typecheck 1건이 실패했고, D/E/F·save v2 generated schema도 잠시 source와 어긋났다. 사용자 병행 변경이 두 문제를 수정한 뒤 다음 회귀가 모두 통과했다.

- `pnpm lint`
- `pnpm typecheck`
- schema sync 1 file / 2 tests
- 전체 103 files / 850 tests
- `pnpm check` 전체 체인

이 ID는 열린 P0가 아니다. 공통 asset lookup 타입과 generated schema byte-for-byte 검사를 유지해 재발만 막는다.

### 5.2 P0 — 릴리스 차단 (6개)

| ID | 차단 항목 | v1.2 현재 상태 |
|---|---|---|
| ASSET-P0-01 | 승인 manifest·sidecar·오디오의 runtime 연결 | **OPEN** — runtime consumer/manifest 0, OGG 0 |
| FLOW-P0-02 | D/E/F·컷씬·데드씬 end-to-end 완성 | **대부분 해소** — strip에 A/B/C/D/E/F 각 1개, BEFORE·AFTER 컷씬 각 1개, 데드씬 retry/return 앱 회귀 6건. 남은 것: 데드씬 4종의 브라우저 증거(BR-06) |
| SAVE-P0-03 | save v2 전체 의미·복구 계약 완성 | **OPEN** — fingerprint·손상 원본 보존 미구현 |
| AUTO-P0-04 | 오토플레이 A~F/CUTSCENE/DEAD 확장 | **대부분 해소** — port·driver·headless harness·L1 러너 모두 D/E/F 처리, `DEAD_SCENE` case 추가, `never` 기반 exhaustive switch로 미지원 scene은 실패. 남은 것: 별도 `CUTSCENE` scene, revision/ack 토큰 |
| BROWSER-P0-05 | 저장소 native 실브라우저 릴리스 매트릭스 | **부분 해소** — Playwright+Chromium 러너·CI job·아티팩트 구성 완료, BR-01/02/04 PASS. BR-03/05/06/07/08 미작성 |
| VIDEO-P0-06 | 150초 acceptance 단일화와 실측 증거 | **계약 확정** — 목표 150초 ±15초로 단일화(§5.2 VIDEO-P0-06). 남은 것: video 모드 wall-clock 실측(BR-05) |

#### ASSET-P0-01 — 제작 결과를 실제 게임에 연결

**재현**

- portrait sidecar 12개는 파일로 존재하지만 runtime import/registry 소비가 없다.
- workbench는 manifest를 내려받을 수 있으나 checked-in 승인 `asset_manifest.json`이 없다.
- 논리 사운드는 SFX 13 + BGM 4 + stinger 6 = 23개지만 OGG는 0개다.

**수정**

1. 승인 manifest를 source of truth로 정하고 schema, version, asset key unique, source path, transform, lock을 검증한다.
2. bootstrap의 정적 asset registry와 manifest를 결합하되 필수/선택 에셋 정책을 명시한다.
3. portrait sidecar의 character/state/key/offset/duplicate를 검증하고 실제 portrait composition에 적용한다.
4. 23개 OGG를 정확한 경로·ID로 추가하고 decode/playback 테스트를 둔다.
5. 필수 누락은 build/validate 실패, 선택 누락은 fallback+telemetry로 처리한다.

**완료 조건:** 워크벤치에서 위치를 바꾸고 reload한 결과가 실제 게임 픽셀에 반영되며, 23개 sound registry entry가 모두 실제 OGG로 resolve된다.

#### FLOW-P0-02 — 목표 기능의 end-to-end 배선

**재현**

- `case.ts`, `RunState.ts`, `gameFlowPresentation`, `EventSceneModel`, `createEventScreen`, app `mountEvent`와 `RunSession.finishEvent`가 D/E/F를 처리한다.
- D/E/F schema·reducer 테스트는 있으나 UI/app callback을 실제 콘텐츠로 통과시키는 회귀는 없다.
- content에는 D/E/F/cutscene이 0개라 canonical 15노드에서 새 분기가 실행되지 않는다.
- BEFORE cutscene과 dead/retry는 bootstrap에 host됐지만 AFTER cutscene은 소비되지 않는다.
- autoplay port는 A~F/DEAD를 표기하지만 D/E/F callback, CUTSCENE scene, DEAD driver case가 없어 실제 자동 실행은 불가능하다.

**수정 순서**

1. 현재 D/E/F app/UI 분기를 exhaustive switch와 direct app test로 고정하고 partial progress·early continue·중복 callback을 검증한다.
2. 각 사건에 D/E/F 및 before/after cutscene 예시 콘텐츠를 최소 1개씩 저작한다.
3. 현재 BEFORE와 같은 transaction 규칙으로 AFTER cutscene을 event commit 뒤·route 전에 host하고 choice gains를 정확히 한 번 적용한다.
4. dead scene retry/return이 retryCount, nodeIndex, terminal, pending reward를 올바르게 유지하는 direct app test를 추가한다.
5. D/E/F·CUTSCENE·DEAD_SCENE legal action DTO와 revision/action token을 autoplay에 연결한다.
6. 다섯 번째 “미분류/fallback” 데드씬이 제품 설계에 필수인지 결정한다. 현재 runtime failure reason은 4종이다.

**완료 조건:** 15노드 실제 앱 런에서 A~F, 컷씬, 실패→데드씬→재시도/종료가 각각 최소 한 번 통과하고 save/reload 후 동일 상태로 복원된다.

#### SAVE-P0-03 — save v2 전체 계약

**수정**

- `run_contract_version` 또는 안정적인 rules/content fingerprint를 저장한다.
- canonical strip ID/order/kind/ref, catalog IDs, balance version을 fingerprint에 포함한다.
- restore는 parse → migration → reference validation → semantic validation → commit 순서로 원자적으로 수행한다.
- 실패 원본은 즉시 삭제하지 않고 별도 key/다운로드로 보존하며 한국어 복구 배너를 표시한다.
- node kind별 필수 상태를 검증한다: encounter snapshot, event progress, cutscene beat/choice, dead-scene retry, pending reward.
- 미래 save version과 동일 ID·다른 의미 콘텐츠를 명시적으로 거부한다.

**완료 조건:** 모든 canonical node 경계에서 save→새 프로세스 restore deep-equality, 손상 save 원본 보존, 중복 reward/event/cutscene effect 0.

#### AUTO-P0-04 — 자동 플레이 계약 확장

**수정**

- 기존 `EVENT` scene을 유지한다면 pattern별 authoritative callback을 A~F 모두 제공하고, 별도 `CUTSCENE`과 완전한 `DEAD_SCENE` action contract를 명시한다.
- 모든 scene에 `revision`과 authoritative legal actions를 제공한다.
- driver는 D/E/F를 C로 간주하지 않고 exhaustive pattern switch에서 실패한다.
- cutscene choice/skip/default, dead-scene retry/return, D/E/F multi-attempt를 policy에 추가한다.
- report에 event pattern, choice, presentation ack, save checkpoint, console/window/network telemetry를 기록한다.
- policy의 콘텐츠 ID 하드코딩을 제거하고 `autoplay_priority` 또는 저작된 semantic role을 사용한다.

**완료 조건:** headless와 browser에서 같은 seed/정책이 같은 15노드 action trace와 ending을 만들고 unknown scene fallback 0.

#### BROWSER-P0-05 — 저장소 native 브라우저 매트릭스

**수정**

- Playwright 또는 동등한 Chromium runner를 devDependency와 script로 저장소에 포함한다.
- dev server가 실제 출력한 URL/port를 fixture가 사용한다.
- 1280×800 DPR 1·2, workbench, turbo BEST, video BEST, failure/dead scene을 CI에서 실행한다.
- console error, `window.error`, `unhandledrejection`, failed request, missing asset, raw i18n을 수집한다.
- report JSON, screenshot, trace, video timing을 CI artifact로 보존한다.

**완료 조건:** 개발자 개인 플러그인 없이 clean checkout과 CI에서 동일 매트릭스를 재현한다.

#### VIDEO-P0-06 — 150초 계약 단일화

**결정됨 (2026-08-07):** 제품 계약은 **목표 150초, 허용 오차 ±15초**다.

- 합격 범위: `135_000 <= durationMs <= 165_000`
- 채택하지 않은 해석: `145_000 <= durationMs <= 150_000` (“150초 초과 금지”)

단일 source는 `src/dev/autoplay/report.ts`의 `VIDEO_TARGET_DURATION_SEC`(150)와
`VIDEO_DURATION_TOLERANCE_SEC`(15)이며, `VIDEO_DURATION_ACCEPTANCE`의 세 경계값과 driver의
`video.targetDurationSec` 페이싱이 모두 여기서 파생된다. 따라서 “150초 이내”라고 선언하지 않는다.

**완료 조건:** 실제 1280×800 browser wall-clock, 정확한 15노드, `RUN_COMPLETED`, `ending-true`, 9 BEST, pending reward 0, console/network/raw-key/invariant error 0, ending screenshot 존재.

### 5.2-b v1.2에서 해소된 P1 항목

| ID | 해소 내용 |
|---|---|
| RUN-P1-01 | `RunResourceBounds`를 balance에서 주입, `clampRunResource` 단일 함수로 event/reward/outcome 전 경로 clamp. stress 100·trust 3 회귀 추가 |
| REWARD-P1-02 | 기소유 relic/enhancement를 **reference_id 기준**으로 제외, 소진 티어는 빈 제안으로 축소, `claimRunReward`가 기소유 collectible 청구를 명시적으로 거부 |
| CONTENT-P1-04 | `ContentSemanticValidator`에 노드 순서 state frontier 추가. 뒤 노드 증거로 앞 노드 proof를 통과시키지 못한다. 체크인 콘텐츠는 clean |
| CONTENT-P1-06 | `ToolContentValidator`에 dialogue↔encounter exact-set join 검증 추가. 해석 규칙은 `createEncounterSession`을 그대로 미러링 |
| CONTENT-P1-05 | `selectProofRule`/`shadowedProofRules`를 공통 selector로 도입해 validator와 coordinator가 같은 규칙을 읽는다 |
| I18N-P1-10 (일부) | 브라우저 매트릭스가 잡은 카드 ID 노출 8종 수정. BR-04에서 raw i18n 0 확인 |
| CI-P1-23 | `.nvmrc`·CI를 package 계약과 같은 Node 22.13.0으로 통일 |

### 5.3 P1 — 핵심 무결성과 사용자 품질

| ID | 결함 | 근본 원인 | 요구 수정·회귀 |
|---|---|---|---|
| RUN-P1-01 | stress/trust 상한 초과 | `adjustRunResource`와 reward가 0 하한만 clamp | balance에서 bounds를 주입하고 event/reward/outcome 전 경로 공통 clamp; stress 100 + 10, trust 3 + 1 회귀 |
| REWARD-P1-02 | 이미 소유한 RELIC/ENHANCEMENT가 무효 선택으로 재등장 | fresh/repeatable 부족 시 전체 eligible로 fallback, claim은 unique no-op | owned reference ID 제외, 선택 수 축소 또는 명시적 자원 전환 정책; silent success 금지 |
| CONTENT-P1-03 | validator가 허용한 effect를 runtime이 버릴 수 있음 | A/C `EffectSchema`와 제한된 `RunEffectSchema`, default warning/drop | validator-consumer vocabulary를 하나로 통일하고 unknown target/type를 content validate에서 실패 |
| CONTENT-P1-04 | 시간상 불가능한 proof 경로가 도달 가능으로 판정될 수 있음 | Tier-2가 node order/acquire time을 과대근사 | strip 순서별 state frontier로 evidence/route/flag 획득을 전파 |
| CONTENT-P1-05 | 여러 proof rule의 validator/runtime 의미 불일치 | validator aggregation, coordinator first `find()` | target/direction당 exactly-one 또는 공통 selector/aggregation 함수 |
| CONTENT-P1-06 | dialogue와 encounter 연결 오류 탐지 부족 | 파일 단독 검증만 강함 | encounter/stem/speaker/claim exact-set join validator와 누락·중복 hostile test |
| SIM-P1-07 | “27-cell engine simulation” 과장 | BEST 9만 coordinator, 나머지 18은 OutcomeEvaluator 합성 | 9×3 전체를 실제 coordinator 또는 문서상 evaluator matrix로 정확히 명명 |
| L1-P1-08 | 15노드 restore가 실제 terminal encounter projection을 충분히 보존하지 않음 | harness가 단순 state를 전달 | 각 node 의미 snapshot과 실제 encounterState를 RunSession에 commit하고 모든 경계 reload |
| UI-P1-09 | 사람용 카드에 playability/effective cost/disabled reason 없음 | 값은 autoplay scene에만 생성 | `InterrogationCardView`로 전달하고 카드·modal·submit button에 표시; engine rejection 이전 차단 |
| I18N-P1-10 | 개발 토큰·raw key 노출 가능 | fixed whitelist와 일부 scene만 수집 | 모든 player-facing model의 localized display DTO, 실제 콘텐츠 ID denylist, browser text scan |
| ERR-P1-11 | 전역 미처리 오류가 flow banner를 우회 | callback boundary와 window supervisor 분리 | `window.error`/`unhandledrejection` supervisor, 한국어 배너, retry-safe recovery, telemetry |
| AUDIO-P1-12 | 23개 논리 사운드가 전부 silent | OGG 0 | 파일 추가, registry exactness, decode, mute/unmute, BGM loop/stinger 회귀 |
| WB-P1-13 | aspect lock 우회 | drag와 numeric/button 경로가 다른 reducer 사용 | 모든 geometry mutation을 단일 invariant 함수로 통합; schema refine |
| WB-P1-14 | preview/runtime 1px 차이 | reciprocal snap/round 규칙 불일치 | canonical asset dimension과 rounding 함수를 공유 |
| WB-P1-15 | pointermove 성능 저하 | full render, data URL, stringify 반복 | requestAnimationFrame batching, dirty-slot render, blob/object URL, persist on commit |
| UI-P1-16 | desk가 321px 원본에서 322px HD로 늘어남 | 논리 `ceil(321/2)=161` | 반픽셀 계약 또는 source crop 중 하나를 정하고 runtime/workbench/test 동일화 |
| UI-P1-17 | 선택 에셋 하나가 전체 preload를 중단할 수 있음 | all-or-nothing `Assets.load` | 필수/선택 그룹 분리, per-asset fallback과 진단 |
| AUTO-P1-18 | fuzz가 authoritative legal action을 보장하지 않음 | policy가 화면 제약을 재구성 | app이 legal actions/constraints를 노출하고 fuzz는 그 집합에서 선택; event/reward 포함 |
| AUTO-P1-19 | report 관측성·schema 부족 | TypeScript type만 있고 runtime parse 없음 | Zod report schema, scene/action/evidence, console/window/network/raw-key 배열, artifact serialization |
| AUTO-P1-20 | 특정 콘텐츠 ID 하드코딩 | policy/harness에 ticket trade 등 직접 ID | 콘텐츠의 semantic role/autoplay priority로 이동 |
| PRESENT-P1-21 | 판정 피드백이 오토플레이 trace에서 누락 | 명령형 임시 UI와 scene state 분리 | presentation queue/revision/ack를 app truth DTO에 포함 |
| A11Y-P1-22 | 포인터 의존 UI | 제한된 Space/Digit shortcut만 존재 | focus ring, Tab order, Enter/Space/Escape, ARIA label/live region, axe |
| CI-P1-23 | 개발·CI Node 불일치 | package 22, nvm/CI 20.19 | `.nvmrc`와 workflow를 22.13으로 통일하고 engine check |
| ASSET-P1-24 | registry key가 실제 정상 이미지임을 보장하지 않음 | header/IHDR·palette 중심 | 파일 존재, full decode/CRC, exact dimensions, alpha/palette, duplicate path 검사 |

### 5.4 P2 — 견고성·성능·유지보수성

| ID | 업데이트 |
|---|---|
| ENGINE-P2-01 | engine boundary에서 evidence ID unknown/unacquired/duplicate를 명시 오류로 거부하고 min/max 계산 전에 unique 정규화 |
| ENGINE-P2-02 | case-local/common flag hook의 owner, setter, consumer를 전역 unique graph로 검증 |
| ENGINE-P2-03 | reward/relic/card 조건 필드 중 runtime 미소비 항목을 제거하거나 실제 소비 |
| SAVE-P2-04 | legacy와 canonical 필드가 동시에 있을 때 우선순위·불일치 거부를 명시 |
| SAVE-P2-05 | terminal save, pending reward, dead scene, retry count의 hostile mutation tests 추가 |
| ASSET-P2-06 | sidecar character ID, state 중복, base/upset/lose/used 조합, offset 적용을 strict validate |
| ASSET-P2-07 | 비동기 PNG 교체 race에 generation token/abort 적용 |
| WB-P2-08 | localStorage base64를 IndexedDB blob으로 이전하고 quota·손상·미래 버전 backup/migration |
| UI-P2-09 | ResizeObserver와 1배 미만 축소 정책을 도입해 작은 viewport clip 방지 |
| UI-P2-10 | error/banner/preview overlay의 stale lifecycle과 destroy idempotency 테스트 |
| AUTO-P2-11 | driver `start` 결과, `stop/destroy`, ticker·console wrapper cleanup 계약 강화 |
| AUTO-P2-12 | Node integration을 `e2e`라 부르는 파일/문서 정리 |
| CI-P2-13 | PR에서 15-node route matrix, coverage threshold, browser artifact를 필수 gate로 추가 |
| PERF-P2-14 | 528.52 kB game chunk를 cutscene/dead/workbench 및 대형 registry 기준으로 code split |
| ARCH-P2-15 | 1,000줄 이상 bootstrap/coordinator 조합 루트를 host/controller 단위로 분리 |
| CONTENT-P2-16 | 콘텐츠 수량 목표를 먼저 확정하고, 과거 숫자를 맞추기 위한 임의 dummy 데이터 추가 금지 |

### 5.5 P3 — 콘텐츠·아트·문서 폴리시

- placeholder 성격의 portrait/card art를 최종 승인 아트로 교체한다.
- 15노드 strip의 행 전환 시각 연결과 잠금/완료 가독성을 다듬는다.
- 미사용 title/dev English 문자열을 제거하거나 현지화한다.
- workbench no-op 조작, outline, status copy를 정리한다.
- 컷씬·D/E/F·데드씬의 실제 서사 콘텐츠와 오디오 믹스를 제작한다.
- 본 문서의 상태 표를 각 릴리스 후보에서 자동 계측 결과로 갱신한다.

---

## 6. 구현 순서와 의존성

| 단계 | 선행 조건 | 작업 | 단계 종료 게이트 |
|---|---|---|---|
| 0. 기준선 유지 | 없음 | GATE-P0-00 회귀, CI Node 통일 | `pnpm check` 녹색 — 로컬 완료 |
| 1. 도메인 무결성 | 단계 0 | resource bounds, unique reward, effect closure, proof/reachability/dialogue | hostile validator·engine 회귀 녹색 |
| 2. 기능 통합 | 단계 1 | D/E/F 실제 content·app 회귀, cutscene host, dead scene routing, save v2 semantics | headless A~F/cutscene/dead 전체 경로 |
| 3. 제작 파이프라인 | 단계 0 | manifest/sidecar runtime, workbench invariants, OGG, i18n | asset/audio/i18n 정적 gate |
| 4. 자동화 확장 | 단계 2·3 | autoplay scene union, legal action fuzz, report schema, browser runner | turbo/fuzz/browser matrix |
| 5. 비디오·접근성 | 단계 4 | duration 단일화, screenshot/trace, keyboard/axe | release evidence bundle |
| 6. 문서 정리 | 단계 5 | Phase/README/설계 상태 동기화 | 문서 수치와 자동 계측 일치 |

병렬 가능한 묶음은 “도메인 무결성”과 “제작 파이프라인”이다. 그러나 D/E/F 실제 콘텐츠는 effect·save 계약이 확정된 뒤 저작하고, browser acceptance는 app/autoplay 통합 뒤 실행한다.

---

## 7. 필수 검증 매트릭스

### 7.1 코드·데이터 게이트

`dungeon-dossier/`에서 Node 22.13.0 / pnpm 11.18.0으로 다음을 실행한다.

```bash
corepack pnpm lint
corepack pnpm arch
corepack pnpm typecheck
corepack pnpm test
corepack pnpm content:validate
corepack pnpm schema:export
corepack pnpm palette:check
corepack pnpm simulate:full
corepack pnpm build
corepack pnpm check
```

모든 명령의 exit code, test file/test 수, JSON/PNG 수, build module/chunk 수를 결과 artifact에 기록한다. `schema:export`는 실행 후 generated diff가 비어 있어야 한다.

### 7.2 엔진·런 집중 회귀

- 432 resolution 조합과 hostile fallback
- 모든 machine state의 legal/illegal transition
- submit 각 단계 예외 주입과 full snapshot rollback
- resource min/max 전 경로
- unique collectible drained-pool
- proof rule 중복 target/direction
- node-order-aware reachability
- dialogue join hostile fixtures
- A~F event effect를 각각 save 직전/직후 복원
- 모든 15 canonical node 경계의 deep-equality restore
- corrupt/future/stale save 원본 보존
- 한 장기 런 기준 1,000+ legal actions와 event/reward 포함 fuzz

### 7.3 브라우저 매트릭스

| ID | URL/상태 | viewport | 필수 조작·증거 |
|---|---|---|---|
| BR-01 | 일반 게임 | 1280×800, DPR 1 | card hover/drag/modal, portrait/partner, keyboard |
| BR-02 | 일반 게임 | 1280×800, DPR 2 | integer scale, nearest, backing/CSS 분리 |
| BR-03 | `/workbench/` | 1280×800 | 16 slot, move/rotate/scale/lock, reload, manifest export |
| BR-04 | turbo BEST | 1280×800 | A~F/cutscene/reward/ending, exact 15 nodes |
| BR-05 | video BEST | 1280×800 | wall-clock, ending screenshot, report JSON |
| BR-06 | failure seeds | 1280×800 | 4 dead scenes, retry exhausted, return |
| BR-07 | keyboard/a11y | 1280×800 | Tab/Enter/Space/Escape, focus, live region, axe |
| BR-08 | audio | 1280×800 | 23 OGG decode, mute/unmute, BGM loop, stinger |

모든 시나리오의 console error, unhandled rejection, failed request, missing asset, raw i18n key, invariant failure는 0이어야 한다.

### 7.4 video report 필수 필드

- config/version/seed/policy/mode
- 실제 시작·종료 시각과 `durationMs`
- canonical node ID/kind/ref의 정확한 15개 순서
- scene revision, legal action, 선택 action, presentation ack
- 9 encounter outcome과 ending ID
- save checkpoint/restore 결과
- pending reward, terminal marker
- console/window/network/missing asset/raw i18n/invariant 배열
- screenshot/trace artifact 경로

---

## 8. 문서 정합성 업데이트 대상

다음 문서는 현재 코드보다 오래된 수치·상태를 포함하므로 구현과 동시에 갱신한다.

| 문서 | 정정 사항 |
|---|---|
| `docs/phase/README.md` | schema 수 10→12, 상태 머신 21/14/8 표기, 현재 test 수 자동 계측 |
| Phase 워크벤치 설명 | “게임 내 직접 drag/drop”, “IndexedDB”, “audio ingest”를 현재 구현과 분리 |
| Phase 7/Codex task 문서 | 388 tests 등 오래된 고정 숫자를 실행 결과 기반 표로 교체 |
| `docs/design/game_completion_design.md` | 역사적 기준선임을 명시하고 최신 backlog로 연결 |
| `docs/phase/gap_audit_v2_and_autoplay_15node_scenario.md` | 432 누락·reward ID·flow error 중 이미 해결된 항목을 historical로 표시 |
| `docs/phase/prompt_verification_and_update.md` | 오래된 desk 236, 실제로 없는 assetWorkbench 경로, 현재 save/event 상태 정정 |
| video prompt | localhost:5174 고정 제거, dev server가 출력한 실제 URL 사용 |
| `docs/design/event_system_custom_scale_deadscene_design.md` | D/E/F·save v2·cutscene/dead를 “미구현”에서 “부분 구현/미배선”으로 갱신 |
| `docs/design/card_contradiction_workbench_design.md` | 최신 interrogation playability, workbench runtime consumer 상태 반영 |
| 최종 감사 프롬프트 | “프롬프트 작성 완료”와 “제품 검증 완료”를 분리하고 브라우저 증거 없이는 PASS 금지 |

문서 수치는 직접 고정하기보다 가능하면 inventory/report script가 생성한 JSON을 참조한다.

---

## 9. Definition of Done

다음이 모두 충족될 때만 `FINAL VERDICT: PASS`를 선언한다.

- 열린 P0 6개 전부 종료
- `pnpm check`와 개별 확장 게이트 모두 exit 0
- lint/typecheck/schema drift 0
- 현재 checkout의 모든 content JSON과 PNG/OGG/manifest/sidecar 검증 통과
- A~F, before/after cutscene, reward, 4 dead scene, retry/return, ending의 end-to-end 경로 존재
- 모든 canonical node 경계 save/restore deep-equality
- long-run legal fuzz 1,000+ actions, unexpected throw/lockup/rollback drift 0
- 실제 browser turbo/video matrix PASS
- 선택한 video duration 계약 충족
- console/window/network/missing asset/raw i18n/invariant error 0
- keyboard-only 핵심 완주와 accessibility gate PASS
- report JSON, screenshots, trace, duration, gate log artifact 존재
- 사용자 기존 변경 보존, debug/temp artifact 0
- 문서 수치와 최종 실행 결과 일치

하나라도 충족하지 못하면 판정은 `NOT READY`이며, 남은 ID와 가장 짧은 재현 명령을 함께 보고한다.

---

## 10. 이번 감사의 결론

현재 게임은 판정·상태 머신·A/B/C headless 기반이 무너진 프로젝트가 아니다. 핵심 엔진과 기존 15노드 경로에는 상당한 자동화 근거가 있고, 최종 재실행에서 전체 자동 게이트, 103 files / 850 tests와 schema sync가 통과했다. 병행 작업으로 D/E/F는 사용자 event UI와 app/RunSession 경계까지, 컷씬은 BEFORE host까지, 데드씬은 failure/retry route까지 진전했다.

따라서 올바른 다음 행동은 이미 해결된 432 조합, 카드 instance ID, 또는 현재 녹색인 기준선을 다시 만드는 것이 아니다. D/E/F 실제 콘텐츠와 app 회귀를 추가하고, cutscene/dead host, autoplay, save 의미 계약, manifest·sidecar·OGG, browser evidence를 차례로 닫아야 한다. 그 전에는 “최후 전수 감사 완료” 또는 “100% 무결성 완성”을 제품 완료 선언으로 사용할 수 없다.
