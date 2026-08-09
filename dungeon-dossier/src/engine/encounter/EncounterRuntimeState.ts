import type { CardInstance, DeckState } from '../cards';
import type { ContentId, ActionIntent, Facet, Grade } from '../domain';
import type { KnowledgeState } from '../knowledge';
import type { JudgmentLog } from '../log';
import type { AppliedClaimState } from '../resolution';
import type { RngState } from '../rng';
import type { EncounterMachineSnapshot } from './EncounterStateMachine';
import type {
  ModifierRuntimeCard,
  ModifierRuntimeEvidence,
} from './ModifierSystem';
import type { ObjectiveEvaluationSummary } from './ObjectiveEvaluator';
import type {
  EncounterOutcome,
  SecureDeclineDisposition,
} from './OutcomeEvaluator';
import type {
  EncounterResourceState,
  TurnDurationMap,
} from './ResourceSystem';
import type { BasicDrawSlots } from './TurnDrawPolicy';

/**
 * Canonical encounter runtime data, extracted from the coordinator so the
 * v2 transaction contracts (SubmitTransaction) can reference the snapshot
 * without creating an import cycle. The coordinator re-exports these names,
 * so existing import sites keep working.
 */
export interface EncounterEvidenceRuntime extends ModifierRuntimeEvidence {
  readonly acquired: boolean;
  readonly grade: Grade;
}

export interface EncounterClaimRuntime extends AppliedClaimState {
  readonly lockedUntilTurn?: number;
}

/** Logical and published cursors for P1's one-round-at-a-time confrontation. */
export interface InterrogationRoundState {
  readonly activeRoundIndex: number;
  readonly presentedRoundIndex: number;
  readonly claimIdByFacet: Readonly<Record<Facet, ContentId>>;
  readonly shieldDurabilityByClaimId: Readonly<Record<ContentId, number>>;
}

/**
 * A flow node whose logical effects are committed but whose statement and
 * claim reveal have not been published yet. Continue publishes it exactly
 * once; Secure and settlement terminals discard it without replaying effects.
 */
export interface PendingFlowPresentation {
  readonly targetNodeId: ContentId;
  readonly sourceRevision: number;
  readonly previousPresentationRevision: number;
}

/**
 * The canonical AWAIT_SECURE_DECISION checkpoint. Serialized as-is: a save
 * made mid-decision restores the same decision instead of re-deriving it.
 */
export interface PendingSecureDecision {
  readonly decisionId: string;
  readonly sourceRevision: number;
  readonly offeredAfterTurn: number;
  readonly onDecline: SecureDeclineDisposition;
  readonly contentRevision: string;
  readonly pendingFlowPresentation: PendingFlowPresentation | null;
}

export interface EncounterRuntimeState {
  readonly machine: EncounterMachineSnapshot;
  readonly resources: EncounterResourceState;
  readonly claims: Readonly<Record<ContentId, EncounterClaimRuntime>>;
  readonly evidence: Readonly<Record<ContentId, EncounterEvidenceRuntime>>;
  readonly cards: Readonly<Record<ContentId, ModifierRuntimeCard>>;
  readonly deck: DeckState;
  readonly flowNodeId: ContentId | null;
  readonly enteredFlowNodeIds: readonly ContentId[];
  readonly openRouteIds: readonly ContentId[];
  readonly usedRouteIds: readonly ContentId[];
  readonly activeModifierIds: readonly ContentId[];
  readonly modifierActivations: Readonly<Record<ContentId, number>>;
  readonly resolutionEffectActivations: Readonly<Record<ContentId, number>>;
  readonly durations: TurnDurationMap;
  readonly cooldowns: TurnDurationMap;
  readonly actionLocks: Readonly<Partial<Record<ActionIntent, number>>>;
  readonly actionCostDeltas: Readonly<Partial<Record<ActionIntent, number>>>;
  readonly revealedIds: readonly ContentId[];
  readonly objectives: ObjectiveEvaluationSummary;
  readonly rngState: RngState;
  readonly log: JudgmentLog;
  readonly outcome: EncounterOutcome | null;

  // v2 atomic-turn-loop state (design §3.3.2/§3.3.3). Present only when the
  // coordinator runs in 'V2_ATOMIC' mode; LEGACY snapshots omit every field.
  /** Turns fully consumed by valid Submits. `currentTurn = turnsSpent + 1` at INPUT. */
  readonly turnsSpent?: number;
  /** Duplicate-safe envelopes parallel to `deck.hand` (same order). */
  readonly handInstances?: readonly CardInstance[];
  /** Next draw serial for minted instance ids; persisted so ids never collide. */
  readonly nextDrawSerial?: number;
  /** Persistent five-slot ownership/weight used by every v2 turn draw. */
  readonly drawSlots?: BasicDrawSlots;
  /** Dedicated stream: card draws never consume modifier/deck-shuffle RNG. */
  readonly cardDrawRngState?: RngState;
  /** Number of CARD_DRAW random steps consumed; +5 per committed INPUT hand. */
  readonly cardDrawCursor?: number;
  /** Previous valid Submit's discard presentation only; never grows unbounded. */
  readonly turnDiscardHistory?: readonly CardInstance[];
  readonly pendingSecureDecision?: PendingSecureDecision | null;
  readonly pendingFlowPresentation?: PendingFlowPresentation | null;
  /** Increments once per accepted engine command, never per render or save. */
  readonly sourceRevision?: number;
  /** Publication cursor; lags the logical state while a flow presentation is pending. */
  readonly presentationRevision?: number;
  /** The knowledge projection the DTO layer may publish right now. */
  readonly publishedKnowledge?: KnowledgeState;

  // P1 active-round projection. Directly-authored unit fixtures that bypass
  // CaseSchema may omit these; validated production v2 encounters never do.
  readonly activeRoundIndex?: number;
  readonly presentedRoundIndex?: number;
  readonly claimIdByFacet?: InterrogationRoundState['claimIdByFacet'];
  readonly shieldDurabilityByClaimId?: InterrogationRoundState['shieldDurabilityByClaimId'];
}
