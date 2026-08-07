/**
 * The one place a proof rule is chosen for a (claim, direction) pair.
 *
 * The coordinator resolves an argument against a single rule, and semantic
 * validation reasons about which rule a player can actually satisfy. Those two
 * readings used to be written separately — the coordinator took the first match
 * while validation looked at every match — so a case with two rules on the same
 * pair was judged solvable through a rule the runtime could never reach.
 * Both sides now call this, so "first in authored order wins" is a single fact.
 */
export interface ProofRuleSelectorInput {
  readonly target_claim_id: string;
  readonly direction: string;
}

export function selectProofRule<T extends ProofRuleSelectorInput>(
  proofRules: readonly T[],
  targetClaimId: string | undefined,
  direction: string,
): T | undefined {
  if (targetClaimId === undefined) return undefined;
  return proofRules.find(
    (rule) => rule.target_claim_id === targetClaimId && rule.direction === direction,
  );
}

/**
 * Rules that match the pair but sit behind the selected one. They are authored
 * but unreachable, which is worth reporting rather than silently aggregating.
 */
export function shadowedProofRules<T extends ProofRuleSelectorInput>(
  proofRules: readonly T[],
  targetClaimId: string | undefined,
  direction: string,
): readonly T[] {
  if (targetClaimId === undefined) return [];
  const matching = proofRules.filter(
    (rule) => rule.target_claim_id === targetClaimId && rule.direction === direction,
  );
  return matching.slice(1);
}
