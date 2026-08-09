import type {
  ActionIntent,
  CommitmentState,
  Condition,
  ContentId,
  EncounterDefinition,
  EpistemicState,
  Facet,
  PresentationState,
} from '../domain';
import { shuffleWithState, type RngState } from '../rng/seededRng';
import type { IntegrityState } from '../resolution/types';

export interface ModifierEffect<TPayload = unknown> {
  readonly type: string;
  readonly payload: TPayload;
}

/** The sole encounter-modifier transition boundary. */
export function applyModifierEffects<TState, TPayload>(
  state: TState,
  effects: readonly ModifierEffect<TPayload>[],
  reduceEffect: (current: TState, effect: ModifierEffect<TPayload>) => TState,
): TState {
  let nextState = state;
  for (const effect of effects) {
    nextState = reduceEffect(nextState, effect);
  }
  return nextState;
}

export const MODIFIER_TRIGGERS = [
  'ON_ENCOUNTER_START',
  'ON_TURN_START_PRE_DRAW',
  'ON_TURN_START',
  'ON_HAND_READY',
  'ON_ACTION_SELECTED',
  'ON_ACTION_SUBMITTED',
  'ON_RESOLUTION',
  'ON_CLAIM_REVEALED',
  'ON_CLAIM_CONFIRMED',
  'ON_DIRECT_CONTRADICTION',
  'ON_COMPOSURE_THRESHOLD',
  'ON_EVIDENCE_USED',
  'ON_TURN_END',
] as const;
export type ModifierTrigger = (typeof MODIFIER_TRIGGERS)[number];

export const MODIFIER_EFFECT_TYPES = [
  'DISTORT_CLAIM_VIEW',
  'DUPLICATE_CLAIM_VIEW',
  'RESTORE_CLAIM_VIEW',
  'LOCK_CLAIM',
  'LOCK_ACTION',
  'ALTER_ACTION_COST',
  'DAMAGE_EVIDENCE',
  'REMOVE_EVIDENCE',
  'REDUCE_CP',
  'ADD_TIMER',
  'INCREASE_RESISTANCE',
  'DRAW_CARD',
  'DISCARD_CARD',
  'APPLY_STRESS',
  'APPLY_COERCION',
  'CHANGE_PHASE',
  'SPAWN_STATEMENT',
  'UNLOCK_EVIDENCE_SLOT',
  'LOCK_CARD',
  'SEAL_EVIDENCE',
  'TRIGGER_QTE',
] as const;
export type EncounterModifierEffectType =
  (typeof MODIFIER_EFFECT_TYPES)[number];

export const MODIFIER_CONDITION_TYPES = [
  'ALWAYS',
  'CLAIM_VISIBLE',
  'CLAIM_COMMITMENT',
  'CLAIM_EPISTEMIC',
  'EVIDENCE_OWNED',
  'EVIDENCE_INTACT',
  'ROUTE_USED',
  'RESOURCE_RANGE',
  'PHASE_IS',
  'TURN_RANGE',
  'OBJECTIVE_DONE',
  'FLAG_EQUALS',
  'OUTCOME_IS',
  'ALL_REQUIRED_OBJECTIVES',
  'SOME_REQUIRED_OBJECTIVES',
  'RESOURCE_EXCEEDS',
  'TURN_EXCEEDED',
  'NO_SOLVABLE_PATH',
  'ALL_OF',
  'ANY_OF',
  'NOT',
] as const;
export type ModifierConditionType =
  (typeof MODIFIER_CONDITION_TYPES)[number];

export const MODIFIER_TARGET_SELECTIONS = [
  'DETERMINISTIC_BY_INDEX',
  'HIGHEST_RESISTANCE',
  'MOST_RECENT',
  'SEEDED_RANDOM',
] as const;
export type ModifierTargetSelection =
  (typeof MODIFIER_TARGET_SELECTIONS)[number];

export type EncounterModifier = EncounterDefinition['modifiers'][number];
export type EncounterModifierEffect = EncounterModifier['effect'];
export type ModifierTargetSelector = NonNullable<
  EncounterModifierEffect['target_selector']
>;

export interface ModifierRuntimeClaim {
  readonly commitment: CommitmentState;
  readonly epistemic: EpistemicState;
  readonly presentation: PresentationState;
  readonly resistance: number;
  readonly facet?: Facet;
  readonly revealedAt?: number;
  readonly lockedUntilTurn?: number;
}

export interface ModifierRuntimeEvidence {
  readonly integrity: IntegrityState;
  readonly acquired?: boolean;
  readonly acquiredAt?: number;
  readonly sealedUntilTurn?: number;
}

