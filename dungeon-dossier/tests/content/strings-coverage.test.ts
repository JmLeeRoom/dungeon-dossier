import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { beforeAll, describe, expect, it } from 'vitest';

import { StringsSchema, type StringsDefinition } from '../../src/engine/domain';

const CONTENT_ROOT = fileURLToPath(new URL('../../content/', import.meta.url));

const LOCALIZATION_KEY_FIELDS = [
  'title_key',
  'label_key',
  'slot_label_key',
  'description_key',
  'display_name_key',
  'name_key',
  'feedback_key',
  'missing_feedback_key',
] as const;

const RAW_KEY_PATTERN = /^[a-z0-9_]+\.[a-z0-9_.]+$/u;

const REQUIRED_CONTENT_FILES = [
  'cases/tutorial/case.json',
  'common/judgment-ui-map.json',
  'common/rewards.json',
  'common/run-strip.json',
  'common/strings.ko.json',
] as const;

let table: StringsDefinition;
let referencedKeys: ReadonlySet<string>;
let rewardIds: readonly string[];
let runStripRefs: readonly string[];
let objectiveIds: readonly string[];
let eventDescriptionKeys: readonly (string | undefined)[];
let contentPaths: readonly string[];
let technicalIds: ReadonlySet<string>;

async function loadContentJson(relativePath: string): Promise<unknown> {
  const source = await readFile(
    new URL(`../../content/${relativePath}`, import.meta.url),
    'utf8',
  );
  return JSON.parse(source) as unknown;
}

async function discoverJsonFiles(
  directory = CONTENT_ROOT,
  prefix = '',
): Promise<readonly string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const discovered = await Promise.all(entries.map(async (entry) => {
    const relativePath = prefix === '' ? entry.name : `${prefix}/${entry.name}`;
    if (entry.isDirectory()) {
      return discoverJsonFiles(path.join(directory, entry.name), relativePath);
    }
    return entry.isFile() && entry.name.endsWith('.json') ? [relativePath] : [];
  }));
  return discovered.flat().sort();
}

function collectKeyFields(value: unknown, destination: Set<string>): void {
  if (Array.isArray(value)) {
    for (const entry of value) collectKeyFields(entry, destination);
    return;
  }
  if (value === null || typeof value !== 'object') return;
  for (const [field, entry] of Object.entries(value)) {
    if (
      (LOCALIZATION_KEY_FIELDS as readonly string[]).includes(field) &&
      typeof entry === 'string'
    ) {
      destination.add(entry);
      continue;
    }
    collectKeyFields(entry, destination);
  }
}

function collectTechnicalIds(value: unknown, destination: Set<string>): void {
  if (Array.isArray(value)) {
    for (const entry of value) collectTechnicalIds(entry, destination);
    return;
  }
  if (value === null || typeof value !== 'object') return;
  for (const [field, entry] of Object.entries(value)) {
    if (
      typeof entry === 'string' &&
      (/(?:^|_)id$/u.test(field) || field === 'ref')
    ) {
      destination.add(entry);
    } else if (Array.isArray(entry) && /(?:^|_)ids$/u.test(field)) {
      for (const id of entry) {
        if (typeof id === 'string') destination.add(id);
      }
    }
    collectTechnicalIds(entry, destination);
  }
}

beforeAll(async () => {
  contentPaths = await discoverJsonFiles();
  const contentByPath = new Map<string, unknown>(await Promise.all(
    contentPaths.map(async (relativePath) => [
      relativePath,
      await loadContentJson(relativePath),
    ] as const),
  ));
  table = StringsSchema.parse(contentByPath.get('common/strings.ko.json'));

  const keys = new Set<string>();
  const ids = new Set<string>();
  for (const value of contentByPath.values()) {
    collectKeyFields(value, keys);
    collectTechnicalIds(value, ids);
  }
  referencedKeys = keys;
  technicalIds = ids;

  const caseContents = [...contentByPath.entries()]
    .filter(([relativePath]) => /^cases\/[^/]+\/case\.json$/u.test(relativePath))
    .map(([, value]) => value);

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

  const rewards = contentByPath.get('common/rewards.json') as {
    readonly rewards: readonly { readonly reward_id: string }[];
  };
  rewardIds = rewards.rewards.map((reward) => reward.reward_id);

  const runStrip = contentByPath.get('common/run-strip.json') as {
    readonly nodes: readonly { readonly ref: string }[];
  };
  runStripRefs = runStrip.nodes.map((node) => node.ref);
});

describe('Korean string table coverage', () => {
  it('recursively discovers content JSON files and parses the Korean table', () => {
    expect(contentPaths.length).toBeGreaterThan(0);
    expect(contentPaths).toEqual(expect.arrayContaining([...REQUIRED_CONTENT_FILES]));
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
    expect(eventDescriptionKeys.length).toBeGreaterThan(0);
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

  it('never substitutes a technical content identifier as localized display text', () => {
    expect(technicalIds.size).toBeGreaterThan(0);
    const leaked = Object.entries(table.strings).filter(([, value]) =>
      technicalIds.has(value),
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
