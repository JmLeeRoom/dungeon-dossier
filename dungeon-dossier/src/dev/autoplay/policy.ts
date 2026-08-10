import type { AutoplaySubmission } from '../../app/autoplayPort';
import type {
  BalanceDefinition,
  CardsDefinition,
  CaseDefinition,
  EncounterDefinition,
  Facet,
} from '../../engine/domain';

type ObjectiveDefinition = EncounterDefinition['objectives']['required'][number];
type CardDefinition = CardsDefinition['cards'][number];

/**
 * One authored proof submission. Mirrors the SimulationProofPath rows that
 * tools/simulate/routeSimulator.ts derives into SIMULATION_CATALOG.proofPaths;
 * the derivation below is a pure port of that logic so the in-page driver and
 * the headless simulator replay identical BEST sequences.
 */
export interface ProofPathStep {
  readonly objectiveId: string;
  readonly objectiveType: ObjectiveDefinition['type'];
  /** False for turn/resource/integrity objectives that must not replay proof. */
  readonly requiresProof: boolean;
  readonly claimId: string;
  readonly proofRuleId: string;
  readonly direction: 'SUPPORT' | 'CONTRADICT';
  readonly cardId: string;
  readonly facet: Facet;
  readonly evidenceIds: readonly string[];
  readonly resultingEpistemic: 'SUPPORTED' | 'REFUTED';
  readonly composureDelta: number;
}

function proofDirectionForObjective(
  objective: ObjectiveDefinition,
): 'SUPPORT' | 'CONTRADICT' | undefined {
  if (objective.type === 'CONFIRM_CLAIM') return 'SUPPORT';
  if (objective.type === 'REFUTE_CLAIM') return 'CONTRADICT';
  if (objective.type === 'RESOLVE_CLAIM') return undefined;
  throw new Error(
    `Required objective ${objective.objective_id} cannot be replayed through a Claim proof path.`,
  );
}

