import { readFile, readdir } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

import {
  CHARACTER_PART_OFFSET_LIMIT,
  DEFAULT_WORKBENCH_CHARACTER,
  PARTNER_CHARACTER,
  WORKBENCH_CHARACTERS,
  WORKBENCH_STATE_VERSION,
  buildAssetManifest,
  buildCharacterPartsManifest,
  characterFromPartsManifest,
  characterPartFileName,
  characterPartHasOffset,
  characterPartNames,
  characterPartSlotId,
  characterPartsJsonName,
  createInitialWorkbenchState,
  getCharacterPartImage,
  getCharacterPartOffset,
  loadWorkbenchState,
  normalizeWorkbenchState,
  resolveSlotBinding,
  resolveStageSlotImage,
  saveWorkbenchState,
  serializeCharacterPartsManifest,
  withActiveCharacter,
  withCharacterPartImage,
  withCharacterPartOffset,
  withImportedCharacterParts,
  withStageSlotImage,
  withoutCharacterPartImage,
  withoutStageSlotImage,
  type StorageLike,
  type WorkbenchCharacter,
} from '../../workbench/model.mts';

const PNG_DATA_URL = 'data:image/png;base64,iVBORw0KGgo=';
const PORTRAIT_DIRECTORY = new URL('../../assets/portraits/', import.meta.url);

class MemoryStorage implements StorageLike {
  readonly values = new Map<string, string>();

  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value);
  }
}

function image(name: string) {
  return { dataUrl: PNG_DATA_URL, originalName: name };
}

describe('character roster', () => {
  it('matches the twelve portraits checked into assets/portraits', async () => {
    const files = await readdir(PORTRAIT_DIRECTORY);
    const onDisk = files
      .filter((file) => file.endsWith('.state-parts.json'))
      .map((file) => file.replace(/^portrait_/u, '').replace(/\.state-parts\.json$/u, ''))
      .sort();

    expect(onDisk).toHaveLength(12);
    expect([...WORKBENCH_CHARACTERS].sort()).toEqual(onDisk);
    expect(new Set(WORKBENCH_CHARACTERS).size).toBe(12);
    expect(WORKBENCH_CHARACTERS).toContain(DEFAULT_WORKBENCH_CHARACTER);
    expect(WORKBENCH_CHARACTERS).toContain(PARTNER_CHARACTER);
  });

  it('gives only the partner a fourth cooldown sheet', async () => {
    const files = await readdir(PORTRAIT_DIRECTORY);
    for (const character of WORKBENCH_CHARACTERS) {
      const parts = characterPartNames(character);
      const expected = character === PARTNER_CHARACTER
        ? ['base', 'upset', 'lose', 'used']
        : ['base', 'upset', 'lose'];
      expect([...parts], character).toEqual(expected);
      for (const part of parts) {
        expect(files, `${character}/${part}`).toContain(
          characterPartFileName(character, part),
        );
      }
    }
  });

  it('routes every part to a canonical slot so PNG size checks still apply', () => {
    expect(characterPartSlotId('base')).toBe('suspect-base');
    expect(characterPartSlotId('upset')).toBe('suspect-state-parts');
    expect(characterPartSlotId('lose')).toBe('suspect-lose-parts');
    expect(characterPartSlotId('used')).toBe('partner-used');
  });
});

