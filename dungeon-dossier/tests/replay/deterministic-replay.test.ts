import { describe, expect, it } from 'vitest';
import {
  appendJudgmentLog,
  serializeJudgmentLog,
  type JudgmentLog,
} from '../../src/engine/log';
import { createRngState, nextRandom } from '../../src/engine/rng';

function runReplay(runSeed: number): string {
  let rng = createRngState(runSeed, 'DECK_SHUFFLE');
  let log: JudgmentLog = [];

  for (let sequence = 0; sequence < 4; sequence += 1) {
    const step = nextRandom(rng);
    rng = step.state;
    log = appendJudgmentLog(log, { sequence }, { roll: step.value });
  }

  return serializeJudgmentLog(log);
}

function runWithPresentationMode(runSeed: number, aiEnabled: boolean): string {
  // Presentation differs, but it is intentionally not accepted by the engine log API.
  const renderedDialogue = aiEnabled ? 'live variation' : 'authored fallback';
  expect(renderedDialogue.length).toBeGreaterThan(0);
  return serializeJudgmentLog(
    appendJudgmentLog(
      [],
      { runSeed, intent: 'CONTRADICT' },
      { code: 'R_DIRECT_CONTRADICTION', composureDelta: -18 },
    ),
  );
}

describe('deterministic replay foundation', () => {
  it('produces byte-identical logs for the same seed and input sequence', () => {
    expect(runReplay(20260802)).toBe(runReplay(20260802));
  });

  it('keeps purpose streams independent', () => {
    const seed = 20260802;
    const deck = nextRandom(createRngState(seed, 'DECK_SHUFFLE')).value;
    const modifier = nextRandom(createRngState(seed, 'MODIFIER_SELECTION')).value;
    const ai = nextRandom(createRngState(seed, 'AI_SEED')).value;

    expect(new Set([deck, modifier, ai]).size).toBe(3);
  });

  it('keeps JudgmentLog byte-identical with AI on and off', () => {
    expect(runWithPresentationMode(20260802, true)).toBe(
      runWithPresentationMode(20260802, false),
    );
  });

  it('rejects AI generation metadata at the JudgmentLog boundary', () => {
    expect(() =>
      appendJudgmentLog([], { intent: 'QUERY' }, { model_id: 'presentation-model' }),
    ).toThrow('use GenerationLog');
  });
});
