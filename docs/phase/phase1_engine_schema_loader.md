# 📑 Phase 1: 심문 엔진 & Zod 스키마 / 데이터 로더 구현 프롬프트

> **[사용 방법]**: 5계층 타입 정의, Zod 스키마, 순수 함수 심문 엔진(`ArgumentResolver`), 데이터 로더를 구축할 때 사용합니다.
> **[대응 마일스톤]**: M0 (스키마 전량 동결) → M1 (Resolver + 조합표 전 행 + QA 12픽스처 green)

~~~markdown
Create the core TypeScript Domain Models, Zod Schemas, Argument Resolver Engine, and Content Loader for "[던전 수사 조서]".

### 1. Type Definitions & Schemas (`src/engine/domain/`, `src/content-io/schemas/`)

- `Facet`: 'WHO' | 'WHEN' | 'WHERE' | 'WHAT' | 'HOW' | 'WHY' (6 tags, fixed — the 16-facet expansion is NOT adopted)
- `ProofScope`: 'IDENTITY' | 'TIME' | 'LOCATION' | 'PRESENCE' | 'OWNERSHIP' | 'ACTION' | 'SEQUENCE' | 'ROUTE' | 'INSTRUCTION' | 'MOTIVE' | 'INTEGRITY' (11 scopes)
- `Grade`: 'A' | 'B' | 'C' — evidence ORIGINALITY grade, uncorrelated with truth value (so it is not a leak):
  - A: no adjustment
  - B: effective minimum independent sources raised to `max(rule.minimum_independent_sources, 2)` — a FLOOR, not a "+1"
  - C: sufficiency capped at `PROVISIONAL` (can never reach SUFFICIENT alone)

- **Claim 3-axis state model** — adopt the structure, use only the values the reference content requires:
  - `CommitmentState`: 'UNSTATED' | 'ASSERTED' | 'COMMITTED' | 'REVISED' | 'RETRACTED' | 'CONTRADICTED'
  - `EpistemicState`: 'UNKNOWN' | 'SUSPECTED' | 'PROVISIONAL' | 'SUPPORTED' | 'REFUTED' | 'UNRESOLVED'
  - `PresentationState`: 'NORMAL' | 'COMPOUND' | 'DISTORTED' | 'HIDDEN' | 'LOCKED' | 'DUPLICATED' (DUPLICATED is reserved — no content uses it)
  - Invariants I-1~I-5 as dev-build asserts. Critically **I-3: a Presentation change must never alter the other two axes** — this is the code expression of "enemy gimmicks never undo deduction".

- `ResolutionCode` — five evidence codes plus the action-family codes:
  - Evidence: `R_DIRECT_CONTRADICTION`, `R_INDIRECT_SUSPICION`, `R_INSUFFICIENT_GROUNDS`, `R_TRUTH_ATTACKED`, `R_IRRELEVANT_EVIDENCE`
  - Confirm family: `R_CONFIRM_LOCKED`, `R_CONFIRM_PROVISIONAL`, `R_CONFIRM_CONFLICT`
  - Action family: `R_QUERY_SUCCESS` (and per-Intent equivalents), `R_ACTION_INVALID` (carries `reason`, e.g. `SILENCE`), `R_PROCEDURE_VIOLATION`
  - Screen labels collapse these to four (직접 모순 / 간접 의심 / 불충분 / 진실 공격) via `judgment-ui-map.json`; `R_IRRELEVANT_EVIDENCE` renders as 불충분 with its own dedicated feedback string.

- `ActionIntent`: 8 adopted — QUERY, CLARIFY, CONFIRM, CONTRADICT, RECOVER, PRESSURE, FORENSIC, SPECIAL. `COMMIT` exists in the enum but is exposed only through the 「진술 고정」 clip. `CROSS_CHECK` is reserved in the enum with no implementation.

