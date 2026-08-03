# 📑 Phase 5: 검증 스위트 & 시뮬레이터 (CI/CD QA) 프롬프트

> **[사용 방법]**: 판정 12 픽스처, 27셀 매트릭스 시뮬레이터, 누설·아키텍처 검사 자동화를 생성할 때 사용합니다.
> **[대응 마일스톤]**: M1 (12픽스처 green = 통과 게이트) → M3 (27셀·플래그 시뮬레이션 완비, 검증기 T3)

~~~markdown
Create the Automated Verification Suite and Simulation Engine for "[던전 수사 조서]".

Test directory layout (mirror it exactly — each directory is a distinct gate):

    tests/
    ├─ judgment/     12 fixtures + full resolution-table coverage
    ├─ routes/       27-cell matrix
    ├─ flags/        13 flags × on/off
    ├─ leakage/      DTO forbidden fields, truth/lie structural identity, resistance correlation
    ├─ ai-contract/  A-1~A-7 + forced-failure fallback transition
    └─ arch/         dependency rules + content-ID literal detection

### 1. Unit Layer (`tests/judgment/`)

Synthetic data, no case files needed:
- **Every row of the resolution lookup table**, plus the undefined-combination path, which must throw an explicit exception rather than returning a default.
- The supplementary row (PARTIAL, CONTRADICTS, PROVISIONAL) → `R_INDIRECT_SUSPICION`.
- Grade rules: A no adjustment / B floor `max(rule.min, 2)` / C sufficiency capped at PROVISIONAL.
- Independence computation from `source_id` / `group` / `derived_from`.
- `timeConflicts`: interval overlap combined with TRAVEL_TIME_MIN.

### 2. The 12 QA Fixtures (`tests/judgment/12fixtures.test.ts`)

The M1 pass gate and a permanent regression suite — CI re-runs it on every content edit. Assert the resolution code AND all five axis values; a right answer via wrong axes is exactly the bug this catches.

| # | Submission | Axes (relevance / relation / sufficiency / independence) | Expected |
|---|---|---|---|
| 1 | 국밥집 영수증(E401) → [어디서: 밤에 자택] | PARTIAL / AMBIGUOUS / INSUFFICIENT / — | `R_INSUFFICIENT_GROUNDS`, `missingScopes` includes TIME. Registered in `known_insufficient_sets` as a deliberate trap |
| 2 | GATE-04 출입 로그(E402) → same tag | FULL / CONTRADICTS / SUFFICIENT / MET | `R_DIRECT_CONTRADICTION` |
| 3 | 전자 서명 23:07(E403) → [언제: 낮] | FULL / CONTRADICTS / SUFFICIENT / MET | `R_DIRECT_CONTRADICTION` |
| 4 | 빨간 장부(E110) → [왜: 대가 없음] | FULL / CONTRADICTS / SUFFICIENT / **UNMET** | `R_INDIRECT_SUSPICION` (`min_sources: 2`, submitted 1) |
| 5 | Truth-tag contradiction | FULL / **SUPPORTS** / SUFFICIENT / — | `R_TRUTH_ATTACKED`, damage 0, coercion +10~20% |
| 6 | CONFIRM + 청소 근무표 | FULL / SUPPORTS / SUFFICIENT / MET | `R_CONFIRM_LOCKED` → Epistemic SUPPORTED |
| 7 | 붉은 복지비 영수증 단독 | PARTIAL / CONTRADICTS / **PROVISIONAL** (partial_credit 0.5) / — | `R_INDIRECT_SUSPICION` (supplementary row) |
| 8 | 중복 거래 사본 B 단독 | FULL / CONTRADICTS / SUFFICIENT / **UNMET** | `R_INDIRECT_SUSPICION`; adding 1 independent evidence flips to MET → DIRECT |
| 9 | 물컹이 잠금 [누가] 조기 공격 | intercepted at Validity | `R_ACTION_INVALID(SILENCE)`; after unlock, same submission resolves DIRECT |
| 10 | 오크 파쇄로 원본(E108) 소실 | — | `hasSolvablePath === true`; only that path goes UNRESOLVED, play continues |
| 11 | 변호인 페이즈 빨간 도장 / 범위 밖 증거 | Procedure = **FORBIDDEN** | `R_PROCEDURE_VIOLATION` → immediate loss; out-of-scope → SEAL_EVIDENCE 2 turns |
| 12 | 최종 3라운드: 증언 B(E413) 단독 / +원격지시 헤더(E409) | 단독 PARTIAL / CONTRADICTS / INSUFFICIENT → 병용 FULL / CONTRADICTS / SUFFICIENT / MET | 단독 `R_INSUFFICIENT_GROUNDS` → 병용 `R_DIRECT_CONTRADICTION` |

### 3. Simulation (`tools/simulate/`, `tests/routes/`, `tests/flags/`)

The engine is headless, so Node runs it directly. Transcribe each encounter sheet's "alternate path" column into a policy script (a card / tag / evidence submission sequence).

