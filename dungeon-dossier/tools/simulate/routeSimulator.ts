import balanceJson from '../../content/common/balance.json';
import cardsJson from '../../content/common/cards.json';
import ep001CaseJson from '../../content/cases/ep001/case.json';
import ep004CaseJson from '../../content/cases/ep004/case.json';
import tutorialCaseJson from '../../content/cases/tutorial/case.json';
import {
  evaluateObjectives,
  hasSolvableRequiredObjectivePath,
  type ObjectiveDefinition,
  type ObjectiveEvaluationSummary,
} from '../../src/engine/encounter/ObjectiveEvaluator';
import {
  evaluateOutcome,
  type EncounterOutcome,
} from '../../src/engine/encounter/OutcomeEvaluator';
import {
  EncounterCoordinator,
  type EncounterRuntimeState,
  type SubmissionRequest,
} from '../../src/engine/encounter/EncounterCoordinator';
import {
  applyResourceDelta,
  beginEncounterTurn,
  createResourceState,
  type EncounterResourceLimits,
  type EncounterResourceState,
} from '../../src/engine/encounter/ResourceSystem';
import {
  BalanceSchema,
  CardsSchema,
  CaseSchema,
  type BalanceDefinition,
  type CaseDefinition,
  type EncounterDefinition,
  type Facet,
} from '../../src/engine/domain';
import type {
  CommitmentState,
  EpistemicState,
  PresentationState,
} from '../../src/engine/knowledge';
import { canonicalStringify } from '../../src/engine/log/canonicalStringify';
import { serializeJudgmentLog } from '../../src/engine/log/JudgmentLog';
import { createRngState } from '../../src/engine/rng';

/** Open content-owned label derived from each authored encounter target. */
declare const simulationArchetypeBrand: unique symbol;
export type SimulationArchetype = string & {
  readonly [simulationArchetypeBrand]: true;
};

export const SIMULATION_OUTCOMES = [
  'BEST_RESOLUTION',
  'COERCED_CONFESSION',
  'PARTIAL_RESOLUTION',
] as const;
export type SimulationOutcome = (typeof SIMULATION_OUTCOMES)[number];

export type SimulationAction =
  | Readonly<{
      actionId: string;
      kind: 'SUBMIT';
      objectiveId: string;
      claimId: string;
      proofRuleId: string;
      cardId: string;
      tagId: string;
      routeId?: string;
      resolutionCode?: string;
      evidenceIds: readonly string[];
      resultingEpistemic: 'SUPPORTED' | 'REFUTED';
      composureDelta: number;
    }>
  | Readonly<{
      actionId: string;
      kind: 'SECURE_STATEMENT';
    }>
  | Readonly<{
      actionId: string;
      kind: 'END_TURN';
    }>
  | Readonly<{
      actionId: string;
      kind: 'COERCE';
      composureDelta: number;
    }>
  | Readonly<{
      actionId: string;
      kind: 'WAIT';
    }>;

export interface SimulationPolicy {
  readonly policyId: string;
  readonly intendedOutcome: SimulationOutcome;
  readonly actions: readonly SimulationAction[];
}

export interface SimulationClaimState {
  readonly claimId: string;
  readonly commitment: CommitmentState;
  readonly epistemic: EpistemicState;
  readonly presentation: PresentationState;
}

export interface SimulationProofPath {
  readonly objectiveId: string;
  readonly claimId: string;
  readonly proofRuleId: string;
  readonly direction: 'SUPPORT' | 'CONTRADICT';
  readonly cardId: string;
  readonly facet: Facet;
  readonly evidenceIds: readonly string[];
  readonly resultingEpistemic: 'SUPPORTED' | 'REFUTED';
  readonly composureDelta: number;
}

export interface SimulationEncounterCatalogEntry {
  readonly archetype: SimulationArchetype;
  readonly caseId: string;
  readonly encounterId: string;
  readonly targetEntityId: string;
  readonly composureMax: number;
  readonly commandPointMax: number;
  readonly commandPointsPerTurn: number;
  readonly coercionLimit: number;
  readonly stressMax: number;
  readonly trustMax: number;
  readonly turnLimit: number;
  readonly sweetSpot: Readonly<{
    min: number;
    max: number;
    coercionMax?: number;
  }>;
  readonly objectives: Readonly<{
    required: ObjectiveDefinition[];
    optional: ObjectiveDefinition[];
    state_conditions: {
      composure_min: number;
      composure_max: number;
      coercion_max?: number;
    };
  }>;
  readonly initialClaims: readonly SimulationClaimState[];
  /** Claim proof paths that complete authored claim-based objectives. */
  readonly completionProofPaths: readonly SimulationProofPath[];
  /** Direct-contradiction audit paths retained for the legacy BEST smoke contract. */
  readonly proofPaths: readonly SimulationProofPath[];
  readonly guaranteedObjectiveIds: readonly string[];
  readonly alternatePath: readonly string[];
  readonly policies: Readonly<Record<SimulationOutcome, SimulationPolicy>>;
}

export interface RouteMatrixCell {
  readonly archetype: SimulationArchetype;
  readonly caseId: string;
  readonly encounterId: string;
  readonly intendedOutcome: SimulationOutcome;
}

export type SimulationTerminationReason =
  | 'TERMINAL_OUTCOME'
  | 'POLICY_EXHAUSTED'
  | 'STEP_LIMIT_REACHED';

