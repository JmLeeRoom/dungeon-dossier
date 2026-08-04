# 📑 1280×800 HD 해상도 전환 마스터 프롬프트 (Resolution 1280×800 Upgrade Prompt)

> **[사용 방법]**: 게임 뷰포트 및 렌더링 해상도를 640×400 1배율에서 **1280×800 (2배 정수배 HD 업스케일 모드)**로 전환할 때 사용합니다.

```markdown
Refactor the Game Viewport, PixiJS Stage Renderer, Integer Scaler, and CSS Container for "[던전 수사 조서]" to run at 1280×800 HD Resolution.

### Objective:
Upgrade the rendering engine and viewport container from 640×400 (1x) to 1280×800 (2x Integer Upscale Mode), satisfying the PC-98 pixel-art integer upscale constraint (§8.1) while doubling visual clarity on modern desktop displays.

---

### Core Requirements:

1. **Integer Viewport Scaler Update (`src/ui/core/integerScale.ts`)**:
   - Maintain native 640×400 coordinate grid for layout calculations:
     ```ts
     export const INTERNAL_WIDTH = 640;
     export const INTERNAL_HEIGHT = 400;
     export const HD_WIDTH = 1280;
     export const HD_HEIGHT = 800;
     export const DEFAULT_TARGET_SCALE = 2; // Fixed 2x Scale for 1280x800
     ```
   - Update `calculateIntegerViewport`:
     - Default minimum `renderScale = 2` when container size is >= 1280×800.
     - Output viewport dimensions: `width = 1280`, `height = 800`.
     - Center the 1280×800 stage in browser container with letterboxing (`offsetX`, `offsetY`).

2. **PixiJS Game Application Renderer (`src/ui/core/createGameApplication.ts`)**:
   - Initialize PixiJS Application with 1280×800 canvas dimensions:
     ```ts
     const app = new Application();
     await app.init({
       width: 1280,
       height: 800,
       backgroundColor: 0x0f0d0a,
       autoDensity: true,
       resolution: window.devicePixelRatio || 1,
     });
     ```
   - Apply `NEAREST` scale mode to global stage texture filter to prevent blur during 2x pixel scaling.
   - Set stage container scale: `stage.scale.set(2)` to scale internal 640×400 coordinate elements perfectly into the 1280×800 canvas.

3. **HTML & CSS Viewport Styling (`index.html`, `workbench/style.css`, `dungeon_detective_workbench.html`)**:
   - Update stage container wrapper CSS:
     ```css
     .stage-viewport {
       position: relative;
       width: 1280px;
       height: 800px;
       margin: 0 auto;
       image-rendering: pixelated; /* Crisp retro pixel art */
       box-shadow: 0 0 0 2px var(--panel-border), 0 10px 40px rgba(0,0,0,0.85);
     }
     ```

4. **UI Screen Layout & Coordinate Safety**:
   - Ensure all UI widgets (`cardFan`, `evidenceTray`, `gauge`, `tagChip`, `typewriter`, `portrait`) remain bound to 640×400 coordinate system and scale automatically via `stage.scale.set(2)`.
   - Prevent pixel misalignment or font blurring on Galmuri/DungGeunMo bitmap fonts.

5. **Automated Unit Test Verification (`tests/ui/`)**:
   - Update `tests/ui/presentation-foundation.test.ts` and `tests/ui/core-presentation.test.ts` to assert `viewport.width === 1280` and `viewport.height === 800` when container is 1280×800.
   - Run `npx vitest run` to ensure 100% green pass.

Acknowledge these instructions and reply: "1280x800 HD Resolution Upgrade Specification Applied."
```
