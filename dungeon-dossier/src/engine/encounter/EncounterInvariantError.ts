/**
 * Violation of an internal engine invariant (corrupted state or save), never a
 * user input error. Callers route it to the error boundary and must keep the
 * pre-command state instead of showing it as a gameplay outcome.
 */
export class EncounterInvariantError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = 'EncounterInvariantError';
  }
}

export function assertEncounterInvariant(
  condition: boolean,
  message: string,
): asserts condition {
  if (!condition) throw new EncounterInvariantError(message);
}
