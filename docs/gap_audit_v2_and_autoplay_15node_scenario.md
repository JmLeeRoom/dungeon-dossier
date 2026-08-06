# 🔬 던전 수사 조서 — 전수 갭 감사 v2 & 15노드 자동 플레이 시나리오 설계서

| 항목 | 내용 |
|---|---|
| 버전 | v2.0 |
| 작성일 | 2026-08-05 |
| 대상 | `dungeon-dossier/` 코드베이스 (28,547줄 TS) vs `docs/` 정본 명세 |
| 선행 문서 | `docs/gap_analysis_and_completion_roadmap.md` (v1.0, 2026-08-04) — **폐기 대상. 아래 §0.2 참조** |
| 목적 | ① 실제로 미구현·미배선인 지점을 코드 근거와 함께 전수 확정 ② 웹에서 15노드를 무인 완주시키는 자동 플레이 하네스 설계 확정 |

---

## 0. 요약 (Executive Summary)

### 0.1 한 문장 결론

> **엔진과 런 레이어는 "정답 수순"으로는 이미 15노드를 완주할 수 있다. 실제로 완주시켜 봤고 성공했다.**
> **그러나 사람이 브라우저에서 실제로 플레이하면 ①정답이 아닌 수를 두는 순간 전투가 영구 정지하고,
> ②그걸 피해도 3~5번째 노드에서 보상 화면이 영구 정지한다.**
> 남은 일은 대부분 "기능 구현"이 아니라 **① 확정 BLOCKER 4건 수정 ② 문자열 테이블(i18n) 신설
> ③ 자동 플레이 드라이버 신설**이다.

**이 프로젝트의 진짜 문제는 "미구현"이 아니라 "미배선(UNWIRED)"이다.**
잘 만들고 테스트까지 통과한 모듈이 실런타임 경로에 연결되지 않았거나, 데이터 한 줄이 비어서
기능 전체가 죽어 있는 경우가 지배적이다. (예: `balance.json`의 `partner.cooldowns: {}` 한 줄 때문에
파트너 스킬 기능 전체가 영구 비활성)

### 0.2 선행 갭 문서가 폐기되어야 하는 이유

`docs/gap_analysis_and_completion_roadmap.md`(v1.0)가 "미구현"으로 지목한 18개 갭 중
**Category B(런 레이어 4건)와 Category C(UI 화면 4건)는 이미 전부 구현되어 런타임에 배선돼 있다.**
Category A(콘텐츠)도 `.gitkeep`이 아니라 3개 사건 전부 44~50KB 규모로 저작되어 있다.
그 문서를 기준으로 작업을 발주하면 **이미 있는 것을 다시 만들게 된다.** 본 문서가 v1.0을 대체한다.

| v1.0의 주장 | 실제 (2026-08-05 확인) |
|---|---|
| B-1 `RunCoordinator.ts` 부재 | 이름은 없으나 역할은 `RunSession`(createRunSession.ts:50) + bootstrap 클로저 4개가 수행. **15노드 진행 정상 동작** |
| B-2/B-3/B-4 보상·등급·엔딩 미연동 | `RewardSystem`·`GradeEvaluator`·`EndingEvaluator` 전부 실런타임 경로에 연결됨 |
| C-1~C-4 화면 4종 "껍데기" | 4종 전부 실제 렌더링·입력 처리 동작. 단 연출 수준은 최소 (→ §2.3) |
| A-1/A-2 ep001·ep004 "기본 구조만" | 각각 50KB/48KB, claim 18·evidence 8·encounter 3·route 6·event 2 저작 완료 |
| D-1 포트레이트 3종만 존재 | 12종 세트(49개 PNG) 존재. 단 전부 플레이스홀더 아트 (→ ASSET 항목) |

### 0.3 실측 베이스라인 (2026-08-05)

| 검사 | 명령 | 결과 |
|---|---|---|
| 타입 | `npx tsc --noEmit -p tsconfig.json` | ✅ exit 0 |
| 테스트 | `npx vitest run` | ✅ **69 files / 473 tests 전부 통과** |
| 콘텐츠 검증 | `node tools/validate/index.mjs` | ✅ 23 JSON 통과 |
| 빌드 | `npx vite build` | ✅ 성공 (game + assetWorkbench) |

**즉 "테스트가 다 통과하는데 게임은 3노드에서 멈춘다."**
이것이 이 프로젝트의 핵심 문제이며, §3의 자동 플레이 하네스가 정확히 이 사각지대를 메운다.

### 0.4 갭 집계

| 영역 | BLOCKER | MAJOR | MINOR/COSMETIC | 계 |
|---|---|---|---|---|
| 심문 엔진 코어 (§2.0) | 1 | 10 | 3 | 14 |
| 미배선 데이터/기능 (§2.1) | — | 5 | 2 | 7 |
| 콘텐츠 결함 (§2.2) | — | 2 | 6 | 8 |
| UI·연출 (§2.3) | — | 3 | 8 | 11 |
| 애셋·오디오 (§2.4) | — | 2 | 5 | 7 |
| 개발도구·테스트 (§2.5) | — | 7 | 10 | 17 |
| 런 설계 (§2.6) | — | 6 | 5 | 11 |
| **합계** | **4** (중복 계상 제외) | **35** | **39** | **75** |

**15노드 완주를 막는 것은 4건뿐이다.** 나머지 71건은 완주는 되지만 게임의 질을 떨어뜨리는 항목이다.

---

## 1. 🔴 15노드 완주를 막는 확정 BLOCKER (실행으로 검증 완료)

아래 4건은 추정이 아니라 **직접 코드를 읽고 실행해 재현을 확인**했다.

| # | 제목 | 증상 | 수정 난이도 |
|---|---|---|---|
| **BLK-0** | 판정표 조합 78/432개 누락 → 예외 + 전투 영구 정지 | 특정 수를 두면 용의자가 영어 에러를 말하고 이후 모든 제출 거부 | 중 (표 보강 + 예외 안전) |
| **BLK-1** | 같은 보상 2회 획득 시 세이브 검증 실패 → 영구 정지 | 보상 카드를 눌러도 아무 일도 안 일어남 | 하 (1줄) |
| **BLK-2** | 문자열 테이블 부재 → 화면에 개발자 키 원문 노출 | EVENT 6노드가 통째로 판독 불가 | 중 (약 150키 저작) |
| **BLK-3** | 런 흐름 예외가 플레이어에게 전혀 표시되지 않음 | 위 3건이 전부 "무반응"으로 보이는 이유 | 하 (에러 배너) |

### BLK-0. 판정표에 조합 78개가 비어 있어 전투가 영구 정지 — **게임성 최우선**

**증상**: 플레이어가 "정답이 아닌, 그러나 자연스러운 수"(부분적으로만 관련된 증거를 붙임)를 두면
용의자 대사창에 `Undefined resolution combination: CONTRADICT/PARTIAL/NEUTRAL/...` 라는
**영문 예외 메시지가 진술처럼 표시**되고, 이후 그 전투에서는 무엇을 제출해도
`Submission requires BUILD_ARGUMENT state.` 만 반복된다. 전투를 끝낼 방법이 없다.

**원인 1 — 판정표 구멍** (`src/engine/resolution/resolutionTable.ts:198-216`)

`lookupResolutionTableRow`는 매칭 행이 없으면 `throw`한다. 전 조합을 열거해 본 실측 결과:

```
TOTAL=432  MISSING=78 (18%)
누락 조합 (intent/relevance/relation/sufficiency):
  CONTRADICT/PARTIAL/NEUTRAL/{SUFFICIENT, PROVISIONAL, INSUFFICIENT}
  CONTRADICT/PARTIAL/AMBIGUOUS/{SUFFICIENT, PROVISIONAL}
  CONFIRM/PARTIAL/NEUTRAL/{SUFFICIENT, PROVISIONAL, INSUFFICIENT}
  CONFIRM/PARTIAL/AMBIGUOUS/{SUFFICIENT, PROVISIONAL}
  CONFIRM/PARTIAL/CONTRADICTS/{SUFFICIENT, PROVISIONAL}
  CONFIRM/PARTIAL/SUPPORTS/{SUFFICIENT}
```

