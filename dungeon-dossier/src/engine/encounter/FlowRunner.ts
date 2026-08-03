import type {
  CommitmentState,
  Condition,
  ContentId,
  EncounterDefinition,
  EpistemicState,
  PresentationState,
} from '../domain';

export type FlowNode = EncounterDefinition['flow_nodes'][number];

export const FLOW_ENTER_CONDITION_TYPES = [
  'ALWAYS',
  'CLAIM_VISIBLE',
  'CLAIM_COMMITMENT',
  'CLAIM_EPISTEMIC',
  'ROUTE_USED',
  'OBJECTIVE_DONE',
  'ALL_REQUIRED_OBJECTIVES',
  'SOME_REQUIRED_OBJECTIVES',
  'ALL_OF',
  'ANY_OF',
  'NOT',
] as const;

export type FlowEnterConditionType =
  (typeof FLOW_ENTER_CONDITION_TYPES)[number];

export interface FlowClaimState {
  readonly commitment: CommitmentState;
  readonly epistemic: EpistemicState;
  readonly presentation: PresentationState;
}

/**
 * The flow layer deliberately has no TruthGraph, statement-history, or
 * resolution fields. Generic callers may carry those fields alongside this
 * shape; object spreads preserve their references without granting flow code
 * an API with which to modify them.
 */
export interface FlowRuntimeState {
  readonly currentNodeId?: ContentId;
  readonly enteredNodeIds: readonly ContentId[];
  readonly claims: Readonly<Record<string, FlowClaimState>>;
  readonly revealedClaimIds: readonly ContentId[];
  readonly openRouteIds: readonly ContentId[];
  readonly usedRouteIds?: readonly ContentId[];
  readonly activeModifierIds: readonly ContentId[];
  readonly completedObjectiveIds?: readonly ContentId[];
  readonly requiredObjectiveIds?: readonly ContentId[];
  readonly resources: Readonly<Record<string, number>>;
  readonly reactionKey?: string;
  readonly terminal: boolean;
}

export interface FlowTransitionResult<TState extends FlowRuntimeState> {
  readonly transitioned: boolean;
  readonly node?: FlowNode;
  readonly state: TState;
}

function includesId(values: readonly ContentId[] | undefined, id: ContentId): boolean {
  return values?.includes(id) ?? false;
}

function requiredString(
  condition: Condition,
  field: 'claim_id' | 'route_id' | 'objective_id',
): ContentId {
  const value = condition[field];
  if (value === undefined) {
    throw new Error(`Flow condition ${condition.type} requires ${field}.`);
  }
  return value;
}

function nestedConditions(condition: Condition): readonly Condition[] {
  if (condition.conditions === undefined) {
    throw new Error(`Flow condition ${condition.type} requires conditions.`);
  }
  return condition.conditions as unknown as readonly Condition[];
}

function nestedCondition(condition: Condition): Condition {
  if (condition.condition === undefined) {
    throw new Error('Flow condition NOT requires condition.');
  }
  return condition.condition as unknown as Condition;
}

function conditionState<T extends string>(
  condition: Condition,
  explicit: T | undefined,
): T {
  const value = explicit ?? (condition.state as T | undefined);
  if (value === undefined) {
    throw new Error(`Flow condition ${condition.type} requires state.`);
  }
  return value;
}

/** Evaluates only progress-based FlowNode conditions; resource gates are rejected. */
export function evaluateFlowCondition(
  condition: Condition,
  state: FlowRuntimeState,
): boolean {
  switch (condition.type) {
    case 'ALWAYS':
      return true;
    case 'CLAIM_VISIBLE': {
      const claimId = requiredString(condition, 'claim_id');
      return includesId(state.revealedClaimIds, claimId);
    }
    case 'CLAIM_COMMITMENT': {
      const claimId = requiredString(condition, 'claim_id');
      return (
        state.claims[claimId]?.commitment ===
        conditionState(condition, condition.commitment)
      );
    }
    case 'CLAIM_EPISTEMIC': {
      const claimId = requiredString(condition, 'claim_id');
      return (
        state.claims[claimId]?.epistemic ===
        conditionState(condition, condition.epistemic)
      );
    }
    case 'ROUTE_USED':
      return includesId(
        state.usedRouteIds,
        requiredString(condition, 'route_id'),
      );
    case 'OBJECTIVE_DONE':
      return includesId(
        state.completedObjectiveIds,
        requiredString(condition, 'objective_id'),
      );
    case 'ALL_REQUIRED_OBJECTIVES':
      return (state.requiredObjectiveIds ?? []).every((objectiveId) =>
        includesId(state.completedObjectiveIds, objectiveId),
      );
    case 'SOME_REQUIRED_OBJECTIVES':
      return (state.requiredObjectiveIds ?? []).some((objectiveId) =>
        includesId(state.completedObjectiveIds, objectiveId),
      );
    case 'ALL_OF':
      return nestedConditions(condition).every((nested) =>
        evaluateFlowCondition(nested, state),
      );
    case 'ANY_OF':
      return nestedConditions(condition).some((nested) =>
        evaluateFlowCondition(nested, state),
      );
    case 'NOT':
      return !evaluateFlowCondition(nestedCondition(condition), state);
    default:
      throw new Error(
        `Invalid FlowNode enter condition ${condition.type}: flow transitions cannot use resource, composure, turn, phase, outcome, or solvability gates.`,
      );
  }
}

