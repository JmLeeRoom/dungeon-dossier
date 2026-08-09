import { defineConfig, devices } from '@playwright/test';

/**
 * Production-only browser smoke.
 *
 * The regular Playwright matrix deliberately runs against Vite's development
 * server because the full-run driver is DEV-only. This config builds from
 * scratch and mounts the generated dist tree below a path prefix, exercising
 * the same relative-base and runtime-fetch behaviour as a static project-site
 * deployment without mixing production expectations into the DEV suite.
 */
const PORT = Number(process.env['DD_PREVIEW_PORT'] ?? 4_174);
const HOST = '127.0.0.1';
const BASE_PATH = '/dungeon-dossier/';

export default defineConfig({
  testDir: './tests/browser-preview',
  outputDir: './artifacts/browser-preview/test-results',
  timeout: 2 * 60 * 1_000,
  expect: { timeout: 60_000 },
  fullyParallel: false,
  workers: 1,
  forbidOnly: Boolean(process.env['CI']),
  retries: 0,
  reporter: [
    ['list'],
    ['json', { outputFile: './artifacts/browser-preview/report.json' }],
    ['html', { outputFolder: './artifacts/browser-preview/html', open: 'never' }],
  ],
  use: {
    baseURL: `http://${HOST}:${String(PORT)}${BASE_PATH}`,
    viewport: { width: 1_440, height: 900 },
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'chromium-production',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 1_440, height: 900 },
        deviceScaleFactor: 1,
      },
    },
  ],
  webServer: {
    command: `corepack pnpm build && corepack pnpm exec vite preview --base ${BASE_PATH} --host ${HOST} --port ${String(PORT)} --strictPort`,
    url: `http://${HOST}:${String(PORT)}${BASE_PATH}`,
    // A preview run is evidence about the build made by this invocation. Never
    // reuse a server that may be serving an older dist tree.
    reuseExistingServer: false,
    timeout: 3 * 60 * 1_000,
    stdout: 'ignore',
    stderr: 'pipe',
  },
});
