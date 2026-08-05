import { performance } from 'node:perf_hooks';

import { describe, expect, it } from 'vitest';

import {
  SIMULATION_ARCHETYPES,
  getSimulationEncounter,
  simulateBestRoute,
  type SimulationAction,
} from '../../tools/simulate/routeSimulator';

describe('BEST reachability smoke policies', () => {
  it.each(SIMULATION_ARCHETYPES)(
    '%s completes its authored path through EncounterCoordinator and explicitly secures the statement',
    (archetype) => {
      const encounter = getSimulationEncounter(archetype);
      const startedAt = performance.now();
      const result = simulateBestRoute(archetype, { seed: 2_026 });
      const elapsedMs = performance.now() - startedAt;

      expect(result).toMatchObject({
        caseId: encounter.caseId,
        encounterId: encounter.encounterId,
        intendedOutcome: 'BEST_RESOLUTION',
        outcome: 'BEST_RESOLUTION',
        terminated: true,
        terminationReason: 'TERMINAL_OUTCOME',
        allRequiredObjectivesCompleted: true,
        bestUnlockObserved: true,
        explicitBestConfirmation: true,
        execution: 'ENCOUNTER_COORDINATOR',
      });
      expect(result.coordinatorJudgmentLogBytes).not.toBeNull();
      expect(result.completedObjectiveIds).toHaveLength(
        encounter.objectives.required.length,
      );
      expect(result.steps).toBeGreaterThan(encounter.objectives.required.length);
      expect(result.steps).toBe(result.inputSequence.length);
      expect(result.steps).toBeLessThanOrEqual(result.maxSteps);
      expect(elapsedMs).toBeLessThan(1_000);

      const submissions = result.inputSequence.filter(
        (
          action,
        ): action is Extract<SimulationAction, Readonly<{ kind: 'SUBMIT' }>> =>
          action.kind === 'SUBMIT' &&
          action.resolutionCode === 'R_DIRECT_CONTRADICTION',
      );
      expect(submissions.length).toBeGreaterThanOrEqual(
        encounter.objectives.required.length,
      );
      expect(
        new Set(submissions.map((action) => action.objectiveId)).size,
      ).toBe(encounter.objectives.required.length);
      for (const path of encounter.proofPaths) {
        expect(submissions).toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              objectiveId: path.objectiveId,
              claimId: path.claimId,
              proofRuleId: path.proofRuleId,
              cardId: path.cardId,
              evidenceIds: path.evidenceIds,
            }),
          ]),
        );
      }
      for (const submission of submissions) {
        expect(submission.cardId).not.toBe('');
        expect(submission.tagId).not.toBe('');
        expect(submission.claimId).not.toBe('');
        expect(submission.proofRuleId).not.toBe('');
        expect(submission.evidenceIds.length).toBeGreaterThan(0);
      }
      expect(
        result.judgmentLog
          .filter((step) => step.actionKind === 'SUBMIT')
          .every(
            (step) =>
              step.cardId !== undefined &&
              step.resolutionCode !== undefined &&
              step.commandPoints !== undefined &&
              step.commandPoints >= 0 &&
              step.handCardIds !== undefined,
          ),
      ).toBe(true);
      expect(result.inputSequence.some((action) => action.kind === 'END_TURN')).toBe(
        true,
      );
      expect(result.coordinatorJudgmentLogBytes).toContain('"SUBMIT"');
      expect(result.coordinatorJudgmentLogBytes).toContain('"END_TURN"');
      expect(result.coordinatorJudgmentLogBytes).toContain(
        '"SECURE_STATEMENT"',
      );

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
      const composureBeforeConfirmation = result.judgmentLog.at(-2)?.composure;
      expect(composureBeforeConfirmation).toBeGreaterThanOrEqual(
        encounter.sweetSpot.min,
      );
      expect(composureBeforeConfirmation).toBeLessThanOrEqual(
        encounter.sweetSpot.max,
      );
    },
  );

  it('replays every BEST route to byte-identical judgment logs', () => {
    for (const archetype of SIMULATION_ARCHETYPES) {
      const first = simulateBestRoute(archetype, { seed: 77 });
      const replay = simulateBestRoute(archetype, { seed: 77 });

      expect(replay.inputSequence).toEqual(first.inputSequence);
      expect(replay.judgmentLogBytes).toBe(first.judgmentLogBytes);
      expect(replay.coordinatorJudgmentLogBytes).toBe(
        first.coordinatorJudgmentLogBytes,
      );
    }
  });

  it('uses authored inquiry routes while cycling the real card deck', () => {
    const results = SIMULATION_ARCHETYPES.map((archetype) =>
      simulateBestRoute(archetype, { seed: 91 }),
    );
    const submittedRouteIds = results.flatMap((result) =>
      result.inputSequence.flatMap((action) =>
        action.kind === 'SUBMIT' && action.routeId !== undefined
          ? [action.routeId]
          : [],
      ),
    );

    expect(submittedRouteIds.length).toBeGreaterThan(0);
    expect(
      results.every(
        (result) =>
          result.modifierActivationCount >= 0 &&
          result.coordinatorJudgmentLogBytes !== null,
      ),
    ).toBe(true);
  });
});
