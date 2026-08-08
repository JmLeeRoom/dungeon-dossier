import { describe, expect, it } from 'vitest';

import { MODE_CONFIGS } from '../../src/dev/autoplay/driver';

import {
  AUTOPLAY_EXPECTED_NODES,
  AUTOPLAY_NODE_COUNT,
  AUTOPLAY_REPORT_SCHEMA_VERSION,
  AUTOPLAY_TECHNICAL_CONTENT_IDS,
  findAutoplayInvariantFailures,
  findRawI18nKeys,
  VIDEO_DURATION_ACCEPTANCE,
  VIDEO_DURATION_TOLERANCE_SEC,
  VIDEO_TARGET_DURATION_SEC,
  type AutoplayReportEvidence,
} from '../../src/dev/autoplay/report';

const ALL_CONTENT_JSON = import.meta.glob('../../content/**/*.json', {
  eager: true,
  import: 'default',
}) as Readonly<Record<string, unknown>>;

const TECHNICAL_ID_FIELD = /(?:^|_)id$/u;
const TECHNICAL_IDS_FIELD = /(?:^|_)ids$/u;

/** Graded (non-EVENT) nodes of the canonical resolved route. */
const GRADED_NODES = AUTOPLAY_EXPECTED_NODES.filter((node) => node.kind !== 'EVENT');
const EVENT_NODES = AUTOPLAY_EXPECTED_NODES.filter((node) => node.kind === 'EVENT');
const FINAL_BOSS_NODE_ID = 'run_ep004_05';

function independentlyCollectTechnicalIds(value: unknown, ids: Set<string>): void {
  if (value === null || typeof value !== 'object') return;
  if (Array.isArray(value)) {
    for (const entry of value) independentlyCollectTechnicalIds(entry, ids);
    return;
  }
  for (const [key, entry] of Object.entries(value)) {
    if (
      typeof entry === 'string' &&
      (TECHNICAL_ID_FIELD.test(key) || key === 'ref')
    ) {
      ids.add(entry);
    } else if (Array.isArray(entry) && TECHNICAL_IDS_FIELD.test(key)) {
      for (const id of entry) {
        if (typeof id === 'string') ids.add(id);
      }
    }
    independentlyCollectTechnicalIds(entry, ids);
  }
}

function validBestEvidence(): AutoplayReportEvidence {
  const encounterNodes = AUTOPLAY_EXPECTED_NODES.filter((node) => node.kind !== 'EVENT');
  const rewards = encounterNodes.map((_, index) => `reward_${index.toString()}`);
  return {
    schemaVersion: AUTOPLAY_REPORT_SCHEMA_VERSION,
    seed: 20_260_805,
    mode: 'turbo',
    policy: 'best',
    durationMs: 22_500,
    nodes: AUTOPLAY_EXPECTED_NODES.map((node) => {
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
              outcome: 'BEST_RESOLUTION',
              grade: 'S',
              rewardOffered: [rewards[encounterIndex]!],
              rewardClaimed: rewards[encounterIndex],
            }),
        flagsSet: node.nodeId === FINAL_BOSS_NODE_ID ? ['F-13'] : [],
        durationMs: 100,
        warnings: [],
      };
    }),
    ending: { endingId: 'ending-true' },
    terminalMarker: 'RUN_COMPLETED',
    finalState: {
      nodeIndex: AUTOPLAY_NODE_COUNT,
      terminal: true,
      dp: 100,
      stress: 0,
      trust: 3,
      flags: { 'F-01': false, 'F-12': true, 'F-13': true },
      completedNodeIds: AUTOPLAY_EXPECTED_NODES.map((node) => node.nodeId),
      claimedRewardIds: rewards,
      pendingRewardIds: [],
      gradeHistory: encounterNodes.map((node) => ({
        nodeId: node.nodeId,
        outcome: 'BEST_RESOLUTION',
        grade: 'S',
      })),
    },
    consoleErrors: [],
    missingAssetKeys: [],
    rawI18nKeysSeen: [],
  };
}

