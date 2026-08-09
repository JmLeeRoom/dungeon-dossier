import { Graphics, Sprite, type Container } from 'pixi.js';
import { describe, expect, it, vi } from 'vitest';

// Pixel text measures glyphs through a canvas, which the node environment has
// no DOM for. The widget's geometry is what is under test, not its typography.
vi.mock('../../src/ui/core/pixelText', async () => {
  const { Container: TextContainer } = await import('pixi.js');
  return {
    createPixelText(text: string) {
      const view = new TextContainer();
      Object.defineProperties(view, {
        anchor: { value: { x: 0, y: 0, set(): void {} } },
        text: { value: text, writable: true },
      });
      return view;
    },
  };
});

import {
  createProfilePhoto,
  createSuspectPortrait,
  resolveSuspectPortraitSheets,
  suspectAssetKeyForState,
  type SuspectAssetSet,
} from '../../src/ui/widgets/suspectPortraitWidget';
import { PORTRAIT_SHAKE_PROFILES, SUSPECT_PORTRAIT_SIZE } from '../../src/ui/widgets/portrait';

const WHITE_TEXTURE_URL =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

const APPROVED: SuspectAssetSet = {
  base: 'idle/mulkung/base',
  upset: 'idle/mulkung/upset',
  lose: 'idle/mulkung/lose',
  stateMode: 'replace',
};

const GENERATED: SuspectAssetSet = {
  base: 'portrait/하피/base',
  upset: 'portrait/하피/upset',
  lose: 'portrait/하피/lose',
  stateMode: 'overlay',
};

const resolveUrl = (key: string): string => `/generated/${key.replaceAll('/', '_')}.png`;

function spriteCount(view: Container): number {
  return view.children.filter((child) => child instanceof Sprite).length;
}

describe('suspect portrait state composition', () => {
  it('picks the frame for the active state and falls back to base', () => {
    expect(suspectAssetKeyForState(APPROVED, 'base')).toBe('idle/mulkung/base');
    expect(suspectAssetKeyForState(APPROVED, 'upset')).toBe('idle/mulkung/upset');
    expect(suspectAssetKeyForState(APPROVED, 'lose')).toBe('idle/mulkung/lose');
    // A partially delivered character still renders rather than going blank.
    const partial: SuspectAssetSet = { base: 'idle/coffee/base', stateMode: 'replace' };
    expect(suspectAssetKeyForState(partial, 'lose')).toBe('idle/coffee/base');
  });

  it('replaces the whole frame for approved art instead of stacking two', () => {
    for (const state of ['base', 'upset', 'lose'] as const) {
      const sheets = resolveSuspectPortraitSheets({
        assetSet: APPROVED,
        statePart: state,
        resolveUrl,
      });
      // Exactly one sheet, always. Two would draw the character twice.
      expect(sheets.statePartsUrl, state).toBeUndefined();
      expect(sheets.baseUrl, state).toBe(resolveUrl(suspectAssetKeyForState(APPROVED, state)));
    }
  });

  it('keeps the generated difference layers overlaying their shared body', () => {
    expect(resolveSuspectPortraitSheets({ assetSet: GENERATED, statePart: 'base', resolveUrl })).toEqual(
      { baseUrl: resolveUrl('portrait/하피/base') },
    );
    expect(resolveSuspectPortraitSheets({ assetSet: GENERATED, statePart: 'upset', resolveUrl })).toEqual(
      {
        baseUrl: resolveUrl('portrait/하피/base'),
        statePartsUrl: resolveUrl('portrait/하피/upset'),
      },
    );
  });

  it('renders no sheet at all when nothing resolves', () => {
    expect(resolveSuspectPortraitSheets({ statePart: 'upset' })).toEqual({});
    expect(
      resolveSuspectPortraitSheets({
        assetSet: APPROVED,
        statePart: 'upset',
        resolveUrl: () => undefined,
      }),
    ).toEqual({});
  });
});

describe('suspect portrait widget', () => {
  it('composites one sprite in replace mode and two in overlay mode', () => {
    const replaced = createSuspectPortrait({
      assetSet: APPROVED,
      statePart: 'upset',
      resolveUrl: () => WHITE_TEXTURE_URL,
      label: '물컹이',
    });
    expect(spriteCount(replaced.view)).toBe(1);

    const overlaid = createSuspectPortrait({
      assetSet: GENERATED,
      statePart: 'upset',
      resolveUrl: () => WHITE_TEXTURE_URL,
      label: '하피',
    });
    expect(spriteCount(overlaid.view)).toBe(2);

    replaced.view.destroy({ children: true });
    overlaid.view.destroy({ children: true });
  });

  it('does not put an opaque placeholder panel behind transparent production art', () => {
    const portrait = createSuspectPortrait({
      assetSet: APPROVED,
      statePart: 'base',
      resolveUrl: () => WHITE_TEXTURE_URL,
    });

    expect(portrait.view.children.filter((child) => child instanceof Graphics)).toHaveLength(0);
    portrait.view.destroy({ children: true });
  });

  it('drives the transition shake on the container it already owns', () => {
    const portrait = createSuspectPortrait({
      assetSet: APPROVED,
      statePart: 'base',
      resolveUrl: () => WHITE_TEXTURE_URL,
    });
    portrait.view.position.set(212, 34);
    expect(portrait.shaking).toBe(false);

    portrait.playTransitionShake('lose');
    expect(portrait.shaking).toBe(true);
    portrait.update(40);
    // The shake moves the portrait horizontally and leaves y untouched.
    expect(portrait.view.position.x).not.toBe(212);
    expect(portrait.view.position.y).toBe(34);

    portrait.update(PORTRAIT_SHAKE_PROFILES.lose.durationMs);
    expect(portrait.shaking).toBe(false);
    // And it settles back exactly where the screen put it.
    expect(portrait.view.position.x).toBe(212);

    portrait.view.destroy({ children: true });
  });

  it('sizes to the suspect display bounds by default', () => {
    const portrait = createSuspectPortrait({ statePart: 'base' });
    expect(SUSPECT_PORTRAIT_SIZE).toEqual({ width: 216, height: 216 });
    expect(portrait.statePart).toBe('base');
    portrait.view.destroy({ children: true });
  });
});

describe('pinned profile photo', () => {
  it('fits a 256x256 photograph into its frame and stays non-interactive', () => {
    const photo = createProfilePhoto({
      url: WHITE_TEXTURE_URL,
      caption: '김태훈 형사',
      pinUrl: WHITE_TEXTURE_URL,
      width: 48,
      height: 48,
    });
    expect(photo.eventMode).toBe('none');
    const sprites = photo.children.filter((child): child is Sprite => child instanceof Sprite);
    expect(sprites).toHaveLength(2);
    for (const sprite of sprites) {
      // Decoration must never become a hit target or reorder input.
      expect(sprite.eventMode).toBe('none');
    }
    const [image] = sprites;
    // Square source into a square frame minus the 2px mount: no distortion.
    expect(image?.width).toBe(image?.height);
    expect(image?.width).toBeLessThanOrEqual(44);
    photo.destroy({ children: true });
  });

  it('renders the frame alone when there is no photograph', () => {
    const photo = createProfilePhoto();
    expect(photo.children.filter((child) => child instanceof Sprite)).toHaveLength(0);
    photo.destroy({ children: true });
  });
});
