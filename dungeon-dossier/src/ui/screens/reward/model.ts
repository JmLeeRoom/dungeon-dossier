export type RewardChoiceKind = 'CARD' | 'ENHANCEMENT' | 'RELIC' | 'RESOURCE';

export interface RewardChoiceView {
  readonly rewardId: string;
  readonly kind: RewardChoiceKind;
  readonly title: string;
  readonly description: string;
  readonly rarity: string;
}

export interface RewardScreenModel {
  readonly heading: string;
  readonly grade: 'S' | 'A' | 'B' | 'C' | 'D' | 'F';
  readonly choices: readonly RewardChoiceView[];
}

export function assertRewardScreenModel(model: RewardScreenModel): void {
  if (model.choices.length !== 2 && model.choices.length !== 3) {
    throw new Error('Reward screen requires two boss choices or three battle choices.');
  }
  if (new Set(model.choices.map((choice) => choice.rewardId)).size !== model.choices.length) {
    throw new Error('Reward screen choices must be unique.');
  }
}
