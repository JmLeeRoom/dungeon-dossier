import type { Condition, Effect, FlagDefinition } from '../domain';

export type FlagValue = boolean | number | string;
export type FlagStore = Readonly<Record<string, FlagValue>>;

export type FlagConditionEvaluator = (
  condition: Condition,
  store: FlagStore,
) => boolean;

export interface FlagSetContext {
  readonly encounter?: string;
  readonly event?: string;
  readonly choice?: string;
  readonly outcome?: string;
  readonly evaluateCondition?: FlagConditionEvaluator;
}

export interface FlagConsumeContext {
  readonly encounter: string;
  readonly evaluateCondition?: FlagConditionEvaluator;
}

export interface AppliedFlagSet {
  readonly flag_id: string;
  readonly hook_index: number;
  readonly value: FlagValue;
}

export interface FlagSetResult {
  readonly store: FlagStore;
  readonly applied: readonly AppliedFlagSet[];
}

export interface ResolvedFlagEffect {
  readonly flag_id: string;
  readonly flag_value: FlagValue;
  readonly hook_index: number;
  readonly apply: Effect;
}

function assertFlagValue(value: unknown): asserts value is FlagValue {
  if (
    typeof value !== 'boolean' &&
    typeof value !== 'string' &&
    !(typeof value === 'number' && Number.isFinite(value))
  ) {
    throw new TypeError('Runtime flags support only boolean, finite number, or string values.');
  }
}

function defaultConditionEvaluator(condition: Condition, store: FlagStore): boolean {
  if (condition.type === 'ALWAYS') return true;
  if (condition.type === 'FLAG_EQUALS') {
    if (condition.flag_id === undefined || condition.value === undefined) {
      throw new Error('FLAG_EQUALS requires flag_id and value.');
    }
    return Object.is(store[condition.flag_id], condition.value);
  }
  throw new Error(
    `Flag hook condition ${condition.type} requires an injected condition evaluator.`,
  );
}

function conditionMatches(
  condition: Condition | undefined,
  store: FlagStore,
  evaluator: FlagConditionEvaluator | undefined,
): boolean {
  if (condition === undefined) return true;
  return (evaluator ?? defaultConditionEvaluator)(condition, store);
}

function selectorMatches(expected: string | undefined, actual: string | undefined): boolean {
  return expected === undefined || expected === actual;
}

export function createFlagStore(
  initial: Readonly<Record<string, FlagValue>> = {},
): FlagStore {
  for (const value of Object.values(initial)) assertFlagValue(value);
  return Object.freeze({ ...initial });
}

export function withFlag(store: FlagStore, key: string, value: FlagValue): FlagStore {
  if (key.trim().length === 0) throw new Error('Flag key must not be empty.');
  assertFlagValue(value);
  return Object.freeze({ ...store, [key]: value });
}

export function isFlagEnabled(store: FlagStore, key: string): boolean {
  const value = store[key];
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value !== 0;
  return value !== undefined && value.length > 0;
}

/** Applies only declarative set_by hooks; no flag ID is special-cased. */
export function applyFlagSetHooks(
  store: FlagStore,
  definitions: readonly FlagDefinition[],
  context: FlagSetContext,
): FlagSetResult {
  let next = store;
  const applied: AppliedFlagSet[] = [];

  for (const definition of definitions) {
    definition.set_by.forEach((hook, hookIndex) => {
      if (
        !selectorMatches(hook.encounter, context.encounter) ||
        !selectorMatches(hook.event, context.event) ||
        !selectorMatches(hook.choice, context.choice) ||
        !selectorMatches(hook.outcome, context.outcome) ||
        !conditionMatches(hook.condition, next, context.evaluateCondition)
      ) {
        return;
      }

      const value = hook.value ?? true;
      assertFlagValue(value);
      next = withFlag(next, definition.flag_id, value);
      applied.push({ flag_id: definition.flag_id, hook_index: hookIndex, value });
    });
  }

  return { store: next, applied };
}

/**
 * Resolves data-owned consumed_by links into effects for the caller's domain.
 * Investigation/combat/non-combat/reward systems apply the returned catalogue
 * effects themselves; the flag layer contains no encounter-specific branch.
 */
export function resolveFlagEffects(
  store: FlagStore,
  definitions: readonly FlagDefinition[],
  context: FlagConsumeContext,
): readonly ResolvedFlagEffect[] {
  const effects: ResolvedFlagEffect[] = [];
  for (const definition of definitions) {
    if (!isFlagEnabled(store, definition.flag_id)) continue;
    const flagValue = store[definition.flag_id];
    if (flagValue === undefined) continue;

    definition.consumed_by.forEach((hook, hookIndex) => {
      if (
        hook.encounter !== context.encounter ||
        !conditionMatches(hook.condition, store, context.evaluateCondition)
      ) {
        return;
      }
      effects.push({
        flag_id: definition.flag_id,
        flag_value: flagValue,
        hook_index: hookIndex,
        apply: hook.apply,
      });
    });
  }
  return effects;
}
