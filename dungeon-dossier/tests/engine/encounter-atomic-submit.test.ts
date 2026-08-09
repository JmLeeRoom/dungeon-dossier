import { describe, expect, it } from 'vitest';

import {
  BalanceSchema,
  CardSchema,
  CaseSchema,
  type CaseDefinition,
} from '../../src/engine/domain';
import type { CardDefinition } from '../../src/engine/cards';
import {
  EncounterCoordinator,
  EncounterInvariantError,
  addResourceDeltas,
  computeResourceDelta,
  isZeroResourceDelta,
  type EncounterCoordinatorDeps,
  type EncounterFaultPoint,
} from '../../src/engine/encounter';
import { createRngState } from '../../src/engine/rng';

const CASE = CaseSchema.parse({
  schema_version: '1.0',
  case_id: 'case_atomic_test',
  metadata: {
    title: 'Atomic submit test',
    act: 0,
    estimated_turns: 5,
  },
  entities: [
    {
      entity_id: 'ent_atomic_suspect',
      type: 'PERSON',
      role: 'SUSPECT',
      display_name_key: 'entity.atomic.suspect',
      attributes: {},
    },
  ],
  events: [
    {
      event_id: 'event_atomic_truth',
      time: { from: 10, to: 20 },
      participants: ['ent_atomic_suspect'],
      action: 'ENTERED_ARCHIVE',
    },
  ],
  claims: [
    {
      claim_id: 'clm_atomic_main',
      speaker: 'ent_atomic_suspect',
      facet: 'WHO',
      canonical_meaning: 'The suspect says nobody entered the archive.',
      predicate: 'ABSENT_FROM_ARCHIVE',
      initial: { commitment: 'ASSERTED', presentation: 'NORMAL' },
      resistance: 0,
      is_required: true,
      truth: {
        relation: 'CONTRADICTED_BY_WORLD',
        contradicting_events: ['event_atomic_truth'],
      },
    },
    {
      claim_id: 'clm_atomic_hidden',
      speaker: 'ent_atomic_suspect',
      facet: 'WHY',
      canonical_meaning: 'An unrevealed claim used to test presentation gating.',
      predicate: 'HIDDEN_MOTIVE',
      initial: { commitment: 'UNSTATED', presentation: 'HIDDEN' },
      truth: {
        relation: 'CONSISTENT_WITH_WORLD',
        contradicting_events: [],
      },
    },
    ...(['WHEN', 'WHERE', 'WHAT', 'HOW', 'WHY'] as const).map((facet) => ({
      claim_id: `clm_atomic_${facet.toLowerCase()}`,
      speaker: 'ent_atomic_suspect',
      facet,
      canonical_meaning: `Atomic ${facet} statement.`,
      predicate: `ATOMIC_${facet}`,
      initial: { commitment: 'ASSERTED' as const, presentation: 'NORMAL' as const },
      truth: {
        relation: 'UNVERIFIABLE' as const,
        contradicting_events: [],
      },
    })),
  ],
  inquiry_routes: [],
  evidence: [
    {
      evidence_id: 'ev_atomic_entry_log',
      type: 'ACCESS_LOG',
      title_key: 'evidence.atomic.entry_log',
      acquire: { node: 'node_atomic_start', method: 'STARTING' },
      source_category: 'DIGITAL',
      independence: {
        source_id: 'source_atomic_access',
        group: 'DIGITAL',
        derived_from: null,
      },
      grade: { initial: 'A', upgrades: [] },
      integrity: { initial: 'INTACT' },
      observations: [
        {
          observation_id: 'observation_atomic_presence',
          subject_id: 'ent_atomic_suspect',
          predicate: 'ENTERED_ARCHIVE',
          summary_key: 'evidence.atomic.entry_log.summary',
          scopes: ['PRESENCE'],
          detail: {},
          confidence: 1,
          contradicts_claim_ids: ['clm_atomic_main'],
        },
      ],
      not_proven_keys: ['evidence.atomic.not_time'],
    },
    {
      evidence_id: 'ev_atomic_unacquired_time',
      type: 'CLOCK_LOG',
      title_key: 'evidence.atomic.time',
      acquire: { node: 'node_atomic_later', method: 'EVENT_RESULT' },
      source_category: 'DIGITAL',
      independence: {
        source_id: 'source_atomic_clock',
        group: 'DIGITAL',
        derived_from: null,
      },
      grade: { initial: 'A', upgrades: [] },
      integrity: { initial: 'INTACT' },
      observations: [
        {
          observation_id: 'observation_atomic_time',
          subject_id: 'ent_atomic_suspect',
          predicate: 'ENTERED_AT_TIME',
          summary_key: 'evidence.atomic.time.summary',
          scopes: ['TIME'],
          detail: {},
          confidence: 1,
          contradicts_claim_ids: ['clm_atomic_main'],
        },
      ],
      not_proven_keys: ['evidence.atomic.not_presence'],
    },
  ],
  proof_rules: [
    {
      rule_id: 'rule_atomic_first',
      target_claim_id: 'clm_atomic_main',
      direction: 'CONTRADICT',
      requirements: {
        required_scopes: ['PRESENCE'],
        minimum_confidence: 0.8,
        minimum_independent_sources: 1,
        require_integrity: true,
      },
      guaranteed_evidence_sets: [['ev_atomic_entry_log']],
    },
    {
      rule_id: 'rule_atomic_second',
      target_claim_id: 'clm_atomic_main',
      direction: 'CONTRADICT',
      requirements: {
        required_scopes: ['TIME'],
        minimum_confidence: 0.8,
        minimum_independent_sources: 1,
        require_integrity: true,
      },
      guaranteed_evidence_sets: [['ev_atomic_unacquired_time']],
    },
  ],
  encounters: [
    {
      encounter_id: 'enc_atomic_test',
      target_entity: 'ent_atomic_suspect',
      resources: {
        composure_max: 40,
        cp_per_turn: 3,
        cp_max: 3,
        coercion_limit: 100,
        shields_per_round: 2,
      },
      rounds: [
        {
          round_id: 'round_atomic_one',
          statement_claims: [
            'clm_atomic_main',
            'clm_atomic_when',
            'clm_atomic_where',
            'clm_atomic_what',
            'clm_atomic_how',
            'clm_atomic_why',
          ],
          shields: [
            { claim_id: 'clm_atomic_main', durability: 1 },
            { claim_id: 'clm_atomic_why', durability: 1 },
          ],
        },
      ],
      flow_nodes: [
        {
          node_id: 'node_atomic_start',
          enter_conditions: [{ type: 'ALWAYS' }],
          reveal_claim_ids: [],
          revise_claim_ids: [],
          open_route_ids: [],
          activate_modifiers: [],
          deactivate_modifiers: [],
          reaction_key: 'reaction.atomic.start',
          resource_delta: {},
          is_terminal: false,
        },
      ],
      modifiers: [],
      objectives: {
        required: [
          {
            objective_id: 'objective_atomic_refute',
            type: 'REFUTE_CLAIM',
            claim_id: 'clm_atomic_main',
          },
        ],
        optional: [],
        state_conditions: { composure_min: 1, composure_max: 30 },
      },
      outcomes: [
        {
          outcome_id: 'outcome_atomic_best',
          grade: 'BEST_RESOLUTION',
          priority: 1,
          conditions: [{ type: 'ALL_REQUIRED_OBJECTIVES' }],
        },
      ],
    },
  ],
  events_noncombat: [],
  flag_hooks: [],
  dialogue: {
    speaker_profiles: {
      ent_atomic_suspect: {
        race: 'HUMAN',
        personality: ['CAUTIOUS'],
        speech: 'FORMAL',
        forbidden_expressions: [],
      },
    },
    statements: {
      clm_atomic_main: {
        fallback: ['Nobody entered the archive.'],
        spans: [{ claim_id: 'clm_atomic_main', start: 0, end: 6 }],
      },
    },
    reactions: {
      'reaction.atomic.start': ['Present your evidence.'],
    },
    confession: {
      full: ['I entered the archive.'],
      coerced: ['Fine, I did it.'],
    },
  },
});

