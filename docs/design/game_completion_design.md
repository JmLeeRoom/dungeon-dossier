# 🎮 던전 수사 조서 — 게임화 설계서 (Engine → Game)

| 항목 | 내용 |
|---|---|
| 버전 | v1.0 |
| 작성일 | 2026-08-03 |
| 대상 | `dungeon-dossier/` 저장소 (테스트 339개 green, 판정 엔진 완성 상태) |
| 목적 | "부품은 다 있는데 게임이 아닌" 상태를 해소하는 4개 작업의 설계 확정 |
| 상위 문서 | `던전수사조서_구현계획서_개발관점_v1.0_260802.md` (개발 정본) · `docs/phase/` (단계별 프롬프트) |

---

## 0. 현재 상태 진단 (설계의 출발점)

### 0.1 완성된 것

판정 엔진과 그 주변은 이미 규격대로 구현돼 있고 테스트로 고정돼 있다. 이 설계서는 **이것들을 새로 만들지 않는다.**

| 모듈 | 상태 | 제공 API |
|---|---|---|
| `engine/resolution` | 완성 (1,696줄) | `resolveArgument(input): Resolution` · `applyResolution(res, state, targetId, opts)` · `toResolutionClaim/Evidence/ProofRule` · `toResolverBalance` |
| `engine/encounter` | 완성 (2,319줄) | `transitionEncounter` · `EncounterStateMachine` · `evaluateOutcome` · `evaluateObjectives` · `hasSolvableRequiredObjectivePath` · `processEncounterTurnStart` · `drawCardsAtTurnStart` · `spendCommandPoints` · `runFlowTransition` · `evaluateModifierCondition` · `applyModifierEffects` |
| `engine/knowledge` | 완성 | `createKnowledgeState` · `createInitialClaimKnowledge` · `assertAxisTransition` · `assertClaimStateInvariants` |
| `engine/log` | 완성 | `appendJudgmentLog` · `serializeJudgmentLog` · `canonicalStringify` |
| `engine/rng` | 완성 | 시드 스트림 |
| `engine/run` | **FlagStore만** (161줄) | `createFlagStore` · `withFlag` · `applyFlagSetHooks` · `resolveFlagEffects` |
| `content-io` | 완성 | `CaseRepository.load(dir)` · `BalanceRepository` · `CardRepository` · `FallbackRepository` · `SchemaValidator` (T1~T3) |
| `dto` | 완성 | `toPublicDTO({knowledge, resources, objectives})` · `hasForbiddenPublicKey` |
| `ai` | 완성 | Provider 체인 · `OutputValidator` 7단계 · 캐시 · 폴백 |
| `ui/core`, `ui/widgets` | 완성 | 640×400 정수 스케일 · 위젯 8종 |

### 0.2 비어 있는 것

| # | 갭 | 증거 |
|---|---|---|
| 1 | **Coordinator 부재** | `resolveArgument`·`EncounterStateMachine`을 참조하는 파일이 자기 자신·배럴·`dev/qa/fixtureReplay.ts`뿐. `src/app/`·`src/ui/` 어디서도 판정 엔진을 호출하지 않음 |
| 2 | **콘텐츠 부재** | `case.json`이 entity 1·claim 1·evidence 1·proof_rule 1·encounter 1. `inquiry_routes`·`events_noncombat`·`flag_hooks` 빈 배열. ep001·ep004는 `.gitkeep` |
| 3 | **런 레이어 부재** | `engine/run/`에 FlagStore만. 15노드·보상·등급·엔딩 없음 |
| 4 | **화면 4종 부재** | strip·event·reward·ending이 `.gitkeep` |

### 0.3 이 설계가 지켜야 할 기존 제약

