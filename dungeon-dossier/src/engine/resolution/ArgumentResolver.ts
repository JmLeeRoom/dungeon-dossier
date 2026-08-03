import { validateActionCompatibility, validateTargetExposure } from './ActionValidator';
import {
  evidenceRelevantToRule,
  evaluateRelation,
  evaluateRelevance,
} from './EvidenceRelationEvaluator';
import { evaluateIndependence } from './IndependenceEvaluator';
import {
  evaluateConfidence,
  evaluateHypotheses,
  evaluateProof,
} from './ProofEvaluator';
import { lookupResolutionCode } from './resolutionTable';
import type {
  InvalidReason,
  Resolution,
  ResolutionAxes,
  ResolutionCode,
  ResolutionEffects,
  ResolutionFeedback,
  ResolutionInput,
  ResolutionStep,
} from './types';

function effectsFor(code: ResolutionCode, input: ResolutionInput): ResolutionEffects {
  let composureDelta = 0;
  let coercionDelta = 0;
  let phaseTransitionWeight = 0;
  let resistanceDelta = 0;
  let epistemicState: ResolutionEffects['epistemicState'];
  let commitmentState: ResolutionEffects['commitmentState'];
  let presentationState: ResolutionEffects['presentationState'];
  let terminalOutcome: ResolutionEffects['terminalOutcome'];

  switch (code) {
    case 'R_DIRECT_CONTRADICTION': {
      const multiplier = input.target?.commitment === 'COMMITTED'
        ? input.balance.committedMultiplier
        : 1;
      composureDelta = -input.balance.directContradictionDamage * multiplier;
      coercionDelta = input.balance.coercion.directContradiction;
      epistemicState = 'REFUTED';
      phaseTransitionWeight = input.target?.commitment === 'COMMITTED' ? 2 : 1;
      break;
    }
    case 'R_INDIRECT_SUSPICION':
      composureDelta = -input.balance.indirectSuspicionDamage;
      coercionDelta = input.balance.coercion.indirectSuspicion;
      epistemicState = 'SUSPECTED';
      break;
    case 'R_INSUFFICIENT_GROUNDS':
      coercionDelta = input.balance.coercion.insufficient;
      break;
    case 'R_TRUTH_ATTACKED':
      coercionDelta = input.balance.coercion.truthAttack;
      epistemicState = 'PROVISIONAL';
      break;
    case 'R_IRRELEVANT_EVIDENCE':
      coercionDelta = input.balance.coercion.irrelevant;
      break;
    case 'R_CONFIRM_LOCKED':
      epistemicState = 'SUPPORTED';
      break;
    case 'R_CONFIRM_PROVISIONAL':
      epistemicState = 'PROVISIONAL';
      break;
    case 'R_CONFIRM_CONFLICT':
      epistemicState = 'SUSPECTED';
      break;
    case 'R_COMMIT_SUCCESS':
      commitmentState = 'COMMITTED';
      break;
    case 'R_COMMIT_REFUSED':
      resistanceDelta = -1;
      break;
    case 'R_PRESSURE_BACKFIRE':
      resistanceDelta = 1;
      break;
    case 'R_PROCEDURE_VIOLATION':
      terminalOutcome = 'FAILED';
      break;
    default:
      break;
  }

  const consumeCommandPoints = code !== 'R_ACTION_INVALID' && code !== 'R_QUERY_BLOCKED';
  const appliesActionPayload =
    code !== 'R_ACTION_INVALID' &&
    code !== 'R_PROCEDURE_VIOLATION' &&
    code !== 'R_QUERY_BLOCKED';
  if (appliesActionPayload) {
    composureDelta += input.actionContext?.composureDelta ?? 0;
    coercionDelta += input.actionContext?.coercionDelta ?? 0;
    commitmentState = input.actionContext?.commitmentState ?? commitmentState;
    presentationState = input.actionContext?.presentationState;
  }
  const reveals = appliesActionPayload ? (input.actionContext?.reveals ?? []) : [];
  const cardEffects = appliesActionPayload ? (input.actionContext?.cardEffects ?? []) : [];
  const modifierEffects = appliesActionPayload
    ? (input.actionContext?.modifierEffects ?? [])
    : [];
  return {
    composureDelta,
    coercionDelta,
    ...(epistemicState === undefined ? {} : { epistemicState }),
    ...(commitmentState === undefined ? {} : { commitmentState }),
    ...(presentationState === undefined ? {} : { presentationState }),
    resistanceDelta,
    reveals,
    cardEffects,
    modifierEffects,
    checkObjectives: true,
    consumeCommandPoints,
    commandPointDelta: consumeCommandPoints ? -input.commandPointCost : 0,
    phaseTransitionWeight,
    ...(terminalOutcome === undefined ? {} : { terminalOutcome }),
  };
}

function makeResolution(
  code: ResolutionCode,
  input: ResolutionInput,
  axes: ResolutionAxes,
  trace: readonly ResolutionStep[],
  options: Readonly<{
    reason?: InvalidReason;
    feedback?: ResolutionFeedback;
  }> = {},
): Resolution {
  const effects = effectsFor(code, input);
  return {
    code,
    ...(options.reason === undefined ? {} : { reason: options.reason }),
    axes,
    ...(options.feedback === undefined ? {} : { feedback: options.feedback }),
    effects,
    reveals: effects.reveals,
    reactionKey: options.reason ?? code,
    trace,
  };
}