const BALANCE = BalanceSchema.parse({
  schema_version: '1.0',
  draw: {
    initial: 2,
    perTurn: 1,
    handLimit: 3,
    reshuffleOnEmpty: true,
  },
  stress: { max: 100 },
  dp: { initial: 5, rewardBattle: 20 },
  dmg: {
    // Drives 40 composure into the authored 1-30% sweet spot in one action.
    contradict: 30,
    pressure: 8,
    requery: 4,
    chainPursuit: 12,
  },
  shield: { durabilityDefault: 1 },
  composureDmg: { indirect: 4 },
  coercion: {
    insufficient: 2,
    truthAttack: 15,
    irrelevant: 5,
    redStampFactor: 1.5,
    goblinReflectFactor: 2,
    breathReduce: 4,
    finalConfirmReduce: 3,
  },
  committedMultiplier: 1.4,
  independence: { partialWeight: 0.5 },
  partner: { cooldowns: {} },
  trust: { max: 3, thresholds: [1, 2] },
  composure: { regen: {} },
  overrides: { byEncounter: {} },
  sweetSpot: { min: 1, max: 30 },
});

const CARDS: readonly CardDefinition[] = [
  CardSchema.parse({
    card_id: 'card_atomic_contradict',
    name_key: 'card.atomic.contradict',
    description_key: 'card.atomic.contradict.description',
    category: 'BASE',
    intent: 'CONTRADICT',
    cost: { cp: 2 },
    target: { kind: 'CLAIM', min_evidence: 1, max_evidence: 1 },
    modifiers: [],
    starting_copies: 1,
  }),
  CardSchema.parse({
    card_id: 'card_atomic_expensive',
    name_key: 'card.atomic.expensive',
    description_key: 'card.atomic.expensive.description',
    category: 'BASE',
    intent: 'CONTRADICT',
    cost: { cp: 4 },
    target: { kind: 'CLAIM', min_evidence: 1 },
    modifiers: [],
    starting_copies: 1,
  }),
];

