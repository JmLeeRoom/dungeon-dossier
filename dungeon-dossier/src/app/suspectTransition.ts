import type { SuspectStatePart } from '../dto';
import type { SuspectStateTransition } from '../ui/screens/interrogation';

export interface SuspectStateMark {
  readonly encounterId: string | undefined;
  readonly statePart: SuspectStatePart | undefined;
}

/**
 * A state change is only a transition when the *same* suspect changed state.
 * The first mount of an encounter has nothing to transition from, and swapping
 * encounters replaces the suspect rather than upsetting them — neither should
 * fire a reaction.
 */
export function detectSuspectTransition(
  previous: SuspectStateMark,
  next: SuspectStateMark,
): SuspectStateTransition | undefined {
  if (next.statePart === undefined) return undefined;
  if (previous.statePart === undefined) return undefined;
  if (previous.encounterId === undefined) return undefined;
  if (previous.encounterId !== next.encounterId) return undefined;
  if (previous.statePart === next.statePart) return undefined;
  return { from: previous.statePart, to: next.statePart };
}
