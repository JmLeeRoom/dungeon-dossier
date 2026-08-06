import { describe, expect, it } from 'vitest';
import runStripJson from '../../content/common/run-strip.json';

import {
  AUTO_PLAY_NODE_COUNT,
  createAutoPlayHarness,
  installAutoPlayGlobal,
} from '../../src/dev/autoPlayHarness';
import { MAX_AUTOPLAY_SEED } from '../../src/app/autoplayPort';
import { RunStripSchema } from '../../src/engine/domain';

const EXPECTED_NODES = RunStripSchema.parse(runStripJson).nodes.map(
  (node, index) => ({
    index,
    nodeId: node.node_id,
    kind: node.kind,
    ref: node.ref,
  }),
);
const EXPECTED_NODE_IDS = EXPECTED_NODES.map((node) => node.nodeId);

describe('15-node unattended autoplay', () => {
  it('visits the canonical strip and reaches RUN_COMPLETED without a throw', async () => {
    const harness = createAutoPlayHarness({ seed: 20_260_805 });
    const result = await harness.start();

    expect(result.status).toBe('RUN_COMPLETED');
    expect(result.totalNodes).toBe(AUTO_PLAY_NODE_COUNT);
    expect(result.completedNodes).toBe(AUTO_PLAY_NODE_COUNT);
    expect(result.visitedNodeIds).toEqual(EXPECTED_NODE_IDS);
    expect(result.errorCount).toBe(0);
    expect(result.errors).toEqual([]);
    expect(result.endingId).toBe('ending-true');
    expect(result.nodes.map(({ index, nodeId, kind, ref }) => ({
      index,
      nodeId,
      kind,
      ref,
    }))).toEqual(EXPECTED_NODES);
    const encounterNodes = result.nodes.filter(({ kind }) => kind !== 'EVENT');
    expect(encounterNodes).toHaveLength(9);
    expect(encounterNodes.every(({ outcome }) => outcome === 'BEST_RESOLUTION')).toBe(true);
    expect(encounterNodes.every(({ grade }) => grade !== null)).toBe(true);
    expect(encounterNodes.every(({ resolutionCodes }) => resolutionCodes.length > 0)).toBe(true);
    expect(result.nodes.filter(({ kind }) => kind === 'EVENT')).toHaveLength(6);
    expect(result.finalState).toMatchObject({
      nodeIndex: AUTO_PLAY_NODE_COUNT,
      terminal: true,
      completedNodeIds: EXPECTED_NODE_IDS,
      pendingRewardIds: [],
      gradeCount: 9,
      outcomeCount: 9,
    });
    expect(harness.getProgress()).toEqual(result);
  });

  it('restores the node-7 save and still completes nodes 8 through 15', async () => {
    const result = await createAutoPlayHarness({
      seed: 20_260_805,
      reloadAfterCompletedNodes: 7,
    }).start();

    expect(result.status).toBe('RUN_COMPLETED');
    expect(result.reloadNodeIndices).toEqual([7]);
    expect(result.visitedNodeIds).toEqual(EXPECTED_NODE_IDS);
    expect(result.errors).toEqual([]);
    expect(result.finalState).toMatchObject({
      nodeIndex: AUTO_PLAY_NODE_COUNT,
      terminal: true,
      completedNodeIds: EXPECTED_NODE_IDS,
      pendingRewardIds: [],
    });
  });

  it('installs the start/stop/getProgress browser contract', () => {
    const target = {} as Window;
    const binding = installAutoPlayGlobal(target);

    expect(target.__AUTO_PLAY__).toBe(binding);
    expect(typeof binding.start).toBe('function');
    expect(typeof binding.stop).toBe('function');
    expect(typeof binding.getProgress).toBe('function');
    expect(binding.getProgress().status).toBe('IDLE');
  });

  it('enforces the same uint32 seed boundary for the programmatic L1 API', () => {
    expect(createAutoPlayHarness({ seed: 0 }).getProgress().seed).toBe(0);
    expect(
      createAutoPlayHarness({ seed: MAX_AUTOPLAY_SEED }).getProgress().seed,
    ).toBe(MAX_AUTOPLAY_SEED);
    expect(() => createAutoPlayHarness({ seed: -1 })).toThrow(/0 through/u);
    expect(() => createAutoPlayHarness({ seed: 1.5 })).toThrow(/0 through/u);
    expect(() => createAutoPlayHarness({ seed: MAX_AUTOPLAY_SEED + 1 })).toThrow(
      /0 through/u,
    );
  });
});
