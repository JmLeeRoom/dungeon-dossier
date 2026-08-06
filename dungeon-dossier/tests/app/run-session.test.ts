import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  FlagsSchema,
  GradesSchema,
  CaseSchema,
  RewardsSchema,
  RunStripSchema,
} from '../../src/engine/domain';
import {
  completeEventNode,
  createNodeStrip,
  createRunState,
} from '../../src/engine/run';
import { createRunSession } from '../../src/app/createRunSession';
import { SaveRepository } from '../../src/app/save';

function common(file: string): unknown {
  return JSON.parse(readFileSync(
    new URL(`../../content/common/${file}`, import.meta.url),
    'utf8',
  )) as unknown;
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
        } else {
          run.finishEvent({
            eventDefinition: event,
            investigatedSpotIds: event.spots
              .slice(0, event.attempt_limit)
              .map((spot) => spot.spot_id),
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

  it('makes the ep004 ticket-trade choices set opposite F-12 values', () => {
    const flags = FlagsSchema.parse(common('flags.json'));
    const ep004 = caseContent('ep004');
    const ticketTrade = ep004.events_noncombat.find(
      (event) => event.event_id === 'event_ep004_ticket_trade',
    );
    if (ticketTrade?.pattern !== 'A') throw new Error('Missing ep004 ticket-trade event.');
    const strip = [{
      nodeId: 'test_ticket_trade',
      kind: 'EVENT',
      ref: 'event_ep004_ticket_trade',
      caseDirectory: 'ep004',
    }] as const;
    const stateFor = () => createRunState({
      runSeed: 1,
      stress: 100,
      dp: 10,
      trust: 0,
      deck: { drawPile: [], hand: [], discardPile: [], exhaustPile: [] },
    });

    const questioned = completeEventNode(stateFor(), {
      strip,
      flagDefinitions: flags.flags,
      eventDefinition: ticketTrade,
      choiceId: 'choice_ep004_question_broker',
    });
    expect(questioned.state.flags['F-12']).toBe(true);

    const bought = completeEventNode(stateFor(), {
      strip,
      flagDefinitions: flags.flags,
      eventDefinition: ticketTrade,
      choiceId: 'choice_ep004_buy_vip_ticket',
    });
    expect(bought.state.flags['F-12']).toBe(false);
  });
});