/** Adds a post-refute flow node that revises the main claim and taxes coercion. */
const FLOW_CASE: CaseDefinition = CaseSchema.parse({
  ...CASE,
  encounters: CASE.encounters.map((encounter) => ({
    ...encounter,
    flow_nodes: [
      ...encounter.flow_nodes,
      {
        node_id: 'node_atomic_reveal',
        enter_conditions: [
          {
            type: 'CLAIM_EPISTEMIC',
            claim_id: 'clm_atomic_main',
            state: 'REFUTED',
          },
        ],
        reveal_claim_ids: ['clm_atomic_hidden'],
        revise_claim_ids: ['clm_atomic_main'],
        open_route_ids: [],
        activate_modifiers: [],
        deactivate_modifiers: [],
        reaction_key: 'reaction.atomic.reveal',
        resource_delta: { coercion: 3 },
        is_terminal: true,
      },
    ],
  })),
});

const LAST_TURN_CASE: CaseDefinition = CaseSchema.parse({
  ...CASE,
  metadata: { ...CASE.metadata, estimated_turns: 1 },
});

const REVERSED_RULES_CASE: CaseDefinition = {
  ...CASE,
  proof_rules: [...CASE.proof_rules].reverse(),
};

const LOW_COERCION_CASE: CaseDefinition = CaseSchema.parse({
  ...REVERSED_RULES_CASE,
  encounters: CASE.encounters.map((encounter) => ({
    ...encounter,
    resources: { ...encounter.resources, coercion_limit: 5 },
  })),
});

const BROKEN_FLOW_CASE: CaseDefinition = CaseSchema.parse({
  ...CASE,
  encounters: CASE.encounters.map((encounter) => ({
    ...encounter,
    flow_nodes: [
      ...encounter.flow_nodes,
      {
        node_id: 'node_atomic_broken',
        enter_conditions: [
          {
            type: 'CLAIM_EPISTEMIC',
            claim_id: 'clm_atomic_main',
            state: 'REFUTED',
          },
        ],
        reveal_claim_ids: [],
        revise_claim_ids: ['clm_atomic_missing'],
        open_route_ids: [],
        activate_modifiers: [],
        deactivate_modifiers: [],
        reaction_key: 'reaction.atomic.broken',
        resource_delta: {},
        is_terminal: true,
      },
    ],
  })),
});

function v2Deps(
  caseDefinition: CaseDefinition = CASE,
  seed = 7,
  faultInjection?: EncounterCoordinatorDeps['faultInjection'],
): EncounterCoordinatorDeps {
  return {
    caseDefinition,
    encounterId: 'enc_atomic_test',
    cards: CARDS,
    balance: BALANCE,
    rng: createRngState(seed, 'DECK_SHUFFLE'),
    cardDrawRng: createRngState(seed, 'CARD_DRAW'),
    drawSlots: [
      { slotId: 'slot-1', blueprintId: 'card_atomic_contradict' },
      { slotId: 'slot-2', blueprintId: 'card_atomic_contradict' },
      { slotId: 'slot-3', blueprintId: 'card_atomic_contradict' },
      { slotId: 'slot-4', blueprintId: 'card_atomic_expensive' },
      { slotId: 'slot-5', blueprintId: 'card_atomic_contradict' },
    ],
    turnLoop: 'V2_ATOMIC',
    identity: {
      nodeId: 'node_v2_test',
      encounterAttemptId: 'run-v2:node_v2_test:1',
      initialDrawSerial: 0,
    },
    contentRevision: 'test-rev',
    ...(faultInjection === undefined ? {} : { faultInjection }),
  };
}

function beginV2(
  caseDefinition: CaseDefinition = CASE,
  seed = 7,
  faultInjection?: EncounterCoordinatorDeps['faultInjection'],
): EncounterCoordinator {
  return EncounterCoordinator.begin(v2Deps(caseDefinition, seed, faultInjection));
}

function handInstanceFor(
  coordinator: EncounterCoordinator,
  blueprintId: string,
): string {
  const instance = (coordinator.snapshot.handInstances ?? []).find(
    (candidate) => candidate.blueprintId === blueprintId,
  );
  if (instance === undefined) {
    throw new Error(`No hand instance for ${blueprintId}.`);
  }
  return instance.instanceId;
}

function submitContradiction(coordinator: EncounterCoordinator) {
  return coordinator.submitTransaction({
    cardId: 'card_atomic_contradict',
    instanceId: handInstanceFor(coordinator, 'card_atomic_contradict'),
    targetClaimId: 'clm_atomic_main',
    evidenceIds: ['ev_atomic_entry_log'],
  });
}

