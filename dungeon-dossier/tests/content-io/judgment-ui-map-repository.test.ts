import { readFile } from 'node:fs/promises';
import { describe, expect, it, vi } from 'vitest';

import { JudgmentUiMapRepository } from '../../src/content-io';

async function realJudgmentUiMap(): Promise<unknown> {
  return JSON.parse(
    await readFile(
      new URL('../../content/common/judgment-ui-map.json', import.meta.url),
      'utf8',
    ),
  ) as unknown;
}

function jsonResponse(body: unknown): Response {
  return {
    ok: true,
    status: 200,
    json: async () => body,
  } as unknown as Response;
}

describe('judgment UI map repository', () => {
  it('loads and validates the shipped map from its canonical URL', async () => {
    const document = await realJudgmentUiMap();
    const fetcher = vi.fn(async () => jsonResponse(document));
    const repository = new JudgmentUiMapRepository({ fetcher });

    const loaded = await repository.load();

    expect(fetcher).toHaveBeenCalledWith('/content/common/judgment-ui-map.json');
    expect(loaded?.schema_version).toBe('1.0');
    expect(loaded?.resolution_codes.R_DIRECT_CONTRADICTION).toEqual({
      label_key: 'judgment.direct.label',
      feedback_key: 'judgment.direct.feedback',
      category: 'DIRECT_CONTRADICTION',
    });
    expect(Object.keys(loaded?.proof_scopes ?? {})).toHaveLength(11);
    expect(Object.keys(loaded?.facets ?? {})).toHaveLength(6);
  });

  it('returns undefined instead of throwing when the file is missing', async () => {
    const fetcher = vi.fn(
      async () => ({ ok: false, status: 404, json: async () => undefined }) as unknown as Response,
    );
    const repository = new JudgmentUiMapRepository({
      fetcher,
      mode: 'release',
      reporter: () => undefined,
    });

    await expect(repository.load()).resolves.toBeUndefined();
  });

  it('rejects a map whose irrelevant-evidence feedback duplicates insufficient grounds', async () => {
    const document = (await realJudgmentUiMap()) as {
      resolution_codes: Record<string, { feedback_key: string }>;
    };
    const duplicated = {
      ...document,
      resolution_codes: {
        ...document.resolution_codes,
        R_IRRELEVANT_EVIDENCE: {
          ...document.resolution_codes['R_IRRELEVANT_EVIDENCE'],
          feedback_key: document.resolution_codes['R_INSUFFICIENT_GROUNDS']?.feedback_key,
        },
      },
    };
    const repository = new JudgmentUiMapRepository({
      fetcher: async () => jsonResponse(duplicated),
      mode: 'release',
      reporter: () => undefined,
    });

    await expect(repository.load()).resolves.toBeUndefined();
  });
});
