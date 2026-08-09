import {
  createCardInstanceId,
  dealInitialHand,
  playCard,
  type CardDefinition,
  type CardInstance,
} from '../cards';
import { COMMITMENT_STATES } from '../domain';
import type {
  ActionIntent,
  BalanceDefinition,
  CaseDefinition,
  CommitmentState,
  ContentId,
  EncounterDefinition,
  Effect,
  Facet,
  Grade,
  ProofScope,
} from '../domain';
import {
  assertAxisTransition,
  assertClaimStateInvariants,
  type ClaimKnowledge,
  type KnowledgeState,
} from '../knowledge';
import { appendJudgmentLog } from '../log';
import {
  applyResolution,
  applyCardCombatProfile,
  claimExposureState,
  hasSolvableProofPath,
  isDomainTruthTrap,
  resolveArgument,
  selectProofRule,
  toResolutionClaim,
  toResolutionEvidence,
  toResolutionProofRule,
  toResolverBalance,
  type Procedure,
  type ClaimExposureState,
  type Resolution,
  type ResolutionRuntimeState,
  validateCardCombatSelection,
} from '../resolution';
import { createRngState, shuffleWithState, type RngState } from '../rng';
import { assertEncounterInvariant } from './EncounterInvariantError';
import type {
  EncounterClaimRuntime,
  EncounterEvidenceRuntime,
  EncounterRuntimeState,
  InterrogationRoundState,
  PendingSecureDecision,
} from './EncounterRuntimeState';
import {
  assertCommittedEncounterState,
  COMMITTED_ENCOUNTER_SNAPSHOT_VERSION,
  decodeCommittedEncounterSnapshot,
  encodeCommittedEncounterSnapshot,
  type CommittedEncounterSnapshot,
} from './EncounterSnapshotCodec';
import {
  EncounterStateMachine,
  type ContentValidationMode,
  type EncounterEvent,
  type FreeReviewQueries,
  type FreeReviewSnapshot,
} from './EncounterStateMachine';
import {
  evaluateFlowCondition,
  runFlowTransition,
  type FlowRuntimeState,
} from './FlowRunner';
import {
  applyModifierEffects,
  applyTriggeredModifiers,
  assertV2TurnBoundaryModifiers,
  type ModifierRuntimeCard,
  type ModifierRuntimeState,
  type ModifierTrigger,
} from './ModifierSystem';
import {
  evaluateObjectives,
  hasSolvableRequiredObjectivePath,
} from './ObjectiveEvaluator';
import {
  EMPTY_TERMINAL_THRESHOLD_FACTS,
  evaluateOutcome,
  evaluateSettlementDirective,
  observeTerminalThresholds,
  reduceTerminalThresholdFacts,
  type BestResolutionConditions,
  type EncounterOutcome,
  type OutcomeEvaluation,
  type OutcomeReason,
  type TerminalThresholdFacts,
} from './OutcomeEvaluator';
import {
  clampResourceState,
  createResourceState,
  processEncounterTurnStart,
  spendCommandPoints,
  type EncounterResourceLimits,
  type EncounterResourceState,
} from './ResourceSystem';
import {
  computeResourceDelta,
  createDecisionId,
  zeroResourceDelta,
  type ContinuationCommit,
  type EncounterPresentationFrame,
  type FiveCardInstanceIds,
  type SecureDecisionResult,
  type SubmitRejectionReason,
  type SubmitTransactionResult,
  type TerminalCommit,
} from './SubmitTransaction';
import {
  createTurnDrawPolicy,
  drawSlotsFromBlueprints,
  drawTurnHandWithReplacement,
  type BasicDrawSlot,
  type TurnDrawPolicy,
} from './TurnDrawPolicy';

export type {
  EncounterClaimRuntime,
  EncounterEvidenceRuntime,
  EncounterRuntimeState,
} from './EncounterRuntimeState';

export type EncounterTurnLoopMode = 'LEGACY' | 'V2_ATOMIC';

/**
 * Run-layer identity used to mint duplicate-safe card instance ids. The run
 * layer owns RunIdentityState; the coordinator only needs the resolved node,
 * attempt id, and the persisted draw-serial cursor to continue from.
 */
export interface EncounterIdentityDeps {
  readonly nodeId: ContentId;
  readonly encounterAttemptId: string;
  readonly initialDrawSerial?: number;
}

export interface EncounterCoordinatorDeps {
  readonly caseDefinition: CaseDefinition;
  readonly encounterId: ContentId;
  readonly cards: readonly CardDefinition[];
  readonly balance: BalanceDefinition;
  readonly rng: RngState;
  /** Dedicated P0-4 stream. Callers with the run seed should provide it. */
  readonly cardDrawRng?: RngState;
  /** Exactly five persistent slots; duplicates are legal after blueprint merge. */
  readonly drawSlots?: readonly BasicDrawSlot[];
  readonly acquiredEvidenceIds?: readonly ContentId[];
  readonly initialDeckCardIds?: readonly ContentId[];
  readonly initialResources?: Readonly<Partial<Pick<
    EncounterResourceState,
    'stress' | 'dp' | 'trust'
  >>>;
  /** Long-term flag effects resolved by the run layer for this encounter. */
  readonly initialEffects?: readonly Effect[];
  /** Owned, data-authored bonuses that fire after a compatible card resolves. */
  readonly resolutionEffectSources?: readonly ResolutionEffectSource[];
  readonly validationMode?: ContentValidationMode;
  /**
   * 'V2_ATOMIC' turns on the atomic Submit transaction (P0-3B). Production
   * stays on 'LEGACY' until the interrogationV2TurnLoop gate (P0-3 + P0-4
   * together) activates, so mid-slice behavior is never user-visible.
   */
  readonly turnLoop?: EncounterTurnLoopMode;
  readonly identity?: EncounterIdentityDeps;
  /** Content/balance revision recorded on pending decisions for save guards. */
  readonly contentRevision?: string;
  /** Deterministic transaction fault seam used by the P0-3D rollback gate. */
  readonly faultInjection?: Readonly<Partial<Record<EncounterFaultPoint, () => void>>>;
}

export type EncounterFaultPoint = 'RESOLVER' | 'MODIFIER' | 'OBJECTIVE' | 'FLOW';

/**
 * Generic encounter boundary for relics, enhancements, and future run-owned
 * bonuses. The coordinator knows compatibility and effects, not acquisition.
 */
export interface ResolutionEffectSource {
  readonly sourceId: ContentId;
  readonly effects: readonly Effect[];
  readonly compatibleIntents?: readonly ActionIntent[];
  readonly compatibleCardIds?: readonly ContentId[];
  readonly usesPerEncounter?: number;
}

export interface EncounterRemountResult {
  readonly coordinator: EncounterCoordinator;
  readonly acknowledgedDecisionId: string | null;
}

/**
 * Authoring sentinels usable in any effect `target`/`targets` that runs off a
 * submission: card modifiers, relics, and enhancements all bind them to the
 * claim and evidence the player just submitted.
 */
export const RUNTIME_SELECTED_CLAIM = 'runtime-selected-claim';
export const RUNTIME_SELECTED_EVIDENCE = 'runtime-selected-evidence';

export interface SubmissionRequest {
  readonly cardId: ContentId;
  readonly targetClaimId?: ContentId;
  readonly routeId?: ContentId;
  readonly evidenceIds: readonly ContentId[];
  /**
   * v2 only: the exact physical copy being played. Required by
   * submitTransaction so duplicate blueprints stay unambiguous.
   */
  readonly instanceId?: string;
}

export interface SubmissionResult {
  readonly resolution: Resolution;
  readonly outcome: OutcomeEvaluation;
  readonly reactionKey: string;
  readonly missingScopes: readonly ProofScope[];
}

export interface PartnerCooldownSnapshot {
  readonly state: 'base' | 'used';
  readonly cooldownTurns: number;
}

function unique<T>(values: readonly T[]): readonly T[] {
  return values.filter((value, index) => values.indexOf(value) === index);
}

function selectResolutionResources(
  resources: EncounterResourceState,
): ResolutionRuntimeState['resources'] {
  return {
    composure: resources.composure,
    coercion: resources.coercion,
    commandPoints: resources.commandPoints,
  };
}

/** The only adapter that writes resolver resource output back to the canonical state. */
export function mergeResolutionResources(
  canonical: EncounterResourceState,
  resolutionResources: ResolutionRuntimeState['resources'],
  limits: EncounterResourceLimits,
): EncounterResourceState {
  return clampResourceState(
    {
      ...canonical,
      composure: resolutionResources.composure,
      coercion: resolutionResources.coercion,
      commandPoints: resolutionResources.commandPoints,
    },
    limits,
  );
}

function cardCopies(cards: readonly CardDefinition[]): readonly ContentId[] {
  return cards.flatMap((card) =>
    Array.from({ length: card.starting_copies }, () => card.card_id),
  );
}

function initialClaims(
  definition: CaseDefinition,
  encounter: EncounterDefinition,
  activeRoundOnly = false,
): Readonly<Record<ContentId, EncounterClaimRuntime>> {
  const shieldDurability = new Map<ContentId, number>();
  const shieldRounds = activeRoundOnly
    ? encounter.rounds.slice(0, 1)
    : encounter.rounds;
  for (const shield of shieldRounds.flatMap((round) => round.shields)) {
    shieldDurability.set(
      shield.claim_id,
      Math.max(shieldDurability.get(shield.claim_id) ?? 0, shield.durability),
    );
  }
  return Object.fromEntries(
    definition.claims.map((claim) => [
      claim.claim_id,
      {
        commitment: claim.initial.commitment,
        epistemic: 'UNKNOWN',
        presentation: claim.initial.presentation,
        resistance:
          shieldDurability.get(claim.claim_id)
          ?? (activeRoundOnly ? 0 : claim.resistance ?? 0),
        isRequired: claim.is_required ?? false,
      },
    ]),
  );
}

function interrogationRoundState(
  definition: CaseDefinition,
  encounter: EncounterDefinition,
  activeRoundIndex: number,
  presentedRoundIndex = activeRoundIndex,
): InterrogationRoundState {
  const round = encounter.rounds[activeRoundIndex];
  assertEncounterInvariant(round !== undefined, `Unknown interrogation round ${activeRoundIndex}.`);
  const roundClaims = new Set(round.statement_claims);
  const claimIdByFacet = Object.fromEntries(
    definition.claims
      .filter((claim) => roundClaims.has(claim.claim_id))
      .map((claim) => [claim.facet, claim.claim_id]),
  ) as Record<Facet, ContentId>;
  return {
    activeRoundIndex,
    presentedRoundIndex,
    claimIdByFacet,
    shieldDurabilityByClaimId: Object.fromEntries(
      round.shields.map((shield) => [shield.claim_id, shield.durability]),
    ),
  };
}

function initialEvidence(
  definition: CaseDefinition,
  encounter: EncounterDefinition,
  acquiredEvidenceIds: readonly ContentId[],
): Readonly<Record<ContentId, EncounterEvidenceRuntime>> {
  const encounterNodeIds = new Set(
    encounter.flow_nodes.map((node) => node.node_id),
  );
  return Object.fromEntries(
    definition.evidence.map((evidence) => [
      evidence.evidence_id,
      {
        acquired:
          acquiredEvidenceIds.includes(evidence.evidence_id) ||
          (evidence.acquire.method === 'STARTING' &&
            encounterNodeIds.has(evidence.acquire.node)),
        grade: evidence.grade.initial,
        integrity: evidence.integrity?.initial ?? 'INTACT',
      },
    ]),
  );
}

function initialCards(
  cards: readonly CardDefinition[],
): Readonly<Record<ContentId, ModifierRuntimeCard>> {
  return Object.fromEntries(cards.map((card) => [card.card_id, {}]));
}

function targetDirection(intent: ActionIntent): 'SUPPORT' | 'CONTRADICT' {
  return intent === 'CONFIRM' ? 'SUPPORT' : 'CONTRADICT';
}

function encounterResourceLimits(
  encounter: EncounterDefinition,
  encounterId: ContentId,
  balance: BalanceDefinition,
): EncounterResourceLimits {
  const override = balance.overrides.byEncounter[encounterId];
  return {
    composureMax: override?.composureMax ?? encounter.resources.composure_max,
    commandPointMax: override?.cpMax ?? encounter.resources.cp_max,
    commandPointsPerTurn: override?.cpPerTurn ?? encounter.resources.cp_per_turn,
    coercionLimit: override?.coercionLimit ?? encounter.resources.coercion_limit,
    stressMax: balance.stress.max,
    trustMax: balance.trust.max,
  };
}

export interface EncounterSweetSpot {
  readonly composureMin: number;
  readonly composureMax: number;
}

