# 📑 던전 수사 조서: 최후 전수 버그 감사 & 무결성 완성 마스터 프롬프트

> **사용 방법:** 아래 코드 블록 전체를 AI 코딩 에이전트에 전달합니다. 이 프롬프트에서 말하는 “100% 전수 검증”은 막연한 무결점 선언이 아니라, 생성된 감사 인벤토리의 모든 항목에 재현 가능한 PASS 증거가 있고 UNKNOWN/미검증 항목이 0개인 상태를 뜻합니다.
>
> **코드 대조 기준:** 2026-08-06 현재 `dungeon-dossier/`의 실제 경로·스크립트·테스트 계약을 기준으로 검증했습니다. 특히 존재하지 않는 파일명, 보상 instance ID에 관한 잘못된 가정, 8개 디자인 단계와 21개 구현 상태의 혼동, 정적 video 설정을 실브라우저 완주 증거로 간주하는 문제를 바로잡았습니다.

````markdown
Role: Principal QA Automation Architect & System Lead Engineer
Task: Perform Full-Spectrum System Verification, Deep Bug Audit, and Automated Remediation for "[던전 수사 조서 (Dungeon Detective Kim Taehoon)]".

첫 응답의 첫 줄에 정확히 다음 문구를 출력하세요.
"Full-Spectrum Verification Protocol Activated."

그 직후 같은 작업을 계속 실행하세요. 위 승인 문구 자체를 완료 보고로 간주하거나 작업을 멈추지 마세요.

---

## 0. 실행 계약 (Non-Negotiable Operating Contract)

1. 작업 디렉터리는 `dungeon-dossier/`입니다. `package.json`의 Node/pnpm 엔진과 package manager를 먼저 확인하고 `corepack pnpm`으로 프로젝트 스크립트를 실행하세요.
2. 수정 전 `git status --short`와 관련 diff를 확인하세요. 기존 사용자 변경을 보존하고, 무관한 파일을 되돌리거나 덮어쓰지 마세요. 명시 요청 없이는 commit/push/PR을 만들지 마세요.
3. `src/`, `tests/`, `workbench/`, `content/`, `schemas/`, `tools/`와 루트 설정 파일을 실제로 열어 감사 인벤토리를 만드세요. 문서에 적힌 경로나 개수만 신뢰하지 말고 현재 checkout에서 다시 산출하세요.
4. 베이스라인 실패와 이번 감사에서 새로 발생한 실패를 구분해 기록하되, 범위 내 결함은 재현 → 근본 원인 → 최소 수정 → 회귀 테스트 순서로 해결하세요.
5. 테스트 삭제·skip·완화, 오류 삼키기, 무조건 성공 처리, fixture만 하드코딩하기로 게이트를 통과시키지 마세요. 의도된 validation error와 예상 밖 exception을 구분하세요.
6. “완료/100%/무결점”은 모든 인벤토리 행에 PASS 증거가 있을 때만 선언하세요. 실행하지 못한 항목은 UNKNOWN/BLOCKED로 남기고 이유와 재현 명령을 보고하세요.

---

## 1. 목표와 전수 감사의 정의 (Executive Objective)

엔진, 런 세션·저장·보상, 15노드 오토플레이, PixiJS 프레젠테이션, 워크벤치·i18n, 무코드 콘텐츠·자동화 테스트를 코드와 실제 실행 양쪽에서 전수 감사하고 발견된 결함을 자동 수정하세요.

“전수”는 다음 산출물을 모두 포함합니다.

- 실제 파일·공개 API·상태·콘텐츠·테스트의 범위 인벤토리
- 각 요구사항과 구현 경로·검증 테스트·실행 증거의 추적성 표
- 발견 결함 ledger: ID, 심각도, 재현, 근본 원인, 수정 파일, 회귀 테스트, 결과
- 모든 자동 게이트의 명령·exit code·테스트 수
- 브라우저가 필요한 항목의 URL·viewport·DPR·실측 시간·보고서·스크린샷
- 잔여 위험과 UNKNOWN/BLOCKED 항목. PASS라면 둘 다 0개

