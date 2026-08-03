# 📑 Phase 4: 전투 상태 머신 & AI 파이프라인 (폴백 세이프티) 프롬프트

> **[사용 방법]**: 전투 상태 머신, Outcome 평가, 기믹 시스템, AI 표현 계층(검증 실패 시 무정지 폴백 전환)을 구축할 때 사용합니다.
> **[대응 마일스톤]**: M1 (ResourceSystem·Outcome) → M2 (FlowNode·보스 페이즈) → M3 (잔여 기믹) → M4 (AI Provider·검증·캐시)

~~~markdown
Build the Encounter State Machine and the AI Integration Pipeline with unstoppable fallback safety for "[던전 수사 조서]".

### 1. Encounter State Machine (`src/engine/encounter/`)

Modules: `EncounterStateMachine` · `FlowRunner` · `ModifierSystem` · `ObjectiveEvaluator` · `OutcomeEvaluator` · `ResourceSystem`.

Full flow:

    ENCOUNTER_INIT → LOAD_CASE → (dev build) VALIDATE → BUILD_TRUTH → INIT_KNOWLEDGE
    → ENTER_FLOW_NODE
    → RENDER_STATEMENT      ← AI request → validate → 1 retry → fallback   (P0 goes straight to fallback)
    → EMIT_PUBLIC_DTO
    → TURN_START            ← CP restored to 3, draw per `draw.perTurn`, status/cooldown ticks
    → FREE_REVIEW           ← dossier / evidence / history browsing — CP 0, ZERO state mutation
    → BUILD_ARGUMENT        ← card + tag + evidence attachment selection
    → SUBMIT_ACTION → RESOLVE → APPLY_EFFECTS
    → RENDER_REACTION       ← ReactionKey → AI or fallback
    → RUN_MODIFIERS         ← enemy gimmicks
    → CHECK_FLOW_TRANSITION ← boss phase transitions
    → CHECK_OBJECTIVES → CHECK_OUTCOME
    → loop to TURN_START | ENTER_FLOW_NODE | ENCOUNTER_COMPLETE

This must map 1:1 onto the design document's 8-step turn (진술 → 태그 갱신 → 방어막 → 조서 확인 → 카드 선택 → 판정 → 적 대응 → 종료 체크). Verify that mapping explicitly at the M1 gate — the 8 steps are the design vocabulary, the states above are the implementation.

**FREE_REVIEW guarantee**: every call reachable from this state is a pure query. This is what makes always-on dossier access free, and it is the structural guarantee that previewing cannot leak the answer. Display boundary: an evidence item's scope list, what it cannot prove, and its costs may be shown; whether a set is the correct answer, or a prediction that a contradiction will land, may not.

### 2. Resources and Outcome Evaluation

| Resource | Range | Rule |
|---|---|---|
| Composure | per-encounter max (Slime 60 / Harpy 70 / Minotaur 120 / Goblin 90 / Orc 100 / Succubus 140 / Dwarf 110 / Cyclops 120 / Fallen Hero 180) | Sweet spot 1–30% secures the statement; 0% forces a confession |
| CP | restored to 3 at turn start (Cyclops fight caps at 2 until witness protection restores 3) | |
| Coercion | 0–100% (40% during the final attorney phase) | Per-code deltas; exceeding the limit fails the run |
| Stress | run-persistent; 0 = overwork failure | |
| DP | run-persistent currency | |
| Trust | partner 0–3 | Skill thresholds |

**Outcome evaluation order — implement exactly this sequence:**
1. `FAILED` immediately (stress 0 / coercion over limit / turn limit / `NO_SOLVABLE_PATH`)
2. `COERCED_CONFESSION` immediately (composure hits 0)
3. At each turn end, check BEST conditions
4. When met, ONLY enable the [진술 확보] button — do not auto-end the encounter
5. `PARTIAL_RESOLUTION` when the turn limit is reached

Steps 3 and 4 must stay separate. "Conditions met ≠ automatic end; the player chooses explicitly" is the entire point of the sweet-spot design — collapsing them destroys it.

