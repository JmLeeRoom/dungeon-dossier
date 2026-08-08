import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  EPISODE_NODE_COUNT,
  EPISODE_SLOT_ORDER,
  NODE_KIND_BY_SLOT_ROLE,
  FlagsSchema,
  GradesSchema,
  CaseSchema,
  RewardsSchema,
  RunStripSchema,
  type FlagDefinition,
  type GradesDefinition,
  type RewardsDefinition,
  type RunStripDefinition,
} from '../../src/engine/domain';
import {
  advanceRunNodeIndex,
  claimRunReward,
  completeEncounterNode,
  completeEventNode,
  createFlagStore,
  createNodeStrip,
  createRunState,
  currentRunNode,
  episodeIdAt,
  evaluateCaseGrade,
  evaluateEnding,
  isEpisodeFinalNode,
  isRunStripComplete,
  nextEpisodeId,
  runEpisodeIds,
  selectRewardChoices,
  withFlag,
  type EndingFormula,
  type GradeEvaluationInput,
  type RunProgressionEvent,
} from '../../src/engine/run';

/** Fixture episode ids; the first matches the reward catalogue's episode gate. */
const FIXTURE_EPISODE_IDS = ['episode-alpha', 'episode-beta', 'episode-gamma'] as const;
/** Three episodes of COMBAT/EVENT/BOSS resolve to this many route nodes. */
const FIXTURE_NODE_COUNT = FIXTURE_EPISODE_IDS.length * EPISODE_NODE_COUNT;
/** Route index of the first episode's EVENT stage. */
const FIRST_EVENT_NODE_INDEX = 1;
/** Route index of the first episode's BOSS stage. */
const FIRST_BOSS_NODE_INDEX = 2;

/**
 * Three episodes of the mandated COMBAT/EVENT/BOSS slot order. Every slot is
 * FIXED with a single candidate, so the resolved route stays deterministic the
 * way the old flat 15-node fixture was.
 */
function runStripDefinition(): RunStripDefinition {
  return {
    schema_version: '2.0',
    episodes: FIXTURE_EPISODE_IDS.map((episodeId, episodeIndex) => ({
      episode_id: episodeId,
      sequence_index: episodeIndex,
      case_directory: `case-${episodeId}`,
      slots: EPISODE_SLOT_ORDER.map((role, slotIndex) => {
        const nodeNumber = episodeIndex * EPISODE_NODE_COUNT + slotIndex + 1;
        return {
          role,
          selection: 'FIXED' as const,
          candidates: [{
            node_id: `run-node-${nodeNumber.toString()}`,
            kind: NODE_KIND_BY_SLOT_ROLE[role],
            ref: `run-reference-${nodeNumber.toString()}`,
          }],
        };
      }),
    })),
  };
}

/** Repoints the first episode's EVENT stage at an authored event definition. */
function withFirstEventRef(
  definition: RunStripDefinition,
  ref: string,
): RunStripDefinition {
  return {
    ...definition,
    episodes: definition.episodes.map((episode, episodeIndex) =>
      episodeIndex !== 0
        ? episode
        : {
            ...episode,
            slots: episode.slots.map((slot) =>
              slot.role !== 'EVENT'
                ? slot
                : {
                    ...slot,
                    candidates: slot.candidates.map((candidate) => ({ ...candidate, ref })),
                  },
            ),
          },
    ),
  };
}

function rewardsDefinition(): RewardsDefinition {
  return {
    schema_version: '1.0',
    selection: { battle_choices: 3, boss_choices: 2 },
    rewards: [
      ...Array.from({ length: 7 }, (_, index) => ({
        reward_id: `reward-card-${index.toString()}`,
        type: 'CARD' as const,
        reference_id: `card-reference-${index.toString()}`,
        rarity: 'COMMON' as const,
        weight: index + 1,
        min_act: 1,
        max_act: 2,
        episode_ids: ['episode-alpha'],
      })),
      {
        reward_id: 'reward-wrong-rarity',
        type: 'RELIC',
        reference_id: 'relic-reference',
        rarity: 'RARE',
        weight: 100,
      },
      {
        reward_id: 'reward-wrong-episode',
        type: 'RESOURCE',
        resource: 'DP',
        amount: 5,
        rarity: 'COMMON',
        weight: 100,
        episode_ids: ['other-episode'],
      },
    ],
  };
}

