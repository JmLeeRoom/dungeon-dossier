import { writeFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { allBoundAssetKeys } from '../../src/app/uiAssetBindings';
import { RUNTIME_ASSET_CATALOG } from '../../src/ui/core/runtimeAssetCatalog';

describe('coverage dump', () => {
  it('dumps', () => {
    const bound = new Set(allBoundAssetKeys());
    const rows = RUNTIME_ASSET_CATALOG.map((e) => ({
      key: e.key,
      provenance: e.provenance,
      bundles: e.bundles.join('|'),
      bound: bound.has(e.key),
      size: `${e.width}x${e.height}`,
    }));
    writeFileSync('coverage-dump.json', JSON.stringify({ boundCount: bound.size, rows }, null, 1));
    expect(true).toBe(true);
  });
});
