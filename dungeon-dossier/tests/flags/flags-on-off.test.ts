import { readFileSync } from 'node:fs';
import { describe, expect, expectTypeOf, it } from 'vitest';
import {
  FlagsSchema,
  type Effect,
  type FlagDefinition,
} from '../../src/engine/domain';
import {
  assertFlowDefinition,
  type FlowNode,
  type FlowRuntimeState,
} from '../../src/engine/encounter/FlowRunner';
import {
  FLAG_SIMULATION_DOMAINS,
  runFlagOnOffScenarios,
  type FlagSetProbe,
  type FlagSimulationCase,
  type FlagSimulationDomain,
} from '../../tools/simulate/flagSimulator';

const SET_DOMAINS: readonly FlagSimulationDomain[] = [
  'COMBAT', 'INVESTIGATION', 'NON_COMBAT', 'REWARD',
  'INVESTIGATION', 'COMBAT', 'NON_COMBAT', 'REWARD',
  'INVESTIGATION', 'COMBAT', 'NON_COMBAT', 'REWARD',
  'INVESTIGATION',
];

const CONSUME_DOMAINS: readonly FlagSimulationDomain[] = [
  'COMBAT', 'NON_COMBAT', 'REWARD', 'INVESTIGATION',
  'NON_COMBAT', 'REWARD', 'INVESTIGATION', 'COMBAT',
  'REWARD', 'INVESTIGATION', 'COMBAT', 'NON_COMBAT',
  'COMBAT',
];

function unreachable(value: never): never {
  throw new Error(`Unexpected flag simulation domain: ${String(value)}`);
}

function setterData(
  domain: FlagSimulationDomain,
  index: number,
): Readonly<{
  hook: FlagDefinition['set_by'][number];
  probe: FlagSetProbe;
}> {
  const suffix = index.toString();
  switch (domain) {
    case 'INVESTIGATION': {
      const event = `investigation-event-${suffix}`;
      return { hook: { event, value: true }, probe: { domain, event } };
    }
    case 'COMBAT': {
      const encounter = `combat-source-${suffix}`;
      const outcome = index === 1 ? 'FALSE_CONFESSION' : 'RESOLVED';
      return {
        hook: { encounter, outcome, value: true },
        probe: { domain, encounter, outcome },
      };
    }
    case 'NON_COMBAT': {
      const choice = `non-combat-choice-${suffix}`;
      return { hook: { choice, value: true }, probe: { domain, choice } };
    }
    case 'REWARD': {
      const event = `reward-event-${suffix}`;
      return { hook: { event, value: true }, probe: { domain, event } };
    }
    default:
      return unreachable(domain);
  }
}

function effectFor(domain: FlagSimulationDomain, index: number): Effect {
  const suffix = index.toString();
  switch (domain) {
    case 'INVESTIGATION':
      return { type: 'OPEN_ROUTE', target: `route-unlock-${suffix}` };
    case 'COMBAT':
      return { type: 'MODIFY_SHIELDS', target: `shield-target-${suffix}`, delta: 1 };
    case 'NON_COMBAT':
      return { type: 'ADJUST_RESOURCE', resource: 'trust', delta: 1 };
    case 'REWARD':
      return { type: 'ADJUST_RESOURCE', resource: 'dp', delta: 2 };
    default:
      return unreachable(domain);
  }
}

function createSimulationCase(index: number): FlagSimulationCase {
  const flagId = `F-${index.toString().padStart(2, '0')}`;
  const setDomain = SET_DOMAINS[index - 1];
  const consumeDomain = CONSUME_DOMAINS[index - 1];
  if (setDomain === undefined || consumeDomain === undefined) {
    throw new RangeError(`No simulation domains configured for flag ${flagId}.`);
  }
  const setter = setterData(setDomain, index);
  const consumerId = `${consumeDomain.toLowerCase()}-consumer-${index.toString()}`;
  const definition: FlagDefinition = {
    flag_id: flagId,
    description_key: `flag.${index.toString()}.description`,
    default_value: false,
    set_by: [setter.hook],
    consumed_by: [{
      encounter: consumerId,
      condition: { type: 'FLAG_EQUALS', flag_id: flagId, value: true },
      apply: effectFor(consumeDomain, index),
    }],
  };
  return {
    definition,
    setter: setter.probe,
    consumers: [{ domain: consumeDomain, encounter: consumerId }],
  };
}

const FLAG_CASES = Array.from({ length: 13 }, (_, index) =>
  createSimulationCase(index + 1),
);

describe('13 long-term flags on/off smoke matrix', () => {
  it('runs exactly 26 scenarios through declarative set_by and consumed_by links', () => {
    expect(() => FlagsSchema.parse({
      schema_version: '1.0',
      flags: FLAG_CASES.map((entry) => entry.definition),
    })).not.toThrow();

    const report = runFlagOnOffScenarios(FLAG_CASES);
    expect(report.scenarios).toHaveLength(26);

    for (const simulationCase of FLAG_CASES) {
      const flagScenarios = report.scenarios.filter(
        (scenario) => scenario.flag_id === simulationCase.definition.flag_id,
      );
      expect(flagScenarios.map((scenario) => scenario.enabled).sort()).toEqual([false, true]);

      const disabled = flagScenarios.find((scenario) => !scenario.enabled);
      const enabled = flagScenarios.find((scenario) => scenario.enabled);
      expect(disabled?.set_by_applied).toBe(false);
      expect(disabled?.consumers.every((consumer) => consumer.effect_types.length === 0))
        .toBe(true);
      expect(enabled?.set_by_applied).toBe(true);
      expect(enabled?.consumers.flatMap((consumer) => consumer.effect_types)).toEqual([
        simulationCase.definition.consumed_by[0]?.apply.type,
      ]);
    }
  });

  it('covers investigation, combat, non-combat, and reward linkage from data', () => {
    const report = runFlagOnOffScenarios(FLAG_CASES);
    for (const domain of FLAG_SIMULATION_DOMAINS) {
      expect(report.set_domain_coverage[domain]).toBeGreaterThan(0);
      expect(report.consume_domain_coverage[domain]).toBeGreaterThan(0);
    }

    const falseConfession = report.scenarios.find(
      (scenario) => scenario.flag_id === 'F-01' && scenario.enabled,
    );
    expect(falseConfession?.consumers[0]).toMatchObject({
      domain: 'COMBAT',
      effect_types: ['MODIFY_SHIELDS'],
    });
  });

  it('keeps long-term flags outside encounter-internal Flow branching', () => {
    expectTypeOf<FlowRuntimeState>().not.toHaveProperty('flags');
    const flagGatedNode: FlowNode = {
      node_id: 'flag-gated-flow-node',
      enter_conditions: [{ type: 'FLAG_EQUALS', flag_id: 'F-01', value: true }],
      reveal_claim_ids: [],
      revise_claim_ids: [],
      open_route_ids: [],
      activate_modifiers: [],
      deactivate_modifiers: [],
      reaction_key: 'reaction.flag-gated',
      resource_delta: {},
      is_terminal: true,
    };
    expect(() => assertFlowDefinition([flagGatedNode])).toThrow(/progress-based/u);
  });

  it('contains no concrete flag ID branch in the engine flag store', () => {
    const source = readFileSync(
      new URL('../../src/engine/run/FlagStore.ts', import.meta.url),
      'utf8',
    );
    expect(source).not.toMatch(/\bF-(?:0[1-9]|1[0-3])\b/u);
  });
});
