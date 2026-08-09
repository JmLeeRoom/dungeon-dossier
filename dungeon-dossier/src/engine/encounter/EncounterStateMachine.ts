import type { ContentId, ProofScope } from '../domain';

export const ENCOUNTER_STATES = [
  'ENCOUNTER_INIT',
  'LOAD_CASE',
  'VALIDATE',
  'BUILD_TRUTH',
  'INIT_KNOWLEDGE',
  'ENTER_FLOW_NODE',
  'RENDER_STATEMENT',
  'EMIT_PUBLIC_DTO',
  'TURN_START',
  'FREE_REVIEW',
  'BUILD_ARGUMENT',
  'SUBMIT_ACTION',
  'RESOLVE',
  'APPLY_EFFECTS',
  'RENDER_REACTION',
  'RUN_MODIFIERS',
  'SETTLE_TURN',
  'CHECK_FLOW_TRANSITION',
  'CHECK_OBJECTIVES',
  'CHECK_OUTCOME',
  'AWAIT_SECURE_DECISION',
  'PRESENT_PENDING_FLOW',
  'ENCOUNTER_COMPLETE',
  'FAILED',
] as const;
export type EncounterState = (typeof ENCOUNTER_STATES)[number];

export const ENCOUNTER_EVENTS = [
  'START',
  'CONTENT_LOADED',
  'CONTENT_LOADED_TRUSTED',
  'VALIDATION_PASSED',
  'TRUTH_BUILT',
  'KNOWLEDGE_INITIALIZED',
  'FLOW_NODE_ENTERED',
  'STATEMENT_RENDERED',
  'DTO_EMITTED',
  'TURN_READY',
  'BEGIN_ARGUMENT',
  'ARGUMENT_BUILT',
  'ACTION_SUBMITTED',
  'RESOLUTION_READY',
  'EFFECTS_APPLIED',
  'REACTION_RENDERED',
  'MODIFIERS_APPLIED',
  'TURN_SETTLED',
  'STAY_IN_FLOW',
  'ENTER_NEXT_FLOW',
  'FLOW_LOGIC_COMMITTED',
  'NO_FLOW',
  'OBJECTIVES_CHECKED',
  'CONTINUE',
  'OFFER_SECURE',
  'CONTINUE_NO_FLOW',
  'CONTINUE_WITH_FLOW',
  'SECURE_STATEMENT',
  'DECLINE_NO_FLOW',
  'DECLINE_WITH_FLOW',
  'DECLINE_AND_COMPLETE',
  'FLOW_PRESENTATION_STARTED',
  'COMPLETE_ENCOUNTER',
  'FAIL_ENCOUNTER',
] as const;
export type EncounterEvent = (typeof ENCOUNTER_EVENTS)[number];

const LINEAR_TRANSITIONS: Readonly<
  Partial<Record<EncounterState, readonly [EncounterEvent, EncounterState]>>
> = {
  ENCOUNTER_INIT: ['START', 'LOAD_CASE'],
  LOAD_CASE: ['CONTENT_LOADED', 'VALIDATE'],
  VALIDATE: ['VALIDATION_PASSED', 'BUILD_TRUTH'],
  BUILD_TRUTH: ['TRUTH_BUILT', 'INIT_KNOWLEDGE'],
  INIT_KNOWLEDGE: ['KNOWLEDGE_INITIALIZED', 'ENTER_FLOW_NODE'],
  ENTER_FLOW_NODE: ['FLOW_NODE_ENTERED', 'RENDER_STATEMENT'],
  RENDER_STATEMENT: ['STATEMENT_RENDERED', 'EMIT_PUBLIC_DTO'],
  EMIT_PUBLIC_DTO: ['DTO_EMITTED', 'TURN_START'],
  TURN_START: ['TURN_READY', 'FREE_REVIEW'],
  FREE_REVIEW: ['BEGIN_ARGUMENT', 'BUILD_ARGUMENT'],
  BUILD_ARGUMENT: ['ARGUMENT_BUILT', 'SUBMIT_ACTION'],
  SUBMIT_ACTION: ['ACTION_SUBMITTED', 'RESOLVE'],
  RESOLVE: ['RESOLUTION_READY', 'APPLY_EFFECTS'],
  APPLY_EFFECTS: ['EFFECTS_APPLIED', 'RENDER_REACTION'],
  RENDER_REACTION: ['REACTION_RENDERED', 'RUN_MODIFIERS'],
  RUN_MODIFIERS: ['MODIFIERS_APPLIED', 'SETTLE_TURN'],
  SETTLE_TURN: ['TURN_SETTLED', 'CHECK_FLOW_TRANSITION'],
  CHECK_OBJECTIVES: ['OBJECTIVES_CHECKED', 'CHECK_OUTCOME'],
  PRESENT_PENDING_FLOW: ['FLOW_PRESENTATION_STARTED', 'RENDER_STATEMENT'],
};