**구멍이 전부 `relevance: PARTIAL`에 몰려 있다.** `FULL`과 `NONE`은 완전하다.
`PARTIAL`은 "증거 범위가 주장을 일부만 덮는" 흔한 상황이므로 실플레이에서 매우 도달하기 쉽다.

**원인 2 — 예외 시 상태머신 미복구** (`src/engine/encounter/EncounterCoordinator.ts:555-556`)

```ts
this.#dispatch('ARGUMENT_BUILT');
this.#dispatch('ACTION_SUBMITTED');   // ← 여기서 이미 RESOLVE로 전이
...                                    // ← resolveArgument()가 여기서 throw
```

상태 전이가 판정 **이전에** 일어나고 `try/catch`나 롤백이 없다. 예외가 나면 머신은 `RESOLVE`에 갇히고,
`submit()`은 첫 줄에서 `BUILD_ARGUMENT`를 요구하므로(`:527-529`) **영구히 거부**한다.

**원인 3 — 예외가 연출로 위장됨**: `bootstrap.ts:766-770`이 이 예외를
`controller.useFallbackStatement(error.message)`로 삼켜 **용의자 대사처럼 표시**한다.

**왜 473개 테스트가 전부 통과했나**
`tests/judgment/resolution-table.test.ts`는 저작된 케이스만 검사하고 **전 조합 완전성을 검사하지 않는다.**
`tests/routes/smoke-best.test.ts`는 `proofPaths`(정답 수순)만 재생하므로 `PARTIAL` 경로에 들어가지 않는다.
**"오답을 두는 플레이어"를 재현하는 테스트가 하나도 없다.**

**수정 방향**
1. `RESOLUTION_TABLE`에 `PARTIAL` × `{NEUTRAL, AMBIGUOUS}` 행 보강 (대부분 `R_INSUFFICIENT_GROUNDS`가 타당)
2. 또는 `lookupResolutionTableRow`에 안전 기본값(`R_INSUFFICIENT_GROUNDS`) 도입 — throw 금지
3. `submit()`을 `try/catch`로 감싸 실패 시 `BUILD_ARGUMENT`로 롤백하고 CP도 환원
4. **회귀 테스트**: 432개 전 조합이 예외 없이 코드를 반환하는 완전성 테스트 (위 프로브 그대로 사용 가능)

### BLK-1. 같은 보상을 두 번 받으면 영구 소프트락

**증상**: 보상 화면에서 카드를 선택해도 아무 일도 일어나지 않는다. 화면이 바뀌지 않고,
에러 메시지도 없고, 다시 눌러도 같다. 게임을 진행할 방법이 없다.

**원인 (코드 경로)**

| 단계 | 위치 | 동작 |
|---|---|---|
| 1 | `src/engine/run/RunState.ts` `claimRunReward` | `claimedRewardIds: [...state.claimedRewardIds, reward.reward_id]` — **중복 제거 없이 append** |
| 2 | `src/app/createRunSession.ts:103` | `claimReward` → `#save()` 호출 |
| 3 | `src/engine/domain/schemas/save.ts:75` | `claimed_reward_ids: uniqueContentIds()` — **중복 금지** |
| 4 | Zod | `duplicate content reference: reward_trust` throw |
| 5 | `src/app/bootstrap.ts:391-402` | `catch` → `selected = false` → `handleFlowError` |
| 6 | `src/app/bootstrap.ts:309-313` | `mount.dataset.flowError` 기록 + `console.error`. **화면은 그대로** |

**왜 반드시 터지는가 (`content/common/rewards.json`)**

| 희소성 | 풀 크기 | 그 희소성을 뽑는 노드 | 결과 |
|---|---|---|---|
| COMMON | **3** | 튜토리얼 전투 **3개 전부(보스 포함)** | 3번째(보스)는 **2택만** 제공 → 남은 미획득 1장이 후보에 없으면 **강제 중복** |
| UNCOMMON | 4 | ep001 전투 2개 | 여유 있음 |
| RARE | 3 | ep004 전투 2개 | 여유 있음 |

`selectRewardChoices`는 풀 크기 == 선택 개수라 **매번 같은 3장이 순서만 바뀌어 나온다.**

**결정적 악화 요인**: 튜토리얼 보스(노드 5)는 `metadata.act`가 0이라
`rewardRarityForOutcome`(gameRunState.ts:126-133)의 `act >= 1` 분기에 걸리지 않아 **`CASE` 등급을 받지 못하고
이미 2장이 소진된 COMMON 풀에서 2장을 뽑는다.** 즉 노드 5에서의 중복은 사실상 강제된다.
"미획득 우선" 전략이 노드 5에서 실패한 실측 결과가 정확히 이 메커니즘이다.

**실측 (시드 6종, `saveRepository` 연결 상태)**

```
seed=20260805 → SOFT-LOCK at node 3  (claims: reward_trust, reward_trust)
seed=1        → SOFT-LOCK at node 3  (claims: reward_trust, reward_trust)
seed=7        → SOFT-LOCK at node 5  (reward_stress_recovery, reward_dp_small, reward_dp_small)
seed=42       → SOFT-LOCK at node 5
seed=999      → SOFT-LOCK at node 8  (reward_card_precise 중복)
seed=2026     → COMPLETED 15 nodes   ← 6개 중 유일하게 운 좋게 통과
```

**"이미 받은 것은 피한다" 전략으로도 막을 수 없다.** 같은 시드에서 미획득 우선 선택을 해도
node 5(보스, 2택)에서 두 후보가 모두 기획득이라 소프트락했다.

> **왜 기존 테스트 473개가 전부 통과했나**
> `tests/app/run-session.test.ts:90`의 15노드 테스트는 `saveRepository`를 **넘기지 않는다.**
> `RunSession.#save()`가 `repository === undefined`면 즉시 return하므로(createRunSession.ts:109)
> 저장 스키마 검증이 한 번도 실행되지 않는다. 브라우저에서는 항상 넘어간다(bootstrap.ts:208).

**수정 방향 (택1 또는 병행)**
1. `claimRunReward`에서 `appendUnique(state.claimedRewardIds, reward.reward_id)` 사용 — 최소 수정
2. `selectRewardChoices`가 `claimedRewardIds`를 제외하고 뽑도록 `eligibleReward`에 조건 추가
3. `rewards.json` 풀을 희소성별로 최소 (노드수 + 선택지수) 이상으로 증량
4. **회귀 테스트**: `tests/app/run-session.test.ts`의 15노드 테스트에 `saveRepository`를 반드시 연결

### BLK-2. 화면 텍스트가 전부 개발자용 i18n 키 원문

**증상**: 이벤트 화면 제목이 `event.tutorial.choice.title`, 선택지가 `event.tutorial.choice.search`,
본문이 `node_tutorial_choice`, 진행 스트립 노드명이 `enc_tutorial_slime`,
보상 이름이 `reward_trust`로 나온다. **15노드 중 EVENT 6개 노드는 통째로 판독 불가.**

**원인**: **문자열 테이블(i18n) 레이어가 저장소에 존재하지 않는다.**
`locale`/`i18n`/`strings*.json` 패턴 파일 0건. `src/app/gameFlowPresentation.ts`가 키를 그대로 라벨에 대입한다.

| 위치 | 코드 | 화면에 나오는 것 |
|---|---|---|
| `gameFlowPresentation.ts:46` | `label: node.ref` | `enc_tutorial_slime` |
| `gameFlowPresentation.ts:63` | `title: event.title_key` | `event.tutorial.choice.title` |
| `gameFlowPresentation.ts:64` | `description: event.node` | `node_tutorial_choice` ← **그래프 노드 ID를 본문으로 출력** |
| `gameFlowPresentation.ts:72` | `label: choice.label_key` | `event.tutorial.choice.search` |
| `gameFlowPresentation.ts:119,123` | `reward.reference_id ?? reward.reward_id` | `reward_trust` |
| `gameFlowPresentation.ts:22,28` | `record.type` / `` `${key} ${amount}` `` | `GRANT_EVIDENCE`, `dp 5` |

콘텐츠에 존재하는 `*_key` 필드는 3개 case.json 합계 약 **150개**
(`title_key` 29, `summary_key` 33, `label_key` 20, `display_name_key` 18, `slot_label_key` 18,
 `description_key` 8, `reaction_key` 12, `background_asset_key` 3).

