# 📑 던전 수사 조서: Claude 전용 에피소드 3단계 흐름 & 3노드 Fog-of-War 국소 공개 구현 마스터 프롬프트

> **[사용 방법]**: 본 마스터 프롬프트를 **Claude (Anthropic Claude 3.5 Sonnet / 3.7 Opus)** 코딩 에이전트에 전달하여, `docs/design/episode_progression_and_node_visibility_analysis.md` 설계 문서에 명시된 에피소드별 `Combat → Event → Boss` 3단계 시퀀스 재편성, 3노드 단위 국소 공개(Fog-of-War 안개 연출), 런 진행 상태 머신 및 수사 보드 UI 마이그레이션을 100% 자율 구현하고 테스트하도록 지시합니다.

```markdown
Role: Principal Game Architect & Lead Systems Integration Engineer
Task: Execute Full Implementation of 3-Step Episode Sequence, 3-Node Fog-of-War Visibility, and Roguelite Progression based on `dungeon-dossier/docs/design/episode_progression_and_node_visibility_analysis.md` for "[던전 수사 조서 (Dungeon Detective Kim Taehoon)]".

---

## 1. 📌 설계서 준수 계약 및 바인딩 (Design Document Binding)

1. **최우선 준수 설계서**: `dungeon-dossier/docs/design/episode_progression_and_node_visibility_analysis.md`
2. **핵심 도메인 규칙 (Non-Negotiable Invariants)**:
   - **에피소드 3단계 구조**: 모든 에피소드는 반드시 `[Combat (일반 전투)] ➔ [Event (비전투 이벤트)] ➔ [Boss (보스 심문)]` 3개 노드로 순차 구성됩니다.
   - **에피소드 순차 진입**: `tutorial` (3노드) ➔ `ep001` (3노드) ➔ `ep004` (3노드) 순서로 에피소드가 해금됩니다.
   - **3노드 국소 공개 & Fog-of-War**: 수사 보드(`runStripScreen`)에는 현재 활성화된 에피소드의 3개 노드(또는 현재 진입 가능 노드)만 클로즈업 노출되며, 미래 에피소드 노드는 안개/물음표 핀(`FOG_OF_WAR` 상태)으로 비밀 처리됩니다.

---

## 2. 🛠️ 소스 코드 리팩토링 및 구현 요구사항 (Implementation Steps)

### Step 1. 에피소드 3단계 노드 스트립 재편성 (`content/common/run-strip.json`, `src/content-io/RunStripRepository.ts`)
- `content/common/run-strip.json` 시퀀스를 에피소드당 `Combat ➔ Event ➔ Boss` 3단계 규칙에 맞게 재구성하세요.
  - **Tutorial**: `enc_tutorial_slime` (전투) ➔ `event_tutorial_choice` (이벤트) ➔ `enc_tutorial_minotaur` (보스)
  - **EP001**: `enc_ep001_goblin` (전투) ➔ `event_ep001_forensic_sweep` (이벤트) ➔ `enc_ep001_succubus` (보스)
  - **EP004**: `enc_ep004_dwarf` (전투) ➔ `event_ep004_machine_room` (이벤트) ➔ `enc_ep004_fallen_hero` (보스)
- 남는 일반 전투 및 이벤트 노드는 런별 랜덤 선택 후보 풀(Candidate Pool)로 분리하거나 옵션 노드로 재배치하여 데이터 손실 없이 리플레이성을 확보하세요.

### Step 2. 런 진행 및 에피소드 해금 머신 업데이트 (`src/engine/run/RunState.ts`, `src/app/createRunSession.ts`, `src/app/save/runSave.ts`)
- `RunState` 내에 현재 에피소드 상태(`activeEpisodeId`) 및 에피소드 해금 단계 추가.
- 각 에피소드의 Boss 노드 클리어 시에만 다음 에피소드가 공식 해금되고 세이브 데이터에 보존되는 트랜지션 로직 구현.

### Step 3. 수사 보드 3노드 포커스 & Fog-of-War UI 구현 (`src/ui/screens/strip/model.ts`, `src/ui/screens/strip/createRunStripScreen.ts`)
- **15노드 전체 조감 렌더링 ➡️ 3노드 에피소드 포커스 뷰 전환**:
  - 수사 보드 렌더러가 현재 활성화된 에피소드의 3개 노드를 메인 줌인(Zoom-in) 뷰로 강조 렌더링.
  - 다음 에피소드 영역은 몽환적인 픽셀 안개 텍스처(Fog Overlay) 및 물음표 압정 아이콘으로 은폐 처리.
  - 에피소드 보스 자백 확보 시 안개가 열리면서 다음 에피소드로 이동하는 카메라 슬라이드 연출 적용.

### Step 4. 자동 플레이 하네스 및 회귀 검증 업데이트 (`src/dev/autoPlayHarness.ts`, `tests/routes/autoplay-15node.test.ts`)
- 자동 플레이 드라이버 및 테스트가 신규 3단계 에피소드 시퀀스 및 Fog-of-War 상태를 정상 인식하도록 업데이트.

---

## 3. 🧪 품질 검증 및 합격 기준 (Quality Gates)

다음 4가지 자동화 검증 명령을 차례대로 실행하여 100% GREEN 통과를 달성하세요:

```bash
cd dungeon-dossier
corepack pnpm typecheck
corepack pnpm test
corepack pnpm content:validate
corepack pnpm build
```

Acknowledge these implementation specifications and reply: "Claude Episode Progression & 3-Node Fog-of-War Implementation Protocol Activated."
```
