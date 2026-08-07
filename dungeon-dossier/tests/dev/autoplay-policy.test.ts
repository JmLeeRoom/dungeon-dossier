import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import {
  BROKER_CANVASS_EVENT_ID,
  BROKER_ROUTE_TOPIC_ID,
  chooseCanvassTopic,
  bestFillerSubmission,
  chooseEventChoice,
  chooseReward,
  createFuzzRng,
  deriveProofPaths,
  fuzzSubmission,
  greedySubmission,
  hasIncompleteNonProofObjective,
  nextIncompleteProofPathIndex,
  planBestAction,
  planBestLiveAction,
  type LegalSubmissionContext,
} from '../../src/dev/autoplay/policy';
import { BalanceSchema, CardsSchema, CaseSchema } from '../../src/engine/domain';

function readJson(relativePath: string): unknown {
  return JSON.parse(readFileSync(path.resolve(relativePath), 'utf8')) as unknown;
}

const tutorialCase = CaseSchema.parse(readJson('content/cases/tutorial/case.json'));
const ep004Case = CaseSchema.parse(readJson('content/cases/ep004/case.json'));
const cardCatalog = CardsSchema.parse(readJson('content/common/cards.json'));
const balance = BalanceSchema.parse(readJson('content/common/balance.json'));

describe('autoplay proof-path derivation', () => {
  it('derives one verification path per required objective, in authored order', () => {
    for (const encounter of tutorialCase.encounters) {
      const paths = deriveProofPaths(
        tutorialCase,
        encounter.encounter_id,
        cardCatalog,
        balance,
      );
      expect(paths.map((candidate) => candidate.objectiveId)).toEqual(
        encounter.objectives.required.map((objective) => objective.objective_id),
      );
    }
  });

  it('binds every path to an authored rule, claim facet, and real card', () => {
    const encounter = tutorialCase.encounters[0];
    expect(encounter).toBeDefined();
    if (encounter === undefined) return;
    const paths = deriveProofPaths(
      tutorialCase,
      encounter.encounter_id,
      cardCatalog,
      balance,
    );
    for (const step of paths) {
      const rule = tutorialCase.proof_rules.find(
        (candidate) => candidate.rule_id === step.proofRuleId,
      );
      expect(rule).toBeDefined();
      expect(rule?.target_claim_id).toBe(step.claimId);
      expect(rule?.direction).toBe(step.direction);
      expect(rule?.guaranteed_evidence_sets).toContainEqual([...step.evidenceIds]);
      const claim = tutorialCase.claims.find(
        (candidate) => candidate.claim_id === step.claimId,
      );
      expect(claim?.facet).toBe(step.facet);
      const card = cardCatalog.cards.find(
        (candidate) => candidate.card_id === step.cardId,
      );
      expect(card?.target.kind).toBe('CLAIM');
      expect(card?.intent).toBe(step.direction === 'SUPPORT' ? 'CONFIRM' : 'CONTRADICT');
      if (step.direction === 'CONTRADICT') {
        const multiplier =
          claim?.initial.commitment === 'COMMITTED' ? balance.committedMultiplier : 1;
        expect(step.composureDelta).toBe(-balance.dmg.contradict * multiplier);
        expect(step.resultingEpistemic).toBe('REFUTED');
      } else {
        expect(step.composureDelta).toBe(0);
        expect(step.resultingEpistemic).toBe('SUPPORTED');
      }
    }
  });

  it('marks non-claim audit rows as turn-only instead of duplicate proof', () => {
    const encounter = tutorialCase.encounters[0];
    expect(encounter).toBeDefined();
    if (encounter === undefined) return;
    const nonClaimObjective = encounter.objectives.required.find(
      (objective) => objective.claim_id === undefined,
    );
    const refuteObjective = encounter.objectives.required.find(
      (objective) => objective.type === 'REFUTE_CLAIM',
    );
    expect(nonClaimObjective).toBeDefined();
    expect(refuteObjective).toBeDefined();
    const paths = deriveProofPaths(
      tutorialCase,
      encounter.encounter_id,
      cardCatalog,
      balance,
    );
    const auditPath = paths.find(
      (candidate) => candidate.objectiveId === nonClaimObjective?.objective_id,
    );
    const refutePath = paths.find(
      (candidate) => candidate.objectiveId === refuteObjective?.objective_id,
    );
    expect(auditPath).toBeDefined();
    expect(auditPath?.proofRuleId).toBe(refutePath?.proofRuleId);
    expect(auditPath?.claimId).toBe(refutePath?.claimId);
    expect(auditPath?.objectiveType).toBe('SURVIVE_UNTIL_TURN');
    expect(auditPath?.requiresProof).toBe(false);
    expect(refutePath?.requiresProof).toBe(true);
  });

  it('derives the final boss CONFIRM objective from its own support rule', () => {
    const encounter = ep004Case.encounters.find(
      (candidate) => candidate.encounter_id === 'enc_ep004_fallen_hero',
    );
    expect(encounter).toBeDefined();
    if (encounter === undefined) return;
    const objective = encounter.objectives.required.find(
      (candidate) => candidate.type === 'CONFIRM_CLAIM',
    );
    expect(objective).toBeDefined();
    const path = deriveProofPaths(
      ep004Case,
      encounter.encounter_id,
      cardCatalog,
      balance,
    ).find((candidate) => candidate.objectiveId === objective?.objective_id);
    expect(path).toMatchObject({
      claimId: objective?.claim_id,
      direction: 'SUPPORT',
      requiresProof: true,
    });
    expect(
      cardCatalog.cards.find((card) => card.card_id === path?.cardId)?.intent,
    ).toBe('CONFIRM');
  });

  it('throws for an unknown encounter id', () => {
    expect(() =>
      deriveProofPaths(tutorialCase, 'enc_does_not_exist', cardCatalog, balance),
    ).toThrow(/no encounter/);
  });
});

