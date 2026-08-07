import { expect, test as base, type ConsoleMessage, type Page } from '@playwright/test';

/**
 * Everything a scenario must be able to prove was clean, collected from the
 * real page rather than reconstructed from the driver's own report.
 */
export interface PageTelemetry {
  readonly consoleErrors: string[];
  readonly pageErrors: string[];
  readonly failedRequests: string[];
  readonly consoleWarnings: string[];
}

/** A raw localization key that reached the screen, e.g. `event.ep004.canvass.title`. */
const RAW_I18N_KEY = /^[a-z][a-z0-9]*(?:\.[a-z0-9_]+){2,}$/u;

export function looksLikeRawI18nKey(text: string): boolean {
  return RAW_I18N_KEY.test(text.trim());
}

export const test = base.extend<{ telemetry: PageTelemetry }>({
  telemetry: async ({ page }, use) => {
    const telemetry: PageTelemetry = {
      consoleErrors: [],
      pageErrors: [],
      failedRequests: [],
      consoleWarnings: [],
    };
    page.on('console', (message: ConsoleMessage) => {
      if (message.type() === 'error') telemetry.consoleErrors.push(message.text());
      if (message.type() === 'warning') telemetry.consoleWarnings.push(message.text());
    });
    page.on('pageerror', (error: Error) => {
      telemetry.pageErrors.push(error.message);
    });
    page.on('requestfailed', (request) => {
      telemetry.failedRequests.push(
        `${request.method()} ${request.url()} :: ${request.failure()?.errorText ?? 'unknown'}`,
      );
    });
    await use(telemetry);
  },
});

export { expect };

export interface AutoplayNodeSummary {
  readonly index: number;
  readonly nodeId: string;
  readonly kind: string;
  readonly ref: string;
  readonly outcome?: string;
  readonly deadSceneReason?: string;
}

export interface AutoplayReportShape {
  readonly result: 'PASS' | 'FAIL';
  readonly failure?: string;
  readonly durationMs: number;
  readonly nodes: readonly AutoplayNodeSummary[];
  readonly ending?: { readonly endingId: string };
  readonly terminalMarker?: string;
  readonly finalState: {
    readonly nodeIndex: number;
    readonly terminal: boolean;
    readonly claimedRewardIds: readonly string[];
  };
  readonly consoleErrors: readonly string[];
  readonly rawI18nKeysSeen: readonly string[];
  readonly missingAssetKeys: readonly string[];
  readonly durationAcceptance?: {
    readonly minimumDurationMs: number;
    readonly maximumDurationMs: number;
  };
}

/**
 * Waits for the driver to publish its verdict. The page title carries the same
 * verdict, so a hung run fails on the Playwright timeout instead of hanging on
 * a promise that never settles.
 */
export async function readAutoplayReport(
  page: Page,
  timeoutMs: number,
): Promise<AutoplayReportShape> {
  await page.waitForFunction(
    () => (window as unknown as Record<string, unknown>)['__DD_AUTOPLAY_REPORT__'] !== undefined,
    undefined,
    { timeout: timeoutMs },
  );
  const report: unknown = await page.evaluate(
    () => (window as unknown as Record<string, unknown>)['__DD_AUTOPLAY_REPORT__'],
  );
  return report as AutoplayReportShape;
}

/** The canonical release assertion: nothing anywhere may have gone wrong. */
export function expectCleanTelemetry(telemetry: PageTelemetry): void {
  expect(telemetry.pageErrors, 'window.error / unhandledrejection').toEqual([]);
  expect(telemetry.consoleErrors, 'console.error').toEqual([]);
  expect(telemetry.failedRequests, 'failed network requests').toEqual([]);
}