1. **계층 의존성** — `engine/encounter ← domain, knowledge, resolution, cards`. 엔진은 `content-io`·`ui`·`ai`를 참조하지 않는다.
2. **엔진 금지 API** — `pixi.js`·`howler`·`window`·`document`·`fetch`·`Date.now`·`Math.random`.
3. **R-6** — `src/engine/**`에 `case_|clm_|ev_|ent_|enc_` 리터럴 0건.
4. **상태 변경 지점 2곳** — `ResolutionEffectApplier`, `ModifierSystem`. 신규 모듈이 세 번째 변경 지점이 되어선 안 된다.
5. **화이트리스트 DTO** — UI로 나가는 경로는 `toPublicDTO` 하나.

---

## 1. Part 1 — EncounterCoordinator (최우선)

### 1.1 왜 이것이 먼저인가

나머지 셋이 전부 이것에 막혀 있다. 콘텐츠는 coordinator가 요구하는 필드 모양이 확정돼야 대량 작성할 수 있고, 런 레이어는 "전투 1개가 끝나는 것"을 전제로 하며, 화면 4종은 coordinator가 내보내는 상태를 그린다.

또한 현재 27셀 시뮬레이터가 합성 아키타입(`SLIME`, `HARPY`…)으로 도는 이유도 coordinator가 없어서다. Coordinator를 헤드리스로 만들면 **시뮬레이터가 실제 사건 데이터를 돌릴 수 있게 되어** 게이트의 의미가 살아난다. 이것이 아래 §1.2의 배치 결정 근거다.

### 1.2 배치와 계층

```
src/engine/encounter/EncounterCoordinator.ts   ← 신규. 헤드리스. I/O 없음
src/app/createEncounterSession.ts              ← 신규. 배선(Repository·AI·UI 연결)
```

Coordinator를 `engine/`에 두는 이유: Node에서 렌더러 없이 그대로 구동해야 시뮬레이터가 실데이터를 쓸 수 있다. `CaseDefinition` 타입은 `engine/domain/schemas/case.ts`가 소유하므로(= `content-io`는 재export일 뿐) **coordinator가 content-io를 import하지 않고도 사건 정의를 받을 수 있다.** 로딩은 `app/`이 하고 coordinator는 이미 검증된 객체를 주입받는다.

### 1.3 책임 경계

| 한다 | 하지 않는다 |
|---|---|
| 전투 1회의 가변 상태 소유 | 파일 로드 (`app/`이 함) |
| 상태 머신 dispatch 순서 구동 | 판정 규칙 (`resolveArgument`가 함) |
| `ResolutionInput` 조립 | 상태 변경 로직 (`applyResolution`이 함) |
| ProofRule 선택 | 대사 생성 (`ai/`가 함) |
| `PublicDTO` 투영 | 그리기 (`ui/`가 함) |
| JudgmentLog 기록 | 노드 진행 (Part 3 런 레이어가 함) |

### 1.4 상태 소유 모델

```ts
export interface EncounterRuntimeState {
  readonly machine: EncounterMachineSnapshot;
  readonly resources: EncounterResourceState;        // 정본 (turn·stress·cp·composure·coercion)
  readonly claims: Readonly<Record<ContentId, AppliedClaimState>>;
  readonly evidence: Readonly<Record<ContentId, EvidenceRuntime>>;  // acquired·grade·integrity
  readonly deck: DeckState;
  readonly flowNodeId: ContentId | null;
  readonly modifierActivations: Readonly<Record<ContentId, number>>;
  readonly durations: TurnDurationMap;
  readonly revealedIds: readonly ContentId[];
  readonly log: JudgmentLog;
  readonly outcome: EncounterOutcome | null;
}
```

**⚠️ 자원 이중 소유 주의** — `ResolutionRuntimeState.resources`는 `{composure, coercion, commandPoints}` 3필드이고 `EncounterResourceState`는 `turn`·`stress`까지 갖는다. 둘을 각각 들고 있으면 반드시 어긋난다.

규칙: **`EncounterResourceState`가 정본.** `applyResolution` 호출 직전에 3필드 뷰를 투영해 넘기고, 반환된 값을 정본에 병합한다. 병합은 한 함수(`mergeResolutionResources`)에서만 수행한다.

