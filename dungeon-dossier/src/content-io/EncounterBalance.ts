import type { BalanceDefinition, EncounterDefinition } from './schemas';

export type EncounterResources = EncounterDefinition['resources'];

/**
 * Resolves encounter resources at the runtime data boundary. A matching
 * balance override deliberately wins over overlapping case.json values.
 */
export function resolveEncounterResources(
  balance: BalanceDefinition,
  encounterId: string,
  caseResources: EncounterResources,
): EncounterResources {
  const override = balance.overrides.byEncounter[encounterId];
  if (override === undefined) return { ...caseResources };

  return {
    composure_max: override.composureMax ?? caseResources.composure_max,
    cp_per_turn: override.cpPerTurn ?? caseResources.cp_per_turn,
    cp_max: override.cpMax ?? caseResources.cp_max,
    coercion_limit: override.coercionLimit ?? caseResources.coercion_limit,
    shields_per_round: override.shieldsPerRound ?? caseResources.shields_per_round,
  };
}