export interface ModifierRuntimeCard {
  readonly upgraded?: boolean;
  readonly drawnAt?: number;
  readonly lockedUntilTurn?: number;
}

export interface QueuedModifierQte {
  readonly qteId: ContentId;
  readonly onSuccess: unknown;
  readonly onFail: unknown;
}

/**
 * Mutable-by-modifier fields are allow-listed here. TruthGraph, canonical
 * meanings, statement history and resolution internals are intentionally not
 * represented. Extra caller fields are preserved by all generic reducers.
 */
export interface ModifierRuntimeState {
  readonly turn: number;
  readonly claims: Readonly<Record<string, ModifierRuntimeClaim>>;
  readonly evidence: Readonly<Record<string, ModifierRuntimeEvidence>>;
  readonly cards: Readonly<Record<string, ModifierRuntimeCard>>;
  readonly resources: Readonly<Record<string, number>>;
  readonly revealedClaimIds?: readonly ContentId[];
  readonly evidenceOrder?: readonly ContentId[];
  readonly hand?: readonly ContentId[];
  readonly drawPile?: readonly ContentId[];
  readonly discardPile?: readonly ContentId[];
  readonly phaseId?: ContentId;
  readonly outcome?: string;
  readonly flags?: Readonly<Record<string, unknown>>;
  readonly usedRouteIds?: readonly ContentId[];
  readonly completedObjectiveIds?: readonly ContentId[];
  readonly requiredObjectiveIds?: readonly ContentId[];
  readonly resourceMaximums?: Readonly<Record<string, number>>;
  readonly activeModifierIds?: readonly ContentId[];
  readonly modifierActivations?: Readonly<Record<string, number>>;
  readonly actionLocks?: Readonly<Partial<Record<ActionIntent, number>>>;
  readonly actionCostDeltas?: Readonly<Partial<Record<ActionIntent, number>>>;
  readonly timerTurns?: number;
  readonly queuedQtes?: readonly QueuedModifierQte[];
  readonly spawnedStatementIds?: readonly ContentId[];
  readonly unlockedEvidenceSlotIds?: readonly ContentId[];
}

export interface ModifierConditionOptions<
  TState extends ModifierRuntimeState = ModifierRuntimeState,
> {
  readonly hasSolvablePath?: (state: TState) => boolean;
}

export interface ApplyModifierOptions<
  TState extends ModifierRuntimeState = ModifierRuntimeState,
> extends ModifierConditionOptions<TState> {
  readonly rngState?: RngState;
}

export interface ModifierEffectApplicationResult<
  TState extends ModifierRuntimeState,
> {
  readonly state: TState;
  readonly targetIds: readonly ContentId[];
  readonly applied: boolean;
  readonly rngState?: RngState;
  readonly blockedReason?: 'NO_SOLVABLE_PATH';
}

export interface BlockedModifierEffect {
  readonly modifierId: ContentId;
  readonly effectType: EncounterModifierEffectType;
  readonly reason: 'NO_SOLVABLE_PATH';
}

export interface TriggeredModifierResult<TState extends ModifierRuntimeState> {
  readonly state: TState;
  readonly appliedModifierIds: readonly ContentId[];
  readonly blockedEffects: readonly BlockedModifierEffect[];
  readonly rngState?: RngState;
}

export interface SelectedModifierTargets {
  readonly targetIds: readonly ContentId[];
  readonly rngState?: RngState;
}

type ModifierTargetKind = 'CLAIM' | 'EVIDENCE' | 'CARD';

const CLAIM_EFFECTS = new Set<EncounterModifierEffectType>([
  'DISTORT_CLAIM_VIEW',
  'DUPLICATE_CLAIM_VIEW',
  'RESTORE_CLAIM_VIEW',
  'LOCK_CLAIM',
  'INCREASE_RESISTANCE',
]);

const EVIDENCE_EFFECTS = new Set<EncounterModifierEffectType>([
  'DAMAGE_EVIDENCE',
  'REMOVE_EVIDENCE',
  'SEAL_EVIDENCE',
  'UNLOCK_EVIDENCE_SLOT',
]);

const CARD_EFFECTS = new Set<EncounterModifierEffectType>([
  'LOCK_CARD',
  'DISCARD_CARD',
]);

const PRESENTATION_EFFECTS = new Set<EncounterModifierEffectType>([
  'DISTORT_CLAIM_VIEW',
  'DUPLICATE_CLAIM_VIEW',
  'RESTORE_CLAIM_VIEW',
  'LOCK_CLAIM',
]);

