# 📑 던전 수사 조서: 설계-구현 갭 전수 검증 및 자동 수정 마스터 프롬프트

> **[사용 방법]**: 본 프롬프트를 AI 코딩 에이전트에 전달하여 `docs/` 디렉토리 내의 모든 설계 문서 및 단계별 프롬프트(`docs/phase/*.md`, `game_base.md`, 구현계획서 등)와 현재 구현된 소스 코드(`dungeon-dossier/src/`, `workbench/`)를 정밀 비교 감사(Gap Audit)하고, 미구현/불일치 항목을 자동 수정 및 검증하도록 합니다.

```markdown
Perform a Comprehensive Architecture Gap Audit, Code Correction, and Automated Test Verification for "[던전 수사 조서 (Dungeon Detective Kim Taehoon)]" based on all design documents and specifications in `docs/`.

---

## 1. 🔍 검증 및 수정 목표 (Objective)

`docs/` 디렉토리에 정의된 기획/개발 설계서 및 Phase 0~7, HD 업스케일, 에셋·캐릭터·카드 리팩토링 명세 문서와 현재 코드베이스(`dungeon-dossier/src/`)의 구현 상태를 1:1 전수 비교하고, 발견된 모든 갭(Gap)과 결함을 즉시 수정하여 100% 완결성을 달성하세요.

---

## 2. 📋 단계별 전수 검증 항목 (Audit Checklist)

다음 7개 파트의 명세 항목을 소스 코드 파일 단위로 정밀 점검하고 불일치 시 코드를 즉시 업데이트하세요:

### Part 1. 아키텍처 및 DTO 경계 준수 (§ Phase 0, 4)
- [ ] **5계층 단방향 의존성**: `TruthGraph → KnowledgeState → GameRule → DialogueRenderer → Presentation` 계층 순서가 엄격히 지쳐지고 있는가?
- [ ] **Zero-Code-Change 제약**: `src/engine/` 내부에 사건 ID 리터럴 문자열 상수(예: `'EP001'`, `'EP004'`)가 하드코딩되어 있지 않은가? (`content/cases/*.json` 기반 동적 로딩 필수)
- [ ] **DTO 누설 방지**: 프레젠테이션 레이어(PixiJS 위젯)가 엔진 내부 딥 오브젝트에 직접 의존하지 않고 독립 DTO 인터페이스를 사용하는가?

### Part 2. 에셋 규격 및 1280×800 HD 뷰포트 (§ prompt_resolution_1280x800.md, prompt_refactor_specs.md)
- [ ] **1280×800 HD 정수배 업스케일**: `INTERNAL_WIDTH=640`, `INTERNAL_HEIGHT=400`, `scale=2`, `NEAREST` 텍스처 필터 적용 및 CSS `.stage-viewport` (1280x800px) 고정 확인.
- [ ] **에셋 표준 규격 반영**:
  - `bg_interrogation`: 1280 × 800 px
  - `desk_foreground`: 1280 × 236 px
  - `suspect_base`: 512 × 512 px
  - `suspect_state_parts` (`base`, `upset`, `lose`): 512 × 512 px
  - `partner` (`base`, `used`): 512 × 512 px
  - `card_base`: 640 × 725 px
  - `card_illust`: 256 × 256 px
  - `evidence`: 128 × 128 px
  - `icon_composure` / `icon_coercion`: 32 × 32 px

### Part 3. 에셋 워크벤치 기즈모 & 상태 고정 (§ Phase 2, 3, prompt_refactor_specs.md)
- [ ] **Transform Controller**: 에셋 워크벤치(`workbench/` 및 `src/dev/assetWorkbench.ts`)에서 에셋 이미지의 이동(`x, y`), 회전(`rotation`), 크기(`scaleX, scaleY`) 변경 조작 핸들 작동 여부.
- [ ] **Lock Toggle**: "확정/고정(Lock)" 설정 시 마우스 이동 차단 및 변형 데이터의 `asset_manifest.json` / `LocalStorage` 보존 기능 작동 여부.

### Part 4. 캐릭터 파츠 & 파트너 상태 머신 (§ prompt_refactor_specs.md)
- [ ] **상태 파츠 (stateParts)**: 기존 `expression` 명칭이 `stateParts`로 완전히 리팩토링되었는가?
- [ ] **용의자 3상태 전환**: 평정심 상태에 따라 `base` (기본) → `upset` (임계치 동요) → `lose` (패배 자백) 이미지로 자동 전환되는가?
- [ ] **파트너 쿨다운 (used → base)**: 파트너 512×512 규격 확인. `used` 상태 시 초상화 중앙 쿨다운 턴 수 표시 + 딤 처리, 턴 진행 시 턴 차감되어 0턴 도달 시 `base` 상태로 재활성화되는가?

### Part 5. 5계층 카드 인터페이스 & 인터랙션 (§ Phase 2, prompt_refactor_specs.md)
- [ ] **5계층 Z-Index 순서**: `Layer 0: base` (640x725) → `Layer 1: illust` (256x256) → `Layer 2: stamp` → `Layer 3: post` → `Layer 4: evidence` (128x128) 순으로 중첩 렌더링되는가?
- [ ] **카드 20% → 40% 호버 슬라이드**: 기본 상태에서 카드 상단 20%만 보이다가 마우스 호버 시 하이라이트 아웃라인과 함께 40% 높이로 상승하는가?
- [ ] **전체화면 모달 (Full-Screen Modal)**: 카드 클릭 시 화면 중앙 640×725 100% 모달 팝업 렌더링되며, 모달 외 영역 클릭 시 원래 상단 20% 노출 상태로 복귀하는가?
- [ ] **태그 드래그 앤 드롭 & 점선 연결**: 카드를 태그 칩 위로 드래그 시 카드~태그 간 점선(Dotted Line) 실시간 렌더링 + 태그 아웃라인 하이라이트 + 제출(Submit) 버튼 클릭 시 행동 발동되는가?

### Part 6. 무코드 데이터 확장 & 무빌드 라이브 튜너 (§ Phase 1, 3)
- [ ] **Live Tuner Workbench**: GUI에서 `balance.json` (평정심, 강압, 손상량 등) 수정 시 무재빌드로 실시간 반영 및 JSON 내보내기 작동 여부.
- [ ] **다중 사건 동적 로딩**: `content/cases/` 디렉토리에 새로운 사건 JSON 추가 시 엔진 수정 없이 로드되는가?

### Part 7. 테스트 자동화 & 품질 검증 (§ Phase 5, 7)
- [ ] **Vitest 테스트 통과**: `npx vitest run` 실행 시 모든 단원/통합/시뮬레이터 테스트 100% Green 통과 여부.
- [ ] **타입스크립트 빌드**: `npm run build` 실행 시 0 Error, 0 Warning으로 정상 컴파일되는가?

---

## 3. 🛠️ 자동 감사 및 수정 실행 절차 (Execution Protocol)

1. **Step 1: Gap Inspection (갭 탐색)**
   - `docs/` 설계 문서 대비 현재 소스 코드의 차이점 및 결함을 전수 스캔하고 갭 목록을 작성하세요.
2. **Step 2: Code Refactoring & Implementation (코드 수정 및 구현)**
   - 스캔된 미구현/오류 항목을 `src/` 및 `workbench/` 코드에 즉시 구현 및 수정 반영하세요.
3. **Step 3: Verification (자동 테스트 검증)**
   - `cd dungeon-dossier && npx vitest run` 및 `npm run build` 명령을 실행하여 검증하세요.
4. **Step 4: Audit Report (검증 완결 보고)**
   - 통과된 테스트 개수 및 수정된 갭 목록을 명확히 제시하고 종료하세요.

Acknowledge these instruction specs and reply: "Docs Architecture Verification & Code Update Protocol Initialized."
```
