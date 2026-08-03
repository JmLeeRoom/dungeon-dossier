import { isFlagEnabled, type FlagStore, type FlagValue } from './FlagStore';

export type EndingId = string;

export type EndingFlagExpression =
  | Readonly<{ type: 'FLAG_ENABLED'; flagId: string }>
  | Readonly<{ type: 'FLAG_EQUALS'; flagId: string; value: FlagValue }>
  | Readonly<{ type: 'ALL_OF'; expressions: readonly EndingFlagExpression[] }>
  | Readonly<{ type: 'ANY_OF'; expressions: readonly EndingFlagExpression[] }>
  | Readonly<{ type: 'NOT'; expression: EndingFlagExpression }>;

export interface EndingRule {
  readonly endingId: EndingId;
  readonly priority: number;
  readonly when: EndingFlagExpression;
}

export interface EndingFormula {
  readonly rules: readonly EndingRule[];
  readonly defaultEndingId: EndingId;
}

function evaluateExpression(store: FlagStore, expression: EndingFlagExpression): boolean {
  switch (expression.type) {
    case 'FLAG_ENABLED':
      return isFlagEnabled(store, expression.flagId);
    case 'FLAG_EQUALS':
      return Object.is(store[expression.flagId], expression.value);
    case 'ALL_OF':
      if (expression.expressions.length === 0) {
        throw new Error('Ending ALL_OF expression must not be empty.');
      }
      return expression.expressions.every((nested) => evaluateExpression(store, nested));
    case 'ANY_OF':
      if (expression.expressions.length === 0) {
        throw new Error('Ending ANY_OF expression must not be empty.');
      }
      return expression.expressions.some((nested) => evaluateExpression(store, nested));
    case 'NOT':
      return !evaluateExpression(store, expression.expression);
  }
}

/** Generic injected formula; the engine does not know the ID of the ending flag. */
export function evaluateEnding(store: FlagStore, formula: EndingFormula): EndingId {
  if (formula.defaultEndingId.trim().length === 0) {
    throw new Error('Default ending ID must not be empty.');
  }
  let selected: EndingRule | undefined;
  for (const rule of formula.rules) {
    if (rule.endingId.trim().length === 0 || !Number.isInteger(rule.priority)) {
      throw new Error('Ending rules require a non-empty ID and integer priority.');
    }
    if (
      evaluateExpression(store, rule.when) &&
      (selected === undefined || rule.priority > selected.priority)
    ) {
      selected = rule;
    }
  }
  return selected?.endingId ?? formula.defaultEndingId;
}