---

## 2. 6대 분야 전수 검증 및 자동 수정 체크리스트

### 1️⃣ 심문 엔진 & 게임 규칙 (Engine & Rules)

- [ ] **판정표 전수성 (`src/engine/resolution/resolutionTable.ts`)**
  - `2 intents × 3 relevances × 4 relations × 3 sufficiencies × 2 independence results × 3 hypothesis results = 432`개 유효 조합을 모두 순회하세요.
  - `lookupResolutionCode()`와 `lookupResolutionTableRow()`는 모든 유효 조합에서 throw 없이 `RESOLUTION_CODES` 중 하나를 반환하고, authored wildcard row와 매칭되어야 합니다.
  - 유효한 432개 조합에서 중립 fallback이 조용히 coverage hole을 가리는지 검사하세요. `R_INSUFFICIENT_GROUNDS` fallback 계약은 강제로 table miss를 만든 별도 회귀 테스트로 검증하세요.
  - 기준 테스트: `tests/judgment/resolution-table.test.ts`.

- [ ] **상태 머신·제출 트랜잭션 (`src/engine/encounter/EncounterStateMachine.ts`, `src/engine/encounter/EncounterCoordinator.ts`)**
  - 이 구현은 “8개 상태”가 아닙니다. 21개 구현 상태와 8개 디자인 단계/14개 턴 흐름 상태의 매핑을 구분하고 `assertEightStepTurnMapping()` 계약을 검증하세요.
  - 정상 순환, 명시적 종료, 의도된 invalid transition을 각각 검증하세요.
  - 성공 제출은 다음 허용 상태로 진행해야 하며 `R_ACTION_INVALID`는 CP·카드를 소비하지 않아야 합니다.
  - `RESOLVE` 진입 뒤 어느 지점에서든 예외가 발생하면 encounter/machine snapshot 전체가 제출 직전 `BUILD_ARGUMENT`로 원자적으로 복구되고 동일 제출을 재시도할 수 있어야 합니다.
  - 어떤 테스트 종료 시점에도 machine이 `RESOLVE`에 남거나 `BUILD_ARGUMENT`에서 무진행 lockup에 빠져서는 안 됩니다.
  - 기준 테스트: `tests/engine/encounter-state-machine.test.ts`, `tests/engine/encounter-coordinator.test.ts`.

- [ ] **Claim·Proof 불변식**
  - 실제 구현 경로는 `src/engine/knowledge/ClaimState.ts`, `src/engine/resolution/ActionValidator.ts`, `src/engine/resolution/EvidenceRelationEvaluator.ts`, `src/engine/resolution/ProofEvaluator.ts`, `src/engine/resolution/IndependenceEvaluator.ts`, `src/engine/encounter/ObjectiveEvaluator.ts`입니다. 존재하지 않는 `claimInvariants.ts`를 가정하지 마세요.
  - `assertClaimStateInvariants()`의 I-1~I-5, target 공개 여부, facet, min/max evidence, SUPPORT/CONTRADICT 방향, confidence/integrity, derived source와 독립 출처 수, alternate hypothesis, incomplete required objective의 잔존 solvable path를 검증하세요.
  - 기준 테스트: `tests/engine/claim-invariants.test.ts` 및 proof/judgment/leakage 관련 테스트.

- [ ] **결정론·정보 경계**
  - 동일 seed와 입력은 동일 JudgmentLog를 생성해야 합니다.
  - PublicDTO, 대사, 프레젠테이션에 truth/proof set/hypothesis 같은 비공개 정보가 노출되어서는 안 됩니다.

### 2️⃣ 런 세션 & 저장/보상 시스템 (Run Session & Save)

