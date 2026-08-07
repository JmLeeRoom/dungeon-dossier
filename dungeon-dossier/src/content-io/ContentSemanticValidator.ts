import type {
  CaseDefinition,
  Condition,
  EncounterDefinition,
  EvidenceDefinition,
  ProofRule,
} from '../engine/domain';

export type SemanticValidationTier = 'tier2' | 'tier3';

export interface SemanticValidationProblem {
  readonly kind: SemanticValidationTier;
  readonly relativePath: string;
  readonly message: string;
}

/** One stop of the canonical run order; only the content reference is needed. */
export interface RunOrderNode {
  readonly ref: string;
}

/** Structural projection of the run strip; a parsed `RunStripDefinition` satisfies it. */
export interface RunOrder {
  readonly nodes: readonly RunOrderNode[];
}

export interface SemanticValidationOptions {
  /**
   * Supplying the canonical run order enables the acquisition frontier pass.
   * Without it the reachability tier stays a whole-case approximation, which
   * accepts proof paths the player could not have walked yet.
   */
  readonly runOrder?: RunOrder;
}

type JsonObject = Record<string, unknown>;

const CLAIM_FLOW_CONDITIONS = new Set([
  'ALWAYS',
  'CLAIM_VISIBLE',
  'CLAIM_COMMITMENT',
  'CLAIM_EPISTEMIC',
]);

const PRIVATE_PRESENTATION_KEYS = new Set([
  'truth',
  'truthRelation',
  'truth_relation',
  'isLie',
  'is_lie',
  'contradictingEvents',
  'contradicting_events',
  'proofRule',
  'proofRules',
  'proof_rule',
  'proof_rules',
  'guaranteedEvidenceSets',
  'guaranteed_evidence_sets',
  'knownInsufficientSets',
  'known_insufficient_sets',
  'disqualifyingEvidenceSets',
  'disqualifying_evidence_sets',
  'hypothesis',
  'hypotheses',
]);

function problem(
  kind: SemanticValidationTier,
  relativePath: string,
  code: string,
  location: string,
  message: string,
): SemanticValidationProblem {
  return { kind, relativePath, message: `[${code}] $.${location}: ${message}` };
}

function requiredClaimIds(caseDefinition: CaseDefinition): ReadonlySet<string> {
  const required = new Set(
    caseDefinition.claims.filter((claim) => claim.is_required === true).map((claim) => claim.claim_id),
  );
  for (const encounter of caseDefinition.encounters) {
    for (const objective of encounter.objectives.required) {
      if (objective.claim_id !== undefined) required.add(objective.claim_id);
    }
  }
  return required;
}

function ruleEvidenceSets(rule: ProofRule): readonly (readonly string[])[] {
  return rule.guaranteed_evidence_sets ?? [];
}

function routeReachability(
  caseDefinition: CaseDefinition,
  openedRouteIds: readonly string[] = [],
): Readonly<{
  reachable: ReadonlySet<string>;
  cyclic: ReadonlySet<string>;
}> {
  const routes = new Map(caseDefinition.inquiry_routes.map((route) => [route.route_id, route]));
  const roots = caseDefinition.inquiry_routes
    .filter((route) =>
      route.preconditions.length === 0 || route.preconditions.every((condition) => condition.type === 'ALWAYS'),
    )
    .map((route) => route.route_id);
  roots.push(...openedRouteIds);

  const reachable = new Set<string>();
  const pending = [...roots];
  while (pending.length > 0) {
    const routeId = pending.shift();
    if (routeId === undefined || reachable.has(routeId)) continue;
    const route = routes.get(routeId);
    if (route === undefined) continue;
    reachable.add(routeId);
    pending.push(...route.unlocks_routes);
  }

  const cyclic = new Set<string>();
  const visiting = new Set<string>();
  const visited = new Set<string>();
  const visit = (routeId: string): void => {
    if (visiting.has(routeId)) {
      cyclic.add(routeId);
      return;
    }
    if (visited.has(routeId)) return;
    visiting.add(routeId);
    for (const next of routes.get(routeId)?.unlocks_routes ?? []) {
      visit(next);
      if (cyclic.has(next)) cyclic.add(routeId);
    }
    visiting.delete(routeId);
    visited.add(routeId);
  };
  for (const routeId of routes.keys()) visit(routeId);
  return { reachable, cyclic };
}

