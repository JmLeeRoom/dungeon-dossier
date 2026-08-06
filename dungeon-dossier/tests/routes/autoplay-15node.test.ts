import { describe, expect, it } from 'vitest';

import {
  AUTO_PLAY_NODE_COUNT,
  createAutoPlayHarness,
  installAutoPlayGlobal,
} from '../../src/dev/autoPlayHarness';

const EXPECTED_NODE_IDS = [
  'run_tutorial_01',
  'run_tutorial_02',
  'run_tutorial_03',
  'run_tutorial_04',
  'run_tutorial_05',
  'run_ep001_01',
  'run_ep001_02',
  'run_ep001_03',
  'run_ep001_04',
  'run_ep001_05',
  'run_ep004_01',
  'run_ep004_02',
  'run_ep004_03',
  'run_ep004_04',
  'run_ep004_05',
] as const;

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
    expect(result.nodes.map(({ nodeId }) => nodeId)).toEqual(EXPECTED_NODE_IDS);
    expect(result.nodes.map(({ index }) => index)).toEqual(
      Array.from({ length: AUTO_PLAY_NODE_COUNT }, (_, index) => index),
    );
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
});