describe('character part editing', () => {
  it('keeps each character independent', () => {
    let state = createInitialWorkbenchState();
    state = withCharacterPartImage(state, '드워프', 'upset', image('dwarf.png'));
    state = withCharacterPartOffset(state, '드워프', 'upset', 4, -6);

    expect(getCharacterPartImage(state, '드워프', 'upset')).toEqual(image('dwarf.png'));
    expect(getCharacterPartOffset(state, '드워프', 'upset')).toEqual({ x: 4, y: -6 });
    expect(getCharacterPartImage(state, '하피', 'upset')).toBeUndefined();
    expect(getCharacterPartOffset(state, '하피', 'upset')).toEqual({ x: 0, y: 0 });
  });

  it('survives switching the active character back and forth', () => {
    let state = createInitialWorkbenchState();
    state = withCharacterPartImage(state, '물컹이', 'base', image('slime.png'));
    state = withActiveCharacter(state, '오크');
    state = withCharacterPartImage(state, '오크', 'base', image('orc.png'));
    state = withActiveCharacter(state, '물컹이');

    expect(state.activeCharacter).toBe('물컹이');
    expect(getCharacterPartImage(state, '물컹이', 'base')).toEqual(image('slime.png'));
    expect(getCharacterPartImage(state, '오크', 'base')).toEqual(image('orc.png'));
    expect(withActiveCharacter(state, '물컹이')).toBe(state);
  });

  it('refuses a part a character does not have, and refuses an unexportable offset', () => {
    const state = createInitialWorkbenchState();

    expect(withCharacterPartImage(state, '하피', 'used', image('nope.png'))).toBe(state);
    expect(withCharacterPartImage(state, PARTNER_CHARACTER, 'used', image('used.png')))
      .not.toBe(state);

    // Only upset and lose appear in the sidecar, so only they take an offset.
    expect(characterPartHasOffset('base')).toBe(false);
    expect(characterPartHasOffset('used')).toBe(false);
    expect(characterPartHasOffset('upset')).toBe(true);
    expect(characterPartHasOffset('lose')).toBe(true);
    expect(withCharacterPartOffset(state, '하피', 'base', 5, 5)).toBe(state);
    expect(withCharacterPartOffset(state, PARTNER_CHARACTER, 'used', 24, 0)).toBe(state);
    expect(withCharacterPartOffset(state, '하피', 'upset', 5, 5)).not.toBe(state);
  });

  it('never persists an offset the sidecar could not carry back', () => {
    const normalized = normalizeWorkbenchState({
      version: 3,
      characters: {
        김_인턴: { offsets: { used: { x: 24, y: 8 }, base: { x: 3, y: 3 }, lose: { x: 6, y: 2 } } },
      },
    });

    expect(getCharacterPartOffset(normalized, PARTNER_CHARACTER, 'used')).toEqual({ x: 0, y: 0 });
    expect(getCharacterPartOffset(normalized, PARTNER_CHARACTER, 'base')).toEqual({ x: 0, y: 0 });
    expect(getCharacterPartOffset(normalized, PARTNER_CHARACTER, 'lose')).toEqual({ x: 6, y: 2 });
  });

  it('rejects a non-PNG data URL and clears images immutably', () => {
    const state = withCharacterPartImage(
      createInitialWorkbenchState(),
      '고블린',
      'lose',
      image('goblin.png'),
    );

    expect(() =>
      withCharacterPartImage(state, '고블린', 'lose', {
        dataUrl: 'data:image/jpeg;base64,AA==',
        originalName: 'bad.jpg',
      }),
    ).toThrow(/Only PNG/u);
    expect(getCharacterPartImage(withoutCharacterPartImage(state, '고블린', 'lose'), '고블린', 'lose'))
      .toBeUndefined();
    expect(withoutCharacterPartImage(state, '고블린', 'upset')).toBe(state);
  });

  it('clamps offsets to one base frame in either direction', () => {
    let state = createInitialWorkbenchState();
    state = withCharacterPartOffset(state, '오크', 'lose', 9_999, -9_999);
    expect(getCharacterPartOffset(state, '오크', 'lose')).toEqual({
      x: CHARACTER_PART_OFFSET_LIMIT,
      y: -CHARACTER_PART_OFFSET_LIMIT,
    });

    state = withCharacterPartOffset(state, '오크', 'lose', 3.6, Number.NaN);
    expect(getCharacterPartOffset(state, '오크', 'lose')).toEqual({ x: 4, y: 0 });
  });
});

describe('stage slot bindings', () => {
  it('binds the suspect slots to the selection and the partner slots to the partner', () => {
    const state = withActiveCharacter(createInitialWorkbenchState(), '켄타우로스');

    expect(resolveSlotBinding(state, 'suspect-base')).toEqual({
      character: '켄타우로스',
      part: 'base',
    });
    expect(resolveSlotBinding(state, 'suspect-lose-parts')).toEqual({
      character: '켄타우로스',
      part: 'lose',
    });
    expect(resolveSlotBinding(state, 'partner-used')).toEqual({
      character: PARTNER_CHARACTER,
      part: 'used',
    });
    expect(resolveSlotBinding(state, 'bg-room')).toBeUndefined();
  });

  it('routes a stage drop into the bound character and back out again', () => {
    let state = withActiveCharacter(createInitialWorkbenchState(), '서큐버스');
    state = withStageSlotImage(state, 'suspect-state-parts', image('succubus.png'));

    expect(getCharacterPartImage(state, '서큐버스', 'upset')).toEqual(image('succubus.png'));
    expect(state.images['suspect-state-parts']).toBeUndefined();
    expect(resolveStageSlotImage(state, 'suspect-state-parts')).toEqual(image('succubus.png'));

    // Switching characters swaps what the stage shows without losing anything.
    const other = withActiveCharacter(state, '드워프');
    expect(resolveStageSlotImage(other, 'suspect-state-parts')).toBeUndefined();
    expect(resolveStageSlotImage(withActiveCharacter(other, '서큐버스'), 'suspect-state-parts'))
      .toEqual(image('succubus.png'));

    expect(resolveStageSlotImage(withoutStageSlotImage(state, 'suspect-state-parts'), 'suspect-state-parts'))
      .toBeUndefined();
  });

  it('leaves unbound slots on the plain slot store', () => {
    const state = withStageSlotImage(createInitialWorkbenchState(), 'bg-room', image('bg.png'));

    expect(state.images['bg-room']).toEqual(image('bg.png'));
    expect(resolveStageSlotImage(state, 'bg-room')).toEqual(image('bg.png'));
  });

  it('keeps production manifest identity stable while editing a bound character preview', () => {
    let state = withActiveCharacter(createInitialWorkbenchState(), '미노타우로스');
    state = withStageSlotImage(state, 'suspect-base', image('mino.png'));
    const manifest = buildAssetManifest(state);

    expect(manifest.slots['suspect-base']?.image).toBe('idle_mulkung_base.png');
    expect(manifest.slots['suspect-state-parts']?.image).toBe('idle_mulkung_upset.png');
  });
});