describe('autoplay report invariants', () => {
  it('expects exactly the canonical episode route, resolved from shipped content', () => {
    expect(AUTOPLAY_NODE_COUNT).toBe(AUTOPLAY_EXPECTED_NODES.length);
    expect(AUTOPLAY_EXPECTED_NODES.map((node) => node.nodeId)).toEqual([
      'run_tutorial_01',
      'run_tutorial_02',
      'run_tutorial_05',
      'run_ep001_01',
      'run_ep001_02',
      'run_ep001_05',
      'run_ep004_01',
      'run_ep004_02',
      'run_ep004_05',
    ]);
    expect(AUTOPLAY_EXPECTED_NODES.map((node) => node.kind)).toEqual([
      'ENCOUNTER', 'EVENT', 'BOSS',
      'ENCOUNTER', 'EVENT', 'BOSS',
      'ENCOUNTER', 'EVENT', 'BOSS',
    ]);
    expect(GRADED_NODES).toHaveLength(6);
    expect(EVENT_NODES).toHaveLength(3);
    expect(AUTOPLAY_EXPECTED_NODES.at(-1)?.nodeId).toBe(FINAL_BOSS_NODE_ID);
  });

  it('derives its raw-ID denylist from every content JSON file', () => {
    const expected = new Set<string>();
    for (const content of Object.values(ALL_CONTENT_JSON)) {
      independentlyCollectTechnicalIds(content, expected);
    }

    // A pinned count breaks on every content edit without catching anything the
    // set equality below misses. The floor only guards against the collector
    // silently returning nothing.
    expect(expected.size).toBeGreaterThan(300);
    expect(new Set(AUTOPLAY_TECHNICAL_CONTENT_IDS)).toEqual(expected);
    expect(AUTOPLAY_TECHNICAL_CONTENT_IDS).toEqual(expect.arrayContaining([
      'cache-preverified',
      'cache-tutorial-slime-full-v1',
      'tutorial-slime-who',
    ]));
  });

  it('detects dotted i18n keys and underscore-only technical IDs', () => {
    expect(findRawI18nKeys([
      '정상 한국어',
      'event.raw.title',
      'reward_dp_small',
      'cache-preverified',
    ])).toEqual([
      'event.raw.title',
      'reward_dp_small',
      'cache-preverified',
    ]);
  });

  it('accepts only complete canonical BEST evidence', () => {
    expect(findAutoplayInvariantFailures(validBestEvidence())).toEqual([]);
  });

  it('accepts one repeatable reward claimed at every encounter', () => {
    const valid = validBestEvidence();
    const repeatableRewardId = 'reward_dp_small';
    const nodes = valid.nodes.map((node) =>
      node.kind === 'EVENT'
        ? node
        : {
            ...node,
            rewardOffered: [repeatableRewardId],
            rewardClaimed: repeatableRewardId,
          },
    );

    expect(findAutoplayInvariantFailures({
      ...valid,
      nodes,
      finalState: {
        ...valid.finalState,
        claimedRewardIds: [repeatableRewardId],
      },
    })).toEqual([]);
  });

  it('rejects a missing node-level reward claim independently of final-set cardinality', () => {
    const valid = validBestEvidence();
    const nodes = valid.nodes.map((node) => {
      if (node.kind === 'EVENT' || node.nodeId !== 'run_tutorial_01') return node;
      const withoutClaim = { ...node };
      Reflect.deleteProperty(withoutClaim, 'rewardClaimed');
      return withoutClaim;
    });
    const failures = findAutoplayInvariantFailures({ ...valid, nodes });

    expect(failures).toContain(
      `BEST report must record ${GRADED_NODES.length.toString()} node-level reward claims, ` +
      `got ${(GRADED_NODES.length - 1).toString()}`,
    );
    expect(failures).toContain('run_tutorial_01 has no claimed reward');
  });

  it('rejects the formerly false-positive NORMAL ending', () => {
    const valid = validBestEvidence();
    const failures = findAutoplayInvariantFailures({
      ...valid,
      ending: { endingId: 'ending-normal' },
      finalState: {
        ...valid.finalState,
        flags: { ...valid.finalState.flags, 'F-13': false },
      },
    });
    expect(failures).toContain('BEST ending must be ending-true, got ending-normal');
    expect(failures).toContain('BEST final state did not set F-13');
  });

  it('rejects a partial encounter even after every route node renders', () => {
    const valid = validBestEvidence();
    expect(valid.nodes).toHaveLength(AUTOPLAY_NODE_COUNT);
    const finalBossIndex = valid.nodes.findIndex(
      (node) => node.nodeId === FINAL_BOSS_NODE_ID,
    );
    const nodes = valid.nodes.map((node, index) =>
      index === finalBossIndex ? { ...node, outcome: 'PARTIAL' } : node,
    );
    const gradeHistory = valid.finalState.gradeHistory.map((record) =>
      record.nodeId === FINAL_BOSS_NODE_ID ? { ...record, outcome: 'PARTIAL' } : record,
    );
    const failures = findAutoplayInvariantFailures({
      ...valid,
      nodes,
      finalState: { ...valid.finalState, gradeHistory },
    });
    expect(failures).toContain(
      `${FINAL_BOSS_NODE_ID} outcome is PARTIAL, not BEST_RESOLUTION`,
    );
    expect(failures).toContain(
      `${FINAL_BOSS_NODE_ID} grade-history outcome is PARTIAL`,
    );
  });

  it('rejects skipped or reordered strip nodes', () => {
    const valid = validBestEvidence();
    const nodes = [...valid.nodes];
    [nodes[0], nodes[1]] = [nodes[1]!, nodes[0]!];
    expect(findAutoplayInvariantFailures({ ...valid, nodes })).toEqual(
      expect.arrayContaining([expect.stringContaining('node order mismatch')]),
    );
  });

  it('applies the declared video wall-clock range to report evidence', () => {
    const valid = validBestEvidence();
    const atLowerBound: AutoplayReportEvidence = {
      ...valid,
      mode: 'video',
      durationMs: VIDEO_DURATION_ACCEPTANCE.minimumDurationMs,
      durationAcceptance: { ...VIDEO_DURATION_ACCEPTANCE },
    };
    expect(findAutoplayInvariantFailures(atLowerBound)).toEqual([]);
    expect(findAutoplayInvariantFailures({
      ...atLowerBound,
      durationMs: VIDEO_DURATION_ACCEPTANCE.maximumDurationMs,
    })).toEqual([]);

    const tooFast = findAutoplayInvariantFailures({
      ...atLowerBound,
      durationMs: VIDEO_DURATION_ACCEPTANCE.minimumDurationMs - 1,
    });
    const tooSlow = findAutoplayInvariantFailures({
      ...atLowerBound,
      durationMs: VIDEO_DURATION_ACCEPTANCE.maximumDurationMs + 1,
    });
    expect(tooFast).toContainEqual(expect.stringContaining('outside'));
    expect(tooSlow).toContainEqual(expect.stringContaining('outside'));
  });

  it('does not let static evidence omit or forge the video measurement contract', () => {
    const valid = validBestEvidence();
    expect(findAutoplayInvariantFailures({
      ...valid,
      mode: 'video',
      durationMs: VIDEO_DURATION_ACCEPTANCE.targetDurationMs,
    })).toContain('video report is missing its wall-clock duration acceptance');
    expect(findAutoplayInvariantFailures({
      ...valid,
      mode: 'video',
      durationMs: VIDEO_DURATION_ACCEPTANCE.targetDurationMs,
      durationAcceptance: {
        ...VIDEO_DURATION_ACCEPTANCE,
        maximumDurationMs: 360_000,
      },
    })).toContain('video report duration acceptance does not match the declared product gate');
  });

  it('rejects malformed envelope, warnings, and grade order', () => {
    const valid = validBestEvidence();
    const nodes = valid.nodes.map((node, index) =>
      index === 0 ? { ...node, warnings: ['transient soft-lock'] } : node,
    );
    const gradeHistory = [...valid.finalState.gradeHistory].reverse();
    const failures = findAutoplayInvariantFailures({
      ...valid,
      schemaVersion: '0.0',
      seed: 0x1_0000_0000,
      nodes,
      finalState: {
        ...valid.finalState,
        gradeHistory,
      },
    });
    expect(failures).toEqual(expect.arrayContaining([
      expect.stringContaining('report schema'),
      expect.stringContaining('outside uint32'),
      expect.stringContaining('warning: transient soft-lock'),
      expect.stringContaining('canonical encounter order'),
    ]));
  });
});