- [ ] **보상 선택·중복 수령 (`src/engine/run/RewardSystem.ts`, `src/engine/run/RunState.ts`)**
  - `selectRewardChoices()`의 deterministic weighted draw, 선택지 내 중복 금지, rarity/act/episode/condition 필터를 검증하세요.
  - `claimRunReward()`는 반복 가능한 CARD/RESOURCE 보상을 다시 받을 때 효과를 매번 적용해야 합니다. 덱의 같은 `card_id` 반복이 물리 복사본을 표현하므로 존재하지 않는 unique instance ID 구조를 새로 요구하지 마세요.
  - 선택 뒤 `pendingRewardIds`는 비워지고, `claimedRewardIds`는 unique reward ID 집합으로 유지되며, 저장 schema가 계속 유효해야 합니다. ENHANCEMENT/RELIC 획득 ID는 중복되면 안 됩니다.

- [ ] **15노드 경계 저장·복원**
  - 실제 경로는 `src/app/createRunSession.ts`, `src/engine/run/RunState.ts`, `src/app/save/runSave.ts`, `src/app/save/SaveRepository.ts`입니다. 존재하지 않는 `runSession.ts`를 가정하지 마세요.
  - encounter 완료 후 pending reward, reward claim 직후, 각 event 선택 완료, 7노드 checkpoint, 15노드 terminal을 각각 저장·재로드하세요.
  - restore 전후 `nodeIndex`, 모든 deck pile, stress/dp/trust, flags, runSeed, rewardSeedStream, falseConfessions, completedNodeIds, pending/claimed reward IDs, evidence/relic/enhancement IDs, grade/outcome history, terminal을 deep-equality로 검증하세요.
  - 노드 경계 저장의 `encounter`가 의도대로 `null`인지 확인하세요.
  - 기준 테스트: `tests/app/run-session.test.ts`, `tests/e2e/full-run.headless.test.ts`, `tests/routes/autoplay-15node.test.ts`.

- [ ] **오염 저장·쓰기 실패의 원자성**
  - strict `SaveSchema`, v1 migration, future version, 손상 JSON, 범위 밖 nodeIndex, 정의 데이터 유출을 검증하세요.
  - `completedNodeIds`가 canonical strip prefix인지, nodeIndex/terminal이 일치하는지, pending reward와 deck/relic/enhancement/evidence 참조가 catalogue에 존재하는지 hostile-save 테스트로 확인하세요.
  - 저장소 `setItem()` 실패를 주입하여 메모리 상태, 재시도, reward/event 중복 적용 여부를 검증하세요.

- [ ] **복구 UI (`src/ui/screens/error/createErrorBanner.ts`, `src/app/bootstrap.ts`)**
  - 현재 경계는 game-flow callback의 예외를 `handleFlowError()`로 라우팅합니다. 진짜 전역 `window.onerror`/`unhandledrejection` 요구와 혼동하지 마세요. 제품 요구가 전역 포착이라면 명시적으로 구현하고 테스트하세요.
  - 오류 주입 통합 테스트로 한국어 메시지, `다시 시도`, `진행 기록으로 복귀`, 기술 오류 기록, retry-safe 동작, reward/event/ending 중복 적용 방지를 검증하세요.

### 3️⃣ 15노드 자동 플레이 & 150초 비디오 모드 (Autoplay & Video)

- [ ] **L1/L2 경로 분리**
  - L1은 `src/dev/autoPlayHarness.ts`와 `window.__AUTO_PLAY__.start/stop/getProgress`입니다. L2의 `mode`/`policy`를 받는 API가 아닙니다.
  - L2는 `src/dev/autoplay/driver.ts`, `policy.ts`, `report.ts`, `hud.ts`입니다. DEV 전용 가드가 production build에 새 전역·자동 시작 부작용을 만들지 않는지 확인하세요.
  - L1/L2 seed 계약을 non-negative uint32 safe integer로 통일하고, 음수·소수·빈 값·overflow의 처리도 테스트하세요. 기본 seed가 경로마다 달라도 재현 URL에는 seed를 항상 명시하세요.

- [ ] **정확한 15노드 완주**
  - `content/common/run-strip.json`에서 현재 canonical 15노드 ID/order/kind/ref를 읽어 기대값을 생성하세요. 하드코딩한 “15개 방문” 숫자만으로 통과시키지 마세요.
  - L1의 15노드 완주와 7노드 저장/복원을 검증하고, L2 보고서가 같은 canonical 순서로 끝나는지 검증하세요.
  - terminal node 15, `RUN_COMPLETED`, pending reward 0, 9 encounter history, 최종 ending 도달을 요구하세요.

