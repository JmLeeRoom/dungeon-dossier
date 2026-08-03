import {
  GradesSchema,
  type CaseGradeDefinition,
  type GradesDefinition,
} from '../domain';

export type CaseGrade = CaseGradeDefinition['grade'];

export interface GradeEvaluationInput {
  readonly requiredClaimResolutionRatio: number;
  readonly optionalObjectiveRatio: number;
  readonly sweetSpotFinish: boolean;
  readonly originalsPreserved: boolean;
  readonly coercion: number;
  readonly falseConfessions: number;
}

export interface GradeEvaluation {
  readonly grade: CaseGrade;
  readonly labelKey: string;
  readonly priority: number;
}

function assertRatio(name: string, value: number): void {
  if (!Number.isFinite(value) || value < 0 || value > 1) {
    throw new RangeError(`${name} must be between 0 and 1.`);
  }
}

function assertInput(input: GradeEvaluationInput): void {
  assertRatio('requiredClaimResolutionRatio', input.requiredClaimResolutionRatio);
  assertRatio('optionalObjectiveRatio', input.optionalObjectiveRatio);
  if (!Number.isFinite(input.coercion) || input.coercion < 0) {
    throw new RangeError('coercion must be a finite non-negative number.');
  }
  if (!Number.isInteger(input.falseConfessions) || input.falseConfessions < 0) {
    throw new RangeError('falseConfessions must be a non-negative integer.');
  }
}

function satisfiesGrade(
  definition: CaseGradeDefinition,
  input: GradeEvaluationInput,
): boolean {
  const requirements = definition.requirements;
  return (
    (requirements.required_claim_resolution_ratio_min === undefined ||
      input.requiredClaimResolutionRatio >= requirements.required_claim_resolution_ratio_min) &&
    (requirements.optional_objective_ratio_min === undefined ||
      input.optionalObjectiveRatio >= requirements.optional_objective_ratio_min) &&
    (requirements.require_sweet_spot_finish !== true || input.sweetSpotFinish) &&
    (requirements.require_originals_preserved !== true || input.originalsPreserved) &&
    (requirements.coercion_max === undefined || input.coercion <= requirements.coercion_max) &&
    (requirements.false_confessions_max === undefined ||
      input.falseConfessions <= requirements.false_confessions_max)
  );
}

/** Highest priority matching row wins; definition order breaks priority ties. */
export function evaluateCaseGrade(
  catalogueInput: GradesDefinition,
  input: GradeEvaluationInput,
): GradeEvaluation {
  assertInput(input);
  const catalogue = GradesSchema.parse(catalogueInput);
  let selected: CaseGradeDefinition | undefined;
  for (const definition of catalogue.grades) {
    if (
      satisfiesGrade(definition, input) &&
      (selected === undefined || definition.priority > selected.priority)
    ) {
      selected = definition;
    }
  }
  if (selected === undefined) {
    throw new Error('No case grade definition matches the evaluation input.');
  }
  return {
    grade: selected.grade,
    labelKey: selected.label_key,
    priority: selected.priority,
  };
}