**수정 방향**
1. `content/common/strings.ko.json` 신설 + `schemas/strings.schema.json`
2. `src/content-io/StringsRepository.ts` + `src/app/i18n.ts` (`t(key, fallback)`) 신설
3. `gameFlowPresentation.ts`의 모든 `*_key` 대입을 `t(...)`로 교체
4. `event.node`는 본문이 아니므로 **스키마에 `description_key` 필드를 추가**해야 한다 (콘텐츠 작업 동반)
5. **회귀 테스트**: 화면 모델에 `/^[a-z_]+\.[a-z_.]+$/` 패턴 문자열이 나오면 실패하는 테스트

### BLK-3. 런 흐름 예외가 플레이어에게 전혀 표시되지 않음

`handleFlowError`(bootstrap.ts:309-313)는 `mount.dataset.flowError`(DOM 데이터 속성)와
`console.error`에만 기록하고 **화면을 바꾸지 않는다.** BLK-1이 "아무 반응 없음"으로 보이는 것도 이 때문이다.

같은 문제가 이벤트 화면에도 있다 — 비용(DP/스트레스) 부족으로 `applyEventDefinition`이 throw하면
버튼이 그냥 먹통이 된다 (`event_ep004_ticket_trade`의 `buy_vip_ticket`은 DP 5 필요).

심문 화면에서는 예외가 `controller.useFallbackStatement(error.message)`로 **용의자 대사처럼 표시**되어
(bootstrap.ts:766-770) 실제 고장이 연출로 위장된다.

**수정 방향**: 에러 배너/모달 오버레이 1종 신설 + 재시도·스트립 복귀 버튼. 자동 플레이 하네스는
`mount.dataset.flowError` 감시로 이 상황을 즉시 실패 판정한다(§3.6).

---

## 2. 전수 갭 목록

> **표기**: `NOT_IMPL`=아예 없음 · `STUB`=있지만 실질 동작 없음 · `PARTIAL`=일부만 · `UNWIRED`=구현·테스트는
> 됐지만 실런타임 경로에서 도달 불가 · `BUG`=잘못 동작.
> **UNWIRED가 이 프로젝트의 지배적 갭 유형**이다 — 잘 만들고 테스트까지 했는데 게임에 연결되지 않은 것.

### 2.0 🟠 심문 엔진 코어 — 골격은 있고 바깥이 비어 있음

10단계 `resolveArgument`와 8단계 턴 순환의 **골격은 실제로 존재하고, CONTRADICT/CONFIRM 경로는
축 계산(Relevance→Relation→Sufficiency→Independence→Hypotheses)까지 진짜로 동작한다.**
문제는 그 골격 바깥이다.

| # | 갭 | 종류 | 근거 |
|---|---|---|---|
| **E-1** | 판정표 78/432 조합 누락 + 예외 시 상태머신 미복구 | BUG | **→ §1 BLK-0** |
| E-2 | 압박·회복·감식·특수·해명 카드군이 **CP만 먹고 아무 효과 없음** | STUB | 판정 코드는 반환하나 `effectsFor`에 해당 case가 없음. CONTRADICT/CONFIRM/QUERY 외 전부 |
| E-3 | 카드 고유 효과(`card.modifiers`·`special_effect_id`)가 판정 결과에 미반영 | UNWIRED | |
| E-4 | 보스 페이즈·파쇄 타이머가 무효 | UNWIRED | `EncounterCoordinator`가 모디파이어 결과의 `phaseId`·`timerTurns`·`spawnedStatementIds`·`unlockedEvidenceSlotIds`를 **버림** |
| E-5 | facet 셀렉터 모디파이어가 아무 대상도 못 잡음 | BUG | 런타임 claim에 `facet`이 없음 (물컹이 [누가] 잠금 기믹 무효) |
| E-6 | 방어막(`Claim.resistance`)이 모순 성공으로 소모되지 않음 | PARTIAL | 항상 그대로 표시 |
| E-7 | 파트너 스킬이 쿨다운 타이머만 세팅하고 효과 없음 | STUB | §2.1 U-1과 복합 — 버튼조차 안 나옴 |
| E-8 | 판정 10단계 중 9단계(Procedure)가 상수 `FAIR` 고정 | STUB | |
| E-9 | `PublicDTO.objectives`가 어느 화면에도 렌더링되지 않음 | UNWIRED | **플레이어가 승리 조건을 알 수 없다** |
| E-10 | UI가 CP 부족을 막지 않아 `InsufficientCommandPointsError` 영문 메시지가 진술창에 노출 | BUG | BLK-3과 같은 근원 |
| E-11 | `CROSS_CHECK`(진술 대조) 카드군 미구현 | NOT_IMPL | 예약 상태, 대응 판정 코드도 없음 |
| E-12 | `FlowNode.is_terminal` 무시 (`#flowState`가 `terminal:false` 하드코딩) | BUG | |
| E-13 | 스위트스팟을 balance 퍼센트로만 계산해 인카운터 저작 `state_conditions.composure_min/max` 무시 | PARTIAL | |
| E-14 | `FREE_REVIEW` 조회 API·`cardAttachment`·`partnerState` 모듈이 런타임 도달 불가 | UNWIRED | 테스트 전용 데드코드 |

> **473개 테스트가 전부 통과하는 이유**: 테스트가 순수 모듈 단위(`resolveArgument`, `ModifierSystem`)나
> 정답 루트(`smoke-best`)만 검증하고, **코디네이터가 모디파이어 결과를 되받는 배선**과
> **오답 제출 경로**를 검증하지 않기 때문이다. 이것이 §3의 하네스에 `fuzz` 정책이 필요한 이유다.

### 2.1 🟠 데이터가 죽어 있어 기능이 통째로 비활성 (UNWIRED)

| # | 갭 | 종류 | 근거 | 수정 규모 |
|---|---|---|---|---|
| **U-1** | **파트너(김 인턴) 스킬이 게임에서 절대 사용 불가** | UNWIRED | `content/common/balance.json`의 `partner.cooldowns`가 **`{}`**. → `createEncounterSession.ts:346` `Object.keys({})[0]` = undefined → `:381` `partnerSkillAvailable = false` 고정 → `bootstrap.ts:795` `onUsePartner` 콜백 자체가 배선 안 됨 | **JSON 1줄**. `partnerCooldown.test.ts`는 통과 중 |
| U-2 | 유물·강화 보상이 전부 무효과 | UNWIRED | `relics.json`·`enhancements.json`이 `ToolContentValidator.ts:70,77`(오프라인 검증기)에서만 참조됨. `RunCatalogRepository.ts:34-36`은 flags/grades/rewards 3개만 로드. `acquiredRelicIds`를 읽어 수치를 바꾸는 코드 **src 전체 0건** | 리포지토리 + 효과 적용부 신설 |
| U-3 | `judgment-ui-map.json` 소비처 없음 | UNWIRED | 스키마·오프라인 검증기만. 런타임 로더 0건 | 판정 연출 매핑 배선 |
| U-4 | QTE 런타임 부재 | STUB | `gameAudio.ts:60-64,89` `cueQte` 정의 → **호출처는 테스트뿐**. `soundRegistry`에 `qte_success/fail`. dev 콘솔에 자동성공 토글(`runtimePanel.ts:115`). **엔진·UI에 QTE 로직 0건** | 기능 신설 or 명시적 제거 |
| U-5 | 타이틀/메인메뉴 화면 도달 불가 | UNWIRED | `createTitleScreen.ts`(34줄)를 import하는 파일 **src·tests 전체 0건**. bootstrap은 첫 화면으로 바로 `mountStrip()` (`:904-913`) | 화면 배선 |
| U-6 | `case.json`의 `flag_hooks` 런타임 미사용 | UNWIRED | 권위본은 `content/common/flags.json`. `completeEventNode`(`RunState.ts:481`)는 `input.flagDefinitions`(=flags.json)만 사용. case.json쪽은 스키마·검증기 전용 중복 데이터 | 중복 제거 |
| U-7 | 고아 콘텐츠 `event_tutorial_investigation` | UNWIRED | 패턴 C로 저작됐으나 `run-strip.json`이 참조하지 않음 | 스트립 편입 or 삭제 |

### 2.2 🟠 콘텐츠 결함 (BUG / STUB)

