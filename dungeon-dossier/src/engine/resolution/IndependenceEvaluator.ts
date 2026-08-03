import type {
  Independence,
  ResolutionEvidence,
  ResolutionProofRule,
} from './types';

function findEvidence(
  evidenceId: string,
  catalog: readonly ResolutionEvidence[],
): ResolutionEvidence | undefined {
  return catalog.find((item) => item.evidenceId === evidenceId);
}

function resolveRoot(
  evidence: ResolutionEvidence,
  catalog: readonly ResolutionEvidence[],
): ResolutionEvidence {
  let current = evidence;
  const visited: string[] = [];

  while (current.independence.derivedFrom !== null) {
    if (visited.includes(current.evidenceId)) {
      throw new Error('Evidence derivation cycle detected.');
    }
    visited.push(current.evidenceId);
    const parent = findEvidence(current.independence.derivedFrom, catalog);
    if (parent === undefined) {
      throw new Error(
        `Missing derived evidence parent: ${current.independence.derivedFrom}`,
      );
    }
    current = parent;
  }

  return current;
}

export function countIndependentSources(
  evidence: readonly ResolutionEvidence[],
  catalog: readonly ResolutionEvidence[],
  partialWeight: number,
): number {
  const groups: Array<{ group: string; sourceIds: string[] }> = [];

  for (const item of evidence) {
    const root = resolveRoot(item, catalog);
    let group = groups.find((candidate) => candidate.group === root.independence.group);
    if (group === undefined) {
      group = { group: root.independence.group, sourceIds: [] };
      groups.push(group);
    }
    if (!group.sourceIds.includes(root.independence.sourceId)) {
      group.sourceIds.push(root.independence.sourceId);
    }
  }

  let count = 0;
  for (const group of groups) {
    if (group.sourceIds.length > 0) {
      count += 1 + (group.sourceIds.length - 1) * partialWeight;
    }
  }
  return Math.floor(count);
}

export function evaluateIndependence(
  evidence: readonly ResolutionEvidence[],
  catalog: readonly ResolutionEvidence[],
  rule: ResolutionProofRule,
  partialWeight: number,
): Readonly<{
  independence: Independence;
  independentSources: number;
  requiredSources: number;
}> {
  const hasGradeB = evidence.some((item) => item.grade === 'B');
  const requiredSources = Math.max(
    rule.requirements.minimumIndependentSources,
    hasGradeB ? 2 : 0,
  );
  const independentSources = countIndependentSources(evidence, catalog, partialWeight);
  return {
    independence: independentSources >= requiredSources ? 'MET' : 'UNMET',
    independentSources,
    requiredSources,
  };
}