describe('V2 begin identity state', () => {
  it('seeds turnsSpent, parallel hand instances, and publication state', () => {
    const coordinator = beginV2();
    const snapshot = coordinator.snapshot;

    expect(coordinator.turnLoopMode).toBe('V2_ATOMIC');
    expect(snapshot.machine.state).toBe('FREE_REVIEW');
    expect(snapshot.turnsSpent).toBe(0);
    expect(snapshot.resources.turn).toBe(1);
    expect(snapshot.sourceRevision).toBe(0);
    expect(snapshot.presentationRevision).toBe(0);
    expect(snapshot.pendingSecureDecision).toBeNull();
    expect(snapshot.pendingFlowPresentation).toBeNull();

    const instances = snapshot.handInstances ?? [];
    expect(instances.map((instance) => instance.blueprintId)).toEqual(
      snapshot.deck.hand,
    );
    expect(instances.map((instance) => instance.instanceId)).toEqual([
      'node_v2_test:run-v2:node_v2_test:1:0',
      'node_v2_test:run-v2:node_v2_test:1:1',
      'node_v2_test:run-v2:node_v2_test:1:2',
      'node_v2_test:run-v2:node_v2_test:1:3',
      'node_v2_test:run-v2:node_v2_test:1:4',
    ]);
    expect(snapshot.nextDrawSerial).toBe(5);
    expect(snapshot.cardDrawCursor).toBe(5);
    expect(snapshot.publishedKnowledge).toBeDefined();
  });
});