### 1.5 핵심 API

```ts
export interface EncounterCoordinatorDeps {
  readonly caseDefinition: CaseDefinition;
  readonly encounterId: ContentId;
  readonly cards: readonly CardDefinition[];
  readonly balance: BalanceDefinition;
  readonly rng: SeededRng;
  readonly validationMode?: ContentValidationMode;
}

export interface SubmissionRequest {
  readonly cardId: ContentId;
  readonly targetClaimId?: ContentId;
  readonly evidenceIds: readonly ContentId[];
}

export interface SubmissionResult {
  readonly resolution: Resolution;
  readonly outcome: OutcomeEvaluation;
  readonly reactionKey: string;
  readonly missingScopes: readonly ProofScope[];
  readonly dto: PublicDTO;
}

export class EncounterCoordinator {
  static begin(deps: EncounterCoordinatorDeps): EncounterCoordinator;

  get snapshot(): EncounterRuntimeState;
  get dto(): PublicDTO;
  review(): FreeReviewQueries;               // FREE_REVIEW 상태에서만 (기존 가드 재사용)
  beginArgument(): void;                     // FREE_REVIEW → BUILD_ARGUMENT
  submit(request: SubmissionRequest): SubmissionResult;
  secureStatement(): OutcomeEvaluation;      // [진술 확보] 명시적 선택
  endTurn(): OutcomeEvaluation;
}
```

### 1.6 제출 1회의 처리 시퀀스

`submit()` 내부 순서. 각 단계가 기존 모듈 호출이며 새 규칙을 만들지 않는다.

| # | 동작 | 사용 API |
|---|---|---|
| 1 | 상태 머신 `ARGUMENT_BUILT` → `ACTION_SUBMITTED` dispatch | `machine.dispatch` |
| 2 | 카드 CP 비용 차감 (부족하면 제출 거부, 상태 불변) | `spendCommandPoints` |
| 3 | 대상 Claim·증거·ProofRule을 resolver 뷰로 변환 | `toResolutionClaim` · `toResolutionEvidence` · `toResolutionProofRule` |
| 4 | ProofRule 선택 (§1.7) | — |
| 5 | Procedure 결정 (FlowNode·modifier가 주입한 값, 기본 `FAIR`) | `evaluateModifierCondition` |
| 6 | `ResolutionInput` 조립 → 판정 | `resolveArgument` |
| 7 | `RESOLUTION_READY` dispatch → 효과 적용 | `applyResolution` |
| 8 | 자원 병합 (§1.4) + 카드 hand→discard 이동 | `mergeResolutionResources` |
| 9 | `EFFECTS_APPLIED` → 리액션 → `RUN_MODIFIERS` → 기믹 적용 | `applyModifierEffects` |
| 10 | 페이즈 전이 → 목표 → 종료 판정 | `runFlowTransition` · `evaluateObjectives` · `evaluateOutcome` |
| 11 | JudgmentLog 기록 (연출·Provider 메타 제외) | `appendJudgmentLog` |

**CP 미소비 예외** — `R_ACTION_INVALID`는 2번에서 차감한 CP를 되돌린다. 정본 §5.1 1단계가 "INVALID면 즉시 종료, CP 미소비"이므로, 차감을 판정 뒤로 미루지 말고 **롤백**으로 처리한다(카드 선택 시점에 이미 CP 표시가 바뀌어야 UI가 자연스럽기 때문).

### 1.7 ProofRule 선택 규칙

```
후보 = case.proof_rules.filter(r =>
          r.target_claim_id === targetClaimId &&
          r.direction === (intent === 'CONFIRM' ? 'SUPPORT' : 'CONTRADICT'))

후보 0개  → R_ACTION_INVALID(reason: 'MISSING_PROOF_RULE')
후보 1개  → 그것
후보 2개+ → 정의 배열 순서상 첫 번째 (결정론 — 해시 순회·정렬 금지)
```