export interface SimulationStepLog {
  readonly step: number;
  readonly turn: number;
  readonly actionId: string;
  readonly actionKind: SimulationAction['kind'];
  readonly composure: number;
  readonly coercion: number;
  readonly completedObjectiveIds: readonly string[];
  readonly terminalOutcome: EncounterOutcome | null;
  readonly bestConditionsMet: boolean;
  readonly secureStatementEnabled: boolean;
  readonly secureStatementRequested: boolean;
  readonly cardId?: string;
  readonly routeId?: string;
  readonly resolutionCode?: string;
  readonly commandPoints?: number;
  readonly handCardIds?: readonly string[];
  readonly modifierActivationCount?: number;
}

export type SimulationExecution =
  | 'ENCOUNTER_COORDINATOR'
  | 'OUTCOME_EVALUATOR';

export interface RouteSimulationResult {
  readonly archetype: SimulationArchetype;
  readonly caseId: string;
  readonly encounterId: string;
  readonly intendedOutcome: SimulationOutcome;
  readonly policyId: string;
  readonly seed: number;
  readonly inputSequence: readonly SimulationAction[];
  readonly outcome: EncounterOutcome | null;
  readonly terminated: boolean;
  readonly terminationReason: SimulationTerminationReason;
  readonly steps: number;
  readonly maxSteps: number;
  readonly completedObjectiveIds: readonly string[];
  readonly allRequiredObjectivesCompleted: boolean;
  readonly bestUnlockObserved: boolean;
  readonly explicitBestConfirmation: boolean;
  readonly execution: SimulationExecution;
  readonly routeIdsUsed: readonly string[];
  readonly modifierActivationCount: number;
  /** Canonical engine JudgmentLog bytes for coordinator-backed BEST routes. */
  readonly coordinatorJudgmentLogBytes: string | null;
  readonly judgmentLog: readonly SimulationStepLog[];
  /** Canonical, timing-free serialization used by deterministic replay tests. */
  readonly judgmentLogBytes: string;
}

export interface SimulationRunOptions {
  readonly seed?: number;
}

const BALANCE = BalanceSchema.parse(balanceJson);
const CARD_CATALOG = CardsSchema.parse(cardsJson);
const CASE_DEFINITIONS: readonly CaseDefinition[] = Object.freeze([
  CaseSchema.parse(tutorialCaseJson),
  CaseSchema.parse(ep001CaseJson),
  CaseSchema.parse(ep004CaseJson),
]);
const CASE_DEFINITION_BY_ID = new Map(
  CASE_DEFINITIONS.map((definition) => [definition.case_id, definition]),
);

function uniqueStrings(values: readonly string[]): readonly string[] {
  return values.filter((value, index) => values.indexOf(value) === index);
}

function isSimulationArchetype(value: unknown): value is SimulationArchetype {
  return typeof value === 'string' && value.trim().length > 0;
}

function encounterArchetype(
  definition: CaseDefinition,
  encounter: EncounterDefinition,
): SimulationArchetype {
  const entity = definition.entities.find(
    (candidate) => candidate.entity_id === encounter.target_entity,
  );
  const value = entity?.attributes.archetype;
  if (!isSimulationArchetype(value)) {
    throw new Error(
      `Encounter ${encounter.encounter_id} target must declare an archetype.`,
    );
  }
  const dialogueRace = definition.dialogue.speaker_profiles[
    encounter.target_entity
  ]?.race;
  if (dialogueRace !== value) {
    throw new Error(
      `Encounter ${encounter.encounter_id} archetype disagrees with its speaker profile.`,
    );
  }
  return value;
}

function resolvedEncounterResources(
  balance: BalanceDefinition,
  encounter: EncounterDefinition,
): EncounterDefinition['resources'] {
  const base = encounter.resources;
  const override = balance.overrides.byEncounter[encounter.encounter_id];
  return {
    composure_max: override?.composureMax ?? base.composure_max,
    cp_per_turn: override?.cpPerTurn ?? base.cp_per_turn,
    cp_max: override?.cpMax ?? base.cp_max,
    coercion_limit: override?.coercionLimit ?? base.coercion_limit,
    shields_per_round: override?.shieldsPerRound ?? base.shields_per_round,
  };
}

function proofDirectionForObjective(
  objective: ObjectiveDefinition,
): 'SUPPORT' | 'CONTRADICT' | undefined {
  if (objective.type === 'CONFIRM_CLAIM') return 'SUPPORT';
  if (objective.type === 'REFUTE_CLAIM') return 'CONTRADICT';
  if (objective.type === 'RESOLVE_CLAIM') return undefined;
  throw new Error(
    `Required objective ${objective.objective_id} cannot be simulated through a Claim proof path.`,
  );
}

