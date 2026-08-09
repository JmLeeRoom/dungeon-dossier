import { describe, expect, it } from 'vitest';

import { catalogEntryByFileName } from '../../src/ui/core/runtimeAssetCatalog';
import {
  CANONICAL_SLOTS,
  SLOT_IDS,
} from '../../workbench/model.mts';
import {
  buildShippingSlotPreviews,
  isStagePreviewSlotVisible,
} from '../../workbench/shipping-preview.mts';

function shippingGlobUrls(): Record<string, string> {
  return Object.fromEntries(
    CANONICAL_SLOTS.map((definition) => {
      const entry = catalogEntryByFileName(definition.manifestImage);
      if (entry === undefined) throw new Error(`test fixture is uncatalogued: ${definition.manifestImage}`);
      return [`../${entry.runtimePath}`, `/built/${entry.runtimePath}`];
    }),
  );
}

describe('buildShippingSlotPreviews', () => {
  it('hydrates all 16 canonical slots from manifest basenames and catalog paths', () => {
    const previews = buildShippingSlotPreviews(shippingGlobUrls());

    expect(Object.keys(previews)).toEqual(SLOT_IDS);
    for (const definition of CANONICAL_SLOTS) {
      const entry = catalogEntryByFileName(definition.manifestImage);
      expect(entry).toBeDefined();
      expect(previews[definition.id]).toEqual({
        dataUrl: `/built/${entry?.runtimePath ?? ''}`,
        originalName: definition.manifestImage,
      });
    }
  });

  it('fails at startup when a shipping binding has no discovered PNG URL', () => {
    const urls = shippingGlobUrls();
    const missingDefinition = CANONICAL_SLOTS[0]!;
    const missingEntry = catalogEntryByFileName(missingDefinition.manifestImage);
    expect(missingEntry).toBeDefined();
    delete urls[`../${missingEntry?.runtimePath ?? ''}`];

    expect(() => buildShippingSlotPreviews(urls)).toThrow(
      `Workbench slot "${missingDefinition.id}" cannot resolve ${missingDefinition.manifestImage}`,
    );
  });

  it('rejects ambiguous glob keys that normalize to the same runtime path', () => {
    const urls = shippingGlobUrls();
    const entry = catalogEntryByFileName(CANONICAL_SLOTS[0]!.manifestImage);
    expect(entry).toBeDefined();
    urls[`../../${entry?.runtimePath ?? ''}`] = '/duplicate.png';

    expect(() => buildShippingSlotPreviews(urls)).toThrow(
      `Workbench PNG glob contains duplicate runtime path: ${entry?.runtimePath ?? ''}`,
    );
  });
});

describe('isStagePreviewSlotVisible', () => {
  it('shows exactly one whole-frame suspect and partner state at a time', () => {
    expect(isStagePreviewSlotVisible('suspect-base', 'bg-room')).toBe(true);
    expect(isStagePreviewSlotVisible('suspect-state-parts', 'bg-room')).toBe(false);
    expect(isStagePreviewSlotVisible('suspect-lose-parts', 'bg-room')).toBe(false);
    expect(isStagePreviewSlotVisible('partner-base', 'bg-room')).toBe(true);
    expect(isStagePreviewSlotVisible('partner-used', 'bg-room')).toBe(false);

    expect(isStagePreviewSlotVisible('suspect-base', 'suspect-state-parts')).toBe(false);
    expect(isStagePreviewSlotVisible('suspect-state-parts', 'suspect-state-parts')).toBe(true);
    expect(isStagePreviewSlotVisible('suspect-lose-parts', 'suspect-state-parts')).toBe(false);
    expect(isStagePreviewSlotVisible('partner-base', 'partner-used')).toBe(false);
    expect(isStagePreviewSlotVisible('partner-used', 'partner-used')).toBe(true);

    expect(isStagePreviewSlotVisible('card-base', 'suspect-lose-parts')).toBe(true);
  });
});
