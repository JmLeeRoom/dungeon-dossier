import { describe, expect, it } from 'vitest';

import { DEFAULT_RUN_SEED } from '../../src/app/gameRunState';
import { MODE_CONFIGS } from '../../src/dev/autoplay/driver';
import {
  AUTOPLAY_EXPECTED_NODES,
  AUTOPLAY_REPORT_SCHEMA_VERSION,
  CAPTURE_DURATION_ACCEPTANCE,
  SUBMISSION_DURATION_ACCEPTANCE,
  SUBMISSION_MAXIMUM_DURATION_SEC,
  SUBMISSION_TARGET_DURATION_SEC,
  VIDEO_DURATION_ACCEPTANCE,
  autoplayExpectedNodes,
  findAutoplayInvariantFailures,
  type AutoplayReportEvidence,
} from '../../src/dev/autoplay/report';

const FINAL_BOSS_NODE_ID = 'run_ep004_05';

/** A passing BEST report that walked exactly the route its seed resolves. */
function evidenceForSeed(seed: number): AutoplayReportEvidence {
  const expected = autoplayExpectedNodes(seed);
  const encounterNodes = expected.filter((node) => node.kind !== 'EVENT');
  const rewards = encounterNodes.map((_, index) => `reward_${index.toString()}`);
  return {
    schemaVersion: AUTOPLAY_REPORT_SCHEMA_VERSION,
    seed,
    mode: 'turbo',
    policy: 'best',
    durationMs: 22_500,
    nodes: expected.map((node) => {
      const encounterIndex = encounterNodes.findIndex(
        (candidate) => candidate.nodeId === node.nodeId,
      );
      return {
        ...node,
        submissions: node.kind === 'EVENT' ? 0 : 2,
        turns: node.kind === 'EVENT' ? 0 : 2,
        ...(node.kind === 'EVENT'
          ? {}
          : {
              outcome: 'BEST_RESOLUTION' as const,
              grade: 'S' as const,
              rewardOffered: [rewards[encounterIndex] as string],
              rewardClaimed: rewards[encounterIndex] as string,
            }),
        flagsSet: node.nodeId === FINAL_BOSS_NODE_ID ? ['F-13'] : [],
        durationMs: 100,
        warnings: [],
      };
    }),
    ending: { endingId: 'ending-true' },
    terminalMarker: 'RUN_COMPLETED',
    finalState: {
      nodeIndex: expected.length,
      terminal: true,
      dp: 100,
      stress: 0,
      trust: 3,
      flags: { 'F-01': false, 'F-12': true, 'F-13': true },
      completedNodeIds: expected.map((node) => node.nodeId),
      claimedRewardIds: rewards,
      pendingRewardIds: [],
      gradeHistory: encounterNodes.map((node) => ({
        nodeId: node.nodeId,
        outcome: 'BEST_RESOLUTION' as const,
        grade: 'S' as const,
      })),
    },
    consoleErrors: [],
    missingAssetKeys: [],
    rawI18nKeysSeen: [],
  };
}

describe('autoplay route expectation', () => {
  it('resolves a different route for the product default seed', () => {
    const seeded = autoplayExpectedNodes(DEFAULT_RUN_SEED);
    const canonical = AUTOPLAY_EXPECTED_NODES;

    expect(seeded).toHaveLength(canonical.length);
    // SEEDED_ONE slots pick per seed, so the two routes are not the same walk.
    // This is exactly why validating a real run against the unseeded baseline
    // reported a node-order failure for a correct run.
    expect(seeded.map((node) => node.ref)).not.toEqual(canonical.map((node) => node.ref));

    const divergent = seeded.filter((node, index) => node.ref !== canonical[index]?.ref);
    expect(divergent.length).toBeGreaterThan(0);
    for (const node of divergent) {
      // Only the candidate changes; the slot, its kind and its position do not.
      expect(node.kind).toBe(canonical[node.index]?.kind);
    }
  });

  it('passes a run that walked its own seeded route', () => {
    expect(findAutoplayInvariantFailures(evidenceForSeed(DEFAULT_RUN_SEED))).toEqual([]);
  });

  it('still passes a seed whose route happens to equal the baseline', () => {
    const seed = 20_260_805;
    expect(autoplayExpectedNodes(seed).map((node) => node.ref)).toEqual(
      AUTOPLAY_EXPECTED_NODES.map((node) => node.ref),
    );
    expect(findAutoplayInvariantFailures(evidenceForSeed(seed))).toEqual([]);
  });

  it('still fails a run that walked a route its seed does not produce', () => {
    const evidence = evidenceForSeed(DEFAULT_RUN_SEED);
    const swapped = {
      ...evidence,
      nodes: [...evidence.nodes].reverse().map((node, index) => ({ ...node, index })),
    };
    const failures = findAutoplayInvariantFailures(swapped);
    expect(failures.some((failure) => failure.startsWith('node order mismatch'))).toBe(true);
    // The message names the seed, so a route failure is debuggable.
    expect(failures.find((failure) => failure.startsWith('node order mismatch'))).toContain(
      String(DEFAULT_RUN_SEED),
    );
  });

  it('falls back to the baseline for a seed outside uint32', () => {
    expect(autoplayExpectedNodes(-1)).toBe(AUTOPLAY_EXPECTED_NODES);
    expect(autoplayExpectedNodes(undefined)).toBe(AUTOPLAY_EXPECTED_NODES);
    expect(autoplayExpectedNodes(1.5)).toBe(AUTOPLAY_EXPECTED_NODES);
  });

  it('memoizes each seed so repeated validation resolves the strip once', () => {
    expect(autoplayExpectedNodes(DEFAULT_RUN_SEED)).toBe(autoplayExpectedNodes(DEFAULT_RUN_SEED));
  });
});