function proofPathForObjective(
  definition: CaseDefinition,
  objective: ObjectiveDefinition,
): SimulationProofPath {
  if (objective.claim_id === undefined) {
    throw new Error(`Required objective ${objective.objective_id} has no claim.`);
  }
  const claim = definition.claims.find(
    (candidate) => candidate.claim_id === objective.claim_id,
  );
  if (claim === undefined) {
    throw new Error(`Required objective ${objective.objective_id} references an unknown claim.`);
  }
  const expectedDirection = proofDirectionForObjective(objective);
  const rule = definition.proof_rules.find(
    (candidate) =>
      candidate.target_claim_id === claim.claim_id &&
      (expectedDirection === undefined || candidate.direction === expectedDirection) &&
      (candidate.guaranteed_evidence_sets?.length ?? 0) > 0,
  );
  if (rule === undefined) {
    throw new Error(`Required objective ${objective.objective_id} has no guaranteed ProofRule.`);
  }
  const evidenceIds = rule.guaranteed_evidence_sets?.find((set) =>
    set.every((evidenceId) =>
      definition.evidence.some((evidence) => evidence.evidence_id === evidenceId),
    ),
  );
  if (evidenceIds === undefined) {
    throw new Error(`ProofRule ${rule.rule_id} has no resolvable guaranteed evidence set.`);
  }
  const intent = rule.direction === 'SUPPORT' ? 'CONFIRM' : 'CONTRADICT';
  const card = CARD_CATALOG.cards.find((candidate) => {
    const minimum = candidate.target.min_evidence ?? 0;
    const maximum = candidate.target.max_evidence ?? Number.POSITIVE_INFINITY;
    return (
      candidate.legacy === true &&
      candidate.intent === intent &&
      candidate.target.kind === 'CLAIM' &&
      evidenceIds.length >= minimum &&
      evidenceIds.length <= maximum
    );
  });
  if (card === undefined) {
    throw new Error(`No real ${intent} card accepts ProofRule ${rule.rule_id}.`);
  }
  const committedMultiplier =
    claim.initial.commitment === 'COMMITTED' ? BALANCE.committedMultiplier : 1;
  return {
    objectiveId: objective.objective_id,
    claimId: claim.claim_id,
    proofRuleId: rule.rule_id,
    direction: rule.direction,
    cardId: card.card_id,
    facet: claim.facet,
    evidenceIds: [...evidenceIds],
    resultingEpistemic:
      rule.direction === 'SUPPORT' ? 'SUPPORTED' : 'REFUTED',
    composureDelta:
      rule.direction === 'CONTRADICT'
        ? -BALANCE.dmg.contradict * committedMultiplier
        : 0,
  };
}

function verificationProofPathForObjective(
  definition: CaseDefinition,
  encounter: EncounterDefinition,
  objective: ObjectiveDefinition,
): SimulationProofPath {
  const contradictionObjective =
    objective.type === 'REFUTE_CLAIM'
      ? objective
      : encounter.objectives.required.find(
          (candidate) => candidate.type === 'REFUTE_CLAIM',
        );
  if (contradictionObjective === undefined) {
    throw new Error(
      `Encounter ${encounter.encounter_id} needs a REFUTE_CLAIM audit path for ${objective.objective_id}.`,
    );
  }
  const path = proofPathForObjective(definition, contradictionObjective);
  return {
    ...path,
    objectiveId: objective.objective_id,
  };
}

function completionProofPathsForObjectives(
  definition: CaseDefinition,
  objectives: readonly ObjectiveDefinition[],
): readonly SimulationProofPath[] {
  return objectives.flatMap((objective) =>
    objective.type === 'CONFIRM_CLAIM' ||
    objective.type === 'REFUTE_CLAIM' ||
    objective.type === 'RESOLVE_CLAIM'
      ? [proofPathForObjective(definition, objective)]
      : [],
  );
}

function submissionAction(
  entryId: string,
  path: SimulationProofPath,
  sequence: number,
): SimulationAction {
  return {
    actionId: `best.${entryId}.${path.proofRuleId}.${sequence.toString()}`,
    kind: 'SUBMIT',
    objectiveId: path.objectiveId,
    claimId: path.claimId,
    proofRuleId: path.proofRuleId,
    cardId: path.cardId,
    tagId: path.facet,
    evidenceIds: [...path.evidenceIds],
    resultingEpistemic: path.resultingEpistemic,
    composureDelta: path.composureDelta,
  };
}

function bestPolicyActions(
  definition: CaseDefinition,
  encounter: EncounterDefinition,
  composureMax: number,
  sweetSpot: Readonly<{ min: number; max: number }>,
  proofPaths: readonly SimulationProofPath[],
): readonly SimulationAction[] {
  const entryId = `${definition.case_id}.${encounter.encounter_id}`;
  const actions: SimulationAction[] = [];
  let projectedComposure = composureMax;
  for (const path of proofPaths) {
    actions.push(submissionAction(entryId, path, actions.length + 1));
    projectedComposure = Math.max(0, projectedComposure + path.composureDelta);
  }

  const damagePath = proofPaths.find((path) => path.composureDelta < 0);
  while (projectedComposure > sweetSpot.max) {
    if (damagePath === undefined) {
      throw new Error(
        `Encounter ${encounter.encounter_id} has no real proof action that reaches its BEST window.`,
      );
    }
    const nextComposure = Math.max(
      0,
      projectedComposure + damagePath.composureDelta,
    );
    if (nextComposure < sweetSpot.min || nextComposure === projectedComposure) {
      throw new Error(
        `Encounter ${encounter.encounter_id} proof damage skips its BEST window.`,
      );
    }
    actions.push(submissionAction(entryId, damagePath, actions.length + 1));
    projectedComposure = nextComposure;
  }

  actions.push({
    actionId: `best.${entryId}.secure-statement`,
    kind: 'SECURE_STATEMENT',
  });
  if (actions.length > definition.metadata.estimated_turns) {
    throw new Error(`Encounter ${encounter.encounter_id} cannot reach BEST before its turn limit.`);
  }
  return actions;
}

