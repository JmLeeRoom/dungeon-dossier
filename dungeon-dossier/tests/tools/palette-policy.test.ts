import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { PNG } from 'pngjs';
import { describe, expect, it } from 'vitest';

import {
  MAX_OPAQUE_RGBA_COLOURS,
  approvedProductionDigests,
  countVisibleRgbaColours,
  evaluatePalette,
  toRuntimePath,
} from '../../tools/assets/palettePolicy.mjs';
import { checkPalettes } from '../../tools/palette-check/index.mjs';

const PROJECT_ROOT = fileURLToPath(new URL('../../', import.meta.url));

async function loadPng(runtimePath: string): Promise<{ buffer: Buffer; png: PNG }> {
  const buffer = await readFile(path.join(PROJECT_ROOT, ...runtimePath.split('/')));
  return { buffer, png: PNG.sync.read(buffer) };
}

describe('palette policy', () => {
  it('holds generated placeholders to the sixteen-colour house style', async () => {
    const { buffer, png } = await loadPng('assets/portraits/portrait_물컹이_base.png');
    const result = await evaluatePalette({
      runtimePath: 'assets/portraits/portrait_물컹이_base.png',
      buffer,
      png,
    });
    expect(result.policy).toBe('strict16');
    expect(result.problem).toBeUndefined();
    expect(countVisibleRgbaColours(png)).toBeLessThanOrEqual(MAX_OPAQUE_RGBA_COLOURS);
  });

  it('fails an unapproved file that exceeds the colour ceiling', async () => {
    // The same bytes as an approved deliverable, but claimed at a path the
    // allowlist does not cover: the exemption follows the digest, not the file.
    const { buffer, png } = await loadPng('assets/ui/ui_tag_base.png');
    expect(countVisibleRgbaColours(png)).toBeGreaterThan(MAX_OPAQUE_RGBA_COLOURS);
    const result = await evaluatePalette({
      runtimePath: 'assets/ui/copied_tag_base.png',
      buffer,
      png,
    });
    expect(result.policy).toBe('strict16');
    expect(result.problem).toMatch(/visible RGBA colours/u);
  });

  it('exempts approved production art by its exact digest', async () => {
    const { buffer, png } = await loadPng('assets/ui/ui_tag_base.png');
    const result = await evaluatePalette({
      runtimePath: 'assets/ui/ui_tag_base.png',
      buffer,
      png,
    });
    expect(result.policy).toBe('approved-production');
    expect(result.problem).toBeUndefined();
    // Reported, not ignored: the check states how many colours it let through.
    expect(result.colourCount).toBeGreaterThan(MAX_OPAQUE_RGBA_COLOURS);
  });

  it('rejects different bytes at an approved path', async () => {
    // The path is right and the palette would even pass strict16, but the
    // digest does not match, so this is unreviewed art at a reviewed location.
    const { buffer, png } = await loadPng('assets/portraits/portrait_물컹이_base.png');
    const result = await evaluatePalette({
      runtimePath: 'assets/ui/ui_tag_base.png',
      buffer,
      png,
    });
    expect(result.policy).toBe('approved-production');
    expect(result.problem).toMatch(/does not match the approved/u);
    expect(result.problem).toMatch(/importer-only/u);
  });

  it('covers exactly the 72 approved deliverables', async () => {
    const digests = (await approvedProductionDigests()) as ReadonlyMap<string, string>;
    expect(digests.size).toBe(87);
    for (const [runtimePath, digest] of digests) {
      expect(runtimePath.startsWith('assets/')).toBe(true);
      expect(digest).toMatch(/^[0-9a-f]{64}$/u);
    }
  });

  it('normalizes an asset-root-relative path to a runtime path', () => {
    expect(toRuntimePath('ui/ui_tag_base.png')).toBe('assets/ui/ui_tag_base.png');
    expect(toRuntimePath('assets/ui/ui_tag_base.png')).toBe('assets/ui/ui_tag_base.png');
  });

  it('reports an upper-case PNG extension instead of silently ignoring it', async () => {
    const assetRoot = await mkdtemp(path.join(tmpdir(), 'dossier-palette-extension-'));
    const png = new PNG({ width: 1, height: 1 });
    png.data.set([1, 2, 3, 255]);
    try {
      await writeFile(path.join(assetRoot, 'ui_asset_state.PNG'), PNG.sync.write(png));
      const result = await checkPalettes(assetRoot);
      expect(result.checkedFiles).toBe(0);
      expect(result.problems).toEqual([
        {
          relativePath: 'ui_asset_state.PNG',
          message: 'asset extension must be lower-case .png',
        },
      ]);
    } finally {
      await rm(assetRoot, { recursive: true, force: true });
    }
  });

  // Decodes all 127 PNGs (~21 MiB), which outruns the default budget when the
  // suite is running files in parallel.
  it('passes the whole checked-in tree and reports the split', async () => {
    const result = await checkPalettes();
    expect(result.problems).toEqual([]);
    expect(result.checkedFiles).toBe(142);
    expect(result.byPolicy).toEqual({ strict16: 55, 'approved-production': 87 });
  }, 60_000);
});