describe('autoplay best plan', () => {
  it('replays authored paths first, then secures inside the window', () => {
    const encounter = tutorialCase.encounters[0];
    expect(encounter).toBeDefined();
    if (encounter === undefined) return;
    const paths = deriveProofPaths(
      tutorialCase,
      encounter.encounter_id,
      cardCatalog,
      balance,
    );
    const first = planBestAction(paths, 0, false);
    expect(first.kind).toBe('SUBMIT');
    if (first.kind === 'SUBMIT') {
      expect(first.submission.cardId).toBe(paths[0]?.cardId);
      expect(first.submission.facet).toBe(paths[0]?.facet);
    }
    expect(planBestAction(paths, paths.length, true)).toEqual({ kind: 'SECURE' });
    const overshoot = planBestAction(paths, paths.length, false);
    expect(overshoot.kind).toBe('SUBMIT');
    if (overshoot.kind === 'SUBMIT') {
      const damage = paths.find((candidate) => candidate.composureDelta < 0);
      expect(overshoot.submission.cardId).toBe(damage?.cardId);
    }
  });

  it('uses a compatible live-hand proof card when the authored card is unavailable', () => {
    const encounter = tutorialCase.encounters[0];
    expect(encounter).toBeDefined();
    if (encounter === undefined) return;
    const path = deriveProofPaths(
      tutorialCase,
      encounter.encounter_id,
      cardCatalog,
      balance,
    ).find((candidate) => candidate.direction === 'CONTRADICT');
    expect(path).toBeDefined();
    if (path === undefined) return;
    const context: LegalSubmissionContext = {
      handCards: [{
        cardId: 'card_contradict_precise',
        cpCost: 3,
        requiresEvidence: true,
        intent: 'CONTRADICT',
      }],
      commandPoints: 3,
      facets: [path.facet],
      evidenceIds: [...path.evidenceIds],
    };

    const action = planBestLiveAction([path], 0, false, context, cardCatalog);

    expect(action).toEqual({
      kind: 'SUBMIT',
      advancesProofPath: true,
      submission: {
        cardId: 'card_contradict_precise',
        facet: path.facet,
        evidenceIds: [...path.evidenceIds],
      },
    });
    if (action.kind === 'SUBMIT') {
      expect(context.handCards.map((card) => card.cardId)).toContain(
        action.submission.cardId,
      );
    }
  });

  it('excludes a locked authored card and keeps its proof path pending', () => {
    const encounter = tutorialCase.encounters[0];
    expect(encounter).toBeDefined();
    if (encounter === undefined) return;
    const path = deriveProofPaths(
      tutorialCase,
      encounter.encounter_id,
      cardCatalog,
      balance,
    )[0];
    expect(path).toBeDefined();
    if (path === undefined) return;
    const context: LegalSubmissionContext = {
      handCards: [
        {
          cardId: path.cardId,
          cpCost: 2,
          requiresEvidence: true,
          intent: path.direction === 'SUPPORT' ? 'CONFIRM' : 'CONTRADICT',
          playable: false,
        },
        {
          cardId: 'card_recover_breathe',
          cpCost: 1,
          requiresEvidence: false,
          intent: 'RECOVER',
          playable: true,
        },
      ],
      commandPoints: 3,
      facets: [path.facet],
      evidenceIds: [...path.evidenceIds],
    };

    const action = planBestLiveAction([path], 0, false, context, cardCatalog);

    expect(action).toEqual({
      kind: 'SUBMIT',
      advancesProofPath: false,
      submission: {
        cardId: 'card_recover_breathe',
        facet: path.facet,
        evidenceIds: [],
      },
    });
  });

  it('derives proof progress from live objective truth instead of submission count', () => {
    const paths = deriveProofPaths(
      tutorialCase,
      tutorialCase.encounters[0]!.encounter_id,
      cardCatalog,
      balance,
    );
    expect(paths.length).toBeGreaterThan(1);
    expect(nextIncompleteProofPathIndex(paths, paths.map((path) => ({
      objectiveId: path.objectiveId,
      completed: true,
    })))).toBe(paths.length);
    const waitingForTurn = paths.map((path, index) => ({
      objectiveId: path.objectiveId,
      completed: index !== 0,
    }));
    expect(nextIncompleteProofPathIndex(paths, waitingForTurn)).toBe(0);

    const proofComplete = paths.map((path) => ({
      objectiveId: path.objectiveId,
      completed: path.requiresProof,
    }));
    expect(nextIncompleteProofPathIndex(paths, proofComplete)).toBe(paths.length);
    expect(hasIncompleteNonProofObjective(paths, proofComplete)).toBe(true);
  });

  it('cycles a neutral BEST filler and never uses proof or pressure cards', () => {
    const context: LegalSubmissionContext = {
      handCards: [
        { cardId: 'card_confirm_basic', cpCost: 1, requiresEvidence: true, intent: 'CONFIRM' },
        { cardId: 'card_pressure', cpCost: 2, requiresEvidence: false, intent: 'PRESSURE' },
        { cardId: 'card_recover_breathe', cpCost: 1, requiresEvidence: false, intent: 'RECOVER' },
      ],
      commandPoints: 3,
      facets: ['WHO'],
      evidenceIds: ['evidence_a'],
    };

    expect(bestFillerSubmission(context)).toEqual({
      cardId: 'card_recover_breathe',
      facet: 'WHO',
      evidenceIds: [],
    });
    expect(bestFillerSubmission({
      ...context,
      handCards: context.handCards.slice(0, 2),
    })).toBeUndefined();
  });
});