function buildCatalogEntry(
  definition: CaseDefinition,
  encounter: EncounterDefinition,
): SimulationEncounterCatalogEntry {
  const archetype = encounterArchetype(definition, encounter);
  const resources = resolvedEncounterResources(BALANCE, encounter);
  const stateConditions = encounter.objectives.state_conditions;
  const objectives = {
    required: [...encounter.objectives.required],
    optional: [...encounter.objectives.optional],
    state_conditions: {
      composure_min: stateConditions.composure_min,
      composure_max: stateConditions.composure_max,
      ...(stateConditions.coercion_max === undefined
        ? {}
        : { coercion_max: stateConditions.coercion_max }),
    },
  };
  const completionProofPaths = completionProofPathsForObjectives(
    definition,
    objectives.required,
  );
  const proofPaths = objectives.required.map((objective) =>
    verificationProofPathForObjective(definition, encounter, objective),
  );
  const encounterClaimIds = uniqueStrings([
    ...encounter.rounds.flatMap((round) => round.statement_claims),
    ...objectives.required.flatMap((objective) =>
      objective.claim_id === undefined ? [] : [objective.claim_id],
    ),
    ...objectives.optional.flatMap((objective) =>
      objective.claim_id === undefined ? [] : [objective.claim_id],
    ),
  ]);
  const initialClaims = encounterClaimIds.map<SimulationClaimState>((claimId) => {
    const claim = definition.claims.find((candidate) => candidate.claim_id === claimId);
    if (claim === undefined) {
      throw new Error(`Encounter ${encounter.encounter_id} references unknown claim ${claimId}.`);
    }
    return {
      claimId,
      commitment: claim.initial.commitment,
      epistemic: 'UNKNOWN',
      presentation: claim.initial.presentation,
    };
  });
  const sweetSpot = {
    min: resources.composure_max * BALANCE.sweetSpot.min / 100,
    max: resources.composure_max * BALANCE.sweetSpot.max / 100,
    ...(objectives.state_conditions.coercion_max === undefined
      ? {}
      : { coercionMax: objectives.state_conditions.coercion_max }),
  };
  const entryId = `${definition.case_id}.${encounter.encounter_id}`;
  const bestActions = bestPolicyActions(
    definition,
    encounter,
    resources.composure_max,
    sweetSpot,
    proofPaths,
  );
  const partialActions = Array.from(
    { length: definition.metadata.estimated_turns },
    (_, index): SimulationAction => ({
      actionId: `partial.${entryId}.wait.${(index + 1).toString()}`,
      kind: 'WAIT',
    }),
  );

  return {
    archetype,
    caseId: definition.case_id,
    encounterId: encounter.encounter_id,
    targetEntityId: encounter.target_entity,
    composureMax: resources.composure_max,
    commandPointMax: resources.cp_max,
    commandPointsPerTurn: resources.cp_per_turn,
    coercionLimit: resources.coercion_limit,
    stressMax: BALANCE.stress.max,
    trustMax: BALANCE.trust.max,
    turnLimit: definition.metadata.estimated_turns,
    sweetSpot,
    objectives,
    initialClaims,
    completionProofPaths,
    proofPaths,
    guaranteedObjectiveIds: proofPaths.map((path) => path.objectiveId),
    alternatePath: uniqueStrings(
      proofPaths.flatMap((path) => path.evidenceIds),
    ),
    policies: {
      BEST_RESOLUTION: {
        policyId: `policy.${entryId}.real-data-best`,
        intendedOutcome: 'BEST_RESOLUTION',
        actions: bestActions,
      },
      COERCED_CONFESSION: {
        policyId: `policy.${entryId}.coerced`,
        intendedOutcome: 'COERCED_CONFESSION',
        actions: [
          {
            actionId: `coerced.${entryId}.force-confession`,
            kind: 'COERCE',
            composureDelta: -resources.composure_max,
          },
        ],
      },
      PARTIAL_RESOLUTION: {
        policyId: `policy.${entryId}.partial`,
        intendedOutcome: 'PARTIAL_RESOLUTION',
        actions: partialActions,
      },
    },
  };
}

const CATALOG_ENTRIES = CASE_DEFINITIONS.flatMap((definition) =>
  definition.encounters.map((encounter) =>
    buildCatalogEntry(definition, encounter),
  ),
);
if (CATALOG_ENTRIES.length === 0) {
  throw new Error('Real case catalog must define at least one encounter.');
}
const duplicateArchetype = CATALOG_ENTRIES.find(
  (entry, index, entries) =>
    entries.findIndex((candidate) => candidate.archetype === entry.archetype) !==
    index,
);
if (duplicateArchetype !== undefined) {
  throw new Error(
    `Real case catalog must map archetype ${duplicateArchetype.archetype} exactly once.`,
  );
}

/** Authored order, not a second simulator-owned archetype registry. */
export const SIMULATION_ARCHETYPES: readonly SimulationArchetype[] =
  Object.freeze(CATALOG_ENTRIES.map((entry) => entry.archetype));

export const SIMULATION_CATALOG = Object.freeze(
  Object.fromEntries(
    CATALOG_ENTRIES.map((entry) => [entry.archetype, entry]),
  ),
) as Readonly<Record<SimulationArchetype, SimulationEncounterCatalogEntry>>;

/** Checked access keeps the catalog open-ended without weakening strict indexing. */
export function getSimulationEncounter(
  archetype: SimulationArchetype,
): SimulationEncounterCatalogEntry {
  const entry = SIMULATION_CATALOG[archetype];
  if (entry === undefined) {
    throw new Error(`Unknown simulation archetype: ${archetype}.`);
  }
  return entry;
}

export const SIMULATION_ENCOUNTER_MAP = Object.freeze(
  Object.fromEntries(
    SIMULATION_ARCHETYPES.map((archetype) => {
      const entry = getSimulationEncounter(archetype);
      return [
        archetype,
        Object.freeze({ caseId: entry.caseId, encounterId: entry.encounterId }),
      ];
    }),
  ),
) as Readonly<
  Record<SimulationArchetype, Readonly<{ caseId: string; encounterId: string }>>
>;

export const ROUTE_MATRIX: readonly RouteMatrixCell[] =
  SIMULATION_ARCHETYPES.flatMap((archetype) => {
    const entry = getSimulationEncounter(archetype);
    return SIMULATION_OUTCOMES.map((intendedOutcome) => ({
      archetype,
      caseId: entry.caseId,
      encounterId: entry.encounterId,
      intendedOutcome,
    }));
  });