function conditionClaimId(condition: Condition): string | undefined {
  return condition.type.startsWith('CLAIM_') ? condition.claim_id : undefined;
}

function reachableFlowNodes(
  caseDefinition: CaseDefinition,
  routeIds: ReadonlySet<string>,
): ReadonlySet<string> {
  const availableClaims = new Set<string>();
  for (const encounter of caseDefinition.encounters) {
    for (const round of encounter.rounds) {
      round.statement_claims.forEach((claimId) => availableClaims.add(claimId));
    }
  }
  for (const route of caseDefinition.inquiry_routes) {
    if (routeIds.has(route.route_id)) route.reveals.forEach((claimId) => availableClaims.add(claimId));
  }

  const reachable = new Set<string>();
  let changed = true;
  while (changed) {
    changed = false;
    for (const encounter of caseDefinition.encounters) {
      for (const node of encounter.flow_nodes) {
        if (reachable.has(node.node_id)) continue;
        const canReach = node.enter_conditions.every((condition) => {
          if (!CLAIM_FLOW_CONDITIONS.has(condition.type)) return false;
          const claimId = conditionClaimId(condition);
          return claimId === undefined || availableClaims.has(claimId);
        });
        if (!canReach) continue;
        reachable.add(node.node_id);
        node.reveal_claim_ids.forEach((claimId) => availableClaims.add(claimId));
        node.revise_claim_ids.forEach((claimId) => availableClaims.add(claimId));
        changed = true;
      }
    }
  }
  return reachable;
}

function referencedEvidenceIds(caseDefinition: CaseDefinition): ReadonlySet<string> {
  const referenced = new Set<string>();
  for (const rule of caseDefinition.proof_rules) {
    for (const evidenceSet of [
      ...(rule.guaranteed_evidence_sets ?? []),
      ...(rule.known_insufficient_sets ?? []),
      ...(rule.alternate_hypotheses?.flatMap((hypothesis) => hypothesis.disqualifying_evidence_sets) ?? []),
    ]) {
      evidenceSet.forEach((evidenceId) => referenced.add(evidenceId));
    }
  }
  for (const encounter of caseDefinition.encounters) {
    for (const objective of [...encounter.objectives.required, ...encounter.objectives.optional]) {
      if (objective.evidence_id !== undefined) referenced.add(objective.evidence_id);
    }
    for (const outcome of encounter.outcomes) {
      outcome.rewards?.evidence?.forEach((evidenceId) => referenced.add(evidenceId));
    }
  }
  return referenced;
}

function hasDestructiveEvidenceModifier(caseDefinition: CaseDefinition): boolean {
  return caseDefinition.encounters.some((encounter) =>
    encounter.modifiers.some((modifier) =>
      modifier.effect.type === 'DAMAGE_EVIDENCE' || modifier.effect.type === 'REMOVE_EVIDENCE'),
  );
}

function survivesSingleEvidenceLoss(sets: readonly (readonly string[])[]): boolean {
  const evidenceIds = new Set(sets.flat());
  return [...evidenceIds].every((lost) => sets.some((set) => !set.includes(lost)));
}

function evidenceSatisfiesRule(
  rule: ProofRule,
  evidenceSet: readonly string[],
  evidenceById: ReadonlyMap<string, EvidenceDefinition>,
): boolean {
  const evidence = evidenceSet.flatMap((id) => {
    const item = evidenceById.get(id);
    return item === undefined ? [] : [item];
  });
  if (evidence.length !== evidenceSet.length) return false;

  const requiredScopes = rule.requirements.required_scopes;
  const coveredScopes = new Set(
    evidence.flatMap((item) =>
      item.observations
        .filter((observation) => observation.confidence >= rule.requirements.minimum_confidence)
        .flatMap((observation) => observation.scopes),
    ),
  );
  if (!requiredScopes.every((scope) => coveredScopes.has(scope))) return false;
  const sourceRoots = evidence.map((item) => {
    let current = item;
    const visited = new Set<string>();
    while (current.independence.derived_from !== null) {
      if (visited.has(current.evidence_id)) return undefined;
      visited.add(current.evidence_id);
      const parent = evidenceById.get(current.independence.derived_from);
      if (parent === undefined) return undefined;
      current = parent;
    }
    return `${current.independence.group}:${current.independence.source_id}`;
  });
  if (sourceRoots.some((source) => source === undefined)) return false;
  const sources = new Set(sourceRoots);
  if (sources.size < rule.requirements.minimum_independent_sources) return false;
  if (
    rule.requirements.require_integrity === true &&
    evidence.some((item) => item.integrity?.initial === 'DESTROYED')
  ) {
    return false;
  }
  return true;
}