`MISSING_PROOF_RULE`은 이미 `InvalidReason`에 존재하므로 타입 추가가 없다. 후보가 여럿인 상황은 콘텐츠 설계상 드물지만, **조용한 임의 선택 대신 정의 순서라는 명시 규칙**을 둬야 리플레이가 재현된다.

### 1.8 PublicDTO 투영

`toPublicDTO`는 `KnowledgeState`를 받는다. Coordinator의 내부 상태는 `AppliedClaimState` 레코드이므로 투영 어댑터가 필요하다.

```ts
function toKnowledgeState(state: EncounterRuntimeState, def: CaseDefinition): KnowledgeState
```

- `claims`: `def.claims` 정의 순서로 순회하며 런타임 축 3종·resistance·isRequired 결합. **`presentation === 'HIDDEN'`인 Claim은 배열에서 제외**(미공개 진술이 DTO에 실려 나가면 누설).
- `evidence`: `acquired === true`만. `grade`는 런타임 값(파쇄로 A→B 하락 반영).
- `objectives`: `evaluateObjectives` 결과의 label·completed만.

투영 직후 `hasForbiddenPublicKey(dto) === false`를 개발 빌드 assert로 건다.

### 1.9 기존 픽스처 교체

[`createPhase2Preview.ts`](../../dungeon-dossier/src/app/createPhase2Preview.ts)는 주석에 "Phase 4 replaces this adapter with the encounter coordinator"라고 이미 적혀 있다. 교체는 다음 순서로 한다.

1. `createEncounterSession.ts` 신설 — `CaseRepository.load('tutorial')` → `BalanceRepository.reload()` → `CardRepository` → `EncounterCoordinator.begin()`.
2. `bootstrap.ts`의 `preview` 참조를 세션으로 교체. `currentModel()`이 `session.coordinator.dto`를 읽도록 변경.
3. `onSubmit` 콜백이 `coordinator.submit()`을 호출하고, 그 결과의 `reactionKey`·`missingScopes`로 AI/폴백 대사를 요청하도록 변경. **현재는 대사만 렌더링하고 판정이 없다 — 이 한 줄이 "엔진 느낌"의 정체다.**
4. `createPhase2Preview.ts` 삭제. 관련 테스트는 coordinator 테스트로 대체.

`InterrogationScreenModel`은 그대로 둔다. `dto` 필드가 그대로 살아 있고 나머지는 라벨·한계치·입력 가능 여부라, 화면 코드를 고칠 필요가 없다.

### 1.10 부수 구현 항목

Coordinator를 만들면서 함께 채워야 하는 작은 공백:

- **덱 초기 배분·카드 사용** — `drawCardsAtTurnStart`는 있으나 초기 5장 배분과 hand→discard 이동이 없다. `engine/cards/DeckOperations.ts`에 `dealInitialHand`·`playCard`·`discardHand` 추가.
- **CardModifier** — 도장(파랑/빨강)·포스트잇·클립이 `CardDefinition`에 없다. P1 범위이므로 `cardModifier?: {stamp, postit, clip}` 선택 필드로 열어두고 M3에서 채운다.
- **`judgment-ui-map.json`** — 스키마는 있으나 콘텐츠 파일이 없다. `missingScopes` 한국어 번역과 판정 코드 4종 표기가 여기서 나온다. Part 2와 함께 작성.

### 1.11 검증 게이트

| 게이트 | 방법 |
|---|---|
| G-C1 | 튜토리얼 전투 1개가 coordinator로 BEST까지 완주 (헤드리스 테스트) |
| G-C2 | 같은 시드·입력 2회 → `serializeJudgmentLog` 바이트 동일 |
| G-C3 | 전 제출 경로에서 `hasForbiddenPublicKey(dto) === false` |
| G-C4 | 27셀 시뮬레이터를 **실제 사건 데이터**로 재겨냥 (합성 아키타입 제거) |
| G-C5 | `tests/arch/no-hardcoded-content-ids` 여전히 green |

---

