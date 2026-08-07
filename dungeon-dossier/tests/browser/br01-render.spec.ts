import {
  expect,
  expectCleanTelemetry,
  looksLikeRawI18nKey,
  test,
} from './fixtures';

/**
 * BR-01 / BR-02: the game renders at 1280x800 at DPR 1 and DPR 2.
 *
 * The logical stage is 640x400 upscaled 2x, so the backing buffer and the CSS
 * box are deliberately different numbers. Asserting only one of them would miss
 * exactly the class of regression integer scaling exists to prevent.
 */
test.describe('BR-01/BR-02 · 1280x800 render', () => {
  test('mounts a WebGL canvas at the integer-scaled size', async ({ page, telemetry }) => {
    await page.goto('/');

    const canvas = page.locator('#game-root canvas');
    await expect(canvas).toBeVisible({ timeout: 60_000 });

    const geometry = await canvas.evaluate((element) => {
      const node = element as HTMLCanvasElement;
      const box = node.getBoundingClientRect();
      return {
        backingWidth: node.width,
        backingHeight: node.height,
        cssWidth: Math.round(box.width),
        cssHeight: Math.round(box.height),
        imageRendering: getComputedStyle(node).imageRendering,
        devicePixelRatio: window.devicePixelRatio,
      };
    });

    // Measured 2026-08-07 in Chromium: DPR 1 -> backing 1280x800, DPR 2 ->
    // backing 2560x1600, CSS box 1280x800 in both. The CSS box is the product
    // contract; the backing buffer follows DPR and must not be pinned to 1280.
    expect(geometry.cssWidth).toBe(1280);
    expect(geometry.cssHeight).toBe(800);
    expect(geometry.backingWidth).toBe(1280 * geometry.devicePixelRatio);
    expect(geometry.backingHeight).toBe(800 * geometry.devicePixelRatio);
    expect(geometry.imageRendering).toBe('pixelated');

    expectCleanTelemetry(telemetry);
  });

  test('reports every runtime asset as registered', async ({ page, telemetry }) => {
    await page.goto('/');
    // #game-root ships in index.html, so its visibility proves nothing. The
    // canvas only exists once bootstrap has run and stamped the dataset.
    await expect(page.locator('#game-root canvas')).toBeVisible({ timeout: 60_000 });
    const mount = page.locator('#game-root');

    // A missing attribute would coerce to 0, so this also catches "never set".
    const assetCount = await mount.getAttribute('data-asset-count');
    expect(Number(assetCount)).toBeGreaterThan(0);

    // The flow error boundary writes here; it must stay absent on a clean boot.
    await expect(mount).not.toHaveAttribute('data-flow-error', /.+/u);
    expectCleanTelemetry(telemetry);
  });

  test('shows no raw localization key on the first screen', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('#game-root canvas')).toBeVisible({ timeout: 60_000 });
    await page.waitForTimeout(1_500);

    // Pixi paints into a canvas, so the report's own scan is authoritative for
    // in-canvas text. This guards the surrounding DOM chrome.
    const domText = await page.locator('body').innerText();
    const offenders = domText
      .split(/\s+/u)
      .filter((token) => looksLikeRawI18nKey(token));
    expect(offenders).toEqual([]);
  });
});
