import { describe, expect, it } from 'vitest';
import runStripJson from '../../content/common/run-strip.json';

import {
  AUTO_PLAY_NODE_COUNT,
  createAutoPlayHarness,
  installAutoPlayGlobal,
} from '../../src/dev/autoPlayHarness';
import { MAX_AUTOPLAY_SEED } from '../../src/app/autoplayPort';
import { EPISODE_NODE_COUNT, RunStripSchema } from '../../src/engine/domain';
import { createNodeStrip } from '../../src/engine/run';

// Independent re-derivation of the canonical route from shipped content: every
// episode slot resolved to its first candidate, in declared episode order.
const CANONICAL_STRIP = RunStripSchema.parse(runStripJson);
const EXPECTED_NODES = createNodeStrip(CANONICAL_STRIP).map((node, index) => ({
  index,
  nodeId: node.nodeId,
  kind: node.kind,
  ref: node.ref,
}));
const EXPECTED_NODE_IDS = EXPECTED_NODES.map((node) => node.nodeId);
const EXPECTED_ENCOUNTER_COUNT = EXPECTED_NODES.filter(
  ({ kind }) => kind !== 'EVENT',
).length;
const EXPECTED_EVENT_COUNT = EXPECTED_NODES.length - EXPECTED_ENCOUNTER_COUNT;
/** Mid-run reload boundary: inside ep001, after the tutorial episode cleared. */
const RELOAD_AFTER_COMPLETED_NODES = 5;

describe('episode-route unattended autoplay', () => {
  it('resolves one node per episode slot before any of it is played', () => {
    expect(AUTO_PLAY_NODE_COUNT).toBe(
      CANONICAL_STRIP.episodes.length * EPISODE_NODE_COUNT,
    );
    expect(EXPECTED_NODE_IDS).toEqual([
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
    expect(EXPECTED_ENCOUNTER_COUNT).toBe(6);
    expect(EXPECTED_EVENT_COUNT).toBe(3);
    expect(RELOAD_AFTER_COMPLETED_NODES).toBeGreaterThan(0);
    expect(RELOAD_AFTER_COMPLETED_NODES).toBeLessThan(AUTO_PLAY_NODE_COUNT);
  });

  it('visits the canonical route and reaches RUN_COMPLETED without a throw', async () => {
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
    expect(encounterNodes).toHaveLength(EXPECTED_ENCOUNTER_COUNT);
    expect(encounterNodes.every(({ outcome }) => outcome === 'BEST_RESOLUTION')).toBe(true);
    expect(encounterNodes.every(({ grade }) => grade !== null)).toBe(true);
    expect(encounterNodes.every(({ resolutionCodes }) => resolutionCodes.length > 0)).toBe(true);
    expect(result.nodes.filter(({ kind }) => kind === 'EVENT')).toHaveLength(
      EXPECTED_EVENT_COUNT,
    );
    expect(result.finalState).toMatchObject({
      nodeIndex: AUTO_PLAY_NODE_COUNT,
      terminal: true,
      completedNodeIds: EXPECTED_NODE_IDS,
      pendingRewardIds: [],
      gradeCount: EXPECTED_ENCOUNTER_COUNT,
      outcomeCount: EXPECTED_ENCOUNTER_COUNT,
    });
    expect(harness.getProgress()).toEqual(result);
  });

  it('restores the mid-episode save and still completes the remaining nodes', async () => {
    const result = await createAutoPlayHarness({
      seed: 20_260_805,
      reloadAfterCompletedNodes: RELOAD_AFTER_COMPLETED_NODES,
    }).start();

    expect(result.status).toBe('RUN_COMPLETED');
    expect(result.reloadNodeIndices).toEqual([RELOAD_AFTER_COMPLETED_NODES]);
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
