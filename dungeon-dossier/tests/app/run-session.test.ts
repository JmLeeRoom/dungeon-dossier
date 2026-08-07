import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  CardsSchema,
  FlagsSchema,
  GradesSchema,
  CaseSchema,
  RewardsSchema,
  RunStripSchema,
  type ActionIntent,
} from '../../src/engine/domain';
import {
  completeEventNode,
  createNodeStrip,
  createRunState,
} from '../../src/engine/run';
import { createRunSession, type RunSession } from '../../src/app/createRunSession';
import { SaveRepository } from '../../src/app/save';

function common(file: string): unknown {
  return JSON.parse(readFileSync(
    new URL(`../../content/common/${file}`, import.meta.url),
    'utf8',
  )) as unknown;
}

const CARD_INTENTS: Readonly<Record<string, ActionIntent>> = Object.fromEntries(
  CardsSchema.parse(common('cards.json')).cards.map((card) => [card.card_id, card.intent]),
);

function eligibleCardId(
  run: RunSession,
  option: Readonly<{ eligible_intents: readonly ActionIntent[] }>,
): string {
  const deck = run.snapshot.deck;
  const owned = [...deck.drawPile, ...deck.hand, ...deck.discardPile, ...deck.exhaustPile];
  const allowed = new Set<ActionIntent>(option.eligible_intents);
  const cardId = owned.find(
    (candidate) =>
      allowed.size === 0 ||
      (CARD_INTENTS[candidate] !== undefined && allowed.has(CARD_INTENTS[candidate])),
  );
  if (cardId === undefined) throw new Error('No eligible card for the enhancement option.');
  return cardId;
}

function caseContent(directory: string): ReturnType<typeof CaseSchema.parse> {
  return CaseSchema.parse(JSON.parse(readFileSync(
    new URL(`../../content/cases/${directory}/case.json`, import.meta.url),
    'utf8',
  )) as unknown);
}