- Shortest-path policy → confirm `BEST_RESOLUTION` is reachable. This is the single most powerful check in the suite.
- Policy variants (coercion-inducing, partial-ending) → fill the **27-cell matrix** (9 encounters × 3 outcomes: BEST / COERCED / PARTIAL) with zero infinite loops and zero unhandled exceptions.
- Load all 13 flags on/off → **26 smoke scenarios**, verifying `set_by` / `consumed_by` linkage (e.g. false confession → boss shield +1) works with no engine branching.
- Budget: under 1 second per encounter; whole run under 5 minutes. CI runs the smoke subset; the full 27-cell sweep runs nightly.

### 4. Leakage & Determinism (`tests/leakage/`)

- Forbidden-field absence: walk `PublicDTO` keys and confirm `truth_relation`, `proof_rules`, `is_lie` and their kin never appear (F-2 family).
- **Truth/lie structural identity**: serialize the `PublicDTO` of a true claim and a false claim and compare the FIELD SETS — they must be identical, or the UI could tell them apart.
- Resistance-vs-truth correlation: Pearson r across every claim in the case data; `|r| > 0.5` is an ERROR. Shield durability must not correlate with whether a claim is a lie.
- `test_deterministic_replay`: same seed and input sequence run twice → byte-identical judgment log.

### 5. Architecture (`tests/arch/`)

- `test_no_hardcoded_content_ids`: fail if any string literal matching `case_|clm_|ev_|ent_|enc_` appears in `src/engine/**`. This is the standing sentry for the M3 "zero code change per case" gate.
- dependency-cruiser rules: `ui` must not import `engine`; `ai` must not reach truth-family types; `engine/**` must not use `pixi.js`, `howler`, `window`, `document`, `fetch`, `Date.now`, `Math.random`.
- State invariants I-1~I-5 as dev-build asserts, especially I-3 (a Presentation change never alters the other two axes).

### 6. Content Validator (`tools/validate/`)

- **T1 (M0, required)**: full Zod schemas + L-7 referential integrity (every ID reference resolves) + every lock declares an unlock means.
- **T2 (M1~M2, required)**: L-1 (required claims have a ProofRule) · L-2 (referenced evidence is obtainable) · L-3/P-1 (question routes and FlowNodes are reachable) · P-3 (a solvable path survives the worst-case shred/burn scenario — QA10 automated) · P-6 (path graph is acyclic).
- **T3 (M3~M4)**: L-4 (guaranteed sets actually satisfy their scope requirements) · F-1 · F-2 · A-1~A-7 (AI contract).
- Failure handling: ERROR = build failure / load refusal in dev / node skip + log in release. Release trusts the pre-verified content and does not re-validate.

### 7. CI (GitHub Actions)

    push/PR → 1 lint + dependency-cruiser
              2 vitest (unit, fixtures, leakage, ai-contract, arch)
              3 tools/validate (content T1~T3)        ← required when content/** changes
              4 tools/simulate (smoke: BEST reachability, replay)  ※ full 27-cell is nightly
              5 palette-check (when assets/** changes)
              6 build (P0 configuration)

Provide complete runnable Vitest test files.
~~~

---

## 🧾 검증 로그 (v1.1, 2026-08-02)

| # | 이전 기술 | 교정 | 근거 |
|---|---|---|---|
| 1 | 테스트 디렉토리가 `judgment/`·`leakage/` 2개뿐 | 정본 6개 구조(`judgment`·`routes`·`flags`·`leakage`·`ai-contract`·`arch`) 복원 | 개발 정본 §3.1 |
| 2 | 리터럴 탐지를 `leakage` 테스트 안에 배치 | **`arch/`로 이동** — 누설 검사와 아키텍처 검사는 별개 게이트 | §3.1, §12.1 |
| 3 | 유닛 층(조합표 전수·미정의 조합 예외·등급·독립성·timeConflicts) 누락 | 추가 | §12.1 |
| 4 | 픽스처가 코드만 단언 | **축 값 5종 전부 단언** + 부록 B 축 도출표 전재 | 부록 B |
| 5 | 플래그 13종 × on/off = 26 시나리오 누락 | 추가 | §10.3, 기획 §10.3 |
| 6 | 27셀을 CI 전수 실행으로 기술 | CI는 스모크, **27셀 전수는 nightly** | §12.5 |
| 7 | 누설 검사가 "금지 필드 부재"뿐 | **진실/거짓 DTO 필드 집합 동일성**·저항도 상관 \|r\|>0.5 추가 | §12.4 |
| 8 | 콘텐츠 검증기 T1~T3 전체 누락 | 티어별 규칙·시점·실패 처리 추가 | §10.2 |
| 9 | CI 파이프라인 누락 | 6단계 구성 추가 | §12.5 |
| 10 | QA#5 강압 "+15%" 단정 | 10~20% 범위(TBD)로 정정 | §5.4, D-5 |
| 11 | QA#7 결과 코드 근거 불명 | 조합표 보완 행(PARTIAL/CONTRADICTS/PROVISIONAL) 명시 | 부록 B † |
| 12 | 시뮬레이터 예산·정책 스크립트 개념 없음 | 전투당 <1초 / 전체 5분, 시트 "대체 경로" 열 전사 방식 추가 | §10.3, §13.1 |