function invalidResolution(
  input: ResolutionInput,
  reason: InvalidReason,
  trace: readonly ResolutionStep[],
): Resolution {
  return makeResolution(
    'R_ACTION_INVALID',
    input,
    { validity: 'INVALID', procedure: input.procedure },
    trace,
    { reason },
  );
}

function resolveActionFamily(
  input: ResolutionInput,
  trace: ResolutionStep[],
): Resolution {
  trace.push('PROCEDURE');
  trace.push('LOOKUP');
  if (input.procedure === 'FORBIDDEN') {
    return makeResolution(
      'R_PROCEDURE_VIOLATION',
      input,
      { validity: 'VALID', procedure: input.procedure },
      trace,
    );
  }

  let code: ResolutionCode;
  switch (input.intent) {
    case 'QUERY':
      code = input.actionContext?.routeAvailable === true
        ? 'R_QUERY_SUCCESS'
        : 'R_QUERY_BLOCKED';
      break;
    case 'CLARIFY':
      code = input.actionContext?.clarifiable === true
        ? 'R_CLARIFY_SUCCESS'
        : 'R_CLARIFY_NOOP';
      break;
    case 'COMMIT':
      code = input.actionContext?.resistanceExceeded === true
        ? 'R_COMMIT_REFUSED'
        : 'R_COMMIT_SUCCESS';
      break;
    case 'FORENSIC':
      code = 'R_FORENSIC_REVEALED';
      break;
    case 'PRESSURE':
      code = input.actionContext?.pressureBackfire === true
        ? 'R_PRESSURE_BACKFIRE'
        : 'R_PRESSURE_APPLIED';
      break;
    case 'RECOVER':
      code = 'R_RECOVER_APPLIED';
      break;
    case 'SPECIAL':
      code = 'R_SPECIAL_APPLIED';
      break;
    default:
      throw new Error(`Unsupported action-family intent: ${input.intent}`);
  }

  return makeResolution(
    code,
    input,
    { validity: 'VALID', procedure: input.procedure },
    trace,
  );
}

/** Pure ten-step resolver. No state, I/O, time, or randomness is read here. */
export function resolveArgument(input: ResolutionInput): Resolution {
  const trace: ResolutionStep[] = ['ACTION_COMPATIBILITY'];
  const compatibility = validateActionCompatibility(input);
  if (compatibility.validity === 'INVALID') {
    return invalidResolution(input, compatibility.reason ?? 'INCOMPATIBLE_TARGET', trace);
  }

  trace.push('TARGET_EXPOSURE');
  const exposure = validateTargetExposure(input);
  if (exposure.validity === 'INVALID') {
    return invalidResolution(input, exposure.reason ?? 'TARGET_NOT_EXPOSED', trace);
  }

  if (input.intent !== 'CONTRADICT' && input.intent !== 'CONFIRM') {
    return resolveActionFamily(input, trace);
  }

  const target = input.target;
  const rule = input.proofRule;
  if (target === undefined || rule === undefined) {
    throw new Error('Validated evidence action is missing its target or proof rule.');
  }

  trace.push('RELEVANCE');
  const coverage = evaluateRelevance(input.evidence, rule);
  if (coverage.relevance === 'NONE') {
    trace.push('PROCEDURE');
    trace.push('LOOKUP');
    const code = input.procedure === 'FORBIDDEN'
      ? 'R_PROCEDURE_VIOLATION'
      : lookupResolutionCode({
          intent: input.intent,
          relevance: 'NONE',
          relation: 'NEUTRAL',
          sufficiency: 'INSUFFICIENT',
          independence: 'MET',
          hypotheses: 'NOT_APPLICABLE',
        });
    return makeResolution(
      code,
      input,
      {
        validity: 'VALID',
        relevance: coverage.relevance,
        procedure: input.procedure,
      },
      trace,
      { feedback: coverage },
    );
  }

  trace.push('RELATION');
  const relation = evaluateRelation(target, input.evidence, coverage.relevance);

  trace.push('SCOPE_COVERAGE');
  trace.push('CONFIDENCE');
  const confidence = evaluateConfidence(input.evidence, rule);

  trace.push('INDEPENDENCE');
  const relevantEvidence = input.evidence.filter((item) => evidenceRelevantToRule(item, rule));
  const catalog = input.evidenceCatalog ?? input.evidence;
  const independence = evaluateIndependence(
    relevantEvidence,
    catalog,
    rule,
    input.balance.independencePartialWeight,
  );

  trace.push('ALTERNATIVE_HYPOTHESES');
  const hypotheses = evaluateHypotheses(relevantEvidence, rule);
  const proof = evaluateProof(input.evidence, rule, confidence.met);

  trace.push('PROCEDURE');
  trace.push('LOOKUP');
  const code = input.procedure === 'FORBIDDEN'
    ? 'R_PROCEDURE_VIOLATION'
    : lookupResolutionCode({
        intent: input.intent,
        relevance: coverage.relevance,
        relation,
        sufficiency: proof.sufficiency,
        independence: independence.independence,
        hypotheses,
      });

  const feedback =
    code === 'R_INSUFFICIENT_GROUNDS' || code === 'R_IRRELEVANT_EVIDENCE'
      ? coverage
      : undefined;
  return makeResolution(
    code,
    input,
    {
      validity: 'VALID',
      relevance: coverage.relevance,
      relation,
      sufficiency: proof.sufficiency,
      independence: independence.independence,
      hypotheses,
      procedure: input.procedure,
    },
    trace,
    feedback === undefined ? {} : { feedback },
  );
}
