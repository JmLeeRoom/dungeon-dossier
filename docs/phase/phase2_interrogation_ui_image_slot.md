# 📑 Phase 2: 인터랙티브 취조실 UI & 기획자 애셋 워크벤치 프롬프트

> **[사용 방법]**: 640×400 도트 정수 스케일 뷰포트, PixiJS 렌더러, 기획자용 애셋 교체 워크벤치를 구축할 때 사용합니다.
> **[대응 마일스톤]**: M1 (심문·조서 화면 P0 위젯 + 플레이스홀더 규격 확정)

> ⚠️ **`<image-slot>` 드래그앤드롭의 지위** — 저장소의 `Kim_detective/image-slot.js`와 목업 HTML은 **제작 단계 워크벤치**이며 게임 런타임이 아닙니다. 실제 게임의 애셋 경로는 `assets/` 파일명 파싱 로더(개발 정본 §11.1)입니다. 아래 Part 3은 기획자가 시안을 얹어보는 별도 도구로 유지하고, PixiJS 빌드가 이 HTML을 이식하지 않도록 하세요.

~~~markdown
Build the Interrogation UI Canvas and the planner-facing asset workbench for "[던전 수사 조서]".

### 1. 640×400 PixiJS Stage (`src/ui/core/`)

- Internal stage resolution fixed at 640×400. Scale to the window with `floor(min(w/640, h/400))` integer upscaling plus letterboxing — never fractional.
- Global texture filter `NEAREST`. Anti-aliasing is forbidden; dot stair-stepping must survive.
- 16 colours per scene. This is enforced by `tools/palette-check` in CI, and TRUSTED at runtime — do not write a runtime colour-count check.
- Episode palette variants (cyan / sepia / magenta) ship as **three pre-baked background PNGs**, not a shader or LUT filter. The variant target is one interrogation background, so a filter's implementation and verification cost is not justified.
- Animation is limited to 3–4 frames, implemented as spritesheet frame-index cycling. No tween library.
- Text: one bitmap dot font including Hangul. Long text (dossier, cards) uses a bitmap-font sprite cache. Font licence must be confirmed at M1.
- `src/ui/core/` owns: scene manager, the 640×400 stage, the integer scaler, and input. **All animation timing lives in `ui/` — the engine has no clock.**

### 2. Interrogation Screen (`src/ui/screens/interrogation/`) — P0