type SimulatorCardDefinition = (typeof CARD_CATALOG.cards)[number];
type SimulatorInquiryRoute = CaseDefinition['inquiry_routes'][number];

interface CoordinatorSubmissionPlan {
  readonly card: SimulatorCardDefinition;
  readonly path: SimulationProofPath;
  readonly request: SubmissionRequest;
  readonly route?: SimulatorInquiryRoute;
}

function authoredDefinition(
  encounter: SimulationEncounterCatalogEntry,
): Readonly<{
  definition: CaseDefinition;
  encounter: EncounterDefinition;
}> {
  const definition = CASE_DEFINITION_BY_ID.get(encounter.caseId);
  const authoredEncounter = definition?.encounters.find(
    (candidate) => candidate.encounter_id === encounter.encounterId,
  );
  if (definition === undefined || authoredEncounter === undefined) {
    throw new Error(
      `Missing authored definition for ${encounter.caseId}/${encounter.encounterId}.`,
    );
  }
  return { definition, encounter: authoredEncounter };
}

function incompleteProofPath(
  encounter: SimulationEncounterCatalogEntry,
  state: EncounterRuntimeState,
): SimulationProofPath {
  const incompleteObjectiveIds = new Set(
    state.objectives.required
      .filter((objective) => !objective.completed)
      .map((objective) => objective.objectiveId),
  );
  const path = encounter.completionProofPaths.find((candidate) =>
    incompleteObjectiveIds.has(candidate.objectiveId),
  ) ?? encounter.proofPaths.find((candidate) => candidate.composureDelta < 0);
  if (path === undefined) {
    throw new Error(`Encounter ${encounter.encounterId} has no coordinator proof path.`);
  }
  return path;
}

function cardCanBePlayed(
  card: SimulatorCardDefinition,
  state: EncounterRuntimeState,
): boolean {
  const turn = state.resources.turn;
  const cost = Math.max(
    0,
    (card.cost.cp ?? 0) + (state.actionCostDeltas[card.intent] ?? 0),
  );
  return (
    cost <= state.resources.commandPoints &&
    (state.cards[card.card_id]?.lockedUntilTurn ?? -1) < turn &&
    (state.actionLocks[card.intent] ?? -1) < turn
  );
}

function routeForCard(
  definition: CaseDefinition,
  state: EncounterRuntimeState,
  card: SimulatorCardDefinition,
): SimulatorInquiryRoute | undefined {
  return definition.inquiry_routes.find((route) => {
    if (!state.openRouteIds.includes(route.route_id)) return false;
    if (route.single_use && state.usedRouteIds.includes(route.route_id)) return false;
    if (!route.allowed_intents.includes(card.intent)) return false;
    const target = definition.claims.find(
      (claim) => claim.claim_id === route.target_slot,
    );
    return (
      target !== undefined &&
      (card.target.facets === undefined ||
        card.target.facets.includes(target.facet))
    );
  });
}

function submissionPlan(
  encounter: SimulationEncounterCatalogEntry,
  definition: CaseDefinition,
  state: EncounterRuntimeState,
  preferredPath?: SimulationProofPath,
): CoordinatorSubmissionPlan {
  const path = preferredPath ?? incompleteProofPath(encounter, state);
  const handCards = state.deck.hand.flatMap((cardId) => {
    const card = CARD_CATALOG.cards.find((candidate) => candidate.card_id === cardId);
    return card === undefined || !cardCanBePlayed(card, state) ? [] : [card];
  });
  const proofCard = handCards.find((card) => card.card_id === path.cardId);
  if (proofCard !== undefined) {
    return {
      card: proofCard,
      path,
      request: {
        cardId: proofCard.card_id,
        targetClaimId: path.claimId,
        evidenceIds: [...path.evidenceIds],
      },
    };
  }

  const routeCard = handCards.find(
    (card) => routeForCard(definition, state, card) !== undefined,
  );
  const card = routeCard ?? handCards[0];
  if (card === undefined) {
    throw new Error(
      `Encounter ${encounter.encounterId} has no playable card on turn ${state.resources.turn.toString()}.`,
    );
  }
  const route = routeForCard(definition, state, card);
  if (route !== undefined) {
    return {
      card,
      path,
      route,
      request: {
        cardId: card.card_id,
        targetClaimId: route.target_slot,
        routeId: route.route_id,
        evidenceIds: [],
      },
    };
  }
  if (card.target.kind === 'CLAIM') {
    return {
      card,
      path,
      request: {
        cardId: card.card_id,
        targetClaimId: path.claimId,
        evidenceIds:
          card.intent === 'CONFIRM' || card.intent === 'CONTRADICT'
            ? [...path.evidenceIds]
            : [],
      },
    };
  }
  return {
    card,
    path,
    request: {
      cardId: card.card_id,
      evidenceIds:
        card.target.kind === 'EVIDENCE' ? [path.evidenceIds[0] as string] : [],
    },
  };
}

function modifierActivationCount(state: EncounterRuntimeState): number {
  return Object.values(state.modifierActivations).reduce(
    (total, activations) => total + activations,
    0,
  );
}

function resourceLimits(
  encounter: SimulationEncounterCatalogEntry,
): EncounterResourceLimits {
  return {
    composureMax: encounter.composureMax,
    commandPointMax: encounter.commandPointMax,
    commandPointsPerTurn: encounter.commandPointsPerTurn,
    coercionLimit: encounter.coercionLimit,
    stressMax: encounter.stressMax,
    trustMax: encounter.trustMax,
  };
}

function completedObjectiveIds(
  summary: ObjectiveEvaluationSummary,
): readonly string[] {
  return summary.required
    .filter((objective) => objective.completed)
    .map((objective) => objective.objectiveId);
}

