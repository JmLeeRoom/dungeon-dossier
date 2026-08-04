import { readFile } from 'node:fs/promises';

import { beforeAll, describe, expect, it } from 'vitest';

import {
  CaseSchema,
  FlagsSchema,
  type CaseDefinition,
  type FlagDefinition,
  type FlagsDefinition,
} from '../../src/engine/domain';
import {
  applyFlagSetHooks,
  createFlagStore,
  resolveFlagEffects,
} from '../../src/engine/run/FlagStore';

const CASE_DIRECTORIES = ['tutorial', 'ep001', 'ep004'] as const;
type CaseDirectory = (typeof CASE_DIRECTORIES)[number];

interface LoadedCase {
  readonly directory: CaseDirectory;
  readonly definition: CaseDefinition;
}

let loadedCases: readonly LoadedCase[];
let flagCatalogue: FlagsDefinition;

async function loadJson(relativePath: string): Promise<unknown> {
  const source = await readFile(
    new URL(`../../content/${relativePath}`, import.meta.url),
    'utf8',
  );
  return JSON.parse(source) as unknown;
}

function hooks(): readonly FlagDefinition[] {
  return loadedCases.flatMap(({ definition }) => definition.flag_hooks);
}

beforeAll(async () => {
  loadedCases = await Promise.all(
    CASE_DIRECTORIES.map(async (directory) => ({
      directory,
      definition: CaseSchema.parse(
        await loadJson(`cases/${directory}/case.json`),
      ),
    })),
  );
  flagCatalogue = FlagsSchema.parse(await loadJson('common/flags.json'));
});

describe('real-content long-term flag links', () => {
  it('authors at least two hooks per case and six unique live flags overall', () => {
    for (const loaded of loadedCases) {
      expect(loaded.definition.flag_hooks.length).toBeGreaterThanOrEqual(2);
    }

    const definitions = hooks();
    const uniqueFlagIds = new Set(
      definitions.map((definition) => definition.flag_id),
    );
    expect(definitions.length).toBeGreaterThanOrEqual(6);
    expect(uniqueFlagIds.size).toBeGreaterThanOrEqual(6);

    for (const flagId of uniqueFlagIds) {
      const definitionsForFlag = definitions.filter(
        (definition) => definition.flag_id === flagId,
      );
      expect(
        definitionsForFlag.flatMap((definition) => definition.set_by).length,
      ).toBeGreaterThan(0);
      expect(
        definitionsForFlag.flatMap((definition) => definition.consumed_by)
          .length,
      ).toBeGreaterThan(0);
    }
  });

  it('copies each selected hook from the canonical common flag catalogue', () => {
    for (const definition of hooks()) {
      const canonical = flagCatalogue.flags.find(
        (candidate) => candidate.flag_id === definition.flag_id,
      );
      expect(canonical).toBeDefined();
      expect(definition).toEqual(canonical);
    }
  });

  it('resolves every encounter, event, and choice reference to real content', () => {
    const encounterCase = new Map<string, CaseDirectory>();
    const eventCase = new Map<string, CaseDirectory>();
    const choiceEvent = new Map<string, string>();

    for (const loaded of loadedCases) {
      for (const encounter of loaded.definition.encounters) {
        encounterCase.set(encounter.encounter_id, loaded.directory);
      }
      for (const event of loaded.definition.events_noncombat) {
        eventCase.set(event.event_id, loaded.directory);
        const choices = event.pattern === 'A' ? event.choices : [];
        for (const choice of choices) {
          choiceEvent.set(choice.choice_id, event.event_id);
        }
      }
    }

    for (const definition of hooks()) {
      for (const setter of definition.set_by) {
        if (setter.encounter !== undefined) {
          expect(encounterCase.has(setter.encounter)).toBe(true);
        }
        if (setter.event !== undefined) {
          expect(eventCase.has(setter.event)).toBe(true);
        }
        if (setter.choice !== undefined) {
          expect(choiceEvent.has(setter.choice)).toBe(true);
          if (setter.event !== undefined) {
            expect(choiceEvent.get(setter.choice)).toBe(setter.event);
          }
        }
      }
      for (const consumer of definition.consumed_by) {
        expect(encounterCase.has(consumer.encounter)).toBe(true);
      }
    }
  });

  it('contains direct tutorial-to-EP001 and EP001-to-EP004 links', () => {
    const ownerByEncounter = new Map<string, CaseDirectory>();
    for (const loaded of loadedCases) {
      for (const encounter of loaded.definition.encounters) {
        ownerByEncounter.set(encounter.encounter_id, loaded.directory);
      }
    }

    const crossCaseLinks = hooks().flatMap((definition) =>
      definition.set_by.flatMap((setter) => {
        const sourceEncounter = setter.encounter;
        return sourceEncounter === undefined
          ? []
          : definition.consumed_by.map((consumer) => ({
              flagId: definition.flag_id,
              from: ownerByEncounter.get(sourceEncounter),
              to: ownerByEncounter.get(consumer.encounter),
            }));
      }),
    );

    expect(
      crossCaseLinks.some(
        (link) =>
          link.flagId === 'F-06' &&
          link.from === 'tutorial' &&
          link.to === 'ep001',
      ),
    ).toBe(true);
    expect(
      crossCaseLinks.some(
        (link) =>
          link.flagId === 'F-11' &&
          link.from === 'ep001' &&
          link.to === 'ep004',
      ),
    ).toBe(true);
  });

  it('sets and consumes the direct F-06 cross-case link through FlagStore', () => {
    const definitions = hooks();
    const setResult = applyFlagSetHooks(
      createFlagStore(),
      definitions,
      {
        encounter: 'enc_tutorial_minotaur',
        outcome: 'BEST_RESOLUTION',
      },
    );
    expect(setResult.store['F-06']).toBe(true);

    const effects = resolveFlagEffects(setResult.store, definitions, {
      encounter: 'enc_ep001_goblin',
    });
    expect(effects).toHaveLength(1);
    expect(effects[0]?.flag_id).toBe('F-06');
    expect(effects[0]?.apply).toEqual({
      type: 'ADJUST_RESOURCE',
      resource: 'cp',
      delta: 1,
    });
  });
});
