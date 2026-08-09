export interface EventEffectView {
  readonly label: string;
}

export interface EventChoiceView {
  readonly choiceId: string;
  readonly label: string;
  readonly costs: readonly EventEffectView[];
  readonly gains: readonly EventEffectView[];
  /** False greys the choice out; the engine would reject it anyway. */
  readonly affordable: boolean;
  /** Shown in place of the cost chips when the choice cannot be paid for. */
  readonly blockedReason?: string;
}

export interface EventPlacementItemView {
  readonly itemId: string;
  readonly label: string;
}

export interface EventPlacementSlotView {
  readonly slotId: string;
  readonly label: string;
}

export interface EventInvestigationSpotView {
  readonly spotId: string;
  readonly label: string;
  readonly discovered: boolean;
  /** What the spot yielded, revealed only once it has been investigated. */
  readonly findings: readonly EventEffectView[];
  readonly affordable: boolean;
}

export interface EventDecorationView {
  readonly assetKey: string;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

/** Presentation-only scene art selected by the app layer. */
export interface EventSceneArtView {
  readonly backgroundAssetKey?: string;
  readonly decoration?: EventDecorationView;
}

export type EventSceneModel =
  | Readonly<EventSceneArtView & {
      eventId: string;
      title: string;
      description: string;
      pattern: 'A';
      choices: readonly EventChoiceView[];
    }>
  | Readonly<EventSceneArtView & {
      eventId: string;
      title: string;
      description: string;
      pattern: 'B';
      items: readonly EventPlacementItemView[];
      slots: readonly EventPlacementSlotView[];
      answerMapping: Readonly<Record<string, string>>;
      successRatio: number;
      partialRatio: number;
      placementResult?: PlacementScore;
    }>
  | Readonly<EventSceneArtView & {
      eventId: string;
      title: string;
      description: string;
      pattern: 'C';
      spots: readonly EventInvestigationSpotView[];
      attemptLimit: number;
      attemptsUsed: number;
      /** Per-attempt price, rendered so the player knows what a probe costs. */
      attemptCosts: readonly EventEffectView[];
    }>
  | Readonly<EventSceneArtView & {
      eventId: string;
      title: string;
      description: string;
      pattern: 'D';
      options: readonly EventTuningOptionView[];
      cards: readonly EventTuningCardView[];
      selectedOptionId?: string;
      selectedCardId?: string;
      /** Set when no owned card is eligible; the node pays out and moves on. */
      fallbackNotice?: string;
    }>
  | Readonly<EventSceneArtView & {
      eventId: string;
      title: string;
      description: string;
      pattern: 'E';
      topics: readonly EventCanvassTopicView[];
      attemptLimit: number;
      attemptsUsed: number;
      attemptCosts: readonly EventEffectView[];
    }>
  | Readonly<EventSceneArtView & {
      eventId: string;
      title: string;
      description: string;
      pattern: 'F';
      targets: readonly EventCollectTargetView[];
      attemptLimit: number;
      attemptsUsed: number;
      attemptCosts: readonly EventEffectView[];
    }>;

/** Exact route preload set. It never includes another event's art. */
export function eventSceneAssetKeys(model: EventSceneModel): readonly string[] {
  return [model.backgroundAssetKey, model.decoration?.assetKey].filter(
    (key): key is string => key !== undefined,
  );
}

export interface EventTuningOptionView {
  readonly optionId: string;
  readonly label: string;
  readonly costs: readonly EventEffectView[];
  readonly tuning: readonly EventEffectView[];
  readonly affordable: boolean;
  readonly blockedReason?: string;
  /** Owned card ids this option may be applied to. */
  readonly eligibleCardIds: readonly string[];
}

export interface EventTuningCardView {
  readonly cardId: string;
  readonly label: string;
  /** Tuning already banked on this card from earlier pattern D nodes. */
  readonly existingTuning: readonly EventEffectView[];
}

export interface EventCanvassTopicView {
  readonly topicId: string;
  readonly label: string;
  /** Payoff text, revealed only once the topic has been canvassed. */
  readonly reveal?: string;
  readonly canvassed: boolean;
  readonly affordable: boolean;
}

export interface EventCollectTargetView {
  readonly targetId: string;
  readonly label: string;
  readonly grade: string;
  readonly collected: boolean;
  /** True when the pouch already holds this evidence from another source. */
  readonly alreadyHeld: boolean;
  readonly affordable: boolean;
}

export interface PlacementScore {
  readonly correct: number;
  readonly total: number;
  readonly ratio: number;
  readonly result: 'SUCCESS' | 'PARTIAL' | 'FAILED';
}

export function placementResultLabel(result: PlacementScore['result']): string {
  switch (result) {
    case 'SUCCESS': return '성공';
    case 'PARTIAL': return '부분 성공';
    case 'FAILED': return '실패';
  }
}

export function scorePlacement(
  model: Extract<EventSceneModel, { pattern: 'B' }>,
  placement: Readonly<Record<string, string>>,
): PlacementScore {
  const entries = Object.entries(model.answerMapping);
  const correct = entries.filter(([itemId, slotId]) => placement[itemId] === slotId).length;
  const ratio = entries.length === 0 ? 0 : correct / entries.length;
  return {
    correct,
    total: entries.length,
    ratio,
    result: ratio >= model.successRatio ? 'SUCCESS' : ratio >= model.partialRatio ? 'PARTIAL' : 'FAILED',
  };
}

export function canInvestigate(
  model: Extract<EventSceneModel, { pattern: 'C' }>,
  spotId: string,
): boolean {
  return (
    model.attemptsUsed < model.attemptLimit &&
    model.spots.some((spot) => spot.spotId === spotId && !spot.discovered)
  );
}
