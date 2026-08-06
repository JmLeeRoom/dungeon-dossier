import { describe, expect, it } from 'vitest';

import {
  AUTOPLAY_EXPECTED_NODES,
  AUTOPLAY_REPORT_SCHEMA_VERSION,
  findAutoplayInvariantFailures,
  type AutoplayReportEvidence,
} from '../../src/dev/autoplay/report';

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
        flagsSet: node.nodeId === 'run_ep004_05' ? ['F-13'] : [],
        durationMs: 100,
        warnings: [],
      };
    }),
    ending: { endingId: 'ending-true' },
    terminalMarker: 'RUN_COMPLETED',
    finalState: {
      nodeIndex: 15,
      terminal: true,
      dp: 100,
      stress: 0,
      trust: 3,
      flags: { 'F-13': true },
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
  it('accepts only complete canonical BEST evidence', () => {
    expect(findAutoplayInvariantFailures(validBestEvidence())).toEqual([]);
  });

  it('rejects the formerly false-positive NORMAL ending', () => {
    const valid = validBestEvidence();
    const failures = findAutoplayInvariantFailures({
      ...valid,
      ending: { endingId: 'ending-normal' },
      finalState: { ...valid.finalState, flags: { 'F-13': false } },
    });
    expect(failures).toContain('BEST ending must be ending-true, got ending-normal');
    expect(failures).toContain('BEST final state did not set F-13');
  });

  it('rejects a partial encounter even after all 15 nodes render', () => {
    const valid = validBestEvidence();
    const finalBossIndex = valid.nodes.findIndex(
      (node) => node.nodeId === 'run_ep004_05',
    );
    const nodes = valid.nodes.map((node, index) =>
      index === finalBossIndex ? { ...node, outcome: 'PARTIAL' } : node,
    );
    const gradeHistory = valid.finalState.gradeHistory.map((record) =>
      record.nodeId === 'run_ep004_05' ? { ...record, outcome: 'PARTIAL' } : record,
    );
    const failures = findAutoplayInvariantFailures({
      ...valid,
      nodes,
      finalState: { ...valid.finalState, gradeHistory },
    });
    expect(failures).toContain('run_ep004_05 outcome is PARTIAL, not BEST_RESOLUTION');
    expect(failures).toContain('run_ep004_05 grade-history outcome is PARTIAL');
  });

  it('rejects skipped or reordered strip nodes', () => {
    const valid = validBestEvidence();
    const nodes = [...valid.nodes];
    [nodes[0], nodes[1]] = [nodes[1]!, nodes[0]!];
    expect(findAutoplayInvariantFailures({ ...valid, nodes })).toEqual(
      expect.arrayContaining([expect.stringContaining('node order mismatch')]),
    );
  });
});
