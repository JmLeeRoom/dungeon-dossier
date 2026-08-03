import { performance } from 'node:perf_hooks';

import { describe, expect, it } from 'vitest';

import {
  ROUTE_MATRIX,
  SIMULATION_ARCHETYPES,
  SIMULATION_CATALOG,
  SIMULATION_OUTCOMES,
  simulateRoute,
  simulateRouteMatrix,
} from '../../tools/simulate/routeSimulator';

const EXPECTED_ARCHETYPES = [
  'SLIME',
  'HARPY',
  'MINOTAUR',
  'GOBLIN',
  'ORC',
  'SUCCUBUS',
  'DWARF',
  'CYCLOPS',
  'FALLEN_HERO',
] as const;

const EXPECTED_OUTCOMES = [
  'BEST_RESOLUTION',
  'COERCED_CONFESSION',
  'PARTIAL_RESOLUTION',
] as const;

function coordinate(archetype: string, outcome: string): string {
  return `${archetype}:${outcome}`;
}

describe('nightly 9 x 3 route matrix', () => {
  it('contains exactly the 27 unique archetype/outcome coordinates', () => {
    const actual = ROUTE_MATRIX.map((cell) =>
      coordinate(cell.archetype, cell.intendedOutcome),
    ).sort();
    const expected = EXPECTED_ARCHETYPES.flatMap((archetype) =>
      EXPECTED_OUTCOMES.map((outcome) => coordinate(archetype, outcome)),
    ).sort();

    expect(SIMULATION_ARCHETYPES).toEqual(EXPECTED_ARCHETYPES);
    expect(SIMULATION_OUTCOMES).toEqual(EXPECTED_OUTCOMES);
    expect(Object.keys(SIMULATION_CATALOG)).toHaveLength(9);
    expect(ROUTE_MATRIX).toHaveLength(27);
    expect(new Set(actual).size).toBe(27);
    expect(actual).toEqual(expected);
  });

  it('terminates every cell with its requested outcome and no step overrun', () => {
    const results = simulateRouteMatrix({ seed: 27 });

    expect(results).toHaveLength(27);
    for (const result of results) {
      expect(result.terminated, coordinate(result.archetype, result.intendedOutcome)).toBe(
        true,
      );
      expect(result.terminationReason).toBe('TERMINAL_OUTCOME');
      expect(result.outcome).toBe(result.intendedOutcome);
      expect(result.steps).toBeGreaterThan(0);
      expect(result.steps).toBeLessThanOrEqual(result.maxSteps);
      expect(result.judgmentLog).toHaveLength(result.steps);
    }
  });

  it.each(EXPECTED_ARCHETYPES)(
    '%s completes all three variants in under one second',
    (archetype) => {
      const startedAt = performance.now();
      const results = EXPECTED_OUTCOMES.map((outcome) =>
        simulateRoute(archetype, outcome, { seed: 1 }),
      );
      const elapsedMs = performance.now() - startedAt;

      expect(results.map((result) => result.outcome)).toEqual(
        EXPECTED_OUTCOMES,
      );
      expect(elapsedMs).toBeLessThan(1_000);
    },
  );

  it('completes the full sweep within the five-minute nightly budget', () => {
    const startedAt = performance.now();
    const results = simulateRouteMatrix({ seed: 5 });
    const elapsedMs = performance.now() - startedAt;

    expect(results.every((result) => result.terminated)).toBe(true);
    expect(elapsedMs).toBeLessThan(5 * 60 * 1_000);
  });

  it('is pure and byte-deterministic for the same seed and input policies', () => {
    const catalogBefore = JSON.stringify(SIMULATION_CATALOG);
    const first = simulateRouteMatrix({ seed: 4_242 });
    const second = simulateRouteMatrix({ seed: 4_242 });

    expect(second).toEqual(first);
    expect(second.map((result) => result.judgmentLogBytes)).toEqual(
      first.map((result) => result.judgmentLogBytes),
    );
    expect(JSON.stringify(SIMULATION_CATALOG)).toBe(catalogBefore);
  });
});
