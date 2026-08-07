import { describe, expect, it } from 'vitest';

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

const STRIP: readonly NodeDefinition[] = [
  { nodeId: 'run-node-1', kind: 'EVENT', ref: EVENT_ID, caseDirectory: 'case-a' },
  { nodeId: 'run-node-2', kind: 'ENCOUNTER', ref: 'encounter-1', caseDirectory: 'case-a' },
];

const BASE = {
  event_id: EVENT_ID,
  node: 'run-node-1',
  title_key: 'event.sample.title',
  description_key: 'event.sample.description',
} as const;

function parseEvent(authored: unknown): NonCombatEventDefinition {
  return NonCombatEventSchema.parse(authored);
}

function runState(overrides: Partial<RunState> = {}): RunState {
  return {
    ...createRunState({
      runSeed: 11,
      stress: 100,
      dp: 10,
      trust: 5,
      deck: {
        drawPile: ['card_press'],
        hand: ['card_press'],
        discardPile: ['card_query'],
        exhaustPile: [],
      },
    }),
    ...overrides,
  };
}

/** Re-opens the same EVENT node so repeated commits can be observed. */
function reopenNode(state: RunState): RunState {
  return { ...state, nodeIndex: 0, completedNodeIds: [], terminal: false };
}

const CARD_INTENTS = { card_press: 'PRESSURE', card_query: 'QUERY' } as const;

function enhanceEvent(): NonCombatEventDefinition {
  return parseEvent({
    ...BASE,
    pattern: 'D',
    fallback_gains: [{ type: 'ADJUST_RESOURCE', resource: 'dp', delta: 2 }],
    options: [
      {
        option_id: 'option_press',
        label_key: 'event.sample.option.press',
        costs: { dp: 3 },
        eligible_intents: ['PRESSURE'],
        tuning: { cp_delta: -1, composure_damage_delta: 2, coercion_delta: -1 },
        effects: [{ type: 'SET_FLAG', target: 'F-12', value: true }],
      },
      {
        option_id: 'option_forensic',
        label_key: 'event.sample.option.forensic',
        eligible_intents: ['FORENSIC'],
        tuning: { cp_delta: 1 },
      },
      {
        option_id: 'option_overflow',
        label_key: 'event.sample.option.overflow',
        tuning: { composure_damage_delta: 9_000 },
      },
    ],
  });
}

function canvassEvent(): NonCombatEventDefinition {
  return parseEvent({
    ...BASE,
    pattern: 'E',
    attempt_limit: 2,
    per_attempt_costs: { stress: 4 },
    topics: [
      {
        topic_id: 'topic_alibi',
        label_key: 'event.sample.topic.alibi',
        reveal_key: 'event.sample.topic.alibi.reveal',
        effects: [{ type: 'GRANT_EVIDENCE', target: 'ev_sample_note' }],
      },
      {
        topic_id: 'topic_ledger',
        label_key: 'event.sample.topic.ledger',
        reveal_key: 'event.sample.topic.ledger.reveal',
        effects: [{ type: 'OPEN_ROUTE', target: 'route_sample' }],
      },
      {
        topic_id: 'topic_rumour',
        label_key: 'event.sample.topic.rumour',
        reveal_key: 'event.sample.topic.rumour.reveal',
        effects: [{ type: 'ADJUST_RESOURCE', resource: 'trust', delta: 1 }],
      },
    ],
  });
}

function collectEvent(): NonCombatEventDefinition {
  return parseEvent({
    ...BASE,
    pattern: 'F',
    attempt_limit: 2,
    per_attempt_costs: { stress: 3 },
    targets: [
      {
        target_id: 'target_desk',
        label_key: 'event.sample.target.desk',
        evidence_id: 'ev_sample_receipt',
        grade: 'C',
        effects: [{ type: 'UPGRADE_EVIDENCE', target: 'ev_sample_receipt', to: 'B' }],
      },
      {
        target_id: 'target_locker',
        label_key: 'event.sample.target.locker',
        evidence_id: 'ev_sample_key',
        grade: 'A',
      },
    ],
  });
}