describe('sidecar round trip', () => {
  it('serializes exactly the checked-in v2.0 shape', async () => {
    let state = createInitialWorkbenchState();
    state = withCharacterPartOffset(state, '고블린', 'upset', 0, 0);
    const built = buildCharacterPartsManifest(state, '고블린');
    const onDisk = JSON.parse(
      await readFile(new URL('portrait_고블린.state-parts.json', PORTRAIT_DIRECTORY), 'utf8'),
    ) as unknown;

    expect(built).toEqual(onDisk);
    expect(characterPartsJsonName('고블린')).toBe('portrait_고블린.state-parts.json');

    const serialized = serializeCharacterPartsManifest(state, '고블린');
    expect(serialized.endsWith('\n')).toBe(true);
    expect(JSON.parse(serialized)).toEqual(onDisk);
  });

  it('matches every checked-in sidecar byte for byte at zero offsets', async () => {
    const state = createInitialWorkbenchState();
    for (const character of WORKBENCH_CHARACTERS) {
      const onDisk = await readFile(
        new URL(characterPartsJsonName(character), PORTRAIT_DIRECTORY),
        'utf8',
      );
      expect(serializeCharacterPartsManifest(state, character), character).toBe(onDisk);
    }
  });

  it('reads a sidecar back into offsets and recovers its character', async () => {
    const source = JSON.parse(
      await readFile(new URL('portrait_드워프.state-parts.json', PORTRAIT_DIRECTORY), 'utf8'),
    ) as Record<string, unknown>;
    const edited = {
      ...source,
      state_parts: (source.state_parts as readonly Record<string, unknown>[]).map((part) =>
        part.state === 'upset' ? { ...part, x: 7, y: -3 } : part,
      ),
    };

    expect(characterFromPartsManifest(edited)).toBe('드워프');
    const state = withImportedCharacterParts(createInitialWorkbenchState(), '드워프', edited);
    expect(getCharacterPartOffset(state, '드워프', 'upset')).toEqual({ x: 7, y: -3 });
    expect(getCharacterPartOffset(state, '드워프', 'lose')).toEqual({ x: 0, y: 0 });

    // Export what was imported and the file comes back identical.
    expect(JSON.parse(serializeCharacterPartsManifest(state, '드워프'))).toEqual(edited);
  });

  it('rejects a document that is not a 2.0 sidecar', () => {
    const state = createInitialWorkbenchState();
    expect(() => withImportedCharacterParts(state, '오크', { schema_version: '1.0' }))
      .toThrow(/2\.0/u);
    expect(() => withImportedCharacterParts(state, '오크', null)).toThrow(/2\.0/u);
    expect(() =>
      withImportedCharacterParts(state, '오크', { schema_version: '2.0', state_parts: 'nope' }),
    ).toThrow(/state_parts/u);
  });

  it('returns no character for an unknown or malformed base image', () => {
    expect(characterFromPartsManifest({ base: { image: 'portrait_없는_사람_base.png' } }))
      .toBeUndefined();
    expect(characterFromPartsManifest({ base: { image: 42 } })).toBeUndefined();
    expect(characterFromPartsManifest(undefined)).toBeUndefined();
  });
});

