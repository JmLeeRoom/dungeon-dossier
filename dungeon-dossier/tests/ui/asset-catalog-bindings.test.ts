import { describe, expect, it } from 'vitest';

import {
  BOARD_ASSET_KEYS,
  BOARD_NODE_PHOTO_ASSET_KEYS,
  CARDS_AWAITING_ART,
  CARD_ATTACHMENT_ASSET_KEYS,
  CARD_BASE_ASSET_KEY,
  CARD_ILLUSTRATION_ASSET_KEYS,
  CARD_LOCKED_ILLUSTRATION_ASSET_KEY,
  CARD_LOCK_OVERLAY_ASSET_KEY,
  DETECTIVE_PHOTO_ASSET_KEY,
  EVIDENCE_ASSET_KEYS,
  HUD_ICON_ASSET_KEYS,
  INTERROGATION_BACKGROUND_ASSET_KEY,
  INTERROGATION_DESK_ASSET_KEY,
  PARTNER_ASSET_SET,
  PARTNER_PHOTO_ASSET_KEY,
  PARTNER_USED_ASSET_KEY,
  RESULT_ASSET_KEYS,
  SUSPECTS_AWAITING_ART,
  SUSPECT_ASSET_SETS,
  allBoundAssetKeys,
  interrogationBackgroundAssetKey,
  legacySuspectAssetSet,
  suspectAssetSet,
} from '../../src/app/uiAssetBindings';
import {
  ASSET_BUNDLE_IDS,
  EXPECTED_CATALOG_COUNTS,
  RUNTIME_ASSET_CATALOG,
  catalogCountsByProvenance,
  catalogEntry,
  catalogEntryByFileName,
  catalogKeysForBundle,
  validateRuntimeAssetCatalog,
} from '../../src/ui/core/runtimeAssetCatalog';
import { TAG_CHIP_ASSET_KEYS, TAG_CHIP_STATES } from '../../src/ui/widgets/tagChip';

describe('runtime asset catalog', () => {
  it('accounts for the whole transitional set: 127 = 55 legacy + 72 approved', () => {
    expect(validateRuntimeAssetCatalog()).toEqual([]);
    expect(RUNTIME_ASSET_CATALOG).toHaveLength(EXPECTED_CATALOG_COUNTS.total);
    expect(catalogCountsByProvenance()).toEqual({
      'nhn-2026': EXPECTED_CATALOG_COUNTS.nhn2026,
      'legacy-placeholder': EXPECTED_CATALOG_COUNTS.legacyPlaceholder,
    });
    expect(
      EXPECTED_CATALOG_COUNTS.legacyPlaceholder + EXPECTED_CATALOG_COUNTS.nhn2026,
    ).toBe(EXPECTED_CATALOG_COUNTS.total);
  });

  it('gives every key exactly one file, digest and basename', () => {
    const keys = RUNTIME_ASSET_CATALOG.map((entry) => entry.key);
    const fileNames = RUNTIME_ASSET_CATALOG.map((entry) => entry.fileName);
    const paths = RUNTIME_ASSET_CATALOG.map((entry) => entry.runtimePath);
    expect(new Set(keys).size).toBe(keys.length);
    // The V3 manifest stores a bare basename, so that has to be unique too.
    expect(new Set(fileNames).size).toBe(fileNames.length);
    expect(new Set(paths).size).toBe(paths.length);
    expect(new Set(paths.map((value) => value.toLowerCase())).size).toBe(paths.length);

    for (const entry of RUNTIME_ASSET_CATALOG) {
      expect(catalogEntry(entry.key)).toBe(entry);
      expect(catalogEntryByFileName(entry.fileName)).toBe(entry);
    }
  });

  it('binds the palette exemption to provenance and a digest, never a path', () => {
    for (const entry of RUNTIME_ASSET_CATALOG) {
      if (entry.provenance === 'nhn-2026') {
        expect(entry.palettePolicy, entry.key).toBe('approved-production');
        expect(entry.sha256, entry.key).toMatch(/^[0-9a-f]{64}$/u);
        expect(entry.sourcePath, entry.key).toBeDefined();
        expect(entry.sourceWorkbookRow, entry.key).toBeGreaterThan(0);
      } else {
        expect(entry.palettePolicy, entry.key).toBe('strict16');
        expect(entry.sourcePath, entry.key).toBeUndefined();
      }
    }
  });

  it('places every asset in a bundle, and covers every bundle', () => {
    const seen = new Set<string>();
    for (const bundle of ASSET_BUNDLE_IDS) {
      const keys = catalogKeysForBundle(bundle);
      expect(keys.length, bundle).toBeGreaterThan(0);
      for (const key of keys) seen.add(key);
    }
    expect(seen.size).toBe(RUNTIME_ASSET_CATALOG.length);

    // A veiled board slot must not be able to reach a future episode's photo by
    // loading a bundle, so board art is only the marker, the pin and photos.
    for (const key of catalogKeysForBundle('board')) {
      expect(
        key.startsWith('ui/photo/') ||
          key.startsWith('ui/pin/') ||
          key.startsWith('ui/board/') ||
          key === 'bg/event/crazyboard',
        key,
      ).toBe(true);
    }
  });
});

