export interface EventEffectView {
  readonly label: string;
}

export interface EventChoiceView {
  readonly choiceId: string;
  readonly label: string;
  readonly costs: readonly EventEffectView[];
  readonly gains: readonly EventEffectView[];
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
}

export type EventSceneModel =
  | Readonly<{
      eventId: string;
      title: string;
      description: string;
      pattern: 'A';
      choices: readonly EventChoiceView[];
    }>
  | Readonly<{
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
  | Readonly<{
      eventId: string;
      title: string;
      description: string;
      pattern: 'C';
      spots: readonly EventInvestigationSpotView[];
      attemptLimit: number;
      attemptsUsed: number;
    }>;

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