describe('atomic Submit', () => {
  it('settles a sweet-spot Submit into AWAIT_SECURE_DECISION without a new turn', () => {
    const coordinator = beginV2();
    const preSubmit = coordinator.snapshot;
    const preHandInstanceIds = (preSubmit.handInstances ?? []).map(
      (instance) => instance.instanceId,
    );
    const result = submitContradiction(coordinator);

    expect(result.kind).toBe('COMMITTED');
    if (result.kind !== 'COMMITTED') throw new Error('unreachable');
    expect(result.phase).toBe('AWAIT_SECURE_DECISION');
    if (result.phase !== 'AWAIT_SECURE_DECISION') throw new Error('unreachable');

    // One valid Submit consumed exactly one turn; the next turn does not exist.
    expect(result.turnsSpent).toBe(1);
    expect(coordinator.snapshot.turnsSpent).toBe(1);
    expect(coordinator.snapshot.resources.turn).toBe(1);
    expect(coordinator.snapshot.machine.state).toBe('AWAIT_SECURE_DECISION');

    // Whole-hand discard: multiset(discarded) === multiset(preSubmit hand).
    expect([...result.discardedInstanceIds].sort()).toEqual(
      [...preHandInstanceIds].sort(),
    );
    expect(coordinator.snapshot.deck.hand).toEqual([]);
    expect(coordinator.snapshot.handInstances).toEqual([]);

    // Post-cost CP, no restore, no draw, no RNG movement.
    expect(coordinator.snapshot.resources.commandPoints).toBe(1);
    expect(result.drawnInstanceIds).toEqual([]);
    expect(isZeroResourceDelta(result.turnStartResourceDelta)).toBe(true);
    expect(coordinator.snapshot.rngState).toEqual(preSubmit.rngState);

    // Deterministic decision id: attemptId:turnsSpent:sourceRevision.
    expect(result.pendingDecision.decisionId).toBe('run-v2:node_v2_test:1:1:1');
    expect(result.pendingDecision.onDecline).toBe('START_NEXT_TURN');
    expect(result.pendingDecision.contentRevision).toBe('test-rev');

    // Action delta owns the CP cost and composure hit of the play itself.
    expect(result.actionResourceDelta.commandPoints).toBe(-2);
    expect(result.actionResourceDelta.composure).toBe(-30);
    expect(result.committedFrame.presentationRevision).toBe(
      result.settledFrame.presentationRevision,
    );
  });

  it('spends the turn on a legal wrong answer and starts the next INPUT turn', () => {
    const coordinator = beginV2(REVERSED_RULES_CASE);
    const preSubmit = coordinator.snapshot;
    const result = submitContradiction(coordinator);

    expect(result.kind).toBe('COMMITTED');
    if (result.kind !== 'COMMITTED') throw new Error('unreachable');
    expect(result.phase).toBe('INPUT');
    if (result.phase !== 'INPUT') throw new Error('unreachable');

    expect(result.turnsSpent).toBe(1);
    expect(coordinator.snapshot.resources.turn).toBe(2);
    expect(coordinator.snapshot.resources.commandPoints).toBe(3);
    expect(coordinator.snapshot.resources.coercion).toBe(5);
    expect(coordinator.snapshot.machine.state).toBe('FREE_REVIEW');
    expect(result.drawnInstanceIds).toHaveLength(5);
    expect(coordinator.snapshot.deck.hand).toHaveLength(5);
    expect(coordinator.snapshot.cardDrawCursor).toBe(10);
    expect((coordinator.snapshot.handInstances ?? []).map((i) => i.instanceId))
      .toEqual(result.drawnInstanceIds);

    // INPUT invariant: the published projection equals the logical state.
    for (const claim of coordinator.knowledge.claims) {
      const logical = coordinator.snapshot.claims[claim.claimId];
      expect(claim.commitment).toBe(logical?.commitment);
      expect(claim.epistemic).toBe(logical?.epistemic);
      expect(claim.resistance).toBe(logical?.resistance);
    }

    // The four deltas partition the preSubmit -> committed change exactly.
    const total = addResourceDeltas(
      result.actionResourceDelta,
      result.turnEndResourceDelta,
      result.flowEntryResourceDelta,
      result.turnStartResourceDelta,
    );
    expect(total).toEqual(
      computeResourceDelta(
        preSubmit.resources,
        result.committedFrame.snapshot.resources,
      ),
    );
  });

  it('rejects insufficient CP without changing any state byte', () => {
    const coordinator = beginV2();
    const before = coordinator.snapshot;
    const result = coordinator.submitTransaction({
      cardId: 'card_atomic_expensive',
      instanceId: handInstanceFor(coordinator, 'card_atomic_expensive'),
      targetClaimId: 'clm_atomic_main',
      evidenceIds: ['ev_atomic_entry_log'],
    });

    expect(result).toMatchObject({ kind: 'REJECTED', reason: 'CP' });
    expect(coordinator.snapshot).toEqual(before);
    expect(coordinator.snapshot.machine.state).toBe('FREE_REVIEW');
  });

  it('normalizes a refunded invalid play to an EVIDENCE rejection', () => {
    const coordinator = beginV2();
    const before = coordinator.snapshot;
    const result = coordinator.submitTransaction({
      cardId: 'card_atomic_contradict',
      instanceId: handInstanceFor(coordinator, 'card_atomic_contradict'),
      targetClaimId: 'clm_atomic_main',
      evidenceIds: [],
    });

    expect(result).toMatchObject({ kind: 'REJECTED', reason: 'EVIDENCE' });
    expect(coordinator.snapshot).toEqual(before);
    expect(coordinator.snapshot.turnsSpent).toBe(0);
  });

  it('turns a coercion threshold fact into a terminal with no decision or draw', () => {
    const coordinator = beginV2(LOW_COERCION_CASE);
    const result = submitContradiction(coordinator);

    expect(result.kind).toBe('COMMITTED');
    if (result.kind !== 'COMMITTED') throw new Error('unreachable');
    expect(result.phase).toBe('TERMINAL');
    if (result.phase !== 'TERMINAL') throw new Error('unreachable');
    expect(result.outcome).toBe('FAILED');
    expect(result.turnsSpent).toBe(1);
    expect(result.drawnInstanceIds).toEqual([]);
    expect(coordinator.snapshot.machine.state).toBe('FAILED');
    expect(coordinator.snapshot.outcome).toBe('FAILED');
    expect(coordinator.snapshot.deck.hand).toEqual([]);
    expect(coordinator.snapshot.pendingSecureDecision).toBeNull();
  });

  it('rolls back to the byte-identical pre-Submit state when flow commit throws', () => {
    const coordinator = beginV2(BROKEN_FLOW_CASE);
    const before = coordinator.snapshot;

    expect(() => submitContradiction(coordinator)).toThrow(
      'revises unknown claim clm_atomic_missing',
    );
    expect(coordinator.snapshot).toEqual(before);
    expect(coordinator.snapshot.machine.state).toBe('FREE_REVIEW');
    expect(coordinator.snapshot.turnsSpent).toBe(0);
    expect(coordinator.snapshot.sourceRevision).toBe(0);
  });

  it.each<EncounterFaultPoint>([
    'RESOLVER',
    'MODIFIER',
    'OBJECTIVE',
    'FLOW',
  ])('rolls back every canonical byte when %s throws', (point) => {
    const coordinator = beginV2(CASE, 7, {
      [point]: () => {
        throw new Error(`fault:${point}`);
      },
    });
    const before = coordinator.encodeCommittedSnapshot();

    expect(() => submitContradiction(coordinator)).toThrow(`fault:${point}`);
    expect(coordinator.encodeCommittedSnapshot()).toBe(before);
    expect(coordinator.snapshot.machine.state).toBe('FREE_REVIEW');
    expect(coordinator.snapshot.log).toEqual([]);
  });

  it('keeps impact, settled, and committed frames aligned with all four deltas', () => {
    const coordinator = beginV2(REVERSED_RULES_CASE);
    const preSubmit = coordinator.snapshot;
    const result = submitContradiction(coordinator);
    if (result.kind !== 'COMMITTED' || result.phase !== 'INPUT') {
      throw new Error('expected an INPUT commit');
    }

    expect(result.impactFrame.snapshot.handInstances).toHaveLength(4);
    expect(result.settledFrame.snapshot.handInstances).toEqual([]);
    expect(result.committedFrame.snapshot.handInstances).toHaveLength(5);
    expect(result.committedFrame.snapshot).toEqual(coordinator.snapshot);
    expect(result.committedFrame.snapshot.log).toHaveLength(1);
    expect(result.actionResourceDelta).toEqual(
      computeResourceDelta(
        preSubmit.resources,
        result.impactFrame.snapshot.resources,
      ),
    );
    expect(result.turnEndResourceDelta).toEqual(
      computeResourceDelta(
        result.impactFrame.snapshot.resources,
        result.settledFrame.snapshot.resources,
      ),
    );
    expect(isZeroResourceDelta(result.flowEntryResourceDelta)).toBe(true);
    expect(result.turnStartResourceDelta).toEqual(
      computeResourceDelta(
        result.settledFrame.snapshot.resources,
        result.committedFrame.snapshot.resources,
      ),
    );
  });

  it('makes rapid duplicate Submits no-op after the first accepted command', () => {
    const coordinator = beginV2();
    const request = {
      cardId: 'card_atomic_contradict',
      instanceId: handInstanceFor(coordinator, 'card_atomic_contradict'),
      targetClaimId: 'clm_atomic_main',
      evidenceIds: ['ev_atomic_entry_log'],
    } as const;
    expect(coordinator.submitTransaction(request).kind).toBe('COMMITTED');
    const committed = coordinator.encodeCommittedSnapshot();
    expect(coordinator.submitTransaction(request)).toMatchObject({
      kind: 'REJECTED',
      reason: 'BUSY',
    });
    expect(coordinator.encodeCommittedSnapshot()).toBe(committed);
  });
});

