import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  NonCombatEventSchema,
  type NonCombatEventDefinition,
} from '../../src/engine/domain';
import {
  completeEventNode,
  createRunState,
  type NodeDefinition,
  type RunState,
} from '../../src/engine/run';

const EVENT_ID = 'event_sample';
const EPISODE_ID = 'episode-sample';

/**
 * The EVENT and BOSS stages of one episode. Effects are exercised on the EVENT
 * stage; the BOSS stage that follows keeps the route open so a completion never
 * doubles as an episode or run clear.
 */
const STRIP: readonly NodeDefinition[] = [
  {
    nodeId: 'run-node-1',
    kind: 'EVENT',
    ref: EVENT_ID,
    caseDirectory: 'case-a',
    episodeId: EPISODE_ID,
    episodeIndex: 0,
    slotRole: 'EVENT',
    slotIndex: 1,
  },
  {
    nodeId: 'run-node-2',
    kind: 'BOSS',
    ref: 'encounter-1',
    caseDirectory: 'case-a',
    episodeId: EPISODE_ID,
    episodeIndex: 0,
    slotRole: 'BOSS',
    slotIndex: 2,
  },
];

const BASE = {
  event_id: EVENT_ID,
  node: 'run-node-1',
  title_key: 'event.sample.title',
  description_key: 'event.sample.description',
} as const;

function runState(overrides: Partial<RunState> = {}): RunState {
  return {
    ...createRunState({
      runSeed: 5,
      stress: 60,
      dp: 8,
      trust: 3,
      deck: { drawPile: [], hand: [], discardPile: [], exhaustPile: [] },
    }),
    ...overrides,
  };
}

/** Pattern E carries the narrow RunEffectSchema, so every run effect type is authorable. */
function canvassWith(effects: readonly unknown[]): NonCombatEventDefinition {
  return NonCombatEventSchema.parse({
    ...BASE,
    pattern: 'E',
    attempt_limit: 1,
    per_attempt_costs: { stress: 1 },
    topics: [
      {
        topic_id: 'topic_probe',
        label_key: 'event.sample.topic.probe',
        reveal_key: 'event.sample.topic.probe.reveal',
        effects,
      },
      {
        topic_id: 'topic_idle',
        label_key: 'event.sample.topic.idle',
        reveal_key: 'event.sample.topic.idle.reveal',
        effects: [{ type: 'ADJUST_RESOURCE', resource: 'trust', delta: 1 }],
      },
    ],
  });
}

/** Pattern C still carries the broad EffectSchema, which is where unhandled types arrive. */
function investigationWith(effects: readonly unknown[]): NonCombatEventDefinition {
  return NonCombatEventSchema.parse({
    ...BASE,
    pattern: 'C',
    attempt_limit: 1,
    per_attempt_costs: { stress: 0 },
    spots: [
      {
        spot_id: 'spot_probe',
        label_key: 'event.sample.spot.probe',
        effects,
      },
    ],
  });
}

function canvass(state: RunState, effects: readonly unknown[]): RunState {
  return completeEventNode(state, {
    strip: STRIP,
    flagDefinitions: [],
    eventDefinition: canvassWith(effects),
    canvassedTopicIds: ['topic_probe'],
  }).state;
}

function investigate(state: RunState, effects: readonly unknown[]): RunState {
  return completeEventNode(state, {
    strip: STRIP,
    flagDefinitions: [],
    eventDefinition: investigationWith(effects),
    investigatedSpotIds: ['spot_probe'],
  }).state;
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('applyRunEffects', () => {
  it('grants evidence exactly once', () => {
    const next = canvass(runState(), [
      { type: 'GRANT_EVIDENCE', target: 'ev_sample_note' },
      { type: 'GRANT_EVIDENCE', target: 'ev_sample_note' },
    ]);
    expect(next.acquiredEvidenceIds).toEqual(['ev_sample_note']);
  });

  it('adjusts run resources and clamps them at zero', () => {
    const next = canvass(runState(), [
      { type: 'ADJUST_RESOURCE', resource: 'dp', delta: 4 },
      { type: 'ADJUST_RESOURCE', resource: 'trust', delta: -9 },
    ]);
    expect(next.dp).toBe(12);
    expect(next.trust).toBe(0);
    expect(next.stress).toBe(59);
  });

  it('records an UPGRADE_EVIDENCE destination grade on owned evidence', () => {
    const next = canvass(runState({ acquiredEvidenceIds: ['ev_sample_receipt'] }), [
      { type: 'UPGRADE_EVIDENCE', target: 'ev_sample_receipt', to: 'A' },
    ]);
    expect(next.evidenceGradeById).toEqual({ ev_sample_receipt: 'A' });
  });

  it('refuses to upgrade evidence the run does not hold', () => {
    const state = runState();
    expect(() => canvass(state, [
      { type: 'UPGRADE_EVIDENCE', target: 'ev_sample_receipt', to: 'A' },
    ])).toThrow(/before the run acquires it/u);
    expect(state.evidenceGradeById).toEqual({});
  });

  it('opens routes without duplicating one the run already earned', () => {
    const next = canvass(runState({ openRouteIds: ['route_sample'] }), [
      { type: 'OPEN_ROUTE', target: 'route_sample' },
      { type: 'OPEN_ROUTE', target: 'route_second' },
    ]);
    expect(next.openRouteIds).toEqual(['route_sample', 'route_second']);
  });

  it('sets every scalar flag value shape', () => {
    const next = canvass(runState(), [
      { type: 'SET_FLAG', target: 'F-01', value: true },
      { type: 'SET_FLAG', target: 'F-02', value: 3 },
      { type: 'SET_FLAG', target: 'F-03', value: 'OPEN' },
    ]);
    expect(next.flags).toMatchObject({ 'F-01': true, 'F-02': 3, 'F-03': 'OPEN' });
  });

  it('rejects run effects whose required payload is missing', () => {
    expect(() => investigate(runState(), [{ type: 'OPEN_ROUTE' }])).toThrow(
      /OPEN_ROUTE requires a target route ID/u,
    );
    expect(() => investigate(runState(), [{ type: 'SET_FLAG', target: 'F-01' }])).toThrow(
      /requires a scalar flag value/u,
    );
    expect(() => investigate(runState(), [
      { type: 'SET_FLAG', target: 'F-01', value: { nested: true } },
    ])).toThrow(/requires a scalar flag value/u);
    expect(() => investigate(runState(), [
      { type: 'UPGRADE_EVIDENCE', target: 'ev_sample_receipt' },
    ])).toThrow(/destination grade/u);
  });

  it('commits nothing when a later effect in the same array is rejected', () => {
    const state = runState();
    expect(() => investigate(state, [
      { type: 'GRANT_EVIDENCE', target: 'ev_sample_note' },
      { type: 'OPEN_ROUTE' },
    ])).toThrow(/OPEN_ROUTE requires a target route ID/u);
    expect(state.acquiredEvidenceIds).toEqual([]);
  });

  it('warns instead of throwing when an effect type has no run-level meaning', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const before = runState();
    const next = investigate(before, [
      { type: 'DRAW_CARDS', target: 'card_press' },
      { type: 'GRANT_EVIDENCE', target: 'ev_sample_note' },
    ]);

    expect(next.acquiredEvidenceIds).toEqual(['ev_sample_note']);
    expect(next.deck).toEqual(before.deck);
    expect(warn).toHaveBeenCalledWith(
      'applyRunEffects: unhandled effect type "DRAW_CARDS" was dropped.',
    );
  });
});