- [ ] **`mode=video` 실브라우저 검증**
  - 현재 설정 `timeScale: 1.15`, `actionDelayMs: 950`, `sceneStallMs: 90_000`, `runTimeoutMs: 360_000`, `skipTypewriter: false`, `targetDurationSec: 150`, `typewriterIntervalMs: 20`을 먼저 확인하세요.
  - 이 설정과 `videoNodeGateMs` 단위 테스트는 실행을 늦추는 최소 gate만 증명합니다. 150초 안팎의 실제 완주를 증명하지 않으며 `runTimeoutMs: 360_000`도 성공 기준이 아닙니다.
  - dev server가 출력한 실제 URL을 사용하세요. 포트를 `5174` 등으로 고정하지 말고 `/?autoplay=true&mode=video&policy=best&seed=20260805`로 실행하세요.
  - 1280×800 실제 브라우저에서 `#dd-autoplay-report` 또는 `window.__DD_AUTOPLAY_REPORT__`를 파싱하고, 엔딩 UI 스크린샷을 저장하세요.
  - 비디오 페이싱 합격 범위는 **목표 150초, 허용 오차 ±15초**(`135_000 <= durationMs <= 165_000`)로 확정됐습니다(VIDEO-P0-06). 이 값을 다시 고르지 마세요. 단일 source는 `src/dev/autoplay/report.ts`의 `VIDEO_TARGET_DURATION_SEC` / `VIDEO_DURATION_TOLERANCE_SEC`이며, 변경이 필요하면 그 두 상수만 고칩니다.
  - `result === "PASS"`, 정확한 15노드, `terminalMarker === "RUN_COMPLETED"`, `ending.endingId === "ending-true"`, F-13, 9개 `BEST_RESOLUTION`, pending reward/console error/missing asset/raw i18n/invariant failure 0을 모두 요구하세요.
  - 기준 테스트: `tests/dev/autoplay-video.test.ts`, `autoplay-policy.test.ts`, `autoplay-report.test.ts`. 이 정적 테스트와 별도로 실브라우저 증거가 필수입니다.

- [ ] **Fuzz를 두 종류로 분리**
  - `policy=fuzz` L2 브라우저 정책과 `tests/e2e/fuzz-run.headless.test.ts`의 headless matrix를 별개로 보고하세요.
  - legal-action fuzz는 deterministic seed 집합으로 실제 제출 시도 수를 집계해 총 1,000회 이상, 예상 밖 throw/uncaught rejection 0을 증명하세요.
  - adversarial fuzz는 의도된 invalid 요청의 허용된 validation error만 인정하고, 실패 전후 snapshot 완전 롤백, CP/card 불소비, `RESOLVE` 잔류 0, lockup 0, 예상 밖 오류 0을 증명하세요.
  - 기존 “9 encounters × 5 seeds” 또는 submission cap만으로 1,000회 실제 실행을 주장하지 마세요.

### 4️⃣ PixiJS 640×400 Logical / 1280×800 HD Presentation

- [ ] **렌더 좌표계 계약**
  - `src/ui/core/integerScale.ts`, `createGameApplication.ts`, `src/style.css`를 감사하세요.
  - 논리 stage는 640×400, Pixi renderer screen은 1280×800, root stage scale은 2여야 합니다. CSS 표시는 허용 공간에서 정수 1×/2×와 letterbox만 사용해야 합니다.
  - `TextureSource.defaultOptions.scaleMode === 'nearest'`, `antialias === false`, canvas CSS `image-rendering: pixelated`를 검증하세요.
  - DPR > 1에서는 backing store 확대를 허용하되 CSS 표시 크기와 논리 좌표는 변하지 않아야 합니다. backing canvas가 항상 정확히 1280×800이라고 가정하지 마세요.
  - 기준 테스트: `tests/ui/presentation-foundation.test.ts`, `tests/ui/core-presentation.test.ts`. 실제 1280×800 브라우저 검증도 추가하세요.

