# 📑 던전 수사 조서: 카드 효과·증거 모순 텍스트·강압도 연출 & 워크벤치 캐릭터 파츠 확장 구현 설계 마스터 프롬프트

> **[사용 방법]**: 본 마스터 프롬프트를 AI 코딩 에이전트에 전달하여, 아래 5가지 신규 기능 요구사항에 대한 **상세 아키텍처 설계서(Implementation Plan)**를 자동 작성하고, `dungeon-dossier/src/` 및 `workbench/` 코드베이스에 정밀 구현하도록 지시합니다.

```markdown
Role: Principal Game System Designer & Lead Frontend Architect
Task: Generate Comprehensive Architecture Design Specifications and Implement New Card Effects, Contradiction Text, Coercion Visual Feedback, and Asset Workbench Character Part Shake Features for "[던전 수사 조서 (Dungeon Detective Kim Taehoon)]".

---

## 1. 🎯 신규 요구사항 명세 (Feature Requirements Scope)

### 1️⃣ 카드 효과, CP 코스트 및 3분할 UI 카드 레이아웃 규격
- **카드 스키마 및 DTO 확장 (`src/engine/domain/`, `src/dto/`)**:
  - 카드에 `cpCost` (필수 CP 소모량) 및 `effect` (카드 발동 효과: 평정심 깎기, 증거 탐색, 진술 고정, 강압도 감소 등) 속성 명시.
- **카드 3분할 고정 레이아웃 (`src/ui/widgets/cardFan.ts`, `cardDetailModal.ts`)**:
  - **좌측 (Left)**: CP 코스트 뱃지 (예: `2 CP` 픽셀 배지)
  - **우측 (Right)**: 카드 일러스트 영역 (`256 × 256 px` 픽셀 일러스트 파츠)
  - **중하단 (Center-Bottom)**: 카드 설명 및 효과 텍스트 고정 렌더링 영역 (`fontSize: 8`, 자동 줄바꿈)

### 2️⃣ 태그-증거 파우치 간 모순 지점 텍스트 연출 (Contradiction Text Output)
- **증거 모순 텍스트 피드백 (`src/engine/resolution/`, `src/ui/widgets/evidenceTray.ts`)**:
  - 플레이어가 선택한 증거물과 진술 태그 간의 불일치 발생 시, 증거 파우치/취조실 하단 텍스트 창에 **모순 설명 문구**를 실시간으로 출력:
    - *예시*: `"진술: '동쪽 공터에 있었다' ↔ 증거: '서쪽 창고 열쇠' [장소 알리바이 모순 발생!]"`

### 3️⃣ 태그-카드 오매칭 시 강압도 상승 비주얼 연출 (Coercion Rise Visual Feedback)
- **강압도 상승 연출 (`src/ui/widgets/gauge.ts`, `src/ui/screens/interrogation/`)**:
  - 태그와 카드를 잘못 매칭(유효하지 않거나 모순에 실패한 수)하여 제출했을 때:
    1. 화면 전반 0.3초 붉은 셰이크 딤 연출.
    2. 강압도 아이콘(`icon_coercion`, 32×32) 빛남 파동(Pulse Glow).
    3. 강압 게이지 상승 수치 (`+15 강압도`) 픽셀 플로팅 텍스트 애니메이션 연출.

### 4️⃣ 에셋 워크벤치 캐릭터별 파츠 관리 기능 (`workbench/`)
- **캐릭터 파츠 관리자 (`workbench/main.mts`, `workbench/model.mts`)**:
  - 에셋 워크벤치에 캐릭터 선택 드롭다운 (`물컹이`, `고블린`, `하피`, `미노타우로스`, `오크`, `서큐버스`, `드워프`, `사이클롭스`, `타락한_용사` 등 12종) 제공.
  - 선택한 캐릭터별로 `base`, `upset`, `lose` 파츠 슬롯을 동적으로 생성, 교체, 파츠 레이어 조절이 가능하도록 확장.

### 5️⃣ 캐릭터 파츠 상태 전환 시 좌우 흔들기 애니메이션 (State Transition Shake Animation)
- **상태 파츠 전환 애니메이션 (`src/ui/widgets/portrait.ts`)**:
  - 용의자 표정/상태 파츠가 `base` → `upset`, 또는 `upset` → `lose`로 변경되는 이벤트 발생 시:
    - 초상화 스프라이트에 **0.4초간 좌우 진동 애니메이션 (Horizontal Oscillating Shake, ±10px)** 적용.
    - 패배(`lose`) 전환 시에는 화면 진동과 함께 파동 픽셀 효과 중첩 적용.

---

## 2. 📑 설계서 작성 프로토콜 (Design Document Protocol)

AI 코딩 에이전트는 코드 수정 전, 다음 구조를 가진 상세 구현 설계서(`docs/design/card_contradiction_workbench_design.md`)를 작성하세요:

1. **Architecture & Schema Changes**: Zod 스키마, DTO, PixiJS 위젯의 타입 정의 변경사항
2. **UI Component & Layout Wireframes**: 카드 3분할 레이아웃 및 셰이크 애니메이션 컨트롤러 명세
3. **State Machine & Logic Flow**: 태그 오매칭 시 강압도 연출 및 모순 텍스트 파싱 로직
4. **Workbench Part Extensions**: 캐릭터별 파츠 관리자 데이터 구조
5. **Verification & Test Plan**: Vitest 단위/통합 테스트 및 워크벤치 동작 검증 수순

---

## 3. 🧪 전수 자동화 검증 (Quality Verification)

구현 완료 후 다음 테스트 명령을 통과해야 합니다:
```bash
corepack pnpm typecheck
corepack pnpm test
corepack pnpm content:validate
corepack pnpm build
```

Acknowledge these new feature specifications and reply: "New Feature Architecture & Design Protocol Initialized."
```
