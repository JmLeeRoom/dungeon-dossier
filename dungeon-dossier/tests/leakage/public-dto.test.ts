import { describe, expect, it } from 'vitest';
import {
  PUBLIC_DTO_FORBIDDEN_KEYS,
  hasForbiddenPublicKey,
  toPublicDTO,
} from '../../src/dto/public';
import type { ClaimKnowledge, KnowledgeState } from '../../src/engine/knowledge';

function claim(
  claimId: string,
  overrides: Partial<ClaimKnowledge> = {},
): ClaimKnowledge {
  return {
    claimId,
    speakerId: 'speaker-runtime',
    facet: 'WHO',
    canonicalMeaning: `statement ${claimId}`,
    commitment: 'ASSERTED',
    epistemic: 'UNKNOWN',
    presentation: 'NORMAL',
    resistance: 1,
    isRequired: false,
    ...overrides,
  };
}

describe('PublicDTO leakage guard', () => {
  it('keeps the canonical private truth keys on the denylist', () => {
    const forbiddenKeys = new Set<string>(PUBLIC_DTO_FORBIDDEN_KEYS);

    expect([...forbiddenKeys]).toEqual(
      expect.arrayContaining(['truthRelation', 'isLie', 'proofRules']),
    );
  });

  it.each(PUBLIC_DTO_FORBIDDEN_KEYS)(
    'detects nested forbidden key %s',
    (forbiddenKey) => {
      expect(
        hasForbiddenPublicKey({
          statement: [{ claimId: 'runtime-data', nested: { [forbiddenKey]: true } }],
        }),
      ).toBe(true);
    },
  );

  it('accepts a DTO composed only of public whitelist fields', () => {
    expect(
      hasForbiddenPublicKey({
        statement: [
          {
            claimId: 'runtime-data',
            facet: 'WHO',
            resistance: 2,
          },
        ],
        evidence: [{ evidenceId: 'runtime-data', scopes: ['IDENTITY'] }],
        resources: { composure: 60, coercion: 0, commandPoints: 3 },
        objectives: [],
      }),
    ).toBe(false);
  });

  it('fails closed for HIDDEN and UNSTATED claims at the DTO boundary', () => {
    const knowledge: KnowledgeState = {
      claims: [
        claim('visible'),
        claim('hidden', { presentation: 'HIDDEN', commitment: 'UNSTATED' }),
        // Deliberately malformed injected state: I-1 should catch it earlier,
        // but the public projection still must not expose its authored text.
        claim('malformed-unstated', { commitment: 'UNSTATED' }),
      ],
      evidence: [],
    };

    const dto = toPublicDTO({
      knowledge,
      resources: { composure: 60, coercion: 0, commandPoints: 3 },
      objectives: [],
    });

    expect(dto.statement.map((item) => item.claimId)).toEqual(['visible']);
    expect(JSON.stringify(dto)).not.toContain('statement hidden');
    expect(JSON.stringify(dto)).not.toContain('statement malformed-unstated');
  });
});