## 2. Part 2 — 콘텐츠 (사건 데이터)

### 2.1 원칙

**엔진 수정 0건.** 이 파트에서 `src/engine/`을 한 줄이라도 고쳐야 한다면 그건 콘텐츠 문제가 아니라 스키마 설계 실패이고, Part 1로 되돌아가야 한다는 신호다. M3 게이트가 이것을 git diff로 측정한다.

### 2.2 "완결된 전투 1개"의 최소 정의

스키마에서 역산한 체크리스트. **이 목록이 채워지지 않은 전투는 플레이 불가**이며, 지금의 튜토리얼 case.json은 여기서 대부분 미달이다.

| # | 항목 | 최소 수량 | 근거 |
|---|---|---|---|
| 1 | `entities` | 용의자 1 + 참조되는 인물·장소·물건 | Claim·Observation의 참조 대상 |
| 2 | `events` | Truth Seed 구조화 — 실제 일어난 일 | `truth.contradicting_events` 참조 |
| 3 | `claims` | **6 (육하원칙 태그별 1)** | 태그 보드가 6칩 고정 |
| 4 | `evidence` | 4~6 | 필수 Claim 3개 × 보장 조합 + 함정 1 |
| 5 | `proof_rules` | 필수 Claim 수만큼 | 없으면 `MISSING_PROOF_RULE`로 제출 불가 |
| 6 | `inquiry_routes` | 2~3 | QUERY 카드의 대상. **현재 0개 = 질문 카드가 무효** |
| 7 | `encounters[].rounds` | 1~3 | 각 라운드 `statement_claims` ≥ 1 |
| 8 | `encounters[].objectives.required` | ≥ 1 | 스키마 강제 |
| 9 | `encounters[].outcomes` | ≥ 1, BEST 필수 | 스키마 강제 |
| 10 | `dialogue.statements` | 전 Claim에 폴백 ≥ 1 | 검증 A-6 |
| 11 | `dialogue.reactions` | 전 ReactionKey에 폴백 ≥ 1 | 검증 A-6 |

### 2.3 함정 교보재의 데이터 표현

튜토리얼의 교육 목적(= QA1)은 **"태그는 맞지만 범위가 모자란 제출"**을 체험시키는 것이다. 이건 우연히 만들어지지 않고 명시 등록해야 한다.

```jsonc
"known_insufficient_sets": [ ["ev_tutorial_receipt"] ],   // 함정: 시간대 미포섭
"guaranteed_evidence_sets": [ ["ev_tutorial_roster"] ],   // 정답 조합
"partial_credit": { "scopes_covered_ratio": 0.5, "result": "SUSPECTED" }
```

### 2.4 작성 순서와 물량

| 단계 | 산출 | 비고 |
|---|---|---|
| C-1 | **튜토리얼 전투 1개 완결** (§2.2 체크리스트 전항) | Part 1과 짝을 이루는 수직 슬라이스. 여기서 스키마 미비가 전부 드러난다 |
| C-2 | 공통 데이터 6종 | `judgment-ui-map.json` · `flags.json` · `rewards.json` · `grades.json` · `relics.json` · `enhancements.json` — **스키마는 이미 있고 콘텐츠 파일만 없다** |
| C-3 | 튜토리얼 잔여 전투 2 + 이벤트 씬 | 5노드 완결 |
| C-4 | EP001 3전투 · EP004 3전투 | 전투 9개 / 15노드 완성 |
| C-5 | 폴백 대사 260~410문장 | **전투당 1파일로 분할** — 사건당 1파일은 작성 부하가 몰린다 |

대사가 물량의 대부분이다. AI를 제작 도구로 써서 초안을 뽑고 Truth Seed 핵심 문장·판정 문구만 수기 검수하는 방식이 정본 권고다.

### 2.5 검증 파이프라인 (이미 존재)

작성 즉시 다음이 돈다. 새로 만들 것 없음.

