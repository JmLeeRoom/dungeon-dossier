import { describe, expect, it } from 'vitest';

import { createRunSaveRepository } from '../../src/app/autoplayStorage';
import { DEFAULT_SAVE_KEY, type SaveStorage } from '../../src/app/save';

const WORKBENCH_KEY = 'dungeon-dossier.asset-workbench.v2';

function memoryStorage(initial: Readonly<Record<string, string>>): {
  readonly storage: SaveStorage;
  readonly values: Map<string, string>;
} {
  const values = new Map(Object.entries(initial));
  return {
    values,
    storage: {
      getItem: (key) => values.get(key) ?? null,
      setItem: (key, value) => values.set(key, value),
      removeItem: (key) => values.delete(key),
    },
  };
}

describe('autoplay storage isolation', () => {
  it('removes only the run save and preserves workbench transforms and locks', () => {
    const workbenchState = JSON.stringify({
      transforms: { 'bg-room': { x: 24, y: 12, rotation: 0.25 } },
      locks: { 'bg-room': true },
    });
    const { storage, values } = memoryStorage({
      [DEFAULT_SAVE_KEY]: '{"schema_version":"1.0"}',
      [WORKBENCH_KEY]: workbenchState,
      'dungeon-dossier.unrelated-preference': 'keep-me',
    });

    createRunSaveRepository(storage, true);

    expect(values.has(DEFAULT_SAVE_KEY)).toBe(false);
    expect(values.get(WORKBENCH_KEY)).toBe(workbenchState);
    expect(values.get('dungeon-dossier.unrelated-preference')).toBe('keep-me');
  });

  it('does not remove the run save during an ordinary bootstrap', () => {
    const { storage, values } = memoryStorage({
      [DEFAULT_SAVE_KEY]: 'keep-run',
      [WORKBENCH_KEY]: 'keep-workbench',
    });

    createRunSaveRepository(storage, false);

    expect(values.get(DEFAULT_SAVE_KEY)).toBe('keep-run');
    expect(values.get(WORKBENCH_KEY)).toBe('keep-workbench');
  });
});