describe('v2 to v3 persistence', () => {
  it('migrates the anonymous suspect slots onto the default character', () => {
    const legacy = {
      version: 2,
      transforms: {
        'suspect-base': { x: 212, y: 34, rotation: 0, scaleX: 216 / 512, scaleY: 216 / 512 },
        'suspect-state-parts': {
          x: 216,
          y: 38,
          rotation: 0,
          scaleX: 216 / 512,
          scaleY: 216 / 512,
        },
      },
      locks: { 'bg-room': true },
      images: {
        'suspect-base': { dataUrl: PNG_DATA_URL, originalName: 'legacy-base.png' },
        'suspect-state-parts': { dataUrl: PNG_DATA_URL, originalName: 'legacy-upset.png' },
        'partner-used': { dataUrl: PNG_DATA_URL, originalName: 'legacy-used.png' },
        'bg-room': { dataUrl: PNG_DATA_URL, originalName: 'legacy-bg.png' },
      },
    };

    const migrated = normalizeWorkbenchState(legacy);

    expect(migrated.version).toBe(WORKBENCH_STATE_VERSION);
    expect(migrated.activeCharacter).toBe(DEFAULT_WORKBENCH_CHARACTER);
    expect(getCharacterPartImage(migrated, DEFAULT_WORKBENCH_CHARACTER, 'base')?.originalName)
      .toBe('legacy-base.png');
    expect(getCharacterPartImage(migrated, DEFAULT_WORKBENCH_CHARACTER, 'upset')?.originalName)
      .toBe('legacy-upset.png');
    // The partner's cooldown sheet always belongs to the partner.
    expect(getCharacterPartImage(migrated, PARTNER_CHARACTER, 'used')?.originalName)
      .toBe('legacy-used.png');
    // Unbound slots keep living in the plain slot store.
    expect(migrated.images['bg-room']?.originalName).toBe('legacy-bg.png');
    expect(migrated.images['suspect-base']).toBeUndefined();
    expect(migrated.locks['bg-room']).toBe(true);

    // A 4px stage nudge on a 216px frame is ~9px in the authored 512 space.
    expect(getCharacterPartOffset(migrated, DEFAULT_WORKBENCH_CHARACTER, 'upset')).toEqual({
      x: 9,
      y: 9,
    });
  });

  it('leaves a v3 document alone on reload', () => {
    let state = createInitialWorkbenchState();
    state = withActiveCharacter(state, '타락한_용사');
    state = withCharacterPartImage(state, '타락한_용사', 'lose', image('fallen.png'));
    state = withCharacterPartOffset(state, '타락한_용사', 'lose', -12, 5);
    state = withStageSlotImage(state, 'card-base', image('card.png'));

    const storage = new MemoryStorage();
    saveWorkbenchState(storage, state);
    const reloaded = loadWorkbenchState(storage);

    expect(reloaded).toEqual(state);
    expect(reloaded.activeCharacter).toBe('타락한_용사');
    expect(getCharacterPartOffset(reloaded, '타락한_용사', 'lose')).toEqual({ x: -12, y: 5 });
  });

  it('drops untrusted characters, parts, and malformed images', () => {
    const normalized = normalizeWorkbenchState({
      version: 3,
      activeCharacter: '존재하지_않는_캐릭터',
      characters: {
        오크: {
          images: {
            base: { dataUrl: PNG_DATA_URL, originalName: 'orc.png' },
            upset: { dataUrl: 'data:image/jpeg;base64,AA==', originalName: 'bad.jpg' },
            used: { dataUrl: PNG_DATA_URL, originalName: 'orc-has-no-used.png' },
          },
          offsets: { lose: { x: '5', y: 9_999 }, base: { x: 3, y: 3 } },
        },
        없는캐릭터: { images: { base: { dataUrl: PNG_DATA_URL, originalName: 'x.png' } } },
      },
    });

    expect(normalized.activeCharacter).toBe(DEFAULT_WORKBENCH_CHARACTER);
    expect(getCharacterPartImage(normalized, '오크', 'base')?.originalName).toBe('orc.png');
    expect(getCharacterPartImage(normalized, '오크', 'upset')).toBeUndefined();
    expect(getCharacterPartImage(normalized, '오크', 'used')).toBeUndefined();
    expect(getCharacterPartOffset(normalized, '오크', 'lose')).toEqual({
      x: 0,
      y: CHARACTER_PART_OFFSET_LIMIT,
    });
    expect(getCharacterPartOffset(normalized, '오크', 'base')).toEqual({ x: 0, y: 0 });
    expect(Object.keys(normalized.characters).sort()).toEqual([...WORKBENCH_CHARACTERS].sort());
    expect(normalized.characters).not.toHaveProperty('없는캐릭터');
  });

  it('starts every character empty', () => {
    const state = createInitialWorkbenchState();
    for (const character of WORKBENCH_CHARACTERS as readonly WorkbenchCharacter[]) {
      expect(state.characters[character], character).toEqual({ images: {}, offsets: {} });
    }
  });
});
