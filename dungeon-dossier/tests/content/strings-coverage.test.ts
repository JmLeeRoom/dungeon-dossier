import { readFile } from 'node:fs/promises';

import { beforeAll, describe, expect, it } from 'vitest';

import { StringsSchema, type StringsDefinition } from '../../src/engine/domain';

const CASE_FILES = [
  'cases/tutorial/case.json',
  'cases/ep001/case.json',
  'cases/ep004/case.json',
] as const;

const CATALOGUE_FILES = [
  'common/cards.json',
  'common/flags.json',
  'common/relics.json',
  'common/enhancements.json',
  'common/grades.json',
  'common/judgment-ui-map.json',
] as const;

const KEY_FIELDS = [
  'title_key',
  'label_key',
  'slot_label_key',
  'description_key',
  'display_name_key',
  'name_key',
] as const;

const RAW_KEY_PATTERN = /^[a-z0-9_]+\.[a-z0-9_.]+$/u;

let table: StringsDefinition;
let referencedKeys: ReadonlySet<string>;
let rewardIds: readonly string[];
let runStripRefs: readonly string[];
let objectiveIds: readonly string[];
let eventDescriptionKeys: readonly (string | undefined)[];

async function loadContentJson(relativePath: string): Promise<unknown> {
  const source = await readFile(
    new URL(`../../content/${relativePath}`, import.meta.url),
    'utf8',
  );
  return JSON.parse(source) as unknown;
}

function collectKeyFields(value: unknown, destination: Set<string>): void {
  if (Array.isArray(value)) {
    for (const entry of value) collectKeyFields(entry, destination);
    return;
  }
  if (value === null || typeof value !== 'object') return;
  for (const [field, entry] of Object.entries(value)) {
    if (
      (KEY_FIELDS as readonly string[]).includes(field) &&
      typeof entry === 'string'
    ) {
      destination.add(entry);
      continue;
    }
    collectKeyFields(entry, destination);
  }
}

beforeAll(async () => {
  table = StringsSchema.parse(await loadContentJson('common/strings.ko.json'));

  const keys = new Set<string>();
  const caseContents: unknown[] = [];
  for (const file of CASE_FILES) {
    const value = await loadContentJson(file);
    caseContents.push(value);
    collectKeyFields(value, keys);
  }
  for (const file of CATALOGUE_FILES) {
    collectKeyFields(await loadContentJson(file), keys);
  }
  referencedKeys = keys;

  const cases = caseContents as readonly {
    readonly encounters: readonly {
      readonly objectives: Readonly<{
        readonly required: readonly { readonly objective_id: string }[];
        readonly optional: readonly { readonly objective_id: string }[];
      }>;
    }[];
    readonly events_noncombat: readonly { readonly description_key?: string }[];
  }[];
  objectiveIds = cases.flatMap((caseDefinition) =>
    caseDefinition.encounters.flatMap((encounter) => [
      ...encounter.objectives.required,
      ...encounter.objectives.optional,
    ].map((objective) => objective.objective_id)),
  );
  eventDescriptionKeys = cases.flatMap((caseDefinition) =>
    caseDefinition.events_noncombat.map((event) => event.description_key),
  );

  const rewards = (await loadContentJson('common/rewards.json')) as {
    readonly rewards: readonly { readonly reward_id: string }[];
  };
  rewardIds = rewards.rewards.map((reward) => reward.reward_id);

  const runStrip = (await loadContentJson('common/run-strip.json')) as {
    readonly nodes: readonly { readonly ref: string }[];
  };
  runStripRefs = runStrip.nodes.map((node) => node.ref);
});

describe('Korean string table coverage', () => {
  it('parses content/common/strings.ko.json with StringsSchema', () => {
    expect(table.locale).toBe('ko');
    expect(Object.keys(table.strings).length).toBeGreaterThan(0);
  });

  it('covers every display localization key referenced by cases and catalogues', () => {
    expect(referencedKeys.size).toBeGreaterThan(0);
    const missing = [...referencedKeys].filter(
      (key) => table.strings[key] === undefined,
    );
    expect(missing).toEqual([]);
  });

  it('covers reward titles and descriptions for every reward', () => {
    expect(rewardIds.length).toBeGreaterThan(0);
    const missing = rewardIds.flatMap((rewardId) =>
      ['title', 'desc']
        .map((suffix) => `reward.${rewardId}.${suffix}`)
        .filter((key) => table.strings[key] === undefined),
    );
    expect(missing).toEqual([]);
  });

  it('covers every interrogation objective label', () => {
    const missing = objectiveIds
      .map((objectiveId) => `objective.${objectiveId}`)
      .filter((key) => table.strings[key] === undefined);
    expect(missing).toEqual([]);
  });

  it('authors a covered description_key for every non-combat event', () => {
    expect(eventDescriptionKeys).toHaveLength(7);
    expect(eventDescriptionKeys).not.toContain(undefined);
    const missing = eventDescriptionKeys.filter(
      (key) => key === undefined || table.strings[key] === undefined,
    );
    expect(missing).toEqual([]);
  });

  it('covers node.<ref> for every run-strip node', () => {
    expect(runStripRefs.length).toBeGreaterThan(0);
    const missing = runStripRefs.filter(
      (ref) => table.strings[`node.${ref}`] === undefined,
    );
    expect(missing).toEqual([]);
  });

  it('never leaks a raw dotted key as display text', () => {
    const leaked = Object.entries(table.strings).filter(([, value]) =>
      RAW_KEY_PATTERN.test(value),
    );
    expect(leaked).toEqual([]);
  });

  it('covers every judgment-ui-map feedback, scope, and missing key', async () => {
    const source = await readFile(
      new URL('../../content/common/judgment-ui-map.json', import.meta.url),
      'utf8',
    );
    const dottedKeys = [...source.matchAll(/"([a-z0-9_]+\.[a-z0-9_.]+)"/gu)]
      .map((match) => match[1])
      .filter((key): key is string =>
        key !== undefined && !key.endsWith('.json') && key !== '1.0',
      );
    expect(dottedKeys.length).toBeGreaterThan(0);
    const missing = [...new Set(dottedKeys)].filter(
      (key) => table.strings[key] === undefined,
    );
    expect(missing).toEqual([]);
  });
});
