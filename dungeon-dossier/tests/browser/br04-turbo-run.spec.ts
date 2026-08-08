import { readFileSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { RunStripSchema } from '../../src/engine/domain';
import { createNodeStrip } from '../../src/engine/run';
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

/**
 * The driver runs with an explicit seed, so the route is the SEEDED one, not
 * the canonical baseline. Resolving it here is what keeps this spec honest
 * when a SEEDED_ONE slot picks a different candidate.
 */
// Read rather than import: Playwright's ESM loader requires a JSON import
// attribute, and the spec must stay runnable under plain `playwright test`.
const runStripJson: unknown = JSON.parse(
  readFileSync(path.resolve('content/common/run-strip.json'), 'utf8'),
);
const EXPECTED_ROUTE = createNodeStrip(RunStripSchema.parse(runStripJson), { seed: SEED });
const EXPECTED_NODE_IDS = EXPECTED_ROUTE.map((node) => node.nodeId);
const EXPECTED_GRADED_COUNT = EXPECTED_ROUTE.filter((node) => node.kind !== 'EVENT').length;

async function saveReport(name: string, report: AutoplayReportShape): Promise<void> {
  await mkdir(ARTIFACT_DIR, { recursive: true });
  await writeFile(
    path.join(ARTIFACT_DIR, `${name}.json`),
    `${JSON.stringify(report, null, 2)}\n`,
    'utf8',
  );
}

/**
 * BR-04: the full seeded BEST run, driven in a real browser.
 *
 * This is the scenario the headless L1 test cannot stand in for: it exercises
 * PixiJS, asset loading, the direction overlays and every screen callback the
 * way a player's machine does.
 */
test.describe('BR-04 · turbo BEST run', () => {
  test.setTimeout(RUN_TIMEOUT_MS + 60_000);

  test('walks every node of the seeded route to the true ending', async ({ page, telemetry }) => {
    await page.goto(`/?autoplay=1&mode=turbo&seed=${String(SEED)}&policy=best`);
    const report = await readAutoplayReport(page, RUN_TIMEOUT_MS);
    await saveReport('br04-turbo-report', report);

    expect(report.failure ?? null, 'driver failure').toBeNull();
    expect(report.result).toBe('PASS');

    // Exactly the seeded route, in order, with nothing skipped or repeated.
    expect(report.nodes).toHaveLength(EXPECTED_NODE_IDS.length);
    expect(report.nodes.map((node) => node.index)).toEqual(
      EXPECTED_NODE_IDS.map((_, index) => index),
    );
    expect(report.nodes.map((node) => node.nodeId)).toEqual(EXPECTED_NODE_IDS);
    expect(new Set(report.nodes.map((node) => node.nodeId)).size).toBe(
      EXPECTED_NODE_IDS.length,
    );
    // Three stages per episode: COMBAT, EVENT, then the BOSS that unlocks the next.
    expect(report.nodes.map((node) => node.kind)).toEqual(
      EXPECTED_ROUTE.map((node) => node.kind),
    );

    const encounterOutcomes = report.nodes
      .filter((node) => node.kind !== 'EVENT')
      .map((node) => node.outcome);
    expect(encounterOutcomes).toHaveLength(EXPECTED_GRADED_COUNT);
    expect(encounterOutcomes.every((outcome) => outcome === 'BEST_RESOLUTION')).toBe(true);

    expect(report.terminalMarker).toBe('RUN_COMPLETED');
    expect(report.finalState.nodeIndex).toBe(EXPECTED_NODE_IDS.length);
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
