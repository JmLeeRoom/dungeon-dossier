import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import { BalanceSchema, RewardsSchema } from '../../src/engine/domain';
import {
  claimRunReward,
  clampRunResource,
  createRunState,
  runResourceBoundsFromBalance,
  selectRewardChoices,
  type RunState,
} from '../../src/engine/run';

function common(file: string): unknown {
  return JSON.parse(
    readFileSync(new URL(`../../content/common/${file}`, import.meta.url), 'utf8'),
  ) as unknown;
}

const balance = BalanceSchema.parse(common('balance.json'));
const rewards = RewardsSchema.parse(common('rewards.json'));
const bounds = runResourceBoundsFromBalance(balance);

function state(overrides: Partial<RunState> = {}): RunState {
  return {
    ...createRunState({
      runSeed: 3,
      stress: balance.stress.max,
      dp: 0,
      trust: 0,
      resourceBounds: bounds,
      deck: { drawPile: [], hand: [], discardPile: [], exhaustPile: [] },
    }),
    ...overrides,
  };
}

describe('run resource bounds', () => {
  it('reads the ceilings balance.json actually declares', () => {
    expect(bounds.stressMax).toBe(balance.stress.max);
    expect(bounds.trustMax).toBe(balance.trust.max);
    // dp has no max in balance.json, so it must stay unbounded rather than
    // silently inheriting some other section's ceiling.
    expect(bounds.dpMax).toBeUndefined();
  });

  it('clamps between zero and the ceiling, and leaves an absent ceiling open', () => {
    expect(clampRunResource(-5, 100)).toBe(0);
    expect(clampRunResource(140, 100)).toBe(100);
    expect(clampRunResource(140, undefined)).toBe(140);
    expect(clampRunResource(42, 100)).toBe(42);
  });

  it('clamps the opening state instead of trusting the caller', () => {
    const opened = createRunState({
      runSeed: 1,
      stress: balance.stress.max + 50,
      dp: 0,
      trust: balance.trust.max + 5,
      resourceBounds: bounds,
      deck: { drawPile: [], hand: [], discardPile: [], exhaustPile: [] },
    });
    expect(opened.stress).toBe(balance.stress.max);
    expect(opened.trust).toBe(balance.trust.max);
  });

  it('keeps a resource reward from pushing stress over the ceiling', () => {
    const reward = rewards.rewards.find(
      (candidate) => candidate.type === 'RESOURCE' && candidate.resource === 'STRESS',
    );
    if (reward === undefined) throw new Error('no STRESS reward authored');
    const before = state({ stress: balance.stress.max });
    const after = claimRunReward(
      { ...before, pendingRewardIds: [reward.reward_id] },
      reward,
    );
    expect(after.stress).toBe(balance.stress.max);
  });

  it('keeps a resource reward from pushing trust over the ceiling', () => {
    const reward = rewards.rewards.find(
      (candidate) => candidate.type === 'RESOURCE' && candidate.resource === 'TRUST',
    );
    if (reward === undefined) throw new Error('no TRUST reward authored');
    const before = state({ trust: balance.trust.max });
    const after = claimRunReward(
      { ...before, pendingRewardIds: [reward.reward_id] },
      reward,
    );
    expect(after.trust).toBe(balance.trust.max);
  });

  it('treats an unbounded run exactly as it behaved before bounds existed', () => {
    const unbounded = createRunState({
      runSeed: 1,
      stress: 100,
      dp: 0,
      trust: 0,
      deck: { drawPile: [], hand: [], discardPile: [], exhaustPile: [] },
    });
    expect(unbounded.resourceBounds).toEqual({});
    const reward = rewards.rewards.find(
      (candidate) => candidate.type === 'RESOURCE' && candidate.resource === 'TRUST',
    );
    if (reward === undefined) throw new Error('no TRUST reward authored');
    const after = claimRunReward(
      { ...unbounded, trust: 99, pendingRewardIds: [reward.reward_id] },
      reward,
    );
    expect(after.trust).toBeGreaterThan(99);
  });
});

describe('reward offers exclude what the run already holds', () => {
  const relicReward = rewards.rewards.find((reward) => reward.type === 'RELIC');

  it('never offers a relic whose reference the run owns', () => {
    if (relicReward?.reference_id === undefined) throw new Error('no RELIC reward authored');
    const offered = selectRewardChoices({
      catalogue: rewards,
      rarity: relicReward.rarity,
      act: 4,
      boss: true,
      episodeId: 'case_ep004_midnight_express',
      seedStream: 11,
      ownedReferenceIds: [relicReward.reference_id],
    });
    expect(offered.choices.map((choice) => choice.reward_id)).not.toContain(
      relicReward.reward_id,
    );
  });

  it('shrinks the row rather than padding it with no-op picks', () => {
    if (relicReward === undefined) throw new Error('no RELIC reward authored');
    const sameRarity = rewards.rewards.filter(
      (reward) => reward.rarity === relicReward.rarity,
    );
    const ownedEverything = sameRarity.flatMap((reward) =>
      reward.reference_id === undefined ||
      (reward.type !== 'RELIC' && reward.type !== 'ENHANCEMENT')
        ? []
        : [reward.reference_id],
    );
    const offered = selectRewardChoices({
      catalogue: rewards,
      rarity: relicReward.rarity,
      act: 4,
      boss: true,
      episodeId: 'case_ep004_midnight_express',
      seedStream: 12,
      ownedReferenceIds: ownedEverything,
    });
    // An exhausted tier offers nothing rather than a row of no-op picks.
    expect(offered.choices.length).toBeLessThan(2);
    for (const choice of offered.choices) {
      if (choice.type === 'RELIC' || choice.type === 'ENHANCEMENT') {
        expect(ownedEverything).not.toContain(choice.reference_id);
      }
    }
  });

  it('refuses a claim that would grant an already-owned collectible', () => {
    if (relicReward?.reference_id === undefined) throw new Error('no RELIC reward authored');
    const owned = state({
      acquiredRelicIds: [relicReward.reference_id],
      pendingRewardIds: [relicReward.reward_id],
    });
    // Silent success would consume the pick and hand back nothing.
    expect(() => claimRunReward(owned, relicReward)).toThrow(/already holds/u);
  });
});