/** Pure reducer: invalid transitions are explicit failures, never fallbacks. */
export function transitionEncounter(
  state: EncounterState,
  event: EncounterEvent,
): EncounterState {
  if (state === 'LOAD_CASE' && event === 'CONTENT_LOADED_TRUSTED') {
    return 'BUILD_TRUTH';
  }

  const linear = LINEAR_TRANSITIONS[state];
  if (linear?.[0] === event) return linear[1];

  if (state === 'CHECK_FLOW_TRANSITION') {
    // STAY_IN_FLOW / ENTER_NEXT_FLOW are the legacy pre-v2 flow events. The
    // P0-3B atomic Submit replaces them with a pure plan + logical commit
    // (FLOW_LOGIC_COMMITTED / NO_FLOW) and deletes the legacy pair.
    if (event === 'ENTER_NEXT_FLOW') return 'ENTER_FLOW_NODE';
    if (event === 'STAY_IN_FLOW') return 'CHECK_OBJECTIVES';
    if (event === 'FLOW_LOGIC_COMMITTED') return 'CHECK_OBJECTIVES';
    if (event === 'NO_FLOW') return 'CHECK_OBJECTIVES';
  }

  if (state === 'CHECK_OUTCOME') {
    // CONTINUE is the legacy endTurn() event; P0-3B removes it together with
    // the public endTurn() action in favor of the explicit CONTINUE_* pair.
    if (event === 'CONTINUE') return 'TURN_START';
    if (event === 'OFFER_SECURE') return 'AWAIT_SECURE_DECISION';
    if (event === 'CONTINUE_NO_FLOW') return 'TURN_START';
    if (event === 'CONTINUE_WITH_FLOW') return 'PRESENT_PENDING_FLOW';
    if (event === 'COMPLETE_ENCOUNTER') return 'ENCOUNTER_COMPLETE';
    if (event === 'FAIL_ENCOUNTER') return 'FAILED';
  }

  if (state === 'AWAIT_SECURE_DECISION') {
    if (event === 'SECURE_STATEMENT') return 'ENCOUNTER_COMPLETE';
    if (event === 'DECLINE_NO_FLOW') return 'TURN_START';
    if (event === 'DECLINE_WITH_FLOW') return 'PRESENT_PENDING_FLOW';
    if (event === 'DECLINE_AND_COMPLETE') return 'ENCOUNTER_COMPLETE';
  }

  if (state === 'TURN_START') {
    // ON_TURN_START_PRE_DRAW can create a terminal threshold fact, so the
    // machine must be able to finish an encounter from TURN_START directly.
    if (event === 'COMPLETE_ENCOUNTER') return 'ENCOUNTER_COMPLETE';
    if (event === 'FAIL_ENCOUNTER') return 'FAILED';
  }

  throw new Error(`Invalid encounter transition: ${state} + ${event}`);
}

export type ContentValidationMode = 'DEVELOPMENT' | 'TRUSTED_RELEASE';

export interface EncounterMachineSnapshot {
  readonly state: EncounterState;
  readonly transitionCount: number;
}

/**
 * Small deterministic driver around the pure reducer. In a trusted release,
 * content is pre-verified and LOAD_CASE skips the development-only VALIDATE
 * state. The class owns no game data and therefore cannot partially mutate it.
 */
export class EncounterStateMachine {
  readonly #validationMode: ContentValidationMode;
  #snapshot: EncounterMachineSnapshot = Object.freeze({
    state: 'ENCOUNTER_INIT',
    transitionCount: 0,
  });

  constructor(validationMode: ContentValidationMode = 'DEVELOPMENT') {
    this.#validationMode = validationMode;
  }

  get snapshot(): EncounterMachineSnapshot {
    return this.#snapshot;
  }

  /** Rollback-only: restores a snapshot captured before a failed submission. */
  restore(snapshot: EncounterMachineSnapshot): void {
    this.#snapshot = Object.freeze({
      state: snapshot.state,
      transitionCount: snapshot.transitionCount,
    });
  }

  dispatch(event: EncounterEvent): EncounterMachineSnapshot {
    const effectiveEvent =
      this.#snapshot.state === 'LOAD_CASE' &&
      event === 'CONTENT_LOADED' &&
      this.#validationMode === 'TRUSTED_RELEASE'
        ? 'CONTENT_LOADED_TRUSTED'
        : event;
    this.#snapshot = Object.freeze({
      state: transitionEncounter(this.#snapshot.state, effectiveEvent),
      transitionCount: this.#snapshot.transitionCount + 1,
    });
    return this.#snapshot;
  }

  review(snapshot: FreeReviewSnapshot): FreeReviewQueries {
    if (this.#snapshot.state !== 'FREE_REVIEW') {
      throw new Error('Dossier review queries are only available in FREE_REVIEW.');
    }
    return createFreeReviewQueries(snapshot);
  }
}

