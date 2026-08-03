import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  CaseSchema,
  createTruthGraph,
  type CaseDefinition,
} from '../../src/engine/domain';
import type { ClaimKnowledge, KnowledgeState } from '../../src/engine/knowledge';
import {
  PUBLIC_DTO_FORBIDDEN_KEYS,
  hasForbiddenPublicKey,
  toPublicDTO,
} from '../../src/dto/public';

interface NumericPair {
  readonly left: number;
  readonly right: number;
}

function pearsonCorrelation(samples: readonly NumericPair[]): number {
  if (samples.length < 2) return 0;
  const leftMean = samples.reduce((total, sample) => total + sample.left, 0) / samples.length;
  const rightMean = samples.reduce((total, sample) => total + sample.right, 0) / samples.length;
  let covariance = 0;
  let leftVariance = 0;
  let rightVariance = 0;

  for (const sample of samples) {
    const leftDelta = sample.left - leftMean;
    const rightDelta = sample.right - rightMean;
    covariance += leftDelta * rightDelta;
    leftVariance += leftDelta ** 2;
    rightVariance += rightDelta ** 2;
  }

  const denominator = Math.sqrt(leftVariance * rightVariance);
  return denominator === 0 ? 0 : covariance / denominator;
}

function fieldSet(value: unknown, prefix = '$'): readonly string[] {
  if (Array.isArray(value)) {
    return [...new Set(value.flatMap((entry) => fieldSet(entry, `${prefix}[]`)))].sort();
  }
  if (value === null || typeof value !== 'object') return [];

  return Object.entries(value).flatMap(([key, child]) => {
    const field = `${prefix}.${key}`;
    return [field, ...fieldSet(child, field)];
  }).sort();
}

function knowledgeFor(claim: ClaimKnowledge): KnowledgeState {
  return { claims: [claim], evidence: [] };
}

function publicProjection(claim: ClaimKnowledge): unknown {
  return toPublicDTO({
    knowledge: knowledgeFor(claim),
    resources: { composure: 50, coercion: 0, commandPoints: 3 },
    objectives: [],
  });
}

async function loadCases(): Promise<readonly CaseDefinition[]> {
  const casesRoot = path.resolve('content/cases');
  const entries = await readdir(casesRoot, { withFileTypes: true });
  const files = entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => path.join(casesRoot, entry.name, 'case.json'));
  const parsed: CaseDefinition[] = [];

  for (const file of files) {
    try {
      parsed.push(CaseSchema.parse(JSON.parse(await readFile(file, 'utf8')) as unknown));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }
  }
  return parsed;
}

describe('leakage structure and statistical sentries', () => {
  it('gives true and false claims an identical PublicDTO field set', () => {
    const publicShape = {
      speakerId: 'speaker-runtime',
      facet: 'WHO',
      canonicalMeaning: '동일한 공개 문장',
      commitment: 'ASSERTED',
      epistemic: 'UNKNOWN',
      presentation: 'NORMAL',
      resistance: 1,
      isRequired: true,
    } as const;
    const trueClaim: ClaimKnowledge = { ...publicShape, claimId: 'claim-true-runtime' };
    const falseClaim: ClaimKnowledge = { ...publicShape, claimId: 'claim-false-runtime' };
    const truthGraph = createTruthGraph([
      {
        claim: {
          claimId: trueClaim.claimId,
          speakerId: trueClaim.speakerId,
          facet: trueClaim.facet,
          canonicalMeaning: trueClaim.canonicalMeaning,
          isRequired: true,
        },
        truth: { relation: 'CONSISTENT_WITH_WORLD', contradictingEvents: [] },
      },
      {
        claim: {
          claimId: falseClaim.claimId,
          speakerId: falseClaim.speakerId,
          facet: falseClaim.facet,
          canonicalMeaning: falseClaim.canonicalMeaning,
          isRequired: true,
        },
        truth: { relation: 'CONTRADICTED_BY_WORLD', contradictingEvents: ['world-event'] },
      },
    ]);
    const trueDto = publicProjection(trueClaim);
    const falseDto = publicProjection(falseClaim);

    expect(truthGraph.records.map((record) => record.truth.relation)).toEqual([
      'CONSISTENT_WITH_WORLD',
      'CONTRADICTED_BY_WORLD',
    ]);
    expect(fieldSet(trueDto)).toEqual(fieldSet(falseDto));
    expect(hasForbiddenPublicKey(trueDto)).toBe(false);
    expect(hasForbiddenPublicKey(falseDto)).toBe(false);
    const publicFields = fieldSet(trueDto).join('\n');
    for (const forbidden of PUBLIC_DTO_FORBIDDEN_KEYS) {
      expect(publicFields).not.toContain(forbidden);
    }
  });

  it('keeps resistance and shield durability below the truth-correlation threshold', async () => {
    const cases = await loadCases();
    const resistanceSamples: NumericPair[] = [];
    const shieldSamples: NumericPair[] = [];

    for (const caseDefinition of cases) {
      const lieByClaim = new Map(
        caseDefinition.claims.map((claim) => [
          claim.claim_id,
          claim.truth.relation === 'CONTRADICTED_BY_WORLD' ? 1 : 0,
        ]),
      );
      for (const claim of caseDefinition.claims) {
        resistanceSamples.push({ left: claim.resistance ?? 0, right: lieByClaim.get(claim.claim_id) ?? 0 });
      }
      for (const encounter of caseDefinition.encounters) {
        for (const round of encounter.rounds) {
          for (const shield of round.shields) {
            shieldSamples.push({
              left: shield.durability,
              right: lieByClaim.get(shield.claim_id) ?? 0,
            });
          }
        }
      }
    }

    expect(Math.abs(pearsonCorrelation(resistanceSamples))).toBeLessThanOrEqual(0.5);
    expect(Math.abs(pearsonCorrelation(shieldSamples))).toBeLessThanOrEqual(0.5);
  });

  it('would fail the gate for an obviously truth-coded numeric signal', () => {
    const encoded = [
      { left: 0, right: 0 },
      { left: 1, right: 0 },
      { left: 2, right: 1 },
      { left: 3, right: 1 },
    ];

    expect(Math.abs(pearsonCorrelation(encoded))).toBeGreaterThan(0.5);
  });
});