/** `balance.sweetSpot` is authored as a percentage of the live composure cap. */
export function encounterSweetSpot(
  balance: BalanceDefinition,
  limits: Pick<EncounterResourceLimits, 'composureMax'>,
): EncounterSweetSpot {
  return {
    composureMin: limits.composureMax * balance.sweetSpot.min / 100,
    composureMax: limits.composureMax * balance.sweetSpot.max / 100,
  };
}

type CoordinatorModifierState = ModifierRuntimeState &
  Readonly<{
    claims: Readonly<Record<string, EncounterClaimRuntime>>;
    evidence: Readonly<Record<string, EncounterEvidenceRuntime>>;
    cards: Readonly<Record<string, ModifierRuntimeCard>>;
  }>;

type CoordinatorFlowState = FlowRuntimeState &
  Readonly<{
    claims: Readonly<Record<string, EncounterClaimRuntime>>;
  }>;

type InquiryRouteDefinition = CaseDefinition['inquiry_routes'][number];

interface PreparedSubmission {
  readonly resolution: Resolution;
  readonly inquiryRoute: InquiryRouteDefinition | undefined;
  readonly routeAvailable: boolean;
  readonly evidence: readonly ReturnType<typeof toResolutionEvidence>[];
  readonly withinEvidenceRange: boolean;
  readonly facetAllowed: boolean;
}

export class EncounterCoordinator {
  readonly #definition: CaseDefinition;
  readonly #encounter: EncounterDefinition;
  readonly #cardDefinitions: readonly CardDefinition[];
  readonly #resolutionEffectSources: readonly ResolutionEffectSource[];
  #balance: BalanceDefinition;
  #limits: EncounterResourceLimits;
  readonly #machine: EncounterStateMachine;
  #state: EncounterRuntimeState;
  readonly #turnLoop: EncounterTurnLoopMode;
  readonly #identityNodeId: ContentId;
  readonly #attemptId: string;
  readonly #contentRevision: string;
  readonly #faultInjection: EncounterCoordinatorDeps['faultInjection'];

  private constructor(
    deps: EncounterCoordinatorDeps,
    encounter: EncounterDefinition,
    machine: EncounterStateMachine,
    state: EncounterRuntimeState,
    limits: EncounterResourceLimits,
  ) {
    this.#definition = deps.caseDefinition;
    this.#encounter = encounter;
    this.#cardDefinitions = deps.cards;
    this.#resolutionEffectSources = deps.resolutionEffectSources ?? [];
    this.#balance = deps.balance;
    this.#limits = limits;
    this.#machine = machine;
    this.#state = state;
    this.#turnLoop = deps.turnLoop ?? 'LEGACY';
    this.#identityNodeId = deps.identity?.nodeId ?? deps.encounterId;
    this.#attemptId =
      deps.identity?.encounterAttemptId ?? `local:${deps.encounterId}:0`;
    this.#contentRevision = deps.contentRevision ?? 'dev';
    this.#faultInjection = deps.faultInjection;
  }