function applyActionToClaims(
  claims: readonly SimulationClaimState[],
  action: SimulationAction,
): readonly SimulationClaimState[] {
  if (action.kind !== 'SUBMIT') return claims;
  return claims.map((claim) =>
    claim.claimId === action.claimId
      ? { ...claim, epistemic: action.resultingEpistemic }
      : claim,
  );
}

function actionResourceDelta(action: SimulationAction): number {
  return action.kind === 'SUBMIT' || action.kind === 'COERCE'
    ? action.composureDelta
    : 0;
}

function initialSummary(
  encounter: SimulationEncounterCatalogEntry,
  claims: readonly SimulationClaimState[],
  resources: EncounterResourceState,
): ObjectiveEvaluationSummary {
  return evaluateObjectives(encounter.objectives, {
    claims,
    evidence: [],
    resources,
    damagedEntityIds: [],
    encounterFinished: false,
    encounterFailed: false,
  });
}

function unfinishedResult(
  encounter: SimulationEncounterCatalogEntry,
  policy: SimulationPolicy,
  reason: Exclude<SimulationTerminationReason, 'TERMINAL_OUTCOME'>,
  log: readonly SimulationStepLog[],
  summary: ObjectiveEvaluationSummary,
  maxSteps: number,
  bestUnlockObserved: boolean,
  seed: number,
): RouteSimulationResult {
  const judgmentLogBytes = serializeSimulationLog(
    encounter,
    policy.intendedOutcome,
    seed,
    log,
  );
  return {
    archetype: encounter.archetype,
    caseId: encounter.caseId,
    encounterId: encounter.encounterId,
    intendedOutcome: policy.intendedOutcome,
    policyId: policy.policyId,
    seed,
    inputSequence: policy.actions,
    outcome: null,
    terminated: false,
    terminationReason: reason,
    steps: log.length,
    maxSteps,
    completedObjectiveIds: completedObjectiveIds(summary),
    allRequiredObjectivesCompleted: summary.allRequiredCompleted,
    bestUnlockObserved,
    explicitBestConfirmation: false,
    execution: 'OUTCOME_EVALUATOR',
    routeIdsUsed: [],
    modifierActivationCount: 0,
    coordinatorJudgmentLogBytes: null,
    judgmentLog: log,
    judgmentLogBytes,
  };
}

function serializeSimulationLog(
  encounter: SimulationEncounterCatalogEntry,
  intendedOutcome: SimulationOutcome,
  seed: number,
  log: readonly SimulationStepLog[],
): string {
  return canonicalStringify({
    archetype: encounter.archetype,
    caseId: encounter.caseId,
    encounterId: encounter.encounterId,
    intendedOutcome,
    seed,
    entries: log,
  });
}

function coordinatorStep(
  action: SimulationAction,
  state: EncounterRuntimeState,
  outcome: ReturnType<EncounterCoordinator['endTurn']>,
  step: number,
  details: Readonly<{
    cardId?: string;
    routeId?: string;
    resolutionCode?: string;
    secureStatementRequested?: boolean;
  }> = {},
): SimulationStepLog {
  return {
    step,
    turn: state.resources.turn,
    actionId: action.actionId,
    actionKind: action.kind,
    composure: state.resources.composure,
    coercion: state.resources.coercion,
    completedObjectiveIds: completedObjectiveIds(state.objectives),
    terminalOutcome: outcome.terminalOutcome,
    bestConditionsMet: outcome.bestResolution.conditionsMet,
    secureStatementEnabled: outcome.bestResolution.secureStatementEnabled,
    secureStatementRequested: details.secureStatementRequested ?? false,
    ...(details.cardId === undefined ? {} : { cardId: details.cardId }),
    ...(details.routeId === undefined ? {} : { routeId: details.routeId }),
    ...(details.resolutionCode === undefined
      ? {}
      : { resolutionCode: details.resolutionCode }),
    commandPoints: state.resources.commandPoints,
    handCardIds: [...state.deck.hand],
    modifierActivationCount: modifierActivationCount(state),
  };
}

function coordinatorRouteResult(
  encounter: SimulationEncounterCatalogEntry,
  policy: SimulationPolicy,
  seed: number,
  coordinator: EncounterCoordinator,
  inputSequence: readonly SimulationAction[],
  log: readonly SimulationStepLog[],
  maxSteps: number,
  outcome: EncounterOutcome | null,
  bestUnlockObserved: boolean,
  explicitBestConfirmation: boolean,
): RouteSimulationResult {
  const state = coordinator.snapshot;
  const coordinatorJudgmentLogBytes = serializeJudgmentLog(state.log);
  return {
    archetype: encounter.archetype,
    caseId: encounter.caseId,
    encounterId: encounter.encounterId,
    intendedOutcome: policy.intendedOutcome,
    policyId: policy.policyId,
    seed,
    inputSequence,
    outcome,
    terminated: outcome !== null,
    terminationReason:
      outcome === null ? 'STEP_LIMIT_REACHED' : 'TERMINAL_OUTCOME',
    steps: log.length,
    maxSteps,
    completedObjectiveIds: completedObjectiveIds(state.objectives),
    allRequiredObjectivesCompleted: state.objectives.allRequiredCompleted,
    bestUnlockObserved,
    explicitBestConfirmation,
    execution: 'ENCOUNTER_COORDINATOR',
    routeIdsUsed: [...state.usedRouteIds],
    modifierActivationCount: modifierActivationCount(state),
    coordinatorJudgmentLogBytes,
    judgmentLog: log,
    judgmentLogBytes: canonicalStringify({
      archetype: encounter.archetype,
      caseId: encounter.caseId,
      encounterId: encounter.encounterId,
      intendedOutcome: policy.intendedOutcome,
      seed,
      coordinatorEntries: state.log,
      entries: log,
    }),
  };
}

