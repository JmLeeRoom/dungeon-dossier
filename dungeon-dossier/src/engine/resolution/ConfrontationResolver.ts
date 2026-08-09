import type { CardCombatProfile, TruthRelation } from '../domain';
import type { InvalidReason, Resolution, ResolutionEffects } from './types';

export const CLAIM_EXPOSURE_STATES = ['GAP', 'SHIELDED', 'BROKEN'] as const;
export type ClaimExposureState = (typeof CLAIM_EXPOSURE_STATES)[number];

export const CONFRONTATION_JUDGMENTS = [
  'UNOPPOSED',
  'DIRECT',
  'INDIRECT',
  'INSUFFICIENT',
  'IRRELEVANT',
  'TRUTH',
] as const;
export type ConfrontationJudgment = (typeof CONFRONTATION_JUDGMENTS)[number];

export interface ConfrontationPenaltyProfile {
  readonly insufficient: number;
  readonly irrelevant: number;
  readonly truthAttack: number;
}

export const DEFAULT_CONFRONTATION_PENALTIES: ConfrontationPenaltyProfile =
  Object.freeze({
    insufficient: 2,
    irrelevant: 5,
    truthAttack: 15,
  });

export interface CardCombatSelectionValidation {
  readonly valid: boolean;
  readonly reason?: InvalidReason;
}

function targetAllowed(
  profile: CardCombatProfile,
  exposure: ClaimExposureState,
): boolean {
  switch (profile.target_rule) {
    case 'GAP_OR_SHIELD_ATTEMPT':
      return exposure === 'GAP' || exposure === 'SHIELDED';
    case 'GAP_OR_BROKEN':
      return exposure === 'GAP' || exposure === 'BROKEN';
    case 'BROKEN':
      return exposure === 'BROKEN';
    case 'ANY_CLAIM':
      return true;
  }
}

/** Public structural validation. It reads no private truth or proof data. */
export function validateCardCombatSelection(
  profile: CardCombatProfile,
  exposure: ClaimExposureState,
  evidenceCount: number,
): CardCombatSelectionValidation {
  if (!targetAllowed(profile, exposure)) {
    return { valid: false, reason: 'INCOMPATIBLE_TARGET' };
  }

  const evidenceCountValid = (() => {
    switch (profile.evidence_mode) {
      case 'NONE':
        return evidenceCount === 0;
      case 'EXACTLY_ONE':
        return evidenceCount === 1;
      case 'OPTIONAL_FOR_SHIELD':
        return exposure === 'SHIELDED' ? evidenceCount === 1 : evidenceCount === 0;
    }
  })();
  return evidenceCountValid
    ? { valid: true }
    : { valid: false, reason: 'INCOMPATIBLE_TARGET' };
}

export function claimExposureState(
  shieldDurability: number | undefined,
): ClaimExposureState {
  if (shieldDurability === undefined) return 'GAP';
  return shieldDurability > 0 ? 'SHIELDED' : 'BROKEN';
}

export function confrontationJudgmentFor(
  resolution: Resolution,
): ConfrontationJudgment | undefined {
  switch (resolution.code) {
    case 'R_DIRECT_CONTRADICTION':
      return 'DIRECT';
    case 'R_INDIRECT_SUSPICION':
      return 'INDIRECT';
    case 'R_INSUFFICIENT_GROUNDS':
      return 'INSUFFICIENT';
    case 'R_IRRELEVANT_EVIDENCE':
      return 'IRRELEVANT';
    case 'R_TRUTH_ATTACKED':
      return 'TRUTH';
    case 'R_PRESSURE_APPLIED':
      return 'UNOPPOSED';
    default:
      return undefined;
  }
}

/** Bat threats are the only evidence-free move that consults private truth. */
export function isDomainTruthTrap(relation: TruthRelation): boolean {
  return relation === 'CONSISTENT_WITH_WORLD';
}

function combatEffects(
  base: ResolutionEffects,
  profile: CardCombatProfile,
  exposure: ClaimExposureState,
  judgment: ConfrontationJudgment,
  penalties: ConfrontationPenaltyProfile,
): ResolutionEffects {
  let composureDelta = 0;
  let coercionDelta = profile.coercion_delta;
  let resistanceDelta = 0;
  let epistemicState = base.epistemicState;
  let phaseTransitionWeight = 0;

  switch (judgment) {
    case 'UNOPPOSED':
      composureDelta = profile.composure_delta;
      epistemicState = undefined;
      break;
    case 'DIRECT':
      composureDelta = profile.composure_delta;
      if (
        exposure === 'SHIELDED' &&
        profile.shield_mode === 'BREAK_ON_DIRECT'
      ) {
        resistanceDelta = -profile.shield_damage;
      }
      if (profile.role === 'FINISHER') {
        epistemicState = 'REFUTED';
        phaseTransitionWeight = 1;
      } else {
        // Breaking a shield exposes the claim; it does not also refute it.
        epistemicState = undefined;
      }
      break;
    case 'INDIRECT':
      composureDelta = exposure === 'SHIELDED'
        ? 0
        : Math.trunc(profile.composure_delta * 0.5);
      break;
    case 'INSUFFICIENT':
      coercionDelta += penalties.insufficient;
      epistemicState = undefined;
      break;
    case 'IRRELEVANT':
      coercionDelta += penalties.irrelevant;
      epistemicState = undefined;
      break;
    case 'TRUTH':
      coercionDelta += penalties.truthAttack;
      // Truth is a final damage gate: nominal power and resolver/modifier
      // resource payloads cannot leak composure or shield damage through it.
      epistemicState = base.epistemicState;
      break;
  }

  return {
    composureDelta,
    coercionDelta,
    ...(epistemicState === undefined ? {} : { epistemicState }),
    ...(base.commitmentState === undefined
      ? {}
      : { commitmentState: base.commitmentState }),
    ...(base.presentationState === undefined
      ? {}
      : { presentationState: base.presentationState }),
    resistanceDelta,
    reveals: base.reveals,
    cardEffects: base.cardEffects,
    modifierEffects: base.modifierEffects,
    checkObjectives: base.checkObjectives,
    consumeCommandPoints: base.consumeCommandPoints,
    commandPointDelta: base.commandPointDelta,
    phaseTransitionWeight,
    ...(base.terminalOutcome === undefined
      ? {}
      : { terminalOutcome: base.terminalOutcome }),
  };
}

/**
 * Replaces generic balance damage with the selected card's sole nominal power.
 * Invalid/procedure results remain byte-for-byte semantic rejections.
 */
export function applyCardCombatProfile(
  resolution: Resolution,
  profile: CardCombatProfile,
  exposure: ClaimExposureState,
  options: Readonly<{
    judgment?: ConfrontationJudgment;
    penalties?: ConfrontationPenaltyProfile;
  }> = {},
): Resolution {
  if (
    resolution.axes.validity === 'INVALID' ||
    resolution.code === 'R_PROCEDURE_VIOLATION'
  ) {
    return resolution;
  }
  const judgment = options.judgment ?? confrontationJudgmentFor(resolution);
  if (judgment === undefined) return resolution;

  const effects = combatEffects(
    resolution.effects,
    profile,
    exposure,
    judgment,
    options.penalties ?? DEFAULT_CONFRONTATION_PENALTIES,
  );
  return {
    ...resolution,
    effects,
    reveals: effects.reveals,
  };
}