export const DESIGN_TURN_STEPS = [
  'STATEMENT',
  'TAG_REFRESH',
  'SHIELD',
  'DOSSIER_REVIEW',
  'CARD_SELECTION',
  'JUDGMENT',
  'ENEMY_RESPONSE',
  'END_CHECK',
] as const;
export type DesignTurnStep = (typeof DESIGN_TURN_STEPS)[number];

export const TURN_STATE_MAPPING: Readonly<
  Record<DesignTurnStep, readonly EncounterState[]>
> = Object.freeze({
  STATEMENT: Object.freeze([
    'ENTER_FLOW_NODE',
    'RENDER_STATEMENT',
    'PRESENT_PENDING_FLOW',
  ] as const),
  TAG_REFRESH: Object.freeze(['EMIT_PUBLIC_DTO'] as const),
  SHIELD: Object.freeze(['TURN_START'] as const),
  DOSSIER_REVIEW: Object.freeze(['FREE_REVIEW'] as const),
  CARD_SELECTION: Object.freeze(['BUILD_ARGUMENT', 'SUBMIT_ACTION'] as const),
  JUDGMENT: Object.freeze(['RESOLVE', 'APPLY_EFFECTS'] as const),
  ENEMY_RESPONSE: Object.freeze(['RENDER_REACTION', 'RUN_MODIFIERS'] as const),
  END_CHECK: Object.freeze([
    'SETTLE_TURN',
    'CHECK_FLOW_TRANSITION',
    'CHECK_OBJECTIVES',
    'CHECK_OUTCOME',
    'AWAIT_SECURE_DECISION',
  ] as const),
});

const TURN_IMPLEMENTATION_STATES = ENCOUNTER_STATES.slice(
  ENCOUNTER_STATES.indexOf('ENTER_FLOW_NODE'),
  ENCOUNTER_STATES.indexOf('ENCOUNTER_COMPLETE'),
);

/** M1 gate: the eight design terms must cover each implementation turn state once. */
export function assertEightStepTurnMapping(
  mapping: Readonly<Record<DesignTurnStep, readonly EncounterState[]>> =
    TURN_STATE_MAPPING,
): void {
  const mapped = DESIGN_TURN_STEPS.flatMap((step) => mapping[step]);
  if (mapped.length !== new Set(mapped).size) {
    throw new Error('The eight-step turn mapping contains a duplicate state.');
  }
  if (
    mapped.length !== TURN_IMPLEMENTATION_STATES.length ||
    TURN_IMPLEMENTATION_STATES.some((state) => !mapped.includes(state))
  ) {
    throw new Error('The eight-step turn mapping does not cover the full turn flow.');
  }
}

assertEightStepTurnMapping();

export interface FreeReviewEvidence {
  readonly evidenceId: ContentId;
  readonly displayName: string;
  readonly scopes: readonly ProofScope[];
  readonly notProvenKeys: readonly string[];
  readonly commandPointCost: number;
}

export interface FreeReviewHistoryEntry {
  readonly speakerId: ContentId;
  readonly body: string;
  readonly claimIds: readonly ContentId[];
}

export interface FreeReviewSnapshot {
  readonly evidence: readonly FreeReviewEvidence[];
  readonly history: readonly FreeReviewHistoryEntry[];
}

export interface FreeReviewQueries {
  listEvidence(): readonly FreeReviewEvidence[];
  findEvidence(evidenceId: ContentId): FreeReviewEvidence | undefined;
  listHistory(): readonly FreeReviewHistoryEntry[];
}

function freezeEvidence(item: FreeReviewEvidence): FreeReviewEvidence {
  return Object.freeze({
    evidenceId: item.evidenceId,
    displayName: item.displayName,
    scopes: Object.freeze([...item.scopes]),
    notProvenKeys: Object.freeze([...item.notProvenKeys]),
    commandPointCost: item.commandPointCost,
  });
}

function freezeHistory(item: FreeReviewHistoryEntry): FreeReviewHistoryEntry {
  return Object.freeze({
    speakerId: item.speakerId,
    body: item.body,
    claimIds: Object.freeze([...item.claimIds]),
  });
}

/**
 * FREE_REVIEW exposes an immutable, allow-listed snapshot. It deliberately has
 * no proof-set correctness or predicted-resolution field and no command method.
 */
export function createFreeReviewQueries(
  snapshot: FreeReviewSnapshot,
): FreeReviewQueries {
  const evidence = Object.freeze(snapshot.evidence.map(freezeEvidence));
  const history = Object.freeze(snapshot.history.map(freezeHistory));
  const byEvidenceId = new Map(evidence.map((item) => [item.evidenceId, item]));

  return Object.freeze({
    listEvidence: () => evidence,
    findEvidence: (evidenceId: ContentId) => byEvidenceId.get(evidenceId),
    listHistory: () => history,
  });
}