Note the distinction that is easy to get backwards: **coercion over limit → `FAILED`. Composure 0 → `COERCED_CONFESSION`.** They are different endings.

`NO_SOLVABLE_PATH` uses the `hasSolvablePath` algorithm and forces `FAILED` immediately — leaving a player in an unsolvable state is itself unfair.

### 3. ModifierSystem

Gimmicks are data: `Trigger` + `Condition` + `Effect` from a fixed catalogue. Free-form scripting is forbidden, and there is zero per-encounter code across all 9 encounters.

Three effects added beyond the base catalogue: `LOCK_CARD {selector, turns}` (Succubus seals 2 upgraded cards), `SEAL_EVIDENCE {selector, turns}` (attorney phase rejects out-of-scope evidence for 2 turns — reversible, unlike DAMAGE), `TRIGGER_QTE {qte_id, on_success, on_fail}` (Harpy invoice, Cyclops audio cache).

**Gimmick invariants**: a gimmick may change presentation, cost, time, integrity, resistance, and resources — nothing else. TruthGraph, settled states (SUPPORTED / REFUTED), original statement history, and resolution logic are untouchable. Any `REMOVE_EVIDENCE`-class effect runs a before/after solvable-path check as a runtime safety net. Randomness in `target_selector` may only be `SEEDED_RANDOM`.

FlowNode transitions T-1~T-6 use Claim-state enter conditions (`{"type":"CLAIM_EPISTEMIC","claim_id":"...","state":"REFUTED"}`). Composure percentage is a Trigger (`ON_COMPOSURE_THRESHOLD`) only — never an enter condition. T-6: when a FlowNode's `revise_claim_ids` modifies a COMMITTED claim, CONTRADICTED follows automatically, so "boss changes their story → instant self-contradiction" emerges from data with no code branch.

### 4. AI Dialogue Pipeline with Unstoppable Fallback (`src/ai/`)

Modules: `RequestBuilder` · `Provider` (abstract) · `OutputValidator` · `Cache` · `FallbackProvider`.
Concrete chain: `ClaudeApiProvider` (primary) → `CacheProvider` → `FallbackProvider`.

    interface DialogueProvider {
      renderStatement(req: StatementRequest): Promise<StatementResponse>;
      renderReaction(req: ReactionRequest): Promise<ReactionResponse>;
    }

**API key handling**: a browser cannot hold an API key. The static deployment is always the AI-off P0 build (fallback completes the game). Live AI runs via one of: Vite dev-server proxy (preferred, demo machine only) / a ~30-line Node sidecar proxy / cache-only replay with zero network. The judged deployment link is the P0 build plus cache replay; live variation happens only on the presentation machine.

**Request contract** — send exactly this and nothing more:
`speaker_profile` (including `forbidden_expressions`) + `allowed_claims[]` as `RenderableClaim { claimId, canonicalMeaning, facet }` + `presentation_groups` + `forbidden_information` + `seed`.
Reaction requests send `reaction_key` + `missing_scopes` + `composure_band` (HIGH / MID / LOW / CRITICAL).
NEVER send `truth_relation`, `ProofRule`, `Hypothesis`, or the exact composure number — an exact number lets the model narrate "you're almost broken", which leaks state. These fields must not exist on the AI-facing types at all, so the compiler enforces this rather than a code review.

**Output validation pipeline (7 stages)**:
1. JSON schema (Zod)
2. Every `claim_id` maps to an allowed claim
3. Atomicity — one claim per token, except where `presentation_groups` permits
4. Span integrity — spans match the body text and do not overlap
5. Allowed information — cross-check entities against the case dictionary, check time-expression range, cap out-of-token text length
6. Forbidden expressions — answer-implying vocabulary and the speaker's `forbidden_expressions` (e.g. "거짓말", "사실은")
7. Style consistency (sampled; WARNING only, never a hard fail)

Stages 3 and 4 are the "span-to-facet 1:1 failure → immediate fallback" rule.