- [ ] **조건부 5계층 카드 합성**
  - 경로: `src/ui/widgets/cardLayers.ts`, `cardLayout.ts`, `cardArtwork.ts`, `cardFan.ts`, `cardDetailModal.ts`.
  - z-order는 `base=0`, `illust=1`, `stamp=2`, `post=3`, `evidence=4`; 경계는 base 640×725, illust 256×256, stamp 192×192, post 640×725, evidence 128×128입니다.
  - base/illust는 상시, stamp/post/evidence는 attachment가 있을 때만 생성됩니다. evidence는 중복 없이 최대 3개이고 탈착 가능해야 합니다.
  - 팬 카드는 0.2배인 128×145 논리 크기이며 휴지 29px(20%), hover 58px(40%) 노출, hover 회전 0/z-index 100/청록 outline, 선택 황색 outline을 검증하세요.
  - modal은 전체 stage 입력을 차단하는 overlay입니다. 논리 `(160, 19)`의 320×362.5 카드가 HD 화면에서 640×725로 보여야 하며, 카드 내부 클릭은 유지되고 바깥 클릭만 닫아야 합니다.
  - 카드를 WHO/WHEN 등의 facet tag로 4px 이상 드래그할 때 점선 링크·대상 highlight가 실시간 표시되고, 유효 drop은 dock callback을 정확히 한 번 호출해야 합니다. `pointerupoutside`/cancel 뒤 잔류 상태가 없어야 합니다.
  - 기준 테스트: `tests/ui/cardLayering.test.ts`. 단위 테스트만으로 pointer UX를 대체하지 말고 브라우저 포인터 통합 테스트를 추가하세요.

- [ ] **용의자·파트너 상태 렌더링 (`src/ui/widgets/portrait.ts`)**
  - 512×512는 원본 PNG 규격입니다. 표시 크기는 용의자 216×216, 파트너 88×88 논리 픽셀입니다.
  - 용의자는 base 위에 upset/lose overlay를 동일 경계로 합성합니다. 기본/콘텐츠 지정 임계값 초과는 base, 0 초과이면서 임계값 이하는 upset, 평정심 0 또는 자백은 lose여야 합니다.
  - 파트너는 base/used 원본을 전환하고 used 동안 입력을 막고 중앙에 잔여 턴을 표시합니다. 0턴은 `{state:'base', cooldownTurns:0}`으로 정규화되어 다시 사용할 수 있어야 합니다.
  - 9개 심문 노드의 portrait key와 파트너 base/used key가 런타임 asset registry에 존재하는지 검증하세요.
  - 기준 테스트: `tests/engine/suspectStateParts.test.ts`, `tests/engine/partnerCooldown.test.ts` 및 실제 widget 렌더 통합 테스트.

### 5️⃣ 에셋 워크벤치 & 한국어 i18n (Workbench & Localization)

- [ ] **16-slot Transform/Lock 계약**
  - 경로: `workbench/model.mts`, `workbench/main.mts`, `workbench/image-slot.mts`, `src/ui/core/assetManifest.ts`.
  - Tweak Mode에서 move, rotated-local-axis scale, rotate gizmo가 동작하고 pointer release 때 저장되어야 합니다. rotation은 radians `[0, 2π)`, scaleX/scaleY는 양수여야 합니다.
  - 잠금된 슬롯은 move/rotate/scale/reset/drag를 거부하되 PNG 교체는 의도대로 허용합니다.
  - localStorage의 `transforms[id]`/`locks[id]`와 export manifest의 `transform`/`isLocked`를 각각 round-trip 검증하세요.
  - malformed/구버전 저장은 알려진 필드만 정규화하거나 기본값으로 안전 복구해야 합니다.
  - `/workbench/`에서 실제 포인터로 Tweak → 이동/회전/크기 → 잠금 → 변경 차단 → 새로고침 유지 → 잠금 해제를 검증하세요.
  - 기준 테스트: `tests/ui/workbench-model.test.ts`; 브라우저 interaction 증거도 필수입니다.

