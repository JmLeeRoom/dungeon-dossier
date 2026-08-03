import type { FlagDefinition } from '../../src/engine/domain';
import {
  applyFlagSetHooks,
  createFlagStore,
  isFlagEnabled,
  resolveFlagEffects,
  withFlag,
  type FlagConsumeContext,
  type FlagSetContext,
} from '../../src/engine/run';

export const FLAG_SIMULATION_DOMAINS = [
  'INVESTIGATION',
  'COMBAT',
  'NON_COMBAT',
  'REWARD',
] as const;
export type FlagSimulationDomain = (typeof FLAG_SIMULATION_DOMAINS)[number];

export interface FlagSetProbe extends FlagSetContext {
  readonly domain: FlagSimulationDomain;
}

export interface FlagConsumeProbe extends FlagConsumeContext {
  readonly domain: FlagSimulationDomain;
}

export interface FlagSimulationCase {
  readonly definition: FlagDefinition;
  readonly setter: FlagSetProbe;
  readonly consumers: readonly FlagConsumeProbe[];
}

export interface FlagConsumerObservation {
  readonly domain: FlagSimulationDomain;
  readonly consumer_id: string;
  readonly effect_types: readonly string[];
}

export interface FlagSimulationScenario {
  readonly scenario_id: string;
  readonly flag_id: string;
  readonly enabled: boolean;
  readonly setter_domain: FlagSimulationDomain;
  readonly set_by_applied: boolean;
  readonly consumers: readonly FlagConsumerObservation[];
}

export interface FlagSimulationReport {
  readonly scenarios: readonly FlagSimulationScenario[];
  readonly set_domain_coverage: Readonly<Record<FlagSimulationDomain, number>>;
  readonly consume_domain_coverage: Readonly<Record<FlagSimulationDomain, number>>;
}

function emptyCoverage(): Record<FlagSimulationDomain, number> {
  return {
    INVESTIGATION: 0,
    COMBAT: 0,
    NON_COMBAT: 0,
    REWARD: 0,
  };
}

function observeConsumers(
  simulationCase: FlagSimulationCase,
  enabled: boolean,
): FlagSimulationScenario {
  const definition = simulationCase.definition;
  const disabledStore = withFlag(createFlagStore(), definition.flag_id, false);
  const setResult = enabled
    ? applyFlagSetHooks(createFlagStore(), [definition], simulationCase.setter)
    : { store: disabledStore, applied: [] };

  if (enabled) {
    if (
      !setResult.applied.some((application) => application.flag_id === definition.flag_id) ||
      !isFlagEnabled(setResult.store, definition.flag_id)
    ) {
      throw new Error(`set_by probe did not enable ${definition.flag_id}.`);
    }
  }

  const consumers = simulationCase.consumers.map((probe) => {
    const effects = resolveFlagEffects(setResult.store, [definition], probe);
    if (enabled && effects.length === 0) {
      throw new Error(
        `consumed_by probe ${probe.encounter} did not resolve ${definition.flag_id}.`,
      );
    }
    if (!enabled && effects.length > 0) {
      throw new Error(`Disabled flag ${definition.flag_id} produced an effect.`);
    }
    return {
      domain: probe.domain,
      consumer_id: probe.encounter,
      effect_types: effects.map((effect) => effect.apply.type),
    };
  });

  return {
    scenario_id: `${definition.flag_id}:${enabled ? 'ON' : 'OFF'}`,
    flag_id: definition.flag_id,
    enabled,
    setter_domain: simulationCase.setter.domain,
    set_by_applied: enabled,
    consumers,
  };
}

/** Runs exactly one OFF and one ON smoke scenario for each of 13 long-term flags. */
export function runFlagOnOffScenarios(
  cases: readonly FlagSimulationCase[],
): FlagSimulationReport {
  if (cases.length !== 13) {
    throw new Error(`Flag smoke simulation requires 13 definitions; received ${cases.length}.`);
  }
  const flagIds = cases.map((entry) => entry.definition.flag_id);
  if (new Set(flagIds).size !== flagIds.length) {
    throw new Error('Flag smoke simulation requires 13 unique flag IDs.');
  }

  const setCoverage = emptyCoverage();
  const consumeCoverage = emptyCoverage();
  const scenarios: FlagSimulationScenario[] = [];
  for (const simulationCase of cases) {
    if (simulationCase.consumers.length === 0) {
      throw new Error(`${simulationCase.definition.flag_id} has no consumed_by probe.`);
    }
    setCoverage[simulationCase.setter.domain] += 1;
    for (const consumer of simulationCase.consumers) {
      consumeCoverage[consumer.domain] += 1;
    }
    scenarios.push(
      observeConsumers(simulationCase, false),
      observeConsumers(simulationCase, true),
    );
  }

  for (const domain of FLAG_SIMULATION_DOMAINS) {
    if (setCoverage[domain] === 0 || consumeCoverage[domain] === 0) {
      throw new Error(`Flag smoke simulation has no set/consume coverage for ${domain}.`);
    }
  }

  return {
    scenarios,
    set_domain_coverage: setCoverage,
    consume_domain_coverage: consumeCoverage,
  };
}
