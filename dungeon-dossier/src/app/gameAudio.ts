import type { BgmId, SoundId } from '../audio';
import type { OutcomeCode, ResolutionCode } from '../dto';
import type { EncounterOutcome, OutcomeEvaluation } from '../engine/encounter';
import {
  directionForOutcome,
  directionForResolution,
  type EndingDirectionKey,
  type JudgmentDirectionKey,
} from '../ui/screens/interrogation/directionTable';

/** Structural port: cue routing owns no Howler instance or global state. */
export interface GameAudioPort {
  play(id: SoundId): boolean;
  playBgm(id: BgmId): boolean;
  mute(): void;
}

export const AUDIO_SCENES = ['INTERROGATION', 'BOSS', 'AMBIENT', 'ENDING'] as const;
export type AudioScene = (typeof AUDIO_SCENES)[number];

const OUTCOME_PRESENTATION_CODES = {
  BEST_RESOLUTION: 'O_FULL_STATEMENT',
  PARTIAL_RESOLUTION: 'O_ARREST',
  COERCED_CONFESSION: 'O_COERCED_CONFESSION',
  FAILED: 'O_OVERWORK',
} satisfies Readonly<Record<EncounterOutcome, OutcomeCode>>;

export const SCENE_BGM_CUES = {
  INTERROGATION: 'bgm_interrogation',
  BOSS: 'bgm_boss',
  AMBIENT: 'bgm_ambient',
  ENDING: 'bgm_ending',
} satisfies Readonly<Record<AudioScene, BgmId>>;

type AudioAction = (audio: GameAudioPort) => boolean;

function play(id: SoundId): AudioAction {
  return (audio) => audio.play(id);
}

const OUTCOME_AUDIO_CUES = {
  ENDING_POLAROID: play('sting_confession'),
  ENDING_TRANSFER_STAMP: play('sting_arrest'),
  ENDING_BGM_MUTE: (audio) => {
    audio.mute();
    return true;
  },
  ENDING_CARD_AND_KNOCK: play('knock_triple'),
  ENDING_OVERWORK: () => false,
} satisfies Readonly<Record<EndingDirectionKey, AudioAction>>;

const RESOLUTION_AUDIO_CUES = {
  JUDGMENT_DIRECT: play('shield_break'),
  JUDGMENT_SUSPICION: play('card_snap'),
  JUDGMENT_INSUFFICIENT: play('paper_flip'),
  JUDGMENT_TRUTH_ATTACK: play('shield_break'),
  JUDGMENT_IRRELEVANT: play('paper_flip'),
} satisfies Readonly<Record<JudgmentDirectionKey, AudioAction>>;

export const QTE_AUDIO_CUES = {
  SUCCESS: 'qte_success',
  FAIL: 'qte_fail',
} satisfies Readonly<Record<'SUCCESS' | 'FAIL', SoundId>>;
export type QteAudioResult = keyof typeof QTE_AUDIO_CUES;

export function outcomeCodeForEvaluation(evaluation: OutcomeEvaluation): OutcomeCode {
  const outcome = evaluation.terminalOutcome;
  if (outcome === null) throw new Error('A non-terminal outcome has no ending treatment.');
  if (outcome === 'FAILED' && evaluation.reason === 'COERCION_LIMIT_EXCEEDED') {
    return 'O_COUNSEL_INTERVENTION';
  }
  return OUTCOME_PRESENTATION_CODES[outcome];
}

export function cueScene(audio: GameAudioPort, scene: AudioScene): boolean {
  return audio.playBgm(SCENE_BGM_CUES[scene]);
}

/** Outcome codes are converted through the declarative direction table first. */
export function cueOutcome(audio: GameAudioPort, outcome: OutcomeCode): boolean {
  return OUTCOME_AUDIO_CUES[directionForOutcome(outcome)](audio);
}

/** Resolution codes are converted through the declarative direction table first. */
export function cueResolution(audio: GameAudioPort, resolution: ResolutionCode): boolean {
  return RESOLUTION_AUDIO_CUES[directionForResolution(resolution)](audio);
}

export function cueQte(audio: GameAudioPort, result: QteAudioResult): boolean {
  return audio.play(QTE_AUDIO_CUES[result]);
}
