import { BalanceSchema, type BalanceDefinition } from './schemas';
import {
  ValidatedRuntimeJsonRepository,
  type ValidatedRepositoryOptions,
} from './RuntimeJsonRepository';
import { runtimeContentUrl } from './runtimeContentUrl';

export type BalanceDiffKind = 'ADDED' | 'REMOVED' | 'CHANGED';

export interface BalanceDiffEntry {
  readonly path: string;
  readonly kind: BalanceDiffKind;
  readonly diskValue: unknown;
  readonly currentValue: unknown;
}

export type BalanceDiskStatus = 'NO_SNAPSHOT' | 'IN_SYNC' | 'MODIFIED';

export interface BalanceDiskDiff {
  readonly status: BalanceDiskStatus;
  readonly entries: readonly BalanceDiffEntry[];
}

type JsonPathSegment = string | number;

function deepFreeze<T>(value: T): T {
  if (value === null || typeof value !== 'object' || Object.isFrozen(value)) {
    return value;
  }

  for (const child of Object.values(value as Record<string, unknown>)) {
    deepFreeze(child);
  }
  return Object.freeze(value);
}

function immutableSnapshot(balance: BalanceDefinition): BalanceDefinition {
  return deepFreeze(structuredClone(balance));
}

function isJsonObject(value: unknown): value is Readonly<Record<string, unknown>> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function pathLabel(path: readonly JsonPathSegment[]): string {
  if (path.length === 0) return '$';

  return path.reduce<string>((label, segment, index) => {
    if (typeof segment === 'number') return `${label}[${segment}]`;
    if (/^[A-Za-z_$][A-Za-z0-9_$]*$/u.test(segment)) {
      return index === 0 ? segment : `${label}.${segment}`;
    }
    return `${label}[${JSON.stringify(segment)}]`;
  }, '');
}

function pushDiff(
  entries: BalanceDiffEntry[],
  path: readonly JsonPathSegment[],
  kind: BalanceDiffKind,
  diskValue: unknown,
  currentValue: unknown,
): void {
  entries.push({
    path: pathLabel(path),
    kind,
    diskValue,
    currentValue,
  });
}

function collectMissingValueDiffs(
  entries: BalanceDiffEntry[],
  path: readonly JsonPathSegment[],
  value: unknown,
  kind: 'ADDED' | 'REMOVED',
): void {
  if (Array.isArray(value)) {
    if (value.length === 0) {
      pushDiff(
        entries,
        path,
        kind,
        kind === 'REMOVED' ? value : undefined,
        kind === 'ADDED' ? value : undefined,
      );
      return;
    }
    value.forEach((child, index) => {
      collectMissingValueDiffs(entries, [...path, index], child, kind);
    });
    return;
  }

  if (isJsonObject(value)) {
    const keys = Object.keys(value).sort();
    if (keys.length === 0) {
      pushDiff(
        entries,
        path,
        kind,
        kind === 'REMOVED' ? value : undefined,
        kind === 'ADDED' ? value : undefined,
      );
      return;
    }
    for (const key of keys) {
      collectMissingValueDiffs(entries, [...path, key], value[key], kind);
    }
    return;
  }

  pushDiff(
    entries,
    path,
    kind,
    kind === 'REMOVED' ? value : undefined,
    kind === 'ADDED' ? value : undefined,
  );
}

function collectBalanceDiffs(
  diskValue: unknown,
  currentValue: unknown,
  path: readonly JsonPathSegment[],
  entries: BalanceDiffEntry[],
): void {
  if (Object.is(diskValue, currentValue)) return;

  if (Array.isArray(diskValue) && Array.isArray(currentValue)) {
    const length = Math.max(diskValue.length, currentValue.length);
    for (let index = 0; index < length; index += 1) {
      const diskHasIndex = index < diskValue.length;
      const currentHasIndex = index < currentValue.length;
      if (!diskHasIndex) {
        collectMissingValueDiffs(entries, [...path, index], currentValue[index], 'ADDED');
      } else if (!currentHasIndex) {
        collectMissingValueDiffs(entries, [...path, index], diskValue[index], 'REMOVED');
      } else {
        collectBalanceDiffs(diskValue[index], currentValue[index], [...path, index], entries);
      }
    }
    return;
  }

  if (isJsonObject(diskValue) && isJsonObject(currentValue)) {
    const keys = [...new Set([...Object.keys(diskValue), ...Object.keys(currentValue)])].sort();
    for (const key of keys) {
      const diskHasKey = Object.hasOwn(diskValue, key);
      const currentHasKey = Object.hasOwn(currentValue, key);
      if (!diskHasKey) {
        collectMissingValueDiffs(entries, [...path, key], currentValue[key], 'ADDED');
      } else if (!currentHasKey) {
        collectMissingValueDiffs(entries, [...path, key], diskValue[key], 'REMOVED');
      } else {
        collectBalanceDiffs(diskValue[key], currentValue[key], [...path, key], entries);
      }
    }
    return;
  }

  pushDiff(entries, path, 'CHANGED', diskValue, currentValue);
}

export class BalanceRepository {
  readonly #repository: ValidatedRuntimeJsonRepository<BalanceDefinition>;
  #current: BalanceDefinition | undefined;
  #diskSnapshot: BalanceDefinition | undefined;

  constructor(options: ValidatedRepositoryOptions = {}) {
    this.#repository = new ValidatedRuntimeJsonRepository(BalanceSchema, options);
  }

  async reload(): Promise<BalanceDefinition | undefined> {
    const balance = await this.#repository.load(runtimeContentUrl('common/balance.json'));
    if (!balance) return undefined;

    const snapshot = immutableSnapshot(balance);
    this.#diskSnapshot = snapshot;
    this.#current = snapshot;
    return snapshot;
  }

  applyInstantly(input: unknown): BalanceDefinition | undefined {
    const balance = this.#repository.validateInMemory(input, '<live-balance>');
    if (!balance) return undefined;

    const snapshot = immutableSnapshot(balance);
    this.#current = snapshot;
    return snapshot;
  }

  current(): BalanceDefinition {
    if (!this.#current) throw new Error('Balance data has not been loaded.');
    return this.#current;
  }

  /** Returns a mutable, detached copy suitable for form editing. */
  createDraft(): BalanceDefinition {
    return structuredClone(this.current());
  }

  /** Last successfully fetched balance.json, unaffected by instant applies. */
  diskSnapshot(): BalanceDefinition | undefined {
    return this.#diskSnapshot;
  }

  diffVsDisk(): BalanceDiskDiff {
    if (this.#diskSnapshot === undefined) {
      return { status: 'NO_SNAPSHOT', entries: [] };
    }

    const entries: BalanceDiffEntry[] = [];
    collectBalanceDiffs(this.#diskSnapshot, this.current(), [], entries);
    return {
      status: entries.length === 0 ? 'IN_SYNC' : 'MODIFIED',
      entries,
    };
  }

  hasUnsavedChanges(): boolean {
    return this.diffVsDisk().status === 'MODIFIED';
  }

  /**
   * Validates an optional edited candidate and serializes repository-ready
   * JSON without changing either the live value or the disk snapshot.
   */
  exportJson(input?: unknown): string | undefined {
    const balance =
      input === undefined
        ? this.current()
        : this.#repository.validateInMemory(input, '<balance-export>');
    return balance === undefined ? undefined : `${JSON.stringify(balance, null, 2)}\n`;
  }
}