describe('pattern D — card enhancement', () => {
  it('accumulates tuning across repeat enhancements of the same definition', () => {
    const event = enhanceEvent();
    const first = completeEventNode(runState(), {
      strip: STRIP,
      flagDefinitions: [],
      eventDefinition: event,
      optionId: 'option_press',
      tunedCardId: 'card_press',
      cardIntentsById: CARD_INTENTS,
    });
    expect(first.state.cardTuning).toEqual({
      card_press: { cpDelta: -1, composureDamageDelta: 2, coercionDelta: -1 },
    });
    expect(first.state.dp).toBe(7);
    expect(first.state.flags['F-12']).toBe(true);

    const second = completeEventNode(reopenNode(first.state), {
      strip: STRIP,
      flagDefinitions: [],
      eventDefinition: event,
      optionId: 'option_press',
      tunedCardId: 'card_press',
      cardIntentsById: CARD_INTENTS,
    });
    expect(second.state.cardTuning).toEqual({
      card_press: { cpDelta: -2, composureDamageDelta: 4, coercionDelta: -2 },
    });
    expect(second.state.dp).toBe(4);
  });

  it('clamps accumulated tuning to the bound the save schema persists', () => {
    const event = enhanceEvent();
    let state = runState();
    for (let round = 0; round < 3; round += 1) {
      state = reopenNode(completeEventNode(state, {
        strip: STRIP,
        flagDefinitions: [],
        eventDefinition: event,
        optionId: 'option_overflow',
        tunedCardId: 'card_query',
        cardIntentsById: CARD_INTENTS,
      }).state);
    }
    expect(state.cardTuning['card_query']?.composureDamageDelta).toBe(10_000);
  });

  it('completes with the authored fallback instead of throwing when no card is eligible', () => {
    const completion = completeEventNode(runState(), {
      strip: STRIP,
      flagDefinitions: [],
      eventDefinition: enhanceEvent(),
      optionId: 'option_forensic',
      tunedCardId: 'card_press',
      cardIntentsById: CARD_INTENTS,
    });
    expect(completion.state.cardTuning).toEqual({});
    expect(completion.state.dp).toBe(12);
    expect(completion.state.nodeIndex).toBe(1);
    expect(completion.state.completedNodeIds).toEqual(['run-node-1']);
  });

  it('treats a missing intent lookup as ineligible rather than tuning an unverified card', () => {
    const completion = completeEventNode(runState(), {
      strip: STRIP,
      flagDefinitions: [],
      eventDefinition: enhanceEvent(),
      optionId: 'option_press',
      tunedCardId: 'card_press',
    });
    expect(completion.state.cardTuning).toEqual({});
    expect(completion.state.dp).toBe(12);
  });

  it('declines without cost or tuning when no option is submitted', () => {
    const completion = completeEventNode(runState(), {
      strip: STRIP,
      flagDefinitions: [],
      eventDefinition: enhanceEvent(),
      cardIntentsById: CARD_INTENTS,
    });
    expect(completion.state.cardTuning).toEqual({});
    expect(completion.state.dp).toBe(10);
    expect(completion.state.nodeIndex).toBe(1);
  });

  it('rejects unknown options, unowned cards, and unaffordable costs', () => {
    const event = enhanceEvent();
    expect(() => completeEventNode(runState(), {
      strip: STRIP,
      flagDefinitions: [],
      eventDefinition: event,
      optionId: 'option_missing',
      cardIntentsById: CARD_INTENTS,
    })).toThrow(/Unknown enhancement option/u);

    expect(() => completeEventNode(runState(), {
      strip: STRIP,
      flagDefinitions: [],
      eventDefinition: event,
      optionId: 'option_press',
      tunedCardId: 'card_query',
      cardIntentsById: CARD_INTENTS,
    })).toThrow(/not eligible for enhancement option/u);

    expect(() => completeEventNode(runState(), {
      strip: STRIP,
      flagDefinitions: [],
      eventDefinition: event,
      optionId: 'option_press',
      cardIntentsById: CARD_INTENTS,
    })).toThrow(/requires the card its option tunes/u);

    expect(() => completeEventNode(runState({ dp: 1 }), {
      strip: STRIP,
      flagDefinitions: [],
      eventDefinition: event,
      optionId: 'option_press',
      tunedCardId: 'card_press',
      cardIntentsById: CARD_INTENTS,
    })).toThrow(/cost exceeds the available run resource/u);
  });
});