function containsFlagCondition(value: unknown): boolean {
  if (Array.isArray(value)) return value.some(containsFlagCondition);
  if (value === null || typeof value !== 'object') return false;
  const object = value as JsonObject;
  if (object.type === 'FLAG_EQUALS') return true;
  return Object.values(object).some(containsFlagCondition);
}

function privatePaths(value: unknown, prefix: string, output: string[]): void {
  if (Array.isArray(value)) {
    value.forEach((child, index) => privatePaths(child, `${prefix}.${index.toString()}`, output));
    return;
  }
  if (value === null || typeof value !== 'object') return;
  for (const [key, child] of Object.entries(value)) {
    const path = `${prefix}.${key}`;
    if (PRIVATE_PRESENTATION_KEYS.has(key)) output.push(path);
    privatePaths(child, path, output);
  }
}

function aiContractProblems(
  caseDefinition: CaseDefinition,
  relativePath: string,
): readonly SemanticValidationProblem[] {
  const problems: SemanticValidationProblem[] = [];
  const claims = new Map(caseDefinition.claims.map((claim) => [claim.claim_id, claim]));
  for (const [claimId, statement] of Object.entries(caseDefinition.dialogue.statements)) {
    const claim = claims.get(claimId);
    const allowedIds = new Set([claimId]);
    if (claim?.presentation_group !== undefined) {
      caseDefinition.claims
        .filter((candidate) => candidate.presentation_group === claim.presentation_group)
        .forEach((candidate) => allowedIds.add(candidate.claim_id));
    }
    const sortedSpans = [...statement.spans].sort((left, right) => left.start - right.start);
    const mapped = new Set<string>();
    let previousEnd = 0;
    for (const [spanIndex, span] of sortedSpans.entries()) {
      if (!allowedIds.has(span.claim_id) || mapped.has(span.claim_id)) {
        problems.push(problem(
          'tier3', relativePath, 'AI_CLAIM_MAPPING',
          `dialogue.statements.${claimId}.spans.${spanIndex.toString()}`,
          `span claim ${span.claim_id} is not an atomic allowed mapping`,
        ));
      }
      mapped.add(span.claim_id);
      if (span.start < previousEnd || statement.fallback.some((line) => span.end > line.length)) {
        problems.push(problem(
          'tier3', relativePath, 'AI_SPAN_INTEGRITY',
          `dialogue.statements.${claimId}.spans.${spanIndex.toString()}`,
          'fallback span overlaps or falls outside an authored line',
        ));
      }
      previousEnd = Math.max(previousEnd, span.end);
    }
    if (!mapped.has(claimId)) {
      problems.push(problem(
        'tier3', relativePath, 'AI_CLAIM_MAPPING', `dialogue.statements.${claimId}.spans`,
        'the statement claim is not mapped by any fallback span',
      ));
    }
    const forbidden = claim === undefined
      ? []
      : caseDefinition.dialogue.speaker_profiles[claim.speaker]?.forbidden_expressions ?? [];
    for (const expression of forbidden) {
      if (statement.fallback.some((line) => line.includes(expression))) {
        problems.push(problem(
          'tier3', relativePath, 'AI_FORBIDDEN_EXPRESSION',
          `dialogue.statements.${claimId}.fallback`,
          `authored fallback contains speaker-forbidden expression ${expression}`,
        ));
      }
    }
  }
  return problems;
}

/** Everything the player has unlocked up to, and including, the current run node. */
interface AcquisitionFrontier {
  /** Evidence handed over directly, independently of its authored acquire node. */
  readonly grantedEvidenceIds: Set<string>;
  /** Acquire origins already passed: flow/event nodes, opened routes, set flags. */
  readonly unlockedOriginIds: Set<string>;
  /** Routes opened so far; kept apart because unlock chains must be re-expanded. */
  readonly openedRouteIds: Set<string>;
}

