import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import {
  assetKeyFromFileName,
  hasRuntimeExtension,
  isNhnAssetKey,
  isRuntimeAssetKey,
} from '../../tools/assets/assetKey.mjs';
import {
  compareWorkbook,
  importNhnAssets,
  sourcePathViolation,
  validateAllowlist,
} from '../../tools/assets/import-nhn-assets.mjs';
import { parseAssetFilename } from '../../src/ui/core/assetRegistry';

const ALLOWLIST_PATH = fileURLToPath(
  new URL('../../tools/assets/nhn-png-allowlist.json', import.meta.url),
);

interface AllowlistEntry {
  readonly workbookRow: number;
  readonly sourcePath: string;
  readonly targetPath: string;
  readonly key: string;
  readonly width: number;
  readonly height: number;
  readonly sha256: string;
}

interface Allowlist {
  readonly entries: readonly AllowlistEntry[];
  readonly blockedPathSegments: readonly string[];
  readonly blockedExtensions: readonly string[];
  readonly requiredExtension: string;
  readonly expectedSourcePngCount: {
    readonly adopted: number;
    readonly excludedInScannedTree: number;
    readonly totalInScannedTree: number;
  };
  readonly expectedCategoryCounts: Readonly<Record<string, number>>;
  readonly workbookKeyNormalizations: readonly {
    readonly workbookRow: number;
    readonly fileName: string;
    readonly canonical: string;
  }[];
}

async function loadAllowlist(): Promise<Allowlist> {
  return JSON.parse(await readFile(ALLOWLIST_PATH, 'utf8')) as Allowlist;
}