| # | 갭 | 종류 | 근거 |
|---|---|---|---|
| **C-1** | **패턴 B(연결·배치형) 이벤트가 항상 자동 성공** | BUG | `createEventScreen.ts:85-88`의 기본 배치 = `items[i] → slots[i % n]`. 실측 결과 `event_tutorial_placement`·`event_ep001_links` **둘 다 기본 배치가 정확히 `answer_mapping`과 일치**. `success_ratio: 1`. → 플레이어는 "배치 제출"만 누르면 무조건 SUCCESS. 게임성 0 |
| **C-2** | **최종 보스 직전 유일한 분기가 무의미** | BUG | `event_ep004_ticket_trade`의 `sets_flags`(case.json)와 `flags.json`의 `set_by`가 **정반대로 저작**됨. `completeEventNode`는 `applyEventDefinition`(선택지) → `applyFlagSetHooks`(flags.json) 순서라 **훅이 나중에 이겨서 어떤 선택지를 골라도 F-12 = true**. 최종 보스 실드 -1이 무조건 적용 |
| C-3 | 이벤트 화면이 비용↔획득을 표시하지 않음 | PARTIAL | `effectLabels`(gameFlowPresentation.ts:15-32)가 `costs`/`gains`를 만들지만 `createEventScreen`이 **렌더링하지 않음**. 플레이어는 DP 5를 쓰는지 모른 채 선택 |
| C-4 | 질문 경로(`inquiry_routes`) 18개가 전부 장식용 | STUB | 이미 공개된 진술만 다시 가리켜 새로 열리는 것이 없음 |
| C-5 | 6개 EVENT 노드의 증거 보상이 실질 0 | STUB | 지급 증거가 전부 이미 보유 중이거나 자동 지급되는 것 |
| C-6 | 보스 2페이즈가 실질 없음 | PARTIAL | 새 진술·새 기믹·전용 대사 추가 0 (테스트 최소 요건만 충족) |
| C-7 | 물량 미달 | PARTIAL | 증거 24개(정본 37) · 질문경로 18개(정본 23) · 폴백 리액션 키당 1문장 |
| C-8 | AI 캐시 1건뿐 | PARTIAL | `content/ai-cache/`에 `enc_tutorial_slime` statement 1건. 나머지 8전투 없음 |

> **반증된 우려 (문제 없음)**: 엔진이 낼 수 있는 `reactionKey` 28종
> (RESOLUTION_CODES 21 + InvalidReason 7)이 9개 encounter dialogue 파일에 **빠짐없이 존재**하며,
> `createEncounterSession.ts:110-141`이 28키를 선백필한다. **빈 말풍선 버그는 없다.**
> case.json 내부 dangling reference도 **0건**이다.

### 2.3 🟡 UI·연출 (기능은 되나 명세 미달)

| # | 갭 | 근거 |
|---|---|---|
| **P-1** | **전투 종료 연출 위에 'MISSING' 플레이스홀더 타일이 덮임** | `directions.ts:169, 259`가 `'direction/ending/polaroid'` 키를 요청하는데 **레지스트리·디스크 어디에도 없는 유일한 미존재 키**. `bootstrap.ts:116-126`의 `resolveAsset(..., fallback)`이 폴백 PNG를 돌려주고, `addOptionalSprite`는 `undefined`일 때만 건너뛰므로 **불투명 폴백 타일이 늘어나 연출 위에 그려진다.** 9개 전투 전부에서 매번 보임 |
| **P-2** | **플레이어가 승리 조건을 알 수 없음** | `PublicDTO.objectives`가 어느 화면에도 렌더링되지 않음 (→ §2.0 E-9) |
| **P-3** | **런 자원 DP·신뢰도가 게임 어느 화면에도 표시되지 않음** | 진행 스트립에 자원 HUD 없음. 보상으로 DP를 받아도 확인 불가 |
| P-4 | 진행 스트립이 완전 정적 | `createRunStripScreen.ts`(84줄) — 사각형 15개 + 번호 + '완료' 텍스트. 이동 애니메이션·아이콘 아트·도장 연출 없음 |
| P-5 | 보상 화면에 서류철 프레임 아트 없음, S~F "도장"이 정적 사각형+글자 | `createRewardScreen.ts`(46줄) |
| P-6 | 엔딩 화면에 컷신·타자기·런 요약이 하나도 없음 | `createEndingScreen.ts`(46줄). `ENDING_PRESENTATIONS`가 `illustrationAssetKey`를 지정하지 않아 이미지 분기 자체가 죽은 코드 |
| P-7 | 강제자백·실패 결과에서는 보상 화면이 안 떠서 **S~F 등급이 화면에 한 번도 안 나옴** | `commitEncounter`(bootstrap.ts:547-551) — `rewardChoices.length > 0`일 때만 등급 표시 |
| P-8 | 조서 화면 증거 첨부 비용이 항상 0 CP 고정 | `evidenceCosts` 하드코딩 |
| P-9 | 패턴 C 조사 이벤트에 중단 수단·결과 피드백 없음 | 무엇을 찾았는지 알 수 없음 |
| P-10 | 타이틀·설정·일시정지·세이브슬롯 UI 전무, 런 중 재시작/종료 수단 없음 | §2.1 U-5와 동일 근원 |
| P-11 | 심문 대사창에 형사(김태훈) 대사 라인이 없음 | 용의자 진술 1줄만 표시 |

> **반증된 우려**: "손패 카드가 화면 아래로 80% 잘려 판독 불가"는 **사실이 아니다.**
> `cardLayout.ts:41,45,85`의 `CARD_FAN_SCALE`·`CARD_REST_REVEAL_RATIO`·`restY` 계산 결과 의도된 부채꼴
> 배치이며, 호버/드래그 시 올라온다.
> **초상 누락도 없다** — `buildAssetRegistry`가 파생하는 키 51개가 디스크 PNG 51개와 정확히 일치해
> 15노드 플레이 동안 초상 폴백이 한 번도 발동하지 않는다 (미존재 키는 P-1의 `direction/ending/polaroid` 하나뿐).

### 2.4 🟢 애셋·오디오

| # | 갭 | 근거 |
|---|---|---|
| **A-1** | **오디오 파일 0개 — 게임 전체 무음** | `soundRegistry.ts`가 SFX 13 + BGM 4 + 스팅어 2 = **19개 사운드 ID 선언**. `assets/sfx/`·`assets/bgm/`는 **`.gitkeep`만**. `import.meta.glob('.../*.ogg')`가 빈 객체 반환 → 모든 `audio.play()`가 조용한 no-op. 번들에서 glob이 `Object.assign({})`로 컴파일된 것까지 확인됨. **부수 효과: 기획서가 허위 자백의 시그니처로 지정한 "BGM 뮤트 = 침묵이 페널티" 연출이 물리적으로 지각 불가** (뮤트 코드 자체는 정상 구현되어 있음) |
| A-2 | PNG 51개 전량이 절차 생성 플레이스홀더 | `tools/placeholder/index.mjs`가 5×7 비트맵 폰트로 찍어낸 것. 기획서가 요구하는 오소링된 픽셀아트 0장 |
| A-3 | upset/lose 감정 오버레이가 캐릭터별로 구분되지 않음 | 12개 초상 세트가 4종의 동일 파일 공유 (md5 일치) |
| A-4 | `.state-parts.json` 12개가 런타임 미사용 | 생성만 되고 소비되지 않는 write-only 메타데이터 |
| A-5 | EVENT 6노드 + 보상 + 스트립 화면에 이미지 0장 | 15노드 중 6노드가 순수 벡터 화면 |
| A-6 | 증거 PNG 3장을 modulo로 돌려써 4번째부터 중복 / 카드 14종이 일러스트 3장을 9개 intent에 나눠 씀 | |
| A-7 | 애셋 레지스트리가 모듈 평가 시점에 throw 가능 | 규약 위반 파일 1개가 게임 전체를 부팅 불가로 만듦 |

### 2.5 ⚪ 개발 도구·테스트 인프라