/** One encounter stop of the run order, with the state the player holds there. */
interface FrontierStop {
  readonly orderIndex: number;
  readonly encounterIndex: number;
  readonly encounter: EncounterDefinition;
  readonly acquirableEvidenceIds: ReadonlySet<string>;
}

/**
 * Run effects are authored at several nesting depths (choices, spots, topics,
 * modifiers, outcomes), so the frontier harvests them structurally rather than
 * teaching this pass every event pattern shape.
 */
function collectFrontierEffects(value: unknown, frontier: AcquisitionFrontier): void {
  if (Array.isArray(value)) {
    value.forEach((child) => { collectFrontierEffects(child, frontier); });
    return;
  }
  if (value === null || typeof value !== 'object') return;
  const object = value as JsonObject;
  const target = object.target;
  if (typeof target === 'string') {
    if (object.type === 'GRANT_EVIDENCE') frontier.grantedEvidenceIds.add(target);
    if (object.type === 'OPEN_ROUTE') {
      frontier.openedRouteIds.add(target);
      frontier.unlockedOriginIds.add(target);
    }
    if (object.type === 'SET_FLAG') frontier.unlockedOriginIds.add(target);
  }
  Object.values(object).forEach((child) => { collectFrontierEffects(child, frontier); });
}

/**
 * Replays the canonical run order and records, for every encounter stop, the
 * evidence a player could already be holding when that encounter is played.
 */
function walkRunOrder(
  caseDefinition: CaseDefinition,
  runOrder: RunOrder,
): Readonly<{ stops: readonly FrontierStop[]; complete: ReadonlySet<string> }> {
  const encounterIndexById = new Map(
    caseDefinition.encounters.map((encounter, index) => [encounter.encounter_id, index]),
  );
  const eventById = new Map(caseDefinition.events_noncombat.map((event) => [event.event_id, event]));
  const frontier: AcquisitionFrontier = {
    grantedEvidenceIds: new Set<string>(),
    unlockedOriginIds: new Set<string>(),
    openedRouteIds: new Set<string>(),
  };

  const settleRoutes = (): void => {
    // Opening one route also unlocks whatever it chains into.
    const opened = routeReachability(caseDefinition, [...frontier.openedRouteIds]).reachable;
    opened.forEach((routeId) => frontier.unlockedOriginIds.add(routeId));
  };
  const snapshot = (): ReadonlySet<string> => new Set([
    ...frontier.grantedEvidenceIds,
    ...caseDefinition.evidence
      .filter((evidence) => frontier.unlockedOriginIds.has(evidence.acquire.node))
      .map((evidence) => evidence.evidence_id),
  ]);

  const stops: FrontierStop[] = [];
  for (const [orderIndex, orderNode] of runOrder.nodes.entries()) {
    const event = eventById.get(orderNode.ref);
    if (event !== undefined) {
      frontier.unlockedOriginIds.add(event.node);
      collectFrontierEffects(event, frontier);
      // Pattern F hands over its sweep targets without an explicit run effect.
      if (event.pattern === 'F') {
        event.targets.forEach((target) => frontier.grantedEvidenceIds.add(target.evidence_id));
      }
      settleRoutes();
      continue;
    }

    const encounterIndex = encounterIndexById.get(orderNode.ref);
    const encounter = encounterIndex === undefined
      ? undefined
      : caseDefinition.encounters[encounterIndex];
    // Strip nodes owned by another case carry no state for this one.
    if (encounterIndex === undefined || encounter === undefined) continue;

    const { outcomes, ...duringEncounter } = encounter;
    for (const flowNode of encounter.flow_nodes) {
      frontier.unlockedOriginIds.add(flowNode.node_id);
      flowNode.open_route_ids.forEach((routeId) => {
        frontier.openedRouteIds.add(routeId);
        frontier.unlockedOriginIds.add(routeId);
      });
    }
    collectFrontierEffects(duringEncounter, frontier);
    settleRoutes();
    stops.push({ orderIndex, encounterIndex, encounter, acquirableEvidenceIds: snapshot() });

    // Outcome payouts settle after the encounter, so they feed later nodes only.
    collectFrontierEffects(outcomes, frontier);
    for (const outcome of outcomes) {
      outcome.rewards?.evidence?.forEach((evidenceId) => frontier.grantedEvidenceIds.add(evidenceId));
      Object.keys(outcome.rewards?.flags ?? {}).forEach((flagId) =>
        frontier.unlockedOriginIds.add(flagId));
    }
    settleRoutes();
  }
  return { stops, complete: snapshot() };
}

