import type {
  CutsceneDefinition,
  CutsceneTiming,
  Effect,
  NonCombatEventDefinition,
} from '../engine/domain';
import type {
  CutsceneBeatView,
  CutsceneSelection,
  PresentationTreatment,
} from '../ui/screens/cutscene';
import { t } from './i18n';
import {
  cutsceneBackgroundAssetKey,
  cutscenePortraitAssetKey,
} from './uiAssetBindings';

/**
 * Engine treatments and presentation treatments are separate vocabularies on
 * purpose (the UI cannot import engine schemas). This exhaustive switch is the
 * single crossing point, so a new authored treatment fails to compile here
 * rather than silently rendering as NONE.
 */
function toPresentationTreatment(
  treatment: CutsceneDefinition['beats'][number]['treatment'],
): PresentationTreatment {
  switch (treatment) {
    case 'NONE': return 'NONE';
    case 'FADE_IN': return 'FADE_IN';
    case 'FADE_OUT': return 'FADE_OUT';
    case 'SHAKE': return 'SHAKE';
    case 'FLASH': return 'FLASH';
    case 'SLOW_FADE': return 'SLOW_FADE';
  }
}

export function toCutsceneBeatViews(
  cutscene: CutsceneDefinition,
): readonly CutsceneBeatView[] {
  return cutscene.beats.map((beat) => {
    const backgroundAssetKey = cutsceneBackgroundAssetKey(
      beat.beat_id,
      beat.background_asset_key,
    );
    return {
      beatId: beat.beat_id,
      ...(backgroundAssetKey === undefined ? {} : { backgroundAssetKey }),
      portraits: beat.portraits.map((portrait) => ({
        side: portrait.side,
        assetKey: cutscenePortraitAssetKey(portrait.asset_key),
        dim: portrait.dim,
      })),
      ...(beat.speaker_name_key === undefined
        ? {}
        : { speakerName: t(beat.speaker_name_key) }),
      text: t(beat.text_key),
      treatment: toPresentationTreatment(beat.treatment),
      ...(beat.audio_cue === undefined ? {} : { audioCue: beat.audio_cue }),
      durationMs: beat.duration_ms,
      choices: beat.choices.map((choice) => ({
        choiceId: choice.choice_id,
        label: t(choice.label_key),
      })),
      // Skip needs a default branch it can take without asking the player.
      ...(beat.choices[0] === undefined
        ? {}
        : { defaultChoiceId: beat.choices[0].choice_id }),
    };
  });
}

/** Exact asset set for one authored cutscene, suitable for route preload. */
export function cutscenePresentationAssetKeys(
  cutscene: CutsceneDefinition,
): readonly string[] {
  return [
    ...new Set(
      toCutsceneBeatViews(cutscene).flatMap((beat) => [
        ...(beat.backgroundAssetKey === undefined ? [] : [beat.backgroundAssetKey]),
        ...beat.portraits.map((portrait) => portrait.assetKey),
      ]),
    ),
  ];
}

export function cutsceneForTiming(
  event: NonCombatEventDefinition,
  timing: CutsceneTiming,
): CutsceneDefinition | undefined {
  return event.cutscenes.find((cutscene) => cutscene.timing === timing);
}

export interface CutsceneChoiceOutcome {
  readonly flags: Readonly<Record<string, boolean | number | string>>;
  readonly gains: readonly Effect[];
}

/**
 * Collapses the branches a cutscene took into one payload. A cutscene commits
 * through the same run-layer path as a pattern A choice, so its consequences
 * obey the same flag-hook precedence.
 */
export function collectCutsceneOutcome(
  cutscene: CutsceneDefinition,
  selections: readonly CutsceneSelection[],
): CutsceneChoiceOutcome {
  const flags: Record<string, boolean | number | string> = {};
  const gains: Effect[] = [];
  for (const selection of selections) {
    const beat = cutscene.beats.find((candidate) => candidate.beat_id === selection.beatId);
    const choice = beat?.choices.find(
      (candidate) => candidate.choice_id === selection.choiceId,
    );
    if (choice === undefined) continue;
    for (const [flagId, value] of Object.entries(choice.sets_flags)) {
      if (
        typeof value === 'boolean' ||
        typeof value === 'string' ||
        (typeof value === 'number' && Number.isFinite(value))
      ) {
        flags[flagId] = value;
      }
    }
    gains.push(...choice.gains);
  }
  return { flags, gains };
}
