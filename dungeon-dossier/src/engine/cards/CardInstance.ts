import type { ContentId } from '../domain';

/**
 * v2 card identity (design §3.3.3). A hand never addresses cards by
 * definition id again: two copies of the same blueprint are distinct
 * instances, so selection, discard, evidence docking, and Map keys stay
 * unambiguous. Definitions stay authored content, blueprints carry permanent
 * per-run enhancement, and instances are transient per-draw envelopes.
 */
export interface CardInstance {
  readonly instanceId: string;
  readonly blueprintId: ContentId;
}

/**
 * Run-owned identity counters. `encounterAttemptOrdinal` increases only on
 * encounter entry or retry — never on a submit remount — and
 * `nextDrawSerial` increases on every minted instance and is saved, so ids
 * never collide across retries, re-entries, or save resume.
 */
export interface RunIdentityState {
  readonly runInstanceId: string;
  readonly encounterAttemptOrdinal: number;
  readonly nextDrawSerial: number;
}

function assertIdSegment(name: string, value: string): void {
  if (value.length === 0) {
    throw new Error(`${name} must be a non-empty string.`);
  }
  // Identity ids are colon-joined; a colon inside a segment could make two
  // different (node, attempt, serial) triples collide on the same string.
  if (value.includes(':')) {
    throw new Error(`${name} must not contain ':' (got "${value}").`);
  }
}

function assertCounter(name: string, value: number): void {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new Error(`${name} must be a non-negative safe integer.`);
  }
}

export function createRunIdentityState(
  runInstanceId: string,
): RunIdentityState {
  assertIdSegment('runInstanceId', runInstanceId);
  return { runInstanceId, encounterAttemptOrdinal: 0, nextDrawSerial: 0 };
}

/** Encounter entry / retry only. A submit remount must not advance this. */
export function beginEncounterAttempt(
  identity: RunIdentityState,
): RunIdentityState {
  assertCounter('encounterAttemptOrdinal', identity.encounterAttemptOrdinal);
  return {
    ...identity,
    encounterAttemptOrdinal: identity.encounterAttemptOrdinal + 1,
  };
}

/** `attemptId = runInstanceId:nodeId:ordinal` (design §3.1.3). */
export function createEncounterAttemptId(
  identity: Pick<RunIdentityState, 'runInstanceId' | 'encounterAttemptOrdinal'>,
  nodeId: ContentId,
): string {
  assertIdSegment('runInstanceId', identity.runInstanceId);
  assertIdSegment('nodeId', nodeId);
  assertCounter('encounterAttemptOrdinal', identity.encounterAttemptOrdinal);
  return `${identity.runInstanceId}:${nodeId}:${identity.encounterAttemptOrdinal}`;
}

/** `instanceId = nodeId:attemptId:drawSerial` (design §3.3.3). */
export function createCardInstanceId(
  nodeId: ContentId,
  encounterAttemptId: string,
  drawSerial: number,
): string {
  assertIdSegment('nodeId', nodeId);
  if (encounterAttemptId.length === 0) {
    throw new Error('encounterAttemptId must be a non-empty string.');
  }
  assertCounter('drawSerial', drawSerial);
  return `${nodeId}:${encounterAttemptId}:${drawSerial}`;
}

export interface MintCardInstanceResult {
  readonly instance: CardInstance;
  readonly identity: RunIdentityState;
}

/**
 * Mints one transient instance for a drawn blueprint and persists the
 * advanced serial. Effects and display resolve through
 * instance -> blueprint -> definition/attachments, never through the id.
 */
export function mintCardInstance(
  identity: RunIdentityState,
  nodeId: ContentId,
  blueprintId: ContentId,
): MintCardInstanceResult {
  assertIdSegment('blueprintId', blueprintId);
  assertCounter('nextDrawSerial', identity.nextDrawSerial);
  const attemptId = createEncounterAttemptId(identity, nodeId);
  return {
    instance: {
      instanceId: createCardInstanceId(nodeId, attemptId, identity.nextDrawSerial),
      blueprintId,
    },
    identity: { ...identity, nextDrawSerial: identity.nextDrawSerial + 1 },
  };
}

export interface InstanceHandState {
  readonly hand: readonly CardInstance[];
  readonly discardPile: readonly CardInstance[];
}

export interface PlayCardInstanceResult {
  readonly state: InstanceHandState;
  readonly played: CardInstance;
}

function assertUniqueInstanceIds(state: InstanceHandState): void {
  const ids = [...state.hand, ...state.discardPile].map(
    (card) => card.instanceId,
  );
  if (new Set(ids).size !== ids.length) {
    throw new Error('Card instance ids must be unique across hand and discard.');
  }
}

/**
 * Moves exactly the selected physical copy to discard. Duplicate blueprints
 * in hand are expected; only an unknown instanceId is an error.
 */
export function playCardInstance(
  state: InstanceHandState,
  instanceId: string,
): PlayCardInstanceResult {
  assertUniqueInstanceIds(state);
  const played = state.hand.find((card) => card.instanceId === instanceId);
  if (played === undefined) {
    throw new Error(`Card instance ${instanceId} is not in hand.`);
  }
  return {
    state: {
      hand: state.hand.filter((card) => card.instanceId !== instanceId),
      discardPile: [...state.discardPile, played],
    },
    played,
  };
}

export interface DiscardHandInstancesResult {
  readonly state: InstanceHandState;
  readonly discardedInstanceIds: readonly string[];
}

/** Discards the whole remaining hand, preserving duplicate copies. */
export function discardHandInstances(
  state: InstanceHandState,
): DiscardHandInstancesResult {
  assertUniqueInstanceIds(state);
  return {
    state: {
      hand: [],
      discardPile: [...state.discardPile, ...state.hand],
    },
    discardedInstanceIds: state.hand.map((card) => card.instanceId),
  };
}
