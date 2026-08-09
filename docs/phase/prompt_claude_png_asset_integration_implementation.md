# 📑 던전 수사 조서: Claude 전용 72개 PNG 에셋 통합 & UI/캐릭터 채우기 완전 구현 마스터 프롬프트

> **[사용 방법]**: 본 마스터 프롬프트를 **Claude (Anthropic Claude 3.5 Sonnet / 3.7 Opus)** 코딩 에이전트에 전달하여, `dungeon-dossier/docs/design/png_asset_integration_and_ui_binding_design.md` 설계 문서의 P0 규격, 72개 PNG Allowlist 추출, 127개 통합 카탈로그, 5계층 카드 및 용의자 3상태 렌더링을 100% 자동 구현하고 테스트하도록 지시합니다.

```markdown
Role: Principal Game Asset Architect & Lead Graphics Integration Engineer
Task: Execute Full Implementation of 72-File PNG Asset Importer, 127-Asset Runtime Catalog, 5-Layer Card Renderer, and Suspect Expression Binding based on `dungeon-dossier/docs/design/png_asset_integration_and_ui_binding_design.md` for "[던전 수사 조서 (Dungeon Detective Kim Taehoon)]".

---

## 1. 📌 설계서 바인딩 및 P0 규격 계약 (Design Binding & P0 Invariants)

1. **최우선 준수 설계서**: `dungeon-dossier/docs/design/png_asset_integration_and_ui_binding_design.md`
2. **P0 규격 계약 (Non-Negotiable Invariants)**:
   - **72개 PNG Allowlist 추출**: `docs/NHN AI_image/` 하위 `Characters/iloveimg-resized/` (20개), `background/` (13개), `UI/` (39개) PNG만 런타임에 채택합니다. 모든 PSD, `ref/`, 미리사이즈 원본 및 비규격 확장자는 로더에서 엄격히 차단합니다.
   - **정규 에셋 키 형식**: `category/name/state` (예: `idle/mulkung/upset`, `bg/interrogationroom/base`, `ui/card/base`).
   - **카드 768×1024 캔버스 규격**: `ui_card_base.png` (768×1024)를 정규 카드 캔버스로 채택하고 640×725 모달 및 20%➔40% 패널 컨테이너에서 등비 축소(Proportional Scale)합니다.
   - **책상 1280×321 전경 배치**: `bg_interrogationroom_desk.png` (1280×321)를 640×400 도트 캔버스의 x=0, y=239 위치에 `preserveAspectRatio: false` 축소 오버레이 렌더링합니다.
   - **127개 에셋 통합 카탈로그**: 기존 legacy PNG 55개 + 신규 NHN PNG 72개 = 총 127개 정적 에셋 카탈로그 구축.

---

## 2. 🛠️ 소스 코드 구현 및 바인딩 단계 (Implementation Steps)

### Step 1. 72-File Deterministic Asset Importer 스크립트 작성 (`tools/assets/import-nhn-assets.mjs`)
- `docs/NHN AI_image/`에서 72개 Allowlist PNG를 픽셀 손상 없이 `dungeon-dossier/assets/` 정규 디렉터리로 복사/동기화하는 자동화 스크립트 구축.
- PSD, `ref/`, 미리사이즈 원본 파일 자동 차단 로직 포함.

### Step 2. 에셋 카탈로그 & 레지스트리 연결 (`src/ui/core/runtimeAssetCatalog.ts`, `src/ui/core/runtimeAssetRegistry.ts`)
- 127개 에셋의 정규 키(`category/name/state`), 파일명, 해상도, palettePolicy를 관리하는 Runtime Asset Catalog 구현.
- Vite `import.meta.glob('../../../assets/**/*.png')`와 정규 키 간의 1:1 대칭 파싱 및 동기 키 조회 바인딩.

### Step 3. 용의자 3상태 표정 전환 & 좌우 흔들기 렌더러 (`src/ui/screens/`, `src/ui/widgets/suspectPortraitWidget.ts`)
- 용의자의 `base` ➔ `upset` ➔ `lose` 3상태에 따른 PNG 교체 렌더링 (`idle_bensi_base.png`, `idle_bensi_upset.png`, `idle_bensi_lose.png`).
- 상태 변경 트랜지션 시 동일 PixiJS 컨테이너 상에서 충격 좌우 흔들림(Shake) 애니메이션 구동.
- 형사 김태훈 (`ui_photo_teahoon.png`) 및 파트너 김인턴 (종이컵 슬라임 `ui_photo_mulkung.png`) UI 초상화 배치.

### Step 4. 5계층 카드 & 증거물 폴라로이드 레이어드 렌더러 (`src/ui/widgets/cardWidget.ts`)
- Z-Index 5계층 오버레이 렌더링 구현:
  1. Base 템플릿 (`ui_card_base.png`)
  2. 카드 일러스트 (`ui_card_illust00~05.png`)
  3. 인장 레이어 (`ui_card_stamp_logic.png`, `ui_card_stamp_pushy.png`)
  4. 포스트잇/클립 오버레이 (`ui_card_post.png`, `ui_card_pushy.png`)
  5. 결합 단서 폴라로이드 레이어 (`ui_card_evidence00~05.png`)
- 카드 패널 기본 20% 노출 ➔ 마우스 호버 시 40% 슬라이드 ➔ 클릭 시 640×725 전체화면 모달 focus 연출.

### Step 5. 진술 태그 칩 & 결과 연출 오버레이 바인딩
- `ui_tag_base.png`, `ui_tag_shield.png`, `ui_tag_broken.png`, `ui_tag_hidden.png`, `ui_tag_deactivate.png` 칩 스프라이트 연동.
- 수사 성패 시 `ui_game_clear.png` 및 `ui_game_fail.png` 디렉션 오버레이 연출.

---

## 3. 🧪 품질 검증 게이트 (Quality Gates)

다음 5가지 자동화 검증 명령을 차례대로 실행하여 100% GREEN 통과를 달성하세요:

```bash
cd dungeon-dossier
node tools/assets/import-nhn-assets.mjs
corepack pnpm typecheck
corepack pnpm test
corepack pnpm content:validate
corepack pnpm build
corepack pnpm arch
```

Acknowledge these asset integration specifications and reply: "Claude PNG Asset Integration & UI Binding Implementation Protocol Activated."
```