function gradesDefinition(): GradesDefinition {
  return {
    schema_version: '1.0',
    grades: [
      {
        grade: 'S', label_key: 'grade.s', priority: 60,
        requirements: {
          required_claim_resolution_ratio_min: 1,
          optional_objective_ratio_min: 1,
          require_sweet_spot_finish: true,
          require_originals_preserved: true,
          coercion_max: 10,
          false_confessions_max: 0,
        },
      },
      {
        grade: 'A', label_key: 'grade.a', priority: 50,
        requirements: {
          required_claim_resolution_ratio_min: 0.9,
          coercion_max: 20,
          false_confessions_max: 0,
        },
      },
      {
        grade: 'B', label_key: 'grade.b', priority: 40,
        requirements: {
          required_claim_resolution_ratio_min: 0.75,
          coercion_max: 40,
          false_confessions_max: 1,
        },
      },
      {
        grade: 'C', label_key: 'grade.c', priority: 30,
        requirements: {
          required_claim_resolution_ratio_min: 0.5,
          coercion_max: 60,
          false_confessions_max: 1,
        },
      },
      {
        grade: 'D', label_key: 'grade.d', priority: 20,
        requirements: {
          required_claim_resolution_ratio_min: 0.25,
          coercion_max: 100,
          false_confessions_max: 2,
        },
      },
      {
        grade: 'F', label_key: 'grade.f', priority: 10,
        requirements: { required_claim_resolution_ratio_min: 0 },
      },
    ],
  };
}

const PERFECT_METRICS: GradeEvaluationInput = {
  requiredClaimResolutionRatio: 1,
  optionalObjectiveRatio: 1,
  sweetSpotFinish: true,
  originalsPreserved: true,
  coercion: 5,
  falseConfessions: 0,
};

