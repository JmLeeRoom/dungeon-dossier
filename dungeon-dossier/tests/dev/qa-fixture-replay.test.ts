import { describe, expect, it } from 'vitest';
import {
  QA_FIXTURE_NUMBERS,
  replayAllQaFixtures,
  replayQaFixture,
} from '../../src/dev/qa';

describe('development QA fixture replay', () => {
  it('replays all twelve canonical fixtures through the production resolver', () => {
    const reports = replayAllQaFixtures();
    expect(reports.map((item) => item.fixture)).toEqual(QA_FIXTURE_NUMBERS);
    expect(reports).toHaveLength(12);
  });

  it('reports all five lookup axes for every resolution step', () => {
    for (const fixture of replayAllQaFixtures()) {
      expect(fixture.resolutions.length).toBeGreaterThan(0);
      for (const resolution of fixture.resolutions) {
        expect(Object.keys(resolution.axes).sort()).toEqual([
          'hypotheses',
          'independence',
          'relation',
          'relevance',
          'sufficiency',
        ]);
      }
    }
  });

  it('keeps both stages of the Grade-B and final cross-check fixtures', () => {
    expect(replayQaFixture(8).resolutions.map((step) => step.code)).toEqual([
      'R_INDIRECT_SUSPICION',
      'R_DIRECT_CONTRADICTION',
    ]);
    expect(replayQaFixture(12).resolutions.map((step) => step.code)).toEqual([
      'R_INSUFFICIENT_GROUNDS',
      'R_DIRECT_CONTRADICTION',
    ]);
  });

  it('proves the destroyed path fails while an alternate path remains solvable', () => {
    const replay = replayQaFixture(10);
    expect(replay.resolutions.map((step) => step.code)).toEqual([
      'R_INSUFFICIENT_GROUNDS',
      'R_DIRECT_CONTRADICTION',
    ]);
    expect(replay.solvablePath).toBe(true);
  });

  it('represents short-circuited SILENCE axes explicitly as null', () => {
    expect(replayQaFixture(9).resolutions[0]?.axes).toEqual({
      relevance: null,
      relation: null,
      sufficiency: null,
      independence: null,
      hypotheses: null,
    });
  });
});
