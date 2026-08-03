import { performance } from 'node:perf_hooks';

import { describe, expect, it } from 'vitest';

import {
  ROUTE_MATRIX,
  SIMULATION_ARCHETYPES,
  SIMULATION_CATALOG,
  SIMULATION_ENCOUNTER_MAP,
  SIMULATION_OUTCOMES,
  simulateRoute,
  simulateRouteMatrix,
} from '../../tools/simulate/routeSimulator';

const EXPECTED_OUTCOMES = [
  'BEST_RESOLUTION',
  'COERCED_CONFESSION',
  'PARTIAL_RESOLUTION',
] as const;

const EXPECTED_AUTHORED_ENCOUNTERS = [
  { caseId: 'case_tutorial', encounterId: 'enc_tutorial_slime' },
  { caseId: 'case_tutorial', encounterId: 'enc_tutorial_harpy' },
  { caseId: 'case_tutorial', encounterId: 'enc_tutorial_minotaur' },
  { caseId: 'case_ep001_red_ledger', encounterId: 'enc_ep001_goblin' },
  { caseId: 'case_ep001_red_ledger', encounterId: 'enc_ep001_orc' },
  { caseId: 'case_ep001_red_ledger', encounterId: 'enc_ep001_succubus' },
  { caseId: 'case_ep004_midnight_express', encounterId: 'enc_ep004_dwarf' },
  { caseId: 'case_ep004_midnight_express', encounterId: 'enc_ep004_cyclops' },
  {
    caseId: 'case_ep004_midnight_express',
    encounterId: 'enc_ep004_fallen_hero',
  },
] as const;

function encounterCoordinate(caseId: string, encounterId: string): string {
  return `${caseId}/${encounterId}`;
}

function matrixCoordinate(
  caseId: string,
  encounterId: string,
  outcome: string,
): string {
  return `${encounterCoordinate(caseId, encounterId)}:${outcome}`;
}

describe('nightly 9 x 3 route matrix', () => {
  it('contains exactly the 27 authored encounter/outcome coordinates', () => {
    const actual = ROUTE_MATRIX.map((cell) =>
      matrixCoordinate(cell.caseId, cell.encounterId, cell.intendedOutcome),
    ).sort();
    const expected = EXPECTED_AUTHORED_ENCOUNTERS.flatMap((encounter) =>
      EXPECTED_OUTCOMES.map((outcome) =>
        matrixCoordinate(encounter.caseId, encounter.encounterId, outcome),
      ),
    ).sort();

    expect(SIMULATION_ARCHETYPES).toHaveLength(
      EXPECTED_AUTHORED_ENCOUNTERS.length,
    );
    expect(new Set(SIMULATION_ARCHETYPES).size).toBe(
      EXPECTED_AUTHORED_ENCOUNTERS.length,
    );
    expect(SIMULATION_OUTCOMES).toEqual(EXPECTED_OUTCOMES);
    expect(Object.keys(SIMULATION_CATALOG)).toHaveLength(
      EXPECTED_AUTHORED_ENCOUNTERS.length,
    );
    expect(
      Object.values(SIMULATION_ENCOUNTER_MAP)
        .map((encounter) =>
          encounterCoordinate(encounter.caseId, encounter.encounterId),
        )
        .sort(),
    ).toEqual(
      EXPECTED_AUTHORED_ENCOUNTERS.map((encounter) =>
        encounterCoordinate(encounter.caseId, encounter.encounterId),
      ).sort(),
    );
    expect(ROUTE_MATRIX).toHaveLength(27);
    expect(new Set(actual).size).toBe(27);
    expect(actual).toEqual(expected);
    for (const cell of ROUTE_MATRIX) {
      expect({ caseId: cell.caseId, encounterId: cell.encounterId }).toEqual(
        SIMULATION_ENCOUNTER_MAP[cell.archetype],
      );
    }
  });

  it('derives resources, objectives, cards, and proof paths from parsed case data', () => {
    for (const archetype of SIMULATION_ARCHETYPES) {
      const encounter = SIMULATION_CATALOG[archetype];
      expect(
        EXPECTED_AUTHORED_ENCOUNTERS.map((candidate) =>
          encounterCoordinate(candidate.caseId, candidate.encounterId),
        ),
      ).toContain(
        encounterCoordinate(encounter.caseId, encounter.encounterId),
      );
      expect(encounter.composureMax).toBeGreaterThan(0);
      expect(encounter.commandPointsPerTurn).toBeGreaterThanOrEqual(0);
      expect(encounter.proofPaths).toHaveLength(encounter.objectives.required.length);
      expect(encounter.guaranteedObjectiveIds).toEqual(
        encounter.objectives.required.map((objective) => objective.objective_id),
      );
      expect(encounter.alternatePath.length).toBeGreaterThan(0);
      for (const path of encounter.proofPaths) {
        expect(path.claimId).toMatch(/^clm_/u);
        expect(path.proofRuleId).toMatch(/^rule_/u);
        expect(path.cardId).toMatch(/^card_/u);
        expect(path.evidenceIds.length).toBeGreaterThan(0);
        expect(path.evidenceIds.every((evidenceId) => evidenceId.startsWith('ev_'))).toBe(
          true,
        );
      }
      expect(JSON.stringify(encounter)).not.toContain('sim.');
    }
  });

  it('terminates every cell with its requested outcome and no step overrun', () => {
    const results = simulateRouteMatrix({ seed: 27 });

    expect(results).toHaveLength(27);
    for (const result of results) {
      expect(
        result.terminated,
        matrixCoordinate(
          result.caseId,
          result.encounterId,
          result.intendedOutcome,
        ),
      ).toBe(true);
      expect(result.terminationReason).toBe('TERMINAL_OUTCOME');
      expect(result.outcome).toBe(result.intendedOutcome);
      expect({ caseId: result.caseId, encounterId: result.encounterId }).toEqual(
        SIMULATION_ENCOUNTER_MAP[result.archetype],
      );
      expect(result.steps).toBeGreaterThan(0);
      expect(result.steps).toBeLessThanOrEqual(result.maxSteps);
      expect(result.judgmentLog).toHaveLength(result.steps);
      expect(result.execution).toBe(
        result.intendedOutcome === 'BEST_RESOLUTION'
          ? 'ENCOUNTER_COORDINATOR'
          : 'OUTCOME_EVALUATOR',
      );
    }
  });

  it.each(SIMULATION_ARCHETYPES)(
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