describe('app-layer asset bindings', () => {
  const boundKeys = allBoundAssetKeys();

  it('resolves every bound key to a catalogued image', () => {
    expect(boundKeys.length).toBeGreaterThan(0);
    for (const key of boundKeys) {
      expect(catalogEntry(key), key).toBeDefined();
    }
  });

  it('binds only characters the delivery names, and lists the rest', () => {
    expect(Object.keys(SUSPECT_ASSET_SETS).sort()).toEqual(
      ['고블린', '물컹이', '미노타우로스', '서큐버스'].sort(),
    );
    for (const set of Object.values(SUSPECT_ASSET_SETS)) {
      // Approved sheets are complete characters; overlaying two of them would
      // draw the suspect twice.
      expect(set.stateMode).toBe('replace');
      expect([set.base, set.upset, set.lose].every((key) => key?.startsWith('idle/'))).toBe(true);
    }

    // `bensi` and `kimyongsa` ship as art but are not bound to any authored
    // suspect: nothing records which character they depict.
    const boundTokens = Object.values(SUSPECT_ASSET_SETS).map((set) => set.base.split('/')[1]);
    expect(boundTokens).not.toContain('bensi');
    expect(boundTokens).not.toContain('kimyongsa');

    for (const name of SUSPECTS_AWAITING_ART) {
      expect(SUSPECT_ASSET_SETS[name]).toBeUndefined();
      const fallback = suspectAssetSet(name);
      expect(fallback).toEqual(legacySuspectAssetSet(name));
      // Generated sheets are difference layers, so they still overlay.
      expect(fallback?.stateMode).toBe('overlay');
      expect(catalogEntry(`portrait/${name}/base`), name).toBeDefined();
    }
    expect(suspectAssetSet(undefined)).toBeUndefined();
  });

  it('folds the three authored room tints onto the one approved background', () => {
    for (const authored of ['배경/심문실/시안', '배경/심문실/세피아', '배경/심문실/마젠타']) {
      expect(interrogationBackgroundAssetKey(authored)).toBe(INTERROGATION_BACKGROUND_ASSET_KEY);
    }
    expect(interrogationBackgroundAssetKey(undefined)).toBe(INTERROGATION_BACKGROUND_ASSET_KEY);
    // An unrecognised key is passed through rather than silently rewritten.
    expect(interrogationBackgroundAssetKey('bg/event/rest')).toBe('bg/event/rest');
    expect(catalogEntry(INTERROGATION_DESK_ASSET_KEY)?.width).toBe(1280);
    expect(catalogEntry(INTERROGATION_DESK_ASSET_KEY)?.height).toBe(321);
  });

  it('maps all 24 authored evidence ids onto the 6 polaroids', () => {
    const ids = Object.keys(EVIDENCE_ASSET_KEYS);
    expect(ids).toHaveLength(24);
    expect(new Set(ids).size).toBe(24);
    // Many-to-one is the point; the six plates must all be reachable.
    expect(new Set(Object.values(EVIDENCE_ASSET_KEYS)).size).toBe(6);
    for (const [id, key] of Object.entries(EVIDENCE_ASSET_KEYS)) {
      expect(key, id).toMatch(/^ui\/card\/evidence0[0-5]$/u);
      expect(catalogEntry(key), key).toBeDefined();
    }
    for (const prefix of ['ev_tutorial_', 'ev_ep001_', 'ev_ep004_']) {
      expect(ids.filter((id) => id.startsWith(prefix)), prefix).toHaveLength(8);
    }
  });

  it('binds card art by card id and names the cards still waiting for it', () => {
    for (const [cardId, key] of Object.entries(CARD_ILLUSTRATION_ASSET_KEYS)) {
      expect(cardId).toMatch(/^card_/u);
      expect(key, cardId).toMatch(/^ui\/card\/illust0[0-5]$/u);
      expect(catalogEntry(key), key).toBeDefined();
    }
    for (const cardId of CARDS_AWAITING_ART) {
      expect(CARD_ILLUSTRATION_ASSET_KEYS[cardId], cardId).toBeUndefined();
    }
    expect(Object.keys(CARD_ILLUSTRATION_ASSET_KEYS).length + CARDS_AWAITING_ART.length).toBe(14);

    expect(catalogEntry(CARD_BASE_ASSET_KEY)).toMatchObject({ width: 768, height: 1024 });
    expect(catalogEntry(CARD_LOCKED_ILLUSTRATION_ASSET_KEY)).toBeDefined();
    expect(catalogEntry(CARD_LOCK_OVERLAY_ASSET_KEY)).toMatchObject({ width: 580, height: 580 });

    // The six facet tokens share the post-it; the two attribute tokens do not.
    for (const facet of ['WHO', 'WHEN', 'WHERE', 'WHAT', 'HOW', 'WHY']) {
      expect(CARD_ATTACHMENT_ASSET_KEYS[facet], facet).toBe('ui/card/post');
    }
    expect(CARD_ATTACHMENT_ASSET_KEYS.BLUE).toBe('ui/card_stamp/logic');
    expect(CARD_ATTACHMENT_ASSET_KEYS.RED).toBe('ui/card_stamp/pushy');
    expect(CARD_ATTACHMENT_ASSET_KEYS.CLIP).toBe('ui/card/pushy');
  });

  it('keeps the small card seals distinct from the large screen stamps', () => {
    // `ui/card_stamp/*` is pressed into the card; `ui/stamp/*` is 620x620
    // screen feedback. Confusing them would put a full-screen stamp on a card.
    expect(catalogEntry('ui/card_stamp/logic')).toMatchObject({ width: 344, height: 176 });
    expect(catalogEntry('ui/stamp/logic')).toMatchObject({ width: 620, height: 620 });
    expect(Object.values(CARD_ATTACHMENT_ASSET_KEYS)).not.toContain('ui/stamp/logic');
    expect(Object.values(CARD_ATTACHMENT_ASSET_KEYS)).not.toContain('ui/stamp/pushy');
  });

  it('binds the HUD icons, tag plates, photos, board and result art', () => {
    expect(catalogEntry(HUD_ICON_ASSET_KEYS.composure)).toMatchObject({ width: 32, height: 32 });
    expect(catalogEntry(HUD_ICON_ASSET_KEYS.coercion)).toMatchObject({ width: 32, height: 32 });

    for (const state of TAG_CHIP_STATES) {
      const key = TAG_CHIP_ASSET_KEYS[state];
      if (key === undefined) {
        // Only SHAKEN has no authored plate; it keeps the vector treatment
        // rather than borrowing one that reads as something else.
        expect(state).toBe('SHAKEN');
        continue;
      }
      expect(catalogEntry(key), key).toMatchObject({ width: 830, height: 330 });
    }

    expect(catalogEntry(DETECTIVE_PHOTO_ASSET_KEY)).toMatchObject({ width: 256, height: 256 });
    // The intern is the paper-cup slime, so one photograph serves both roles.
    expect(PARTNER_PHOTO_ASSET_KEY).toBe(BOARD_NODE_PHOTO_ASSET_KEYS.enc_tutorial_slime);
    expect(PARTNER_ASSET_SET.base).toBe('idle/coffee/base');
    expect(PARTNER_USED_ASSET_KEY).toBe('idle/coffee/used');

    for (const key of Object.values(BOARD_ASSET_KEYS)) {
      expect(catalogEntry(key), key).toBeDefined();
    }
    expect(catalogEntry(RESULT_ASSET_KEYS.clear)).toMatchObject({ width: 1024, height: 506 });
    expect(catalogEntry(RESULT_ASSET_KEYS.fail)).toMatchObject({ width: 1024, height: 506 });
  });

  it('never binds reference or working-file art', () => {
    for (const key of boundKeys) {
      const entry = catalogEntry(key);
      expect(entry?.sourcePath?.includes('/ref/') ?? false, key).toBe(false);
      expect(entry?.sourcePath?.includes('/PSD/') ?? false, key).toBe(false);
      expect(entry?.runtimePath.endsWith('.png'), key).toBe(true);
    }
  });
});
