import { describe, expect, expectTypeOf, it } from 'vitest';
import { RequestBuilder, type ReactionRequest, type StatementRequest } from '../../src/ai';
import { LEGACY_REQUEST, requestBuilder } from './helpers';

function objectKeysDeep(value: unknown): readonly string[] {
  if (Array.isArray(value)) return value.flatMap(objectKeysDeep);
  if (value === null || typeof value !== 'object') return [];
  return Object.entries(value).flatMap(([key, child]) => [key, ...objectKeysDeep(child)]);
}

describe('AI request boundary', () => {
  it('builds the exact statement and reaction allow-list contracts', () => {
    const builder = requestBuilder();
    const statement = builder.buildStatement(LEGACY_REQUEST);
    const reaction = builder.buildReaction(LEGACY_REQUEST);

    expect(Object.keys(statement).sort()).toEqual([
      'allowed_claims',
      'forbidden_information',
      'presentation_groups',
      'seed',
      'speaker_profile',
    ]);
    expect(Object.keys(reaction).sort()).toEqual([
      ...Object.keys(statement),
      'composure_band',
      'missing_scopes',
      'reaction_key',
    ].sort());
    expect(statement.allowed_claims[0]).toEqual({
      claimId: 'claim-time',
      canonicalMeaning: '22시에 창고에 있었다',
      facet: 'WHEN',
    });
    expect(reaction.composure_band).toBe('MID');
  });

  it('has no structural channel for truth, proof rules, hypotheses, or exact composure', () => {
    expectTypeOf<StatementRequest>().not.toHaveProperty('truth_relation');
    expectTypeOf<StatementRequest>().not.toHaveProperty('proofRule');
    expectTypeOf<StatementRequest>().not.toHaveProperty('hypotheses');
    expectTypeOf<ReactionRequest>().not.toHaveProperty('composure');

    const profileWithSecrets = {
      race: 'SLIME',
      personality: ['TIMID'],
      speech: 'POLITE',
      forbidden_expressions: [],
      truth_relation: 'SECRET',
      proofRule: { secret: true },
      hypotheses: ['secret'],
      composure: 17,
    };
    const builder = new RequestBuilder({
      speakerProfile: profileWithSecrets,
      forbiddenInformation: [],
      composureBand: 'LOW',
    });
    const keys = objectKeysDeep(builder.buildReaction(LEGACY_REQUEST));
    expect(keys).not.toEqual(expect.arrayContaining([
      'truth_relation',
      'proofRule',
      'hypotheses',
      'composure',
    ]));
  });

  it('rejects presentation groups that reference claims outside the request', () => {
    const builder = new RequestBuilder({
      speakerProfile: {
        race: 'SLIME',
        personality: [],
        speech: 'POLITE',
        forbidden_expressions: [],
      },
      presentationGroups: [{ group_id: 'bad', claim_ids: ['claim-time', 'secret-claim'] }],
      forbiddenInformation: [],
      composureBand: 'HIGH',
    });
    expect(() => builder.buildStatement(LEGACY_REQUEST)).toThrow(/disallowed claim/u);
  });
});
