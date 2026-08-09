import { canonicalStringify } from '../log/canonicalStringify';
import type { EncounterRuntimeState } from './EncounterRuntimeState';

export const COMMITTED_ENCOUNTER_SNAPSHOT_VERSION = 1 as const;

export interface CommittedEncounterSnapshot {
  readonly version: typeof COMMITTED_ENCOUNTER_SNAPSHOT_VERSION;
  readonly encounterId: string;
  readonly nodeId: string;
  readonly encounterAttemptId: string;
  readonly contentRevision: string;
  readonly acknowledgedDecisionId: string | null;
  readonly state: EncounterRuntimeState;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function requireString(record: Record<string, unknown>, key: string): string {
  const value = record[key];
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error(`Committed encounter snapshot requires ${key}.`);
  }
  return value;
}

function assertNonNegativeInteger(name: string, value: unknown): asserts value is number {
  if (!Number.isSafeInteger(value) || (value as number) < 0) {
    throw new Error(`Committed encounter snapshot ${name} must be a non-negative safe integer.`);
  }
}

/** Runtime validation for the P0-3 same-process checkpoint, not the P3 disk schema. */
export function assertCommittedEncounterState(
  state: EncounterRuntimeState,
): void {
  assertNonNegativeInteger('turnsSpent', state.turnsSpent);
  assertNonNegativeInteger('sourceRevision', state.sourceRevision);
  assertNonNegativeInteger('presentationRevision', state.presentationRevision);
  assertNonNegativeInteger('nextDrawSerial', state.nextDrawSerial);
  assertNonNegativeInteger('CARD_DRAW cursor', state.cardDrawCursor);
  assertNonNegativeInteger('activeRoundIndex', state.activeRoundIndex);
  assertNonNegativeInteger('presentedRoundIndex', state.presentedRoundIndex);
  if ((state.presentedRoundIndex ?? 0) > (state.activeRoundIndex ?? 0)) {
    throw new Error('Committed encounter snapshot round cursors are inconsistent.');
  }
  if (state.claimIdByFacet === undefined || state.shieldDurabilityByClaimId === undefined) {
    throw new Error('Committed encounter snapshot requires active-round state.');
  }
  for (const [claimId, durability] of Object.entries(state.shieldDurabilityByClaimId)) {
    if (claimId.length === 0 || !Number.isSafeInteger(durability) || durability < 0) {
      throw new Error('Committed encounter snapshot has invalid shield durability.');
    }
  }
  if (state.cardDrawRngState === undefined) {
    throw new Error('Committed encounter snapshot requires CARD_DRAW RNG state.');
  }
  assertNonNegativeInteger('CARD_DRAW RNG value', state.cardDrawRngState.value);
  if (state.drawSlots?.length !== 5) {
    throw new Error('Committed encounter snapshot requires exactly five draw slots.');
  }
  const instances = state.handInstances ?? [];
  if (instances.length !== state.deck.hand.length) {
    throw new Error('Committed encounter snapshot hand instances are desynchronized.');
  }
  if (new Set(instances.map((instance) => instance.instanceId)).size !== instances.length) {
    throw new Error('Committed encounter snapshot has duplicate hand instance ids.');
  }
  for (let index = 0; index < instances.length; index += 1) {
    if (instances[index]!.blueprintId !== state.deck.hand[index]) {
      throw new Error('Committed encounter snapshot hand order is desynchronized.');
    }
  }
  const pending = state.pendingSecureDecision ?? null;
  if ((state.machine.state === 'AWAIT_SECURE_DECISION') !== (pending !== null)) {
    throw new Error('Committed encounter snapshot decision phase is inconsistent.');
  }
  if (pending !== null && pending.sourceRevision !== state.sourceRevision) {
    throw new Error('Committed encounter snapshot decision revision is stale.');
  }
  if ((state.turnsSpent ?? 0) > 0 && state.resources.turn > (state.turnsSpent ?? 0) + 1) {
    throw new Error('Committed encounter snapshot turn counters are inconsistent.');
  }
}

export function encodeCommittedEncounterSnapshot(
  snapshot: CommittedEncounterSnapshot,
): string {
  if (snapshot.version !== COMMITTED_ENCOUNTER_SNAPSHOT_VERSION) {
    throw new Error('Unsupported committed encounter snapshot version.');
  }
  assertCommittedEncounterState(snapshot.state);
  return canonicalStringify(snapshot);
}

export function decodeCommittedEncounterSnapshot(
  encoded: string,
): CommittedEncounterSnapshot {
  let parsed: unknown;
  try {
    parsed = JSON.parse(encoded) as unknown;
  } catch (error) {
    throw new Error('Committed encounter snapshot is not valid JSON.', { cause: error });
  }
  if (!isRecord(parsed)) throw new Error('Committed encounter snapshot must be an object.');
  if (parsed['version'] !== COMMITTED_ENCOUNTER_SNAPSHOT_VERSION) {
    throw new Error(`Unsupported committed encounter snapshot version ${String(parsed['version'])}.`);
  }
  const acknowledged = parsed['acknowledgedDecisionId'];
  if (acknowledged !== null && typeof acknowledged !== 'string') {
    throw new Error('Committed encounter snapshot has an invalid acknowledgedDecisionId.');
  }
  const state = parsed['state'];
  if (!isRecord(state)) throw new Error('Committed encounter snapshot requires state.');
  const snapshot: CommittedEncounterSnapshot = {
    version: COMMITTED_ENCOUNTER_SNAPSHOT_VERSION,
    encounterId: requireString(parsed, 'encounterId'),
    nodeId: requireString(parsed, 'nodeId'),
    encounterAttemptId: requireString(parsed, 'encounterAttemptId'),
    contentRevision: requireString(parsed, 'contentRevision'),
    acknowledgedDecisionId: acknowledged,
    state: state as unknown as EncounterRuntimeState,
  };
  assertCommittedEncounterState(snapshot.state);
  return snapshot;
}