| # | 갭 | 근거 |
|---|---|---|
| D-1 | **개발자 콘솔의 주요 컨트롤이 전부 가짜** | `jumpToNode`는 `devState.nodeId`만 바꾸고 문구 출력(`bootstrap.ts:944-950`) · `setFlag`는 `devState.flags`만 변경, 실제 `FlagStore` 미변경(`:957`) · `setResource`는 표시용 오버라이드일 뿐 엔진 자원 미변경(`:938` + `activeModel` `:315-331`) → **판정 결과와 화면이 어긋남** |
| D-2 | AI 대사 생성은 구조적으로 항상 비활성 | `createPhase4DialogueService.ts:120` `import.meta.env.DEV && aiEnabled ? live : p0`. 엔드포인트 `/api/dialogue`(`:89`)에 대응하는 **프록시 서버·`vite.config.ts` proxy 설정 저장소 전체에 없음**. → 프로덕션에서 AI 경로 100% 도달 불가. **폴백 코퍼스가 유일한 대사 소스** |
| D-3 | `OutputValidator`(13KB)·타임아웃/재시도가 런타임에서 한 번도 실행되지 않음 | D-2의 귀결 |
| D-4 | `routeSimulator`가 9개 ENCOUNTER만 커버, 6개 EVENT 노드는 시뮬레이터에 없음 | `tools/simulate/routeSimulator.ts` |
| D-5 | 27셀 매트릭스 중 BEST 9셀만 실제 `EncounterCoordinator` 통과, 나머지 18셀은 엔진 우회 | `simulateRoute`가 BEST일 때만 `simulateBestWithCoordinator` 호출(`:1202`) |
| D-6 | **전투 시뮬레이션과 15노드 런 진행을 함께 굴리는 드라이버가 없음** | 두 계층이 완전 분리. **§3이 해결하려는 바로 그 갭** |
| D-7 | 브라우저 자동화 하네스 전무 | Playwright/Puppeteer가 `package.json`·`ci.yml` 어디에도 없음 |
| D-8 | `tests/replay/deterministic-replay.test.ts`가 게임을 재생하지 않는 합성 테스트 | 이름이 커버리지를 오도 |
| D-9 | `tests/audio`·`tests/content` 5개 파일이 어떤 CI 스텝에서도 실행되지 않음 | `package.json`의 `test:gates`가 해당 디렉터리를 포함하지 않음 |
| D-10 | 품질 게이트 부재 | 커버리지 임계값·E2E·시각 회귀·고아 모듈 검사 모두 없음 |
| D-11 | `src/content-io/schemas/` 재수출 shim 15개가 아무도 import하지 않는 데드 파일 | |
| D-12 | 저장소 루트 `dungeon_detective_workbench.html`이 워크벤치의 낡은 사본 | 이중 관리 |
| D-13 | 유일한 AI 캐시 1건조차 **런타임 seed 불일치로 한 번도 히트하지 않음** | `content/ai-cache/tutorial-slime-full-statement.json` |
| D-14 | **CI가 27셀 route-matrix·`tests/audio`·`tests/content`를 한 번도 실행하지 않음** | `package.json`의 `test:gates`가 미포함. **CI 그린 ≠ 전체 스위트 그린** |
| D-15 | 프리셋 세이브 내보내기/가져오기 UI·파일 전무 | 정본 §9.2·§14.4의 시연 점프 장치 미구현 |
| D-16 | 워크벤치가 게임 런타임과 데이터 왕복 없는 단방향 수동 도구 | |
| D-17 | `tools/simulate`에 실행 진입점이 없어 vitest 없이는 시뮬레이터 구동 불가 | |

### 2.6 🟡 런 설계

| # | 갭 | 근거 |
|---|---|---|
| R-1 | `EndingEvaluator`가 F-13·F-01 두 플래그와 파생 2개만 사용 | `gameRunState.ts:138-175`. **사건 등급과 F-02~F-12가 엔딩 판정에 전혀 반영 안 됨** |
| R-2 | 세이브가 전투 내부 상태를 항상 빈 값으로 기록 | `runSave.ts:37-41` `encounter: null`, `used_routes: []`, 자원 대부분 0. 전투 도중 새로고침 시 진행 소실 |
| R-3 | 세이브 로드 시 `case_id`·`content_version` 미검증 | 콘텐츠 갱신 후 옛 세이브 로드 위험 |
| R-4 | 소각(exhaust) 카드가 다음 전투 덱에서 영구 소실 | |
| R-5 | STRESS/TRUST 보상이 상한 클램프 없이 조용히 낭비 | `balance.json`의 `stress.max 100`이 런 자원에 강제되지 않음 |
| R-6 | 전투 1회 FAILED로 런 전체가 즉시 terminal → 배드 엔딩 직행 | 재시도·부분 진행 보존 없음 |
| R-7 | BOSS 노드가 보상 개수·희소성·BGM 씬 외에는 일반 ENCOUNTER와 동일 | 액트 전환 정산·연출 없음 |
| **R-8** | **튜토리얼 보스가 `act 0`이라 CASE 보상을 못 받고 소진된 COMMON 풀에서 뽑음** | `gameRunState.ts:126-133`. **BLK-1 소프트락을 사실상 강제하는 직접 원인** |
| R-9 | 패턴 B(배치) 이벤트 2노드가 런 상태에 아무 영향도 주지 않음 | 정답/오답이 플래그에도 반영 안 됨 → §2.2 C-1과 복합해 **완전 무의미 노드** |
| **R-10** | **강제 자백 1회 이후 남은 모든 노드의 등급이 영구히 C 이하로 고정** | 등급 평가가 런 누적 `falseConfessions`를 사용 |
| R-11 | `balance.json` 튜닝 키 9개가 엔진에 소비자 없음 | 라이브 밸런스 튜너의 무효 노브 |

---

## 3. 🎮 15노드 자동 플레이 하네스 설계

### 3.1 핵심 인사이트: 무엇이 이미 있고 무엇이 없는가

**이미 있는 것 (재사용 대상)**

1. `tools/simulate/routeSimulator.ts` (1,336줄) — **9개 전투 전부의 "정답 수순"이 데이터로 존재**한다.
   `SIMULATION_CATALOG[archetype].proofPaths`가 case.json에서
   `objectiveId · claimId · proofRuleId · cardId · evidenceIds`를 유도해 둔다.
   → **자동 플레이 봇은 전투 휴리스틱을 만들 필요가 없다. 재생만 하면 된다.**
2. `tests/app/run-session.test.ts:90` — 15노드 런 레이어 진행 테스트 (단, 전투를 가짜 처리)
3. `EncounterCoordinator`의 헤드리스 API — `beginArgument · submit · endTurn · secureStatement · snapshot`

**없는 것 (신설 대상)**

1. 위 둘을 **잇는 것** — 전투를 실제 코디네이터로 굴리면서 15노드 런을 진행하는 드라이버
2. **브라우저 프레젠테이션 계층을 자동으로 몰아주는 것** — bootstrap·Pixi 화면·연출·에셋을 실제로 통과

### 3.2 실현 가능성은 이미 검증됨

임시 테스트를 작성해 `simulateRoute(archetype,'BEST_RESOLUTION')`(실 `EncounterCoordinator` 구동)와
`createRunSession`(실 런 레이어)을 이어 붙여 15노드를 완주시켰다. **통과.**

| # | node_id | kind | ref | 코디네이터 스텝 | 등급 | 보상 후보 |
|---|---|---|---|---|---|---|
| 1 | run_tutorial_01 | ENCOUNTER | enc_tutorial_slime | 12 | S | 3 |
| 2 | run_tutorial_02 | EVENT/A | event_tutorial_choice | — | — | — |
| 3 | run_tutorial_03 | ENCOUNTER | enc_tutorial_harpy | 12 | S | 3 |
| 4 | run_tutorial_04 | EVENT/B | event_tutorial_placement | — | — | — |
| 5 | run_tutorial_05 | BOSS | enc_tutorial_minotaur | 13 | S | 2 |
| 6 | run_ep001_01 | ENCOUNTER | enc_ep001_goblin | 12 | S | 3 |
| 7 | run_ep001_02 | EVENT/B | event_ep001_links | — | — | — |
| 8 | run_ep001_03 | ENCOUNTER | enc_ep001_orc | 12 | S | 3 |
| 9 | run_ep001_04 | EVENT/C | event_ep001_warehouse | — | — | — |
| 10 | run_ep001_05 | BOSS | enc_ep001_succubus | 15 | S | 2 |
| 11 | run_ep004_01 | ENCOUNTER | enc_ep004_dwarf | 14 | S | 3 |
| 12 | run_ep004_02 | EVENT/C | event_ep004_machine_room | — | — | — |
| 13 | run_ep004_03 | ENCOUNTER | enc_ep004_cyclops | 14 | S | 3 |
| 14 | run_ep004_04 | EVENT/A | event_ep004_ticket_trade | — | — | — |
| 15 | run_ep004_05 | BOSS | enc_ep004_fallen_hero | 21 | S | 2 |