function coordinatorSubmitAction(
  encounter: SimulationEncounterCatalogEntry,
  plan: CoordinatorSubmissionPlan,
  resolutionCode: string,
  composureDelta: number,
  sequence: number,
): SimulationAction {
  return {
    actionId: `best.${encounter.caseId}.${encounter.encounterId}.turn-${sequence.toString()}.${plan.card.card_id}`,
    kind: 'SUBMIT',
    objectiveId: plan.path.objectiveId,
    claimId: plan.request.targetClaimId ?? plan.path.claimId,
    proofRuleId: plan.path.proofRuleId,
    cardId: plan.card.card_id,
    tagId: plan.path.facet,
    ...(plan.route === undefined ? {} : { routeId: plan.route.route_id }),
    resolutionCode,
    evidenceIds: [...plan.request.evidenceIds],
    resultingEpistemic: plan.path.resultingEpistemic,
    composureDelta,
  };
}

function simulateBestWithCoordinator(
  encounter: SimulationEncounterCatalogEntry,
  seed: number,
): RouteSimulationResult {
  const policy = encounter.policies.BEST_RESOLUTION;
  const authored = authoredDefinition(encounter);
  const coordinator = EncounterCoordinator.begin({
    caseDefinition: authored.definition,
    encounterId: authored.encounter.encounter_id,
    cards: CARD_CATALOG.cards,
    balance: BALANCE,
    rng: createRngState(seed, 'DECK_SHUFFLE'),
    ...(CARD_CATALOG.initial_deck === undefined
      ? {}
      : { initialDeckCardIds: CARD_CATALOG.initial_deck }),
  });
  const maxSteps = encounter.turnLimit * 2 + 1;
  const inputSequence: SimulationAction[] = [];
  const log: SimulationStepLog[] = [];
  let bestUnlockObserved = false;

  while (inputSequence.length < maxSteps) {
    if (coordinator.snapshot.machine.state !== 'FREE_REVIEW') {
      throw new Error(
        `Encounter ${encounter.encounterId} expected FREE_REVIEW before a coordinator turn.`,
      );
    }
    coordinator.review();
    const verifiedObjectiveIds = new Set(
      inputSequence.flatMap((action) =>
        action.kind === 'SUBMIT' &&
        action.resolutionCode === 'R_DIRECT_CONTRADICTION'
          ? [action.objectiveId]
          : [],
      ),
    );
    const verificationPath = encounter.proofPaths.find(
      (path) => !verifiedObjectiveIds.has(path.objectiveId),
    );
    const plan = submissionPlan(
      encounter,
      authored.definition,
      coordinator.snapshot,
      verificationPath,
    );
    coordinator.beginArgument();
    const submission = coordinator.submit(plan.request);
    const submitAction = coordinatorSubmitAction(
      encounter,
      plan,
      submission.resolution.code,
      submission.resolution.effects.composureDelta,
      coordinator.snapshot.resources.turn,
    );
    inputSequence.push(submitAction);
    bestUnlockObserved ||=
      submission.outcome.bestResolution.secureStatementEnabled;
    log.push(
      coordinatorStep(
        submitAction,
        coordinator.snapshot,
        submission.outcome,
        log.length + 1,
        {
          cardId: plan.card.card_id,
          ...(plan.route === undefined ? {} : { routeId: plan.route.route_id }),
          resolutionCode: submission.resolution.code,
        },
      ),
    );

    if (submission.outcome.terminalOutcome !== null) {
      return coordinatorRouteResult(
        encounter,
        policy,
        seed,
        coordinator,
        inputSequence,
        log,
        maxSteps,
        submission.outcome.terminalOutcome,
        bestUnlockObserved,
        false,
      );
    }
    const allVerificationPathsObserved = encounter.proofPaths.every(
      (path) =>
        verifiedObjectiveIds.has(path.objectiveId) ||
        (submitAction.kind === 'SUBMIT' &&
          submitAction.resolutionCode === 'R_DIRECT_CONTRADICTION' &&
          submitAction.objectiveId === path.objectiveId),
    );
    if (
      submission.outcome.bestResolution.secureStatementEnabled &&
      allVerificationPathsObserved
    ) {
      const action: SimulationAction = {
        actionId: `best.${encounter.caseId}.${encounter.encounterId}.secure-statement`,
        kind: 'SECURE_STATEMENT',
      };
      const outcome = coordinator.secureStatement();
      inputSequence.push(action);
      log.push(
        coordinatorStep(
          action,
          coordinator.snapshot,
          outcome,
          log.length + 1,
          { secureStatementRequested: true },
        ),
      );
      return coordinatorRouteResult(
        encounter,
        policy,
        seed,
        coordinator,
        inputSequence,
        log,
        maxSteps,
        outcome.terminalOutcome,
        bestUnlockObserved,
        outcome.terminalOutcome === 'BEST_RESOLUTION',
      );
    }

    if (coordinator.snapshot.machine.state === 'FREE_REVIEW') continue;
    if (coordinator.snapshot.machine.state !== 'CHECK_OUTCOME') {
      throw new Error(
        `Encounter ${encounter.encounterId} cannot advance from ${String(coordinator.snapshot.machine.state)}.`,
      );
    }
    const action: SimulationAction = {
      actionId: `best.${encounter.caseId}.${encounter.encounterId}.turn-${coordinator.snapshot.resources.turn.toString()}.end`,
      kind: 'END_TURN',
    };
    const outcome = coordinator.endTurn();
    inputSequence.push(action);
    log.push(
      coordinatorStep(
        action,
        coordinator.snapshot,
        outcome,
        log.length + 1,
      ),
    );
    if (outcome.terminalOutcome !== null) {
      return coordinatorRouteResult(
        encounter,
        policy,
        seed,
        coordinator,
        inputSequence,
        log,
        maxSteps,
        outcome.terminalOutcome,
        bestUnlockObserved,
        false,
      );
    }
  }

  return coordinatorRouteResult(
    encounter,
    policy,
    seed,
    coordinator,
    inputSequence,
    log,
    maxSteps,
    null,
    bestUnlockObserved,
    false,
  );
}