- [ ] **한국어 문자열 무결성**
  - 실제 경로는 `src/app/i18n.ts`, `src/content-io/StringsRepository.ts`, `content/common/strings.ko.json`, `schemas/strings.schema.json`입니다. 존재하지 않는 `ko.json`을 가정하지 마세요.
  - `StringsSchema`, `locale === 'ko'`, bootstrap의 `installStrings()` 순서를 검증하세요.
  - `content/**/*.json`을 재귀 탐색하여 모든 `*_key`와 동적 node/objective/reward/evidence/resource/effect/facet key를 수집하고, 번역 누락·빈 문자열이 0인지 확인하세요.
  - STRIP/EVENT/INTERROGATION/REWARD/ENDING/HUD의 player-facing 모델에서 unresolved key와 기술 콘텐츠 ID 노출이 0이어야 합니다. dotted-key 정규식뿐 아니라 실제 콘텐츠 ID 집합도 denylist로 사용하세요.
  - `t()`가 fallback도 없을 때 진단용 raw key를 반환하는 설계 자체를 깨지 마세요. 문자열 설치 뒤 사용자 화면에 leak이 없는지를 검증하세요.
  - CP/DP/WHO/RETURN/FREE REVIEW 같은 의도된 UX 토큰은 명시적 allowlist로 관리하고, 그 외 개발자 토큰 노출을 실패로 처리하세요.
  - 기준 테스트: `tests/app/i18n.test.ts`, `tests/content/strings-coverage.test.ts`; autoplay의 `rawI18nKeysSeen`은 모든 scene type을 포함해야 합니다.

### 6️⃣ 무코드 콘텐츠·스키마 무결성 (Content Integrity)

- [ ] `node tools/validate/index.mjs`가 현재 checkout의 `content/**/*.json`을 전부 발견하는지 먼저 목록과 개수를 출력하세요. 현재 기준은 24개이지만 파일 증감 시 고정 숫자 때문에 누락되지 않아야 합니다.
- [ ] JSON syntax와 파일명뿐 아니라 `src/content-io/ToolContentValidator.ts`의 Zod/Tier-1 참조, `src/content-io/ContentSemanticValidator.ts`의 Tier-2 reachability·solvable path, Tier-3 guaranteed-set·AI 계약·비공개 정보 누출을 모두 검증하세요.
- [ ] `strings.ko.json`과 AI cache는 전용 schema로 검증하고, schema 미등록 JSON을 실패 처리하세요.
- [ ] `tests/schema/schema-export.test.ts`로 12개 checked-in JSON Schema와 Zod 원본의 byte-for-byte 동기화를 검증하세요.
- [ ] 콘텐츠 ID 하드코딩 방지, 에셋 참조·실제 파일 존재·원본 규격, palette 규칙까지 포함하세요.

---

## 3. 실행 절차 (Execution Protocol)

### Step A — Preflight와 감사 인벤토리

1. 환경 버전, `git status --short`, 현재 diff, 파일 목록, 테스트 목록, 콘텐츠 JSON 목록을 기록하세요.
2. 위 체크리스트의 각 항목을 `Requirement | Implementation | Existing Test | Missing Evidence | Status` 표로 만드세요.
3. 기존 테스트가 무엇을 실제로 증명하는지 assertion까지 읽으세요. 테스트 파일명이나 PASS 숫자만으로 기능을 추정하지 마세요.

### Step B — 베이스라인과 재현

1. 관련 focused test와 아래 전체 게이트를 수정 전에 실행해 baseline을 남기세요.
2. 의심 결함마다 최소 재현을 만들고 예상/실제 결과, seed, 상태 snapshot, stack을 ledger에 기록하세요.
3. 정적 분석으로 증명할 수 없는 PixiJS pointer, workbench, autoplay video는 실제 브라우저에서 검증하세요.

### Step C — 자동 수정