describe('short submission capture contract', () => {
  it('never accepts a cut longer than the 60 second short-form boundary', () => {
    expect(SUBMISSION_TARGET_DURATION_SEC).toBe(57);
    expect(SUBMISSION_MAXIMUM_DURATION_SEC).toBe(60);
    expect(SUBMISSION_DURATION_ACCEPTANCE).toEqual({
      targetDurationMs: 57_000,
      minimumDurationMs: 54_000,
      maximumDurationMs: 60_000,
      measurement: 'L2_WALL_CLOCK',
    });
    // The demo contract is a different product and keeps its own window.
    expect(VIDEO_DURATION_ACCEPTANCE.targetDurationMs).toBe(150_000);
  });

  it('paces the submission mode to its own target', () => {
    const config = MODE_CONFIGS.submission;
    expect(config.targetDurationSec).toBe(SUBMISSION_TARGET_DURATION_SEC);
    // It has to outrun the demo profile to fit a third of the wall clock.
    expect(config.timeScale).toBeGreaterThan(MODE_CONFIGS.video.timeScale);
    expect(config.actionDelayMs).toBeLessThan(MODE_CONFIGS.video.actionDelayMs);
    expect(config.skipTypewriter).toBe(false);
    expect(config.runTimeoutMs).toBeGreaterThan(SUBMISSION_TARGET_DURATION_SEC * 1_000);
  });

  it('requires every pacing mode to declare the contract it paced to', () => {
    expect(Object.keys(CAPTURE_DURATION_ACCEPTANCE).sort()).toEqual(['submission', 'video']);
    for (const [mode, acceptance] of Object.entries(CAPTURE_DURATION_ACCEPTANCE)) {
      expect(MODE_CONFIGS[mode as keyof typeof MODE_CONFIGS].targetDurationSec, mode).toBe(
        acceptance.targetDurationMs / 1_000,
      );
    }
    // And a mode with no pacing target must not declare one.
    for (const mode of ['watch', 'turbo', 'record'] as const) {
      expect(MODE_CONFIGS[mode].targetDurationSec, mode).toBeUndefined();
      expect(CAPTURE_DURATION_ACCEPTANCE[mode], mode).toBeUndefined();
    }
  });

  it('rejects a submission run that overshoots the boundary', () => {
    const base = evidenceForSeed(DEFAULT_RUN_SEED);
    const overshoot: AutoplayReportEvidence = {
      ...base,
      mode: 'submission',
      durationMs: 61_000,
      durationAcceptance: { ...SUBMISSION_DURATION_ACCEPTANCE },
    };
    expect(findAutoplayInvariantFailures(overshoot)).toContain(
      'submission duration 61000ms is outside 54000..60000ms',
    );

    const onTime: AutoplayReportEvidence = { ...overshoot, durationMs: 57_400 };
    expect(findAutoplayInvariantFailures(onTime)).toEqual([]);
  });

  it('rejects a submission report that omits or forges its acceptance', () => {
    const base = evidenceForSeed(DEFAULT_RUN_SEED);
    expect(
      findAutoplayInvariantFailures({ ...base, mode: 'submission', durationMs: 57_000 }),
    ).toContain('submission report is missing its wall-clock duration acceptance');

    expect(
      findAutoplayInvariantFailures({
        ...base,
        mode: 'submission',
        durationMs: 57_000,
        // The demo contract on a submission report would wave through a 150s cut.
        durationAcceptance: { ...VIDEO_DURATION_ACCEPTANCE },
      }),
    ).toContain('submission report duration acceptance does not match the declared product gate');
  });

  it('rejects a non-pacing mode that declares an acceptance', () => {
    const base = evidenceForSeed(DEFAULT_RUN_SEED);
    expect(
      findAutoplayInvariantFailures({
        ...base,
        durationAcceptance: { ...SUBMISSION_DURATION_ACCEPTANCE },
      }),
    ).toContain('non-capture mode turbo declared a duration acceptance');
  });
});