describe('autoplay event choice', () => {
  it('takes the first offered choice for a plain pattern A node', () => {
    expect(chooseEventChoice('event_any', ['choice_a', 'choice_b'])).toBe('choice_a');
  });

  it('reports no choice rather than guessing when a node offers none', () => {
    expect(chooseEventChoice('event_any', [])).toBeUndefined();
  });
});

describe('autoplay canvass topic', () => {
  it('spends an attempt on the route topic by id, never by index', () => {
    const topic = chooseCanvassTopic(
      BROKER_CANVASS_EVENT_ID,
      ['topic_ep004_night_shift', BROKER_ROUTE_TOPIC_ID, 'topic_ep004_vip_car'],
      [],
    );
    expect(topic).toBe(BROKER_ROUTE_TOPIC_ID);
    expect(BROKER_ROUTE_TOPIC_ID).toBe('topic_ep004_broker_route');
  });

  it('falls back to the first remaining topic elsewhere', () => {
    expect(chooseCanvassTopic('event_other', ['topic_a', 'topic_b'], [])).toBe('topic_a');
    expect(chooseCanvassTopic('event_other', ['topic_a', 'topic_b'], ['topic_a'])).toBe(
      'topic_b',
    );
  });

  it('never repeats a topic the run already canvassed', () => {
    expect(
      chooseCanvassTopic(BROKER_CANVASS_EVENT_ID, [BROKER_ROUTE_TOPIC_ID], [BROKER_ROUTE_TOPIC_ID]),
    ).toBeUndefined();
  });

  it('targets a topic that actually exists in the authored ep004 event', () => {
    const event = ep004Case.events_noncombat.find(
      (candidate) => candidate.event_id === BROKER_CANVASS_EVENT_ID,
    );
    expect(event).toBeDefined();
    if (event?.pattern !== 'E') throw new Error('ep004 canvass must be pattern E');
    expect(event.topics.map((topic) => topic.topic_id)).toContain(BROKER_ROUTE_TOPIC_ID);
    // Fewer attempts than topics is what makes the guard meaningful.
    expect(event.attempt_limit).toBeLessThan(event.topics.length);
  });
});