- Zod schemas (this is the SINGLE source of truth — derive TS types with `z.infer`, never hand-write a parallel interface):
  `case.json` (schema_version, case_id, metadata, entities, events, claims, inquiry_routes, evidence, proof_rules, encounters, events_noncombat, flag_hooks, dialogue), `cards.json` (14 cards), `balance.json`, `flags.json` (F-01~F-13 with `set_by` / `consumed_by`), `enhancements.json`, `relics.json`, `rewards.json`, `grades.json`, `judgment-ui-map.json`, save schema (with `save_version`).
  Export JSON Schema from the same Zod definitions so `content/**/*.json` can carry `$schema` for editor autocomplete.

- The `truth` block (`relation`, `contradicting_events`) exists ONLY on the TruthGraph-side type. The public `Claim` type must not declare it, so AI and UI code cannot reach it even by accident.

### 2. Argument Resolver Pure Engine (`src/engine/resolution/`)

Split into pure evaluators, each independently unit-testable:
`ActionValidator` · `EvidenceRelationEvaluator` · `ProofEvaluator` · `IndependenceEvaluator` · `ArgumentResolver` · `ResolutionEffectApplier`.
Only `ResolutionEffectApplier` mutates state; everything else is pure.

Implement the 10-step resolution order EXACTLY in this sequence:

    1  Action/target compatibility   → Validity      (INVALID ends immediately, CP not consumed)
    2  Target exposure               → Validity
    3  Evidence/claim relevance      → Relevance     (NONE ⇒ skip 4–8, settle R_IRRELEVANT_EVIDENCE)
    4  Support vs conflict direction → Relation
    5  Proof-scope coverage          → Sufficiency
    6  Confidence threshold          → Sufficiency
    7  Compound-evidence independence→ Independence
    8  Alternate-hypothesis removal  → (MVP: match against the ProofRule's explicit list only)
    9  Procedure appropriateness     → Procedure     (FORBIDDEN ⇒ R_PROCEDURE_VIOLATION)
    10 Lookup table → resolution code + effects

Axis semantics:
- Relevance NONE / PARTIAL / FULL = intersection of (union of submitted evidence `observations[].scopes`) with the target ProofRule's `required_scopes`.
- Relation SUPPORTS / CONTRADICTS / NEUTRAL / AMBIGUOUS = scope-set comparison + time-interval conflict check (`timeConflicts`: interval overlap combined with TRAVEL_TIME_MIN) + identical-ID comparison. **No semantic inference.**
- Sufficiency = `guaranteed_evidence_sets` first → `known_insufficient_sets` → semantic evaluation (required_scopes / minimum_confidence / independence) → `partial_credit`. This ordering is what lets a designer-unforeseen but valid combination still succeed.
- Independence MET / UNMET from the 3 fields `source_id` / `group` / `derived_from`, with the Grade-B floor applied.
- Procedure FAIR / COERCIVE / FORBIDDEN, injected by FlowNode/modifier conditions.

Resolution lookup table:
- Implement as a **type-safe code constant**, not a data file (externalising it is deferred to M5 only if tuning demands it).
- Include the supplementary row **(PARTIAL, CONTRADICTS, PROVISIONAL) → `R_INDIRECT_SUSPICION`**, required by QA4 and QA7.
- An axis combination that is not in the table must throw an **explicit exception** — never fall through to a silent default. Every table row plus the exception path is a unit test.

Effect application order is fixed and must not be reordered:
**resources → state → reveals → card effects → modifiers → objective check.**

Failure feedback must expose `coveredScopes` / `missingScopes` but NEVER which evidence would fill them, and never a secret evidence ID. The UI translates scope codes to Korean via `judgment-ui-map.json`.

LOCKED handling (QA9): a CONTRADICT against a `LOCKED` claim is intercepted at step 1 and returns `R_ACTION_INVALID` with `reason: "SILENCE"`, playing the right-to-silence reaction. Schema validation must guarantee every lock declares at least one unlock condition — a permanently locked claim is invalid content.

COMMITTED multiplier: when the target is COMMITTED and the code is `R_DIRECT_CONTRADICTION`, multiply the composure delta by `balance.committedMultiplier` and add 1 to the phase-transition weight.

### 3. Content Loader (`src/content-io/`)

Modules: `CaseRepository` · `CardRepository` · `BalanceRepository` · `FallbackRepository` · `SchemaValidator`.

- Load `content/common/*.json` and `content/cases/*/*.json` via `fetch()`. **`fetch` lives here, never in `src/engine/`** — the engine must stay headless so Node can run it for simulation.
- `balance.json` is fetched at runtime, not bundled by import, so editing the file and refreshing is the whole tuning loop.
- Validate with Zod before instantiating engine state. On failure emit a human-readable report: dev build refuses to load; release build skips the node and logs.
- Tier-1 content validation belongs here too: referential integrity (every ID reference resolves) and unlock-means existence.
- Saves persist runtime state only (`ClaimState`, `EvidenceState`, `DeckState`, `FlagStore`, resources, `run_seed`) plus `case_id` + `content_version`. Definition objects are never saved. Ship a `save_version` migration function from M1.

Write clean, modular TypeScript with detailed comments. No content ID literals anywhere in `src/engine/`.
~~~

---

## 🧾 검증 로그 (v1.1, 2026-08-02)

| # | 이전 기술 | 교정 | 근거 |
|---|---|---|---|
| 1 | 10단계 중 5~10번이 한 칸씩 밀림 (Sufficiency에 신뢰도 병합, 10번을 "Output 생성"으로 기술) | 정본 순서 복원: 5 범위 / 6 신뢰도 / 7 독립성 / 8 대안 가설 / 9 절차 / 10 조합표 조회 | 개발 정본 §5.1 |
| 2 | `ResolutionCode` 7종만 나열 | `R_CONFIRM_PROVISIONAL`·`R_CONFIRM_CONFLICT`·`R_QUERY_SUCCESS`·`R_ACTION_INVALID` 추가. D-1 "내부 5종 + 행동계, 표기 4종" 구조 명시 | §5.3, D-1 |
| 3 | 조합표 보완 행 누락 | (PARTIAL, CONTRADICTS, PROVISIONAL) → `R_INDIRECT_SUSPICION` 추가 | 부록 B † |
| 4 | 미정의 조합 처리 규정 없음 | **명시적 예외** 요구 추가 (조용한 기본값 금지) | §5.3 [결정], DR-3 |
| 5 | `resolution/`을 `ArgumentResolver.ts` 단일 파일로 기술 | 6개 평가기로 분해 + 상태 변경은 `ResolutionEffectApplier`만 | §3.1, §3.2 |
| 6 | 3축 상태 모델·불변식 I-1~I-5 누락 | 전 enum 값과 I-3 강조 추가 | §2.4 |
| 7 | 효과 적용 순서 누락 | 자원→상태→공개→카드→기믹→목표 고정 순서 추가 | §5.4 |
| 8 | `content-io`를 `CaseRepository.ts` 하나로 기술 | 5개 모듈 + fetch 경계(엔진 금지) 명시 | §3.1, §3.3 |
| 9 | Intent 목록 없음 | 8종 채택 + COMMIT 노출 축소 + CROSS_CHECK 예약 | §4.7, D-3 |
| 10 | Zod의 지위가 "검증용"으로만 기술 | 단일 원천 → `z.infer` + JSON Schema 내보내기(`$schema`) | §4.12 |
| 11 | LOCKED 해제 수단 검증 누락 | 영구 잠금 금지를 스키마 검증 항목으로 추가 | §5.6 |
| 12 | 세이브 규약 누락 | 상태 객체만 저장 + `save_version` 마이그레이션 M1부터 | §4.11, §9.1 |
