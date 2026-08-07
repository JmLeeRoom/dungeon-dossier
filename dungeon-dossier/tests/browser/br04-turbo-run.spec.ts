import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

import {
  expect,
  expectCleanTelemetry,
  readAutoplayReport,
  test,
  type AutoplayReportShape,
} from './fixtures';

const ARTIFACT_DIR = path.resolve('artifacts/browser');
const RUN_TIMEOUT_MS = 6 * 60 * 1_000;
const SEED = 20_260_805;

async function saveReport(name: string, report: AutoplayReportShape): Promise<void> {
  await mkdir(ARTIFACT_DIR, { recursive: true });
  await writeFile(
    path.join(ARTIFACT_DIR, `${name}.json`),
    `${JSON.stringify(report, null, 2)}\n`,
    'utf8',
  );
}

/**
 * BR-04: the canonical 15-node BEST run, driven in a real browser.
 *
 * This is the scenario the headless L1 test cannot stand in for: it exercises
 * PixiJS, asset loading, the direction overlays and every screen callback the
 * way a player's machine does.
 */
test.describe('BR-04 · turbo BEST run', () => {
  test.setTimeout(RUN_TIMEOUT_MS + 60_000);

  test('walks all 15 canonical nodes to the true ending', async ({ page, telemetry }) => {
    await page.goto(`/?autoplay=1&mode=turbo&seed=${String(SEED)}&policy=best`);
    const report = await readAutoplayReport(page, RUN_TIMEOUT_MS);
    await saveReport('br04-turbo-report', report);

    expect(report.failure ?? null, 'driver failure').toBeNull();
    expect(report.result).toBe('PASS');

    // Exactly the canonical strip, in order, with nothing skipped or repeated.
    expect(report.nodes).toHaveLength(15);
    expect(report.nodes.map((node) => node.index)).toEqual(
      Array.from({ length: 15 }, (_, index) => index),
    );
    expect(new Set(report.nodes.map((node) => node.nodeId)).size).toBe(15);

    // Every one of the six authored event patterns has to actually run.
    const encounterOutcomes = report.nodes
      .filter((node) => node.kind !== 'EVENT')
      .map((node) => node.outcome);
    expect(encounterOutcomes).toHaveLength(9);
    expect(encounterOutcomes.every((outcome) => outcome === 'BEST_RESOLUTION')).toBe(true);

    expect(report.terminalMarker).toBe('RUN_COMPLETED');
    expect(report.finalState.nodeIndex).toBe(15);
    expect(report.finalState.terminal).toBe(true);
    expect(report.ending?.endingId).toBe('ending-true');

    // A BEST run never routes through a defeat screen.
    expect(report.nodes.filter((node) => node.deadSceneReason !== undefined)).toEqual([]);

    // Presentation invariants the driver collects from the live page.
    expect(report.rawI18nKeysSeen, 'raw localization keys on screen').toEqual([]);
    expect(report.missingAssetKeys, 'missing asset keys').toEqual([]);
    expect(report.consoleErrors, 'console errors seen by the driver').toEqual([]);

    expectCleanTelemetry(telemetry);
  });

  test('captures the ending screen as release evidence', async ({ page }) => {
    await page.goto(`/?autoplay=1&mode=turbo&seed=${String(SEED)}&policy=best`);
    const report = await readAutoplayReport(page, RUN_TIMEOUT_MS);
    expect(report.result).toBe('PASS');

    await mkdir(ARTIFACT_DIR, { recursive: true });
    await page.locator('#game-root canvas').screenshot({
      path: path.join(ARTIFACT_DIR, 'br04-ending.png'),
    });
    await expect(page).toHaveTitle(/AUTOPLAY PASS/u);
  });
});
