import { describe, expect, it, vi } from 'vitest';

vi.mock('../../src/ui/core/pixelText', async () => {
  const { Container: TextContainer } = await import('pixi.js');
  return {
    createPixelText(text: string) {
      const view = new TextContainer();
      Object.defineProperties(view, {
        anchor: { value: { x: 0, y: 0, set(): void {} } },
        text: { value: text, writable: true },
        tint: { value: 0xffffff, writable: true },
      });
      return view;
    },
  };
});

import {
  CP_PIP_ASSET_KEYS,
  HP_ICON_ASSET_KEY,
  PARTNER_PHOTO_ASSET_KEY,
  TITLE_MENU_ASSET_KEYS,
} from '../../src/app/uiAssetBindings';
import { ASSET_DIMENSIONS } from '../../src/ui/core/assetDimensions';
import { catalogEntry } from '../../src/ui/core/runtimeAssetCatalog';
import {
  GAUGE_IMPACT_PROFILE,
  createGaugeController,
  gaugeImpactOffset,
} from '../../src/ui/widgets/gauge';

describe('gauge impact', () => {
  it('shakes on demand and always settles back where the screen put it', () => {
    const gauge = createGaugeController(40, 60, { width: 164, height: 12 });
    gauge.view.position.set(159, 7);
    expect(gauge.shaking).toBe(false);

    gauge.playImpact();
    expect(gauge.shaking).toBe(true);
    gauge.update(30);
    // The bar moves horizontally only; a vertical nudge would break the HUD row.
    expect(gauge.view.position.x).not.toBe(159);
    expect(gauge.view.position.y).toBe(7);

    gauge.update(GAUGE_IMPACT_PROFILE.durationMs);
    expect(gauge.shaking).toBe(false);
    expect(gauge.view.position.x).toBe(159);

    gauge.destroy();
  });

  it('stays still until something actually hits it', () => {
    const gauge = createGaugeController(40, 60, {});
    gauge.view.position.set(10, 20);
    gauge.update(120);
    expect(gauge.view.position.x).toBe(10);
    gauge.destroy();
  });

  it('damps back to rest rather than ending mid-swing', () => {
    expect(gaugeImpactOffset(0)).toBe(0);
    expect(gaugeImpactOffset(GAUGE_IMPACT_PROFILE.durationMs)).toBe(0);
    // A shorter, sharper profile than the portrait's: the bar is a small target.
    expect(GAUGE_IMPACT_PROFILE.amplitude).toBeLessThan(10);
    expect(GAUGE_IMPACT_PROFILE.durationMs).toBeLessThanOrEqual(220);
  });

  it('restarts from rest so consecutive hits cannot walk the bar away', () => {
    const gauge = createGaugeController(40, 60, {});
    gauge.view.position.set(100, 5);
    gauge.playImpact();
    gauge.update(40);
    gauge.playImpact();
    gauge.update(GAUGE_IMPACT_PROFILE.durationMs);
    expect(gauge.view.position.x).toBe(100);
    gauge.destroy();
  });
});

describe('v2 HUD assets', () => {
  it('gives the command point a spent state as well as an available one', () => {
    // A spent point has to remain visible: the row of coins is how the player
    // reads what the next card will cost.
    expect(CP_PIP_ASSET_KEYS.active).not.toBe(CP_PIP_ASSET_KEYS.deactive);
    for (const key of Object.values(CP_PIP_ASSET_KEYS)) {
      expect(catalogEntry(key), key).toMatchObject({ width: 32, height: 32 });
    }
  });

  it('gives the run its own heart, separate from the interrogation gauges', () => {
    expect(catalogEntry(HP_ICON_ASSET_KEY)).toMatchObject({ width: 32, height: 32 });
  });

  it('gives the partner a photograph that is not a suspect', () => {
    expect(PARTNER_PHOTO_ASSET_KEY).toBe('ui/photo/coffee');
    expect(catalogEntry(PARTNER_PHOTO_ASSET_KEY)).toMatchObject({ width: 256, height: 256 });
  });

  it('ships both states of every title menu plate at their authored size', () => {
    for (const [name, states] of Object.entries(TITLE_MENU_ASSET_KEYS)) {
      const active = catalogEntry(states.active);
      const deactive = catalogEntry(states.deactive);
      expect(active, name).toBeDefined();
      expect(deactive, name).toBeDefined();
      // Both states of one button are the same size, or the plate would jump.
      expect({ width: active?.width, height: active?.height }, name).toEqual({
        width: deactive?.width,
        height: deactive?.height,
      });
    }
    expect(catalogEntry(TITLE_MENU_ASSET_KEYS.start.active)).toMatchObject(
      ASSET_DIMENSIONS.title_button_230x220,
    );
    expect(catalogEntry(TITLE_MENU_ASSET_KEYS.quit.active)).toMatchObject(
      ASSET_DIMENSIONS.menu_button_150x136,
    );
  });
});