describe('pattern E — canvassing', () => {
  it('charges each attempt, applies topic effects, and records the topics', () => {
    const completion = completeEventNode(runState(), {
      strip: STRIP,
      flagDefinitions: [],
      eventDefinition: canvassEvent(),
      canvassedTopicIds: ['topic_alibi', 'topic_ledger'],
    });
    expect(completion.state.stress).toBe(92);
    expect(completion.state.acquiredEvidenceIds).toEqual(['ev_sample_note']);
    expect(completion.state.openRouteIds).toEqual(['route_sample']);
    expect(completion.state.canvassedTopicIds).toEqual(['topic_alibi', 'topic_ledger']);
  });

  it('blocks re-canvassing a topic already spent in this run', () => {
    expect(() => completeEventNode(runState({ canvassedTopicIds: ['topic_alibi'] }), {
      strip: STRIP,
      flagDefinitions: [],
      eventDefinition: canvassEvent(),
      canvassedTopicIds: ['topic_alibi'],
    })).toThrow(/already canvassed in this run/u);
  });

  it('rejects exceeding or duplicating the authored attempt limit', () => {
    const event = canvassEvent();
    expect(() => completeEventNode(runState(), {
      strip: STRIP,
      flagDefinitions: [],
      eventDefinition: event,
      canvassedTopicIds: ['topic_alibi', 'topic_ledger', 'topic_rumour'],
    })).toThrow(/unique attempt limit/u);

    expect(() => completeEventNode(runState(), {
      strip: STRIP,
      flagDefinitions: [],
      eventDefinition: event,
      canvassedTopicIds: ['topic_alibi', 'topic_alibi'],
    })).toThrow(/unique attempt limit/u);

    expect(() => completeEventNode(runState(), {
      strip: STRIP,
      flagDefinitions: [],
      eventDefinition: event,
      canvassedTopicIds: ['topic_missing'],
    })).toThrow(/Unknown canvass topic/u);
  });

  it('leaves the run untouched when a later attempt cannot be paid', () => {
    const state = runState({ stress: 5 });
    expect(() => completeEventNode(state, {
      strip: STRIP,
      flagDefinitions: [],
      eventDefinition: canvassEvent(),
      canvassedTopicIds: ['topic_alibi', 'topic_ledger'],
    })).toThrow(/cost exceeds the available run resource/u);
    expect(state.canvassedTopicIds).toEqual([]);
    expect(state.acquiredEvidenceIds).toEqual([]);
  });
});

describe('pattern F — forensic collection', () => {
  it('acquires evidence with its authored grade before running target effects', () => {
    const completion = completeEventNode(runState(), {
      strip: STRIP,
      flagDefinitions: [],
      eventDefinition: collectEvent(),
      collectedTargetIds: ['target_desk', 'target_locker'],
    });
    expect(completion.state.stress).toBe(94);
    expect(completion.state.acquiredEvidenceIds).toEqual([
      'ev_sample_receipt',
      'ev_sample_key',
    ]);
    // target_desk grants grade C, then its own effect upgrades it to B.
    expect(completion.state.evidenceGradeById).toEqual({
      ev_sample_receipt: 'B',
      ev_sample_key: 'A',
    });
  });

  it('blocks collecting evidence the run already holds', () => {
    expect(() => completeEventNode(
      runState({ acquiredEvidenceIds: ['ev_sample_receipt'] }),
      {
        strip: STRIP,
        flagDefinitions: [],
        eventDefinition: collectEvent(),
        collectedTargetIds: ['target_desk'],
      },
    )).toThrow(/already in the pouch/u);
  });

  it('rejects exceeding, duplicating, or inventing collection targets', () => {
    const event = collectEvent();
    expect(() => completeEventNode(runState(), {
      strip: STRIP,
      flagDefinitions: [],
      eventDefinition: event,
      collectedTargetIds: ['target_desk', 'target_locker', 'target_desk'],
    })).toThrow(/unique attempt limit/u);

    expect(() => completeEventNode(runState(), {
      strip: STRIP,
      flagDefinitions: [],
      eventDefinition: event,
      collectedTargetIds: ['target_missing'],
    })).toThrow(/Unknown collection target/u);
  });

  it('completes with no cost when nothing is collected', () => {
    const completion = completeEventNode(runState(), {
      strip: STRIP,
      flagDefinitions: [],
      eventDefinition: collectEvent(),
    });
    expect(completion.state.stress).toBe(100);
    expect(completion.state.acquiredEvidenceIds).toEqual([]);
    expect(completion.state.nodeIndex).toBe(1);
  });
});
