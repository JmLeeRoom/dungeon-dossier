import type { ContentId, Effect } from '../domain';
import {
  assertAxisTransition,
  assertClaimStateInvariants,
  type ClaimStateAxes,
} from '../knowledge';
import type { Resolution } from './types';

export const EFFECT_ORDER = [
  'RESOURCES',
  'STATE',
  'REVEALS',
  'CARD_EFFECTS',
  'MODIFIERS',
  'OBJECTIVE_CHECK',
] as const;

export type EffectStage = (typeof EFFECT_ORDER)[number];

export interface OrderedEffect<TPayload = unknown> {
  readonly stage: EffectStage;
  readonly payload: TPayload;
}

/**
 * The sole resolution transition boundary. Reducers return new state so callers
 * cannot observe a partially-applied resolution.
 */
export function applyResolutionEffects<TState, TPayload>(
  initialState: TState,
  effects: readonly OrderedEffect<TPayload>[],
  reduceEffect: (state: TState, effect: OrderedEffect<TPayload>) => TState,
): TState {
  let state = initialState;

  for (const stage of EFFECT_ORDER) {
    for (const effect of effects) {
      if (effect.stage === stage) {
        state = reduceEffect(state, effect);
      }
    }
  }

  return state;
}

export interface AppliedClaimState extends ClaimStateAxes {
  readonly resistance: number;
  readonly isRequired: boolean;
}

export interface ResolutionRuntimeState {
  readonly resources: Readonly<{
    composure: number;
    coercion: number;
    commandPoints: number;
  }>;
  readonly claims: Readonly<Record<string, AppliedClaimState>>;
  readonly revealedIds: readonly ContentId[];
  readonly appliedCardEffects: readonly Effect[];
  readonly appliedModifierEffects: readonly Effect[];
  readonly objectivesDirty: boolean;
  readonly outcome?: 'FAILED';
}

type RuntimePayload = Readonly<{
  resolution: Resolution;
  targetClaimId?: ContentId;
}>;

export interface ApplyResolutionOptions {
  readonly hasAlternativePath?: (
    claimId: ContentId,
    state: ResolutionRuntimeState,
  ) => boolean;
}

/** Applies a completed resolution in the canonical six-stage order. */
export function applyResolution(
  resolution: Resolution,
  state: ResolutionRuntimeState,
  targetClaimId?: ContentId,
  options: ApplyResolutionOptions = {},
): ResolutionRuntimeState {
  const payload: RuntimePayload = {
    resolution,
    ...(targetClaimId === undefined ? {} : { targetClaimId }),
  };
  const effects: readonly OrderedEffect<RuntimePayload>[] = EFFECT_ORDER.map((stage) => ({
    stage,
    payload,
  }));

  return applyResolutionEffects(state, effects, (current, effect) => {
    const { resolution: result, targetClaimId: targetId } = effect.payload;
    switch (effect.stage) {
      case 'RESOURCES':
        return {
          ...current,
          resources: {
            composure: Math.max(0, current.resources.composure + result.effects.composureDelta),
            coercion: Math.max(0, current.resources.coercion + result.effects.coercionDelta),
            commandPoints: Math.max(
              0,
              current.resources.commandPoints + result.effects.commandPointDelta,
            ),
          },
          ...(result.effects.terminalOutcome === undefined
            ? {}
            : { outcome: result.effects.terminalOutcome }),
        };
      case 'STATE': {
        if (targetId === undefined) return current;
        const previous = current.claims[targetId];
        if (previous === undefined) return current;
        let next: AppliedClaimState = previous;
        if (result.effects.commitmentState !== undefined) {
          const candidate = {
            ...next,
            commitment: result.effects.commitmentState,
          };
          assertAxisTransition(next, candidate, 'COMMITMENT');
          next = candidate;
        }
        if (result.effects.epistemicState !== undefined) {
          const candidate = {
            ...next,
            epistemic: result.effects.epistemicState,
          };
          assertAxisTransition(next, candidate, 'EPISTEMIC');
          next = candidate;
        }
        if (result.effects.presentationState !== undefined) {
          const candidate = {
            ...next,
            presentation: result.effects.presentationState,
          };
          assertAxisTransition(next, candidate, 'PRESENTATION');
          next = candidate;
        }
        if (result.effects.resistanceDelta !== 0) {
          next = {
            ...next,
            resistance: Math.max(0, next.resistance + result.effects.resistanceDelta),
          };
        }

        const entersUnresolved =
          previous.epistemic !== 'UNRESOLVED' && next.epistemic === 'UNRESOLVED';
        assertClaimStateInvariants(next, {
          hasAlternativePath: entersUnresolved
            ? (options.hasAlternativePath?.(targetId, current) ?? false)
            : true,
        });

        return {
          ...current,
          claims: {
            ...current.claims,
            [targetId]: next,
          },
        };
      }
      case 'REVEALS': {
        const revealedIds = [...current.revealedIds];
        for (const id of result.reveals) {
          if (!revealedIds.includes(id)) revealedIds.push(id);
        }
        return { ...current, revealedIds };
      }
      case 'CARD_EFFECTS':
        return {
          ...current,
          appliedCardEffects: [...current.appliedCardEffects, ...result.effects.cardEffects],
        };
      case 'MODIFIERS':
        return {
          ...current,
          appliedModifierEffects: [
            ...current.appliedModifierEffects,
            ...result.effects.modifierEffects,
          ],
        };
      case 'OBJECTIVE_CHECK':
        return { ...current, objectivesDirty: result.effects.checkObjectives };
    }
  });
}
