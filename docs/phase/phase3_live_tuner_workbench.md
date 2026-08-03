# 📑 Phase 3: 개발자 콘솔 & 기획자 라이브 튜너 프롬프트

> **[사용 방법]**: 재빌드 없이 게임 밸런스 수치(`balance.json`), 대사, 사건 데이터를 인게임 GUI에서 직접 수정 및 테스트하는 개발자 콘솔을 만듭니다.
> **[대응 마일스톤]**: M1 (12픽스처 인게임 재생) → M2 (`balance.json` 동결, G-15)
> **[선행 프로토타입]**: `dungeon_detective_workbench.html` — 튜너 필드 4종과 12 QA 버튼이 이미 동작합니다. 아래 사양은 그 확장판입니다.

~~~markdown
Implement the In-Game Developer Console (Live Tuning & QA Panel) for "[던전 수사 조서]".

### 0. Gating (non-negotiable)

- Toggle key: **backtick (`)**. Development build ONLY.
- Gate the entire console behind `import.meta.env.DEV` so the release bundle tree-shakes it away physically. The truth-overlay feature in particular must not merely be hidden — it must not exist in the shipped bytes.

### 1. Live Balance Tuner Panel

`balance.json` is fetched at runtime (never bundled by import), so editing the file and refreshing is already a complete tuning loop. The panel is the faster inner loop on top of that.

Editable keys — the full `balance.json` catalogue:

| Key | Initial | Note |
|---|---|---|
| `draw.initial` / `perTurn` / `handLimit` / `reshuffleOnEmpty` | 5 / 1 / 7 / true | [초안] D-6, highest tuning priority |
| `dmg.contradict` | **18** (confirmed) | CONTRADICT base composure damage |
| `dmg.pressure` / `requery` / `chainPursuit` | TBD | |
| `composureDmg.indirect` | TBD (small) | Direct damage uses `dmg.contradict`; insufficient and truth-attack are fixed at 0 |
| `shield.durabilityDefault` | TBD | |
| `coercion.insufficient` / `truthAttack` / `irrelevant` | 0–3 / 10–20 / 5–10 (TBD within range) | D-5 |
| `coercion.redStampFactor` / `goblinReflectFactor` / `breathReduce` / `finalConfirmReduce` | TBD / 2 / 4 / 3 | |
| `committedMultiplier` | 1.4 [초안] | Applied when a COMMITTED claim takes a direct contradiction |
| `independence.partialWeight` | 0.5 [초안] | |
| `sweetSpot.min` / `max` | 1 / 30 | Sweet-spot band, data-ised from the design constant |
| `stress.max`, `dp.initial` / `rewardBattle`, `partner.cooldowns.*` (6), `trust.max` / `thresholds`, `composure.regen.*` | TBD / TBD·20 / TBD / 3·[1,2] / TBD | |
| `overrides.byEncounter` | boss composure 120 / 140 / 180 | Overrides the value in case data — case-data numbers and this key overlap, and this key wins |

- "Apply Instantly" button: update `BalanceRepository` in memory without restarting the current turn.
- "Export JSON" button: download the edited `balance.json` for committing to the repository.
- Show a diff-vs-disk indicator so a planner never exports a file they thought they had already saved.

### 2. Case Data & Dialogue Editor Drawer

- Browse loaded claims, evidence observations (with their proof scopes), and fallback dialogue strings.
- Live-edit fallback dialogue text and replay the typewriter animation on stage.
- Flag malformed references and missing scopes in real time, mirroring the `tools/validate` T1–T2 rules so a planner sees the same error the CI will raise.
- Every Claim and every ReactionKey must have at least one fallback line (validation rule A-6). Surface that gap here rather than at build time.

### 3. 12 QA Fixture Replay Buttons

One-click launchers for the 12 gate fixtures, so the "re-run QA every time the sheet changes" regression takes under a minute inside the game:

| # | Submission | Expected |
|---|---|---|
| 1 | 국밥집 영수증(E401) → [어디서] 모순 지적 | `R_INSUFFICIENT_GROUNDS` + missing: TIME |
| 2 | GATE-04 출입 로그(E402) → 같은 태그 | `R_DIRECT_CONTRADICTION` |
| 3 | 전자 서명 23:07(E403) → [언제: 낮] | `R_DIRECT_CONTRADICTION` |
| 4 | 빨간 장부 협조비(E110) → [왜: 대가 없음] | `R_INDIRECT_SUSPICION` (independence UNMET, `min_sources: 2`) |
| 5 | 진실 태그에 모순 지적 | `R_TRUTH_ATTACKED` — damage 0, coercion +10~20% |
| 6 | 사실 확인 + 청소 근무표 | `R_CONFIRM_LOCKED` → Epistemic SUPPORTED |
| 7 | 붉은 복지비 영수증 단독 | `R_INDIRECT_SUSPICION` via `partial_credit` ratio 0.5 |
| 8 | 중복 거래 사본 B 단독 | effective min sources = max(1, 2) = 2, actual 1 → `R_INDIRECT_SUSPICION`; +1 independent evidence → DIRECT |
| 9 | 물컹이 잠금 [누가] 조기 공격 | `R_ACTION_INVALID(SILENCE)`; unlocks via partner skill or 2 confirmed truths |
| 10 | 오크 파쇄로 원본 소실 후 | `hasSolvablePath === true`; only that path goes UNRESOLVED |
| 11 | 변호인 페이즈 빨간 도장 | Procedure FORBIDDEN → `R_PROCEDURE_VIOLATION` → immediate loss |
| 12 | 최종 3라운드: 증언 B 단독 / +원격지시 헤더 | 단독 `R_INSUFFICIENT_GROUNDS` → 병용 `R_DIRECT_CONTRADICTION` |

Each button must assert the resolved axes too — not just the code — because a right answer reached through wrong axes is the bug this suite exists to catch.

### 4. Remaining Console Features

Truth overlay (internal judgment per tag — dev only, tree-shaken from release) / resource cheats / node jump / manual composure and coercion adjustment / **AI on-off runtime toggle** (must work even in the P2 build so a live demo can be cut instantly) / JudgmentLog viewer / flag viewer and toggles (F-01~F-13) / QTE auto-success switch.

Write fully functional UI code for this dev panel.
~~~

---

## 🧾 검증 로그 (v1.1, 2026-08-02)

| # | 이전 기술 | 교정 | 근거 |
|---|---|---|---|
| 1 | 핫키 "`~` 또는 `F12`" | **백틱(`)** 단일. 개발 빌드 전용 + 릴리스 트리 셰이킹 물리 제거 | 개발 정본 §10.4, §2.5 |
| 2 | balance 키 6개만 나열 | 부록 C 전 카탈로그(15행)로 확장, TBD/[초안] 상태 표기 | 부록 C |
| 3 | QA#5 "Coercion +15%" 단정 | 정본은 **10~20% 범위 내 TBD**. 프로토타입의 15는 [초안]값 | §5.4, D-5 |
| 4 | QA#7 "Partial Credit 0.5"만 기술 | `partial_credit.scopes_covered_ratio` 0.5 → `result: SUSPECTED` 경로임을 명시 | §4.5, 부록 B |
| 5 | QA#12 "Dual source requirement" | 단독=불충분 / 병용=직접 모순의 2단 기대값 명시 | 부록 B #12 |
| 6 | QA 버튼이 코드만 검사 | **축 값 5종까지 단언** 요구 추가 | §9.4, §12.1 |
| 7 | 개발자 콘솔 기타 기능 누락 | truth 오버레이·노드 점프·AI 토글·로그 뷰어·플래그 토글·QTE 스위치 추가 | §10.4, §9.3 |
| 8 | 대사 에디터에 폴백 최소 1개 규칙 없음 | 검증 A-6 반영 | §4.8, §10.2 |
| 9 | 튜너와 `balance.json` 로딩 규약의 관계 불명 | 런타임 fetch가 기본 루프이고 패널은 그 위의 단축임을 명시 | §4.9 |
| 10 | `overrides.byEncounter` 우선순위 불명 | case 데이터 수치보다 우선함을 명시 | §4.9 |
