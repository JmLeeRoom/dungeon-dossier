import { describe, expect, it } from 'vitest';

import { ASSET_DIMENSIONS } from '../../src/ui/core/assetDimensions';
import { DEFAULT_TARGET_SCALE, INTERNAL_HEIGHT } from '../../src/ui/core/integerScale';
import {
  DESK_ACTION_INSET,
  DESK_DOSSIER_INSET,
  DESK_LOGICAL_HEIGHT,
  DESK_PARTNER_INSET,
  DESK_SECURE_INSET,
  DESK_TRAY_INSET,
  DESK_TOP,
  DESK_TYPEWRITER_INSET,
  TAG_ROW_Y,
} from '../../src/ui/screens/interrogation/createInterrogationScreen';
import { SUSPECT_PORTRAIT_SIZE } from '../../src/ui/widgets';

const TAG_ROW_HEIGHT = 26;
/** Where the suspect portrait is mounted by the interrogation screen. */
const PORTRAIT_Y = 34;

describe('1280x321 desk layout', () => {
  it('derives the desk band from the authored asset instead of a magic number', () => {
    expect(ASSET_DIMENSIONS.desk_foreground).toEqual({ width: 1280, height: 321 });
    expect(DESK_LOGICAL_HEIGHT).toBe(161);
    expect(DESK_TOP).toBe(239);
    // Rounding up is what guarantees the plate reaches the stage floor exactly.
    expect(DESK_TOP + DESK_LOGICAL_HEIGHT).toBe(INTERNAL_HEIGHT);
    expect(DESK_LOGICAL_HEIGHT).toBe(
      Math.ceil(ASSET_DIMENSIONS.desk_foreground.height / DEFAULT_TARGET_SCALE),
    );
  });

  it('lifts the tag row clear of the desk edge', () => {
    expect(TAG_ROW_Y).toBe(205);
    expect(TAG_ROW_Y + TAG_ROW_HEIGHT).toBeLessThan(DESK_TOP);
  });

  it('lets the desk and tag row overlap the portrait on purpose', () => {
    const portraitBottom = PORTRAIT_Y + SUSPECT_PORTRAIT_SIZE.height;
    // The suspect now sits behind the desk instead of floating in front of it.
    expect(portraitBottom).toBeGreaterThan(DESK_TOP);
    // And the chips read as foreground papers across the suspect's lower body.
    expect(TAG_ROW_Y).toBeLessThan(portraitBottom);
  });

  it('keeps every on-desk widget on the plate', () => {
    const insets = [
      DESK_TYPEWRITER_INSET,
      DESK_TRAY_INSET,
      DESK_PARTNER_INSET,
      DESK_ACTION_INSET,
      DESK_SECURE_INSET,
      DESK_DOSSIER_INSET,
    ];
    for (const inset of insets) {
      expect(inset).toBeGreaterThan(0);
      expect(DESK_TOP + inset).toBeGreaterThan(DESK_TOP);
      expect(DESK_TOP + inset).toBeLessThan(INTERNAL_HEIGHT);
    }
  });

  it('preserves the absolute placements the screen shipped with', () => {
    // A taller plate must add headroom, not shove the controls around.
    expect(DESK_TOP + DESK_TYPEWRITER_INSET).toBe(288);
    expect(DESK_TOP + DESK_TRAY_INSET).toBe(292);
    expect(DESK_TOP + DESK_PARTNER_INSET).toBe(296);
    expect(DESK_TOP + DESK_ACTION_INSET).toBe(296);
    expect(DESK_TOP + DESK_SECURE_INSET).toBe(322);
    expect(DESK_TOP + DESK_DOSSIER_INSET).toBe(344);
  });
});
