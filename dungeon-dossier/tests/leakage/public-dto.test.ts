import { describe, expect, it } from 'vitest';
import {
  PUBLIC_DTO_FORBIDDEN_KEYS,
  hasForbiddenPublicKey,
} from '../../src/dto/public';

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
});