/**
 * Judges every required objective against the state frontier at its own run
 * position. The whole-case reachability pass above cannot see time, so it
 * accepts proof paths fed by evidence that only unlocks at a later node.
 */
function acquisitionFrontierProblems(
  caseDefinition: CaseDefinition,
  relativePath: string,
  runOrder: RunOrder,
  rulesByClaim: ReadonlyMap<string, readonly ProofRule[]>,
): readonly SemanticValidationProblem[] {
  const problems: SemanticValidationProblem[] = [];
  const { stops, complete } = walkRunOrder(caseDefinition, runOrder);

  for (const stop of stops) {
    for (const [objectiveIndex, objective] of stop.encounter.objectives.required.entries()) {
      const claimId = objective.claim_id;
      if (claimId === undefined) continue;
      const sets = (rulesByClaim.get(claimId) ?? [])
        .flatMap(ruleEvidenceSets)
        .filter((set) => set.length > 0);
      const held = stop.acquirableEvidenceIds;
      if (sets.some((set) => set.every((evidenceId) => held.has(evidenceId)))) continue;
      // Sets that never become acquirable belong to NO_SOLVABLE_PATH, not here.
      const deferred = sets.filter((set) => set.every((evidenceId) => complete.has(evidenceId)));
      if (deferred.length === 0) continue;
      const pending = [
        ...new Set(deferred.flat().filter((evidenceId) => !held.has(evidenceId))),
      ].sort();
      problems.push(problem(
        'tier2', relativePath, 'PROOF_PATH_NOT_YET_ACQUIRABLE',
        `encounters.${stop.encounterIndex.toString()}.objectives.required.${objectiveIndex.toString()}`,
        `required claim ${claimId} has no guaranteed evidence set acquirable at run node ` +
        `${(stop.orderIndex + 1).toString()} (${stop.encounter.encounter_id}); ` +
        `${pending.join(', ')} unlock only later in the run order`,
      ));
    }
  }
  return problems;
}