describe('app run session', () => {
  it('auto-saves encounter, reward, and event boundaries with encounter null', () => {
    const values = new Map<string, string>();
    const repository = new SaveRepository({
      getItem: (key) => values.get(key) ?? null,
      setItem: (key, value) => values.set(key, value),
      removeItem: (key) => values.delete(key),
    });
    const strip = createNodeStrip(RunStripSchema.parse(common('run-strip.json')));
    const flags = FlagsSchema.parse(common('flags.json'));
    const rewards = RewardsSchema.parse(common('rewards.json'));
    const grades = GradesSchema.parse(common('grades.json'));
    const run = createRunSession({
      initialState: createRunState({
        runSeed: 5,
        stress: 100,
        dp: 0,
        trust: 0,
        deck: { drawPile: [], hand: [], discardPile: [], exhaustPile: [] },
      }),
      strip,
      flags: flags.flags,
      rewards,
      grades,
      saveRepository: repository,
      caseIdsByDirectory: {
        tutorial: 'case_tutorial',
        ep001: 'case_ep001',
        ep004: 'case_ep004',
      },
    });
    const encounter = run.finishEncounter({
      outcome: 'BEST_RESOLUTION',
      rewardRarity: 'COMMON',
      episodeId: 'case_tutorial',
      act: 0,
      gradeMetrics: {
        requiredClaimResolutionRatio: 1,
        optionalObjectiveRatio: 1,
        sweetSpotFinish: true,
        originalsPreserved: true,
        coercion: 0,
      },
    });
    expect(repository.load()?.run?.node_index).toBe(1);
    run.claimReward(encounter.rewardChoices[0]!.reward_id);
    expect(repository.load()?.run?.pending_reward_ids).toEqual([]);
    const tutorial = caseContent('tutorial');
    const choiceEvent = tutorial.events_noncombat.find(
      (event) => event.event_id === 'event_tutorial_choice',
    );
    if (choiceEvent?.pattern !== 'A') throw new Error('Missing tutorial choice event.');
    run.finishEvent({
      choiceId: 'choice_tutorial_search',
      eventDefinition: choiceEvent,
    });
    expect(repository.load()).toMatchObject({
      encounter: null,
      run: { node_index: 2 },
    });
  });

  it('saves a repeated reward instance without duplicating its claimed ID', () => {
    const strip = createNodeStrip(RunStripSchema.parse(common('run-strip.json')));
    const flags = FlagsSchema.parse(common('flags.json'));
    const rewards = RewardsSchema.parse(common('rewards.json'));
    const grades = GradesSchema.parse(common('grades.json'));
    const reward = rewards.rewards.find(
      (candidate) => candidate.reward_id === 'reward_dp_small',
    );
    if (
      reward?.type !== 'RESOURCE' ||
      reward.resource !== 'DP' ||
      reward.amount === undefined
    ) {
      throw new Error('Missing DP reward fixture.');
    }

    const values = new Map<string, string>();
    const repository = new SaveRepository({
      getItem: (key) => values.get(key) ?? null,
      setItem: (key, value) => values.set(key, value),
      removeItem: (key) => values.delete(key),
    });
    const initial = createRunState({
      runSeed: 17,
      stress: 100,
      dp: reward.amount,
      trust: 0,
      deck: { drawPile: [], hand: [], discardPile: [], exhaustPile: [] },
    });
    const run = createRunSession({
      initialState: {
        ...initial,
        pendingRewardIds: [reward.reward_id],
        claimedRewardIds: [reward.reward_id],
      },
      strip,
      flags: flags.flags,
      rewards,
      grades,
      saveRepository: repository,
      caseIdsByDirectory: {
        tutorial: 'case_tutorial',
        ep001: 'case_ep001',
        ep004: 'case_ep004',
      },
    });

    expect(() => run.claimReward(reward.reward_id)).not.toThrow();
    expect(run.snapshot).toMatchObject({
      dp: reward.amount * 2,
      pendingRewardIds: [],
      claimedRewardIds: [reward.reward_id],
    });
    expect(repository.load()).toMatchObject({
      resources: { dp: reward.amount * 2 },
      run: {
        pending_reward_ids: [],
        claimed_reward_ids: [reward.reward_id],
      },
    });
  });

  it('keeps a reward pending when storage fails and applies it exactly once on retry', () => {
    const strip = createNodeStrip(RunStripSchema.parse(common('run-strip.json')));
    const flags = FlagsSchema.parse(common('flags.json'));
    const rewards = RewardsSchema.parse(common('rewards.json'));
    const grades = GradesSchema.parse(common('grades.json'));
    const reward = rewards.rewards.find(
      (candidate) => candidate.reward_id === 'reward_dp_small',
    );
    if (
      reward?.type !== 'RESOURCE' ||
      reward.resource !== 'DP' ||
      reward.amount === undefined
    ) {
      throw new Error('Missing DP reward fixture.');
    }

    const values = new Map<string, string>();
    let failNextWrite = true;
    const repository = new SaveRepository({
      getItem: (key) => values.get(key) ?? null,
      setItem: (key, value) => {
        if (failNextWrite) {
          failNextWrite = false;
          throw new Error('simulated storage failure');
        }
        values.set(key, value);
      },
      removeItem: (key) => values.delete(key),
    });
    const initial = createRunState({
      runSeed: 23,
      stress: 100,
      dp: 0,
      trust: 0,
      deck: { drawPile: [], hand: [], discardPile: [], exhaustPile: [] },
    });
    const run = createRunSession({
      initialState: { ...initial, pendingRewardIds: [reward.reward_id] },
      strip,
      flags: flags.flags,
      rewards,
      grades,
      saveRepository: repository,
      caseIdsByDirectory: {
        tutorial: 'case_tutorial',
        ep001: 'case_ep001',
        ep004: 'case_ep004',
      },
    });
    const before = run.snapshot;

    expect(() => run.claimReward(reward.reward_id)).toThrow('simulated storage failure');
    expect(run.snapshot).toEqual(before);
    expect(repository.load()).toBeUndefined();

    expect(() => run.claimReward(reward.reward_id)).not.toThrow();
    expect(run.snapshot).toMatchObject({
      dp: reward.amount,
      pendingRewardIds: [],
      claimedRewardIds: [reward.reward_id],
    });
    expect(repository.load()).toMatchObject({
      resources: { dp: reward.amount },
      run: {
        pending_reward_ids: [],
        claimed_reward_ids: [reward.reward_id],
      },
    });
  });

  it('does not advance or apply an event twice when its boundary save is retried', () => {
    const strip = createNodeStrip(RunStripSchema.parse(common('run-strip.json')));
    const flags = FlagsSchema.parse(common('flags.json'));
    const rewards = RewardsSchema.parse(common('rewards.json'));
    const grades = GradesSchema.parse(common('grades.json'));
    const tutorial = caseContent('tutorial');
    const choiceEvent = tutorial.events_noncombat.find(
      (event) => event.event_id === 'event_tutorial_choice',
    );
    if (choiceEvent?.pattern !== 'A') throw new Error('Missing tutorial choice event.');

    const values = new Map<string, string>();
    let failNextWrite = true;
    const repository = new SaveRepository({
      getItem: (key) => values.get(key) ?? null,
      setItem: (key, value) => {
        if (failNextWrite) {
          failNextWrite = false;
          throw new Error('simulated storage failure');
        }
        values.set(key, value);
      },
      removeItem: (key) => values.delete(key),
    });
    const initial = createRunState({
      runSeed: 29,
      stress: 100,
      dp: 0,
      trust: 0,
      deck: { drawPile: [], hand: [], discardPile: [], exhaustPile: [] },
    });
    const run = createRunSession({
      initialState: {
        ...initial,
        nodeIndex: 1,
        completedNodeIds: ['run_tutorial_01'],
      },
      strip,
      flags: flags.flags,
      rewards,
      grades,
      saveRepository: repository,
      caseIdsByDirectory: {
        tutorial: 'case_tutorial',
        ep001: 'case_ep001',
        ep004: 'case_ep004',
      },
    });
    const before = run.snapshot;
    const finish = () => run.finishEvent({
      eventDefinition: choiceEvent,
      choiceId: 'choice_tutorial_search',
    });

    expect(finish).toThrow('simulated storage failure');
    expect(run.snapshot).toEqual(before);
    expect(repository.load()).toBeUndefined();

    expect(finish).not.toThrow();
    expect(run.snapshot.nodeIndex).toBe(2);
    expect(run.snapshot.completedNodeIds).toEqual([
      'run_tutorial_01',
      'run_tutorial_02',
    ]);
    expect(run.snapshot.stress).toBe(95);
    expect(run.snapshot.acquiredEvidenceIds).toEqual(['ev_tutorial_receipt']);
    expect(repository.load()?.run?.node_index).toBe(2);
  });

  it('does not duplicate encounter history or reward choices after a failed save', () => {
    const strip = createNodeStrip(RunStripSchema.parse(common('run-strip.json')));
    const flags = FlagsSchema.parse(common('flags.json'));
    const rewards = RewardsSchema.parse(common('rewards.json'));
    const grades = GradesSchema.parse(common('grades.json'));
    const values = new Map<string, string>();
    let failNextWrite = true;
    const repository = new SaveRepository({
      getItem: (key) => values.get(key) ?? null,
      setItem: (key, value) => {
        if (failNextWrite) {
          failNextWrite = false;
          throw new Error('simulated storage failure');
        }
        values.set(key, value);
      },
      removeItem: (key) => values.delete(key),
    });
    const initial = createRunState({
      runSeed: 31,
      stress: 100,
      dp: 0,
      trust: 0,
      deck: { drawPile: [], hand: [], discardPile: [], exhaustPile: [] },
    });
    const run = createRunSession({
      initialState: initial,
      strip,
      flags: flags.flags,
      rewards,
      grades,
      saveRepository: repository,
      caseIdsByDirectory: {
        tutorial: 'case_tutorial',
        ep001: 'case_ep001',
        ep004: 'case_ep004',
      },
    });
    const finish = () => run.finishEncounter({
      outcome: 'BEST_RESOLUTION',
      rewardRarity: 'COMMON',
      episodeId: 'case_tutorial',
      act: 0,
      gradeMetrics: {
        requiredClaimResolutionRatio: 1,
        optionalObjectiveRatio: 1,
        sweetSpotFinish: true,
        originalsPreserved: true,
        coercion: 0,
      },
    });

    expect(finish).toThrow('simulated storage failure');
    expect(run.snapshot).toEqual(initial);

    const completion = finish();
    expect(run.snapshot.nodeIndex).toBe(1);
    expect(run.snapshot.gradeHistory).toHaveLength(1);
    expect(run.snapshot.outcomeHistory).toHaveLength(1);
    expect(run.snapshot.pendingRewardIds).toEqual(
      completion.rewardChoices.map((reward) => reward.reward_id),
    );
    expect(repository.load()?.run).toMatchObject({
      node_index: 1,
      grade_history: [{ node_id: 'run_tutorial_01' }],
      outcome_history: [{ node_id: 'run_tutorial_01' }],
    });
  });

  it('completes all 15 authored nodes with rewards, all event patterns, and F-13', () => {
    const strip = createNodeStrip(RunStripSchema.parse(common('run-strip.json')));
    const flags = FlagsSchema.parse(common('flags.json'));
    const rewards = RewardsSchema.parse(common('rewards.json'));
    const grades = GradesSchema.parse(common('grades.json'));
    const cases = {
      tutorial: caseContent('tutorial'),
      ep001: caseContent('ep001'),
      ep004: caseContent('ep004'),
    } as const;
    const caseIds = {
      tutorial: 'case_tutorial',
      ep001: 'case_ep001',
      ep004: 'case_ep004',
    } as const;
    // The save repository must stay attached: the browser always saves at every
    // boundary, and detaching it here once hid a duplicate-reward soft-lock.
    const values = new Map<string, string>();
    const repository = new SaveRepository({
      getItem: (key) => values.get(key) ?? null,
      setItem: (key, value) => values.set(key, value),
      removeItem: (key) => values.delete(key),
    });
    const run = createRunSession({
      initialState: createRunState({
        runSeed: 2_026_080_3,
        stress: 100,
        dp: 0,
        trust: 0,
        deck: { drawPile: [], hand: [], discardPile: [], exhaustPile: [] },
      }),
      strip,
      flags: flags.flags,
      rewards,
      grades,
      saveRepository: repository,
      caseIdsByDirectory: caseIds,
    });

    while (run.snapshot.nodeIndex < strip.length) {
      const node = strip[run.snapshot.nodeIndex];
      if (node === undefined) throw new Error('Run strip ended unexpectedly.');
      const directory = node.caseDirectory as keyof typeof cases;
      const definition = cases[directory];
      if (node.kind === 'EVENT') {
        const event = definition.events_noncombat.find(
          (candidate) => candidate.event_id === node.ref,
        );
        if (event === undefined) throw new Error(`Missing event ${node.ref}.`);
        if (event.pattern === 'A') {
          const choice = event.choices[0];
          if (choice === undefined) throw new Error(`Event ${event.event_id} has no choice.`);
          run.finishEvent({
            eventDefinition: event,
            choiceId: choice.choice_id,
          });
        } else if (event.pattern === 'B') {
          run.finishEvent({
            eventDefinition: event,
            placement: { ...event.answer_mapping },
          });
        } else if (event.pattern === 'C') {
          run.finishEvent({
            eventDefinition: event,
            investigatedSpotIds: event.spots
              .slice(0, event.attempt_limit)
              .map((spot) => spot.spot_id),
          });
        } else if (event.pattern === 'D') {
          // The run starts with the full deck, so the first option always has a
          // legal target and the authored fallback stays untested here.
          const option = event.options[0];
          if (option === undefined) throw new Error(`Event ${event.event_id} has no option.`);
          run.finishEvent({
            eventDefinition: event,
            cardIntentsById: CARD_INTENTS,
            optionId: option.option_id,
            tunedCardId: eligibleCardId(run, option),
          });
        } else if (event.pattern === 'E') {
          run.finishEvent({
            eventDefinition: event,
            canvassedTopicIds: event.topics
              .slice(0, event.attempt_limit)
              .map((topic) => topic.topic_id),
          });
        } else {
          const held = new Set(run.snapshot.acquiredEvidenceIds);
          run.finishEvent({
            eventDefinition: event,
            collectedTargetIds: event.targets
              .filter((target) => !held.has(target.evidence_id))
              .slice(0, event.attempt_limit)
              .map((target) => target.target_id),
          });
        }
        continue;
      }

      const actIndex = Math.floor(run.snapshot.nodeIndex / 5);
      const rarity = (['COMMON', 'UNCOMMON', 'RARE'] as const)[actIndex];
      if (rarity === undefined) throw new Error('Missing reward rarity for act.');
      const encounterDefinition = definition.encounters.find(
        (encounter) => encounter.encounter_id === node.ref,
      );
      const authoredOutcome = encounterDefinition?.outcomes.find(
        (outcome) => outcome.grade === 'BEST_RESOLUTION',
      );
      if (authoredOutcome === undefined) throw new Error(`Missing BEST outcome ${node.ref}.`);
      const completion = run.finishEncounter({
        outcome: 'BEST_RESOLUTION',
        rewardRarity: rarity,
        episodeId: caseIds[directory],
        act: actIndex + 1,
        ...(authoredOutcome.rewards === undefined
          ? {}
          : { outcomeRewards: authoredOutcome.rewards }),
        gradeMetrics: {
          requiredClaimResolutionRatio: 1,
          optionalObjectiveRatio: 1,
          sweetSpotFinish: true,
          originalsPreserved: true,
          coercion: 0,
        },
      });
      const selected = completion.rewardChoices[0];
      if (selected === undefined) throw new Error('BEST encounter must offer a reward.');
      run.claimReward(selected.reward_id);
    }

    expect(run.snapshot.nodeIndex).toBe(15);
    expect(run.snapshot.completedNodeIds).toHaveLength(15);
    expect(run.snapshot.pendingRewardIds).toEqual([]);
    expect(run.snapshot.terminal).toBe(true);
    expect(run.snapshot.flags['F-13']).toBe(true);
    expect(run.snapshot.gradeHistory).toHaveLength(9);
    expect(run.snapshot.dp).toBeGreaterThanOrEqual(230);
  });

  it('sets F-12 only when the ep004 canvass actually asks about the route', () => {
    const flags = FlagsSchema.parse(common('flags.json'));
    const ep004 = caseContent('ep004');
    const canvass = ep004.events_noncombat.find(
      (event) => event.event_id === 'event_ep004_broker_canvass',
    );
    if (canvass?.pattern !== 'E') throw new Error('Missing ep004 canvass event.');
    // The attempt limit is deliberately smaller than the topic list, so the
    // player cannot simply take every branch.
    expect(canvass.attempt_limit).toBeLessThan(canvass.topics.length);

    const strip = [{
      nodeId: 'test_broker_canvass',
      kind: 'EVENT',
      ref: 'event_ep004_broker_canvass',
      caseDirectory: 'ep004',
    }] as const;
    const stateFor = () => createRunState({
      runSeed: 1,
      stress: 100,
      dp: 10,
      trust: 0,
      deck: { drawPile: [], hand: [], discardPile: [], exhaustPile: [] },
    });

    const askedRoute = completeEventNode(stateFor(), {
      strip,
      flagDefinitions: flags.flags,
      eventDefinition: canvass,
      canvassedTopicIds: ['topic_ep004_broker_route'],
    });
    expect(askedRoute.state.flags['F-12']).toBe(true);

    const askedElsewhere = completeEventNode(stateFor(), {
      strip,
      flagDefinitions: flags.flags,
      eventDefinition: canvass,
      canvassedTopicIds: ['topic_ep004_night_shift', 'topic_ep004_vip_car'],
    });
    // flags.json re-affirms what the topic set; with the route untouched there
    // is nothing to re-affirm, so the flag is never written at all.
    expect(askedElsewhere.state.flags['F-12']).not.toBe(true);
  });
});