- `pnpm content:validate` — T1(스키마·참조 무결성·잠금 해제 수단) → T2(ProofRule 존재·증거 획득 경로·도달 가능성·파쇄 후 해결 경로 생존·무순환) → T3
- 개발자 콘솔 Content 패널이 같은 규칙을 실시간으로 표시 (`dev/content/liveValidation.ts`)

---

## 3. Part 3 — 런 레이어 (15노드)

### 3.1 신규 모듈

전부 `src/engine/run/` 아래. 순수 함수 + 결정론 유지.

| 모듈 | 책임 | 입력 → 출력 |
|---|---|---|
| `RunState.ts` | 런 전체 상태(노드 위치·스트레스·DP·신뢰도·덱·유물·플래그·`run_seed`) | — |
| `NodeStrip.ts` | 15노드 선형 배열 정의와 진행 | `RunState` → `NodeDefinition` |
| `RewardSystem.ts` | 전투 후 3택1 / 보스 후 2택 결정론 추첨 | `(rewards.json, rarity, episode, seedStream)` → `Reward[3]` |
| `GradeEvaluator.ts` | 사건 등급 S~F | `(grades.json, 해결률·스위트스팟·원본보존·강압·허위자백)` → `Grade` |
| `EndingEvaluator.ts` | F-13 트루/노멀/배드 | `(FlagStore, 조합식)` → `EndingId` |

### 3.2 노드 정의

분기 없는 15노드 선형이므로 그래프 자료구조가 필요 없다. **배열 + 인덱스**로 충분하고, 그게 결정론에도 유리하다.

```ts
type NodeKind = 'ENCOUNTER' | 'EVENT' | 'BOSS';
interface NodeDefinition {
  readonly nodeId: ContentId;
  readonly kind: NodeKind;
  readonly ref: ContentId;        // encounter_id 또는 event_id
  readonly caseDirectory: string;
}
```

노드 목록 자체는 코드가 아니라 **데이터**(`content/common/run-strip.json` 신설)여야 R-6을 지킨다. 스키마를 함께 추가한다.

### 3.3 전투 종료 → 다음 노드 인계

Coordinator가 `EncounterOutcome`을 내면 런 레이어가 받는다.

```
EncounterOutcome
  → applyFlagSetHooks(flags.json의 set_by)     // 이미 구현됨
  → RewardSystem (BEST/PARTIAL만)
  → GradeEvaluator 입력 누적
  → RunState.advance()
  → 자동 저장 (SaveRepository — 이미 구현됨)
```

`FlagStore`·`SaveRepository`·`resolveFlagEffects`는 이미 있으므로 **연결만** 하면 된다. 다음 전투 로드 시 `consumed_by` 훅을 적용하는 지점이 coordinator의 `begin()`이다(예: 허위 자백 → 보스 방어막 +1).

### 3.4 범위 경고

전투 중 저장은 **미지원**이 정본 결정이다(전투 6~16턴이므로 노드 단위 저장으로 충분). `encounter_snapshot: null`을 유지하고 여기에 시간을 쓰지 않는다.

---

## 4. Part 4 — 화면 4종

### 4.1 우선순위와 범위

| 화면 | P | 최소 범위 | 비고 |
|---|---|---|---|
| 진행 스트립 | **P0** | 15노드 아이콘 3종 + 클리어 도장 + 현재 위치 | 노드 간 이동의 유일한 UI. **런 레이어와 동시에 필요** |
| 보상·정산 | P1 | 3택1 서류철 프레임 + 등급 도장 S~F | 전투 후 흐름 완결 |
| 이벤트 씬 | P1 | 액자 프레임 + **패턴 A/B/C 컴포넌트** | 컷 시 B·C→A 강등이 데이터 교체만으로 되어야 함 |
| 엔딩 | P3 | 컷 + 스크립트 | 컷 1순위 |

### 4.2 이벤트 씬의 3패턴

이벤트 6종을 개별 화면으로 만들면 안 된다. UI 3패턴 × 데이터로 정규화한다.

