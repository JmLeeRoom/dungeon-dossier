import { describe, expect, it } from 'vitest';
import {
  BalanceSchema,
  EvidenceSchema,
  ProofRuleSchema,
  PublicClaimSchema,
} from '../../src/engine/domain';
import {
  resolveArgument,
  toComparableTimeRange,
  toResolutionClaim,
  toResolutionEvidence,
  toResolutionProofRule,
  toResolverBalance,
} from '../../src/engine/resolution';
import balanceJson from '../../content/common/balance.json';

describe('validated domain-to-resolver adapters', () => {
  it('normalizes clock intervals, including midnight rollover', () => {
    expect(toComparableTimeRange({ from: '17:00', to: '17:30' })).toEqual({
      from: 61_200,
      to: 63_000,
    });
    expect(toComparableTimeRange({ from: '23:50', to: '00:10' })).toEqual({
      from: 85_800,
      to: 87_000,
    });
  });

  it('feeds Zod-validated content into the pure resolver without truth data', () => {
    const claim = toResolutionClaim(
      PublicClaimSchema.parse({
        claim_id: 'runtime-claim',
        speaker: 'runtime-speaker',
        subject_id: 'runtime-person',
        object_id: 'runtime-home',
        facet: 'WHERE',
        canonical_meaning: 'The subject was at home.',
        predicate: 'LOCATED_AT',
        time_ref: { from: '17:00', to: '17:30' },
        initial: { commitment: 'ASSERTED', presentation: 'NORMAL' },
      }),
    );
    const evidence = toResolutionEvidence(
      EvidenceSchema.parse({
        evidence_id: 'runtime-evidence',
        title_key: 'evidence.runtime.title',
        acquire: { node: 'runtime-node', method: 'STARTING' },
        source_category: 'DIGITAL',
        independence: {
          source_id: 'runtime-source',
          group: 'DIGITAL',
          derived_from: null,
        },
        grade: { initial: 'A', upgrades: [] },
        observations: [
          {
            predicate: 'ACCESS_RECORDED',
            summary_key: 'evidence.runtime.observation',
            scopes: ['IDENTITY', 'TIME', 'LOCATION'],
            detail: {},
            subject_id: 'runtime-person',
            location_id: 'runtime-gate',
            time: { from: '17:10', to: '17:11' },
            confidence: 0.99,
            contradicts_claim_ids: ['runtime-claim'],
          },
        ],
        not_proven_keys: ['evidence.runtime.not-proven'],
      }),
    );
    const proofRule = toResolutionProofRule(
      ProofRuleSchema.parse({
        rule_id: 'runtime-rule',
        target_claim_id: 'runtime-claim',
        direction: 'CONTRADICT',
        requirements: {
          required_scopes: ['IDENTITY', 'TIME', 'LOCATION'],
          minimum_confidence: 0.9,
          minimum_independent_sources: 1,
        },
      }),
    );
    const result = resolveArgument({
      intent: 'CONTRADICT',
      targetKind: 'CLAIM',
      target: claim,
      targetExposed: true,
      evidence: [evidence],
      evidenceCatalog: [evidence],
      proofRule,
      procedure: 'FAIR',
      balance: toResolverBalance(BalanceSchema.parse(balanceJson)),
      commandPointCost: 2,
    });

    expect(claim.timeRange).toEqual({ from: 61_200, to: 63_000 });
    expect(Object.hasOwn(claim, 'truth')).toBe(false);
    expect(result.code).toBe('R_DIRECT_CONTRADICTION');
    expect(result.effects.commandPointDelta).toBe(-2);
  });
});
