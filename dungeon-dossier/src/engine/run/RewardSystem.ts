import {
  RewardsSchema,
  type Condition,
  type RewardDefinition,
  type RewardsDefinition,
} from '../domain';

export type RewardRarity = RewardDefinition['rarity'];
export type RewardConditionEvaluator = (condition: Condition) => boolean;

export interface RewardSelectionInput {
  readonly catalogue: RewardsDefinition;
  readonly rarity: RewardRarity;
  readonly episodeId: string;
  readonly act: number;
  readonly boss: boolean;
  /** Explicit serializable stream state derived from run_seed. */
  readonly seedStream: number;
  /** Rewards already claimed this run; deprioritized so choices stay fresh. */
  readonly excludeRewardIds?: readonly string[];
  /** Relic/enhancement reference ids the run already holds. */
  readonly ownedReferenceIds?: readonly string[];
  readonly evaluateCondition?: RewardConditionEvaluator;
}

export interface RewardSelectionResult {
  readonly choices: readonly RewardDefinition[];
  readonly seedStream: number;
}

function assertUint32(name: string, value: number): void {
  if (!Number.isInteger(value) || value < 0 || value > 0xffff_ffff) {
    throw new RangeError(`${name} must be an unsigned 32-bit integer.`);
  }
}

function nextRewardRandom(seedStream: number): Readonly<{
  value: number;
  seedStream: number;
}> {
  const next = (seedStream + 0x6d2b79f5) >>> 0;
  let mixed = next;
  mixed = Math.imul(mixed ^ (mixed >>> 15), mixed | 1);
  mixed ^= mixed + Math.imul(mixed ^ (mixed >>> 7), mixed | 61);
  return {
    value: ((mixed ^ (mixed >>> 14)) >>> 0) / 4_294_967_296,
    seedStream: next,
  };
}

function conditionsMet(
  reward: RewardDefinition,
  evaluate: RewardConditionEvaluator | undefined,
): boolean {
  if (reward.conditions === undefined || reward.conditions.length === 0) return true;
  return reward.conditions.every((condition) => {
    if (condition.type === 'ALWAYS') return true;
    if (evaluate === undefined) {
      throw new Error(
        `Reward ${reward.reward_id} requires an injected condition evaluator.`,
      );
    }
    return evaluate(condition);
  });
}

/** RELIC/ENHANCEMENT grant a reference id once; a second grant is a no-op. */
function isOwnedCollectible(
  reward: RewardDefinition,
  ownedReferenceIds: ReadonlySet<string>,
): boolean {
  if (reward.type !== 'RELIC' && reward.type !== 'ENHANCEMENT') return false;
  return reward.reference_id !== undefined && ownedReferenceIds.has(reward.reference_id);
}

function eligibleReward(
  reward: RewardDefinition,
  input: RewardSelectionInput,
): boolean {
  return (
    reward.rarity === input.rarity &&
    (reward.min_act === undefined || input.act >= reward.min_act) &&
    (reward.max_act === undefined || input.act <= reward.max_act) &&
    (reward.episode_ids === undefined || reward.episode_ids.includes(input.episodeId)) &&
    conditionsMet(reward, input.evaluateCondition)
  );
}

function weightedIndex(
  rewards: readonly RewardDefinition[],
  randomValue: number,
): number {
  const totalWeight = rewards.reduce((total, reward) => total + reward.weight, 0);
  let threshold = randomValue * totalWeight;
  for (let index = 0; index < rewards.length; index += 1) {
    threshold -= (rewards[index] as RewardDefinition).weight;
    if (threshold < 0) return index;
  }
  return rewards.length - 1;
}

/** Weighted deterministic draw without replacement. */
export function selectRewardChoices(
  input: RewardSelectionInput,
): RewardSelectionResult {
  assertUint32('seedStream', input.seedStream);
  if (!Number.isInteger(input.act) || input.act < 0) {
    throw new RangeError('Reward act must be a non-negative integer.');
  }
  const catalogue = RewardsSchema.parse(input.catalogue);
  const choiceCount = input.boss
    ? catalogue.selection.boss_choices
    : catalogue.selection.battle_choices;
  const owned = new Set(input.ownedReferenceIds ?? []);
  // A collectible the run already holds can never be granted twice, so offering
  // it would spend the player's pick on nothing. It is removed from the pool
  // outright rather than being allowed through as a last-resort backfill.
  const offerable = catalogue.rewards.filter(
    (reward) => eligibleReward(reward, input) && !isOwnedCollectible(reward, owned),
  );
  const excluded = new Set(input.excludeRewardIds ?? []);
  const fresh = offerable.filter((reward) => !excluded.has(reward.reward_id));
  // A drained pool backfills with repeatable rewards only: re-claiming a
  // RESOURCE or CARD grants again.
  const repeatable = offerable.filter(
    (reward) =>
      !excluded.has(reward.reward_id) ||
      reward.type === 'RESOURCE' ||
      reward.type === 'CARD',
  );
  const candidates = fresh.length >= choiceCount ? fresh : repeatable;
  // An exhausted tier yields no reward screen at all. Padding the row with
  // owned collectibles would spend the pick on nothing, and throwing would turn
  // a drained pool into a dead run at the node boundary.
  const offeredCount = Math.min(choiceCount, candidates.length);

  const remaining = [...candidates];
  const choices: RewardDefinition[] = [];
  let seedStream = input.seedStream;
  while (choices.length < offeredCount) {
    const random = nextRewardRandom(seedStream);
    seedStream = random.seedStream;
    const index = weightedIndex(remaining, random.value);
    const [selected] = remaining.splice(index, 1);
    if (selected === undefined) throw new Error('Reward selection produced no candidate.');
    choices.push(selected);
  }
  return { choices, seedStream };
}