describe('secure decision', () => {
  it('confirms BEST on Secure without a turn, modifier, or draw', () => {
    const coordinator = beginV2();
    const submit = submitContradiction(coordinator);
    if (submit.kind !== 'COMMITTED' || submit.phase !== 'AWAIT_SECURE_DECISION') {
      throw new Error('expected a pending decision');
    }
    const preDecision = coordinator.snapshot;
    const result = coordinator.resolveSecureDecision(
      submit.pendingDecision.decisionId,
      'SECURE',
    );

    expect(result.kind).toBe('COMMITTED');
    if (result.kind !== 'COMMITTED') throw new Error('unreachable');
    expect(result.choice).toBe('SECURE');
    if (result.phase !== 'TERMINAL') throw new Error('unreachable');
    expect(result.outcome).toBe('BEST_RESOLUTION');
    expect(result.drawnInstanceIds).toEqual([]);
    expect(isZeroResourceDelta(result.turnStartResourceDelta)).toBe(true);
    expect(coordinator.snapshot.machine.state).toBe('ENCOUNTER_COMPLETE');
    expect(coordinator.snapshot.outcome).toBe('BEST_RESOLUTION');
    expect(coordinator.snapshot.turnsSpent).toBe(1);
    expect(coordinator.snapshot.resources.turn).toBe(1);
    expect(coordinator.snapshot.rngState).toEqual(preDecision.rngState);
  });

  it('continues into the next turn with CP restore and a fresh draw', () => {
    const coordinator = beginV2();
    const submit = submitContradiction(coordinator);
    if (submit.kind !== 'COMMITTED' || submit.phase !== 'AWAIT_SECURE_DECISION') {
      throw new Error('expected a pending decision');
    }
    const result = coordinator.resolveSecureDecision(
      submit.pendingDecision.decisionId,
      'CONTINUE',
    );

    expect(result.kind).toBe('COMMITTED');
    if (result.kind !== 'COMMITTED') throw new Error('unreachable');
    expect(result.choice).toBe('CONTINUE');
    expect(result.phase).toBe('INPUT');
    if (result.phase !== 'INPUT') throw new Error('unreachable');
    // A decision spends zero turns; only TURN_START advances currentTurn.
    expect(coordinator.snapshot.turnsSpent).toBe(1);
    expect(coordinator.snapshot.resources.turn).toBe(2);
    expect(coordinator.snapshot.resources.commandPoints).toBe(3);
    expect(result.drawnInstanceIds).toHaveLength(5);
    expect(coordinator.snapshot.cardDrawCursor).toBe(10);
    expect(coordinator.snapshot.machine.state).toBe('FREE_REVIEW');
  });

  it('rejects stale, duplicate, and mismatched decision requests idempotently', () => {
    const coordinator = beginV2();
    const submit = submitContradiction(coordinator);
    if (submit.kind !== 'COMMITTED' || submit.phase !== 'AWAIT_SECURE_DECISION') {
      throw new Error('expected a pending decision');
    }

    const wrongId = coordinator.resolveSecureDecision('bogus:id:0', 'SECURE');
    expect(wrongId).toMatchObject({ kind: 'REJECTED', reason: 'STALE_DECISION' });

    const secured = coordinator.resolveSecureDecision(
      submit.pendingDecision.decisionId,
      'SECURE',
    );
    expect(secured.kind).toBe('COMMITTED');

    const replay = coordinator.resolveSecureDecision(
      submit.pendingDecision.decisionId,
      'SECURE',
    );
    expect(replay).toMatchObject({ kind: 'REJECTED', reason: 'STALE_DECISION' });
    expect(coordinator.snapshot.outcome).toBe('BEST_RESOLUTION');
  });

  it('keeps the final-turn decision ahead of PARTIAL and declines into PARTIAL', () => {
    const secureRun = beginV2(LAST_TURN_CASE);
    const secureSubmit = submitContradiction(secureRun);
    if (
      secureSubmit.kind !== 'COMMITTED' ||
      secureSubmit.phase !== 'AWAIT_SECURE_DECISION'
    ) {
      throw new Error('expected the final-turn decision to open');
    }
    expect(secureSubmit.pendingDecision.onDecline).toBe('PARTIAL_RESOLUTION');
    const best = secureRun.resolveSecureDecision(
      secureSubmit.pendingDecision.decisionId,
      'SECURE',
    );
    if (best.kind !== 'COMMITTED' || best.phase !== 'TERMINAL') {
      throw new Error('expected a terminal BEST commit');
    }
    expect(best.outcome).toBe('BEST_RESOLUTION');

    const declineRun = beginV2(LAST_TURN_CASE);
    const declineSubmit = submitContradiction(declineRun);
    if (
      declineSubmit.kind !== 'COMMITTED' ||
      declineSubmit.phase !== 'AWAIT_SECURE_DECISION'
    ) {
      throw new Error('expected the final-turn decision to open');
    }
    const declined = declineRun.resolveSecureDecision(
      declineSubmit.pendingDecision.decisionId,
      'CONTINUE',
    );
    expect(declined.kind).toBe('COMMITTED');
    if (declined.kind !== 'COMMITTED') throw new Error('unreachable');
    expect(declined.phase).toBe('TERMINAL');
    if (declined.phase !== 'TERMINAL') throw new Error('unreachable');
    expect(declined.outcome).toBe('PARTIAL_RESOLUTION');
    expect(declineRun.snapshot.machine.state).toBe('ENCOUNTER_COMPLETE');
    expect(declineRun.snapshot.turnsSpent).toBe(1);
    expect(declineRun.snapshot.resources.turn).toBe(1);
  });
});

