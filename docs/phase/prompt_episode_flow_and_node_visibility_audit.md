# 📑 던전 수사 조서: 에피소드 진행 방식 & 노드 노출 구조 비교 분석 마스터 프롬프트

> **[사용 방법]**: 본 마스터 프롬프트를 AI 에이전트에 전달하여, 기획자 발화 녹취록(튜토리얼 3단계 흐름, 에피소드 순차 진입, 3노드 단위 분할 노출 및 로그라이트 안개 효과)과 현재 `dungeon-dossier` 코드베이스의 `run-strip.json`, `RunState`, `nodeMap.ts` 구조를 1:1 비교 분석하고 **차이점 감사 보고서(`docs/design/episode_progression_and_node_visibility_analysis.md`)**를 작성하도록 지시합니다.

```markdown
Role: Lead Game System Architect & Progression System Specialist
Task: Analyze Speaker Transcript on Episode Progression & Node Visibility against the current codebase (`dungeon-dossier/`) and generate a Structural Gap Analysis Document.

---

## 1. 🔍 기획자 발화 핵심 명세 요약 (Transcript Specs)

1. **에피소드 시작 & 튜토리얼 3단계 구조**:
   - 게임 시작 시 무조건 **튜토리얼 에피소드** 진입.
   - 에피소드별 3단계 노드 흐름: `[전투: 물컹이]` ➡️ `[비전투 이벤트]` ➡️ `[보스 전투: 미노타우로스]`.
   - 튜토리얼 클리어 후 에피소드 1 ➡️ 에피소드 4(실질적 에피소드 2)로 순차 진행.
2. **로그라이트 연출 & 3노드 단위 국소 노출 (Fog-of-War Node Visibility)**:
   - 15개 노드 전체를 수사 보드에 한 번에 노출하는 방식이 아닌, 플레이어가 진행 중인 **해당 에피소드의 3개 노드(또는 현재 선택 가능한 노드 세트)**만 화면에 노출.
   - 새 런(Run)을 시작할 때마다 탐험과 발견의 재미(Roguelite feel)를 제공하기 위해 안개(Fog of War) 및 단계별 노드 해금 연출 적용.

---

## 2. 📋 현재 코드베이스와의 1:1 대조 감사 항목 (Audit Checklist)

다음 4가지 영역에서 현재 `dungeon-dossier/` 코드와 기획 발화 간의 일치/불일치 지점을 정밀 분석하세요:

### 1️⃣ 에피소드 노드 시퀀스 구조 (`content/common/run-strip.json`, `src/engine/run/RunCatalogRepository.ts`)
- [ ] 현재 `run-strip.json`의 15개 노드가 `전투(일반) ➔ 비전투 이벤트 ➔ 보스 전투` 3단계 클러스터 패턴으로 완벽히 그룹화되어 있는가?
- [ ] `enc_tutorial_slime` ➔ `event_tutorial_*` ➔ `enc_tutorial_minotaur` 흐름 준수 여부.

### 2️⃣ 런 진행 & 에피소드 순차 해금 머신 (`src/engine/run/RunState.ts`, `src/app/createRunSession.ts`)
- [ ] 튜토리얼 완주 후 에피소드 1 ➔ 에피소드 4로 전달되는 세이브 및 런 세션 트랜지션 로직이 기획 발화와 일치하는가?

### 3️⃣ 수사 보드 노드 표시 방식 (`src/ui/screens/nodeMap.ts`, `src/ui/widgets/`)
- [ ] **현재 상태**: 15개 노드가 3x5 그리드로 전체 노출되어 있는가?
- [ ] **기획 지향점**: 전체 15개 노드 대신 현재 활성 에피소드의 **3개 노드 세트만 클로즈업하여 노출**하고 다음 에피소드로 넘어갈 때만 다음 노드 셋이 해금되는 연출로의 전환 필요성 분석.

### 4️⃣ 로그라이트 안개 연출 & 리플레이성 (Roguelite Fog-of-War UX)
- [ ] 미방문 노드 및 미래 에피소드 노드를 안개(Fog/물음표 마커)로 가리는 UX 연출 변경 시 필요한 UI/엔진 수정 범위 분석.

---

## 3. 📑 비교 분석 보고서 저작 프로토콜 (Output Protocol)

AI 에이전트는 코드 분석 후 다음 구조를 갖춘 **비교 분석 보고서(`docs/design/episode_progression_and_node_visibility_analysis.md`)**를 저작하세요:

1. **Executive Summary**: 기획 발화 요지 vs 현재 구현의 핵심 차이점 3가지
2. **Current Architecture Audit**: `run-strip.json`, `RunState.ts`, `nodeMap.ts` 현황 진단
3. **Proposed UI/Engine Modifications**:
   - 15노드 전체 렌더링 ➡️ 3노드 클러스터 스케일 뷰 포커스 전환 설계
   - 에피소드 3단계 흐름 (`Combat` ➔ `Event` ➔ `Boss`) 고정 및 안개 해금 UI 구현 방안
4. **Refactoring Roadmap & Action Items**: 파일 단위 수정 작업 항목 및 Vitest 검증 계획

Acknowledge these analysis specifications and reply: "Episode Progression & Node Visibility Audit Protocol Initialized."
```
