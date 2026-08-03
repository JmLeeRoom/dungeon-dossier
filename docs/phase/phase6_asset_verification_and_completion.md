# 📑 Phase 6: 애셋 교체 기반 게임 검증 & 완수 프롬프트 (Verification & Asset-Driven Completion)

> **[사용 방법]**: Phase 0~5 구현 후, 기획자가 애셋을 교체하며 15노드 게임을 최종 검증하고 완전한 빌드로 완성시키기 위해 사용합니다.
> **[대응 마일스톤]**: M3 (15노드 완주 + 사건 추가 코드 0건 게이트) → M4 (AI 게이트) → M5 (밸런싱·릴리스·프리셋 세이브)

~~~markdown
Perform End-to-End Verification and Asset-Driven Completion for "[던전 수사 조서]".

We are validating and polishing the entire codebase built during Phase 0 to Phase 5.
The focus: GAME DESIGNERS must be able to swap assets, modify JSON data, and verify gameplay from Tutorial through EP004 without touching engine code.

---

### 🔍 Part 1: Asset Pipeline Audit

1. **Loader and naming**
   - Every asset follows `카테고리_이름_상태.png` and the loader PARSES those filenames to build its category/state registry. Confirm no hand-maintained manifest exists — adding an asset must be a file drop, not a code edit.
   - Portrait composition: base sprite + parts overlay (brow / sweat / mouth) driven by a coordinate JSON (`portrait_물컹이_base.png` + `portrait_물컹이_parts.png` + `portrait_물컹이.parts.json`).
   - Missing asset → placeholder renders, console warns, **build still passes**. Verify `tools/placeholder` regenerates the silhouette+nameplate set from the character list.

2. **Planner workbench (製作 단계 도구, not the runtime)**
   - Verify the `<image-slot>` workbench still opens and lets a planner drop PNGs onto the measured slot layout: `bg-room` 640×400 · `portrait-base` 196×216 · `portrait-parts` 96×40 · `fg-desk` 640×118 · `card-art-1`~`3` 56×44 · `ev-1`~`3` 36×36 · `icon-composure` / `icon-coercion` 16×16 · `partner`.
   - Confirm its output lands as ordinary files under `assets/`. The shipped game has no runtime upload path — do not add one.

3. **Pixel art & palette audit**
   - Internal resolution locked at 640×400, `floor(min(w/640, h/400))` integer scaling + letterbox, global NEAREST, anti-aliasing absent.
   - `tools/palette-check` fails CI when any scene asset exceeds 16 colours. The runtime performs no colour check — it trusts the pipeline.
   - Episode palette variants are **three pre-baked background PNGs** (cyan / sepia / magenta family), not a shader or LUT. Confirm no runtime palette-swap filter has crept in.

---

### 🧪 Part 2: Zero-Code-Change Moddability Audit

1. **Engine decoupling — the M3 gate**
   - `test_no_hardcoded_content_ids`: zero literals matching `case_|clm_|ev_|ent_|enc_` in `src/engine/**`.
   - The real gate is measured **by git**: the commits that introduce EP001 and EP004 must have a diff that touches nothing outside `content/` and `assets/`. Label bug-fix commits separately so they do not contaminate the measurement.
   - dependency-cruiser green: `ui` never imports `engine`; `ai` cannot reach truth-family types.