export function canEnterFlowNode(
  node: FlowNode,
  state: FlowRuntimeState,
): boolean {
  return (
    !state.enteredNodeIds.includes(node.node_id) &&
    node.enter_conditions.every((condition) =>
      evaluateFlowCondition(condition, state),
    )
  );
}

function appendUnique(
  current: readonly ContentId[],
  additions: readonly ContentId[],
): readonly ContentId[] {
  const result = [...current];
  for (const id of additions) {
    if (!result.includes(id)) result.push(id);
  }
  return result;
}

/** Applies one node atomically. The same node can never be entered twice. */
export function enterFlowNode<TState extends FlowRuntimeState>(
  node: FlowNode,
  state: TState,
): TState {
  if (state.enteredNodeIds.includes(node.node_id)) {
    throw new Error(`FlowNode ${node.node_id} has already been entered.`);
  }

  const claims: Record<string, FlowClaimState> = { ...state.claims };
  for (const claimId of node.revise_claim_ids) {
    const previous = claims[claimId];
    if (previous === undefined) {
      throw new Error(`FlowNode ${node.node_id} revises unknown claim ${claimId}.`);
    }
    claims[claimId] = {
      ...previous,
      commitment:
        previous.commitment === 'COMMITTED' ? 'CONTRADICTED' : 'REVISED',
    };
  }

  const activeModifierIds = appendUnique(
    state.activeModifierIds.filter(
      (modifierId) => !node.deactivate_modifiers.includes(modifierId),
    ),
    node.activate_modifiers,
  );

  const resources: Record<string, number> = { ...state.resources };
  for (const [resource, delta] of Object.entries(node.resource_delta)) {
    resources[resource] = (resources[resource] ?? 0) + delta;
  }

  const next = {
    ...state,
    currentNodeId: node.node_id,
    enteredNodeIds: [...state.enteredNodeIds, node.node_id],
    claims,
    // T-4: this is a monotonic union; entering a node can never re-hide a claim.
    revealedClaimIds: appendUnique(
      state.revealedClaimIds,
      node.reveal_claim_ids,
    ),
    openRouteIds: appendUnique(state.openRouteIds, node.open_route_ids),
    activeModifierIds,
    resources,
    reactionKey: node.reaction_key,
    terminal: node.is_terminal,
  };
  return next;
}

/** T-2/T-3: choose the first eligible, not-yet-entered node in definition order. */
export function runFlowTransition<TState extends FlowRuntimeState>(
  nodes: readonly FlowNode[],
  state: TState,
): FlowTransitionResult<TState> {
  if (state.terminal) return { transitioned: false, state };
  const node = nodes.find((candidate) => canEnterFlowNode(candidate, state));
  if (node === undefined) return { transitioned: false, state };
  return {
    transitioned: true,
    node,
    state: enterFlowNode(node, state),
  };
}

/**
 * Structural T-5 validation for the ordered flow model. Semantic reachability
 * remains a content-graph validation concern because runtime conditions depend
 * on play. Requiring a terminal tail guarantees every entered prefix has a
 * forward terminal candidate.
 */
function assertFlowConditionCatalog(condition: Condition): void {
  if (
    !FLOW_ENTER_CONDITION_TYPES.includes(
      condition.type as FlowEnterConditionType,
    )
  ) {
    throw new Error(
      `Invalid FlowNode enter condition ${condition.type}: transitions must be progress-based.`,
    );
  }
  if (condition.type === 'ALL_OF' || condition.type === 'ANY_OF') {
    for (const nested of nestedConditions(condition)) {
      assertFlowConditionCatalog(nested);
    }
  }
  if (condition.type === 'NOT') {
    assertFlowConditionCatalog(nestedCondition(condition));
  }
}

export function assertFlowDefinition(nodes: readonly FlowNode[]): void {
  if (nodes.length === 0) throw new Error('Encounter flow must contain a node.');
  const ids = new Set<ContentId>();
  for (const node of nodes) {
    if (ids.has(node.node_id)) {
      throw new Error(`Duplicate FlowNode id: ${node.node_id}.`);
    }
    ids.add(node.node_id);
    for (const condition of node.enter_conditions) {
      assertFlowConditionCatalog(condition);
    }
  }
  if (nodes.at(-1)?.is_terminal !== true) {
    throw new Error('The final FlowNode must be terminal.');
  }
}