| 패턴 | 데이터 구조 | 사용처 |
|---|---|---|
| A 선택형 | `choices[]: {costs, gains, sets_flags}` | T-02 쓰레기통, E4-04 티켓 거래 |
| B 연결·배치형 | `items[] + slots[] + answer_mapping + partial_scoring` | T-04 시간순 배치, E1-02 모순 연결 |
| C 제한 조사형 | `spots[] + attempt_limit + per_attempt_costs` | E1-02 창고 2회, E4-02 기계실 3회 |

### 4.3 공통 규약

- 신규 화면도 입력 타입은 **`PublicDTO` 또는 프레젠테이션 전용 모델**뿐. `engine` 직접 import는 dependency-cruiser 위반.
- `sceneManager.setScene({view, onDestroy})` 계약을 그대로 따른다.
- 애셋 누락 시 `resolveAsset` 폴백으로 플레이스홀더가 뜨고 빌드는 통과한다 — 화면 구현이 애셋 완성을 기다리지 않는다.

---

## 5. 구현 순서 (수직 슬라이스 우선)

콘텐츠를 먼저 대량 작성하면 coordinator가 요구하는 필드 모양이 확정되지 않은 채 쌓여 재작업이 난다. **항상 얇은 수직 슬라이스를 먼저 관통시킨다.**

| 순서 | 작업 | 완료 판정 |
|---|---|---|
| **S1** | Coordinator + 튜토리얼 전투 1개 완결 (Part 1 + C-1) | **카드를 내면 실제 판정이 돌고 평정심이 깎이며 BEST로 끝난다.** 이 프로젝트 최초의 "게임" |
| **S2** | 공통 데이터 6종 + 런 레이어 최소 + 진행 스트립 (C-2 + Part 3 + 스트립) | 전투 → 스트립 → 다음 노드 이동 |
| **S3** | 보상·정산 화면 + 등급 (Part 4 P1) | 전투 후 3택1 → 등급 도장 |
| **S4** | 튜토리얼 5노드 완결 + 이벤트 3패턴 (C-3) | 튜토리얼 완주, 3분기 각 1회 |
| **S5** | EP001·EP004 (C-4·C-5) | **15노드 완주 + git diff 게이트** |
| **S6** | 엔딩·폴리싱·밸런싱 | 릴리스 |

S1 완료 시점에 27셀 시뮬레이터를 실데이터로 재겨냥(G-C4)하면, S4~S5의 콘텐츠 작성이 자동 회귀 보호를 받으며 진행된다.

---

## 6. 리스크

| # | 리스크 | 신호 | 대응 |
|---|---|---|---|
| R-1 | 자원 이중 소유로 상태 불일치 | 리플레이 diff 발생 | §1.4 단일 병합 함수 강제 + G-C2 상시 |
| R-2 | 콘텐츠 작성 중 엔진 수정 유혹 | `src/engine/` diff 발생 | M3 git diff 게이트. 수정이 필요하면 스키마 설계 재검토 신호로 취급 |
| R-3 | 대사 260~410문장 물량 | S5 지연 | 전투당 파일 분할 + AI 초안·수기 검수 |
| R-4 | 이벤트 3패턴이 6개 개별 화면으로 번짐 | 화면 코드 중복 | 패턴 컴포넌트 3개 외 신규 화면 금지. 컷 시 A 강등이 데이터 교체로 되는지 S4에서 확인 |
| R-5 | 런 레이어가 세 번째 상태 변경 지점이 됨 | 불변식 assert 실패 | 런 상태와 전투 상태를 분리. 전투 중 런 상태 변경 금지 |

---

## 변경 기록

| 버전 | 일자 | 내용 |
|---|---|---|
| v1.0 | 2026-08-03 | 최초 작성 — 실제 코드(테스트 339 green) 대조 후 4개 갭의 설계 확정. Coordinator를 `engine/`에 배치해 시뮬레이터 실데이터화를 함께 해결하는 결정 포함 |
