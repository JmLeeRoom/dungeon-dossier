import {
  migrateSave,
  type SaveData,
} from '../../content-io/schemas';

export interface SaveStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export const DEFAULT_SAVE_KEY = 'dungeon-dossier.save';

export function importSaveJson(json: string): SaveData {
  return migrateSave(JSON.parse(json) as unknown);
}

export function exportSaveJson(input: unknown): string {
  return JSON.stringify(migrateSave(input));
}

/**
 * Persists only the strict SaveSchema projection. Case/evidence/card definition
 * objects are rejected by Zod rather than silently copied into storage.
 */
export class SaveRepository {
  readonly #storage: SaveStorage;
  readonly #key: string;

  constructor(storage: SaveStorage, key = DEFAULT_SAVE_KEY) {
    this.#storage = storage;
    this.#key = key;
  }

  load(): SaveData | undefined {
    const json = this.#storage.getItem(this.#key);
    return json === null ? undefined : importSaveJson(json);
  }

  save(input: unknown): SaveData {
    const data = migrateSave(input);
    this.#storage.setItem(this.#key, JSON.stringify(data));
    return data;
  }

  clear(): void {
    this.#storage.removeItem(this.#key);
  }
}