**Unstoppable fallback transition**: on validation failure or timeout, retry once, then substitute the pre-authored fallback for the same `claim_id` from the case's dialogue data. The game never stops. Fallback lines carry the same `claim_id`/span structure as AI output and are pre-verified, so they are NOT re-validated at runtime. A concrete timeout threshold is not yet fixed — treat any value you pick as [초안] and make it a config key, not a literal.

If the validation failure rate exceeds 10%, fix the prompt — never loosen the validator.

**Cache and reproducibility**: log `request_id`, `seed`, `claim_ids`, `prompt_version`, `model_id`, validation result, `fallback_used`, `content_hash` per generation. Identical `content_hash` reuses the cache. Pre-generate and pre-verify the demo-critical segments (Slime full statement, Minotaur confession, final summation) into `content/ai-cache/` and replay them; generate live only in ordinary rounds.

**AI on/off log identity**: running the same seed and input sequence twice, once with AI and once without, must produce a byte-identical `JudgmentLog` (diff = 0). Architecturally this cannot fail — the test exists to detect that the architecture has been broken.

Write clean, robust TypeScript.
~~~

---

## 🧾 검증 로그 (v1.1, 2026-08-02)

| # | 이전 기술 | 교정 | 근거 |
|---|---|---|---|
| 1 | "8-Step Turn State Machine" 8개 상태로 기술 | 실제 상태 머신 전문(19상태) 복원. **8단계 턴은 기획 어휘**이며 M1에서 1:1 대응만 확인 | 개발 정본 §6.1 |
| 2 | 누락 상태: `ENTER_FLOW_NODE`·`EMIT_PUBLIC_DTO`·`APPLY_EFFECTS`·`RENDER_REACTION`·`CHECK_FLOW_TRANSITION`·`CHECK_OBJECTIVES` | 전량 추가 | §6.1 |
| 3 | **"Coercion Limit 초과 → COERCED_CONFESSION"** | **오류.** 강압 초과 = `FAILED`, 평정심 0 = `COERCED_CONFESSION` | §6.3 |
| 4 | Outcome 평가 순서 없음 | ①FAILED ②COERCED ③BEST 검사 ④버튼 활성화만 ⑤PARTIAL의 5단계 + ③④ 분리 필수 | §6.3 [상속] |
| 5 | "Sweet Spot → BEST Resolution option unlocks" | 자동 종료가 아니라 **[진술 확보] 버튼 활성화만**임을 명시 | §6.3 |
| 6 | Provider "OpenAI / Claude / Gemini / Local Proxy" | 실제 체인 `ClaudeApiProvider → CacheProvider → FallbackProvider` + 키 보호 3경로 | §8.1 |
| 7 | AI 입력이 `RenderableClaim` + 프로필뿐 | `presentation_groups`·`forbidden_information`·`seed`·`composure_band` 추가. **정확 평정심 수치 전달 금지** | §8.2 |
| 8 | 검증기가 "JSON + span" 2단계 | **7단계 파이프라인** 전문 + 실패율 10% 초과 시 프롬프트를 고침(검증기 완화 금지) | §8.3 |
| 9 | "타임아웃 >2000ms" | 정본에 수치 없음 — [초안] 표기 + 설정 키화 요구로 정정. 실제 규약은 재시도 1회 → 폴백 | §13.2 (수치 미규정) |
| 10 | 폴백 런타임 재검증 여부 불명 | 사전 검증분이므로 재검증하지 않음 명시 | §4.8 |
| 11 | ModifierSystem·FlowNode·기믹 불변 규칙 전체 누락 | Effect 3종 추가분·불변 규칙·`SEEDED_RANDOM`·T-6 자동 모순 추가 | §6.4, §6.5 |
| 12 | 자원표·전투별 평정심 수치 누락 | 9전투 평정심·CP·강압 한계 40% 추가 | §4.6, §6.3 |
| 13 | 캐시·재현성 필드 누락 | 8개 로그 필드 + `content/ai-cache/` 사전 생성 구간 추가 | §8.4 |