Layout (the mockup's measured geometry is authoritative):

| Region | Geometry | Contents |
|---|---|---|
| HUD bar | y 0–26 | Suspect name plate, Composure gauge with the **1–30% sweet-spot notch** (shown once unlocked), Coercion clipboard (accumulating warning slips), turn count |
| Portrait | 196×216 @ (222, 40) | Base sprite + expression parts overlay 96×40 @ (272, 84) — brow / sweat / mouth |
| Statement window | mid stage | Typewriter character streaming with caret + keystroke SFX |
| Tag board | below statement | 6 Facet chips (WHO/WHEN/WHERE/WHAT/HOW/WHY) × 4 states (기본 / 방어막 / 파훼 / 흔들림) |
| Desk foreground | 640×118 @ (0, 282) | Partner seat (김 인턴), evidence pouch (3 slots), card fan, typewriter = end-turn button |
| Status strip | bottom | CP coffee cups, stress value, dossier open button |

Critical constraints:
- **Shields must be visually identical.** The widget receives only `PublicDTO.tokens[].resistance` (a durability number). The internal shield type (모순 / 자신감 / 사생활) does not exist in the DTO, so there is literally no way to draw them differently. Do not add a type field to "make it nicer".
- Tag chip state is a DERIVED display function of `(EpistemicState, PresentationState)` — never a stored UI flag.
- Typewriter streaming doubles as AI-latency concealment: start emitting as soon as a streaming response arrives, and use the exact same animation on fallback so the player cannot tell which path ran.
- Resolution/ending direction (5 kinds — 폴라로이드 / 송치 도장 / BGM 뮤트 / 명함+노크 / 과로) is driven by a `ResolutionCode`→direction-key and `OutcomeCode`→direction-key table, not by branching code.
- Mouse alone must complete a run (card click → tag click → evidence check → submit). Keyboard is secondary (space to advance, number keys for cards).

### 3. Dossier Screen (`src/ui/screens/dossier/`) — P0

Opens as a zero-cost overlay during FREE_REVIEW. Every call it makes must be a pure query — no engine state may change.
Each evidence entry shows: title, its `observations[].scopes` (proof scope list), and the **"입증하지 못하는 것"** line from `not_proven_keys`. Attachment selection happens here.
Display boundary: scope list, what it cannot prove, and costs ARE shown. Whether a set is the correct answer, or a prediction that a contradiction will land, is NOT.

### 4. Widgets (`src/ui/widgets/`)

`tagchip` · `shield` · `cardfan` · `typewriter` · `portrait` · `gauge` · `evidence-tray`.
Keep PixiJS dependency thin: logic goes in plain display functions so the renderer can be swapped for Canvas2D if PixiJS becomes a schedule risk (DR-1).

### 5. Planner Asset Workbench (separate tool, NOT the game runtime)

A standalone HTML page reusing the `<image-slot>` custom element so a designer can drop PNGs onto the stage layout and judge composition before final assets exist.

- Slots and measured sizes: `bg-room` 640×400 · `portrait-base` 196×216 · `portrait-parts` 96×40 · `fg-desk` 640×118 · `card-art-1`~`card-art-3` 56×44 · `ev-1`~`ev-3` 36×36 · `icon-composure` / `icon-coercion` 16×16 · `partner`.
- Persistence in the current reference implementation is a `.image-slots.state.json` sidecar (fetch to read, host bridge to write). If you re-host this workbench outside that environment, swap the persistence adapter for `localStorage` — do not claim IndexedDB support that is not implemented.
- Include a "Tweak Mode" toggle so a planner can nudge slot bounds and expression-part X/Y live, and export the adjusted coordinates as the portrait parts JSON that `assets/` consumes.
- Output contract: whatever the workbench produces must land as ordinary files under `assets/` following `카테고리_이름_상태.png`. The game loader parses those filenames to build its category/state registry — there is no hand-written manifest and no runtime upload path in the shipped build.
- Missing assets must never block the build: `tools/placeholder` generates silhouette+nameplate PNGs, and a missing asset renders the placeholder with a console warning.

Implement complete working TypeScript component code with the drag-and-drop file readers for the workbench.
~~~

---

## 🧾 검증 로그 (v1.1, 2026-08-02)

| # | 이전 기술 | 교정 | 근거 |
|---|---|---|---|
| 1 | "16-Color Palette Swap **filter** support (Tutorial Sepia, Ep001 Magenta, Ep004 Cyan)" | **사전 베이크 PNG 3장**으로 정정. 에피소드↔색상 배정은 정본에 없으므로 임의 매핑 삭제(시안/세피아/마젠타 계열 3종만 확정) | 개발 정본 §7.1 [결정], 기획 정본 §8.4 |
| 2 | `<image-slot>`을 게임 런타임 컴포넌트(`src/ui/widgets/ImageSlot.ts`)로 기술 | **제작 단계 워크벤치**로 분리. 런타임 애셋 경로는 파일명 파싱 로더 | §11.1, §10.5 |
| 3 | "Persist ... in `localStorage` or IndexedDB" | 실제 구현은 `.image-slots.state.json` 사이드카 단독. IndexedDB 미구현 — 표기 삭제 | `Kim_detective/image-slot.js` 실측 |
| 4 | `card-art-*` 개수 불명 | 목업 실측 1~3 (카드 분류 아이콘 4종 질문/확인/모순/조절과는 별개) | 목업 HTML 실측, 기획 정본 §8.5 |
| 5 | `icon-composure`·`icon-coercion`·`partner` 슬롯 누락 | 추가 | 목업 HTML 실측 |
| 6 | 정수 배율 공식 없음 | `floor(min(w/640, h/400))` + 레터박스 | §7.1 |
| 7 | 방어막 동일 외형 제약 누락 | DTO에 `resistance`만 존재 → 다르게 그릴 방법 자체가 없음을 명시 | §7.3, 기획 §10.4 |
| 8 | 조서(Dossier) 화면이 "Evidence Tray" 수준으로 축소 | P0 독립 화면 + FREE_REVIEW 순수 조회 + `not_proven` 필수 표기 + 표시 경계 | §6.2, §7.2 |
| 9 | 애셋 누락 시 처리 없음 | `tools/placeholder` + 플레이스홀더 렌더 + 빌드 통과 | §10.5, §13.2 |
| 10 | 태그 칩 상태를 저장 플래그처럼 기술 | ClaimState 조합에서 파생하는 표시 함수로 정정 | §7.3 |
