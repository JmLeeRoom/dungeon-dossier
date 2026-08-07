import { defineConfig, devices } from '@playwright/test';

/**
 * BROWSER-P0-05: the repository-native release matrix.
 *
 * Autoplay only arms under `import.meta.env.DEV`, so every scenario runs
 * against the dev server rather than a production build. `reuseExistingServer`
 * is off in CI so a stale server can never make a run look green.
 *
 * The base URL is intentionally NOT hardcoded to a port here: Playwright fills
 * `baseURL` from the server it actually started, and specs use relative paths.
 */
const PORT = Number(process.env['DD_E2E_PORT'] ?? 5_173);
const HOST = '127.0.0.1';

export default defineConfig({
  testDir: './tests/browser',
  outputDir: './artifacts/browser/test-results',
  // A cinematic video run targets 150s, so a scenario needs real headroom.
  timeout: 8 * 60 * 1_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  forbidOnly: Boolean(process.env['CI']),
  retries: 0,
  reporter: [
    ['list'],
    ['json', { outputFile: './artifacts/browser/report.json' }],
    ['html', { outputFolder: './artifacts/browser/html', open: 'never' }],
  ],
  use: {
    baseURL: `http://${HOST}:${String(PORT)}`,
    viewport: { width: 1280, height: 800 },
    trace: 'retain-on-failure',
    video: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    // `devices['Desktop Chrome']` carries a 1280x720 viewport, which is SHORTER
    // than the 800px stage. Integer scaling would silently drop to 1x and the
    // matrix would measure a downscaled game. The viewport is therefore set
    // after the device spread, with headroom for browser chrome.
    {
      name: 'chromium-dpr1',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 1440, height: 900 },
        deviceScaleFactor: 1,
      },
    },
    {
      name: 'chromium-dpr2',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 1440, height: 900 },
        deviceScaleFactor: 2,
      },
    },
  ],
  webServer: {
    command: `npx vite --host ${HOST} --port ${String(PORT)} --strictPort`,
    url: `http://${HOST}:${String(PORT)}/`,
    reuseExistingServer: !process.env['CI'],
    timeout: 120_000,
    stdout: 'ignore',
    stderr: 'pipe',
  },
});