describe('NHN asset allowlist', () => {
  it('accounts for every PNG in the delivery: 93 = 72 adopted + 21 excluded', async () => {
    const allowlist = await loadAllowlist();
    expect(allowlist.expectedSourcePngCount).toEqual({
      adopted: 72,
      excludedInScannedTree: 21,
      totalInScannedTree: 93,
    });
    expect(
      allowlist.expectedSourcePngCount.adopted +
        allowlist.expectedSourcePngCount.excludedInScannedTree,
    ).toBe(allowlist.expectedSourcePngCount.totalInScannedTree);
    expect(allowlist.entries).toHaveLength(72);
    expect(allowlist.expectedCategoryCounts).toEqual({
      characters: 20,
      background: 13,
      ui: 39,
    });
    expect(validateAllowlist(allowlist)).toEqual([]);
  });

  it('routes each file to exactly one target with no key or path collision', async () => {
    const { entries } = await loadAllowlist();
    const unique = (values: readonly string[]): number => new Set(values).size;

    expect(unique(entries.map((entry) => entry.key))).toBe(entries.length);
    expect(unique(entries.map((entry) => entry.sourcePath))).toBe(entries.length);
    expect(unique(entries.map((entry) => entry.targetPath))).toBe(entries.length);
    // Case folding matters: Windows and a Linux CI runner must agree.
    expect(unique(entries.map((entry) => entry.targetPath.toLowerCase()))).toBe(entries.length);
    expect(unique(entries.map((entry) => entry.sha256))).toBe(entries.length);

    const perDirectory = entries.reduce<Record<string, number>>((counts, entry) => {
      const directory = entry.targetPath.split('/').slice(0, 2).join('/');
      counts[directory] = (counts[directory] ?? 0) + 1;
      return counts;
    }, {});
    expect(perDirectory).toEqual({
      'assets/portraits': 20,
      'assets/bg': 12,
      // The desk is foreground, not background: it is the one background-folder
      // file that lands somewhere else.
      'assets/fg': 1,
      'assets/cards': 11,
      'assets/evidence': 6,
      'assets/ui': 22,
    });
  });

  it('derives the same key as the browser registry for all 72 files', async () => {
    const { entries } = await loadAllowlist();
    for (const entry of entries) {
      const fileName = entry.targetPath.split('/').at(-1) ?? '';
      const slot = parseAssetFilename(entry.targetPath, entry.targetPath);
      expect(`${slot.category}/${slot.name}/${slot.state}`, fileName).toBe(entry.key);
      expect(assetKeyFromFileName(fileName), fileName).toBe(entry.key);
      expect(isNhnAssetKey(entry.key), entry.key).toBe(true);
      expect(isRuntimeAssetKey(entry.key), entry.key).toBe(true);
    }
  });

  it('blocks reference art, PSD working files and upper-case extensions', async () => {
    const allowlist = await loadAllowlist();
    const blocked = (candidate: string): string | undefined =>
      sourcePathViolation(candidate, allowlist);

    expect(blocked('docs/NHN AI_image/ref/bg_event_town_ref.png')).toMatch(/blocked directory/u);
    expect(blocked('docs/NHN AI_image/Characters/PSD/idle_bensi_base.png')).toMatch(
      /blocked directory/u,
    );
    expect(blocked('docs/NHN AI_image/UI/ui_icon_buttons.psd')).toMatch(/\.psd/u);
    expect(blocked('docs/NHN AI_image/ref/nhn_ai_game_ref.pur')).toMatch(/blocked directory/u);
    expect(blocked('docs/NHN AI_image/UI/UI_TAG_BASE.PNG')).toMatch(/lower-case/u);
    expect(blocked('docs/NHN AI_image/UI/ui_tag_base.png')).toBeUndefined();

    expect(hasRuntimeExtension('ui_tag_base.png')).toBe(true);
    expect(hasRuntimeExtension('ui_tag_base.PNG')).toBe(false);
    expect(hasRuntimeExtension('.png')).toBe(false);

    // And nothing forbidden is in the allowlist itself.
    for (const entry of allowlist.entries) {
      expect(entry.sourcePath.split('/')).not.toContain('ref');
      expect(entry.sourcePath.split('/')).not.toContain('PSD');
      expect(entry.targetPath.endsWith('.png')).toBe(true);
    }
  });

  it('declares every workbook decomposition that differs from the filename', async () => {
    const allowlist = await loadAllowlist();
    // Two seals whose name segment is `card_stamp`, and two numeric cells that
    // lost their zero padding. Anything else must fail rather than be absorbed.
    expect(allowlist.workbookKeyNormalizations.map((item) => item.workbookRow)).toEqual([
      51, 52, 65, 68,
    ]);
    expect(allowlist.workbookKeyNormalizations.map((item) => item.fileName)).toEqual([
      'ui_card_stamp_logic.png',
      'ui_card_stamp_pushy.png',
      'ui_pin_00.png',
      'ui_system_00.png',
    ]);

    const rows = allowlist.entries.map((entry) => ({
      row: entry.workbookRow,
      B: entry.targetPath.split('/').at(-1),
      C: entry.key.split('/')[0],
      D: entry.key.split('/')[1],
      E: entry.key.split('/')[2],
    }));
    const parity = compareWorkbook(rows, allowlist);
    expect(parity.problems).toEqual([]);
    expect(parity.matched).toBe(72);

    // An undeclared mismatch is a failure, not a silent normalization.
    const tampered = rows.map((row) => (row.row === 40 ? { ...row, E: 'evidence3' } : row));
    expect(compareWorkbook(tampered, allowlist).problems[0]).toMatch(/add a declared normalization/u);
  });
});

describe('NHN asset importer', () => {
  // Each pass digests the 18 MiB delivery plus every target, so these two get
  // an explicit budget rather than the default 5s.
  it('reports every approved target as present and byte-identical', async () => {
    // Runs against the committed tree, so it also proves a second import would
    // produce an empty diff.
    const result = await importNhnAssets({ mode: 'check' });
    expect(result.problems).toEqual([]);
    expect(result.ok).toBe(true);
    expect(result.unchanged).toHaveLength(72);
    expect(result.written).toEqual([]);
    expect(result.stale).toEqual([]);
    expect(result.missing).toEqual([]);
  }, 60_000);

  it('never writes in dry-run mode', async () => {
    const dryRun = await importNhnAssets({ mode: 'dry-run' });
    expect(dryRun.written).toEqual([]);
    // Nothing moved: a dry run leaves every target exactly as it found it.
    expect(await importNhnAssets({ mode: 'check' })).toMatchObject({
      unchanged: dryRun.unchanged,
      written: [],
      stale: [],
      missing: [],
      problems: [],
    });
  }, 60_000);
});
