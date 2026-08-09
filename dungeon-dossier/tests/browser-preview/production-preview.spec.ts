import { expect, test, type ConsoleMessage, type Request, type Response } from '@playwright/test';

interface ProductionTelemetry {
  readonly consoleErrors: string[];
  readonly pageErrors: string[];
  readonly failedRequests: string[];
  readonly badResponses: string[];
}

test('boots the fresh production bundle cleanly from a project subpath', async ({ page }) => {
  const telemetry: ProductionTelemetry = {
    consoleErrors: [],
    pageErrors: [],
    failedRequests: [],
    badResponses: [],
  };

  page.on('console', (message: ConsoleMessage) => {
    if (message.type() === 'error') telemetry.consoleErrors.push(message.text());
  });
  page.on('pageerror', (error: Error) => {
    telemetry.pageErrors.push(error.message);
  });
  page.on('requestfailed', (request: Request) => {
    telemetry.failedRequests.push(
      `${request.method()} ${request.url()} :: ${request.failure()?.errorText ?? 'unknown'}`,
    );
  });
  page.on('response', (response: Response) => {
    if (response.status() >= 400) {
      telemetry.badResponses.push(`${String(response.status())} ${response.url()}`);
    }
  });

  // The query is intentional: production must ignore the DEV-only autoplay
  // switch rather than installing its globals, report node, or HUD.
  const navigation = await page.goto('./?autoplay=1&mode=turbo', {
    waitUntil: 'networkidle',
  });
  expect(navigation?.ok(), 'production index response').toBe(true);

  const canvas = page.locator('#game-root canvas');
  await expect(canvas).toBeVisible();

  const geometry = await canvas.evaluate((element) => {
    const node = element as HTMLCanvasElement;
    const box = node.getBoundingClientRect();
    return {
      backingWidth: node.width,
      backingHeight: node.height,
      cssWidth: Math.round(box.width),
      cssHeight: Math.round(box.height),
      devicePixelRatio: window.devicePixelRatio,
    };
  });
  expect(geometry.cssWidth).toBe(1_280);
  expect(geometry.cssHeight).toBe(800);
  expect(geometry.backingWidth).toBe(1_280 * geometry.devicePixelRatio);
  expect(geometry.backingHeight).toBe(800 * geometry.devicePixelRatio);

  const mount = page.locator('#game-root');
  const assetCount = await mount.getAttribute('data-asset-count');
  expect(Number(assetCount), 'registered runtime asset count').toBeGreaterThan(0);
  await expect(mount).not.toHaveAttribute('data-flow-error', /.+/u);
  await expect(mount).not.toHaveAttribute('data-bootstrap-error', /.+/u);

  const devOnlyState = await page.evaluate(() => {
    const global = window as unknown as Record<string, unknown>;
    return {
      autoPlayGlobal: Object.hasOwn(global, '__AUTO_PLAY__'),
      autoplayReportGlobal: Object.hasOwn(global, '__DD_AUTOPLAY_REPORT__'),
      autoplayReportNode: document.querySelectorAll('#dd-autoplay-report').length,
      autoplayHudNodes: document.querySelectorAll('[id^="dd-autoplay-"]').length,
      developerConsoleNodes: document.querySelectorAll('.dev-console-host').length,
    };
  });
  expect(devOnlyState).toEqual({
    autoPlayGlobal: false,
    autoplayReportGlobal: false,
    autoplayReportNode: 0,
    autoplayHudNodes: 0,
    developerConsoleNodes: 0,
  });

  const workbenchNavigation = await page.goto('./workbench/', {
    waitUntil: 'networkidle',
  });
  expect(workbenchNavigation?.ok(), 'production workbench response').toBe(true);
  await expect(page).toHaveTitle('던전 수사 조서 · 애셋 워크벤치');
  await expect(page.locator('#asset-list .asset-row')).toHaveCount(16);
  await expect(page.locator('#save-to-project')).toBeVisible();
  const shippingManifest = await page.locator('#manifest-json').evaluate((element) =>
    JSON.parse(element.textContent ?? '{}') as {
      readonly slots?: Readonly<Record<string, { readonly image: string | null; readonly isLocked: boolean }>>;
    },
  );
  const shippingSlots = Object.values(shippingManifest.slots ?? {});
  expect(shippingSlots).toHaveLength(16);
  expect(shippingSlots.every((slot) => slot.image !== null && slot.isLocked)).toBe(true);

  const stageSlots = page.locator('#stage > image-slot[data-slot-id]');
  await expect(stageSlots).toHaveCount(16);
  await expect.poll(async () => stageSlots.evaluateAll((elements) =>
    elements.every((element) => {
      const image = element.shadowRoot?.querySelector('img');
      return element.hasAttribute('data-filled') &&
        getComputedStyle(element).backgroundImage === 'none' &&
        (image?.currentSrc.length ?? 0) > 0 &&
        (image?.naturalWidth ?? 0) > 0 &&
        (image?.naturalHeight ?? 0) > 0;
    }),
  )).toBe(true);

  const stageStateVisibility = async () => stageSlots.evaluateAll((elements) =>
    Object.fromEntries(elements.map((element) => [
      element.getAttribute('data-slot-id') ?? '',
      getComputedStyle(element).display !== 'none',
    ])),
  );
  await expect.poll(stageStateVisibility).toMatchObject({
    'suspect-base': true,
    'suspect-state-parts': false,
    'suspect-lose-parts': false,
    'partner-base': true,
    'partner-used': false,
  });
  await page.locator('#slot-select').selectOption('suspect-state-parts');
  await expect.poll(stageStateVisibility).toMatchObject({
    'suspect-base': false,
    'suspect-state-parts': true,
    'suspect-lose-parts': false,
  });

  expect(telemetry.pageErrors, 'window.error / unhandledrejection').toEqual([]);
  expect(telemetry.consoleErrors, 'console.error').toEqual([]);
  expect(telemetry.failedRequests, 'network-level request failures').toEqual([]);
  expect(telemetry.badResponses, 'HTTP 4xx/5xx responses').toEqual([]);
});
