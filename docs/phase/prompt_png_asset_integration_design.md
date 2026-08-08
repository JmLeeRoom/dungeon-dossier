# 📑 던전 수사 조서: PNG 에셋 통합 & UI/캐릭터 채우기 개발 설계 마스터 프롬프트

> **[사용 방법]**: 본 마스터 프롬프트를 AI 에이전트에 전달하여, `docs/NHN AI PNG Asset Naming Convention.xlsx` 규칙 파일과 `docs/NHN AI_image/` 디렉터리(`Characters/`, `background/`, `UI/`) 내의 `.png` 파일들만 엄격히 추출하여 인게임 UI, 5분할 카드, 취조실 배경, 12종 용의자 표정 파츠, 증거 폴라로이드, 단서 태그 슬롯에 100% 매핑하고 채워 넣기 위한 **개발 종합 설계서(`docs/design/png_asset_integration_and_ui_binding_design.md`)**를 사전 작성하고 개발에 착수하도록 지시합니다.

```markdown
Role: Principal Game Asset Architect, UI Technical Director & Asset Integration Lead
Task: Analyze PNG Asset Naming Convention & Directory (`docs/NHN AI_image/`) and Author a Comprehensive Development & Binding Specification Document before Code Implementation for "[던전 수사 조서 (Dungeon Detective Kim Taehoon)]".

---

## 1. 🎯 목표 및 에셋 통합 제약 조건 (Constraints & Objectives)

1. **에셋 파일 추출 및 확장자 단일 제약**:
   - 디렉터리 대상: `docs/NHN AI_image/` 하위 `Characters/`, `background/`, `UI/` 폴더. (`ref/` 폴더는 참조용으로만 사용).
   - **사용 확장자 고정**: **오직 `.png` 파일만 인게임 런타임 에셋으로 채택**합니다. (`.psd` 및 기타 작업 파일은 로더에서 엄격히 배제).
2. **명명 규칙 바인딩**:
   - `docs/NHN AI PNG Asset Naming Convention.xlsx` 엑셀 파일의 탭 및 카테고리 규격을 정밀 분석하여 `asset_manifest.json` 및 Vite `runtimeAssetRegistry.ts`의 키값과 1:1 대칭 연결합니다.

---

## 2. 📋 카테고리별 에셋 매핑 & UI 채우기 설계 요구사항 (Binding Specs)

### 1️⃣ 배경 에셋 (`background/` ➔ `dungeon-dossier/assets/`)
- `bg_interrogationroom_base.png`: 취조실 메인 배경 (1280×800 HD 뷰포트 / 640×400 도트 가상 캔버스).
- `bg_interrogationroom_desk.png`: 하단 수사 책상 전경 (1280×321 px 책상 레이어).
- `bg_event_crazyboard.png`: 수사 보드 (크레이지 보드 노드 맵 베이스).
- `bg_event_rest.png`, `bg_event_safe.png`, `bg_event_phone.png`, `bg_event_dead.png`, `bg_event_town.png`, `bg_event_scene0~2.png`: 이벤트 컷씬 및 비전투 노드 배경 채우기.

### 2️⃣ 캐릭터 에셋 (`Characters/` ➔ `dungeon-dossier/assets/`)
- 용의자 / 캐릭터 스탠딩 파츠 (512×512 픽셀):
  - `idle_bensi_base.png`, `portrait_*_base.png`, `portrait_*_upset.png`, `portrait_*_lose.png`.
  - 형사 김태훈 (`ui_photo_teahoon.png`) 및 파트너 김인턴 (종이컵 슬라임 `ui_photo_mulkung.png`).
  - 용의자 3상태 파츠 (`base` ➔ `upset` ➔ `lose`) 전환 시 좌우 흔들기(Shake) 애니메이션 연동 설계.

### 3️⃣ UI, 카드 & 단서 에셋 (`UI/` ➔ `dungeon-dossier/assets/`)
- **5계층 카드 에셋**:
  - `ui_card_base.png`: 카드 베이스 서류 템플릿 (640×725 모달 규격).
  - `ui_card_illust00~05.png`: 카드 상단 일러스트 슬롯 (256×256 px).
  - `ui_card_evidence00~05.png`: 결합 단서 폴라로이드 레이어 (128×128 px).
  - `ui_card_post.png` / `ui_card_pushy.png`: 형광 포스트잇 및 클립 오버레이.
  - `ui_card_stamp_logic.png` / `ui_card_stamp_pushy.png`: blue/red 결재 도장 인장 레이어.
- **진술 태그 칩 & 이펙트**:
  - `ui_tag_base.png`, `ui_tag_shield.png`, `ui_tag_broken.png`, `ui_tag_hidden.png`, `ui_tag_deactivate.png`.
- **게이지 & 수치 아이콘**:
  - `ui_icon_composure.png` (푸른 멘탈), `ui_icon_pushy.png` (붉은 강압도), `ui_debuff_kiss.png` (서큐버스 봉인).
- **결과 연출 화면**:
  - `ui_game_clear.png` (자백 성공), `ui_game_fail.png` (수사 실패 / 데드씬).

---

## 3. 📑 개발 설계서 저작 프로토콜 (Design Output Specifications)

AI 에이전트는 코드 채우기 작업 시작 전, 다음 구조를 갖춘 **PNG 에셋 통합 및 UI 채우기 개발 설계서(`docs/design/png_asset_integration_and_ui_binding_design.md`)**를 최우선으로 저작하세요:

1. **Asset Directory & File Inventory Table**: `NHN AI_image/` 내 모든 `.png` 파일의 원본 경로, 타겟 `assets/` 파일명, 해상도 및 용도 표.
2. **UI Slot Mapping Architecture**: 캔버스 상의 각 UI 영역(배경, 책상, 용의자, 카드 5레이어, 태그 칩, 버튼)과 PNG 파일의 1:1 바인딩 매핑 테이블.
3. **Asset Manifest (`asset_manifest.json`) Update Plan**: V3.0 스키마 기반 좌표, 크기, scale, lock 정보 및 로더 등록 계획.
4. **Implementation & Verification Plan**: 파일 이동/복사, `runtimeAssetRegistry.ts` 등록, UI 이미지 채우기 및 `corepack pnpm test` / `build` 100% GREEN 검증 계획.

Acknowledge these PNG asset integration specifications and reply: "PNG Asset Integration & UI Binding Design Protocol Activated."
```
