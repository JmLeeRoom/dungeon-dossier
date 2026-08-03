import type { EncounterDefinition } from '../domain';
import type { ClaimKnowledge } from '../knowledge';
import type { IntegrityState } from '../resolution/types';
import type { EncounterResourceState } from './ResourceSystem';

export type ObjectiveDefinition =
  EncounterDefinition['objectives']['required'][number];
export type ObjectiveType = ObjectiveDefinition['type'];

export interface ObjectiveEvidenceState {
  readonly evidenceId: string;
  readonly integrity: IntegrityState;
  /** Omitted means the caller's evidence collection already contains owned evidence. */
  readonly acquired?: boolean;
}

export interface ObjectiveEvaluationContext {
  readonly claims: readonly Pick<
    ClaimKnowledge,
    'claimId' | 'commitment' | 'epistemic' | 'presentation'
  >[];
  readonly evidence: readonly ObjectiveEvidenceState[];
  readonly resources: EncounterResourceState;
  readonly damagedEntityIds?: readonly string[];
  readonly encounterFinished?: boolean;
  readonly encounterFailed?: boolean;
}

export interface EvaluatedObjective {
  readonly objective: ObjectiveDefinition;
  readonly objectiveId: string;
  readonly type: ObjectiveType;
  readonly required: boolean;
  readonly completed: boolean;
}

export interface ObjectiveEvaluationSummary {
  readonly required: readonly EvaluatedObjective[];
  readonly optional: readonly EvaluatedObjective[];
  readonly allRequiredCompleted: boolean;
  readonly completedRequiredCount: number;
  readonly requiredCompletionRatio: number;
}

function claimFor(
  objective: ObjectiveDefinition,
  context: ObjectiveEvaluationContext,
) {
  if (objective.claim_id === undefined) return undefined;
  return context.claims.find((claim) => claim.claimId === objective.claim_id);
}

function evidenceFor(
  objective: ObjectiveDefinition,
  context: ObjectiveEvaluationContext,
) {
  if (objective.evidence_id === undefined) return undefined;
  return context.evidence.find(
    (evidence) => evidence.evidenceId === objective.evidence_id,
  );
}

/** Evaluates one objective without mutating encounter state. */
export function evaluateObjective(
  objective: ObjectiveDefinition,
  context: ObjectiveEvaluationContext,
): boolean {
  const claim = claimFor(objective, context);

  switch (objective.type) {
    case 'RESOLVE_CLAIM':
      return claim?.epistemic === 'SUPPORTED' || claim?.epistemic === 'REFUTED';
    case 'CONFIRM_CLAIM':
      return claim?.epistemic === 'SUPPORTED';
    case 'REFUTE_CLAIM':
      return claim?.epistemic === 'REFUTED';
    case 'REVEAL_CLAIM':
      return claim !== undefined && claim.presentation !== 'HIDDEN';
    case 'CREATE_COMMITMENT':
      return claim?.commitment === 'COMMITTED';
    case 'PRESERVE_EVIDENCE': {
      const evidence = evidenceFor(objective, context);
      return (
        evidence !== undefined &&
        evidence.acquired !== false &&
        evidence.integrity === 'INTACT'
      );
    }
    case 'REACH_COMPOSURE_RANGE':
      return (
        objective.min !== undefined &&
        objective.max !== undefined &&
        context.resources.composure >= objective.min &&
        context.resources.composure <= objective.max
      );
    case 'KEEP_COERCION_BELOW':
      return (
        objective.max !== undefined &&
        context.resources.coercion < objective.max
      );
    case 'SURVIVE_UNTIL_TURN':
      return (
        objective.turn !== undefined &&
        context.encounterFailed !== true &&
        context.resources.turn >= objective.turn
      );
    case 'FINISH_BEFORE_TURN':
      return (
        objective.turn !== undefined &&
        context.encounterFinished === true &&
        context.encounterFailed !== true &&
        context.resources.turn < objective.turn
      );
    case 'PROTECT_ENTITY':
      return (
        objective.entity_id !== undefined &&
        !(context.damagedEntityIds ?? []).includes(objective.entity_id)
      );
    case 'OPTIONAL_DISCOVERY': {
      if (claim !== undefined) return claim.presentation !== 'HIDDEN';
      const evidence = evidenceFor(objective, context);
      return evidence !== undefined && evidence.acquired !== false;
    }
  }
}

function evaluateGroup(
  objectives: readonly ObjectiveDefinition[],
  required: boolean,
  context: ObjectiveEvaluationContext,
): readonly EvaluatedObjective[] {
  return objectives.map((objective) => ({
    objective,
    objectiveId: objective.objective_id,
    type: objective.type,
    required,
    completed: evaluateObjective(objective, context),
  }));
}

/** Produces a stable summary used by outcome and UI layers. */
export function evaluateObjectives(
  objectives: EncounterDefinition['objectives'],
  context: ObjectiveEvaluationContext,
): ObjectiveEvaluationSummary {
  const required = evaluateGroup(objectives.required, true, context);
  const optional = evaluateGroup(objectives.optional, false, context);
  const completedRequiredCount = required.filter(
    (objective) => objective.completed,
  ).length;

  return {
    required,
    optional,
    allRequiredCompleted: completedRequiredCount === required.length,
    completedRequiredCount,
    requiredCompletionRatio:
      required.length === 0 ? 1 : completedRequiredCount / required.length,
  };
}

/**
 * Encounter-level bridge for ProofEvaluator.hasSolvableProofPath. Each
 * incomplete required objective must retain at least one intact guaranteed
 * evidence path. Completed objectives no longer need a future proof path.
 */
export function hasSolvableRequiredObjectivePath(
  requiredObjectives: readonly EvaluatedObjective[],
  hasSolvablePathForObjective: (objective: ObjectiveDefinition) => boolean,
): boolean {
  return requiredObjectives.every(
    (evaluated) =>
      evaluated.completed || hasSolvablePathForObjective(evaluated.objective),
  );
}