/** Pure deterministic headless execution of one catalog policy. */
export function simulateRoute(
  archetype: SimulationArchetype,
  intendedOutcome: SimulationOutcome,
  options: SimulationRunOptions = {},
): RouteSimulationResult {
  const encounter = getSimulationEncounter(archetype);
  const policy = encounter.policies[intendedOutcome];
  const limits = resourceLimits(encounter);
  const maxSteps = encounter.turnLimit * 2 + 1;
  const seed = options.seed ?? 0;
  if (!Number.isSafeInteger(seed) || seed < 0) {
    throw new Error('Simulation seed must be a non-negative safe integer.');
  }
  if (intendedOutcome === 'BEST_RESOLUTION') {
    return simulateBestWithCoordinator(encounter, seed);
  }
  let resources = createResourceState(limits, { dp: BALANCE.dp.initial });
  let claims: readonly SimulationClaimState[] = encounter.initialClaims.map(
    (claim) => ({ ...claim }),
  );
  let summary = initialSummary(encounter, claims, resources);
  const log: SimulationStepLog[] = [];
  let bestUnlockObserved = false;

  for (const [index, action] of policy.actions.entries()) {
    if (index >= maxSteps) {
      return unfinishedResult(
        encounter,
        policy,
        'STEP_LIMIT_REACHED',
        log,
        summary,
        maxSteps,
        bestUnlockObserved,
        seed,
      );
    }

    resources = beginEncounterTurn(resources, limits);
    resources = applyResourceDelta(
      resources,
      { composure: actionResourceDelta(action) },
      limits,
    );
    claims = applyActionToClaims(claims, action);
    summary = initialSummary(encounter, claims, resources);
    const guaranteedObjectiveIds = new Set(encounter.guaranteedObjectiveIds);
    const hasSolvablePath = hasSolvableRequiredObjectivePath(
      summary.required,
      (objective) => guaranteedObjectiveIds.has(objective.objective_id),
    );
    const secureStatementRequested = action.kind === 'SECURE_STATEMENT';
    const evaluation = evaluateOutcome({
      resources,
      objectives: summary,
      coercionLimit: encounter.coercionLimit,
      turnLimit: encounter.turnLimit,
      hasSolvablePath,
      bestConditions: {
        composureMin: encounter.sweetSpot.min,
        composureMax: encounter.sweetSpot.max,
        ...(encounter.sweetSpot.coercionMax === undefined
          ? {}
          : { coercionMax: encounter.sweetSpot.coercionMax }),
      },
      secureStatementRequested,
    });
    bestUnlockObserved ||=
      evaluation.bestResolution.secureStatementEnabled;
    log.push({
      step: index + 1,
      turn: resources.turn,
      actionId: action.actionId,
      actionKind: action.kind,
      composure: resources.composure,
      coercion: resources.coercion,
      completedObjectiveIds: completedObjectiveIds(summary),
      terminalOutcome: evaluation.terminalOutcome,
      bestConditionsMet: evaluation.bestResolution.conditionsMet,
      secureStatementEnabled:
        evaluation.bestResolution.secureStatementEnabled,
      secureStatementRequested,
    });

    if (evaluation.terminalOutcome !== null) {
      return {
        archetype,
        caseId: encounter.caseId,
        encounterId: encounter.encounterId,
        intendedOutcome,
        policyId: policy.policyId,
        seed,
        inputSequence: policy.actions,
        outcome: evaluation.terminalOutcome,
        terminated: true,
        terminationReason: 'TERMINAL_OUTCOME',
        steps: log.length,
        maxSteps,
        completedObjectiveIds: completedObjectiveIds(summary),
        allRequiredObjectivesCompleted: summary.allRequiredCompleted,
        bestUnlockObserved,
        explicitBestConfirmation:
          evaluation.terminalOutcome === 'BEST_RESOLUTION' &&
          secureStatementRequested,
        execution: 'OUTCOME_EVALUATOR',
        routeIdsUsed: [],
        modifierActivationCount: 0,
        coordinatorJudgmentLogBytes: null,
        judgmentLog: log,
        judgmentLogBytes: serializeSimulationLog(
          encounter,
          intendedOutcome,
          seed,
          log,
        ),
      };
    }
  }

  return unfinishedResult(
    encounter,
    policy,
    policy.actions.length >= maxSteps
      ? 'STEP_LIMIT_REACHED'
      : 'POLICY_EXHAUSTED',
    log,
    summary,
    maxSteps,
    bestUnlockObserved,
    seed,
  );
}

export function simulateRouteMatrix(
  options: SimulationRunOptions = {},
): readonly RouteSimulationResult[] {
  return ROUTE_MATRIX.map((cell) =>
    simulateRoute(cell.archetype, cell.intendedOutcome, options),
  );
}

export function simulateBestRoute(
  archetype: SimulationArchetype,
  options: SimulationRunOptions = {},
): RouteSimulationResult {
  return simulateRoute(archetype, 'BEST_RESOLUTION', options);
}