export function validateCaseTier2AndTier3(
  caseDefinition: CaseDefinition,
  relativePath: string,
  options: SemanticValidationOptions = {},
): readonly SemanticValidationProblem[] {
  const problems: SemanticValidationProblem[] = [];
  const requiredClaims = requiredClaimIds(caseDefinition);
  const rulesByClaim = new Map<string, ProofRule[]>();
  for (const rule of caseDefinition.proof_rules) {
    const rules = rulesByClaim.get(rule.target_claim_id) ?? [];
    rules.push(rule);
    rulesByClaim.set(rule.target_claim_id, rules);
  }

  let routes = routeReachability(caseDefinition);
  let flowNodes = reachableFlowNodes(caseDefinition, routes.reachable);
  const flowNodeCount = caseDefinition.encounters.reduce(
    (total, encounter) => total + encounter.flow_nodes.length,
    0,
  );
  for (let pass = 0; pass <= flowNodeCount; pass += 1) {
    const openedRouteIds = caseDefinition.encounters.flatMap((encounter) =>
      encounter.flow_nodes
        .filter((node) => flowNodes.has(node.node_id))
        .flatMap((node) => node.open_route_ids),
    );
    const nextRoutes = routeReachability(caseDefinition, openedRouteIds);
    const nextFlowNodes = reachableFlowNodes(caseDefinition, nextRoutes.reachable);
    if (
      nextRoutes.reachable.size === routes.reachable.size &&
      nextFlowNodes.size === flowNodes.size
    ) {
      routes = nextRoutes;
      flowNodes = nextFlowNodes;
      break;
    }
    routes = nextRoutes;
    flowNodes = nextFlowNodes;
  }
  for (const [index, route] of caseDefinition.inquiry_routes.entries()) {
    if (!routes.reachable.has(route.route_id)) {
      problems.push(problem(
        'tier2', relativePath, 'UNREACHABLE_ROUTE', `inquiry_routes.${index.toString()}`,
        `route ${route.route_id} has no reachable open path`,
      ));
    }
    if (routes.cyclic.has(route.route_id)) {
      problems.push(problem(
        'tier2', relativePath, 'CYCLIC_PATH', `inquiry_routes.${index.toString()}.unlocks_routes`,
        `route ${route.route_id} participates in an unlock cycle`,
      ));
    }
  }

  for (const [encounterIndex, encounter] of caseDefinition.encounters.entries()) {
    for (const [nodeIndex, node] of encounter.flow_nodes.entries()) {
      if (!flowNodes.has(node.node_id)) {
        problems.push(problem(
          'tier2', relativePath, 'UNREACHABLE_FLOW_NODE',
          `encounters.${encounterIndex.toString()}.flow_nodes.${nodeIndex.toString()}`,
          `flow node ${node.node_id} cannot be reached from visible or route-revealed claims`,
        ));
      }
    }
  }

  const reachableOrigins = new Set<string>([
    ...routes.reachable,
    ...flowNodes,
    ...caseDefinition.events_noncombat.map((event) => event.node),
  ]);
  const evidenceById = new Map(caseDefinition.evidence.map((evidence) => [evidence.evidence_id, evidence]));
  const obtainableEvidence = new Set(
    caseDefinition.evidence
      .filter((evidence) => evidence.acquire.method === 'STARTING' || reachableOrigins.has(evidence.acquire.node))
      .map((evidence) => evidence.evidence_id),
  );
  for (const evidenceId of referencedEvidenceIds(caseDefinition)) {
    if (!obtainableEvidence.has(evidenceId)) {
      problems.push(problem(
        'tier2', relativePath, 'UNOBTAINABLE_EVIDENCE', 'evidence',
        `referenced evidence ${evidenceId} has no reachable acquisition node`,
      ));
    }
  }

  const destructive = hasDestructiveEvidenceModifier(caseDefinition);
  for (const claimId of requiredClaims) {
    const rules = rulesByClaim.get(claimId) ?? [];
    if (rules.length === 0) {
      problems.push(problem(
        'tier2', relativePath, 'REQUIRED_CLAIM_WITHOUT_PROOF', 'proof_rules',
        `required claim ${claimId} has no ProofRule`,
      ));
      continue;
    }
    const viableSets = rules
      .flatMap(ruleEvidenceSets)
      .filter((set) => set.every((evidenceId) => obtainableEvidence.has(evidenceId)));
    if (viableSets.length === 0 || (destructive && !survivesSingleEvidenceLoss(viableSets))) {
      problems.push(problem(
        'tier2', relativePath, 'NO_SOLVABLE_PATH', 'proof_rules',
        `required claim ${claimId} has no guaranteed path that survives configured evidence loss`,
      ));
    }
  }

  for (const [ruleIndex, rule] of caseDefinition.proof_rules.entries()) {
    for (const [setIndex, evidenceSet] of ruleEvidenceSets(rule).entries()) {
      if (!evidenceSatisfiesRule(rule, evidenceSet, evidenceById)) {
        problems.push(problem(
          'tier3', relativePath, 'INVALID_GUARANTEED_SET',
          `proof_rules.${ruleIndex.toString()}.guaranteed_evidence_sets.${setIndex.toString()}`,
          `guaranteed set does not satisfy scopes, confidence, independence, or integrity for ${rule.rule_id}`,
        ));
      }
    }
  }

  for (const [encounterIndex, encounter] of caseDefinition.encounters.entries()) {
    if (containsFlagCondition(encounter)) {
      problems.push(problem(
        'tier3', relativePath, 'FLAG_ENGINE_BRANCH', `encounters.${encounterIndex.toString()}`,
        'long-term flags must be consumed as data effects, not encounter branch conditions',
      ));
    }
  }
  const leaked: string[] = [];
  privatePaths(caseDefinition.dialogue, 'dialogue', leaked);
  for (const leakedPath of leaked) {
    problems.push(problem(
      'tier3', relativePath, 'PRIVATE_FIELD_LEAK', leakedPath,
      'dialogue/public content contains a truth-family private field',
    ));
  }
  problems.push(...aiContractProblems(caseDefinition, relativePath));
  if (options.runOrder !== undefined) {
    problems.push(...acquisitionFrontierProblems(
      caseDefinition,
      relativePath,
      options.runOrder,
      rulesByClaim,
    ));
  }
  return problems;
}