최종: `nodeIndex=15`, `completedNodeIds=15`, `terminal=true`, 엔딩 `ending-true`,
플래그 F-02~F-13 점등(F-01은 강압 자백 전용이라 BEST 런에서 false가 정상), 유물 `relic_clean_notebook` 1개.

> ⚠️ 이 프로브는 `saveRepository`를 연결하지 않았기에 통과했다. **연결하면 §1 BLK-1로 3~5노드에서 멈춘다.**
> 또한 `gradeMetrics`를 만점으로 하드코딩했으므로, 실제 하네스는
> `src/app/gameRunState.ts`의 `encounterGradeMetrics(session)`로 코디네이터 실측치를 써야 한다.

### 3.3 3계층 전략

| 계층 | 이름 | 위치 | 검증 범위 | 신규 의존성 | 소요 |
|---|---|---|---|---|---|
| **L1** | 헤드리스 풀런 | `tests/e2e/full-run.headless.test.ts` | 엔진 + 런 레이어 조인. 15노드·등급·플래그·엔딩·**세이브** | 없음 | ~1초 |
| **L2** | **인페이지 오토플레이** | `src/dev/autoplay/**` + `?autoplay=1` | **브라우저 실런타임 전체** — Pixi 화면·연출·에셋·오디오·입력 배선 | 없음 | 터보 30~60초 |
| **L3** | Playwright 래퍼 | `tests/e2e/playwright/**` | L2를 CI 헤드리스 크로미움에서 구동 + 스크린샷·콘솔 에러 수집 | `@playwright/test` | 1~3분 |

- **L1은 즉시 구현 가능**하며 §3.2에서 이미 동작을 확인했다. 그리고 **`saveRepository`를 반드시 연결**해야
  BLK-1 같은 결함을 잡는다 — 기존 테스트가 놓친 정확한 이유가 그것이다.
- **L2가 사용자가 요청한 본체** — "웹에서 알아서 15노드까지 쭉 실행".
- L3은 선택. L2가 만든 JSON 리포트를 읽어 판정만 하면 되므로 얇게 유지한다.

### 3.4 L2 아키텍처

**반드시 지켜야 할 기존 제약**

| 제약 | 근거 | 해법 |
|---|---|---|
| 프로덕션 번들에 `src/dev/**` 모듈이 1개라도 들어가면 **빌드 실패** | `vite.config.ts:50-71` `assertDeveloperConsoleTreeShaken` | 드라이버 전체를 `src/dev/autoplay/`에 배치 |
| bootstrap은 dev를 **동적 import만** 허용 (정적 import 금지) | `tests/arch/dev-console-gating.test.ts:5-10` | 기존 `if (import.meta.env.DEV) { await import('../dev') }` 블록 재사용 |
| `src/ui/**`는 `src/engine/**` import 금지 | `tests/arch/layer-imports.test.ts:37-52` | 드라이버는 ui가 아니라 dev 계층이므로 무관 |
| vitest 환경이 `node` | `vite.config.ts:98` | L1은 node 그대로. L2는 브라우저에서 돎 (vitest 불필요) |

**오토플레이 포트** — bootstrap이 노출하고 dev가 소비. 기존 dev 콘솔의 `runtime` 포트(`bootstrap.ts:917-971`)와 동일 패턴.

```ts
// src/dev/autoplay/port.ts  (타입만 정의. bootstrap은 구조적 타이핑으로 만족시킴)
export type AutoplaySubmission = {
  readonly cardId: string;
  readonly facet: 'WHO' | 'WHEN' | 'WHERE' | 'WHAT' | 'HOW' | 'WHY';
  readonly evidenceIds: readonly string[];
};

export type AutoplayScene =
  | { kind: 'STRIP'; nodeIndex: number; nodeId: string; continue(): void }
  | { kind: 'EVENT'; eventId: string; pattern: 'A' | 'B' | 'C';
      choiceIds: readonly string[];
      answerMapping: Readonly<Record<string, string>>;
      spotIds: readonly string[]; attemptLimit: number;
      choose(choiceId: string): void;
      submitPlacement(mapping: Readonly<Record<string, string>>): void;
      investigate(spotId: string): void;
      continue(): void }
  | { kind: 'INTERROGATION'; encounterId: string; machineState: string;
      turn: number; turnLimit: number; secureStatementEnabled: boolean;
      submit(submission: AutoplaySubmission): void;
      endTurn(): void; secureStatement(): void; skipTypewriter(): void }
  | { kind: 'REWARD'; grade: string; rewardIds: readonly string[]; select(rewardId: string): void }
  | { kind: 'DIRECTION'; label: string }
  | { kind: 'ENDING'; endingId: string; restart(): void };

export interface AutoplayPort {
  scene(): AutoplayScene;
  runSnapshot(): {
    nodeIndex: number; flags: Readonly<Record<string, boolean>>;
    dp: number; stress: number; claimedRewardIds: readonly string[];
    acquiredRelicIds: readonly string[]; terminal: boolean;
  };
  lastFlowError(): string | undefined;
  /** 연출 오버레이 시간 배속. 1 = 실시간, 20 = 터보. */
  setDirectionTimeScale(scale: number): void;
  onSceneChange(listener: () => void): () => void;
}
```

**`bootstrap.ts` 변경점 (최소 침습, 약 +90줄)**

1. 모듈 상단에 `let autoplayScene`, `const sceneListeners = new Set<() => void>()`,
   `let directionTimeScale = 1` 추가.
2. 각 `mount*` 함수 끝에서 `setAutoplayScene({...})` 호출 —
   `mountStrip`(:339) · `mountEvent`(:428) · `mountInterrogation`(:609) · `mountReward`(:383) · `mountEnding`(:355).
   각 화면이 이미 만들어 둔 `model`과 콜백 클로저를 그대로 포트에 노출하면 되므로 로직 중복이 없다.
3. `showTimedDirection`(:256-301)의
   `overlay.update(mounted.app.ticker.deltaMS)` → `overlay.update(mounted.app.ticker.deltaMS * directionTimeScale)`
   로 변경하고, 진입/이탈 시 `setAutoplayScene({ kind: 'DIRECTION', ... })`.
   → **연출을 건너뛰지 않고 배속만 올리므로 연출 코드 경로도 함께 검증된다.**
4. `runSeed` 외부 주입 경로 신설 (현재 `createInitialGameRunState`가 시드를 외부에서 못 받음).
5. DEV 블록에서 URL 파라미터로 드라이버 기동:

```ts
if (import.meta.env.DEV) {
  const params = new URLSearchParams(window.location.search);
  if (params.get('autoplay') !== null) {
    const { startAutoplay } = await import('../dev/autoplay');
    startAutoplay(autoplayPort, {
      mode:   (params.get('mode')   ?? 'turbo') as AutoplayMode,
      policy: (params.get('policy') ?? 'best')  as AutoplayPolicy,
      seed:   Number(params.get('seed') ?? 20_260_805),
    });
  }
  // ... 기존 dev console ...
}
```

> **왜 콜백 구동이고 합성 포인터 이벤트가 아닌가**
> Pixi 히트 테스트는 정수 스케일·오프셋·해상도에 의존한다. 좌표 기반 클릭 합성은 레이아웃이 1px만
> 바뀌어도 깨지고, 실패했을 때 "게임 버그"인지 "드라이버 좌표 오차"인지 구분되지 않는다.
> 콜백 구동은 **렌더링·에셋 로드·연출·타이포는 실제로 전부 수행하고 입력만 우회**하므로
> 회귀 검출력을 유지하면서 안정적이다. 좌표/히트박스 회귀는 별도의 얇은 스모크로 분리한다.
> (참고: `InterrogationScreenController.selection`은 readonly라 프로그램적 설정 API가 없다.
>  드라이버가 화면이 아니라 bootstrap 포트를 구동해야 하는 구조적 이유이기도 하다.)

### 3.5 15노드 봇 시나리오

**전투 정책** — 휴리스틱이 아니라 저작된 정답 수순 재생.