  static begin(deps: EncounterCoordinatorDeps): EncounterCoordinator {
    const encounter = deps.caseDefinition.encounters.find(
      (candidate) => candidate.encounter_id === deps.encounterId,
    );
    if (encounter === undefined) {
      throw new Error(`Unknown encounter: ${deps.encounterId}.`);
    }
    const cardIds = deps.cards.map((card) => card.card_id);
    if (new Set(cardIds).size !== cardIds.length) {
      throw new Error('Encounter cards must have unique definitions.');
    }
    const effectSourceIds = (deps.resolutionEffectSources ?? []).map(
      (source) => source.sourceId,
    );
    if (new Set(effectSourceIds).size !== effectSourceIds.length) {
      throw new Error('Resolution effect sources must have unique IDs.');
    }
    for (const source of deps.resolutionEffectSources ?? []) {
      if (
        source.usesPerEncounter !== undefined &&
        (!Number.isInteger(source.usesPerEncounter) || source.usesPerEncounter <= 0)
      ) {
        throw new Error(`Resolution effect source ${source.sourceId} has an invalid use limit.`);
      }
    }

    const limits = encounterResourceLimits(encounter, deps.encounterId, deps.balance);
    const v2TurnLoop = (deps.turnLoop ?? 'LEGACY') === 'V2_ATOMIC';
    const legacyCards = deps.cards.filter((card) => card.legacy === true);
    const requestedInitialDeck = deps.initialDeckCardIds;
    const requestedDeckIsP1Only = requestedInitialDeck !== undefined &&
      requestedInitialDeck.length > 0 &&
      requestedInitialDeck.every((cardId) =>
        deps.cards.find((card) => card.card_id === cardId)?.combat_profile !== undefined,
      );
    const initialDeckCardIds =
      !v2TurnLoop && legacyCards.length > 0 &&
      (requestedInitialDeck === undefined || requestedDeckIsP1Only)
        ? cardCopies(legacyCards)
        : requestedInitialDeck ?? cardCopies(deps.cards);
    const unknownDeckCardId = initialDeckCardIds.find(
      (cardId) => !cardIds.includes(cardId),
    );
    if (unknownDeckCardId !== undefined) {
      throw new Error(`Initial deck references unknown card: ${unknownDeckCardId}.`);
    }
    let drawPolicy: TurnDrawPolicy | undefined;
    if (v2TurnLoop) {
      assertV2TurnBoundaryModifiers(encounter.modifiers);
      const slots = deps.drawSlots ?? drawSlotsFromBlueprints(
        initialDeckCardIds.filter(
          (cardId, index, cardIds) => cardIds.indexOf(cardId) === index,
        ).slice(0, 5),
      );
      if (
        deps.drawSlots === undefined &&
        new Set(slots.map((slot) => slot.blueprintId)).size !== 5
      ) {
        throw new Error('A new run draw policy must reference five distinct blueprints.');
      }
      drawPolicy = createTurnDrawPolicy(slots, new Set(cardIds));
    }
    const shuffled = v2TurnLoop
      ? { values: initialDeckCardIds, state: deps.rng }
      : shuffleWithState(initialDeckCardIds, deps.rng);
    const dealt = v2TurnLoop
      ? {
          deck: {
            drawPile: drawPolicy!.slots.map((slot) => slot.blueprintId),
            hand: [],
            discardPile: [],
          },
          dealtCardIds: [],
        }
      : dealInitialHand(
          { drawPile: shuffled.values, hand: [], discardPile: [] },
          deps.balance.draw.initial,
        );
    const machine = new EncounterStateMachine(
      deps.validationMode ?? 'DEVELOPMENT',
    );
    const initialResources = createResourceState(limits, {
      dp: deps.initialResources?.dp ?? deps.balance.dp.initial,
      ...(deps.initialResources?.stress === undefined
        ? {}
        : { stress: deps.initialResources.stress }),
      ...(deps.initialResources?.trust === undefined
        ? {}
        : { trust: deps.initialResources.trust }),
    });
    const emptyObjectives = evaluateObjectives(encounter.objectives, {
      claims: [],
      evidence: [],
      resources: initialResources,
      encounterFinished: false,
      encounterFailed: false,
    });
    const coordinator = new EncounterCoordinator(
      deps,
      encounter,
      machine,
      {
        machine: machine.snapshot,
        resources: initialResources,
        claims: initialClaims(deps.caseDefinition, encounter, v2TurnLoop),
        evidence: initialEvidence(
          deps.caseDefinition,
          encounter,
          deps.acquiredEvidenceIds ?? [],
        ),
        cards: initialCards(deps.cards),
        deck: dealt.deck,
        flowNodeId: null,
        enteredFlowNodeIds: [],
        openRouteIds: [],
        usedRouteIds: [],
        activeModifierIds: encounter.modifiers.map(
          (modifier) => modifier.modifier_id,
        ),
        modifierActivations: {},
        resolutionEffectActivations: {},
        durations: {},
        // balance.partner.cooldowns stores durations, not already-active timers.
        cooldowns: {},
        actionLocks: {},
        actionCostDeltas: {},
        revealedIds: (v2TurnLoop ? encounter.rounds.slice(0, 1) : encounter.rounds)
          .flatMap((round) => round.statement_claims)
          .filter((claimId, index, claimIds) => claimIds.indexOf(claimId) === index),
        objectives: emptyObjectives,
        rngState: shuffled.state,
        log: [],
        outcome: null,
        ...(v2TurnLoop
          ? interrogationRoundState(deps.caseDefinition, encounter, 0)
          : {}),
      },
      limits,
    );

    coordinator.#dispatch('START');
    coordinator.#dispatch('CONTENT_LOADED');
    if (coordinator.#machine.snapshot.state === 'VALIDATE') {
      coordinator.#dispatch('VALIDATION_PASSED');
    }
    coordinator.#dispatch('TRUTH_BUILT');
    coordinator.#dispatch('KNOWLEDGE_INITIALIZED');
    coordinator.#applyModifiers('ON_ENCOUNTER_START');
    coordinator.#runFlow();
    coordinator.#dispatch('FLOW_NODE_ENTERED');
    coordinator.#dispatch('STATEMENT_RENDERED');
    coordinator.#dispatch('DTO_EMITTED');
    coordinator.#startTurn(false);
    // The first turn refills CP to the cap before initial effects run, so an
    // encounter-start CP bonus (relic, flag hook) must widen the cap or the
    // clamp silently swallows it.
    const initialCommandPointBonus = (deps.initialEffects ?? [])
      .filter((effect) =>
        effect.type === 'ADJUST_RESOURCE' &&
        effect.resource === 'cp' &&
        (effect.delta ?? 0) > 0,
      )
      .reduce((total, effect) => total + (effect.delta ?? 0), 0);
    if (initialCommandPointBonus > 0) {
      coordinator.#limits = {
        ...coordinator.#limits,
        commandPointMax:
          coordinator.#limits.commandPointMax + initialCommandPointBonus,
      };
    }
    coordinator.#applyInitialEffects(deps.initialEffects ?? []);
    coordinator.#dispatch('TURN_READY');
    coordinator.#refreshObjectives();
    if (coordinator.#turnLoop === 'V2_ATOMIC') {
      // P0-4: the first hand and every later INPUT hand use the same exact
      // five-step with-replacement draw. The legacy deck shuffle RNG above was
      // deliberately left untouched in this mode.
      coordinator.#state = {
        ...coordinator.#state,
        turnsSpent: 0,
        handInstances: [],
        nextDrawSerial: deps.identity?.initialDrawSerial ?? 0,
        drawSlots: drawPolicy!.slots,
        cardDrawRngState:
          deps.cardDrawRng ?? createRngState(deps.rng.value, 'CARD_DRAW'),
        cardDrawCursor: 0,
        turnDiscardHistory: [],
        pendingSecureDecision: null,
        pendingFlowPresentation: null,
        sourceRevision: 0,
        presentationRevision: 0,
        publishedKnowledge: coordinator.#toKnowledgeState(),
      };
      coordinator.#drawTurnHandV2();
      coordinator.#applyModifiers('ON_HAND_READY');
      coordinator.#state = {
        ...coordinator.#state,
        publishedKnowledge: coordinator.#toKnowledgeState(),
      };
    }
    return coordinator;
  }

  /**
   * Rebuilds only the coordinator shell around a committed canonical state.
   * No resolver, modifier, objective, flow, draw, or presentation effect is
   * replayed. Browser/disk compatibility remains the separate P3 save-v4 job.
   */
  static remount(
    deps: EncounterCoordinatorDeps,
    encoded: string | CommittedEncounterSnapshot,
  ): EncounterRemountResult {
    const checkpoint = typeof encoded === 'string'
      ? decodeCommittedEncounterSnapshot(encoded)
      : decodeCommittedEncounterSnapshot(
          encodeCommittedEncounterSnapshot(encoded),
        );
    if ((deps.turnLoop ?? 'LEGACY') !== 'V2_ATOMIC') {
      throw new Error('Committed encounter remount requires the V2_ATOMIC turn loop.');
    }
    const encounter = deps.caseDefinition.encounters.find(
      (candidate) => candidate.encounter_id === deps.encounterId,
    );
    if (encounter === undefined) throw new Error(`Unknown encounter: ${deps.encounterId}.`);
    const expectedNodeId = deps.identity?.nodeId ?? deps.encounterId;
    const expectedAttemptId =
      deps.identity?.encounterAttemptId ?? `local:${deps.encounterId}:0`;
    const expectedContentRevision = deps.contentRevision ?? 'dev';
    if (
      checkpoint.encounterId !== deps.encounterId ||
      checkpoint.nodeId !== expectedNodeId ||
      checkpoint.encounterAttemptId !== expectedAttemptId
    ) {
      throw new Error('Committed encounter snapshot belongs to a different attempt.');
    }
    if (checkpoint.contentRevision !== expectedContentRevision) {
      throw new Error('Committed encounter snapshot content revision is incompatible.');
    }
    if (
      checkpoint.state.pendingSecureDecision !== null &&
      checkpoint.state.pendingSecureDecision !== undefined &&
      checkpoint.state.pendingSecureDecision.contentRevision !== expectedContentRevision
    ) {
      throw new Error('Committed encounter decision content revision is incompatible.');
    }
    assertCommittedEncounterState(checkpoint.state);
    const machine = new EncounterStateMachine(
      deps.validationMode ?? 'DEVELOPMENT',
    );
    machine.restore(checkpoint.state.machine);
    const coordinator = new EncounterCoordinator(
      deps,
      encounter,
      machine,
      checkpoint.state,
      encounterResourceLimits(encounter, deps.encounterId, deps.balance),
    );
    return Object.freeze({
      coordinator,
      acknowledgedDecisionId: checkpoint.acknowledgedDecisionId,
    });
  }

  get snapshot(): EncounterRuntimeState {
    return this.#state;
  }

  createCommittedSnapshot(
    acknowledgedDecisionId: string | null = null,
  ): CommittedEncounterSnapshot {
    this.#assertV2Loop('createCommittedSnapshot');
    const pendingId = this.#state.pendingSecureDecision?.decisionId ?? null;
    if (acknowledgedDecisionId !== null && acknowledgedDecisionId !== pendingId) {
      throw new Error('Only the current pending decision may be acknowledged.');
    }
    const snapshot: CommittedEncounterSnapshot = {
      version: COMMITTED_ENCOUNTER_SNAPSHOT_VERSION,
      encounterId: this.#encounter.encounter_id,
      nodeId: this.#identityNodeId,
      encounterAttemptId: this.#attemptId,
      contentRevision: this.#contentRevision,
      acknowledgedDecisionId,
      state: this.#state,
    };
    // Codec round-trip gives callers an isolated value and proves encodability.
    return decodeCommittedEncounterSnapshot(
      encodeCommittedEncounterSnapshot(snapshot),
    );
  }

  encodeCommittedSnapshot(acknowledgedDecisionId: string | null = null): string {
    return encodeCommittedEncounterSnapshot(
      this.createCommittedSnapshot(acknowledgedDecisionId),
    );
  }

  /** Effective limits after case values and live balance overrides are merged. */
  get resourceLimits(): EncounterResourceLimits {
    return { ...this.#limits };
  }

  get sweetSpot(): EncounterSweetSpot {
    return encounterSweetSpot(this.#balance, this.#limits);
  }

  partnerCooldown(skillId?: ContentId): PartnerCooldownSnapshot {
    const selectedId = skillId ?? Object.keys(this.#balance.partner.cooldowns)[0];
    const cooldownTurns = selectedId === undefined
      ? 0
      : (this.#state.cooldowns[selectedId] ?? 0);
    return cooldownTurns > 0
      ? { state: 'used', cooldownTurns }
      : { state: 'base', cooldownTurns: 0 };
  }

  /** Starts a configured, content-keyed partner cooldown if that skill is ready. */
  usePartnerSkill(skillId?: ContentId): PartnerCooldownSnapshot {
    // v2 freeze contract (§3.3.2): while the secure decision is pending, and
    // after a terminal outcome, no engine command may mutate game state. The
    // app input lock is presentation-level; the engine enforces it too.
    if (
      this.#turnLoop === 'V2_ATOMIC' &&
      ((this.#state.pendingSecureDecision ?? null) !== null ||
        this.#state.outcome !== null)
    ) {
      throw new Error(
        'Partner skills are frozen during the secure decision and after a terminal outcome.',
      );
    }
    const selectedId = skillId ?? Object.keys(this.#balance.partner.cooldowns)[0];
    if (selectedId === undefined) {
      throw new Error('No partner skill cooldown is configured.');
    }
    const duration = this.#balance.partner.cooldowns[selectedId];
    if (duration === undefined) {
      throw new Error(`Unknown partner skill: ${selectedId}.`);
    }
    const current = this.partnerCooldown(selectedId);
    if (current.state === 'used' || duration === 0) return current;
    // 김 인턴's breather: the skill trades its cooldown for the authored
    // coercion relief so using it always has a real gameplay effect.
    this.#state = {
      ...this.#state,
      // An accepted engine command: in v2 the revision must move with it.
      ...(this.#turnLoop === 'V2_ATOMIC'
        ? { sourceRevision: (this.#state.sourceRevision ?? 0) + 1 }
        : {}),
      cooldowns: { ...this.#state.cooldowns, [selectedId]: duration },
      resources: clampResourceState(
        {
          ...this.#state.resources,
          coercion: Math.max(
            0,
            this.#state.resources.coercion - this.#balance.coercion.breathReduce,
          ),
        },
        this.#limits,
      ),
    };
    return this.partnerCooldown(selectedId);
  }

  /**
   * Replaces already-validated tuning data without restarting the encounter.
   * Existing resources are retained and only clamped if a newly lowered hard
   * cap would otherwise make the runtime state invalid.
   */
  applyBalance(balance: BalanceDefinition): void {
    const limits = encounterResourceLimits(this.#encounter, this.#encounter.encounter_id, balance);
    const resources = clampResourceState(this.#state.resources, limits);
    const cooldowns = Object.fromEntries(
      Object.entries(this.#state.cooldowns).flatMap(([skillId, remaining]) => {
        const configured = balance.partner.cooldowns[skillId];
        if (configured === undefined || configured <= 0) return [];
        return [[skillId, Math.min(remaining, configured)] as const];
      }),
    );
    this.#balance = balance;
    this.#limits = limits;
    this.#state = {
      ...this.#state,
      resources,
      cooldowns,
    };
    this.#refreshObjectives();
  }

  /**
   * Safe knowledge projection consumed by the canonical DTO whitelist mapper.
   * In the v2 loop this is the published view: while a flow presentation is
   * pending, it stays at the previous cursor so unpublished statements and
   * newly revealed claims never leak ahead of the Continue decision.
   */
  get knowledge(): KnowledgeState {
    if (this.#turnLoop === 'V2_ATOMIC') {
      return this.#state.publishedKnowledge ?? this.#toKnowledgeState();
    }
    return this.#toKnowledgeState();
  }

  get turnLoopMode(): EncounterTurnLoopMode {
    return this.#turnLoop;
  }

  review(): FreeReviewQueries {
    const evidence = this.#definition.evidence.flatMap((definition) => {
      const runtime = this.#state.evidence[definition.evidence_id];
      if (runtime?.acquired !== true) return [];
      return [
        {
          evidenceId: definition.evidence_id,
          displayName: definition.title_key,
          scopes: unique(
            definition.observations.flatMap((observation) => observation.scopes),
          ),
          notProvenKeys: definition.not_proven_keys,
          commandPointCost: 0,
        },
      ];
    });
    const historyRounds = this.#turnLoop === 'V2_ATOMIC'
      ? this.#encounter.rounds.slice(this.#state.activeRoundIndex ?? 0, (this.#state.activeRoundIndex ?? 0) + 1)
      : this.#encounter.rounds;
    const history = historyRounds.flatMap((round) =>
      round.statement_claims.flatMap((claimId) => {
        const claim = this.#definition.claims.find(
          (candidate) => candidate.claim_id === claimId,
        );
        const fallback = this.#definition.dialogue.statements[claimId]?.fallback[0];
        if (claim === undefined || fallback === undefined) return [];
        return [
          {
            speakerId: claim.speaker,
            body: fallback,
            claimIds: [claimId],
          },
        ];
      }),
    );
    const snapshot: FreeReviewSnapshot = { evidence, history };
    return this.#machine.review(snapshot);
  }

  beginArgument(): void {
    this.#dispatch('BEGIN_ARGUMENT');
  }

  submit(request: SubmissionRequest): SubmissionResult {
    this.#assertLegacyLoop('submit');
    if (this.#machine.snapshot.state !== 'BUILD_ARGUMENT') {
      throw new Error('Submission requires BUILD_ARGUMENT state.');
    }
    const card = this.#cardDefinitions.find(
      (candidate) => candidate.card_id === request.cardId,
    );
    if (card === undefined) throw new Error(`Unknown card: ${request.cardId}.`);
    if (!this.#state.deck.hand.includes(request.cardId)) {
      throw new Error(`Card ${request.cardId} is not in hand.`);
    }
    if ((this.#state.cards[request.cardId]?.lockedUntilTurn ?? -1) >= this.#state.resources.turn) {
      throw new Error(`Card ${request.cardId} is locked this turn.`);
    }
    if ((this.#state.actionLocks[card.intent] ?? -1) >= this.#state.resources.turn) {
      throw new Error(`Action ${card.intent} is locked this turn.`);
    }

    const commandPointCost = Math.max(
      0,
      (card.cost.cp ?? 0) + (this.#state.actionCostDeltas[card.intent] ?? 0),
    );
    // The provisional result is not committed until resolution validity is known.
    const provisionallySpent = spendCommandPoints(
      this.#state.resources,
      commandPointCost,
      this.#limits,
    );

    // Any failure past this point must roll the machine back to BUILD_ARGUMENT
    // and leave resources untouched, or the encounter soft-locks in RESOLVE.
    const stateBeforeSubmission = this.#state;
    const machineBeforeSubmission = this.#machine.snapshot;
    try {
      return this.#resolveSubmission(request, card, commandPointCost, provisionallySpent);
    } catch (error) {
      this.#state = stateBeforeSubmission;
      this.#machine.restore(machineBeforeSubmission);
      throw error;
    }
  }

  /** Pure submission judgment: reads state, never mutates it. Shared by both loops. */
  #prepareSubmission(
    request: SubmissionRequest,
    card: CardDefinition,
    commandPointCost: number,
  ): PreparedSubmission {
    const targetDefinition = this.#definition.claims.find(
      (claim) => claim.claim_id === request.targetClaimId,
    );
    const targetRuntime =
      request.targetClaimId === undefined
        ? undefined
        : this.#state.claims[request.targetClaimId];
    const target =
      targetDefinition === undefined || targetRuntime === undefined
        ? undefined
        : toResolutionClaim(targetDefinition, targetRuntime);
    const inquiryRoute = this.#selectInquiryRoute(card.intent, request);
    const routeAvailable = inquiryRoute !== undefined &&
      this.#isInquiryRouteAvailable(inquiryRoute);
    const evidence = request.evidenceIds.flatMap((evidenceId) => {
      const definition = this.#definition.evidence.find(
        (candidate) => candidate.evidence_id === evidenceId,
      );
      const runtime = this.#state.evidence[evidenceId];
      if (
        definition === undefined ||
        runtime?.acquired !== true ||
        (runtime.sealedUntilTurn ?? -1) >= this.#state.resources.turn
      ) {
        return [];
      }
      return [toResolutionEvidence(definition, runtime)];
    });
    const evidenceCatalog = this.#definition.evidence.flatMap((definition) => {
      const runtime = this.#state.evidence[definition.evidence_id];
      return runtime?.acquired === true
        ? [toResolutionEvidence(definition, runtime)]
        : [];
    });
    const combatProfile = card.combat_profile;
    const exposure = this.#claimExposure(request.targetClaimId);
    const combatSelection =
      combatProfile === undefined || exposure === undefined
        ? { valid: true as const }
        : validateCardCombatSelection(combatProfile, exposure, evidence.length);
    // Evidence-free P1 attacks still target the private domain claim, but they
    // intentionally bypass the evidence resolver. Evidence-bearing cards keep
    // the complete relation/relevance/sufficiency/independence pipeline.
    const resolverIntent = combatProfile !== undefined && evidence.length === 0
      ? 'PRESSURE'
      : card.intent;
    const proofDirection =
      resolverIntent === 'CONFIRM' || resolverIntent === 'CONTRADICT'
        ? targetDirection(resolverIntent)
        : undefined;
    const proofDefinition = proofDirection === undefined
      ? undefined
      : selectProofRule(
          this.#definition.proof_rules,
          request.targetClaimId,
          proofDirection,
        ) ?? (
          combatProfile === undefined
            ? undefined
            : selectProofRule(
                this.#definition.proof_rules,
                request.targetClaimId,
                proofDirection === 'CONTRADICT' ? 'SUPPORT' : 'CONTRADICT',
              )
        );
    const proofRule =
      proofDefinition === undefined
        ? undefined
        : {
            ...toResolutionProofRule(proofDefinition),
            ...(proofDirection === undefined ? {} : { direction: proofDirection }),
          };
    const withinEvidenceRange =
      evidence.length >= (card.target.min_evidence ?? 0) &&
      evidence.length <= (card.target.max_evidence ?? Number.POSITIVE_INFINITY);
    const facetAllowed =
      targetDefinition === undefined ||
      card.target.facets === undefined ||
      card.target.facets.includes(targetDefinition.facet);
    let resolution = resolveArgument({
      intent: resolverIntent,
      targetKind: card.target.kind,
      ...(target === undefined ? {} : { target }),
      targetExposed:
        card.target.kind !== 'CLAIM' ||
        (targetRuntime !== undefined &&
          targetRuntime.presentation !== 'HIDDEN' &&
          request.targetClaimId !== undefined &&
          this.#state.revealedIds.includes(request.targetClaimId) &&
          this.#isActiveRoundClaim(request.targetClaimId)),
      actionCompatible: withinEvidenceRange && facetAllowed && combatSelection.valid,
      evidence,
      evidenceCatalog,
      ...(proofRule === undefined ? {} : { proofRule }),
      procedure: this.#procedure(),
      balance: toResolverBalance(this.#balance),
      commandPointCost,
      actionContext: {
        cardEffects: card.modifiers,
        ...(card.intent === 'QUERY' ? { routeAvailable } : {}),
        ...(card.intent === 'CLARIFY' ? { clarifiable: routeAvailable } : {}),
        ...(routeAvailable && inquiryRoute !== undefined
          ? {
              reveals: inquiryRoute.reveals,
              composureDelta: inquiryRoute.composure_delta,
              coercionDelta: inquiryRoute.coercion_risk,
              ...(inquiryRoute.creates_commitment &&
              inquiryRoute.commitment_level !== undefined
                ? { commitmentState: inquiryRoute.commitment_level }
                : {}),
            }
          : {}),
      },
    });
    if (
      combatProfile?.role === 'PHYSICAL_COERCION' &&
      targetDefinition !== undefined &&
      isDomainTruthTrap(targetDefinition.truth.relation) &&
      resolution.axes.validity === 'VALID' &&
      resolution.code !== 'R_PROCEDURE_VIOLATION'
    ) {
      resolution = {
        ...resolution,
        code: 'R_TRUTH_ATTACKED',
        reactionKey: 'R_TRUTH_ATTACKED',
      };
    }
    if (combatProfile !== undefined && exposure !== undefined) {
      resolution = applyCardCombatProfile(
        resolution,
        combatProfile,
        exposure,
        {
          penalties: {
            insufficient: this.#balance.coercion.insufficient,
            irrelevant: this.#balance.coercion.irrelevant,
            truthAttack: this.#balance.coercion.truthAttack,
          },
        },
      );
    }
    return {
      resolution,
      inquiryRoute,
      routeAvailable,
      evidence,
      withinEvidenceRange,
      facetAllowed,
    };
  }

  #resolveSubmission(
    request: SubmissionRequest,
    card: CardDefinition,
    commandPointCost: number,
    provisionallySpent: EncounterResourceState,
  ): SubmissionResult {
    const truthGateComposure = this.#state.resources.composure;
    const truthGateResistance = request.targetClaimId === undefined
      ? undefined
      : this.#state.claims[request.targetClaimId]?.resistance;
    this.#dispatch('ARGUMENT_BUILT');
    this.#dispatch('ACTION_SUBMITTED');
    const { resolution, inquiryRoute, routeAvailable, evidence } =
      this.#prepareSubmission(request, card, commandPointCost);
    this.#dispatch('RESOLUTION_READY');
    const applied = applyResolution(
      resolution,
      {
        resources: selectResolutionResources(this.#state.resources),
        claims: this.#state.claims,
        revealedIds: this.#state.revealedIds,
        appliedCardEffects: [],
        appliedModifierEffects: [],
        objectivesDirty: false,
      },
      request.targetClaimId,
      {
        hasAlternativePath: () => this.#hasSolvablePath(),
      },
    );
    const resources = mergeResolutionResources(
      this.#state.resources,
      applied.resources,
      this.#limits,
    );
    const expectedCommandPoints = resolution.effects.consumeCommandPoints
      ? provisionallySpent.commandPoints
      : this.#state.resources.commandPoints;
    if (resources.commandPoints !== expectedCommandPoints) {
      throw new Error('Resolution CP merge violated provisional spend/rollback.');
    }
    this.#state = {
      ...this.#state,
      resources,
      claims: applied.claims,
      ...this.#shieldDurabilityPatch(applied.claims),
      revealedIds: applied.revealedIds,
      deck: resolution.effects.consumeCommandPoints
        ? playCard(this.#state.deck, request.cardId)
        : this.#state.deck,
      outcome: applied.outcome ?? this.#state.outcome,
    };
    if (
      inquiryRoute !== undefined &&
      routeAvailable &&
      (resolution.code === 'R_QUERY_SUCCESS' ||
        resolution.code === 'R_CLARIFY_SUCCESS')
    ) {
      this.#state = {
        ...this.#state,
        usedRouteIds: unique([...this.#state.usedRouteIds, inquiryRoute.route_id]),
        openRouteIds: unique([
          ...this.#state.openRouteIds,
          ...inquiryRoute.unlocks_routes,
        ]),
      };
    }
    // Card modifiers are play-scoped, not success-scoped: the resolver blanks
    // cardEffects only for the codes that refund the CP, so an authored
    // modifier lands on every resolution that actually spent the card —
    // including R_INSUFFICIENT_GROUNDS and friends. Author them accordingly.
    this.#applyCardEffects(
      applied.appliedCardEffects,
      request,
      evidence.map((item) => item.evidenceId),
    );
    if (resolution.effects.consumeCommandPoints) {
      this.#applyResolutionEffectSources(card, request);
    }
    this.#dispatch('EFFECTS_APPLIED');
    this.#dispatch('REACTION_RENDERED');
    this.#applyModifiers('ON_RESOLUTION');
    this.#restoreTruthDamageGate(
      resolution,
      request.targetClaimId,
      truthGateComposure,
      truthGateResistance,
    );
    this.#dispatch('MODIFIERS_APPLIED');
    // P0-3A: the machine now routes through SETTLE_TURN. The legacy loop
    // passes straight through; actual turn settlement (hand discard,
    // turnsSpent, ON_TURN_END) moves inside this transaction in P0-3B.
    this.#dispatch('TURN_SETTLED');

    const flowTransitioned = this.#runFlow();
    this.#refreshObjectives();
    let outcome = this.#evaluateCurrentOutcome(false);
    if (applied.outcome === 'FAILED') {
      outcome = {
        terminalOutcome: 'FAILED',
        terminal: true,
        bestResolution: {
          conditionsMet: false,
          secureStatementEnabled: false,
        },
        reason: 'NONE',
      };
    }

    if (outcome.terminal || !flowTransitioned) {
      this.#dispatch('STAY_IN_FLOW');
      this.#dispatch('OBJECTIVES_CHECKED');
      this.#commitOutcome(outcome);
    } else {
      this.#dispatch('ENTER_NEXT_FLOW');
      this.#dispatch('FLOW_NODE_ENTERED');
      this.#dispatch('STATEMENT_RENDERED');
      this.#dispatch('DTO_EMITTED');
      this.#startTurn();
      this.#dispatch('TURN_READY');
    }

    this.#state = {
      ...this.#state,
      log: appendJudgmentLog(
        this.#state.log,
        {
          type: 'SUBMIT',
          cardId: request.cardId,
          ...(request.targetClaimId === undefined
            ? {}
            : { targetClaimId: request.targetClaimId }),
          ...(inquiryRoute === undefined ? {} : { routeId: inquiryRoute.route_id }),
          evidenceIds: [...request.evidenceIds],
        },
        {
          resolutionCode: resolution.code,
          reason: resolution.reason ?? null,
          axes: resolution.axes,
          resourceEffects: {
            composureDelta: resolution.effects.composureDelta,
            coercionDelta: resolution.effects.coercionDelta,
            commandPointDelta: resolution.effects.commandPointDelta,
          },
          reactionKey: resolution.reactionKey,
          outcome: outcome.terminalOutcome,
        },
      ),
    };
    return {
      resolution,
      outcome,
      reactionKey: resolution.reactionKey,
      missingScopes: resolution.feedback?.missingScopes ?? [],
    };
  }

  secureStatement(): OutcomeEvaluation {
    this.#assertLegacyLoop('secureStatement');
    if (this.#machine.snapshot.state !== 'CHECK_OUTCOME') {
      throw new Error('Secure Statement is only available during CHECK_OUTCOME.');
    }
    const availability = this.#evaluateCurrentOutcome(false);
    if (!availability.bestResolution.secureStatementEnabled) {
      throw new Error('BEST resolution conditions are not met.');
    }
    const outcome = this.#evaluateCurrentOutcome(true);
    this.#commitOutcome(outcome);
    this.#state = {
      ...this.#state,
      log: appendJudgmentLog(
        this.#state.log,
        { type: 'SECURE_STATEMENT' },
        { outcome: outcome.terminalOutcome },
      ),
    };
    return outcome;
  }

  /**
   * Legacy-loop only. In V2_ATOMIC the turn is settled inside
   * submitTransaction() and this public action no longer exists; the whole
   * method is deleted when the legacy loop is retired (P0-3C/P0-4 gate).
   */
  endTurn(): OutcomeEvaluation {
    this.#assertLegacyLoop('endTurn');
    if (this.#machine.snapshot.state !== 'CHECK_OUTCOME') {
      throw new Error('Turn can only end during CHECK_OUTCOME.');
    }
    this.#applyModifiers('ON_TURN_END');
    this.#refreshObjectives();
    const outcome = this.#evaluateCurrentOutcome(false);
    if (outcome.terminal) {
      this.#commitOutcome(outcome);
    } else {
      this.#dispatch('CONTINUE');
      this.#startTurn();
      this.#dispatch('TURN_READY');
    }
    this.#state = {
      ...this.#state,
      log: appendJudgmentLog(
        this.#state.log,
        { type: 'END_TURN' },
        {
          outcome: outcome.terminalOutcome,
          nextTurn: this.#state.resources.turn,
        },
      ),
    };
    return outcome;
  }

  /**
   * v2 atomic Submit (design §3.3.2). One valid play consumes exactly one
   * turn: cost, judgment, whole-hand discard, `turnsSpent + 1`, the pre-flow
   * modifier set's ON_TURN_END, the flow logical commit, and the decision or
   * terminal commit all happen in this single transaction. Rejections change
   * nothing; exceptions roll back to the byte-identical pre-Submit state.
   */
  submitTransaction(request: SubmissionRequest): SubmitTransactionResult {
    this.#assertV2Loop('submitTransaction');
    const machineState = this.#machine.snapshot.state;
    if (
      (this.#state.pendingSecureDecision ?? null) !== null ||
      this.#state.outcome !== null ||
      (machineState !== 'FREE_REVIEW' && machineState !== 'BUILD_ARGUMENT')
    ) {
      return this.#rejectSubmit('BUSY');
    }

    const turnsSpent = this.#state.turnsSpent ?? 0;
    const turnLimit = this.#definition.metadata.estimated_turns;
    assertEncounterInvariant(
      this.#state.resources.turn === turnsSpent + 1,
      `currentTurn (${this.#state.resources.turn}) must equal turnsSpent + 1 (${turnsSpent + 1}).`,
    );
    assertEncounterInvariant(
      turnsSpent < turnLimit,
      `turnsSpent (${turnsSpent}) must be below turnLimit (${turnLimit}) before a Submit.`,
    );

    const handInstances = this.#state.handInstances ?? [];
    if (request.instanceId === undefined) return this.#rejectSubmit('TARGET');
    const handIndex = handInstances.findIndex(
      (instance) => instance.instanceId === request.instanceId,
    );
    if (handIndex < 0) return this.#rejectSubmit('TARGET');
    const playedInstance = handInstances[handIndex]!;
    const card = this.#cardDefinitions.find(
      (candidate) => candidate.card_id === playedInstance.blueprintId,
    );
    if (card === undefined || card.card_id !== request.cardId) {
      return this.#rejectSubmit('TARGET');
    }
    if (
      (this.#state.cards[card.card_id]?.lockedUntilTurn ?? -1) >=
      this.#state.resources.turn
    ) {
      return this.#rejectSubmit('TAG');
    }
    if (
      (this.#state.actionLocks[card.intent] ?? -1) >= this.#state.resources.turn
    ) {
      return this.#rejectSubmit('TAG');
    }
    const commandPointCost = Math.max(
      0,
      (card.cost.cp ?? 0) + (this.#state.actionCostDeltas[card.intent] ?? 0),
    );
    if (commandPointCost > this.#state.resources.commandPoints) {
      return this.#rejectSubmit('CP');
    }

    const stateBeforeSubmission = this.#state;
    const machineBeforeSubmission = this.#machine.snapshot;
    try {
      this.#injectFault('RESOLVER');
      const prepared = this.#prepareSubmission(request, card, commandPointCost);
      if (!prepared.resolution.effects.consumeCommandPoints) {
        // The resolver refunds structurally invalid or blocked plays in the
        // legacy loop; v2 normalizes them to a no-mutation rejection so a
        // rejected Submit is byte-identical to never having clicked.
        if (!prepared.withinEvidenceRange) return this.#rejectSubmit('EVIDENCE');
        if (!prepared.facetAllowed) return this.#rejectSubmit('TAG');
        return this.#rejectSubmit('TARGET');
      }
      return this.#commitSubmitTransaction(
        request,
        card,
        commandPointCost,
        prepared,
        handIndex,
        playedInstance,
        turnsSpent,
        turnLimit,
      );
    } catch (error) {
      this.#state = stateBeforeSubmission;
      this.#machine.restore(machineBeforeSubmission);
      throw error;
    }
  }

  /**
   * Typed decision action for the AWAIT_SECURE_DECISION checkpoint. Secure
   * keeps the committed flow logic but discards the unpublished presentation
   * and confirms BEST without a new turn, modifier, or draw; Continue never
   * spends a turn and either publishes the pending presentation into the next
   * turn or ends as the declined PARTIAL on the final one.
   */
  resolveSecureDecision(
    decisionId: string,
    choice: 'SECURE' | 'CONTINUE',
  ): SecureDecisionResult {
    this.#assertV2Loop('resolveSecureDecision');
    const pending = this.#state.pendingSecureDecision ?? null;
    if (
      pending === null ||
      this.#machine.snapshot.state !== 'AWAIT_SECURE_DECISION' ||
      pending.decisionId !== decisionId
    ) {
      return { kind: 'REJECTED', reason: 'STALE_DECISION', snapshot: this.#state };
    }

    const stateBeforeDecision = this.#state;
    const machineBeforeDecision = this.#machine.snapshot;
    try {
      return this.#commitSecureDecision(pending, choice);
    } catch (error) {
      this.#state = stateBeforeDecision;
      this.#machine.restore(machineBeforeDecision);
      throw error;
    }
  }

  #commitSecureDecision(
    pending: PendingSecureDecision,
    choice: 'SECURE' | 'CONTINUE',
  ): SecureDecisionResult {
    const decisionId = pending.decisionId;
    const settledFrame = this.#captureFrame();
    this.#state = {
      ...this.#state,
      sourceRevision: (this.#state.sourceRevision ?? 0) + 1,
      pendingSecureDecision: null,
    };

    let result: SecureDecisionResult;
    if (choice === 'SECURE') {
      const commit = this.#finalizeSettlementTerminal(
        'BEST_RESOLUTION',
        'BEST_CONFIRMED',
        'SECURE_STATEMENT',
      );
      result = {
        kind: 'COMMITTED',
        decisionId,
        choice: 'SECURE',
        settledFrame,
        ...commit,
        outcome: 'BEST_RESOLUTION',
      };
    } else if (pending.onDecline === 'PARTIAL_RESOLUTION') {
      const commit = this.#finalizeSettlementTerminal(
        'PARTIAL_RESOLUTION',
        'TURN_LIMIT_REACHED',
        'DECLINE_AND_COMPLETE',
      );
      result = {
        kind: 'COMMITTED',
        decisionId,
        choice: 'CONTINUE',
        settledFrame,
        ...commit,
        outcome: 'PARTIAL_RESOLUTION',
      };
    } else {
      const continuation = this.#startNextTurnV2({
        withFlow: 'DECLINE_WITH_FLOW',
        noFlow: 'DECLINE_NO_FLOW',
      });
      if (continuation.phase === 'TERMINAL') {
        const { outcome } = continuation;
        assertEncounterInvariant(
          outcome !== 'BEST_RESOLUTION',
          'A declined decision can never terminal into BEST_RESOLUTION.',
        );
        result = {
          kind: 'COMMITTED',
          decisionId,
          choice: 'CONTINUE',
          settledFrame,
          ...continuation,
          outcome,
        };
      } else {
        result = {
          kind: 'COMMITTED',
          decisionId,
          choice: 'CONTINUE',
          settledFrame,
          ...continuation,
        };
      }
    }

    this.#state = {
      ...this.#state,
      log: appendJudgmentLog(
        this.#state.log,
        { type: 'SECURE_DECISION', decisionId, choice },
        { outcome: this.#state.outcome },
      ),
    };
    assertEncounterInvariant(
      result.kind === 'COMMITTED',
      'A committed decision produced a rejection result.',
    );
    return { ...result, committedFrame: this.#captureFrame() };
  }

  #commitSubmitTransaction(
    request: SubmissionRequest,
    card: CardDefinition,
    commandPointCost: number,
    prepared: PreparedSubmission,
    handIndex: number,
    playedInstance: CardInstance,
    turnsSpentBefore: number,
    turnLimit: number,
  ): SubmitTransactionResult {
    const nextRevision = (this.#state.sourceRevision ?? 0) + 1;
    const preSubmitResources = this.#state.resources;
    const truthGateResistance = request.targetClaimId === undefined
      ? undefined
      : this.#state.claims[request.targetClaimId]?.resistance;
    const provisionallySpent = spendCommandPoints(
      preSubmitResources,
      commandPointCost,
      this.#limits,
    );
    this.#state = { ...this.#state, sourceRevision: nextRevision };

    if (this.#machine.snapshot.state === 'FREE_REVIEW') {
      this.#dispatch('BEGIN_ARGUMENT');
    }
    this.#dispatch('ARGUMENT_BUILT');
    this.#dispatch('ACTION_SUBMITTED');
    this.#dispatch('RESOLUTION_READY');

    // Impact: cost, judgment, card/relic modifiers, ON_RESOLUTION — exactly once.
    const { resolution, inquiryRoute, routeAvailable, evidence } = prepared;
    const applied = applyResolution(
      resolution,
      {
        resources: selectResolutionResources(this.#state.resources),
        claims: this.#state.claims,
        revealedIds: this.#state.revealedIds,
        appliedCardEffects: [],
        appliedModifierEffects: [],
        objectivesDirty: false,
      },
      request.targetClaimId,
      { hasAlternativePath: () => this.#hasSolvablePath() },
    );
    const resources = mergeResolutionResources(
      this.#state.resources,
      applied.resources,
      this.#limits,
    );
    assertEncounterInvariant(
      resources.commandPoints === provisionallySpent.commandPoints,
      'Resolution CP merge violated the provisional spend.',
    );
    const authoredForcedOutcome = applied.outcome ?? null;

    // Play the exact selected physical copy; duplicates stay index-precise.
    const handCards = [...this.#state.deck.hand];
    const playedCardId = handCards.splice(handIndex, 1)[0];
    assertEncounterInvariant(
      playedCardId === card.card_id,
      'Hand instances desynced from the deck hand.',
    );
    this.#state = {
      ...this.#state,
      resources,
      claims: applied.claims,
      ...this.#shieldDurabilityPatch(applied.claims),
      revealedIds: applied.revealedIds,
      deck: {
        drawPile: [...this.#state.deck.drawPile],
        hand: handCards,
        discardPile: [...this.#state.deck.discardPile, card.card_id],
      },
      handInstances: (this.#state.handInstances ?? []).filter(
        (_, index) => index !== handIndex,
      ),
    };
    if (
      inquiryRoute !== undefined &&
      routeAvailable &&
      (resolution.code === 'R_QUERY_SUCCESS' ||
        resolution.code === 'R_CLARIFY_SUCCESS')
    ) {
      this.#state = {
        ...this.#state,
        usedRouteIds: unique([...this.#state.usedRouteIds, inquiryRoute.route_id]),
        openRouteIds: unique([
          ...this.#state.openRouteIds,
          ...inquiryRoute.unlocks_routes,
        ]),
      };
    }
    this.#applyCardEffects(
      applied.appliedCardEffects,
      request,
      evidence.map((item) => item.evidenceId),
    );
    this.#applyResolutionEffectSources(card, request);
    this.#dispatch('EFFECTS_APPLIED');
    this.#dispatch('REACTION_RENDERED');
    this.#injectFault('MODIFIER');
    this.#applyModifiers('ON_RESOLUTION');
    this.#restoreTruthDamageGate(
      resolution,
      request.targetClaimId,
      preSubmitResources.composure,
      truthGateResistance,
    );

    let facts: TerminalThresholdFacts = observeTerminalThresholds(
      EMPTY_TERMINAL_THRESHOLD_FACTS,
      this.#state.resources,
      this.#limits.coercionLimit,
    );
    this.#reconcileHandInstances();
    this.#state = { ...this.#state, publishedKnowledge: this.#toKnowledgeState() };
    const impactFrame = this.#captureFrame();
    const actionResourceDelta = computeResourceDelta(
      preSubmitResources,
      this.#state.resources,
    );
    this.#dispatch('MODIFIERS_APPLIED');

    // Settle: the whole remaining hand is discarded and exactly one turn is
    // consumed, before ON_TURN_END and any flow logic can observe the hand.
    const remainingHand = this.#state.handInstances ?? [];
    const discardedInstances = [...remainingHand];
    discardedInstances.splice(handIndex, 0, playedInstance);
    const discardedInstanceIds = [
      playedInstance.instanceId,
      ...remainingHand.map((instance) => instance.instanceId),
    ];
    this.#state = {
      ...this.#state,
      deck: {
        drawPile: (this.#state.drawSlots ?? []).map((slot) => slot.blueprintId),
        hand: [],
        // Encounter discard is presentation-local in v2: keep only the last
        // submitted hand instead of accumulating an unbounded pseudo-deck.
        discardPile: discardedInstances.map((instance) => instance.blueprintId),
      },
      handInstances: [],
      turnDiscardHistory: discardedInstances,
      turnsSpent: turnsSpentBefore + 1,
    };
    assertEncounterInvariant(
      turnsSpentBefore + 1 <= turnLimit,
      `turnsSpent (${turnsSpentBefore + 1}) exceeded turnLimit (${turnLimit}).`,
    );

    // ON_TURN_END runs once with the pre-flow active modifier set: the flow
    // has not committed yet, so a node entered below can never act on the
    // turn that just ended.
    const resourcesBeforeTurnEnd = this.#state.resources;
    this.#applyModifiers('ON_TURN_END');
    const turnEndResourceDelta = computeResourceDelta(
      resourcesBeforeTurnEnd,
      this.#state.resources,
    );
    facts = observeTerminalThresholds(
      facts,
      this.#state.resources,
      this.#limits.coercionLimit,
    );
    this.#dispatch('TURN_SETTLED');

    // Flow logical commit — skipped entirely under a blocking terminal fact
    // or an authored forced outcome, including both objective refreshes.
    let flowEntryResourceDelta = zeroResourceDelta();
    if (
      reduceTerminalThresholdFacts(facts) === null &&
      authoredForcedOutcome === null
    ) {
      this.#injectFault('OBJECTIVE');
      this.#refreshObjectives();
      const knowledgeBeforeFlow = this.#toKnowledgeState();
      const resourcesBeforeFlow = this.#state.resources;
      const previousPresentationRevision = this.#state.presentationRevision ?? 0;
      this.#injectFault('FLOW');
      if (this.#runFlow()) {
        flowEntryResourceDelta = computeResourceDelta(
          resourcesBeforeFlow,
          this.#state.resources,
        );
        facts = observeTerminalThresholds(
          facts,
          this.#state.resources,
          this.#limits.coercionLimit,
        );
        const enteredNodeId = this.#state.flowNodeId;
        assertEncounterInvariant(
          enteredNodeId !== null,
          'Flow transition committed without a current node.',
        );
        // Pin publication to the pre-flow view: the new statement and its
        // revealed claims stay behind the rail until Continue publishes them.
        this.#state = {
          ...this.#state,
          publishedKnowledge: knowledgeBeforeFlow,
          pendingFlowPresentation: {
            targetNodeId: enteredNodeId,
            sourceRevision: nextRevision,
            previousPresentationRevision,
          },
        };
        this.#dispatch('FLOW_LOGIC_COMMITTED');
      } else {
        this.#state = {
          ...this.#state,
          publishedKnowledge: this.#toKnowledgeState(),
        };
        this.#dispatch('NO_FLOW');
      }
      this.#refreshObjectives();
    } else {
      this.#state = { ...this.#state, publishedKnowledge: this.#toKnowledgeState() };
      this.#dispatch('NO_FLOW');
    }
    this.#dispatch('OBJECTIVES_CHECKED');

    const settledFrame = this.#captureFrame();
    const directive = evaluateSettlementDirective({
      thresholdFacts: facts,
      authoredForcedOutcome,
      hasSolvablePath: this.#hasSolvablePath(),
      resources: this.#state.resources,
      objectives: this.#state.objectives,
      bestConditions: this.#bestConditions(),
      coercionLimit: this.#limits.coercionLimit,
      turnsSpent: turnsSpentBefore + 1,
      turnLimit,
    });

    const receipt = {
      resolution,
      impactFrame,
      settledFrame,
      actionResourceDelta,
      turnEndResourceDelta,
      flowEntryResourceDelta,
      submittedInstanceId: playedInstance.instanceId,
      discardedInstanceIds,
      turnsSpent: turnsSpentBefore + 1,
    };

    let result: SubmitTransactionResult;
    if (directive.kind === 'OFFER_SECURE_DECISION') {
      const pendingDecision: PendingSecureDecision = {
        decisionId: createDecisionId(
          this.#attemptId,
          turnsSpentBefore + 1,
          nextRevision,
        ),
        sourceRevision: nextRevision,
        offeredAfterTurn: turnsSpentBefore + 1,
        onDecline: directive.onDecline,
        contentRevision: this.#contentRevision,
        pendingFlowPresentation: this.#state.pendingFlowPresentation ?? null,
      };
      this.#state = { ...this.#state, pendingSecureDecision: pendingDecision };
      this.#dispatch('OFFER_SECURE');
      result = {
        kind: 'COMMITTED',
        ...receipt,
        phase: 'AWAIT_SECURE_DECISION',
        committedFrame: this.#captureFrame(),
        turnStartResourceDelta: zeroResourceDelta(),
        drawnInstanceIds: [],
        pendingDecision,
      };
    } else if (directive.kind === 'TERMINAL') {
      result = {
        kind: 'COMMITTED',
        ...receipt,
        ...this.#finalizeSettlementTerminal(
          directive.outcome,
          directive.reason,
          this.#terminalEventFor(directive.outcome),
        ),
      };
    } else {
      result = {
        kind: 'COMMITTED',
        ...receipt,
        ...this.#startNextTurnV2({
          withFlow: 'CONTINUE_WITH_FLOW',
          noFlow: 'CONTINUE_NO_FLOW',
        }),
      };
    }

    this.#state = {
      ...this.#state,
      log: appendJudgmentLog(
        this.#state.log,
        {
          type: 'SUBMIT',
          cardId: request.cardId,
          instanceId: playedInstance.instanceId,
          ...(request.targetClaimId === undefined
            ? {}
            : { targetClaimId: request.targetClaimId }),
          ...(inquiryRoute === undefined ? {} : { routeId: inquiryRoute.route_id }),
          evidenceIds: [...request.evidenceIds],
        },
        {
          resolutionCode: resolution.code,
          reason: resolution.reason ?? null,
          axes: resolution.axes,
          resourceEffects: {
            composureDelta: resolution.effects.composureDelta,
            coercionDelta: resolution.effects.coercionDelta,
            commandPointDelta: resolution.effects.commandPointDelta,
          },
          reactionKey: resolution.reactionKey,
          outcome: this.#state.outcome,
          turnsSpent: turnsSpentBefore + 1,
          phase: result.kind === 'COMMITTED' ? result.phase : 'REJECTED',
        },
      ),
    };
    assertEncounterInvariant(
      result.kind === 'COMMITTED',
      'A committed Submit transaction produced a rejection result.',
    );
    return { ...result, committedFrame: this.#captureFrame() };
  }

  /**
   * The single owner of "start the next turn" (design §3.3.2). Publishes a
   * pending flow presentation exactly once, restores CP and ticks durations
   * before any draw, lets a pre-draw threshold finish the encounter with the
   * new turn number but zero draws, and otherwise deals the next hand.
   */
  #startNextTurnV2(events: {
    readonly withFlow: EncounterEvent;
    readonly noFlow: EncounterEvent;
  }): ContinuationCommit {
    if ((this.#state.pendingFlowPresentation ?? null) !== null) {
      this.#dispatch(events.withFlow);
      this.#dispatch('FLOW_PRESENTATION_STARTED');
      this.#dispatch('STATEMENT_RENDERED');
      // Publish: the cursor advances exactly once, logical effects never rerun.
      this.#state = {
        ...this.#state,
        pendingFlowPresentation: null,
        presentedRoundIndex:
          this.#state.activeRoundIndex ?? this.#state.presentedRoundIndex ?? 0,
        presentationRevision: (this.#state.presentationRevision ?? 0) + 1,
      };
      this.#state = {
        ...this.#state,
        publishedKnowledge: this.#toKnowledgeState(),
      };
      this.#dispatch('DTO_EMITTED');
    } else {
      this.#dispatch(events.noFlow);
    }

    const settledResources = this.#state.resources;
    const turnStart = processEncounterTurnStart(
      {
        resources: this.#state.resources,
        deck: this.#state.deck,
        statusDurations: this.#state.durations,
        cooldowns: this.#state.cooldowns,
      },
      this.#limits,
      {
        draw: {
          perTurn: 0,
          handLimit: this.#balance.draw.handLimit,
          reshuffleOnEmpty: false,
        },
      },
    );
    this.#state = {
      ...this.#state,
      resources: turnStart.state.resources,
      deck: turnStart.state.deck,
      durations: turnStart.state.statusDurations,
      cooldowns: turnStart.state.cooldowns,
    };
    assertEncounterInvariant(
      this.#state.resources.turn === (this.#state.turnsSpent ?? 0) + 1,
      'TURN_START must set currentTurn to turnsSpent + 1.',
    );
    // Hand-independent pre-draw effects only; the v2 semantic validator
    // (P0-4) bans draw/discard/hand selectors on this trigger.
    this.#applyModifiers('ON_TURN_START_PRE_DRAW');

    const facts = observeTerminalThresholds(
      EMPTY_TERMINAL_THRESHOLD_FACTS,
      this.#state.resources,
      this.#limits.coercionLimit,
    );
    const reduced = reduceTerminalThresholdFacts(facts);
    if (reduced !== null) {
      // Keep the incremented turn and CP/duration settlement, but no hand,
      // no draw, and no RNG consumption.
      const turnStartResourceDelta = computeResourceDelta(
        settledResources,
        this.#state.resources,
      );
      this.#state = {
        ...this.#state,
        pendingSecureDecision: null,
        pendingFlowPresentation: null,
        // No flow presentation is pending here, so re-projecting publishes
        // only the player's own turn-start modifier results.
        publishedKnowledge: this.#toKnowledgeState(),
        outcome: reduced.outcome,
      };
      this.#dispatch(this.#terminalEventFor(reduced.outcome));
      return {
        phase: 'TERMINAL',
        committedFrame: this.#captureFrame(),
        turnStartResourceDelta,
        drawnInstanceIds: [],
        outcome: reduced.outcome,
        reason: reduced.reason,
      };
    }

    this.#drawTurnHandV2();
    this.#applyModifiers('ON_HAND_READY');
    // INPUT invariant: the published projection must equal the logical state
    // once the turn is ready — ON_TURN_START effects publish immediately.
    this.#state = {
      ...this.#state,
      publishedKnowledge: this.#toKnowledgeState(),
    };
    this.#dispatch('TURN_READY');
    const turnStartResourceDelta = computeResourceDelta(
      settledResources,
      this.#state.resources,
    );
    const drawnInstanceIds = (this.#state.handInstances ?? []).map(
      (instance) => instance.instanceId,
    );
    assertEncounterInvariant(
      drawnInstanceIds.length === 5,
      'A committed INPUT turn must contain exactly five card instances.',
    );
    return {
      phase: 'INPUT',
      committedFrame: this.#captureFrame(),
      turnStartResourceDelta,
      drawnInstanceIds: drawnInstanceIds as unknown as FiveCardInstanceIds,
    };
  }

  /**
   * Shared settlement-terminal finalizer: preserves committed flow logic,
   * discards the unpublished presentation, never advances the publication
   * cursor, and leaves an empty hand with zero draw/RNG movement.
   */
  #finalizeSettlementTerminal(
    outcome: EncounterOutcome,
    reason: OutcomeReason,
    event: EncounterEvent,
  ): TerminalCommit {
    this.#state = {
      ...this.#state,
      pendingSecureDecision: null,
      pendingFlowPresentation: null,
      outcome,
    };
    this.#dispatch(event);
    return {
      phase: 'TERMINAL',
      committedFrame: this.#captureFrame(),
      turnStartResourceDelta: zeroResourceDelta(),
      drawnInstanceIds: [],
      outcome,
      reason,
    };
  }

  #terminalEventFor(outcome: EncounterOutcome): EncounterEvent {
    return outcome === 'FAILED' ? 'FAIL_ENCOUNTER' : 'COMPLETE_ENCOUNTER';
  }

  #captureFrame(): EncounterPresentationFrame {
    return {
      snapshot: this.#state,
      knowledge: this.#state.publishedKnowledge ?? this.#toKnowledgeState(),
      presentationRevision: this.#state.presentationRevision ?? 0,
    };
  }

  #rejectSubmit(reason: SubmitRejectionReason): SubmitTransactionResult {
    return { kind: 'REJECTED', reason, snapshot: this.#state };
  }

  #assertLegacyLoop(action: string): void {
    if (this.#turnLoop === 'V2_ATOMIC') {
      throw new Error(
        `${action}() belongs to the legacy loop; V2_ATOMIC settles turns inside submitTransaction().`,
      );
    }
  }

  #assertV2Loop(action: string): void {
    if (this.#turnLoop !== 'V2_ATOMIC') {
      throw new Error(`${action}() requires the V2_ATOMIC turn loop.`);
    }
  }

  #bestConditions(): BestResolutionConditions {
    const sweetSpot = this.sweetSpot;
    return {
      composureMin: sweetSpot.composureMin,
      composureMax: sweetSpot.composureMax,
      ...(this.#encounter.objectives.state_conditions.coercion_max === undefined
        ? {}
        : {
            coercionMax:
              this.#encounter.objectives.state_conditions.coercion_max,
          }),
    };
  }

  #mintInstances(
    cardIds: readonly ContentId[],
    startSerial?: number,
  ): { instances: readonly CardInstance[]; nextDrawSerial: number } {
    let serial = startSerial ?? this.#state.nextDrawSerial ?? 0;
    const instances = cardIds.map((cardId) => {
      const instance: CardInstance = {
        instanceId: createCardInstanceId(
          this.#identityNodeId,
          this.#attemptId,
          serial,
        ),
        blueprintId: cardId,
      };
      serial += 1;
      return instance;
    });
    return { instances, nextDrawSerial: serial };
  }

  #isActiveRoundClaim(claimId: ContentId): boolean {
    const active = this.#state.claimIdByFacet;
    return active === undefined || Object.values(active).includes(claimId);
  }

  #claimExposure(claimId: ContentId | undefined): ClaimExposureState | undefined {
    if (claimId === undefined) return undefined;
    const activeShields = this.#state.shieldDurabilityByClaimId;
    if (activeShields !== undefined) {
      return claimExposureState(activeShields[claimId]);
    }
    const isShield = this.#encounter.rounds.some((round) =>
      round.shields.some((shield) => shield.claim_id === claimId),
    );
    return claimExposureState(
      isShield ? this.#state.claims[claimId]?.resistance ?? 0 : undefined,
    );
  }

  #shieldDurabilityFromClaims(
    claims: Readonly<Record<ContentId, EncounterClaimRuntime>>,
  ): Readonly<Record<ContentId, number>> | undefined {
    const current = this.#state.shieldDurabilityByClaimId;
    if (current === undefined) return undefined;
    return Object.fromEntries(
      Object.keys(current).map((claimId) => [
        claimId,
        claims[claimId]?.resistance ?? current[claimId] ?? 0,
      ]),
    );
  }

  #shieldDurabilityPatch(
    claims: Readonly<Record<ContentId, EncounterClaimRuntime>>,
  ): Readonly<Partial<Pick<EncounterRuntimeState, 'shieldDurabilityByClaimId'>>> {
    const shieldDurabilityByClaimId = this.#shieldDurabilityFromClaims(claims);
    return shieldDurabilityByClaimId === undefined
      ? {}
      : { shieldDurabilityByClaimId };
  }

  /** Final P1 gate: later card/relic/trait modifiers cannot hurt a true claim. */
  #restoreTruthDamageGate(
    resolution: Resolution,
    targetClaimId: ContentId | undefined,
    composure: number,
    resistance: number | undefined,
  ): void {
    if (resolution.code !== 'R_TRUTH_ATTACKED') return;
    const currentTarget = targetClaimId === undefined
      ? undefined
      : this.#state.claims[targetClaimId];
    const claims =
      targetClaimId === undefined || resistance === undefined || currentTarget === undefined
        ? this.#state.claims
        : {
            ...this.#state.claims,
            [targetClaimId]: { ...currentTarget, resistance },
          };
    this.#state = {
      ...this.#state,
      resources: { ...this.#state.resources, composure },
      claims,
      ...this.#shieldDurabilityPatch(claims),
    };
  }

  #injectFault(point: EncounterFaultPoint): void {
    this.#faultInjection?.[point]?.();
  }

  /** The only v2 draw path: five CARD_DRAW steps and five fresh instances. */
  #drawTurnHandV2(): void {
    assertEncounterInvariant(
      this.#turnLoop === 'V2_ATOMIC',
      'The with-replacement draw is v2-only.',
    );
    assertEncounterInvariant(
      this.#state.deck.hand.length === 0 &&
        (this.#state.handInstances ?? []).length === 0,
      'A v2 turn draw requires an empty settled hand.',
    );
    const slots = this.#state.drawSlots;
    const cardDrawRngState = this.#state.cardDrawRngState;
    assertEncounterInvariant(slots?.length === 5, 'V2 draw requires five slots.');
    assertEncounterInvariant(
      cardDrawRngState !== undefined,
      'V2 draw requires CARD_DRAW RNG state.',
    );
    const policy = createTurnDrawPolicy(
      slots,
      new Set(this.#cardDefinitions.map((card) => card.card_id)),
    );
    const draw = drawTurnHandWithReplacement(
      policy,
      cardDrawRngState,
      this.#state.cardDrawCursor ?? 0,
    );
    const minted = this.#mintInstances(draw.blueprintIds);
    this.#state = {
      ...this.#state,
      deck: {
        drawPile: policy.slots.map((slot) => slot.blueprintId),
        hand: [...draw.blueprintIds],
        discardPile: [...this.#state.deck.discardPile],
      },
      handInstances: minted.instances,
      nextDrawSerial: minted.nextDrawSerial,
      cardDrawRngState: draw.rngState,
      cardDrawCursor: draw.cursor,
    };
  }

  /**
   * Re-aligns the instance envelopes with `deck.hand` after any step that may
   * add or remove hand cards outside the instance-aware paths (for example a
   * legacy DRAW_CARD effect). Existing instances are kept greedily in order;
   * genuinely new cards are minted with fresh serials.
   */
  #reconcileHandInstances(): void {
    const hand = this.#state.deck.hand;
    const pool = [...(this.#state.handInstances ?? [])];
    let nextDrawSerial = this.#state.nextDrawSerial ?? 0;
    const instances: CardInstance[] = [];
    for (const cardId of hand) {
      const index = pool.findIndex(
        (instance) => instance.blueprintId === cardId,
      );
      if (index >= 0) {
        instances.push(pool[index]!);
        pool.splice(index, 1);
      } else {
        instances.push({
          instanceId: createCardInstanceId(
            this.#identityNodeId,
            this.#attemptId,
            nextDrawSerial,
          ),
          blueprintId: cardId,
        });
        nextDrawSerial += 1;
      }
    }
    this.#state = { ...this.#state, handInstances: instances, nextDrawSerial };
  }

  #dispatch(event: EncounterEvent): void {
    const machine = this.#machine.dispatch(event);
    this.#state = { ...this.#state, machine };
  }

  #procedure(): Procedure {
    return 'FAIR';
  }

  #selectInquiryRoute(
    intent: ActionIntent,
    request: SubmissionRequest,
  ): InquiryRouteDefinition | undefined {
    if (request.routeId !== undefined) {
      const requested = this.#definition.inquiry_routes.find(
        (route) => route.route_id === request.routeId,
      );
      if (requested === undefined) throw new Error(`Unknown inquiry route: ${request.routeId}.`);
      if (!requested.allowed_intents.includes(intent)) {
        throw new Error(`Inquiry route ${request.routeId} does not allow ${intent}.`);
      }
      if (
        request.targetClaimId !== undefined &&
        requested.target_slot !== request.targetClaimId
      ) {
        throw new Error(`Inquiry route ${request.routeId} targets a different claim.`);
      }
      return requested;
    }
    if (intent !== 'QUERY' && intent !== 'CLARIFY') return undefined;
    return this.#definition.inquiry_routes.find(
      (route) =>
        route.target_slot === request.targetClaimId &&
        route.allowed_intents.includes(intent),
    );
  }

  #isInquiryRouteAvailable(route: InquiryRouteDefinition): boolean {
    return (
      this.#state.openRouteIds.includes(route.route_id) &&
      (!route.single_use || !this.#state.usedRouteIds.includes(route.route_id)) &&
      route.preconditions.every((condition) =>
        evaluateFlowCondition(condition, this.#flowState()),
      )
    );
  }

  #applyInitialEffects(effects: readonly Effect[]): void {
    this.#state = applyModifierEffects(
      this.#state,
      effects.map((effect) => ({ type: effect.type, payload: effect })),
      (state, wrapped) => this.#applyEncounterEffect(state, wrapped.payload),
    );
  }

  #applyResolutionEffectSources(
    card: CardDefinition,
    request: SubmissionRequest,
  ): void {
    for (const source of this.#resolutionEffectSources) {
      const previousActivations =
        this.#state.resolutionEffectActivations[source.sourceId] ?? 0;
      if (
        source.usesPerEncounter !== undefined &&
        previousActivations >= source.usesPerEncounter
      ) {
        continue;
      }
      if (
        source.compatibleCardIds !== undefined &&
        !source.compatibleCardIds.includes(card.card_id)
      ) {
        continue;
      }
      if (
        source.compatibleIntents !== undefined &&
        !source.compatibleIntents.includes(card.intent)
      ) {
        continue;
      }

      const effects = source.effects.map((effect) =>
        this.#bindSelectedClaim(effect, request.targetClaimId),
      );
      this.#state = applyModifierEffects(
        this.#state,
        effects.map((effect) => ({ type: effect.type, payload: effect })),
        (state, wrapped) => this.#applyEncounterEffect(state, wrapped.payload),
      );
      this.#state = {
        ...this.#state,
        resolutionEffectActivations: {
          ...this.#state.resolutionEffectActivations,
          [source.sourceId]: previousActivations + 1,
        },
      };
    }
  }

  /**
   * A played card's authored modifiers. The resolver already blanks
   * `cardEffects` for invalid, blocked, and procedure-violating codes, so this
   * reducer never has to re-check whether the action actually happened.
   */
  #applyCardEffects(
    effects: readonly Effect[],
    request: SubmissionRequest,
    submittedEvidenceIds: readonly ContentId[],
  ): void {
    if (effects.length === 0) return;
    const bound = effects.map((effect) =>
      this.#bindSubmissionTargets(effect, request, submittedEvidenceIds),
    );
    this.#state = applyModifierEffects(
      this.#state,
      bound.map((effect) => ({ type: effect.type, payload: effect })),
      (state, wrapped) => this.#applyEncounterEffect(state, wrapped.payload),
    );
  }

  /**
   * The 14-card catalogue is shared by every case, so card modifiers address
   * the play the player just made through sentinels instead of case-local ids.
   * An unmatched sentinel collapses to no targets, which every effect reducer
   * already treats as a no-op.
   *
   * `submittedEvidenceIds` is the resolver's own accepted set, not the raw
   * request: an unowned or sealed item never reached the judgment, so a card
   * modifier must not be able to reach it either.
   */
  #bindSubmissionTargets(
    effect: Effect,
    request: SubmissionRequest,
    submittedEvidenceIds: readonly ContentId[],
  ): Effect {
    const claimBound = this.#bindSelectedClaim(effect, request.targetClaimId);
    const declared = [
      ...(claimBound.target === undefined ? [] : [claimBound.target]),
      ...(claimBound.targets ?? []),
    ];
    if (!declared.includes(RUNTIME_SELECTED_EVIDENCE)) return claimBound;
    const expanded = [...unique(declared.flatMap((target) =>
      target === RUNTIME_SELECTED_EVIDENCE ? [...submittedEvidenceIds] : [target],
    ))];
    // `target` is intentionally dropped: one sentinel can expand to many ids.
    return {
      type: claimBound.type,
      ...(claimBound.resource === undefined ? {} : { resource: claimBound.resource }),
      ...(claimBound.delta === undefined ? {} : { delta: claimBound.delta }),
      ...(claimBound.value === undefined ? {} : { value: claimBound.value }),
      ...(claimBound.duration_turns === undefined
        ? {}
        : { duration_turns: claimBound.duration_turns }),
      ...(claimBound.parameters === undefined ? {} : { parameters: claimBound.parameters }),
      targets: expanded,
    };
  }

  #bindSelectedClaim(effect: Effect, targetClaimId?: ContentId): Effect {
    if (targetClaimId === undefined) return effect;
    const bind = (target: ContentId): ContentId =>
      target === RUNTIME_SELECTED_CLAIM ? targetClaimId : target;
    const targets = effect.targets?.map(bind);
    return {
      ...effect,
      ...(effect.target === undefined ? {} : { target: bind(effect.target) }),
      ...(targets === undefined ? {} : { targets }),
      ...(
        effect.type === 'SET_CLAIM_STATE' &&
        effect.target === undefined &&
        effect.targets === undefined
          ? { target: targetClaimId }
          : {}
      ),
    };
  }

  #applyEncounterEffect(
    state: EncounterRuntimeState,
    effect: Effect,
  ): EncounterRuntimeState {
    const targets = unique([
      ...(effect.target === undefined ? [] : [effect.target]),
      ...(effect.targets ?? []),
    ]);

    if (effect.type === 'ADJUST_RESOURCE' || effect.type === 'REDUCE_CP') {
      const resource = effect.type === 'REDUCE_CP'
        ? 'commandPoints'
        : effect.resource === 'cp'
          ? 'commandPoints'
          : effect.resource;
      const delta = effect.type === 'REDUCE_CP'
        ? -Math.abs(effect.delta ?? 1)
        : (effect.delta ?? 0);
      let resources: EncounterResourceState;
      switch (resource) {
        case 'composure':
          resources = { ...state.resources, composure: state.resources.composure + delta };
          break;
        case 'commandPoints':
          resources = {
            ...state.resources,
            commandPoints: state.resources.commandPoints + delta,
          };
          break;
        case 'coercion':
          resources = { ...state.resources, coercion: state.resources.coercion + delta };
          break;
        case 'stress':
          resources = { ...state.resources, stress: state.resources.stress + delta };
          break;
        case 'dp':
          resources = { ...state.resources, dp: state.resources.dp + delta };
          break;
        case 'trust':
          resources = { ...state.resources, trust: state.resources.trust + delta };
          break;
        default:
          throw new Error(`${effect.type} requires a supported encounter resource.`);
      }
      return { ...state, resources: clampResourceState(resources, this.#limits) };
    }

    if (effect.type === 'GRANT_EVIDENCE') {
      return {
        ...state,
        evidence: Object.fromEntries(Object.entries(state.evidence).map(
          ([evidenceId, evidence]) => [
            evidenceId,
            targets.includes(evidenceId) ? { ...evidence, acquired: true } : evidence,
          ],
        )),
      };
    }

    if (effect.type === 'UPGRADE_EVIDENCE') {
      const gradeRank: Readonly<Record<Grade, number>> = { C: 0, B: 1, A: 2 };
      return {
        ...state,
        evidence: Object.fromEntries(Object.entries(state.evidence).map(
          ([evidenceId, evidence]) => {
            if (!targets.includes(evidenceId)) return [evidenceId, evidence];
            const definition = this.#definition.evidence.find(
              (candidate) => candidate.evidence_id === evidenceId,
            );
            const nextGrade = definition?.grade.upgrades
              .map((upgrade) => upgrade.to)
              .filter((grade) => gradeRank[grade] > gradeRank[evidence.grade])
              .sort((left, right) => gradeRank[left] - gradeRank[right])[0];
            return [
              evidenceId,
              nextGrade === undefined ? evidence : { ...evidence, grade: nextGrade },
            ];
          },
        )),
      };
    }

    if (effect.type === 'OPEN_ROUTE') {
      return { ...state, openRouteIds: unique([...state.openRouteIds, ...targets]) };
    }

    if (effect.type === 'DRAW_CARD') {
      return { ...state, deck: dealInitialHand(state.deck, 1).deck };
    }

    if (effect.type === 'MODIFY_SHIELDS') {
      const shieldClaimIds = state.shieldDurabilityByClaimId === undefined
        ? unique(this.#encounter.rounds.flatMap((round) =>
            round.shields.map((shield) => shield.claim_id),
          ))
        : Object.keys(state.shieldDurabilityByClaimId);
      const affectedIds = targets.length > 0 ? targets : shieldClaimIds;
      const delta = effect.delta ?? 0;
      return {
        ...state,
        claims: Object.fromEntries(Object.entries(state.claims).map(
          ([claimId, claim]) => [
            claimId,
            affectedIds.includes(claimId)
              ? { ...claim, resistance: Math.max(0, claim.resistance + delta) }
              : claim,
          ],
        )),
      };
    }

    if (effect.type === 'REVEAL_CLAIMS') {
      const claims = { ...state.claims };
      for (const claimId of targets) {
        const previous = claims[claimId];
        if (previous === undefined) continue;
        const next: EncounterClaimRuntime = previous.presentation === 'HIDDEN'
          ? {
              ...previous,
              presentation: 'NORMAL',
              commitment:
                previous.commitment === 'UNSTATED'
                  ? 'ASSERTED'
                  : previous.commitment,
            }
          : previous;
        assertClaimStateInvariants(next);
        claims[claimId] = next;
      }
      return {
        ...state,
        claims,
        revealedIds: unique([...state.revealedIds, ...targets]),
      };
    }

    if (effect.type === 'SET_CLAIM_STATE') {
      if (
        typeof effect.value !== 'string' ||
        !COMMITMENT_STATES.includes(effect.value as CommitmentState)
      ) {
        throw new Error('SET_CLAIM_STATE requires a supported commitment state.');
      }
      const commitment = effect.value as CommitmentState;
      const claims = { ...state.claims };
      for (const claimId of targets) {
        const previous = claims[claimId];
        if (previous === undefined) continue;
        const next = { ...previous, commitment };
        assertAxisTransition(previous, next, 'COMMITMENT');
        assertClaimStateInvariants(next);
        claims[claimId] = next;
      }
      return { ...state, claims };
    }

    throw new Error(`Unsupported encounter runtime effect: ${effect.type}.`);
  }

  #startTurn(drawPerTurn = true): void {
    let rngState = this.#state.rngState;
    const result = processEncounterTurnStart(
      {
        resources: this.#state.resources,
        deck: this.#state.deck,
        statusDurations: this.#state.durations,
        cooldowns: this.#state.cooldowns,
      },
      this.#limits,
      {
        draw: {
          perTurn: drawPerTurn ? this.#balance.draw.perTurn : 0,
          handLimit: this.#balance.draw.handLimit,
          reshuffleOnEmpty: this.#balance.draw.reshuffleOnEmpty,
        },
        reorderDiscardPile: (cards) => {
          const shuffled = shuffleWithState(cards, rngState);
          rngState = shuffled.state;
          return shuffled.values;
        },
      },
    );
    this.#state = {
      ...this.#state,
      resources: result.state.resources,
      deck: result.state.deck,
      durations: result.state.statusDurations,
      cooldowns: result.state.cooldowns,
      rngState,
    };
    this.#applyModifiers('ON_TURN_START_PRE_DRAW');
    // Backward-compatible legacy authoring only. V2 content is validated and
    // migrated to the explicit pre-draw trigger.
    this.#applyModifiers('ON_TURN_START');
  }

  #flowState(): CoordinatorFlowState {
    return {
      ...(this.#state.flowNodeId === null
        ? {}
        : { currentNodeId: this.#state.flowNodeId }),
      enteredNodeIds: this.#state.enteredFlowNodeIds,
      claims: this.#state.claims,
      revealedClaimIds: this.#state.revealedIds,
      openRouteIds: this.#state.openRouteIds,
      usedRouteIds: this.#state.usedRouteIds,
      activeModifierIds: this.#state.activeModifierIds,
      completedObjectiveIds: this.#state.objectives.required
        .filter((objective) => objective.completed)
        .map((objective) => objective.objectiveId),
      requiredObjectiveIds: this.#state.objectives.required.map(
        (objective) => objective.objectiveId,
      ),
      resources: { ...this.#state.resources },
      terminal: false,
    };
  }

  #runFlow(): boolean {
    const result = runFlowTransition(
      this.#encounter.flow_nodes,
      this.#flowState(),
    );
    if (!result.transitioned) return false;
    const output = result.state.resources;
    const flowNodeIndex = result.node === undefined
      ? -1
      : this.#encounter.flow_nodes.findIndex(
          (node) => node.node_id === result.node?.node_id,
        );
    const nextRoundIndex =
      this.#turnLoop === 'V2_ATOMIC' &&
      flowNodeIndex > (this.#state.activeRoundIndex ?? 0) &&
      flowNodeIndex < this.#encounter.rounds.length
        ? flowNodeIndex
        : this.#state.activeRoundIndex;
    const roundAdvanced =
      nextRoundIndex !== undefined &&
      nextRoundIndex !== this.#state.activeRoundIndex;
    const nextRound = roundAdvanced
      ? interrogationRoundState(
          this.#definition,
          this.#encounter,
          nextRoundIndex,
          this.#state.presentedRoundIndex ?? 0,
        )
      : undefined;
    const claims = nextRound === undefined
      ? result.state.claims
      : Object.fromEntries(
          Object.entries(result.state.claims).map(([claimId, claim]) => [
            claimId,
            Object.values(nextRound.claimIdByFacet).includes(claimId)
              ? {
                  ...claim,
                  resistance: nextRound.shieldDurabilityByClaimId[claimId] ?? 0,
                }
              : claim,
          ]),
        );
    this.#state = {
      ...this.#state,
      resources: clampResourceState(
        {
          ...this.#state.resources,
          composure: output.composure ?? this.#state.resources.composure,
          coercion: output.coercion ?? this.#state.resources.coercion,
          commandPoints:
            output.commandPoints ?? output.cp ?? this.#state.resources.commandPoints,
          stress: output.stress ?? this.#state.resources.stress,
          dp: output.dp ?? this.#state.resources.dp,
          trust: output.trust ?? this.#state.resources.trust,
          turn: output.turn ?? this.#state.resources.turn,
        },
        this.#limits,
      ),
      claims,
      flowNodeId: result.state.currentNodeId ?? null,
      enteredFlowNodeIds: result.state.enteredNodeIds,
      openRouteIds: result.state.openRouteIds,
      activeModifierIds: result.state.activeModifierIds,
      revealedIds: result.state.revealedClaimIds,
      ...(nextRound ?? {}),
    };
    return true;
  }

  #modifierState(): CoordinatorModifierState {
    return {
      turn: this.#state.resources.turn,
      claims: this.#state.claims,
      evidence: this.#state.evidence,
      cards: this.#state.cards,
      resources: { ...this.#state.resources },
      revealedClaimIds: this.#state.revealedIds,
      evidenceOrder: this.#definition.evidence.map(
        (evidence) => evidence.evidence_id,
      ),
      usedRouteIds: this.#state.usedRouteIds,
      hand: this.#state.deck.hand,
      drawPile: this.#state.deck.drawPile,
      discardPile: this.#state.deck.discardPile,
      activeModifierIds: this.#state.activeModifierIds,
      modifierActivations: this.#state.modifierActivations,
      actionLocks: this.#state.actionLocks,
      actionCostDeltas: this.#state.actionCostDeltas,
      completedObjectiveIds: this.#state.objectives.required
        .filter((objective) => objective.completed)
        .map((objective) => objective.objectiveId),
      requiredObjectiveIds: this.#state.objectives.required.map(
        (objective) => objective.objectiveId,
      ),
      ...(this.#state.flowNodeId === null
        ? {}
        : { phaseId: this.#state.flowNodeId }),
      ...(this.#state.outcome === null ? {} : { outcome: this.#state.outcome }),
    };
  }

  #applyModifiers(trigger: ModifierTrigger): void {
    const result = applyTriggeredModifiers(
      this.#modifierState(),
      this.#encounter.modifiers,
      trigger,
      {
        rngState: this.#state.rngState,
        hasSolvablePath: (state) => this.#hasSolvableModifierPath(state),
      },
    );
    const output = result.state.resources;
    this.#state = {
      ...this.#state,
      resources: clampResourceState(
        {
          ...this.#state.resources,
          composure: output.composure ?? this.#state.resources.composure,
          coercion: output.coercion ?? this.#state.resources.coercion,
          commandPoints:
            output.commandPoints ?? output.cp ?? this.#state.resources.commandPoints,
          stress: output.stress ?? this.#state.resources.stress,
          dp: output.dp ?? this.#state.resources.dp,
          trust: output.trust ?? this.#state.resources.trust,
          turn: output.turn ?? this.#state.resources.turn,
        },
        this.#limits,
      ),
      claims: result.state.claims,
      evidence: result.state.evidence,
      cards: result.state.cards,
      deck: {
        hand: result.state.hand ?? this.#state.deck.hand,
        drawPile: result.state.drawPile ?? this.#state.deck.drawPile,
        discardPile: result.state.discardPile ?? this.#state.deck.discardPile,
      },
      activeModifierIds:
        result.state.activeModifierIds ?? this.#state.activeModifierIds,
      modifierActivations:
        result.state.modifierActivations ?? this.#state.modifierActivations,
      actionLocks: result.state.actionLocks ?? this.#state.actionLocks,
      actionCostDeltas:
        result.state.actionCostDeltas ?? this.#state.actionCostDeltas,
      rngState: result.rngState ?? this.#state.rngState,
    };
  }

  #refreshObjectives(): void {
    const objectives = evaluateObjectives(this.#encounter.objectives, {
      claims: this.#knowledgeClaims(false),
      evidence: Object.entries(this.#state.evidence).map(
        ([evidenceId, evidence]) => ({
          evidenceId,
          acquired: evidence.acquired,
          integrity: evidence.integrity,
        }),
      ),
      resources: this.#state.resources,
      damagedEntityIds: [],
      encounterFinished: this.#state.outcome !== null,
      encounterFailed: this.#state.outcome === 'FAILED',
    });
    this.#state = { ...this.#state, objectives };
  }

  #hasSolvableModifierPath(state: CoordinatorModifierState): boolean {
    const evidence = this.#definition.evidence.flatMap((definition) => {
      const runtime = state.evidence[definition.evidence_id];
      return runtime === undefined || runtime.integrity === 'DESTROYED'
        ? []
        : [toResolutionEvidence(definition, runtime)];
    });
    const summary = evaluateObjectives(this.#encounter.objectives, {
      claims: this.#knowledgeClaimsFrom(state.claims),
      evidence: Object.entries(state.evidence).map(([evidenceId, item]) => ({
        evidenceId,
        acquired: item.acquired,
        integrity: item.integrity,
      })),
      resources: this.#state.resources,
    });
    return hasSolvableRequiredObjectivePath(summary.required, (objective) => {
      if (objective.evidence_id !== undefined) {
        return state.evidence[objective.evidence_id]?.integrity === 'INTACT';
      }
      if (objective.claim_id === undefined) return true;
      const rules = this.#definition.proof_rules
        .filter((rule) => rule.target_claim_id === objective.claim_id)
        .map(toResolutionProofRule);
      return hasSolvableProofPath(rules, evidence);
    });
  }

  #hasSolvablePath(): boolean {
    return this.#hasSolvableModifierPath(this.#modifierState());
  }

  #evaluateCurrentOutcome(
    secureStatementRequested: boolean,
  ): OutcomeEvaluation {
    return evaluateOutcome({
      resources: this.#state.resources,
      objectives: this.#state.objectives,
      coercionLimit: this.#limits.coercionLimit,
      turnLimit: this.#definition.metadata.estimated_turns,
      hasSolvablePath: this.#hasSolvablePath(),
      bestConditions: this.#bestConditions(),
      secureStatementRequested,
    });
  }

  #commitOutcome(outcome: OutcomeEvaluation): void {
    this.#state = {
      ...this.#state,
      outcome: outcome.terminalOutcome,
    };
    if (!outcome.terminal) return;
    this.#dispatch(
      outcome.terminalOutcome === 'FAILED'
        ? 'FAIL_ENCOUNTER'
        : 'COMPLETE_ENCOUNTER',
    );
  }

  #knowledgeClaims(includeHidden: boolean): readonly ClaimKnowledge[] {
    const encounterClaimIds = this.#turnLoop === 'V2_ATOMIC' &&
      this.#state.claimIdByFacet !== undefined
      ? new Set(Object.values(this.#state.claimIdByFacet))
      : new Set(this.#encounter.rounds.flatMap((round) => round.statement_claims));
    return this.#definition.claims.flatMap((definition) => {
      const runtime = this.#state.claims[definition.claim_id];
      if (
        runtime === undefined ||
        !encounterClaimIds.has(definition.claim_id) ||
        (!includeHidden && runtime.presentation === 'HIDDEN')
      ) {
        return [];
      }
      return [
        {
          claimId: definition.claim_id,
          speakerId: definition.speaker,
          facet: definition.facet,
          canonicalMeaning: definition.canonical_meaning,
          commitment: runtime.commitment,
          epistemic: runtime.epistemic,
          presentation: runtime.presentation,
          resistance: runtime.resistance,
          isRequired: runtime.isRequired,
        },
      ];
    });
  }

  #knowledgeClaimsFrom(
    claims: Readonly<Record<string, EncounterClaimRuntime>>,
  ): readonly ClaimKnowledge[] {
    return this.#definition.claims.flatMap((definition) => {
      const runtime = claims[definition.claim_id];
      if (runtime === undefined) return [];
      return [
        {
          claimId: definition.claim_id,
          speakerId: definition.speaker,
          facet: definition.facet,
          canonicalMeaning: definition.canonical_meaning,
          commitment: runtime.commitment,
          epistemic: runtime.epistemic,
          presentation: runtime.presentation,
          resistance: runtime.resistance,
          isRequired: runtime.isRequired,
        },
      ];
    });
  }

  #toKnowledgeState(): KnowledgeState {
    return {
      claims: this.#knowledgeClaims(false),
      evidence: this.#definition.evidence.map((definition) => {
        const runtime = this.#state.evidence[definition.evidence_id];
        return {
          evidenceId: definition.evidence_id,
          displayName: definition.title_key,
          acquired: runtime?.acquired ?? false,
          grade: runtime?.grade ?? definition.grade.initial,
          scopes: unique(
            definition.observations.flatMap((observation) => observation.scopes),
          ),
          notProvenKeys: definition.not_proven_keys,
        };
      }),
    };
  }

}
