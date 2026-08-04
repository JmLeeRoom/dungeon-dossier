import { describe, expect, it, vi } from 'vitest';
import {
  AUDIO_SCENES,
  SCENE_BGM_CUES,
  cueOutcome,
  cueQte,
  cueResolution,
  cueScene,
  outcomeCodeForEvaluation,
  type GameAudioPort,
} from '../../src/app/gameAudio';
import type { EncounterOutcome, OutcomeEvaluation } from '../../src/engine/encounter';

function createAudioSpy(): {
  readonly audio: GameAudioPort;
  readonly play: ReturnType<typeof vi.fn>;
  readonly playBgm: ReturnType<typeof vi.fn>;
  readonly mute: ReturnType<typeof vi.fn>;
} {
  const play = vi.fn(() => true);
  const playBgm = vi.fn(() => true);
  const mute = vi.fn();
  return { audio: { play, playBgm, mute }, play, playBgm, mute };
}

function terminalOutcome(
  terminalOutcome: EncounterOutcome,
  reason: OutcomeEvaluation['reason'],
): OutcomeEvaluation {
  return {
    terminalOutcome,
    terminal: true,
    bestResolution: { conditionsMet: false, secureStatementEnabled: false },
    reason,
  };
}

describe('game audio cue routing', () => {
  it('maps every terminal outcome treatment, including counsel versus overwork', () => {
    expect(outcomeCodeForEvaluation(
      terminalOutcome('BEST_RESOLUTION', 'BEST_CONFIRMED'),
    )).toBe('O_FULL_STATEMENT');
    expect(outcomeCodeForEvaluation(
      terminalOutcome('PARTIAL_RESOLUTION', 'TURN_LIMIT_REACHED'),
    )).toBe('O_ARREST');
    expect(outcomeCodeForEvaluation(
      terminalOutcome('COERCED_CONFESSION', 'COMPOSURE_DEPLETED'),
    )).toBe('O_COERCED_CONFESSION');
    expect(outcomeCodeForEvaluation(
      terminalOutcome('FAILED', 'COERCION_LIMIT_EXCEEDED'),
    )).toBe('O_COUNSEL_INTERVENTION');
    expect(outcomeCodeForEvaluation(
      terminalOutcome('FAILED', 'STRESS_DEPLETED'),
    )).toBe('O_OVERWORK');
  });

  it('routes every scene to its declared BGM using only the injected port', () => {
    const { audio, playBgm } = createAudioSpy();
    for (const scene of AUDIO_SCENES) {
      expect(cueScene(audio, scene)).toBe(true);
      expect(playBgm).toHaveBeenLastCalledWith(SCENE_BGM_CUES[scene]);
    }
  });

  it('handles ENDING_BGM_MUTE as exactly one mute and no playback', () => {
    const { audio, play, playBgm, mute } = createAudioSpy();

    expect(cueOutcome(audio, 'O_COERCED_CONFESSION')).toBe(true);
    expect(mute).toHaveBeenCalledOnce();
    expect(play).not.toHaveBeenCalled();
    expect(playBgm).not.toHaveBeenCalled();
  });

  it('routes the remaining outcome directions without code-specific branching', () => {
    const { audio, play, mute } = createAudioSpy();

    expect(cueOutcome(audio, 'O_FULL_STATEMENT')).toBe(true);
    expect(play).toHaveBeenLastCalledWith('sting_confession');
    expect(cueOutcome(audio, 'O_ARREST')).toBe(true);
    expect(play).toHaveBeenLastCalledWith('sting_arrest');
    expect(cueOutcome(audio, 'O_COUNSEL_INTERVENTION')).toBe(true);
    expect(play).toHaveBeenLastCalledWith('knock_triple');
    expect(cueOutcome(audio, 'O_OVERWORK')).toBe(false);
    expect(mute).not.toHaveBeenCalled();
  });

  it('routes resolution directions and QTE outcomes to SFX', () => {
    const { audio, play } = createAudioSpy();

    expect(cueResolution(audio, 'R_DIRECT_CONTRADICTION')).toBe(true);
    expect(play).toHaveBeenLastCalledWith('shield_break');
    expect(cueResolution(audio, 'R_INDIRECT_SUSPICION')).toBe(true);
    expect(play).toHaveBeenLastCalledWith('card_snap');
    expect(cueResolution(audio, 'R_INSUFFICIENT_GROUNDS')).toBe(true);
    expect(play).toHaveBeenLastCalledWith('paper_flip');
    expect(cueResolution(audio, 'R_TRUTH_ATTACKED')).toBe(true);
    expect(play).toHaveBeenLastCalledWith('shield_break');
    expect(cueResolution(audio, 'R_IRRELEVANT_EVIDENCE')).toBe(true);
    expect(play).toHaveBeenLastCalledWith('paper_flip');

    expect(cueQte(audio, 'SUCCESS')).toBe(true);
    expect(play).toHaveBeenLastCalledWith('qte_success');
    expect(cueQte(audio, 'FAIL')).toBe(true);
    expect(play).toHaveBeenLastCalledWith('qte_fail');
  });
});
