import { readFile } from 'node:fs/promises';
import { URL } from 'node:url';
import { describe, expect, it, vi } from 'vitest';
import {
  BalanceRepository,
  ContentValidationError,
  type FetchLike,
  type InvalidValidationReport,
} from '../../src/content-io';

const BALANCE_FILE = new URL('../../content/common/balance.json', import.meta.url);

async function balanceFixture(): Promise<Record<string, unknown>> {
  return JSON.parse(await readFile(BALANCE_FILE, 'utf8')) as Record<string, unknown>;
}

function fetchBalance(balance: unknown): FetchLike {
  return async (input) => {
    const path =
      typeof input === 'string'
        ? input
        : input instanceof URL
          ? input.pathname
          : new URL(input.url).pathname;
    return path === '/content/common/balance.json'
      ? new Response(JSON.stringify(balance), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        })
      : new Response('not found', { status: 404 });
  };
}

describe('BalanceRepository live tuning', () => {
  it('keeps a frozen disk snapshot and gives the tuner a detached draft', async () => {
    const repository = new BalanceRepository({
      fetcher: fetchBalance(await balanceFixture()),
    });

    const loaded = await repository.reload();

    expect(loaded).toBe(repository.current());
    expect(repository.diskSnapshot()).toBe(loaded);
    expect(repository.diffVsDisk()).toEqual({ status: 'IN_SYNC', entries: [] });
    expect(repository.hasUnsavedChanges()).toBe(false);
    expect(Object.isFrozen(loaded)).toBe(true);
    expect(Object.isFrozen(loaded?.dmg)).toBe(true);

    const draft = repository.createDraft();
    draft.dmg.contradict = 25;

    expect(draft).not.toBe(loaded);
    expect(repository.current().dmg.contradict).toBe(18);
  });

  it('reports deterministic leaf diffs without changing the disk snapshot', async () => {
    const disk = await balanceFixture();
    const partner = disk.partner as Record<string, unknown>;
    partner.cooldowns = { skill_one: 2 };
    const repository = new BalanceRepository({ fetcher: fetchBalance(disk) });
    await repository.reload();

    const draft = repository.createDraft();
    draft.dmg.contradict = 25;
    delete draft.partner.cooldowns.skill_one;
    draft.partner.cooldowns.skill_two = 3;
    draft.trust.thresholds[0] = 0;

    const applied = repository.applyInstantly(draft);

    expect(applied).toBe(repository.current());
    expect(repository.diskSnapshot()?.dmg.contradict).toBe(18);
    expect(repository.hasUnsavedChanges()).toBe(true);
    expect(repository.diffVsDisk()).toEqual({
      status: 'MODIFIED',
      entries: [
        {
          path: 'dmg.contradict',
          kind: 'CHANGED',
          diskValue: 18,
          currentValue: 25,
        },
        {
          path: 'partner.cooldowns.skill_one',
          kind: 'REMOVED',
          diskValue: 2,
          currentValue: undefined,
        },
        {
          path: 'partner.cooldowns.skill_two',
          kind: 'ADDED',
          diskValue: undefined,
          currentValue: 3,
        },
        {
          path: 'trust.thresholds[0]',
          kind: 'CHANGED',
          diskValue: 1,
          currentValue: 0,
        },
      ],
    });

    const exported = repository.exportJson();
    expect(exported?.endsWith('\n')).toBe(true);
    expect(JSON.parse(exported as string)).toEqual(repository.current());

    const exportOnlyDraft = repository.createDraft();
    exportOnlyDraft.dmg.contradict = 31;
    expect(
      (JSON.parse(repository.exportJson(exportOnlyDraft) as string) as {
        dmg: { contradict: number };
      }).dmg.contradict,
    ).toBe(31);
    expect(repository.current().dmg.contradict).toBe(25);

    await repository.reload();
    expect(repository.current().dmg.contradict).toBe(18);
    expect(repository.diffVsDisk()).toEqual({ status: 'IN_SYNC', entries: [] });
  });

  it('distinguishes a live value applied before any disk fetch', async () => {
    const repository = new BalanceRepository();

    expect(repository.applyInstantly(await balanceFixture())).toBeDefined();
    expect(repository.diskSnapshot()).toBeUndefined();
    expect(repository.diffVsDisk()).toEqual({ status: 'NO_SNAPSHOT', entries: [] });
    expect(repository.hasUnsavedChanges()).toBe(false);
  });

  it('keeps current and disk values atomic when an edit or export is invalid', async () => {
    const repository = new BalanceRepository({
      fetcher: fetchBalance(await balanceFixture()),
    });
    await repository.reload();
    const currentBefore = repository.current();
    const diskBefore = repository.diskSnapshot();
    const invalid = repository.createDraft();
    invalid.draw.initial = invalid.draw.handLimit + 1;

    expect(() => repository.applyInstantly(invalid)).toThrow(ContentValidationError);
    expect(() => repository.exportJson(invalid)).toThrow(ContentValidationError);
    expect(repository.current()).toBe(currentBefore);
    expect(repository.diskSnapshot()).toBe(diskBefore);
    expect(repository.diffVsDisk()).toEqual({ status: 'IN_SYNC', entries: [] });
  });

  it('reports invalid release-mode edits without replacing the live value', async () => {
    const reporter = vi.fn<(report: InvalidValidationReport) => void>();
    const repository = new BalanceRepository({
      fetcher: fetchBalance(await balanceFixture()),
      mode: 'release',
      reporter,
    });
    await repository.reload();
    const currentBefore = repository.current();
    const invalid = repository.createDraft();
    invalid.sweetSpot.min = invalid.sweetSpot.max + 1;

    expect(repository.applyInstantly(invalid)).toBeUndefined();
    expect(repository.exportJson(invalid)).toBeUndefined();
    expect(repository.current()).toBe(currentBefore);
    expect(reporter).toHaveBeenCalledTimes(2);
    expect(reporter.mock.calls.map(([report]) => report.source)).toEqual([
      '<live-balance>',
      '<balance-export>',
    ]);
  });
});