2. **Live balance tuner**
   - Open the dev console with the **backtick (`)** key (dev build only).
   - Change `dmg.contradict` from 18 to 25 → the next resolution deals 25 composure damage with no restart.
   - Click "Export JSON" → a valid `balance.json` downloads for committing.
   - Separately confirm the no-console path: edit `content/common/balance.json` on disk and refresh. It is fetched at runtime, so the refresh alone must apply it.
   - Verify the release build contains no console code at all (tree-shaken, not merely hidden).

3. **Fallback dialogue hot-reload**
   - Edit a fallback string in the tutorial dialogue data → the typewriter renders the new text live.
   - Confirm every Claim and ReactionKey still has at least one fallback line (rule A-6).

---

### 🎯 Part 3: Automated QA Suite Execution

1. **12 QA fixtures** (`tests/judgment/12fixtures.test.ts`) — 100% green, asserting axis values, not just codes:
   QA#1 국밥집 영수증 → `R_INSUFFICIENT_GROUNDS` + missing TIME / QA#2 GATE-04 로그 → `R_DIRECT_CONTRADICTION` / QA#3 전자 서명 23:07 → `R_DIRECT_CONTRADICTION` / QA#4 빨간 장부 → `R_INDIRECT_SUSPICION` (min_sources 2) / QA#5 진실 공격 → `R_TRUTH_ATTACKED`, damage 0, coercion +10~20% / QA#6 청소 근무표 → `R_CONFIRM_LOCKED` / QA#7 복지비 단독 → `R_INDIRECT_SUSPICION` (partial_credit 0.5) / QA#8 사본 B → `max(1,2)=2` / QA#9 물컹이 잠금 → `R_ACTION_INVALID(SILENCE)` / QA#10 파쇄 → `hasSolvablePath = true` / QA#11 빨간 도장 → `R_PROCEDURE_VIOLATION` / QA#12 최종 교차검증 → 단독 불충분, 병용 직접 모순.

2. **27-cell route matrix + flag scenarios**
   - 9 encounters × 3 outcomes (BEST / COERCED / PARTIAL): zero infinite loops, zero unhandled exceptions, 15/15 nodes reachable.
   - 13 flags × on/off = 26 smoke scenarios pass.
   - `test_deterministic_replay`: identical seed and inputs → byte-identical judgment log.

3. **Leakage suite**: forbidden fields absent, true/lie DTO field sets identical, resistance-vs-truth `|r| ≤ 0.5`.

4. **M4 AI gate**: AI on/off judgment log diff = 0, validation failure rate < 10% (submit the aggregated log report).

---

### 🎨 Part 4: Asset Injection Workflow (Final Polish)

Replace placeholders with final assets, in cut-resistant order. **Cannot be cut: 취조실 배경 1, 태그 칩 세트, 카드 프레임, 물컹이·하피·미노타우로스 포트레이트, 타자기·도장 SFX.**

- **Step 4.1 — 캐릭터 12벌** (base + expression parts):
  일반 6 (물컹이 · 하피 · 고블린 · 오크 · 드워프 · 사이클롭스) / 보스 3 (미노타우로스 · 서큐버스 · 타락한 용사, 각 파츠 4 + 동요·자백 특수 1) / NPC 3 (김태훈 미니 2단계 · 김 인턴 2상태 + 부글거림 3프레임 · 켄타우로스).
  12벌은 1인+AI 파이프라인 기준 상한선이다. 최소 세트는 물컹이·하피·미노타우로스 3벌.
- **Step 4.2 — 배경**: 취조 구도 공용 배경 1장 + 에피소드 팔레트 3장(사전 베이크). 보스 배경 변주(임원 라운지 / 개통식장)는 P2이며, 컷 시 팔레트 스왑으로 대체.
- **Step 4.3 — 카드·UI**: 결재 서식 카드 프레임(9-slice) + 도장 2종(파랑·빨강, 인주 번짐) + 포스트잇·클립 표식. **카드 일러스트는 만들지 않는다** — 텍스트 + 분류 아이콘 4종(질문 / 확인 / 모순 / 조절)뿐.
- **Step 4.4 — 증거 아이콘**: **공용 6종**(문서 · 영수증 · 사진 · 열쇠 · 데이터 · 녹음) + **개별 4종**(찢어진 배달표 · 빨간 장부 · 슬래그 합금 파편 · VIP 티켓) = **10점**. 35개 증거 항목을 개별 제작하는 것은 명시적으로 금지되어 있다.
- **Step 4.5 — 사운드**: 🔊 SFX 12종(타자기 타건·리턴 / 도장 쾅 / 카드 스냅 / 종이 넘김 / 방어막 파괴 / 문 두드림 / 노크 3연타 / QTE 성공·실패 / 셔플 거품 / 파쇄기 / CRT 전환) + 🎵 BGM 4곡(심문 FM 재즈 / 보스 브라스 / 이벤트·수사 앰비언트 / 엔딩) + 스팅어 2(자백 · 검거). 강제 자백의 **BGM 뮤트**는 애셋이 아니라 오디오 연출이다.

총량 기준: 이미지 약 60점 / 🎬 8종 / ✨ 5종 / 🔊 12 + 🎵 4+2.
컷 순서: 엔딩 컷 → 보스 배경 변주 → 이벤트 공용 컷 4→2 → 일반 용의자 표정 파츠 3→2 → 오크·드워프·사이클롭스 포트레이트 실루엣 대체 → BGM 4→2.

---

### 📦 Part 5: Release (M5)

- Tune using `balance.json` and case numeric fields ONLY — code is frozen at this point.
- Produce 5–6 preset saves (one before each episode boss) so the demo can jump to any of the 15 nodes and rehearse.
- Deliverables: a static hosting URL (instant play), the same build as a zip, and optionally an Electron wrap. The judged link is the P0 build (fallback-complete, no network) plus AI cache replay.
- Confirm the design metrics from the judgment log: ordinary encounters 6–10 turns, bosses 10–16 turns; true-ending conditions reproducible.

Upon completing every audit step, confirm:
"End-to-End Verification Complete! 던전 수사 조서 is validated, fully playable offline via fallback, and moddable by designers through JSON data and asset file replacement."
~~~

---

## 🧾 검증 로그 (v1.1, 2026-08-02)

| # | 이전 기술 | 교정 | 근거 |
|---|---|---|---|
| 1 | **"Upload 37 Evidence Icons"** | **오류 — 정본이 명시적으로 금지한 항목.** 공용 6 + 개별 4 = **10점**. "35항목 개별 제작 금지" | 기획 정본 §8.5 |
| 2 | "Palette Swap Filter 호환성 검사" | 사전 베이크 PNG 3장. **런타임 필터가 생겼는지를 오히려 검사**하도록 반전 | 개발 정본 §7.1 [결정] |
| 3 | "BGM Tracks (…, Mute effect)" — 뮤트를 트랙으로 계상 | BGM 4곡 + 스팅어 2. 뮤트는 오디오 연출 | 기획 정본 §8.6 |
| 4 | 캐릭터 12종 목록 | ✅ 정확 (일반 6 + 보스 3 + NPC 3). 파츠 수·최소 세트·상한선 근거 보강 | 기획 정본 §8.3 |
| 5 | `card-art-1`~`4` | 목업 실측은 1~3. 카드 분류 아이콘은 4종(질문/확인/모순/조절)으로 별개 항목 | 목업 실측, 기획 §8.5 |
| 6 | "Data URLs를 localStorage/IndexedDB에 저장·재부팅 복원" 검증 | 실제 구현은 사이드카 단독이며, **출하 빌드에는 업로드 경로가 없음**. 검증 항목을 `assets/` 파일 산출로 교체 | `image-slot.js` 실측, §11.1 |
| 7 | M3 게이트를 grep만으로 측정 | **git diff 측정**(EP001·EP004 커밋이 `content/`·`assets/` 밖을 안 건드림)이 정본 게이트 | §15 M3 |
| 8 | 튜너 핫키 `~` | 백틱(`), 개발 빌드 전용, 릴리스 트리 셰이킹 확인 추가 | §10.4, §2.5 |
| 9 | 무콘솔 튜닝 경로 누락 | 파일 수정 + 새로고침만으로 반영(런타임 fetch) 검증 추가 | §4.9 |
| 10 | 플래그 26 시나리오·결정론 리플레이·누설 검사·M4 게이트 누락 | Part 3에 추가 | §10.3, §12.3, §12.4, §8.5 |
| 11 | 릴리스·시연 산출물 절 없음 | Part 5 신설 (프리셋 세이브 5~6, 제출물 3종, §10.6 지표) | §9.2, §14.2, §15 M5 |
| 12 | 카드 일러스트 제작을 전제 | **만들지 않음**(텍스트+분류 아이콘)이 확정 정책임을 명시 | 기획 §8.5 |
| 13 | 컷 순서·컷 불가 목록 없음 | 추가 | 기획 §8.7 |
