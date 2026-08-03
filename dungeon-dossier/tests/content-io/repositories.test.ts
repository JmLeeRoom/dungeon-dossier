import { readFile } from 'node:fs/promises';
import { fileURLToPath, URL } from 'node:url';
import { describe, expect, it, vi } from 'vitest';
import {
  BalanceRepository,
  CardRepository,
  CaseRepository,
  ContentValidationError,
  FallbackRepository,
  RunStripRepository,
  type FetchLike,
  type InvalidValidationReport,
} from '../../src/content-io';

const CONTENT_ROOT = new URL('../../content/', import.meta.url);

async function fixture(relativePath: string): Promise<unknown> {
  const source = await readFile(new URL(relativePath, CONTENT_ROOT), 'utf8');
  return JSON.parse(source) as unknown;
}

function fetchFixtures(entries: Readonly<Record<string, unknown>>): FetchLike {
  return async (input) => {
    const path =
      typeof input === 'string'
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
}

describe('content repositories', () => {
  it('loads case, card, balance, run-strip, and fallback JSON through the fetch boundary', async () => {
    const caseData = await fixture('cases/tutorial/case.json');
    const cards = await fixture('common/cards.json');
    const balance = await fixture('common/balance.json');
    const dialogue = await fixture('cases/tutorial/dialogue.json');
    const runStrip = await fixture('common/run-strip.json');
    const fetcher = fetchFixtures({
      '/content/cases/tutorial/case.json': caseData,
      '/content/common/cards.json': cards,
      '/content/common/balance.json': balance,
      '/content/cases/tutorial/dialogue.json': dialogue,
      '/content/common/run-strip.json': runStrip,
    });

    const loadedCase = await new CaseRepository({
      fetcher,
      externalIds: new Set(),
    }).load('tutorial');
    const loadedCards = await new CardRepository({ fetcher }).load();
    const balanceRepository = new BalanceRepository({ fetcher });
    const loadedBalance = await balanceRepository.reload();
    const loadedDialogue = await new FallbackRepository({ fetcher }).load('tutorial');
    const loadedRunStrip = await new RunStripRepository({ fetcher }).load();

    expect(loadedCase?.case_id).toBe('case_tutorial');
    expect(loadedCards?.cards).toHaveLength(14);
    expect(loadedBalance?.dmg.contradict).toBe(18);
    expect(balanceRepository.current()).toBe(loadedBalance);
    expect(loadedDialogue?.statements.clm_tutorial_who?.fallback).toHaveLength(1);
    expect(loadedRunStrip?.nodes).toHaveLength(15);
  });

  it('applies validated balance edits immediately without another fetch', async () => {
    const balance = await fixture('common/balance.json');
    const repository = new BalanceRepository();
    const edited = structuredClone(balance) as Record<string, unknown>;
    const damage = (edited.dmg ?? {}) as Record<string, unknown>;
    damage.contradict = 25;

    expect(repository.applyInstantly(edited)?.dmg.contradict).toBe(25);
    expect(repository.current().dmg.contradict).toBe(25);
  });

  it('throws on Tier-1 failure in development and skips with a report in release', async () => {
    const caseData = structuredClone(
      (await fixture('cases/tutorial/case.json')) as Record<string, unknown>,
    );
    const encounters = caseData.encounters as Record<string, unknown>[];
    if (!encounters[0]) throw new Error('Fixture must have one encounter.');
    encounters[0].target_entity = 'missing-entity';
    const fetcher = fetchFixtures({
      '/content/cases/tutorial/case.json': caseData,
    });

    await expect(
      new CaseRepository({ fetcher, externalIds: new Set() }).load('tutorial'),
    ).rejects.toBeInstanceOf(ContentValidationError);

    const reporter = vi.fn<(report: InvalidValidationReport) => void>();
    await expect(
      new CaseRepository({
        fetcher,
        externalIds: new Set(),
        mode: 'release',
        reporter,
      }).load('tutorial'),
    ).resolves.toBeUndefined();
    expect(reporter).toHaveBeenCalledOnce();
    expect(reporter.mock.calls[0]?.[0].issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: 'UNRESOLVED_REFERENCE',
          referenceId: 'missing-entity',
        }),
      ]),
    );
  });

  it('resolves fixture paths relative to this test module', () => {
    expect(fileURLToPath(CONTENT_ROOT)).toContain('content');
  });
});