| policy | 동작 | 기대 결과 |
|---|---|---|
| `best` (기본) | `proofPaths` 순차 제출 → 스위트스팟 진입 → `secureStatement` | BEST_RESOLUTION |
| `partial` | 필수 목표 일부만 제출 후 턴 소진 | PARTIAL_RESOLUTION |
| `coerced` | 압박 카드 위주 | COERCED_CONFESSION (→ F-01 점등, 배드 엔딩 경로 검증) |
| `greedy` | 카탈로그 미사용. 라이브 상태에서 합법 제출 중 첫 번째를 탐욕 선택 | 콘텐츠 추가 시 견고성 회귀용 |
| **`fuzz`** | **시드 기반으로 "틀리지만 합법인" 수를 섞어 제출** (부분 관련 증거·엉뚱한 facet·CP 부족 시도) | **예외 없이 전투가 끝나야 함** |

> **`fuzz` 정책이 왜 필수인가**
> `best`는 저작된 정답만 재생하므로 §1 BLK-0(판정표 구멍)을 **절대 밟지 않는다.**
> 기존 473개 테스트가 그 버그를 놓친 것과 정확히 같은 이유다.
> **하네스가 정답만 재생하면 하네스도 같은 사각지대를 물려받는다.**
> `fuzz`는 "사람이 실제로 두는 어설픈 수"를 재현해 판정표 구멍·상태머신 미복구·삼켜진 예외를 잡아낸다.
> 단언: fuzz 런에서도 **예외 0건, 전투는 어떤 결과로든 반드시 종료, 상태머신이 `RESOLVE`에 갇히지 않음.**

**노드별 시나리오**

| # | node_id | kind | 봇 정책 | 검증 |
|---|---|---|---|---|
| 1 | run_tutorial_01 | ENCOUNTER | proofPaths 재생 → secure | 12스텝 내 BEST, 보상 3택 |
| 2 | run_tutorial_02 | EVENT/A | `choose(choiceIds[0])` | 노드 +1, F-03 |
| 3 | run_tutorial_03 | ENCOUNTER | proofPaths 재생 | BEST, F-05 |
| 4 | run_tutorial_04 | EVENT/B | `submitPlacement(answerMapping)` | SUCCESS → 결과 화면 → `continue()` |
| 5 | run_tutorial_05 | BOSS | proofPaths 재생 | BEST, F-06, 보상 **2택** |
| 6 | run_ep001_01 | ENCOUNTER | proofPaths 재생 | BEST, F-08 |
| 7 | run_ep001_02 | EVENT/B | `submitPlacement(answerMapping)` | SUCCESS, F-07 |
| 8 | run_ep001_03 | ENCOUNTER | proofPaths 재생 | BEST, F-10 |
| 9 | run_ep001_04 | EVENT/C | `investigate` × `attemptLimit` | 시도수 == attemptLimit, F-09 |
| 10 | run_ep001_05 | BOSS | proofPaths 재생 | BEST, F-11, 15스텝 |
| 11 | run_ep004_01 | ENCOUNTER | proofPaths 재생 | BEST, 14스텝 |
| 12 | run_ep004_02 | EVENT/C | `investigate` × `attemptLimit` | — |
| 13 | run_ep004_03 | ENCOUNTER | proofPaths 재생 | BEST, 14스텝 |
| 14 | run_ep004_04 | EVENT/A | `choose('choice_ep004_question_broker')` (인덱스 아님) | F-12 — 아래 주 |
| 15 | run_ep004_05 | BOSS | proofPaths 재생 | BEST, F-13, 21스텝 |
| — | REWARD | 각 전투 후 | **`rewardIds` 중 `claimedRewardIds`에 없는 것 우선 선택** | §1 BLK-1 회피 |
| — | ENDING | 종료 | assert 후 리포트 flush | `ending-true` |

> **노드 14 주의**: 현재는 §2.2 C-2 버그 때문에 **어느 선택지를 골라도 F-12=true**라 인덱스 선택으로도 통과한다.
> 그러나 그 버그가 고쳐지면 트루 엔딩에는 `choice_ep004_question_broker`가 필요하다.
> **하네스는 처음부터 인덱스가 아니라 `choice_id`로 지정**해 두어야 하며,
> "두 선택지가 서로 다른 F-12 값을 만든다"를 단언하는 회귀 테스트를 함께 둔다.

> **보상 선택 주의**: BLK-1이 수정되기 전에는 봇이 미획득 보상을 우선 고르더라도 §1의 실측대로
> 노드 5에서 막힐 수 있다. **하네스는 이 소프트락을 "회피"하는 게 아니라 "명확히 실패로 보고"해야 한다.**
> 회피 로직을 넣으면 하네스가 버그를 은폐한다.

**루프 안전장치 (필수)**

- 턴 상한: `encounter.turnLimit * 2 + 1` (`routeSimulator`의 `maxSteps`와 동일 규칙)
- 씬 워치독: 동일 씬에서 `sceneChange` 없이 N틱 경과 → `STALLED` 실패로 종료
- 노드 상한: 90초(watch) / 6초(turbo), 런 전체 하드 타임아웃
- `mount.dataset.flowError` 감시 → 설정되는 즉시 실패 종료 (BLK-1·BLK-3 탐지)
- `useFallbackStatement`로 에러 문구가 나갔는데 `machineState`·`turn`이 그대로면 **"삼켜진 에러"**로 판정

### 3.6 모드 · 관측 · 단언

| 모드 | `directionTimeScale` | 타자기 | 목적 |
|---|---|---|---|
| `watch` | 1 | 정상 재생 | 사람이 눈으로 확인 (데모·발표) |
| `turbo` | 20 | `skipTypewriter()` 즉시 | CI·회귀. 60초 이내 완주 목표 |
| `record` | 5 | 정상 | 노드마다 캔버스 스냅샷 + JSON 리포트 저장 |

화면 우상단에 HUD 오버레이(노드 n/15, 현재 씬, 경과, 실패 카운터)를 띄우고, 완주 시
`window.__DD_AUTOPLAY_REPORT__`에 리포트를 넣고 `document.title`에 `PASS`/`FAIL`을 표기한다
(L3 Playwright는 이것만 읽으면 판정 끝).

```jsonc
{
  "schemaVersion": "1.0",
  "seed": 20260805, "mode": "turbo", "policy": "best", "durationMs": 41230,
  "nodes": [{
    "index": 0, "nodeId": "run_tutorial_01", "kind": "ENCOUNTER", "ref": "enc_tutorial_slime",
    "turns": 4, "submissions": 3, "resolutionCodes": ["R_DIRECT_CONTRADICTION"],
    "outcome": "BEST_RESOLUTION", "grade": "S",
    "rewardOffered": ["reward_trust", "reward_dp_small", "reward_stress_recovery"],
    "rewardClaimed": "reward_trust",
    "flagsSet": ["F-02"], "durationMs": 2310, "warnings": []
  }],
  "ending": { "endingId": "ending-true", "kind": "TRUE" },
  "finalState": { "nodeIndex": 15, "dp": 236, "claimedRewardIds": ["..."] },
  "consoleErrors": [], "missingAssetKeys": [], "rawI18nKeysSeen": [],
  "result": "PASS"
}
```

**단언 목록**

1. 15개 노드를 `run-strip.json` 순서 그대로 방문
2. `mount.dataset.flowError`가 한 번도 설정되지 않음 ← **BLK-1·BLK-3 탐지**
3. 전투 9개 전부 정책이 의도한 outcome 도달
4. `console.error` 0건 (`console.warn`은 수집만 — 현재 에셋 폴백 경고가 다수)
5. 최종 `nodeIndex === 15 && terminal === true`
6. 엔딩 도달 및 `endingId`가 정책 기대치와 일치
7. **화면 모델 문자열에 `^[a-z_]+\.[a-z_.]+$` 패턴(원시 i18n 키)이 없음** ← **BLK-2 탐지**
8. 새로고침 재개 검증: 노드 7에서 리로드해도 같은 지점에서 이어짐 (별도 시나리오)

**하네스가 견뎌야 할 실패 모드**