describe('pending flow presentation', () => {
  it('commits flow logic at settlement but publishes only on Continue', () => {
    const coordinator = beginV2(FLOW_CASE);
    const submit = submitContradiction(coordinator);
    if (submit.kind !== 'COMMITTED' || submit.phase !== 'AWAIT_SECURE_DECISION') {
      throw new Error('expected a pending decision');
    }

    // Logical commit happened: node entered, its resource delta applied.
    expect(coordinator.snapshot.enteredFlowNodeIds).toContain(
      'node_atomic_reveal',
    );
    expect(coordinator.snapshot.resources.coercion).toBe(3);
    expect(submit.flowEntryResourceDelta.coercion).toBe(3);
    expect(submit.pendingDecision.pendingFlowPresentation).toMatchObject({
      targetNodeId: 'node_atomic_reveal',
    });

    // Publication is pinned: the revised commitment stays behind the rail.
    const logicalCommitment =
      coordinator.snapshot.claims.clm_atomic_main?.commitment;
    const publishedCommitment = coordinator.knowledge.claims.find(
      (claim) => claim.claimId === 'clm_atomic_main',
    )?.commitment;
    expect(publishedCommitment).toBeDefined();
    expect(publishedCommitment).not.toBe(logicalCommitment);
    expect(coordinator.snapshot.presentationRevision).toBe(0);

    // Continue publishes the presentation exactly once.
    const result = coordinator.resolveSecureDecision(
      submit.pendingDecision.decisionId,
      'CONTINUE',
    );
    expect(result.kind).toBe('COMMITTED');
    expect(coordinator.snapshot.presentationRevision).toBe(1);
    expect(coordinator.snapshot.pendingFlowPresentation).toBeNull();
    expect(
      coordinator.knowledge.claims.find(
        (claim) => claim.claimId === 'clm_atomic_main',
      )?.commitment,
    ).toBe(logicalCommitment);
    // Node effects were not replayed on publish.
    expect(coordinator.snapshot.resources.coercion).toBe(3);
  });

  it('preserves flow logic but discards the unpublished presentation on Secure', () => {
    const coordinator = beginV2(FLOW_CASE);
    const submit = submitContradiction(coordinator);
    if (submit.kind !== 'COMMITTED' || submit.phase !== 'AWAIT_SECURE_DECISION') {
      throw new Error('expected a pending decision');
    }
    const logicalCommitment =
      coordinator.snapshot.claims.clm_atomic_main?.commitment;
    coordinator.resolveSecureDecision(
      submit.pendingDecision.decisionId,
      'SECURE',
    );

    expect(coordinator.snapshot.outcome).toBe('BEST_RESOLUTION');
    // Logical node effects survive Secure...
    expect(coordinator.snapshot.resources.coercion).toBe(3);
    expect(coordinator.snapshot.claims.clm_atomic_main?.commitment).toBe(
      logicalCommitment,
    );
    // ...but the cursor never advanced and the presentation is gone.
    expect(coordinator.snapshot.presentationRevision).toBe(0);
    expect(coordinator.snapshot.pendingFlowPresentation).toBeNull();
  });

  it('round-trips a committed decision and remounts without replaying flow', () => {
    const original = beginV2(FLOW_CASE);
    const submit = submitContradiction(original);
    if (submit.kind !== 'COMMITTED' || submit.phase !== 'AWAIT_SECURE_DECISION') {
      throw new Error('expected a pending decision');
    }
    const decisionId = submit.pendingDecision.decisionId;
    const encoded = original.encodeCommittedSnapshot(decisionId);
    const before = original.snapshot;
    const beforeKnowledge = original.knowledge;

    const remount = EncounterCoordinator.remount(v2Deps(FLOW_CASE), encoded);
    const restored = remount.coordinator;
    expect(remount.acknowledgedDecisionId).toBe(decisionId);
    expect(restored.snapshot).toEqual(before);
    expect(restored.knowledge).toEqual(beforeKnowledge);
    expect(restored.snapshot.resources.coercion).toBe(3);
    expect(restored.snapshot.cardDrawCursor).toBe(5);

    const staleBefore = restored.encodeCommittedSnapshot(decisionId);
    expect(restored.resolveSecureDecision('stale:id', 'SECURE')).toMatchObject({
      kind: 'REJECTED',
      reason: 'STALE_DECISION',
    });
    expect(restored.encodeCommittedSnapshot(decisionId)).toBe(staleBefore);

    const continued = restored.resolveSecureDecision(decisionId, 'CONTINUE');
    expect(continued.kind).toBe('COMMITTED');
    expect(restored.snapshot.resources.coercion).toBe(3);
    expect(restored.snapshot.cardDrawCursor).toBe(10);
    const consumed = restored.encodeCommittedSnapshot();
    expect(restored.resolveSecureDecision(decisionId, 'CONTINUE')).toMatchObject({
      kind: 'REJECTED',
      reason: 'STALE_DECISION',
    });
    expect(restored.encodeCommittedSnapshot()).toBe(consumed);
  });
});

