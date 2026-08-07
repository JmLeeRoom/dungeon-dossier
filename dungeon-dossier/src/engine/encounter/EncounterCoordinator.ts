import {
  dealInitialHand,
  playCard,
  type CardDefinition,
  type DeckState,
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
  Grade,
  ProofScope,
} from '../domain';
import {
  assertAxisTransition,
  assertClaimStateInvariants,
  type ClaimKnowledge,
  type KnowledgeState,
} from '../knowledge';
import { appendJudgmentLog, type JudgmentLog } from '../log';
import {
  applyResolution,
  hasSolvableProofPath,
  resolveArgument,
  selectProofRule,
  toResolutionClaim,
  toResolutionEvidence,
  toResolutionProofRule,
  toResolverBalance,
  type AppliedClaimState,
  type Procedure,
  type Resolution,
  type ResolutionRuntimeState,
} from '../resolution';
import { shuffleWithState, type RngState } from '../rng';
import {
  EncounterStateMachine,
  type ContentValidationMode,
  type EncounterEvent,
  type EncounterMachineSnapshot,
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
  type ModifierRuntimeCard,
  type ModifierRuntimeEvidence,
  type ModifierRuntimeState,
  type ModifierTrigger,
} from './ModifierSystem';
import {
  evaluateObjectives,
  hasSolvableRequiredObjectivePath,
  type ObjectiveEvaluationSummary,
} from './ObjectiveEvaluator';
import {
  evaluateOutcome,
  type EncounterOutcome,
  type OutcomeEvaluation,
} from './OutcomeEvaluator';
import {
  clampResourceState,
  createResourceState,
  processEncounterTurnStart,
  spendCommandPoints,
  type EncounterResourceLimits,
  type EncounterResourceState,
  type TurnDurationMap,
} from './ResourceSystem';

export interface EncounterEvidenceRuntime extends ModifierRuntimeEvidence {
  readonly acquired: boolean;
  readonly grade: Grade;
}

export interface EncounterClaimRuntime extends AppliedClaimState {
  readonly lockedUntilTurn?: number;
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
}

export interface EncounterCoordinatorDeps {
  readonly caseDefinition: CaseDefinition;
  readonly encounterId: ContentId;
  readonly cards: readonly CardDefinition[];
  readonly balance: BalanceDefinition;
  readonly rng: RngState;
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
}

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
): Readonly<Record<ContentId, EncounterClaimRuntime>> {
  const shieldDurability = new Map<ContentId, number>();
  for (const shield of encounter.rounds.flatMap((round) => round.shields)) {
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
        resistance: shieldDurability.get(claim.claim_id) ?? claim.resistance ?? 0,
        isRequired: claim.is_required ?? false,
      },
    ]),
  );
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

export class EncounterCoordinator {
  readonly #definition: CaseDefinition;
  readonly #encounter: EncounterDefinition;
  readonly #cardDefinitions: readonly CardDefinition[];
  readonly #resolutionEffectSources: readonly ResolutionEffectSource[];
  #balance: BalanceDefinition;
  #limits: EncounterResourceLimits;
  readonly #machine: EncounterStateMachine;
  #state: EncounterRuntimeState;

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
    const initialDeckCardIds = deps.initialDeckCardIds ?? cardCopies(deps.cards);
    const unknownDeckCardId = initialDeckCardIds.find(
      (cardId) => !cardIds.includes(cardId),
    );
    if (unknownDeckCardId !== undefined) {
      throw new Error(`Initial deck references unknown card: ${unknownDeckCardId}.`);
    }
    const shuffled = shuffleWithState(initialDeckCardIds, deps.rng);
    const dealt = dealInitialHand(
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
        claims: initialClaims(deps.caseDefinition, encounter),
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
        revealedIds: encounter.rounds
          .flatMap((round) => round.statement_claims)
          .filter((claimId, index, claimIds) => claimIds.indexOf(claimId) === index),
        objectives: emptyObjectives,
        rngState: shuffled.state,
        log: [],
        outcome: null,
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
    return coordinator;
  }

  get snapshot(): EncounterRuntimeState {
    return this.#state;
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

  /** Safe knowledge projection consumed by the canonical DTO whitelist mapper. */
  get knowledge(): KnowledgeState {
    return this.#toKnowledgeState();
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
    const history = this.#encounter.rounds.flatMap((round) =>
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

  #resolveSubmission(
    request: SubmissionRequest,
    card: CardDefinition,
    commandPointCost: number,
    provisionallySpent: EncounterResourceState,
  ): SubmissionResult {
    this.#dispatch('ARGUMENT_BUILT');
    this.#dispatch('ACTION_SUBMITTED');
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
    const proofDefinition =
      card.intent === 'CONFIRM' || card.intent === 'CONTRADICT'
        ? selectProofRule(
            this.#definition.proof_rules,
            request.targetClaimId,
            targetDirection(card.intent),
          )
        : undefined;
    const proofRule =
      proofDefinition === undefined
        ? undefined
        : toResolutionProofRule(proofDefinition);
    const withinEvidenceRange =
      evidence.length >= (card.target.min_evidence ?? 0) &&
      evidence.length <= (card.target.max_evidence ?? Number.POSITIVE_INFINITY);
    const facetAllowed =
      targetDefinition === undefined ||
      card.target.facets === undefined ||
      card.target.facets.includes(targetDefinition.facet);
    const resolution = resolveArgument({
      intent: card.intent,
      targetKind: card.target.kind,
      ...(target === undefined ? {} : { target }),
      targetExposed:
        card.target.kind !== 'CLAIM' ||
        (targetRuntime !== undefined &&
          targetRuntime.presentation !== 'HIDDEN' &&
          request.targetClaimId !== undefined &&
          this.#state.revealedIds.includes(request.targetClaimId)),
      actionCompatible: withinEvidenceRange && facetAllowed,
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
    this.#dispatch('MODIFIERS_APPLIED');

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

  endTurn(): OutcomeEvaluation {
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
      const shieldClaimIds = unique(this.#encounter.rounds.flatMap((round) =>
        round.shields.map((shield) => shield.claim_id),
      ));
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
      flowNodeId: result.state.currentNodeId ?? null,
      enteredFlowNodeIds: result.state.enteredNodeIds,
      openRouteIds: result.state.openRouteIds,
      activeModifierIds: result.state.activeModifierIds,
      revealedIds: result.state.revealedClaimIds,
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
    const sweetSpot = this.sweetSpot;
    return evaluateOutcome({
      resources: this.#state.resources,
      objectives: this.#state.objectives,
      coercionLimit: this.#limits.coercionLimit,
      turnLimit: this.#definition.metadata.estimated_turns,
      hasSolvablePath: this.#hasSolvablePath(),
      bestConditions: {
        composureMin: sweetSpot.composureMin,
        composureMax: sweetSpot.composureMax,
        ...(this.#encounter.objectives.state_conditions.coercion_max === undefined
          ? {}
          : {
              coercionMax:
                this.#encounter.objectives.state_conditions.coercion_max,
            }),
      },
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
    const encounterClaimIds = new Set(
      this.#encounter.rounds.flatMap((round) => round.statement_claims),
    );
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