describe('autoplay reward preference', () => {
  it('skips already-claimed rewards', () => {
    expect(chooseReward(['reward_a', 'reward_b'], ['reward_a'])).toBe('reward_b');
  });

  it('falls back to the first offer when everything is claimed', () => {
    expect(chooseReward(['reward_a', 'reward_b'], ['reward_a', 'reward_b'])).toBe(
      'reward_a',
    );
  });

  it('returns undefined for an empty offer', () => {
    expect(chooseReward([], [])).toBeUndefined();
  });
});

describe('autoplay legal submissions', () => {
  const context: LegalSubmissionContext = {
    handCards: [
      { cardId: 'card_pricey', cpCost: 5, requiresEvidence: false, intent: 'QUERY' },
      { cardId: 'card_refute', cpCost: 1, requiresEvidence: true, intent: 'CONTRADICT' },
      { cardId: 'card_confirm', cpCost: 2, requiresEvidence: false, intent: 'CONFIRM' },
    ],
    commandPoints: 3,
    facets: ['WHO', 'WHEN', 'WHERE'],
    evidenceIds: ['evidence_a', 'evidence_b', 'evidence_c'],
  };

  it('greedy picks the deterministic first legal submission', () => {
    const submission = greedySubmission(context);
    expect(submission).toEqual({
      cardId: 'card_refute',
      facet: 'WHO',
      evidenceIds: ['evidence_a'],
    });
  });

  it('greedy returns undefined when nothing is playable', () => {
    expect(
      greedySubmission({ ...context, commandPoints: 0 }),
    ).toBeUndefined();
  });

  it('greedy excludes runtime-locked cards even when their CP cost fits', () => {
    expect(greedySubmission({
      ...context,
      handCards: [
        { ...context.handCards[1]!, playable: false },
        { ...context.handCards[2]!, playable: true },
      ],
    })?.cardId).toBe('card_confirm');
  });

  it('fuzz replays the identical sequence for the same seed', () => {
    const runSequence = (): readonly (ReturnType<typeof greedySubmission>)[] => {
      const rng = createFuzzRng(20_260_805);
      return Array.from({ length: 8 }, () => fuzzSubmission(context, rng));
    };
    const left = runSequence();
    const right = runSequence();
    expect(left).toEqual(right);
    for (const submission of left) {
      expect(submission).toBeDefined();
      if (submission === undefined) continue;
      const card = context.handCards.find(
        (candidate) => candidate.cardId === submission.cardId,
      );
      expect(card).toBeDefined();
      expect(card?.cpCost ?? Number.POSITIVE_INFINITY).toBeLessThanOrEqual(
        context.commandPoints,
      );
      expect(context.facets).toContain(submission.facet);
      if (card?.requiresEvidence === true) {
        expect(submission.evidenceIds.length).toBeGreaterThan(0);
      }
      for (const evidenceId of submission.evidenceIds) {
        expect(context.evidenceIds).toContain(evidenceId);
      }
    }
  });

  it('rng streams from equal seeds are identical, different seeds diverge', () => {
    const sequenceFor = (seed: number): readonly number[] => {
      const rng = createFuzzRng(seed);
      return Array.from({ length: 8 }, () => rng());
    };
    expect(sequenceFor(1234)).toEqual(sequenceFor(1234));
    expect(sequenceFor(1234)).not.toEqual(sequenceFor(4321));
  });
});
