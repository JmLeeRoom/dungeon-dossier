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
  applyResourceDelta,
  beginEncounterTurn,
  createResourceState,
  type EncounterResourceLimits,
  type EncounterResourceState,
} from '../../src/engine/encounter/ResourceSystem';
import type {
  CommitmentState,
  EpistemicState,
  PresentationState,
} from '../../src/engine/knowledge';
import { canonicalStringify } from '../../src/engine/log/canonicalStringify';

export const SIMULATION_ARCHETYPES = [
  'SLIME',
  'HARPY',
  'MINOTAUR',
  'GOBLIN',
  'ORC',
  'SUCCUBUS',
  'DWARF',
  'CYCLOPS',
  'FALLEN_HERO',
] as const;
export type SimulationArchetype = (typeof SIMULATION_ARCHETYPES)[number];

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
      cardId: string;
      tagId: string;
      evidenceIds: readonly string[];
      composureDelta: number;
    }>
  | Readonly<{
      actionId: string;
      kind: 'SECURE_STATEMENT';
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

export interface SimulationEncounterCatalogEntry {
  readonly archetype: SimulationArchetype;
  readonly composureMax: number;
  readonly coercionLimit: number;
  readonly turnLimit: number;
  readonly sweetSpot: Readonly<{ min: number; max: number }>;
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
  readonly guaranteedObjectiveIds: readonly string[];
  readonly alternatePath: readonly string[];
  readonly policies: Readonly<Record<SimulationOutcome, SimulationPolicy>>;
}

export interface RouteMatrixCell {
  readonly archetype: SimulationArchetype;
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
}

export interface RouteSimulationResult {
  readonly archetype: SimulationArchetype;
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
  readonly judgmentLog: readonly SimulationStepLog[];
  /** Canonical, timing-free serialization used by deterministic replay tests. */
  readonly judgmentLogBytes: string;
}

export interface SimulationRunOptions {
  readonly seed?: number;
}

interface SimulationEncounterSpec {
  readonly archetype: SimulationArchetype;
  readonly composureMax: number;
  readonly turnLimit: number;
  readonly coercionLimit: number;
  readonly alternatePath: readonly string[];
}

/**
 * Synthetic route sheets used only by the simulator while production content
 * has fewer than nine complete encounters. No engine module imports these IDs.
 */
const ENCOUNTER_SPECS: readonly SimulationEncounterSpec[] = [
  {
    archetype: 'SLIME',
    composureMax: 60,
    turnLimit: 5,
    coercionLimit: 100,
    alternatePath: ['unlock-silence', 'submit-access-log'],
  },
  {
    archetype: 'HARPY',
    composureMax: 70,
    turnLimit: 6,
    coercionLimit: 100,
    alternatePath: ['clear-invoice-qte', 'submit-flight-ledger'],
  },
  {
    archetype: 'MINOTAUR',
    composureMax: 120,
    turnLimit: 7,
    coercionLimit: 100,
    alternatePath: ['trace-labyrinth-route', 'cross-check-gate-log', 'submit-alibi-gap'],
  },
  {
    archetype: 'GOBLIN',
    composureMax: 90,
    turnLimit: 6,
    coercionLimit: 100,
    alternatePath: ['identify-reflection', 'submit-original-copy'],
  },
  {
    archetype: 'ORC',
    composureMax: 100,
    turnLimit: 7,
    coercionLimit: 100,
    alternatePath: ['preserve-duplicate', 'submit-independent-copy', 'cross-check-source'],
  },
  {
    archetype: 'SUCCUBUS',
    composureMax: 140,
    turnLimit: 8,
    coercionLimit: 100,
    alternatePath: ['release-card-lock', 'submit-unsealed-record', 'confirm-motive'],
  },
  {
    archetype: 'DWARF',
    composureMax: 110,
    turnLimit: 7,
    coercionLimit: 100,
    alternatePath: ['audit-forge-ledger', 'compare-material-sample'],
  },
  {
    archetype: 'CYCLOPS',
    composureMax: 120,
    turnLimit: 8,
    coercionLimit: 100,
    alternatePath: ['restore-witness-protection', 'recover-audio-cache', 'submit-timeline'],
  },
  {
    archetype: 'FALLEN_HERO',
    composureMax: 180,
    turnLimit: 9,
    coercionLimit: 40,
    alternatePath: [
      'clear-attorney-seal',
      'combine-remote-header',
      'combine-witness-statement',
      'submit-final-contradiction',
    ],
  },
];

function toSlug(archetype: SimulationArchetype): string {
  return archetype.toLowerCase().replaceAll('_', '-');
}

function buildCatalogEntry(
  spec: SimulationEncounterSpec,
): SimulationEncounterCatalogEntry {
  const slug = toSlug(spec.archetype);
  const sweetSpot = {
    min: Math.max(1, Math.ceil(spec.composureMax * 0.01)),
    max: Math.floor(spec.composureMax * 0.3),
  };
  const targetComposure = Math.floor((sweetSpot.min + sweetSpot.max) / 2);
  const objectiveIds = spec.alternatePath.map(
    (_, index) => `sim.${slug}.objective.${(index + 1).toString()}`,
  );
  const claimIds = spec.alternatePath.map(
    (_, index) => `sim.${slug}.claim.${(index + 1).toString()}`,
  );
  const required = objectiveIds.map<ObjectiveDefinition>((objectiveId, index) => ({
    objective_id: objectiveId,
    type: 'RESOLVE_CLAIM',
    claim_id: claimIds[index]!,
  }));
  const initialClaims = claimIds.map<SimulationClaimState>((claimId) => ({
    claimId,
    commitment: 'ASSERTED',
    epistemic: 'UNKNOWN',
    presentation: 'NORMAL',
  }));
  const bestActions = spec.alternatePath.map<SimulationAction>(
    (actionName, index) => ({
      actionId: `best.${slug}.${actionName}`,
      kind: 'SUBMIT',
      objectiveId: objectiveIds[index]!,
      cardId: `sim.${slug}.card.cross-check`,
      tagId: `sim.${slug}.tag.${(index + 1).toString()}`,
      evidenceIds: [`sim.${slug}.evidence.${(index + 1).toString()}`],
      composureDelta:
        index === spec.alternatePath.length - 1
          ? targetComposure - spec.composureMax
          : 0,
    }),
  );
  bestActions.push({
    actionId: `best.${slug}.secure-statement`,
    kind: 'SECURE_STATEMENT',
  });
  const partialActions = Array.from(
    { length: spec.turnLimit },
    (_, index): SimulationAction => ({
      actionId: `partial.${slug}.wait.${(index + 1).toString()}`,
      kind: 'WAIT',
    }),
  );

  return {
    archetype: spec.archetype,
    composureMax: spec.composureMax,
    coercionLimit: spec.coercionLimit,
    turnLimit: spec.turnLimit,
    sweetSpot,
    objectives: {
      required,
      optional: [],
      state_conditions: {
        composure_min: sweetSpot.min,
        composure_max: sweetSpot.max,
        coercion_max: spec.coercionLimit,
      },
    },
    initialClaims,
    guaranteedObjectiveIds: objectiveIds,
    alternatePath: spec.alternatePath,
    policies: {
      BEST_RESOLUTION: {
        policyId: `policy.${slug}.shortest-best`,
        intendedOutcome: 'BEST_RESOLUTION',
        actions: bestActions,
      },
      COERCED_CONFESSION: {
        policyId: `policy.${slug}.coerced`,
        intendedOutcome: 'COERCED_CONFESSION',
        actions: [
          {
            actionId: `coerced.${slug}.force-confession`,
            kind: 'COERCE',
            composureDelta: -spec.composureMax,
          },
        ],
      },
      PARTIAL_RESOLUTION: {
        policyId: `policy.${slug}.partial`,
        intendedOutcome: 'PARTIAL_RESOLUTION',
        actions: partialActions,
      },
    },
  };
}

export const SIMULATION_CATALOG = Object.fromEntries(
  ENCOUNTER_SPECS.map((spec) => [spec.archetype, buildCatalogEntry(spec)]),
) as Readonly<
  Record<SimulationArchetype, SimulationEncounterCatalogEntry>
>;

export const ROUTE_MATRIX: readonly RouteMatrixCell[] =
  SIMULATION_ARCHETYPES.flatMap((archetype) =>
    SIMULATION_OUTCOMES.map((intendedOutcome) => ({
      archetype,
      intendedOutcome,
    })),
  );

function resourceLimits(
  encounter: SimulationEncounterCatalogEntry,
): EncounterResourceLimits {
  return {
    composureMax: encounter.composureMax,
    commandPointMax: 3,
    commandPointsPerTurn: 3,
    coercionLimit: encounter.coercionLimit,
    stressMax: 100,
    trustMax: 3,
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
  encounter: SimulationEncounterCatalogEntry,
): readonly SimulationClaimState[] {
  if (action.kind !== 'SUBMIT') return claims;
  const objective = encounter.objectives.required.find(
    (candidate) => candidate.objective_id === action.objectiveId,
  );
  if (objective?.claim_id === undefined) return claims;

  return claims.map((claim) =>
    claim.claimId === objective.claim_id
      ? { ...claim, epistemic: 'REFUTED' }
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
    encounter.archetype,
    policy.intendedOutcome,
    seed,
    log,
  );
  return {
    archetype: encounter.archetype,
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
    judgmentLog: log,
    judgmentLogBytes,
  };
}

function serializeSimulationLog(
  archetype: SimulationArchetype,
  intendedOutcome: SimulationOutcome,
  seed: number,
  log: readonly SimulationStepLog[],
): string {
  return canonicalStringify({ archetype, intendedOutcome, seed, entries: log });
}

/** Pure deterministic headless execution of one catalog policy. */
export function simulateRoute(
  archetype: SimulationArchetype,
  intendedOutcome: SimulationOutcome,
  options: SimulationRunOptions = {},
): RouteSimulationResult {
  const encounter = SIMULATION_CATALOG[archetype];
  const policy = encounter.policies[intendedOutcome];
  const limits = resourceLimits(encounter);
  const maxSteps = encounter.turnLimit + 2;
  const seed = options.seed ?? 0;
  if (!Number.isSafeInteger(seed) || seed < 0) {
    throw new Error('Simulation seed must be a non-negative safe integer.');
  }
  let resources = createResourceState(limits);
  let claims: readonly SimulationClaimState[] = encounter.initialClaims.map(
    (claim) => ({ ...claim }),
  );
  let summary = initialSummary(encounter, claims, resources);
  const log: SimulationStepLog[] = [];
  let bestUnlockObserved = false;
  let witnessProtectionRestored = encounter.archetype !== 'CYCLOPS';

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

    witnessProtectionRestored ||=
      action.actionId.includes('restore-witness-protection');
    resources = beginEncounterTurn(resources, limits, {
      encounterArchetype: encounter.archetype,
      witnessProtectionRestored,
    });
    resources = applyResourceDelta(
      resources,
      { composure: actionResourceDelta(action) },
      limits,
    );
    claims = applyActionToClaims(claims, action, encounter);
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
        coercionMax: encounter.coercionLimit,
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
        judgmentLog: log,
        judgmentLogBytes: serializeSimulationLog(
          archetype,
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
