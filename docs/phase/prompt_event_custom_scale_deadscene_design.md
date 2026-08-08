# 📑 던전 수사 조서: 동적 에셋 스케일링·비전투 이벤트 3종·데드씬 연출 & 1280×321 데스크 규격 구현 설계 마스터 프롬프트

> **[사용 방법]**: 본 마스터 프롬프트를 AI 코딩 에이전트에 전달하여 아래 5가지 확장 요구사항에 대한 **상세 아키텍처 구현 설계서(`docs/design/event_system_custom_scale_deadscene_design.md`)**를 자동 작성하고, `dungeon-dossier/src/` 및 `workbench/` 소스 코드에 정밀 구현 및 테스트하도록 지시합니다.

```markdown
Role: Lead Game System Architect & Senior Graphics Engine Engineer
Task: Generate Comprehensive Architecture Design Specifications and Implement Arbitrary Image Resizing, Cutscene Engine, Expanded Non-Combat Events, Dead Scene System, and 1280×321 Desk Layout for "[던전 수사 조서 (Dungeon Detective Kim Taehoon)]".

---

## 1. 🎯 5대 핵심 확장 요구사항 명세 (Core Specifications)

### 1️⃣ 이미지 크기 임의 변경 로직 (Arbitrary Image Resizing & Scaling Engine)
- **에셋 스케일링 제어 (`src/ui/core/assetManifest.ts`, `workbench/model.mts`, `workbench/image-slot.mts`)**:
  - 각 이미지 슬롯 및 에셋 드롭 시 임의의 `customWidth`, `customHeight`, `scaleX`, `scaleY` 수치를 자유롭게 조절하고 비율 유지 파라미터(`preserveAspectRatio: boolean`)를 설정할 수 있는 변형 데이터 구조 확장.
  - 에셋 워크벤치 및 인게임 렌더러가 지정된 임의 규격으로 이미지를 왜곡 없이 픽셀 퍼펙트 정밀 렌더링하도록 렌더 로직 수정.

### 2️⃣ 이벤트씬 컷씬 연출 기능 (Event Cutscene Engine)
- **이벤트 컷씬 렌더러 (`src/ui/screens/event/`, `src/app/phase4-dialogue-service.ts`)**:
  - 수사 스토리 진행 중 전면 컷씬 화면 렌더링 지원 (대화 상자, 캐릭터 초상화 배치, 배경 이미지 스와프, 카메라 셰이크/페이드 연출).
  - 컷씬 진행 중 플레이어 선택지 및 분기 처리 지원.

### 3️⃣ 비전투 이벤트 종류 강화 (3 Expanded Non-Combat Event Types)
- **이벤트 스키마 및 처리 로직 확장 (`src/engine/domain/`, `src/engine/run/`)**:
  1. **카드 강화 이벤트 (`ENHANCE_CARD`)**: 보유 카드의 CP 소모량 감소, 평정심 타격력 증가 등 카드 성능 튜닝 기능.
  2. **탐문 / 정보 수집 이벤트 (`CANVASS`)**: 주변 인물 탐문을 통해 용의자의 숨겨진 정보 및 TruthGraph 진술 힌트 개금.
  3. **증거 수집 / 감식 이벤트 (`COLLECT_EVIDENCE`)**: 현장 감식을 통해 신규 증거물(`evidence_id`)을 획득하여 파우치에 추가.

### 4️⃣ 데드씬 / 게임 오버 연출 시스템 (Dead Scene & Defeat System)
- **게임 오버 연출 (`src/ui/screens/ending/`, `src/app/createRunSession.ts`)**:
  - 형사 스트레스(Stress) 100% 달성 또는 수사 실패 조건 만족 시 **데드씬(Dead Scene) 컷씬 화면** 발동.
  - 형사 패배 픽셀 일러스트, 실패 원인 요약 텍스트, 비장한 오디오 효과음, 그리고 `재시도(Retry)` 및 `진행 기록으로 복귀` 옵션 제공.

### 5️⃣ 책상 전경 1280×321 규격 반영 (1280×321 Desk Layout Adjustment)
- **책상 규격 업데이트 (`src/ui/widgets/portrait.ts`, `src/ui/widgets/cardFan.ts`, `src/style.css`)**:
  - 책상 전경(`desk_foreground`) 규격을 기존 `1280×236`에서 **`1280×321 px`**로 변경.
  - 책상 높이 변경에 맞춰 카드 패널(Card Fan)의 기본 휴지 위치, 증거 파우치 도킹 레이아웃 및 Z-Index 정렬 수치 자동 재계산 및 바인딩.

---

## 2. 📑 설계서 작성 프로토콜 (Design Document Protocol)

AI 코딩 에이전트는 코드 구현에 착수하기 전, 현재 코드베이스(`dungeon-dossier/`)의 파일 경로 및 라인 넘버를 기반으로 다음 항목이 수록된 **구현 설계서 (`docs/design/event_system_custom_scale_deadscene_design.md`)**를 가장 먼저 저작하세요:

1. **Section 1: Architecture & Zod Schema Changes**: `AssetManifest`, `EventSchema`, `RunState` 타입 및 스키마 변경점
2. **Section 2: Asset Resizing & Desk 1280×321 Layout**: `1280×321 px` 책상 바운드 및 이미지 스케일링 서브시스템 명세
3. **Section 3: Cutscene & Non-Combat Event Engine**: 카드 강화, 탐문, 증거 수집 3종 이벤트 흐름도
4. **Section 4: Dead Scene System & Audio Visuals**: 데드씬 발동 조건 및 UI 렌더링 순서
5. **Section 5: Verification & Quality Gates**: Vitest 검증 및 프로덕션 빌드 체크리스트

---

## 3. 🧪 검증 및 합격 기준 (Quality Gates)

구현 완료 후 다음 테스트 명령을 모두 100% GREEN으로 통과해야 합니다:
```bash
corepack pnpm typecheck
corepack pnpm test
corepack pnpm content:validate
corepack pnpm build
```

Acknowledge these 5 extended specifications and reply: "Event Cutscene, Custom Resizing, and 1280x321 Desk Design Protocol Initialized."
```