1. 근본 원인을 가장 작은 production-safe 변경으로 수정하세요.
2. 정상·경계·실패·재시도 경로의 회귀 테스트를 추가하세요.
3. 저장/제출처럼 상태를 바꾸는 경로는 실패 전후 snapshot과 idempotency를 검증하세요.
4. 한 결함을 고칠 때 content-driven architecture, 결정론, 정보 경계, DEV-only 경계를 훼손하지 마세요.

### Step D — 실브라우저 매트릭스

dev server가 출력한 실제 URL로 최소 다음을 실행하세요.

1. 1280×800/DPR 1: 일반 게임 화면의 integer scale, nearest, card hover/drag/modal, portrait/partner 상태.
2. `/workbench/`: 16 slot, transform, lock, reload round-trip.
3. `/?autoplay=true&mode=turbo&policy=best&seed=20260805`: 빠른 strict 15-node 보고서.
4. `/?autoplay=true&mode=video&policy=best&seed=20260805`: 실제 시네마틱 시간과 ending screenshot.
5. 각 실행의 console error, unhandled rejection, failed request, missing asset, raw i18n key를 0으로 확인하세요.

### Step E — 최종 자동 게이트

아래 명령을 `dungeon-dossier/`에서 실행하고 명령별 exit code와 결과를 보고하세요.

```bash
# 핵심 4대 게이트
corepack pnpm typecheck
corepack pnpm test
corepack pnpm content:validate
corepack pnpm build

# 확장 무결성 게이트
corepack pnpm lint
corepack pnpm arch
corepack pnpm schema:export
corepack pnpm palette:check
corepack pnpm simulate:full

# package.json이 정의한 통합 회귀 게이트
corepack pnpm check
```

`typecheck`는 `tsconfig.json`과 `tsconfig.node.json`을 모두 검사해야 합니다. 최종 보고서에는 “통과”만 쓰지 말고 실제 test file/test count, 콘텐츠 파일 count, build 결과를 적으세요.

---

## 4. 최종 합격 기준 (Definition of Done)

다음을 모두 만족할 때만 `FINAL VERDICT: PASS`를 선언하세요.

- 감사 인벤토리 100% 검토, UNKNOWN/BLOCKED 0
- 발견한 Critical/High/Medium/Low 결함의 수정 또는 명시적으로 승인된 예외 처리
- 관련 회귀 테스트와 전체 자동 게이트 모두 exit code 0
- canonical 15-node turbo 및 video 실브라우저 보고서 PASS
- video 실측 시간이 선언한 150초 acceptance 범위 안에 있고 ending screenshot 존재
- legal fuzz 실제 1,000+ 제출, unexpected throw/uncaught rejection 0
- adversarial fuzz의 허용 오류 분류·원자적 롤백·lockup 0
- console error, missing asset, unresolved player-facing i18n key, invariant failure 0
- 24개를 기준으로 현재 checkout에서 다시 센 모든 content JSON과 schema/semantic/reference/palette 검증 통과
- 기존 사용자 변경 보존, 무관한 변경 0

하나라도 충족하지 못하면 `FINAL VERDICT: NOT READY`로 보고하고, 남은 정확한 blocker와 다음 재현 명령을 제시하세요. 불완전한 결과를 “100%”로 표현하지 마세요.

---

## 5. 필수 최종 보고 형식 (Required Final Report)

1. **Verdict:** PASS 또는 NOT READY
2. **Scope inventory:** 6대 분야별 검토 수/PASS/FAIL/UNKNOWN
3. **Defect ledger:** ID, severity, reproduction, root cause, fix, regression evidence
4. **Changed files:** 파일별 변경 이유와 사용자 기존 변경 보존 여부
5. **Automated gates:** command, exit code, file/test/content count, duration
6. **Browser evidence:** actual URL, viewport/DPR, report fields, measured duration, screenshot path
7. **Residual risks:** 남은 위험, BLOCKED/UNKNOWN, 후속 조치
8. **Final diff review:** 범위 밖 변경·테스트 완화·debug artifact가 없음을 확인
````