describe('run layer', () => {
  it('drives the checked-in run strip, rewards, grades, and flags together', () => {
    const load = (relativePath: string): unknown => JSON.parse(readFileSync(
      new URL(`../../content/common/${relativePath}`, import.meta.url),
      'utf8',
    )) as unknown;
    const strip = createNodeStrip(RunStripSchema.parse(load('run-strip.json')));
    const flags = FlagsSchema.parse(load('flags.json'));
    const rewards = RewardsSchema.parse(load('rewards.json'));
    const grades = GradesSchema.parse(load('grades.json'));
    const tutorial = CaseSchema.parse(JSON.parse(readFileSync(
      new URL('../../content/cases/tutorial/case.json', import.meta.url),
      'utf8',
    )) as unknown);
    const initial = createRunState({
      runSeed: 2_026_080_3,
      stress: 70,
      dp: 0,
      trust: 0,
      deck: { drawPile: [], hand: [], discardPile: [], exhaustPile: [] },
    });
    const encounter = completeEncounterNode(initial, {
      strip,
      outcome: 'BEST_RESOLUTION',
      flagDefinitions: flags.flags,
      rewardCatalogue: rewards,
      rewardRarity: 'COMMON',
      episodeId: 'case_tutorial',
      act: 0,
      gradeCatalogue: grades,
      gradeMetrics: {
        requiredClaimResolutionRatio: 1,
        optionalObjectiveRatio: 1,
        sweetSpotFinish: true,
        originalsPreserved: true,
        coercion: 0,
      },
    });
    expect(encounter.state.nodeIndex).toBe(1);
    expect(encounter.state.flags['F-02']).toBe(true);
    expect(encounter.rewardChoices).toHaveLength(3);
    const resourceReward = encounter.rewardChoices.find(
      (reward) => reward.type === 'RESOURCE',
    );
    if (resourceReward === undefined) throw new Error('Expected a common resource reward.');
    const claimed = claimRunReward(encounter.state, resourceReward);
    const expectedStress = resourceReward.resource === 'STRESS'
      ? 70 + (resourceReward.amount ?? 0)
      : 70;
    expect(claimed.stress).toBe(expectedStress);
    expect(claimed.claimedRewardIds).toEqual([resourceReward.reward_id]);
    const choiceEvent = tutorial.events_noncombat.find(
      (candidate) => candidate.event_id === 'event_tutorial_choice',
    );
    if (choiceEvent === undefined) throw new Error('Expected the tutorial choice event.');
    const event = completeEventNode(claimed, {
      strip,
      flagDefinitions: flags.flags,
      choiceId: 'choice_tutorial_search',
      eventDefinition: choiceEvent,
    });
    expect(event.state.nodeIndex).toBe(2);
    expect(event.state.flags['F-03']).toBe(true);
    expect(event.state.flags['F-07']).toBe(true);
    expect(event.state.stress).toBe(expectedStress - 5);
    expect(event.state.acquiredEvidenceIds).toContain('ev_tutorial_receipt');
  });

  it('validates an injected 3-episode strip and advances by array index only', () => {
    const definition = runStripDefinition();
    expect(RunStripSchema.parse(definition).episodes).toHaveLength(3);
    const strip = createNodeStrip(definition);
    expect(strip).toHaveLength(FIXTURE_NODE_COUNT);
    expect(strip.map((node) => node.kind)).toEqual([
      'ENCOUNTER', 'EVENT', 'BOSS',
      'ENCOUNTER', 'EVENT', 'BOSS',
      'ENCOUNTER', 'EVENT', 'BOSS',
    ]);
    expect(strip.map((node) => node.nodeId)).toEqual([
      'run-node-1', 'run-node-2', 'run-node-3',
      'run-node-4', 'run-node-5', 'run-node-6',
      'run-node-7', 'run-node-8', 'run-node-9',
    ]);
    expect(runEpisodeIds(strip)).toEqual([...FIXTURE_EPISODE_IDS]);
    expect(strip.map((node) => node.slotIndex)).toEqual([0, 1, 2, 0, 1, 2, 0, 1, 2]);
    let nodeIndex = 0;
    for (const expected of strip) {
      expect(currentRunNode(strip, nodeIndex)?.nodeId).toBe(expected.nodeId);
      expect(episodeIdAt(strip, nodeIndex)).toBe(expected.episodeId);
      expect(isEpisodeFinalNode(strip, nodeIndex)).toBe(expected.slotRole === 'BOSS');
      nodeIndex = advanceRunNodeIndex(strip, nodeIndex);
    }
    expect(nodeIndex).toBe(FIXTURE_NODE_COUNT);
    expect(isRunStripComplete(strip, nodeIndex)).toBe(true);
    expect(currentRunNode(strip, nodeIndex)).toBeNull();
    expect(nextEpisodeId(strip, FIRST_BOSS_NODE_INDEX)).toBe('episode-beta');
    expect(nextEpisodeId(strip, FIXTURE_NODE_COUNT - 1)).toBeNull();
    expect(() => advanceRunNodeIndex(strip, nodeIndex)).toThrow(/already complete/u);
    const [firstEpisode] = definition.episodes;
    if (firstEpisode === undefined) throw new Error('Expected the first fixture episode.');
    expect(() => RunStripSchema.parse({
      ...definition,
      episodes: [
        { ...firstEpisode, slots: firstEpisode.slots.slice(0, EPISODE_NODE_COUNT - 1) },
        ...definition.episodes.slice(1),
      ],
    })).toThrow();
  });

  it('draws deterministic unique 3-choice battle and 2-choice boss rewards', () => {
    const base = {
      catalogue: rewardsDefinition(),
      rarity: 'COMMON' as const,
      episodeId: 'episode-alpha',
      act: 1,
      seedStream: 0x1234_5678,
    };
    const first = selectRewardChoices({ ...base, boss: false });
    const replay = selectRewardChoices({ ...base, boss: false });
    const boss = selectRewardChoices({ ...base, boss: true });
    expect(first.choices.map((reward) => reward.reward_id)).toEqual(
      replay.choices.map((reward) => reward.reward_id),
    );
    expect(first.choices).toHaveLength(3);
    expect(new Set(first.choices.map((reward) => reward.reward_id))).toHaveLength(3);
    expect(boss.choices).toHaveLength(2);
    expect(first.seedStream).not.toBe(base.seedStream);
    expect(first.choices.every((reward) => reward.rarity === 'COMMON')).toBe(true);
    expect(first.choices.some((reward) => reward.reward_id === 'reward-wrong-episode'))
      .toBe(false);
  });

  it('evaluates every S through F grade row by injected priority data', () => {
    const inputs: readonly [GradeEvaluationInput, string][] = [
      [PERFECT_METRICS, 'S'],
      [{ ...PERFECT_METRICS, optionalObjectiveRatio: 0, sweetSpotFinish: false }, 'A'],
      [{ ...PERFECT_METRICS, requiredClaimResolutionRatio: 0.8, coercion: 30 }, 'B'],
      [{ ...PERFECT_METRICS, requiredClaimResolutionRatio: 0.6, coercion: 50 }, 'C'],
      [{ ...PERFECT_METRICS, requiredClaimResolutionRatio: 0.3, coercion: 80 }, 'D'],
      [{ ...PERFECT_METRICS, requiredClaimResolutionRatio: 0.1, coercion: 120 }, 'F'],
    ];
    expect(inputs.map(([input]) => evaluateCaseGrade(gradesDefinition(), input).grade))
      .toEqual(inputs.map(([, grade]) => grade));
  });

  it('accumulates outcome flags, reward choices, grades, and deterministic position', () => {
    const strip = createNodeStrip(runStripDefinition());
    const flagDefinitions: readonly FlagDefinition[] = [{
      flag_id: 'F-13',
      set_by: [{ encounter: strip[0]?.ref, outcome: 'BEST_RESOLUTION', value: true }],
      consumed_by: [{
        encounter: strip[FIRST_BOSS_NODE_INDEX]?.ref ?? 'next-reference',
        apply: { type: 'MODIFY_SHIELDS', delta: 1 },
      }],
    }];
    const initial = createRunState({
      runSeed: 77,
      stress: 100,
      dp: 0,
      trust: 0,
      deck: { drawPile: [], hand: [], discardPile: [], exhaustPile: [] },
    });
    const completionInput = {
      strip,
      outcome: 'BEST_RESOLUTION' as const,
      flagDefinitions,
      rewardCatalogue: rewardsDefinition(),
      rewardRarity: 'COMMON' as const,
      episodeId: 'episode-alpha',
      act: 1,
      gradeCatalogue: gradesDefinition(),
      gradeMetrics: {
        requiredClaimResolutionRatio: 1,
        optionalObjectiveRatio: 1,
        sweetSpotFinish: true,
        originalsPreserved: true,
        coercion: 5,
      },
      encounterState: {
        stress: 62,
        dp: 4,
        trust: 1,
        deck: {
          drawPile: ['card-survivor'],
          hand: [],
          discardPile: ['card-used'],
          exhaustPile: ['card-exhausted'],
        },
        acquiredEvidenceIds: ['evidence-carried-forward'],
      },
    };
    const first = completeEncounterNode(initial, completionInput);
    const replay = completeEncounterNode(initial, completionInput);
    expect(first.state.flags['F-13']).toBe(true);
    expect(first.appliedFlags).toHaveLength(1);
    expect(first.grade).toBe('S');
    expect(first.state.gradeHistory).toEqual([{
      nodeId: strip[0]?.nodeId,
      outcome: 'BEST_RESOLUTION',
      grade: 'S',
    }]);
    expect(first.state.nodeIndex).toBe(1);
    expect(first.state).toMatchObject({ stress: 62, dp: 4, trust: 1 });
    expect(first.state.deck).toEqual(completionInput.encounterState.deck);
    expect(first.state.acquiredEvidenceIds).toContain('evidence-carried-forward');
    expect(first.rewardChoices).toHaveLength(3);
    expect(first.rewardChoices.map((reward) => reward.reward_id)).toEqual(
      replay.rewardChoices.map((reward) => reward.reward_id),
    );

    const selected = first.rewardChoices[0];
    if (selected === undefined) throw new Error('Expected a selectable reward.');
    const claimed = claimRunReward(first.state, selected);
    expect(claimed.pendingRewardIds).toEqual([]);
    expect(claimed.claimedRewardIds).toEqual([selected.reward_id]);
    expect(claimed.deck.discardPile).toContain(selected.reference_id);

    // The BOSS stage is now the third slot, so the episode's EVENT stage sits
    // between the two graded nodes this test compares.
    const throughEvent = completeEventNode(claimed, { strip, flagDefinitions: [] });
    expect(throughEvent.state.nodeIndex).toBe(FIRST_BOSS_NODE_INDEX);
    expect(throughEvent.state.gradeHistory.map((record) => record.grade)).toEqual(['S']);

    const boss = completeEncounterNode(throughEvent.state, {
      ...completionInput,
      outcome: 'PARTIAL_RESOLUTION',
      gradeMetrics: {
        ...completionInput.gradeMetrics,
        requiredClaimResolutionRatio: 0.6,
        coercion: 50,
      },
    });
    expect(strip[FIRST_BOSS_NODE_INDEX]?.kind).toBe('BOSS');
    expect(boss.rewardChoices).toHaveLength(2);
    expect(boss.state.nodeIndex).toBe(3);
    expect(boss.state.gradeHistory.map((record) => record.grade)).toEqual(['S', 'C']);
  });

  it('advances coerced outcomes without rewards and stops failed outcomes in place', () => {
    const strip = createNodeStrip(runStripDefinition());
    const initial = createRunState({
      runSeed: 9,
      stress: 100,
      dp: 0,
      trust: 0,
      deck: { drawPile: [], hand: [], discardPile: [], exhaustPile: [] },
    });
    const common = {
      strip,
      flagDefinitions: [] as readonly FlagDefinition[],
      rewardCatalogue: rewardsDefinition(),
      rewardRarity: 'COMMON' as const,
      episodeId: 'episode-alpha',
      act: 1,
      gradeCatalogue: gradesDefinition(),
    };
    const coerced = completeEncounterNode(initial, {
      ...common,
      outcome: 'COERCED_CONFESSION',
      gradeMetrics: {
        requiredClaimResolutionRatio: 0.8,
        optionalObjectiveRatio: 0,
        sweetSpotFinish: false,
        originalsPreserved: true,
        coercion: 30,
      },
    });
    expect(coerced.state.nodeIndex).toBe(1);
    expect(coerced.state.falseConfessions).toBe(1);
    expect(coerced.rewardChoices).toEqual([]);
    expect(coerced.grade).toBe('B');

    const failed = completeEncounterNode(initial, {
      ...common,
      outcome: 'FAILED',
      gradeMetrics: {
        requiredClaimResolutionRatio: 0.1,
        optionalObjectiveRatio: 0,
        sweetSpotFinish: false,
        originalsPreserved: false,
        coercion: 120,
      },
    });
    expect(failed.state.nodeIndex).toBe(0);
    expect(failed.state.terminal).toBe(true);
    expect(failed.state.completedNodeIds).toEqual([]);
    expect(failed.rewardChoices).toEqual([]);
    expect(failed.grade).toBe('F');
  });

  it('emits episode progression only when a BOSS stage clears', () => {
    const strip = createNodeStrip(runStripDefinition());
    const episodeIds = runEpisodeIds(strip);
    expect(episodeIds).toEqual([...FIXTURE_EPISODE_IDS]);
    let state = createRunState({
      runSeed: 4_242,
      stress: 100,
      dp: 0,
      trust: 0,
      deck: { drawPile: [], hand: [], discardPile: [], exhaustPile: [] },
      episodeIds,
    });
    // A fresh run stands in the first episode with every later one still fogged.
    expect(state.activeEpisodeId).toBe('episode-alpha');
    expect(state.unlockedEpisodeIds).toEqual(['episode-alpha']);
    expect(state.completedEpisodeIds).toEqual([]);

    const progression: RunProgressionEvent[][] = [];
    for (const node of strip) {
      if (node.kind === 'EVENT') {
        const event = completeEventNode(state, { strip, flagDefinitions: [] });
        progression.push([...event.progression]);
        state = event.state;
        continue;
      }
      const encounter = completeEncounterNode(state, {
        strip,
        outcome: 'BEST_RESOLUTION',
        flagDefinitions: [],
        rewardCatalogue: rewardsDefinition(),
        rewardRarity: 'COMMON',
        episodeId: 'episode-alpha',
        act: 1,
        gradeCatalogue: gradesDefinition(),
        gradeMetrics: {
          requiredClaimResolutionRatio: 1,
          optionalObjectiveRatio: 1,
          sweetSpotFinish: true,
          originalsPreserved: true,
          coercion: 5,
        },
      });
      progression.push([...encounter.progression]);
      const [choice] = encounter.rewardChoices;
      if (choice === undefined) throw new Error('Expected a reward choice to claim.');
      state = claimRunReward(encounter.state, choice);
    }

    expect(progression).toEqual([
      [{ type: 'NODE_CLEARED', nodeId: 'run-node-1', episodeId: 'episode-alpha' }],
      [{ type: 'NODE_CLEARED', nodeId: 'run-node-2', episodeId: 'episode-alpha' }],
      [
        { type: 'NODE_CLEARED', nodeId: 'run-node-3', episodeId: 'episode-alpha' },
        { type: 'EPISODE_CLEARED', episodeId: 'episode-alpha' },
        { type: 'EPISODE_UNLOCKED', episodeId: 'episode-beta' },
      ],
      [{ type: 'NODE_CLEARED', nodeId: 'run-node-4', episodeId: 'episode-beta' }],
      [{ type: 'NODE_CLEARED', nodeId: 'run-node-5', episodeId: 'episode-beta' }],
      [
        { type: 'NODE_CLEARED', nodeId: 'run-node-6', episodeId: 'episode-beta' },
        { type: 'EPISODE_CLEARED', episodeId: 'episode-beta' },
        { type: 'EPISODE_UNLOCKED', episodeId: 'episode-gamma' },
      ],
      [{ type: 'NODE_CLEARED', nodeId: 'run-node-7', episodeId: 'episode-gamma' }],
      [{ type: 'NODE_CLEARED', nodeId: 'run-node-8', episodeId: 'episode-gamma' }],
      [
        { type: 'NODE_CLEARED', nodeId: 'run-node-9', episodeId: 'episode-gamma' },
        { type: 'EPISODE_CLEARED', episodeId: 'episode-gamma' },
        { type: 'RUN_CLEARED' },
      ],
    ]);
    expect(state.nodeIndex).toBe(FIXTURE_NODE_COUNT);
    expect(state.terminal).toBe(true);
    expect(state.activeEpisodeId).toBe('episode-gamma');
    expect(state.unlockedEpisodeIds).toEqual([...FIXTURE_EPISODE_IDS]);
    expect(state.completedEpisodeIds).toEqual([...FIXTURE_EPISODE_IDS]);
  });

  it('leaves the episode fog closed when the BOSS stage fails', () => {
    const strip = createNodeStrip(runStripDefinition());
    const initial = {
      ...createRunState({
        runSeed: 5,
        stress: 100,
        dp: 0,
        trust: 0,
        deck: { drawPile: [], hand: [], discardPile: [], exhaustPile: [] },
        episodeIds: runEpisodeIds(strip),
      }),
      nodeIndex: FIRST_BOSS_NODE_INDEX,
    };
    const failed = completeEncounterNode(initial, {
      strip,
      outcome: 'FAILED',
      flagDefinitions: [],
      rewardCatalogue: rewardsDefinition(),
      rewardRarity: 'COMMON',
      episodeId: 'episode-alpha',
      act: 1,
      gradeCatalogue: gradesDefinition(),
      gradeMetrics: {
        requiredClaimResolutionRatio: 0.1,
        optionalObjectiveRatio: 0,
        sweetSpotFinish: false,
        originalsPreserved: false,
        coercion: 120,
      },
    });
    expect(failed.progression).toEqual([]);
    expect(failed.state.nodeIndex).toBe(FIRST_BOSS_NODE_INDEX);
    expect(failed.state.activeEpisodeId).toBe('episode-alpha');
    expect(failed.state.unlockedEpisodeIds).toEqual(['episode-alpha']);
    expect(failed.state.completedEpisodeIds).toEqual([]);
  });

  it('advances event nodes through injected event/choice flag hooks', () => {
    const strip = createNodeStrip(runStripDefinition());
    const eventNode = strip[FIRST_EVENT_NODE_INDEX];
    if (eventNode === undefined) throw new Error('Expected the first EVENT stage.');
    expect(eventNode.kind).toBe('EVENT');
    // The EVENT stage is the second slot of every episode, so the run cursor is
    // placed on it directly rather than grading the COMBAT stage first.
    const initial = {
      ...createRunState({
        runSeed: 3,
        stress: 100,
        dp: 0,
        trust: 0,
        deck: { drawPile: [], hand: [], discardPile: [], exhaustPile: [] },
      }),
      nodeIndex: FIRST_EVENT_NODE_INDEX,
    };
    const result = completeEventNode(initial, {
      strip,
      choiceId: 'event-choice',
      flagDefinitions: [{
        flag_id: 'F-12',
        set_by: [{ event: eventNode.ref, choice: 'event-choice', value: true }],
        consumed_by: [{
          encounter: 'future-consumer',
          apply: { type: 'ADJUST_RESOURCE', resource: 'trust', delta: 1 },
        }],
      }],
    });
    expect(result.state.nodeIndex).toBe(FIRST_EVENT_NODE_INDEX + 1);
    expect(result.state.flags['F-12']).toBe(true);
    expect(result.appliedFlags).toHaveLength(1);
    expect(result.state.completedNodeIds).toEqual([eventNode.nodeId]);
  });

  it('validates and scores authored pattern B placement submissions in the run layer', () => {
    const tutorial = CaseSchema.parse(JSON.parse(readFileSync(
      new URL('../../content/cases/tutorial/case.json', import.meta.url),
      'utf8',
    )) as unknown);
    const placementEvent = tutorial.events_noncombat.find(
      (event) => event.event_id === 'event_tutorial_placement',
    );
    if (placementEvent?.pattern !== 'B') {
      throw new Error('Expected the authored tutorial placement event.');
    }
    const strip = createNodeStrip(
      withFirstEventRef(runStripDefinition(), placementEvent.event_id),
    );
    expect(strip[FIRST_EVENT_NODE_INDEX]?.ref).toBe(placementEvent.event_id);
    const initial = {
      ...createRunState({
        runSeed: 31,
        stress: 100,
        dp: 0,
        trust: 0,
        deck: { drawPile: [], hand: [], discardPile: [], exhaustPile: [] },
      }),
      nodeIndex: FIRST_EVENT_NODE_INDEX,
    };
    const placement = { ...placementEvent.answer_mapping };
    const result = completeEventNode(initial, {
      strip,
      flagDefinitions: [],
      eventDefinition: placementEvent,
      placement,
    });
    expect(result.placementResult).toMatchObject({
      correct: placementEvent.items.length,
      total: placementEvent.items.length,
      ratio: 1,
      result: 'SUCCESS',
    });
    expect(result.state.nodeIndex).toBe(FIRST_EVENT_NODE_INDEX + 1);
    expect(() => completeEventNode(initial, {
      strip,
      flagDefinitions: [],
      eventDefinition: placementEvent,
      placement: {},
    })).toThrow(/exactly one placement per item/u);
  });

  it('produces injected true, normal, and bad endings from boolean authored flags', () => {
    const formula: EndingFormula = {
      rules: [
        {
          endingId: 'ending-true',
          priority: 20,
          when: { type: 'FLAG_EQUALS', flagId: 'F-13', value: true },
        },
        {
          endingId: 'ending-bad',
          priority: 10,
          when: { type: 'FLAG_EQUALS', flagId: 'F-01', value: true },
        },
      ],
      defaultEndingId: 'ending-normal',
    };
    expect(evaluateEnding(withFlag(createFlagStore(), 'F-13', true), formula))
      .toBe('ending-true');
    expect(evaluateEnding(createFlagStore(), formula)).toBe('ending-normal');
    expect(evaluateEnding(withFlag(createFlagStore(), 'F-01', true), formula))
      .toBe('ending-bad');

    const engineSource = [
      'RunState.ts', 'NodeStrip.ts', 'RewardSystem.ts',
      'GradeEvaluator.ts', 'EndingEvaluator.ts',
    ].map((file) => readFileSync(
      new URL(`../../src/engine/run/${file}`, import.meta.url),
      'utf8',
    )).join('\n');
    expect(engineSource).not.toMatch(/\bF-13\b/u);
    expect(engineSource).not.toMatch(/['"`](?:case_|clm_|ev_|ent_|enc_)[\w-]*/iu);
  });
});
