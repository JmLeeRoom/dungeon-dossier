# 📑 던전 수사 조서: 외부 이미지 없이 코드(PixiJS/CSS)만으로 "받아라!" 카드 제출 충격 이펙트 구현 프롬프트

> **[사용 방법]**: 본 마스터 프롬프트를 AI 에이전트에 전달하여, 외부 PNG 이미지 에셋을 전혀 추가하지 않고 순수 PixiJS 그래픽스 및 CSS 애니메이션 코드로만 **카드 태깅 제출 시 "받아라!", 화면 흔들림(Screen Shake), 1프레임 화이트 플래시, 픽셀 텍스트 팝업, 타격 에너지 선** 연출을 100% 구현하도록 지시합니다.

```markdown
Role: Lead Graphics & FX Developer, PixiJS Shader & UI Animation Specialist
Task: Implement Pure Programmatic Submission Impact FX (Text Popups, Screen Shake, White Flash, Dotted Beam) without External Image Assets for "[던전 수사 조서 (Dungeon Detective Kim Taehoon)]".

---

## 1. 🎯 목표 (Objective & Constraint)

카드 태깅 후 제출(Submit) 버튼을 누르거나 모순 지적 카드를 낼 때, **별도의 PNG 이미지 파일 없이 100% 순수 코드(PixiJS Graphics, PixiJS Text, Canvas Math, CSS Keyframes)**만으로 하드보일드 타격감과 "받아라!" 문구 팝업 연출을 구현합니다.

---

## 2. ⚙️ 5가지 순수 코드 이펙트 명세 (Code FX Specifications)

### 1️⃣ "받아라!" / "모순 발견!" 픽셀 대사 팝업 (Impact Text Popup)
- **구현 방식**: PixiJS `Text` 또는 HTML Overlay Element.
- **연출 효과**:
  - 제출 순간 카드가 위로 튀어오르며 황금색/적색 픽셀 테두리의 **"받아라!"**, **"모순 파훼!"** 문구 기습 출현.
  - Scale 애니메이션 (`scale: 0.3` ➔ `1.4` 바운스 ➔ `1.0` 정착 후 0.6초 뒤 `alpha: 0` 페이드아웃).

### 2️⃣ 화면 전체 스크린 셰이크 (Screen Shake)
- **구현 방식**: PixiJS `Container` stage 또는 Viewport `x, y` 좌표 삼각함수 진동 offset.
- **연출 효과**:
  - 카드 제출 직후 15~20프레임 동안 화면 전체가 강렬하게 좌우/상하로 진동 (`offset = Math.sin(t * 50) * intensity`).
  - 용의자의 평정심 차감 폭(예: -25, -60)에 비례하여 진동 강도 자동 스케일링.

### 3️⃣ 1프레임 타격 화이트/시안 플래시 (Impact Flash)
- **구현 방식**: PixiJS `Graphics.drawRect(0, 0, 1280, 800)`.
- **연출 효과**:
  - 제출 적중 순간 화면 전체를 덮는 0.05초(1~2프레임) 하얀색(`0xffffff`) 및 청록색(`0x00b4d8`) 오버레이 플래시 후 급격한 투명도 감쇄.

### 4️⃣ 태그 칩 - 카드 간 에너지 점선 비빔 (Dynamic Particle Beam)
- **구현 방식**: PixiJS `Graphics.setLineStyle` & `lineTo` 점선 오프셋 애니메이션.
- **연출 효과**:
  - 카드를 드래그하여 태그 칩에 대는 동안 카노벨 스타일의 대각선 점선 빛줄기가 실시간 흐르는 애니메이션 연출.

### 5️⃣ 용의자 좌우 흔들림 & 데미지 텍스트 팝업 (Composure Damage Text)
- **구현 방식**: 용의자 초상화 스탠딩 파츠 로컬 좌표 진동 + 피격 위치에 `-25`, `-60` 붉은색 픽셀 숫자가 위로 떠오르며 사라지는 애니메이션 (`y -= 1`, `alpha -= 0.02`).

---

## 3. 🧪 검증 및 품질 기준 (Quality Gates)

1. 외부 `.png` 에셋 추가 없이 `src/ui/effects/` 및 `src/ui/widgets/` 내 코드 수정만으로 동작해야 함.
2. `corepack pnpm typecheck`, `corepack pnpm test`, `corepack pnpm build` 100% PASS 검증.

Acknowledge these FX specifications and reply: "Pure Code Submission Impact FX Activated."
```
