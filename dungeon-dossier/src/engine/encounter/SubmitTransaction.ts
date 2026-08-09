import type { KnowledgeState } from '../knowledge';
import type { Resolution } from '../resolution';
import type {
  EncounterRuntimeState,
  PendingSecureDecision,
} from './EncounterRuntimeState';
import type { EncounterOutcome, OutcomeReason } from './OutcomeEvaluator';
import type { EncounterResourceState } from './ResourceSystem';

export type {
  PendingFlowPresentation,
  PendingSecureDecision,
} from './EncounterRuntimeState';

/**
 * v2 atomic-Submit contracts (design §3.3.2). P0-3A owns only the types and
 * the pure helpers; the coordinator adopts them in P0-3B. Turn counting is
 * intentionally not a resource delta: `turnsSpent`/`currentTurn` travel on the
 * receipt and commits instead.
 */
export type EncounterResourceKey = Exclude<
  keyof EncounterResourceState,
  'turn'
>;

// A Record over the derived key union enforces exhaustiveness in both
// directions: adding a resource to EncounterResourceState without listing it
// here (or listing a key the state no longer has) is a compile error.
const ENCOUNTER_RESOURCE_DELTA_KEY_SET: Readonly<
  Record<EncounterResourceKey, true>
> = {
  composure: true,
  commandPoints: true,
  coercion: true,
  stress: true,
  dp: true,
  trust: true,
};

export const ENCOUNTER_RESOURCE_DELTA_KEYS = Object.freeze(
  Object.keys(ENCOUNTER_RESOURCE_DELTA_KEY_SET),
) as readonly EncounterResourceKey[];

/** Fixed-key `after - before` map. Zeros are preserved, never omitted. */
export type ResourceDelta = Readonly<Record<EncounterResourceKey, number>>;

export function zeroResourceDelta(): ResourceDelta {
  return Object.freeze(
    Object.fromEntries(ENCOUNTER_RESOURCE_DELTA_KEYS.map((key) => [key, 0])),
  ) as Record<EncounterResourceKey, number>;
}

export function computeResourceDelta(
  before: Pick<EncounterResourceState, EncounterResourceKey>,
  after: Pick<EncounterResourceState, EncounterResourceKey>,
): ResourceDelta {
  const entries = ENCOUNTER_RESOURCE_DELTA_KEYS.map((key) => {
    const delta = after[key] - before[key];
    if (!Number.isFinite(delta)) {
      throw new Error(`Resource delta for ${key} must be finite.`);
    }
    return [key, delta] as const;
  });
  return Object.freeze(
    Object.fromEntries(entries),
  ) as Record<EncounterResourceKey, number>;
}

/** Phase deltas are disjoint, so their sum must equal the end-to-end change. */
export function addResourceDeltas(
  ...deltas: readonly ResourceDelta[]
): ResourceDelta {
  const entries = ENCOUNTER_RESOURCE_DELTA_KEYS.map((key) => [
    key,
    deltas.reduce((total, delta) => total + delta[key], 0),
  ] as const);
  return Object.freeze(
    Object.fromEntries(entries),
  ) as Record<EncounterResourceKey, number>;
}

export function isZeroResourceDelta(delta: ResourceDelta): boolean {
  return ENCOUNTER_RESOURCE_DELTA_KEYS.every((key) => delta[key] === 0);
}

/**
 * One rendered view of the encounter. `snapshot` carries the full logical
 * state; `knowledge` is the whitelist projection the DTO layer may publish;
 * `presentationRevision` is the publication cursor and can lag behind the
 * logical revision while a flow presentation is pending.
 */
export interface EncounterPresentationFrame {
  readonly snapshot: EncounterRuntimeState;
  readonly knowledge: KnowledgeState;
  readonly presentationRevision: number;
}

/**
 * `decisionId` is deterministic so double clicks, remounts, and autoplay
 * replays of the same checkpoint are idempotent, while any newer engine
 * command changes `sourceRevision` and therefore mints a different id.
 */
export function createDecisionId(
  encounterAttemptId: string,
  turnsSpent: number,
  sourceRevision: number,
): string {
  if (encounterAttemptId.length === 0) {
    throw new Error('decisionId requires a non-empty encounterAttemptId.');
  }
  if (!Number.isInteger(turnsSpent) || turnsSpent < 0) {
    throw new Error('decisionId requires a non-negative integer turnsSpent.');
  }
  if (!Number.isInteger(sourceRevision) || sourceRevision < 0) {
    throw new Error('decisionId requires a non-negative integer sourceRevision.');
  }
  return `${encounterAttemptId}:${turnsSpent}:${sourceRevision}`;
}

