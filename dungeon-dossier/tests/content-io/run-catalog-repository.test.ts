import { readFile } from 'node:fs/promises';
import { URL } from 'node:url';
import { describe, expect, it } from 'vitest';
import { RunCatalogRepository, type FetchLike } from '../../src/content-io';

async function fixture(relativePath: string): Promise<unknown> {
  return JSON.parse(
    await readFile(new URL(`../../content/${relativePath}`, import.meta.url), 'utf8'),
  ) as unknown;
}

describe('run catalogue repository', () => {
  it('loads flags, grades, and rewards as one validated boundary', async () => {
    const entries: Readonly<Record<string, unknown>> = {
      '/content/common/flags.json': await fixture('common/flags.json'),
      '/content/common/grades.json': await fixture('common/grades.json'),
      '/content/common/rewards.json': await fixture('common/rewards.json'),
    };
    const fetcher: FetchLike = async (input) => {
      const path = typeof input === 'string'
        ? input
        : input instanceof URL
          ? input.pathname
          : new URL(input.url).pathname;
      const value = entries[path];
      return value === undefined
        ? new Response('not found', { status: 404 })
        : new Response(JSON.stringify(value), {
            status: 200,
            headers: { 'content-type': 'application/json' },
          });
    };

    const catalogue = await new RunCatalogRepository({ fetcher }).load();

    expect(catalogue?.flags.flags).toHaveLength(13);
    expect(catalogue?.grades.grades.map((grade) => grade.grade)).toEqual([
      'S', 'A', 'B', 'C', 'D', 'F',
    ]);
    expect(catalogue?.rewards.selection).toEqual({
      battle_choices: 3,
      boss_choices: 2,
    });
  });
});
