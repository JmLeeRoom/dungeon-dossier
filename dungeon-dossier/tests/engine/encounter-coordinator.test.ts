import { describe, expect, it } from 'vitest';

import {
  dealInitialHand,
  discardHand,
  playCard,
  type CardDefinition,
  type DeckState,
} from '../../src/engine/cards';
import {
  BalanceSchema,
  CardSchema,
  CaseSchema,
  type CaseDefinition,
} from '../../src/engine/domain';
import {
  EncounterCoordinator,
  mergeResolutionResources,
} from '../../src/engine/encounter';
import { serializeJudgmentLog } from '../../src/engine/log';
import { createRngState } from '../../src/engine/rng';
import {
  hasForbiddenPublicKey,
  toPublicDTO,
} from '../../src/dto';

const CASE = CaseSchema.parse({
  schema_version: '1.0',
  case_id: 'case_coordinator_test',
  metadata: {
    title: 'Coordinator test',
    act: 0,
    estimated_turns: 5,
  },
  entities: [
    {
      entity_id: 'ent_coordinator_suspect',
      type: 'PERSON',
      role: 'SUSPECT',
      display_name_key: 'entity.coordinator.suspect',
      attributes: {},
    },
  ],
  events: [
    {
      event_id: 'event_coordinator_truth',
      time: { from: 10, to: 20 },
      participants: ['ent_coordinator_suspect'],
      action: 'ENTERED_ARCHIVE',
    },
  ],
  claims: [
    {
      claim_id: 'clm_coordinator_main',
      speaker: 'ent_coordinator_suspect',
      facet: 'WHO',
      canonical_meaning: 'The suspect says nobody entered the archive.',
      predicate: 'ABSENT_FROM_ARCHIVE',
      initial: { commitment: 'ASSERTED', presentation: 'NORMAL' },
      resistance: 0,
      is_required: true,
      truth: {
        relation: 'CONTRADICTED_BY_WORLD',
        contradicting_events: ['event_coordinator_truth'],
      },
    },
    {
      claim_id: 'clm_coordinator_hidden',
      speaker: 'ent_coordinator_suspect',
      facet: 'WHY',
      canonical_meaning: 'This unrevealed claim must never enter the DTO.',
      predicate: 'HIDDEN_MOTIVE',
      initial: { commitment: 'UNSTATED', presentation: 'HIDDEN' },
      truth: {
        relation: 'CONSISTENT_WITH_WORLD',
        contradicting_events: [],
      },
    },
    ...(['WHEN', 'WHERE', 'WHAT', 'HOW', 'WHY'] as const).map((facet) => ({
      claim_id: `clm_coordinator_${facet.toLowerCase()}`,
      speaker: 'ent_coordinator_suspect',
      facet,
      canonical_meaning: `Coordinator ${facet} statement.`,
      predicate: `COORDINATOR_${facet}`,
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
      evidence_id: 'ev_coordinator_entry_log',
      type: 'ACCESS_LOG',
      title_key: 'evidence.coordinator.entry_log',
      acquire: { node: 'node_coordinator_start', method: 'STARTING' },
      source_category: 'DIGITAL',
      independence: {
        source_id: 'source_coordinator_access',
        group: 'DIGITAL',
        derived_from: null,
      },
      grade: { initial: 'A', upgrades: [] },
      integrity: { initial: 'INTACT' },
      observations: [
        {
          observation_id: 'observation_coordinator_presence',
          subject_id: 'ent_coordinator_suspect',
          predicate: 'ENTERED_ARCHIVE',
          summary_key: 'evidence.coordinator.entry_log.summary',
          scopes: ['PRESENCE'],
          detail: {},
          confidence: 1,
          contradicts_claim_ids: ['clm_coordinator_main'],
        },
      ],
      not_proven_keys: ['evidence.coordinator.not_time'],
    },
    {
      evidence_id: 'ev_coordinator_unacquired_time',
      type: 'CLOCK_LOG',
      title_key: 'evidence.coordinator.time',
      acquire: { node: 'node_coordinator_later', method: 'EVENT_RESULT' },
      source_category: 'DIGITAL',
      independence: {
        source_id: 'source_coordinator_clock',
        group: 'DIGITAL',
        derived_from: null,
      },
      grade: { initial: 'A', upgrades: [] },
      integrity: { initial: 'INTACT' },
      observations: [
        {
          observation_id: 'observation_coordinator_time',
          subject_id: 'ent_coordinator_suspect',
          predicate: 'ENTERED_AT_TIME',
          summary_key: 'evidence.coordinator.time.summary',
          scopes: ['TIME'],
          detail: {},
          confidence: 1,
          contradicts_claim_ids: ['clm_coordinator_main'],
        },
      ],
      not_proven_keys: ['evidence.coordinator.not_presence'],
    },
  ],
  proof_rules: [
    {
      rule_id: 'rule_coordinator_first',
      target_claim_id: 'clm_coordinator_main',
      direction: 'CONTRADICT',
      requirements: {
        required_scopes: ['PRESENCE'],
        minimum_confidence: 0.8,
        minimum_independent_sources: 1,
        require_integrity: true,
      },
      guaranteed_evidence_sets: [['ev_coordinator_entry_log']],
    },
    {
      rule_id: 'rule_coordinator_second',
      target_claim_id: 'clm_coordinator_main',
      direction: 'CONTRADICT',
      requirements: {
        required_scopes: ['TIME'],
        minimum_confidence: 0.8,
        minimum_independent_sources: 1,
        require_integrity: true,
      },
      guaranteed_evidence_sets: [['ev_coordinator_unacquired_time']],
    },
  ],
  encounters: [
    {
      encounter_id: 'enc_coordinator_test',
      target_entity: 'ent_coordinator_suspect',
      resources: {
        composure_max: 40,
        cp_per_turn: 3,
        cp_max: 3,
        coercion_limit: 100,
        shields_per_round: 2,
      },
      rounds: [
        {
          round_id: 'round_coordinator_one',
          statement_claims: [
            'clm_coordinator_main',
            'clm_coordinator_when',
            'clm_coordinator_where',
            'clm_coordinator_what',
            'clm_coordinator_how',
            'clm_coordinator_why',
          ],
          shields: [
            { claim_id: 'clm_coordinator_main', durability: 1 },
            { claim_id: 'clm_coordinator_why', durability: 1 },
          ],
        },
      ],
      flow_nodes: [
        {
          node_id: 'node_coordinator_start',
          enter_conditions: [{ type: 'ALWAYS' }],
          reveal_claim_ids: [],
          revise_claim_ids: [],
          open_route_ids: [],
          activate_modifiers: [],
          deactivate_modifiers: [],
          reaction_key: 'reaction.coordinator.start',
          resource_delta: {},
          is_terminal: false,
        },
      ],
      modifiers: [],
      objectives: {
        required: [
          {
            objective_id: 'objective_coordinator_refute',
            type: 'REFUTE_CLAIM',
            claim_id: 'clm_coordinator_main',
          },
        ],
        optional: [],
        state_conditions: { composure_min: 1, composure_max: 30 },
      },
      outcomes: [
        {
          outcome_id: 'outcome_coordinator_best',
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
      ent_coordinator_suspect: {
        race: 'HUMAN',
        personality: ['CAUTIOUS'],
        speech: 'FORMAL',
        forbidden_expressions: [],
      },
    },
    statements: {
      clm_coordinator_main: {
        fallback: ['Nobody entered the archive.'],
        spans: [{ claim_id: 'clm_coordinator_main', start: 0, end: 6 }],
      },
    },
    reactions: {
      'reaction.coordinator.start': ['Present your evidence.'],
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
    perTurn: 0,
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
    card_id: 'card_coordinator_contradict',
    name_key: 'card.coordinator.contradict',
    description_key: 'card.coordinator.contradict.description',
    category: 'BASE',
    intent: 'CONTRADICT',
    cost: { cp: 2 },
    target: { kind: 'CLAIM', min_evidence: 1, max_evidence: 1 },
    modifiers: [],
    starting_copies: 1,
  }),
  CardSchema.parse({
    card_id: 'card_coordinator_expensive',
    name_key: 'card.coordinator.expensive',
    description_key: 'card.coordinator.expensive.description',
    category: 'BASE',
    intent: 'CONTRADICT',
    cost: { cp: 4 },
    target: { kind: 'CLAIM', min_evidence: 1 },
    modifiers: [],
    starting_copies: 1,
  }),
];

function begin(
  caseDefinition: CaseDefinition = CASE,
  seed = 7,
): EncounterCoordinator {
  return EncounterCoordinator.begin({
    caseDefinition,
    encounterId: 'enc_coordinator_test',
    cards: CARDS,
    balance: BALANCE,
    rng: createRngState(seed, 'DECK_SHUFFLE'),
  });
}

function publicDto(coordinator: EncounterCoordinator) {
  const snapshot = coordinator.snapshot;
  return toPublicDTO({
    knowledge: coordinator.knowledge,
    resources: {
      composure: snapshot.resources.composure,
      coercion: snapshot.resources.coercion,
      commandPoints: snapshot.resources.commandPoints,
    },
    objectives: [
      ...snapshot.objectives.required,
      ...snapshot.objectives.optional,
    ].map((objective) => ({
      label: objective.objectiveId,
      completed: objective.completed,
    })),
  });
}

const VALID_SUBMISSION = {
  cardId: 'card_coordinator_contradict',
  targetClaimId: 'clm_coordinator_main',
  evidenceIds: ['ev_coordinator_entry_log'],
} as const;

describe('DeckOperations', () => {
  it('deals, plays, and discards physical copies without mutating input', () => {
    const initial: DeckState = {
      drawPile: ['card-a', 'card-a', 'card-b'],
      hand: [],
      discardPile: ['card-old'],
    };
    const dealt = dealInitialHand(initial, 2);
    const played = playCard(dealt.deck, 'card-a');
    const discarded = discardHand(played);

    expect(initial).toEqual({
      drawPile: ['card-a', 'card-a', 'card-b'],
      hand: [],
      discardPile: ['card-old'],
    });
    expect(dealt.dealtCardIds).toEqual(['card-a', 'card-a']);
    expect(played).toEqual({
      drawPile: ['card-b'],
      hand: ['card-a'],
      discardPile: ['card-old', 'card-a'],
    });
    expect(discarded.discardedCardIds).toEqual(['card-a']);
    expect(discarded.deck).toEqual({
      drawPile: ['card-b'],
      hand: [],
      discardPile: ['card-old', 'card-a', 'card-a'],
    });
  });

  it('rejects playing a card that is not in hand', () => {
    expect(() =>
      playCard({ drawPile: [], hand: [], discardPile: [] }, 'card-missing'),
    ).toThrow('is not in hand');
  });
});

describe('EncounterCoordinator', () => {
  it('initializes runtime resistance from the authored round shield durability', () => {
    const shieldedCase = CaseSchema.parse({
      ...CASE,
      encounters: CASE.encounters.map((encounter) => ({
        ...encounter,
        resources: { ...encounter.resources, shields_per_round: 2 },
        rounds: encounter.rounds.map((round) => ({
          ...round,
          shields: [
            { claim_id: 'clm_coordinator_main', durability: 1 },
            { claim_id: 'clm_coordinator_why', durability: 1 },
          ],
        })),
      })),
    });

    expect(begin(shieldedCase).snapshot.claims.clm_coordinator_main?.resistance)
      .toBe(1);
  });

  it('G-C1: completes a headless encounter through explicit BEST confirmation', () => {
    const coordinator = begin();
    expect(coordinator.snapshot.machine.state).toBe('FREE_REVIEW');
    expect(coordinator.snapshot.resources).toMatchObject({
      composure: 40,
      commandPoints: 3,
      stress: 100,
      dp: 5,
      turn: 1,
    });
    expect(coordinator.review().listEvidence()).toHaveLength(1);

    coordinator.beginArgument();
    const submission = coordinator.submit(VALID_SUBMISSION);

    expect(submission.resolution.code).toBe('R_DIRECT_CONTRADICTION');
    expect(submission.outcome).toMatchObject({
      terminalOutcome: null,
      terminal: false,
      bestResolution: {
        conditionsMet: true,
        secureStatementEnabled: true,
      },
    });
    expect(coordinator.snapshot.resources).toMatchObject({
      composure: 10,
      commandPoints: 1,
      stress: 100,
      dp: 5,
      turn: 1,
    });
    expect(coordinator.snapshot.claims.clm_coordinator_main?.epistemic).toBe(
      'REFUTED',
    );
    expect(coordinator.snapshot.deck.discardPile).toContain(
      'card_coordinator_contradict',
    );
    expect(coordinator.snapshot.machine.state).toBe('CHECK_OUTCOME');

    const outcome = coordinator.secureStatement();
    expect(outcome.terminalOutcome).toBe('BEST_RESOLUTION');
    expect(coordinator.snapshot.outcome).toBe('BEST_RESOLUTION');
    expect(coordinator.snapshot.machine.state).toBe('ENCOUNTER_COMPLETE');
  });

  it('selects the first matching ProofRule in definition order', () => {
    const first = begin();
    first.beginArgument();
    expect(first.submit(VALID_SUBMISSION).resolution.code).toBe(
      'R_DIRECT_CONTRADICTION',
    );

    const reversed: CaseDefinition = {
      ...CASE,
      proof_rules: [...CASE.proof_rules].reverse(),
    };
    const second = begin(reversed);
    second.beginArgument();
    expect(second.submit(VALID_SUBMISSION).resolution.code).toBe(
      'R_IRRELEVANT_EVIDENCE',
    );
  });

  it('returns the canonical MISSING_PROOF_RULE invalid result without CP loss', () => {
    const withoutRules: CaseDefinition = { ...CASE, proof_rules: [] };
    const coordinator = begin(withoutRules);
    coordinator.beginArgument();
    const result = coordinator.submit(VALID_SUBMISSION);

    expect(result.resolution).toMatchObject({
      code: 'R_ACTION_INVALID',
      reason: 'MISSING_PROOF_RULE',
    });
    expect(coordinator.snapshot.resources.commandPoints).toBe(3);
    expect(coordinator.snapshot.deck.hand).toContain(
      'card_coordinator_contradict',
    );
  });

  it('rolls back provisional CP and keeps the card for R_ACTION_INVALID', () => {
    const coordinator = begin();
    const beforeResources = coordinator.snapshot.resources;
    const beforeDeck = coordinator.snapshot.deck;
    coordinator.beginArgument();
    const result = coordinator.submit({
      cardId: 'card_coordinator_contradict',
      targetClaimId: 'clm_coordinator_main',
      evidenceIds: [],
    });

    expect(result.resolution.code).toBe('R_ACTION_INVALID');
    expect(coordinator.snapshot.resources).toEqual(beforeResources);
    expect(coordinator.snapshot.deck).toEqual(beforeDeck);
    expect(coordinator.snapshot.deck.hand).toContain(
      'card_coordinator_contradict',
    );
  });

  it('rejects insufficient CP without changing machine or encounter state', () => {
    const coordinator = begin();
    coordinator.beginArgument();
    const before = coordinator.snapshot;

    expect(() =>
      coordinator.submit({
        cardId: 'card_coordinator_expensive',
        targetClaimId: 'clm_coordinator_main',
        evidenceIds: ['ev_coordinator_entry_log'],
      }),
    ).toThrow('Insufficient command points');
    expect(coordinator.snapshot).toEqual(before);
  });

  it('restores BUILD_ARGUMENT when resolution fails after entering RESOLVE', () => {
    const encounter = CASE.encounters[0]!;
    const flowFailureCase: CaseDefinition = {
      ...CASE,
      encounters: [
        {
          ...encounter,
          flow_nodes: [
            ...encounter.flow_nodes,
            {
              node_id: 'node_coordinator_broken_revision',
              enter_conditions: [
                {
                  type: 'CLAIM_EPISTEMIC',
                  claim_id: 'clm_coordinator_main',
                  state: 'REFUTED',
                },
              ],
              reveal_claim_ids: [],
              revise_claim_ids: ['clm_coordinator_missing'],
              open_route_ids: [],
              activate_modifiers: [],
              deactivate_modifiers: [],
              reaction_key: 'reaction.coordinator.broken_revision',
              resource_delta: {},
              is_terminal: true,
            },
          ],
        },
      ],
    };
    const coordinator = begin(flowFailureCase);
    coordinator.beginArgument();
    const before = coordinator.snapshot;

    const submit = () => coordinator.submit(VALID_SUBMISSION);
    expect(submit).toThrow(
      'FlowNode node_coordinator_broken_revision revises unknown claim clm_coordinator_missing.',
    );
    expect(coordinator.snapshot).toEqual(before);
    expect(coordinator.snapshot.machine.state).toBe('BUILD_ARGUMENT');
    expect(coordinator.snapshot.resources.commandPoints).toBe(3);
    expect(coordinator.snapshot.deck.hand).toContain(
      'card_coordinator_contradict',
    );

    // A second attempt reaches resolution again instead of being stranded in RESOLVE.
    expect(submit).toThrow('revises unknown claim clm_coordinator_missing');
    expect(coordinator.snapshot).toEqual(before);
  });

  it('mergeResolutionResources preserves the non-resolver canonical fields', () => {
    const coordinator = begin();
    const canonical = coordinator.snapshot.resources;
    const merged = mergeResolutionResources(
      canonical,
      { composure: 12, coercion: 7, commandPoints: 1 },
      {
        composureMax: 40,
        coercionLimit: 100,
        commandPointMax: 3,
        commandPointsPerTurn: 3,
        stressMax: 100,
        trustMax: 3,
      },
    );

    expect(merged).toEqual({
      ...canonical,
      composure: 12,
      coercion: 7,
      commandPoints: 1,
    });
  });

  it('G-C2: serializes byte-identical logs for the same seed and inputs', () => {
    const play = (): string => {
      const coordinator = begin(CASE, 99);
      coordinator.beginArgument();
      coordinator.submit(VALID_SUBMISSION);
      coordinator.secureStatement();
      return serializeJudgmentLog(coordinator.snapshot.log);
    };

    expect(play()).toBe(play());
  });

  it('G-C3: emits leak-free, structurally compatible PublicDTOs on every path', () => {
    const coordinator = begin();
    const initialDto = publicDto(coordinator);
    expect(initialDto.statement.map((claim) => claim.claimId)).toEqual([
      'clm_coordinator_main',
      'clm_coordinator_when',
      'clm_coordinator_where',
      'clm_coordinator_what',
      'clm_coordinator_how',
      'clm_coordinator_why',
    ]);
    expect(initialDto.evidence.map((evidence) => evidence.evidenceId)).toEqual([
      'ev_coordinator_entry_log',
    ]);
    expect(hasForbiddenPublicKey(initialDto)).toBe(false);

    coordinator.beginArgument();
    coordinator.submit({
      cardId: 'card_coordinator_contradict',
      targetClaimId: 'clm_coordinator_main',
      evidenceIds: [],
    });
    expect(hasForbiddenPublicKey(publicDto(coordinator))).toBe(false);

    coordinator.endTurn();
    coordinator.beginArgument();
    coordinator.submit(VALID_SUBMISSION);
    expect(hasForbiddenPublicKey(publicDto(coordinator))).toBe(false);
    coordinator.secureStatement();
    expect(hasForbiddenPublicKey(publicDto(coordinator))).toBe(false);
  });
});