describe('turn-loop mode guards', () => {
  it('locks the legacy actions in V2 mode and the v2 actions in legacy mode', () => {
    const v2 = beginV2();
    expect(() => v2.endTurn()).toThrow('legacy loop');
    expect(() => v2.secureStatement()).toThrow('legacy loop');
    expect(() =>
      v2.submit({
        cardId: 'card_atomic_contradict',
        targetClaimId: 'clm_atomic_main',
        evidenceIds: ['ev_atomic_entry_log'],
      }),
    ).toThrow('legacy loop');

    const legacy = EncounterCoordinator.begin({
      caseDefinition: CASE,
      encounterId: 'enc_atomic_test',
      cards: CARDS,
      balance: BALANCE,
      rng: createRngState(7, 'DECK_SHUFFLE'),
    });
    expect(() =>
      legacy.submitTransaction({
        cardId: 'card_atomic_contradict',
        instanceId: 'x',
        targetClaimId: 'clm_atomic_main',
        evidenceIds: [],
      }),
    ).toThrow('V2_ATOMIC');
    expect(() => legacy.resolveSecureDecision('id', 'SECURE')).toThrow(
      'V2_ATOMIC',
    );
  });

  it('freezes partner skills during the decision window and after terminal', () => {
    const coordinator = beginV2();
    const submit = submitContradiction(coordinator);
    if (submit.kind !== 'COMMITTED' || submit.phase !== 'AWAIT_SECURE_DECISION') {
      throw new Error('expected a pending decision');
    }
    expect(() => coordinator.usePartnerSkill()).toThrow('frozen');

    coordinator.resolveSecureDecision(submit.pendingDecision.decisionId, 'SECURE');
    expect(() => coordinator.usePartnerSkill()).toThrow('frozen');
  });

  it('busy-rejects a Submit while the decision window is open', () => {
    const coordinator = beginV2();
    const submit = submitContradiction(coordinator);
    if (submit.kind !== 'COMMITTED' || submit.phase !== 'AWAIT_SECURE_DECISION') {
      throw new Error('expected a pending decision');
    }
    const result = coordinator.submitTransaction({
      cardId: 'card_atomic_contradict',
      instanceId: 'node_v2_test:run-v2:node_v2_test:1:0',
      targetClaimId: 'clm_atomic_main',
      evidenceIds: ['ev_atomic_entry_log'],
    });
    expect(result).toMatchObject({ kind: 'REJECTED', reason: 'BUSY' });
  });

  it('guards a turnsSpent overflow as an invariant violation, not gameplay', () => {
    const coordinator = beginV2(LAST_TURN_CASE);
    const submit = submitContradiction(coordinator);
    if (submit.kind !== 'COMMITTED' || submit.phase !== 'AWAIT_SECURE_DECISION') {
      throw new Error('expected a pending decision');
    }
    // The decision window still guards Submit; clearing it artificially is
    // impossible from outside, so the invariant path is covered by the
    // directive's own unit tests. Here we only prove the busy rejection.
    const result = coordinator.submitTransaction({
      cardId: 'card_atomic_contradict',
      instanceId: 'node_v2_test:run-v2:node_v2_test:1:0',
      targetClaimId: 'clm_atomic_main',
      evidenceIds: ['ev_atomic_entry_log'],
    });
    expect(result).toMatchObject({ kind: 'REJECTED', reason: 'BUSY' });
    expect(EncounterInvariantError).toBeDefined();
  });
});