| 실패 모드 | 감지 방법 |
|---|---|
| 화면이 콜백을 영원히 안 부름 | 씬 워치독 타임아웃 |
| 전투 소프트락(합법 수 없음) | 턴 상한 + `machineState` 미변화 |
| 콜백 내부 예외가 삼켜짐 | `useFallbackStatement` 호출 후 상태 미변화 → `STALLED` |
| 보상 중복 소프트락 (BLK-1) | `flowError` 감시 + 씬 미변화 |
| 원시 i18n 키 노출 (BLK-2) | 씬 모델 문자열 패턴 검사 |
| 에셋 누락 경고 폭주 | `console.warn` 패턴 수집 → `missingAssetKeys` (실패는 아님) |

### 3.7 결정성

- `runSeed`는 URL `?seed=`로 주입 → `createInitialGameRunState`에 전달 (**주입 경로 신설 필요**)
- `encounterSeed()`(bootstrap.ts:101), `stableDialogueSeed()`(:77)는 이미 순수 결정적
- `aiEnabled`는 반드시 `false` 유지 → 폴백 대사만 사용 (프로덕션과 동일 조건)
- 시작 전 `localStorage` 클리어 (기존 세이브가 시작 노드를 바꿈)

---

## 4. 실행 로드맵

### Step 0 — BLOCKER 4건 수정 (1일)

| 작업 | 파일 | 규모 |
|---|---|---|
| **판정표 `PARTIAL` 행 보강 + 안전 기본값** (BLK-0) | `src/engine/resolution/resolutionTable.ts` | 행 13종 추가 |
| **`submit()` 예외 시 `BUILD_ARGUMENT` 롤백 + CP 환원** (BLK-0) | `src/engine/encounter/EncounterCoordinator.ts:526-` | try/catch |
| 432 전조합 완전성 회귀 테스트 | `tests/judgment/resolution-table.test.ts` | ~40줄 |
| 보상 중복 방지 (BLK-1) | `src/engine/run/RunState.ts` `claimRunReward` + `RewardSystem.eligibleReward` + `content/common/rewards.json` 증량 | 소 |
| 튜토리얼 보스 보상 등급 교정 (R-8) | `gameRunState.ts:126-133` 또는 튜토리얼 `metadata.act` | 소 |
| 15노드 테스트에 `saveRepository` 연결 (BLK-1 회귀) | `tests/app/run-session.test.ts:105` | 3줄 |
| 에러 배너 오버레이 (BLK-3) | `src/ui/screens/` 신규 + `bootstrap.ts` `handleFlowError` | ~80줄 |

### Step 1 — L1 헤드리스 풀런 (반나절)

| 순서 | 파일 | 내용 | 규모 |
|---|---|---|---|
| 1 | `tests/e2e/full-run.headless.test.ts` | `routeSimulator` + `createRunSession` 조인. **`saveRepository` 필수 연결**. §3.2에서 프로토타입 검증 완료 | ~200줄 |
| 2 | `tests/e2e/fuzz-run.headless.test.ts` | 시드 N개로 오답 섞어 전 전투 구동 — **예외 0건·전투 종료 보장** 단언 | ~150줄 |
| 3 | `package.json` | `"test:e2e": "vitest run tests/e2e"` | — |

### Step 2 — i18n 레이어 (1~2일)

| 순서 | 파일 |
|---|---|
| 1 | `content/common/strings.ko.json` + `schemas/strings.schema.json` (약 150키) |
| 2 | `src/content-io/StringsRepository.ts`, `src/app/i18n.ts` |
| 3 | `src/app/gameFlowPresentation.ts` 전면 교체 |
| 4 | `engine/domain/schemas/case.ts`에 이벤트 `description_key` 추가 + 콘텐츠 반영 |
| 5 | 원시 키 노출 금지 회귀 테스트 |

### Step 3 — L2 인페이지 오토플레이 (2~3일)

| 순서 | 파일 | 내용 | 규모 |
|---|---|---|---|
| 1 | `src/app/bootstrap.ts` (수정) | 오토플레이 포트 노출, `setAutoplayScene` 5곳, `directionTimeScale`, seed 주입 | +90줄 |
| 2 | `src/dev/autoplay/port.ts` | 포트 타입 | ~70줄 |
| 3 | `src/dev/autoplay/policy.ts` | best/partial/coerced/greedy. `routeSimulator` 카탈로그 재사용 | ~200줄 |
| 4 | `src/dev/autoplay/driver.ts` | 씬 루프·워치독·리포트 수집 | ~260줄 |
| 5 | `src/dev/autoplay/hud.ts` | 진행 HUD(DOM) | ~90줄 |
| 6 | `src/dev/autoplay/index.ts` | `startAutoplay()` 배럴 | ~20줄 |
| 7 | `tests/dev/autoplay-policy.test.ts` | 정책 단위 테스트(15노드 매핑, F-12 choice_id 등) | ~120줄 |
| 8 | `package.json` | `"autoplay": "vite --open '/?autoplay=1&mode=watch'"` | — |

실행:
```bash
pnpm autoplay        # 브라우저에서 눈으로 확인 (watch 모드)
#   http://localhost:5173/?autoplay=1&mode=turbo&seed=20260805&policy=best
pnpm test:e2e        # L1 헤드리스 (CI 기본 게이트)
```

### Step 4 — 데이터 원상복구 (각 1시간 이내, 효과 큼)

| 작업 | 파일 |
|---|---|
| 파트너 스킬 부활 (U-1) | `content/common/balance.json`의 `partner.cooldowns` 채우기 — **JSON 1줄** |
| F-12 분기 정상화 (C-2) | `content/cases/ep004/case.json`의 `sets_flags` 반전 수정 |
| 패턴 B 기본 배치를 오답으로 (C-1) | `createEventScreen.ts` 초기 배치 셔플 또는 `answer_mapping` 재저작 |
| 이벤트 비용/획득 표시 (C-3) | `createEventScreen.ts`에 `costs`/`gains` 렌더 추가 |
| 유물·강화 배선 (U-2) | `RunCatalogRepository`에 로더 추가 + 효과 적용부 |

### Step 5 — 애셋·연출·L3 (별도 트랙)

오디오 19종, 픽셀아트 51장, 5대 특수 연출, Playwright 래퍼.
게임 완주에는 영향이 없으므로 Step 0~4 이후로 미룬다.

---

## 부록 A. 이 문서의 검증 방법

- **베이스라인**: `tsc` · `vitest run` · `tools/validate` · `vite build`를 실제 실행
- **완주 프로브**: 임시 테스트 2종을 작성·실행 후 삭제
  - `zz-probe-fullrun.test.ts` — `routeSimulator` + `createRunSession` 조인 15노드 완주 (§3.2)
  - `zz-probe-save.test.ts` — `saveRepository` 연결 시 시드 6종 소프트락 재현 (§1 BLK-1)
- **정적 검증**: 각 갭은 파일:라인 인용으로 뒷받침되며, "없음" 주장은 `src` 전체 grep으로 확인
- **다중 감사**: 7개 영역(런레이어·UI·콘텐츠·애셋오디오·엔진·AI개발도구·데드코드)을 독립 감사한 뒤,
  각 주장을 별도 감사자가 코드 재확인으로 **반증 시도**. 제기된 88건 중 **반증 3건**:
  - `손패 카드 80% 잘림` → **사실 아님**. 의도된 부채꼴 배치 (`cardLayout.ts:41,45,85`)
  - `강제자백 BGM 뮤트 미구현` → **코드는 정상**. 오디오 파일 부재(A-1)의 파생 증상이라 중복 계상
  - `tests/zz_audit_probe.test.ts 커밋됨` → 감사 과정에서 생긴 임시 파일. 저장소에 없음 (정리 완료)

- **BLOCKER 4건은 전부 필자가 직접 코드를 읽고 실행해 재현을 확인**했다.
  나머지 MAJOR/MINOR 항목은 파일:라인 인용까지 교차 확인했으나 전부를 실행 재현하지는 않았다.

## 부록 B. 용어

| 용어 | 뜻 |
|---|---|
| NOT_IMPL | 심볼·파일·동작이 아예 없음 |
| STUB | 존재하지만 상수 반환·no-op 등 실질 동작 없음 |
| PARTIAL | 일부 경로만 동작, 명세된 분기 일부 누락 |
| **UNWIRED** | 구현·테스트까지 됐으나 `main.ts → bootstrap.ts` 실런타임 경로에서 도달 불가 |
| BUG | 잘못 동작 |
| BLOCKER | 15노드 완주를 막음 |
