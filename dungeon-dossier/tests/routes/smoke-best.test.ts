import { performance } from 'node:perf_hooks';

import { describe, expect, it } from 'vitest';

import {
  SIMULATION_ARCHETYPES,
  SIMULATION_CATALOG,
  simulateBestRoute,
} from '../../tools/simulate/routeSimulator';

describe('BEST reachability smoke policies', () => {
  it.each(SIMULATION_ARCHETYPES)(
    '%s completes a shortest solving path and explicitly secures the statement',
    (archetype) => {
      const encounter = SIMULATION_CATALOG[archetype];
      const policy = encounter.policies.BEST_RESOLUTION;
      const startedAt = performance.now();
      const result = simulateBestRoute(archetype, { seed: 2_026 });
      const elapsedMs = performance.now() - startedAt;

      expect(result).toMatchObject({
        intendedOutcome: 'BEST_RESOLUTION',
        outcome: 'BEST_RESOLUTION',
        terminated: true,
        terminationReason: 'TERMINAL_OUTCOME',
        allRequiredObjectivesCompleted: true,
        bestUnlockObserved: true,
        explicitBestConfirmation: true,
      });
      expect(result.completedObjectiveIds).toHaveLength(
        encounter.objectives.required.length,
      );
      expect(result.steps).toBe(encounter.objectives.required.length + 1);
      expect(result.steps).toBe(policy.actions.length);
      expect(elapsedMs).toBeLessThan(1_000);

      const submissions = policy.actions.filter(
        (action) => action.kind === 'SUBMIT',
      );
      expect(submissions).toHaveLength(encounter.objectives.required.length);
      expect(
        new Set(submissions.map((action) => action.objectiveId)).size,
      ).toBe(encounter.objectives.required.length);
      for (const submission of submissions) {
        expect(submission.cardId).not.toBe('');
        expect(submission.tagId).not.toBe('');
        expect(submission.evidenceIds.length).toBeGreaterThan(0);
      }

      const unlockedAt = result.judgmentLog.findIndex(
        (step) =>
          step.secureStatementEnabled && step.terminalOutcome === null,
      );
      const confirmationAt = result.judgmentLog.findIndex(
        (step) => step.secureStatementRequested,
      );
      expect(unlockedAt).toBeGreaterThanOrEqual(0);
      expect(confirmationAt).toBeGreaterThan(unlockedAt);
      expect(result.judgmentLog.at(-1)).toMatchObject({
        actionKind: 'SECURE_STATEMENT',
        secureStatementRequested: true,
        terminalOutcome: 'BEST_RESOLUTION',
      });
    },
  );

  it('replays every BEST route to byte-identical judgment logs', () => {
    for (const archetype of SIMULATION_ARCHETYPES) {
      const first = simulateBestRoute(archetype, { seed: 77 });
      const replay = simulateBestRoute(archetype, { seed: 77 });

      expect(replay.inputSequence).toEqual(first.inputSequence);
      expect(replay.judgmentLogBytes).toBe(first.judgmentLogBytes);
    }
  });
});
