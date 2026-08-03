import { readFile } from 'node:fs/promises';
import { URL } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  validateContentFiles,
  type ToolContentFile,
} from '../../src/content-io/ToolContentValidator';

const CONTENT_ROOT = new URL('../../content/', import.meta.url);

async function contentFile(relativePath: string): Promise<ToolContentFile> {
  const source = await readFile(new URL(relativePath, CONTENT_ROOT), 'utf8');
  return { relativePath, value: JSON.parse(source) as unknown };
}

async function fixtureBundle(): Promise<ToolContentFile[]> {
  return Promise.all([
    contentFile('common/cards.json'),
    contentFile('common/balance.json'),
    contentFile('cases/tutorial/case.json'),
    contentFile('cases/tutorial/dialogue.json'),
  ]);
}

describe('tools/validate Zod and Tier-1 bridge', () => {
  it('accepts the checked-in minimal content bundle', async () => {
    expect(validateContentFiles(await fixtureBundle())).toEqual([]);
  });

  it('reports cross-file and case reference failures', async () => {
    const files = await fixtureBundle();
    const cards = files.find((file) => file.relativePath === 'common/cards.json');
    const caseFile = files.find((file) => file.relativePath.endsWith('/case.json'));
    if (!cards || !caseFile) throw new Error('Fixture bundle is incomplete.');

    const cardsData = cards.value as Record<string, unknown>;
    cardsData.initial_deck = ['missing-card'];
    const caseData = caseFile.value as Record<string, unknown>;
    const encounters = caseData.encounters as Record<string, unknown>[];
    if (!encounters[0]) throw new Error('Fixture must have one encounter.');
    encounters[0].target_entity = 'missing-entity';

    const problems = validateContentFiles(files);
    expect(problems.some((problem) => problem.message.includes('missing-card'))).toBe(true);
    expect(problems.some((problem) => problem.message.includes('missing-entity'))).toBe(true);
  });

  it('rejects JSON content files without a registered schema', () => {
    const problems = validateContentFiles([
      { relativePath: 'common/unknown.json', value: {} },
    ]);
    expect(problems).toHaveLength(1);
    expect(problems[0]?.message).toContain('SCHEMA_NOT_REGISTERED');
  });
});