function isSettled(claim: ModifierRuntimeClaim): boolean {
  return claim.epistemic === 'SUPPORTED' || claim.epistemic === 'REFUTED';
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

function numericEffectValue(
  effect: EncounterModifierEffect,
  fallback: number,
): number {
  if (effect.delta !== undefined) return effect.delta;
  return typeof effect.value === 'number' ? effect.value : fallback;
}

function parameterString(
  effect: EncounterModifierEffect,
  ...keys: readonly string[]
): string | undefined {
  for (const key of keys) {
    const value = effect.parameters?.[key];
    if (typeof value === 'string') return value;
  }
  return undefined;
}

function valueIds(effect: EncounterModifierEffect): readonly ContentId[] {
  if (typeof effect.value === 'string') return [effect.value];
  if (
    Array.isArray(effect.value) &&
    effect.value.every((value) => typeof value === 'string')
  ) {
    return effect.value;
  }
  return [];
}

function nestedConditions(condition: Condition): readonly Condition[] {
  if (condition.conditions === undefined) {
    throw new Error(`Modifier condition ${condition.type} requires conditions.`);
  }
  return condition.conditions as unknown as readonly Condition[];
}

function nestedCondition(condition: Condition): Condition {
  if (condition.condition === undefined) {
    throw new Error('Modifier condition NOT requires condition.');
  }
  return condition.condition as unknown as Condition;
}

function conditionId(
  condition: Condition,
  field: 'claim_id' | 'evidence_id' | 'route_id' | 'objective_id' | 'flag_id',
): ContentId {
  const value = condition[field];
  if (value === undefined) {
    throw new Error(`Modifier condition ${condition.type} requires ${field}.`);
  }
  return value;
}

function conditionAxis<T extends string>(
  condition: Condition,
  explicit: T | undefined,
): T {
  const value = explicit ?? (condition.state as T | undefined);
  if (value === undefined) {
    throw new Error(`Modifier condition ${condition.type} requires state.`);
  }
  return value;
}

function sameJsonValue(left: unknown, right: unknown): boolean {
  if (Object.is(left, right)) return true;
  return JSON.stringify(left) === JSON.stringify(right);
}

export function evaluateModifierCondition<TState extends ModifierRuntimeState>(
  condition: Condition,
  state: TState,
  options: ModifierConditionOptions<TState> = {},
): boolean {
  switch (condition.type) {
    case 'ALWAYS':
      return true;
    case 'CLAIM_VISIBLE': {
      const claimId = conditionId(condition, 'claim_id');
      const claim = state.claims[claimId];
      if (claim === undefined) return false;
      return (
        state.revealedClaimIds?.includes(claimId) ??
        claim.presentation !== 'HIDDEN'
      );
    }
    case 'CLAIM_COMMITMENT': {
      const claimId = conditionId(condition, 'claim_id');
      return (
        state.claims[claimId]?.commitment ===
        conditionAxis(condition, condition.commitment)
      );
    }
    case 'CLAIM_EPISTEMIC': {
      const claimId = conditionId(condition, 'claim_id');
      return (
        state.claims[claimId]?.epistemic ===
        conditionAxis(condition, condition.epistemic)
      );
    }
    case 'EVIDENCE_OWNED':
      return state.evidence[conditionId(condition, 'evidence_id')]?.acquired === true;
    case 'EVIDENCE_INTACT':
      return (
        state.evidence[conditionId(condition, 'evidence_id')]?.integrity ===
        'INTACT'
      );
    case 'ROUTE_USED':
      return state.usedRouteIds?.includes(conditionId(condition, 'route_id')) ?? false;
    case 'RESOURCE_RANGE': {
      if (condition.resource === undefined) {
        throw new Error('Modifier condition RESOURCE_RANGE requires resource.');
      }
      const value = state.resources[condition.resource] ?? 0;
      const maximum = state.resourceMaximums?.[condition.resource];
      const ratio = maximum === undefined || maximum === 0 ? undefined : value / maximum;
      return (
        (condition.min === undefined || value >= condition.min) &&
        (condition.max === undefined || value <= condition.max) &&
        (condition.min_ratio === undefined ||
          (ratio !== undefined && ratio >= condition.min_ratio))
      );
    }
    case 'PHASE_IS':
      return condition.node_id !== undefined && state.phaseId === condition.node_id;
    case 'TURN_RANGE':
      return (
        (condition.min === undefined || state.turn >= condition.min) &&
        (condition.max === undefined || state.turn <= condition.max)
      );
    case 'OBJECTIVE_DONE':
      return (
        state.completedObjectiveIds?.includes(
          conditionId(condition, 'objective_id'),
        ) ?? false
      );
    case 'FLAG_EQUALS':
      return sameJsonValue(
        state.flags?.[conditionId(condition, 'flag_id')],
        condition.value,
      );
    case 'OUTCOME_IS':
      return condition.outcome !== undefined && state.outcome === condition.outcome;
    case 'ALL_REQUIRED_OBJECTIVES':
      return (state.requiredObjectiveIds ?? []).every((objectiveId) =>
        state.completedObjectiveIds?.includes(objectiveId),
      );
    case 'SOME_REQUIRED_OBJECTIVES':
      return (state.requiredObjectiveIds ?? []).some((objectiveId) =>
        state.completedObjectiveIds?.includes(objectiveId),
      );
    case 'RESOURCE_EXCEEDS': {
      if (condition.resource === undefined) {
        throw new Error('Modifier condition RESOURCE_EXCEEDS requires resource.');
      }
      const threshold =
        condition.max ??
        condition.min ??
        (typeof condition.value === 'number' ? condition.value : undefined);
      if (threshold === undefined) {
        throw new Error('Modifier condition RESOURCE_EXCEEDS requires a threshold.');
      }
      return (state.resources[condition.resource] ?? 0) > threshold;
    }
    case 'TURN_EXCEEDED': {
      const threshold =
        condition.max ??
        condition.min ??
        (typeof condition.value === 'number' ? condition.value : undefined);
      if (threshold === undefined) {
        throw new Error('Modifier condition TURN_EXCEEDED requires a threshold.');
      }
      return state.turn > threshold;
    }
    case 'NO_SOLVABLE_PATH':
      if (options.hasSolvablePath === undefined) {
        throw new Error('NO_SOLVABLE_PATH requires hasSolvablePath.');
      }
      return !options.hasSolvablePath(state);
    case 'ALL_OF':
      return nestedConditions(condition).every((nested) =>
        evaluateModifierCondition(nested, state, options),
      );
    case 'ANY_OF':
      return nestedConditions(condition).some((nested) =>
        evaluateModifierCondition(nested, state, options),
      );
    case 'NOT':
      return !evaluateModifierCondition(nestedCondition(condition), state, options);
  }
}

function targetKindForEffect(
  effectType: EncounterModifierEffectType,
): ModifierTargetKind | undefined {
  if (CLAIM_EFFECTS.has(effectType)) return 'CLAIM';
  if (EVIDENCE_EFFECTS.has(effectType)) return 'EVIDENCE';
  if (CARD_EFFECTS.has(effectType)) return 'CARD';
  return undefined;
}

function orderedClaimIds(state: ModifierRuntimeState): readonly ContentId[] {
  return appendUnique(state.revealedClaimIds ?? [], Object.keys(state.claims));
}

function orderedEvidenceIds(state: ModifierRuntimeState): readonly ContentId[] {
  return appendUnique(state.evidenceOrder ?? [], Object.keys(state.evidence));
}

function orderedCardIds(state: ModifierRuntimeState): readonly ContentId[] {
  return appendUnique(
    state.hand ?? [],
    appendUnique(state.drawPile ?? [], Object.keys(state.cards)),
  );
}

function filterTargetIds(
  kind: ModifierTargetKind,
  selector: ModifierTargetSelector,
  state: ModifierRuntimeState,
): readonly ContentId[] {
  const ordered =
    kind === 'CLAIM'
      ? orderedClaimIds(state)
      : kind === 'EVIDENCE'
        ? orderedEvidenceIds(state)
        : orderedCardIds(state);
  const explicitlyAllowed = selector.ids === undefined ? undefined : new Set(selector.ids);

  return ordered.filter((id) => {
    if (explicitlyAllowed !== undefined && !explicitlyAllowed.has(id)) return false;
    if (kind === 'CLAIM') {
      const claim = state.claims[id];
      if (claim === undefined) return false;
      if (
        selector.scope.includes('VISIBLE') &&
        !(state.revealedClaimIds?.includes(id) ?? claim.presentation !== 'HIDDEN')
      ) {
        return false;
      }
      if (selector.facet !== undefined && claim.facet !== selector.facet) return false;
      if (selector.exclude_states?.commitment?.includes(claim.commitment)) return false;
      if (selector.exclude_states?.epistemic?.includes(claim.epistemic)) return false;
      if (selector.exclude_states?.presentation?.includes(claim.presentation)) return false;
      return true;
    }
    if (kind === 'EVIDENCE') {
      const evidence = state.evidence[id];
      if (evidence === undefined) return false;
      if (
        (selector.scope.includes('OWNED') || selector.scope.includes('ACQUIRED')) &&
        evidence.acquired !== true
      ) {
        return false;
      }
      return true;
    }
    const card = state.cards[id];
    if (card === undefined) return false;
    return !selector.scope.includes('UPGRADED') || card.upgraded === true;
  });
}

/** Selects targets deterministically. Only SEEDED_RANDOM consumes RNG state. */
export function selectModifierTargets(
  kind: ModifierTargetKind,
  selector: ModifierTargetSelector,
  state: ModifierRuntimeState,
  rngState?: RngState,
): SelectedModifierTargets {
  const selection = selector.selection ?? 'DETERMINISTIC_BY_INDEX';
  if (!MODIFIER_TARGET_SELECTIONS.includes(selection)) {
    throw new Error(`Unsupported modifier target selection: ${selection}.`);
  }

  let candidates = [...filterTargetIds(kind, selector, state)];
  let nextRngState = rngState;
  if (selection === 'HIGHEST_RESISTANCE') {
    candidates.sort((left, right) => {
      const resistanceDelta =
        (state.claims[right]?.resistance ?? 0) -
        (state.claims[left]?.resistance ?? 0);
      return resistanceDelta === 0
        ? orderedClaimIds(state).indexOf(left) - orderedClaimIds(state).indexOf(right)
        : resistanceDelta;
    });
  } else if (selection === 'MOST_RECENT') {
    candidates.reverse();
  } else if (selection === 'SEEDED_RANDOM') {
    if (rngState === undefined) {
      throw new Error('SEEDED_RANDOM target selection requires an explicit RngState.');
    }
    const shuffled = shuffleWithState(candidates, rngState);
    candidates = [...shuffled.values];
    nextRngState = shuffled.state;
  }

  const targetIds = candidates.slice(0, selector.count ?? candidates.length);
  return {
    targetIds,
    ...(nextRngState === undefined ? {} : { rngState: nextRngState }),
  };
}

function assertConditionCatalog(condition: Condition): void {
  if (!MODIFIER_CONDITION_TYPES.includes(condition.type)) {
    throw new Error(`Unsupported modifier condition: ${condition.type}.`);
  }
  if (condition.type === 'ALL_OF' || condition.type === 'ANY_OF') {
    for (const nested of nestedConditions(condition)) assertConditionCatalog(nested);
  }
  if (condition.type === 'NOT') assertConditionCatalog(nestedCondition(condition));
}

export function assertModifierDefinition(modifier: EncounterModifier): void {
  if (!MODIFIER_TRIGGERS.includes(modifier.trigger)) {
    throw new Error(`Unsupported modifier trigger: ${modifier.trigger}.`);
  }
  if (
    !MODIFIER_EFFECT_TYPES.includes(
      modifier.effect.type as EncounterModifierEffectType,
    )
  ) {
    throw new Error(`Unsupported modifier effect: ${modifier.effect.type}.`);
  }
  if (modifier.condition !== undefined && modifier.condition !== null) {
    assertConditionCatalog(modifier.condition);
  }
  const effectType = modifier.effect.type as EncounterModifierEffectType;
  const selector = modifier.effect.target_selector;
  if (CLAIM_EFFECTS.has(effectType) && selector?.exclude_states === undefined) {
    throw new Error(
      `Modifier ${modifier.modifier_id} must exclude settled Claim states in target_selector.`,
    );
  }
  if (
    selector?.selection !== undefined &&
    !MODIFIER_TARGET_SELECTIONS.includes(selector.selection)
  ) {
    throw new Error(
      `Modifier ${modifier.modifier_id} has unsupported target randomness.`,
    );
  }
}

/** P0-4 semantic gate for the atomic five-card turn boundary. */
export function assertV2TurnBoundaryModifiers(
  modifiers: readonly EncounterModifier[],
): void {
  for (const modifier of modifiers) {
    assertModifierDefinition(modifier);
    const effectType = modifier.effect.type as EncounterModifierEffectType;
    const scope = modifier.effect.target_selector?.scope.toUpperCase();
    if (
      modifier.trigger === 'ON_TURN_START' ||
      modifier.trigger === 'ON_TURN_START_PRE_DRAW'
    ) {
      if (
        effectType === 'DRAW_CARD' ||
        effectType === 'DISCARD_CARD' ||
        effectType === 'LOCK_CARD' ||
        scope === 'HAND' ||
        scope === 'CARD'
      ) {
        throw new Error(
          `Modifier ${modifier.modifier_id} has a hand-dependent pre-draw effect.`,
        );
      }
    }
    if (modifier.trigger === 'ON_HAND_READY' && effectType !== 'LOCK_CARD') {
      throw new Error(
        `Modifier ${modifier.modifier_id} may only LOCK_CARD on ON_HAND_READY.`,
      );
    }
  }
}

function updateClaims<TState extends ModifierRuntimeState>(
  state: TState,
  targetIds: readonly ContentId[],
  update: (claim: ModifierRuntimeClaim) => ModifierRuntimeClaim,
): TState {
  let changed = false;
  const claims: Record<string, ModifierRuntimeClaim> = { ...state.claims };
  for (const claimId of targetIds) {
    const previous = claims[claimId];
    if (previous === undefined) continue;
    const next = update(previous);
    if (next !== previous) {
      claims[claimId] = next;
      changed = true;
    }
  }
  return changed ? { ...state, claims } : state;
}

function updateEvidence<TState extends ModifierRuntimeState>(
  state: TState,
  targetIds: readonly ContentId[],
  update: (evidence: ModifierRuntimeEvidence) => ModifierRuntimeEvidence,
): TState {
  let changed = false;
  const evidence: Record<string, ModifierRuntimeEvidence> = { ...state.evidence };
  for (const evidenceId of targetIds) {
    const previous = evidence[evidenceId];
    if (previous === undefined) continue;
    const next = update(previous);
    if (next !== previous) {
      evidence[evidenceId] = next;
      changed = true;
    }
  }
  return changed ? { ...state, evidence } : state;
}

function updateCards<TState extends ModifierRuntimeState>(
  state: TState,
  targetIds: readonly ContentId[],
  update: (card: ModifierRuntimeCard) => ModifierRuntimeCard,
): TState {
  let changed = false;
  const cards: Record<string, ModifierRuntimeCard> = { ...state.cards };
  for (const cardId of targetIds) {
    const previous = cards[cardId];
    if (previous === undefined) continue;
    const next = update(previous);
    if (next !== previous) {
      cards[cardId] = next;
      changed = true;
    }
  }
  return changed ? { ...state, cards } : state;
}

function updateResource<TState extends ModifierRuntimeState>(
  state: TState,
  resource: string,
  delta: number,
): TState {
  return {
    ...state,
    resources: {
      ...state.resources,
      [resource]: Math.max(0, (state.resources[resource] ?? 0) + delta),
    },
  };
}

function result<TState extends ModifierRuntimeState>(
  state: TState,
  targetIds: readonly ContentId[],
  applied: boolean,
  rngState: RngState | undefined,
  blockedReason?: 'NO_SOLVABLE_PATH',
): ModifierEffectApplicationResult<TState> {
  return {
    state,
    targetIds,
    applied,
    ...(rngState === undefined ? {} : { rngState }),
    ...(blockedReason === undefined ? {} : { blockedReason }),
  };
}

function applyPresentationEffect<TState extends ModifierRuntimeState>(
  state: TState,
  effectType: EncounterModifierEffectType,
  targetIds: readonly ContentId[],
  durationTurns: number,
): TState {
  const presentation: PresentationState =
    effectType === 'DISTORT_CLAIM_VIEW'
      ? 'DISTORTED'
      : effectType === 'DUPLICATE_CLAIM_VIEW'
        ? 'DUPLICATED'
        : effectType === 'LOCK_CLAIM'
          ? 'LOCKED'
          : 'NORMAL';
  return updateClaims(state, targetIds, (claim) => {
    // A settled deduction may be displayed, but an enemy gimmick cannot disturb it.
    if (isSettled(claim)) return claim;
    return {
      ...claim,
      presentation,
      ...(effectType === 'LOCK_CLAIM'
        ? { lockedUntilTurn: state.turn + durationTurns }
        : {}),
    };
  });
}

export function applyModifierEffect<TState extends ModifierRuntimeState>(
  state: TState,
  effect: EncounterModifierEffect,
  options: ApplyModifierOptions<TState> = {},
): ModifierEffectApplicationResult<TState> {
  if (
    !MODIFIER_EFFECT_TYPES.includes(effect.type as EncounterModifierEffectType)
  ) {
    throw new Error(`Unsupported modifier effect: ${effect.type}.`);
  }
  const effectType = effect.type as EncounterModifierEffectType;
  const kind = targetKindForEffect(effectType);
  const selected =
    kind === undefined || effect.target_selector === undefined
      ? {
          targetIds: [] as readonly ContentId[],
          ...(options.rngState === undefined ? {} : { rngState: options.rngState }),
        }
      : selectModifierTargets(
          kind,
          effect.target_selector,
          state,
          options.rngState,
        );
  let targetIds = selected.targetIds;
  const rngState = selected.rngState;
  const durationTurns = effect.duration_turns ?? 1;

  if (PRESENTATION_EFFECTS.has(effectType)) {
    const next = applyPresentationEffect(
      state,
      effectType,
      targetIds,
      durationTurns,
    );
    return result(next, targetIds, next !== state, rngState);
  }

  switch (effectType) {
    case 'INCREASE_RESISTANCE': {
      const amount = Math.abs(numericEffectValue(effect, 1));
      const next = updateClaims(state, targetIds, (claim) => ({
        ...claim,
        resistance: Math.max(0, claim.resistance + amount),
      }));
      return result(next, targetIds, next !== state, rngState);
    }
    case 'DAMAGE_EVIDENCE': {
      const next = updateEvidence(state, targetIds, (evidence) =>
        evidence.integrity === 'INTACT'
          ? { ...evidence, integrity: 'DEGRADED' }
          : evidence,
      );
      return result(next, targetIds, next !== state, rngState);
    }
    case 'REMOVE_EVIDENCE': {
      if (options.hasSolvablePath === undefined) {
        throw new Error('REMOVE_EVIDENCE requires hasSolvablePath safety checks.');
      }
      const before = options.hasSolvablePath(state);
      const candidate = updateEvidence(state, targetIds, (evidence) =>
        evidence.integrity === 'DESTROYED'
          ? evidence
          : { ...evidence, integrity: 'DESTROYED' },
      );
      const after = options.hasSolvablePath(candidate);
      if (before && !after) {
        return result(state, targetIds, false, rngState, 'NO_SOLVABLE_PATH');
      }
      return result(candidate, targetIds, candidate !== state, rngState);
    }
    case 'SEAL_EVIDENCE': {
      const next = updateEvidence(state, targetIds, (evidence) => ({
        ...evidence,
        sealedUntilTurn: Math.max(
          evidence.sealedUntilTurn ?? state.turn,
          state.turn + durationTurns,
        ),
      }));
      return result(next, targetIds, next !== state, rngState);
    }
    case 'UNLOCK_EVIDENCE_SLOT': {
      targetIds = targetIds.length === 0 ? valueIds(effect) : targetIds;
      const next = {
        ...state,
        unlockedEvidenceSlotIds: appendUnique(
          state.unlockedEvidenceSlotIds ?? [],
          targetIds,
        ),
      } as TState;
      return result(next, targetIds, targetIds.length > 0, rngState);
    }
    case 'LOCK_CARD': {
      const next = updateCards(state, targetIds, (card) => ({
        ...card,
        lockedUntilTurn: Math.max(
          card.lockedUntilTurn ?? state.turn,
          state.turn + durationTurns,
        ),
      }));
      return result(next, targetIds, next !== state, rngState);
    }
    case 'LOCK_ACTION': {
      if (effect.intent === undefined) {
        throw new Error('LOCK_ACTION requires intent.');
      }
      const next = {
        ...state,
        actionLocks: {
          ...state.actionLocks,
          [effect.intent]: Math.max(
            state.actionLocks?.[effect.intent] ?? state.turn,
            state.turn + durationTurns,
          ),
        },
      } as TState;
      return result(next, [], true, rngState);
    }
    case 'ALTER_ACTION_COST': {
      if (effect.intent === undefined) {
        throw new Error('ALTER_ACTION_COST requires intent.');
      }
      const delta = numericEffectValue(effect, 1);
      const next = {
        ...state,
        actionCostDeltas: {
          ...state.actionCostDeltas,
          [effect.intent]: (state.actionCostDeltas?.[effect.intent] ?? 0) + delta,
        },
      } as TState;
      return result(next, [], true, rngState);
    }
    case 'REDUCE_CP': {
      const resource =
        effect.resource ??
        (Object.hasOwn(state.resources, 'cp') ? 'cp' : 'commandPoints');
      const next = updateResource(
        state,
        resource,
        -Math.abs(numericEffectValue(effect, 1)),
      );
      return result(next, [], true, rngState);
    }
    case 'ADD_TIMER': {
      const amount = Math.abs(numericEffectValue(effect, durationTurns));
      const next = {
        ...state,
        timerTurns: Math.max(0, (state.timerTurns ?? 0) + amount),
      } as TState;
      return result(next, [], true, rngState);
    }
    case 'DRAW_CARD': {
      const count = Math.max(0, Math.trunc(Math.abs(numericEffectValue(effect, 1))));
      const drawPile = [...(state.drawPile ?? [])];
      const drawn = drawPile.splice(0, count);
      const next = {
        ...state,
        drawPile,
        hand: appendUnique(state.hand ?? [], drawn),
      } as TState;
      return result(next, drawn, drawn.length > 0, rngState);
    }
    case 'DISCARD_CARD': {
      if (targetIds.length === 0) {
        targetIds = (state.hand ?? []).slice(0, effect.target_selector?.count ?? 1);
      }
      const discarded = new Set(targetIds);
      const next = {
        ...state,
        hand: (state.hand ?? []).filter((cardId) => !discarded.has(cardId)),
        discardPile: appendUnique(state.discardPile ?? [], targetIds),
      } as TState;
      return result(next, targetIds, targetIds.length > 0, rngState);
    }
    case 'APPLY_STRESS': {
      const resource = effect.resource ?? 'stress';
      const next = updateResource(
        state,
        resource,
        -Math.abs(numericEffectValue(effect, 1)),
      );
      return result(next, [], true, rngState);
    }
    case 'APPLY_COERCION': {
      const resource = effect.resource ?? 'coercion';
      const next = updateResource(
        state,
        resource,
        Math.abs(numericEffectValue(effect, 1)),
      );
      return result(next, [], true, rngState);
    }
    case 'CHANGE_PHASE': {
      const phaseId =
        (typeof effect.value === 'string' ? effect.value : undefined) ??
        parameterString(effect, 'node_id', 'phase_id');
      if (phaseId === undefined) throw new Error('CHANGE_PHASE requires a phase id.');
      const next = { ...state, phaseId } as TState;
      return result(next, [], true, rngState);
    }
    case 'SPAWN_STATEMENT': {
      const statementIds = appendUnique(
        valueIds(effect),
        parameterString(effect, 'statement_id') === undefined
          ? []
          : [parameterString(effect, 'statement_id') as ContentId],
      );
      if (statementIds.length === 0) {
        throw new Error('SPAWN_STATEMENT requires a statement id.');
      }
      const next = {
        ...state,
        spawnedStatementIds: appendUnique(
          state.spawnedStatementIds ?? [],
          statementIds,
        ),
      } as TState;
      return result(next, statementIds, true, rngState);
    }
    case 'TRIGGER_QTE': {
      const qteId = parameterString(effect, 'qte_id');
      if (qteId === undefined) throw new Error('TRIGGER_QTE requires qte_id.');
      const next = {
        ...state,
        queuedQtes: [
          ...(state.queuedQtes ?? []),
          {
            qteId,
            onSuccess: effect.parameters?.on_success,
            onFail: effect.parameters?.on_fail,
          },
        ],
      } as TState;
      return result(next, [], true, rngState);
    }
    case 'DISTORT_CLAIM_VIEW':
    case 'DUPLICATE_CLAIM_VIEW':
    case 'RESTORE_CLAIM_VIEW':
    case 'LOCK_CLAIM':
      // Handled by the presentation branch above.
      return result(state, targetIds, false, rngState);
  }
}

export function applyTriggeredModifiers<TState extends ModifierRuntimeState>(
  state: TState,
  modifiers: readonly EncounterModifier[],
  trigger: ModifierTrigger,
  options: ApplyModifierOptions<TState> = {},
): TriggeredModifierResult<TState> {
  if (!MODIFIER_TRIGGERS.includes(trigger)) {
    throw new Error(`Unsupported modifier trigger: ${trigger}.`);
  }

  const ordered = modifiers
    .map((modifier, index) => ({ modifier, index }))
    .sort(
      (left, right) =>
        right.modifier.priority - left.modifier.priority || left.index - right.index,
    );
  let current = state;
  let rngState = options.rngState;
  const appliedModifierIds: ContentId[] = [];
  const blockedEffects: BlockedModifierEffect[] = [];

  for (const { modifier } of ordered) {
    assertModifierDefinition(modifier);
    if (modifier.trigger !== trigger) continue;
    if (
      current.activeModifierIds !== undefined &&
      !current.activeModifierIds.includes(modifier.modifier_id)
    ) {
      continue;
    }
    const activations = current.modifierActivations?.[modifier.modifier_id] ?? 0;
    if (activations >= modifier.activation_limit) continue;
    if (
      modifier.condition !== undefined &&
      modifier.condition !== null &&
      !evaluateModifierCondition(modifier.condition, current, options)
    ) {
      continue;
    }

    const application = applyModifierEffect(current, modifier.effect, {
      ...options,
      ...(rngState === undefined ? {} : { rngState }),
    });
    rngState = application.rngState;
    if (application.blockedReason !== undefined) {
      blockedEffects.push({
        modifierId: modifier.modifier_id,
        effectType: modifier.effect.type as EncounterModifierEffectType,
        reason: application.blockedReason,
      });
      continue;
    }
    if (!application.applied) continue;

    current = {
      ...application.state,
      modifierActivations: {
        ...application.state.modifierActivations,
        [modifier.modifier_id]: activations + 1,
      },
    };
    appliedModifierIds.push(modifier.modifier_id);
  }

  return {
    state: current,
    appliedModifierIds,
    blockedEffects,
    ...(rngState === undefined ? {} : { rngState }),
  };
}