/**
 * Everything a valid Submit settled: the impact view (card effects applied,
 * turn not yet closed), the settled view (hand discarded, ON_TURN_END and the
 * flow logical commit done), and the per-phase resource deltas that let the
 * presenter attribute numbers to the right stage.
 */
export interface SubmitSettlementReceipt {
  /**
   * The judgment the play received. Carried on the receipt so the app's
   * banner/reaction layer never has to recompute or re-run the resolver;
   * displayed numbers still come from `actionResourceDelta`, not from the
   * resolution's nominal effects.
   */
  readonly resolution: Resolution;
  readonly impactFrame: EncounterPresentationFrame;
  readonly settledFrame: EncounterPresentationFrame;
  /** preSubmit -> impact, including the CP cost of the played instance. */
  readonly actionResourceDelta: ResourceDelta;
  /** impact -> after ON_TURN_END of the pre-flow active modifier set. */
  readonly turnEndResourceDelta: ResourceDelta;
  /** before flow entry -> settled (the entered node's resource_delta). */
  readonly flowEntryResourceDelta: ResourceDelta;
  readonly submittedInstanceId: string;
  readonly discardedInstanceIds: readonly string[];
  readonly turnsSpent: number;
}

export interface InputCommit {
  readonly phase: 'INPUT';
  readonly committedFrame: EncounterPresentationFrame;
  /** settled -> committed: CP restore, duration ticks, turn-start effects. */
  readonly turnStartResourceDelta: ResourceDelta;
  readonly drawnInstanceIds: FiveCardInstanceIds;
}

export type FiveCardInstanceIds = readonly [
  string,
  string,
  string,
  string,
  string,
];

export interface TerminalCommit {
  readonly phase: 'TERMINAL';
  readonly committedFrame: EncounterPresentationFrame;
  readonly turnStartResourceDelta: ResourceDelta;
  readonly drawnInstanceIds: readonly [];
  readonly outcome: EncounterOutcome;
  /** Why the encounter ended; drives dead-scene and result presentation. */
  readonly reason: OutcomeReason;
}

export type ContinuationCommit = InputCommit | TerminalCommit;

export type NonBestEncounterOutcome = Exclude<
  EncounterOutcome,
  'BEST_RESOLUTION'
>;

export type SubmitRejectionReason =
  | 'CP'
  | 'TARGET'
  | 'TAG'
  | 'EVIDENCE'
  | 'BUSY';

/**
 * A rejected Submit changes nothing; a committed Submit always consumed the
 * turn and either continued, terminated, or froze at the secure decision. In
 * the decision arm `committedFrame` shares the settled frame's logical
 * revision: no next turn exists yet, so its turn-start delta is all zero and
 * nothing was drawn.
 */
export type SubmitTransactionResult =
  | {
      readonly kind: 'REJECTED';
      readonly reason: SubmitRejectionReason;
      readonly snapshot: EncounterRuntimeState;
    }
  | ({ readonly kind: 'COMMITTED' } & SubmitSettlementReceipt &
      ContinuationCommit)
  | ({ readonly kind: 'COMMITTED' } & SubmitSettlementReceipt & {
      readonly phase: 'AWAIT_SECURE_DECISION';
      readonly committedFrame: EncounterPresentationFrame;
      readonly turnStartResourceDelta: ResourceDelta;
      readonly drawnInstanceIds: readonly [];
      readonly pendingDecision: PendingSecureDecision;
    });

export type SecureDecisionRejectionReason = 'STALE_DECISION' | 'BUSY';

/**
 * Typed results of resolveSecureDecision. Secure preserves committed flow
 * logic but never draws or starts a turn; Continue never spends a turn and
 * either starts the next turn or ends as a non-BEST outcome on the final one.
 */
export type SecureDecisionResult =
  | {
      readonly kind: 'REJECTED';
      readonly reason: SecureDecisionRejectionReason;
      readonly snapshot: EncounterRuntimeState;
    }
  | ({
      readonly kind: 'COMMITTED';
      readonly decisionId: string;
      readonly choice: 'SECURE';
      readonly settledFrame: EncounterPresentationFrame;
    } & TerminalCommit & { readonly outcome: 'BEST_RESOLUTION' })
  | ({
      readonly kind: 'COMMITTED';
      readonly decisionId: string;
      readonly choice: 'CONTINUE';
      readonly settledFrame: EncounterPresentationFrame;
    } & (
      | InputCommit
      | (TerminalCommit & { readonly outcome: NonBestEncounterOutcome })
    ));