describe('VIDEO-P0-06 duration contract', () => {
  it('derives every boundary from one target and one tolerance', () => {
    expect(VIDEO_TARGET_DURATION_SEC).toBe(150);
    expect(VIDEO_DURATION_TOLERANCE_SEC).toBe(15);
    expect(VIDEO_DURATION_ACCEPTANCE).toEqual({
      targetDurationMs: 150_000,
      minimumDurationMs: 135_000,
      maximumDurationMs: 165_000,
      measurement: 'L2_WALL_CLOCK',
    });
  });

  it('accepts the tolerated band and rejects just outside it', () => {
    const { minimumDurationMs, maximumDurationMs } = VIDEO_DURATION_ACCEPTANCE;
    expect(minimumDurationMs).toBeLessThan(maximumDurationMs);
    // The rejected "never exceed 150s" reading would have capped this at 150_000.
    expect(maximumDurationMs).toBeGreaterThan(150_000);
    expect(minimumDurationMs).toBe(135_000);
  });

  it('paces the driver from the same target the report validates against', () => {
    expect(MODE_CONFIGS.video.targetDurationSec).toBe(VIDEO_TARGET_DURATION_SEC);
    expect((MODE_CONFIGS.video.targetDurationSec ?? 0) * 1_000).toBe(
      VIDEO_DURATION_ACCEPTANCE.targetDurationMs,
    );
  });
});
