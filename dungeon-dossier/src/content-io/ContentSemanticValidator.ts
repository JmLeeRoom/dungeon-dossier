import type { CaseDefinition, Condition, EvidenceDefinition, ProofRule } from '../engine/domain';

export type SemanticValidationTier = 'tier2' | 'tier3';

export interface SemanticValidationProblem {
  readonly kind: SemanticValidationTier;
  readonly relativePath: string;
  readonly message: string;
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

export function validateCaseTier2AndTier3(
  caseDefinition: CaseDefinition,
  relativePath: string,
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
  return problems;
}