function proofPathForObjective(
  definition: CaseDefinition,
  objective: ObjectiveDefinition,
  catalog: CardsDefinition,
  balance: BalanceDefinition,
): ProofPathStep {
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
  const card = catalog.cards.find((candidate: CardDefinition) => {
    const minimum = candidate.target.min_evidence ?? 0;
    const maximum = candidate.target.max_evidence ?? Number.POSITIVE_INFINITY;
    return (
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
    claim.initial.commitment === 'COMMITTED' ? balance.committedMultiplier : 1;
  return {
    objectiveId: objective.objective_id,
    objectiveType: objective.type,
    requiresProof: true,
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
        ? -balance.dmg.contradict * committedMultiplier
        : 0,
  };
}

function verificationProofPathForObjective(
  definition: CaseDefinition,
  encounter: EncounterDefinition,
  objective: ObjectiveDefinition,
  catalog: CardsDefinition,
  balance: BalanceDefinition,
): ProofPathStep {
  if (
    objective.type === 'CONFIRM_CLAIM' ||
    objective.type === 'REFUTE_CLAIM' ||
    objective.type === 'RESOLVE_CLAIM'
  ) {
    return proofPathForObjective(definition, objective, catalog, balance);
  }
  const contradictionObjective =
    encounter.objectives.required.find(
      (candidate) => candidate.type === 'REFUTE_CLAIM',
    );
  if (contradictionObjective === undefined) {
    throw new Error(
      `Encounter ${encounter.encounter_id} needs a REFUTE_CLAIM audit path for ${objective.objective_id}.`,
    );
  }
  const path = proofPathForObjective(definition, contradictionObjective, catalog, balance);
  return {
    ...path,
    objectiveId: objective.objective_id,
    objectiveType: objective.type,
    requiresProof: false,
  };
}

/**
 * Verification proof paths for one encounter, one per required objective and
 * in authored objective order — the exact rows routeSimulator publishes as
 * SIMULATION_CATALOG[archetype].proofPaths.
 */
export function deriveProofPaths(
  definition: CaseDefinition,
  encounterId: string,
  catalog: CardsDefinition,
  balance: BalanceDefinition,
): readonly ProofPathStep[] {
  const encounter = definition.encounters.find(
    (candidate) => candidate.encounter_id === encounterId,
  );
  if (encounter === undefined) {
    throw new Error(`Case ${definition.case_id} has no encounter ${encounterId}.`);
  }
  return encounter.objectives.required.map((objective) =>
    verificationProofPathForObjective(definition, encounter, objective, catalog, balance),
  );
}

export type BestAction =
  | Readonly<{
      kind: 'SUBMIT';
      submission: AutoplaySubmission;
      advancesProofPath?: boolean;
    }>
  | Readonly<{ kind: 'SECURE' }>
  | Readonly<{ kind: 'BLOCKED'; reason: string }>;

function pathSubmission(path: ProofPathStep): AutoplaySubmission {
  return {
    cardId: path.cardId,
    facet: path.facet,
    evidenceIds: [...path.evidenceIds],
  };
}

/**
 * Live BEST step selection: replay authored paths in order, then hold the
 * damage path until the sweet-spot secure window opens. Secure is only taken
 * after every verification path has been replayed, matching the simulator.
 */
export function planBestAction(
  paths: readonly ProofPathStep[],
  submittedCount: number,
  secureStatementEnabled: boolean,
): BestAction {
  const next = paths[submittedCount];
  if (next !== undefined) {
    return { kind: 'SUBMIT', submission: pathSubmission(next) };
  }
  if (secureStatementEnabled) return { kind: 'SECURE' };
  const damagePath = paths.find((path) => path.composureDelta < 0);
  if (damagePath === undefined) {
    return {
      kind: 'BLOCKED',
      reason: 'proof paths exhausted with no damage path and no secure window',
    };
  }
  return { kind: 'SUBMIT', submission: pathSubmission(damagePath) };
}

export function chooseEventChoice(
  eventId: string,
  choiceIds: readonly string[],
): string | undefined {
  return choiceIds[0];
}

/**
 * The node-14 regression guard. The canvass allows fewer attempts than it has
 * topics, and this topic is the only writer of F-12, so a BEST run must always
 * spend an attempt on it — by id, never by index.
 */
export const BROKER_CANVASS_EVENT_ID = 'event_ep004_broker_canvass';
export const BROKER_ROUTE_TOPIC_ID = 'topic_ep004_broker_route';

export function chooseCanvassTopic(
  eventId: string,
  topicIds: readonly string[],
  canvassedTopicIds: readonly string[],
): string | undefined {
  const remaining = topicIds.filter((topicId) => !canvassedTopicIds.includes(topicId));
  if (eventId === BROKER_CANVASS_EVENT_ID && remaining.includes(BROKER_ROUTE_TOPIC_ID)) {
    return BROKER_ROUTE_TOPIC_ID;
  }
  return remaining[0];
}

/**
 * A BEST run spends its retries: returning to the strip would abandon the node
 * and drop the run to a worse ending. Retry only when the screen still offers it.
 */
export const DEAD_SCENE_RETRY_ACTION_ID = 'RETRY';
export const DEAD_SCENE_RETURN_ACTION_ID = 'RETURN';

export function chooseDeadSceneAction(
  actionIds: readonly string[],
): string | undefined {
  if (actionIds.includes(DEAD_SCENE_RETRY_ACTION_ID)) return DEAD_SCENE_RETRY_ACTION_ID;
  return actionIds.find((actionId) => actionId === DEAD_SCENE_RETURN_ACTION_ID)
    ?? actionIds[0];
}

/** Prefer a reward the run has not claimed yet (BLK-1 detection, not avoidance). */
export function chooseReward(
  rewardIds: readonly string[],
  claimedRewardIds: readonly string[],
): string | undefined {
  return (
    rewardIds.find((rewardId) => !claimedRewardIds.includes(rewardId)) ??
    rewardIds[0]
  );
}

export interface LegalHandCard {
  readonly cardId: string;
  readonly instanceId?: string;
  readonly cpCost: number;
  readonly requiresEvidence: boolean;
  readonly intent: string;
  /** False when a card lock, action lock, or effective CP cost blocks it. */
  readonly playable?: boolean;
}

/** Everything a live scene legally allows the player to submit right now. */
export interface LegalSubmissionContext {
  readonly handCards: readonly LegalHandCard[];
  readonly commandPoints: number;
  readonly facets: readonly AutoplaySubmission['facet'][];
  readonly evidenceIds: readonly string[];
}

export interface RequiredObjectiveStatus {
  readonly objectiveId: string;
  readonly completed: boolean;
}

function playableCards(context: LegalSubmissionContext): readonly LegalHandCard[] {
  return context.handCards.filter(
    (card) =>
      card.playable !== false &&
      card.cpCost <= context.commandPoints &&
      (!card.requiresEvidence || context.evidenceIds.length > 0),
  );
}

function submissionFor(
  context: LegalSubmissionContext,
  card: LegalHandCard | undefined,
  facet: AutoplaySubmission['facet'] | undefined,
): AutoplaySubmission | undefined {
  if (card === undefined || facet === undefined) return undefined;
  return {
    cardId: card.cardId,
    ...(card.instanceId === undefined ? {} : { instanceId: card.instanceId }),
    facet,
    evidenceIds: card.requiresEvidence ? context.evidenceIds.slice(0, 1) : [],
  };
}

const BEST_FILLER_INTENT_PRIORITY = [
  'RECOVER',
  'FORENSIC',
  'SPECIAL',
  'CLARIFY',
  'QUERY',
] as const;

/**
 * BEST may need to cycle the deck while an authored proof card is in the draw
 * or discard pile. Never use evidence actions, PRESSURE, or COMMIT as filler:
 * they can undo a completed objective, cross the composure floor, or increase
 * the multiplier of the next contradiction. RECOVER is deliberately first
 * because it consumes/draws without changing a claim or composure.
 */
export function bestFillerSubmission(
  context: LegalSubmissionContext,
): AutoplaySubmission | undefined {
  const playable = playableCards(context);
  const card = BEST_FILLER_INTENT_PRIORITY
    .map((intent) => playable.find((candidate) => candidate.intent === intent))
    .find((candidate) => candidate !== undefined);
  return submissionFor(context, card, context.facets[0]);
}

/** The first proof path whose authored required objective is not true now. */
export function nextIncompleteProofPathIndex(
  paths: readonly ProofPathStep[],
  objectives: readonly RequiredObjectiveStatus[],
): number {
  const completion = new Map(
    objectives.map((objective) => [objective.objectiveId, objective.completed] as const),
  );
  const index = paths.findIndex(
    (path) => path.requiresProof && completion.get(path.objectiveId) !== true,
  );
  return index < 0 ? paths.length : index;
}

/** True when BEST must advance a turn without applying another proof effect. */
export function hasIncompleteNonProofObjective(
  paths: readonly ProofPathStep[],
  objectives: readonly RequiredObjectiveStatus[],
): boolean {
  const completion = new Map(
    objectives.map((objective) => [objective.objectiveId, objective.completed] as const),
  );
  return paths.some(
    (path) => !path.requiresProof && completion.get(path.objectiveId) !== true,
  );
}

function compatibleProofSubmission(
  path: ProofPathStep,
  context: LegalSubmissionContext,
  catalog: CardsDefinition,
): AutoplaySubmission | undefined {
  if (
    !context.facets.includes(path.facet) ||
    path.evidenceIds.some((evidenceId) => !context.evidenceIds.includes(evidenceId))
  ) {
    return undefined;
  }
  const expectedIntent = path.direction === 'SUPPORT' ? 'CONFIRM' : 'CONTRADICT';
  const playable = playableCards(context);
  const candidates = [
    ...playable.filter((card) => card.cardId === path.cardId),
    ...playable.filter((card) => card.cardId !== path.cardId),
  ];
  const card = candidates.find((handCard) => {
    const definition = catalog.cards.find(
      (candidate) => candidate.card_id === handCard.cardId,
    );
    if (
      definition === undefined ||
      definition.intent !== expectedIntent ||
      definition.target.kind !== 'CLAIM'
    ) {
      return false;
    }
    const minimum = definition.target.min_evidence ?? 0;
    const maximum = definition.target.max_evidence ?? Number.POSITIVE_INFINITY;
    return (
      path.evidenceIds.length >= minimum &&
      path.evidenceIds.length <= maximum &&
      (definition.target.facets === undefined ||
        definition.target.facets.includes(path.facet))
    );
  });
  if (card === undefined) return undefined;
  return {
    cardId: card.cardId,
    ...(card.instanceId === undefined ? {} : { instanceId: card.instanceId }),
    facet: path.facet,
    evidenceIds: [...path.evidenceIds],
  };
}

/**
 * Plans against the live hand. A compatible replacement card may satisfy the
 * authored proof step; otherwise a legal filler advances the turn without
 * consuming that step, so the driver retries it after the next draw.
 */
export function planBestLiveAction(
  paths: readonly ProofPathStep[],
  submittedCount: number,
  secureStatementEnabled: boolean,
  context: LegalSubmissionContext,
  catalog: CardsDefinition,
): BestAction {
  const next = paths[submittedCount];
  if (next !== undefined) {
    const proof = compatibleProofSubmission(next, context, catalog);
    if (proof !== undefined) {
      return { kind: 'SUBMIT', submission: proof, advancesProofPath: true };
    }
    const filler = bestFillerSubmission(context);
    return filler === undefined
      ? { kind: 'BLOCKED', reason: 'no playable live-hand card while awaiting proof card' }
      : { kind: 'SUBMIT', submission: filler, advancesProofPath: false };
  }
  if (secureStatementEnabled) return { kind: 'SECURE' };
  const damagePath = paths.find((path) => path.composureDelta < 0);
  if (damagePath === undefined) {
    return {
      kind: 'BLOCKED',
      reason: 'proof paths exhausted with no damage path and no secure window',
    };
  }
  const damage = compatibleProofSubmission(damagePath, context, catalog);
  if (damage !== undefined) {
    return { kind: 'SUBMIT', submission: damage, advancesProofPath: false };
  }
  const filler = bestFillerSubmission(context);
  return filler === undefined
    ? { kind: 'BLOCKED', reason: 'no playable live-hand card while awaiting damage card' }
    : { kind: 'SUBMIT', submission: filler, advancesProofPath: false };
}

/** Deterministic first-legal submission. */
export function greedySubmission(
  context: LegalSubmissionContext,
): AutoplaySubmission | undefined {
  return submissionFor(context, playableCards(context)[0], context.facets[0]);
}

/** Best-effort PARTIAL: burn turns on non-proof intents where possible. */
export function partialSubmission(
  context: LegalSubmissionContext,
): AutoplaySubmission | undefined {
  const playable = playableCards(context);
  const passive = playable.find(
    (card) => card.intent !== 'CONFIRM' && card.intent !== 'CONTRADICT',
  );
  return submissionFor(context, passive ?? playable[0], context.facets[0]);
}

/** Best-effort COERCED: prefer pressure, then contradiction with thin evidence. */
export function coercedSubmission(
  context: LegalSubmissionContext,
): AutoplaySubmission | undefined {
  const playable = playableCards(context);
  const pressure = playable.find((card) => card.intent === 'PRESSURE');
  const contradict = playable.find((card) => card.intent === 'CONTRADICT');
  return submissionFor(context, pressure ?? contradict ?? playable[0], context.facets[0]);
}

/**
 * Deterministic seeded stream (mulberry32). One instance drives a whole fuzz
 * run so a fixed seed always replays the same wrong-but-legal sequence.
 */
export function createFuzzRng(seed: number): () => number {
  let state = seed >>> 0;
  return (): number => {
    state = (state + 0x6d2b79f5) >>> 0;
    let mixed = state;
    mixed = Math.imul(mixed ^ (mixed >>> 15), mixed | 1);
    mixed ^= mixed + Math.imul(mixed ^ (mixed >>> 7), mixed | 61);
    return ((mixed ^ (mixed >>> 14)) >>> 0) / 4294967296;
  };
}

function pickIndex(rng: () => number, length: number): number {
  return Math.min(length - 1, Math.floor(rng() * length));
}

/** Seeded wrong-but-legal submission: random card, facet, and evidence mix. */
export function fuzzSubmission(
  context: LegalSubmissionContext,
  rng: () => number,
): AutoplaySubmission | undefined {
  const playable = playableCards(context);
  if (playable.length === 0 || context.facets.length === 0) return undefined;
  const card = playable[pickIndex(rng, playable.length)];
  const facet = context.facets[pickIndex(rng, context.facets.length)];
  if (card === undefined || facet === undefined) return undefined;
  const pool = [...context.evidenceIds];
  const wanted = card.requiresEvidence
    ? 1 + Math.floor(rng() * Math.min(2, pool.length))
    : (pool.length > 0 && rng() < 0.5 ? 1 : 0);
  const evidenceIds: string[] = [];
  while (evidenceIds.length < wanted && pool.length > 0) {
    evidenceIds.push(...pool.splice(pickIndex(rng, pool.length), 1));
  }
  return {
    cardId: card.cardId,
    ...(card.instanceId === undefined ? {} : { instanceId: card.instanceId }),
    facet,
    evidenceIds,
  };
}
