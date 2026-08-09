import { describe, expect, expectTypeOf, it } from 'vitest';

import {
  CardsSchema,
  CURRENT_SAVE_VERSION,
  FlagsSchema,
  JudgmentUiMapSchema,
  PublicClaimSchema,
  SaveSchema,
  TruthClaimSchema,
  type PublicClaim,
} from '../../src/content-io/schemas';
import { FACETS, PROOF_SCOPES } from '../../src/engine/domain';

const baseClaim = {
  claim_id: 'claim-sample',
  speaker: 'speaker-sample',
  facet: 'WHO',
  canonical_meaning: 'A canonical statement',
  predicate: 'PRESENT_ALONE',
  initial: { commitment: 'ASSERTED', presentation: 'NORMAL' },
} as const;

function createCard(index: number) {
  return {
    card_id: `card-${index}`,
    name_key: `loc.card.${index}.name`,
    description_key: `loc.card.${index}.description`,
    category: 'BASE' as const,
    intent: 'QUERY' as const,
    cost: { cp: 1 },
    target: { kind: 'ROUTE' as const },
    modifiers: [],
    starting_copies: index < 6 ? 1 : 0,
  };
}

function createFlag(index: number) {
  const id = `F-${String(index).padStart(2, '0')}`;
  return {
    flag_id: id,
    set_by: [{ event: `event-${index}` }],
    consumed_by: [
      {
        encounter: `encounter-${index}`,
        apply: { type: 'SET_FLAG' as const, target: id, value: true },
      },
    ],
  };
}

describe('domain content schemas', () => {
  it('keeps truth out of the public Claim contract', () => {
    expect(PublicClaimSchema.safeParse(baseClaim).success).toBe(true);
    expect(
      PublicClaimSchema.safeParse({
        ...baseClaim,
        truth: { relation: 'IRRELEVANT', contradicting_events: [] },
      }).success,
    ).toBe(false);
    expectTypeOf<PublicClaim>().not.toHaveProperty('truth');

    expect(
      TruthClaimSchema.safeParse({
        ...baseClaim,
        truth: { relation: 'IRRELEVANT', contradicting_events: [] },
      }).success,
    ).toBe(true);
  });

  it('rejects permanently locked claims', () => {
    expect(
      PublicClaimSchema.safeParse({
        ...baseClaim,
        initial: { ...baseClaim.initial, presentation: 'LOCKED' },
      }).success,
    ).toBe(false);
    expect(
      PublicClaimSchema.safeParse({
        ...baseClaim,
        initial: { ...baseClaim.initial, presentation: 'LOCKED' },
        lock: { locked_at_start: true, unlock_conditions: [] },
      }).success,
    ).toBe(false);
  });

  it('enforces the unstated-to-hidden content invariant', () => {
    expect(
      PublicClaimSchema.safeParse({
        ...baseClaim,
        initial: { commitment: 'UNSTATED', presentation: 'NORMAL' },
      }).success,
    ).toBe(false);
    expect(
      PublicClaimSchema.safeParse({
        ...baseClaim,
        initial: { commitment: 'UNSTATED', presentation: 'HIDDEN' },
      }).success,
    ).toBe(true);
  });

  it('allows an extensible catalogue with at least five unique card definitions', () => {
    const cards = Array.from({ length: 14 }, (_, index) => createCard(index));
    expect(
      CardsSchema.safeParse({
        $schema: '../../schemas/cards.schema.json',
        schema_version: '1.0',
        cards,
      }).success,
    ).toBe(true);
    expect(
      CardsSchema.safeParse({ schema_version: '1.0', cards: cards.slice(0, 4) }).success,
    ).toBe(false);
    expect(
      CardsSchema.safeParse({
        schema_version: '1.0',
        cards: [...cards.slice(0, 13), createCard(0)],
      }).success,
    ).toBe(false);
  });

  it('requires the complete F-01 through F-13 flag set', () => {
    const flags = Array.from({ length: 13 }, (_, index) => createFlag(index + 1));
    expect(FlagsSchema.safeParse({ schema_version: '1.0', flags }).success).toBe(true);
    expect(
      FlagsSchema.safeParse({
        schema_version: '1.0',
        flags: [...flags.slice(0, 12), createFlag(12)],
      }).success,
    ).toBe(false);
  });

  it('stores runtime save state only', () => {
    const save = {
      $schema: '../schemas/save.schema.json',
      save_version: CURRENT_SAVE_VERSION,
      case_id: 'sample-case',
      content_version: '1.0.0',
      run_seed: 42,
      claims: [],
      evidence: [],
      deck: {
        draw_pile: [],
        hand: [],
        discard_pile: [],
        exhaust_pile: [],
        locked_cards: {},
      },
      flags: {},
      resources: {
        cp: 0,
        stress: 0,
        dp: 0,
        composure: 0,
        coercion: 0,
        trust: 0,
        turn: 0,
      },
      encounter: null,
      used_routes: [],
      acquired_relics: [],
      acquired_enhancements: [],
    };
    expect(SaveSchema.safeParse(save).success).toBe(true);
    expect(SaveSchema.safeParse({ ...save, definitions: {} }).success).toBe(false);
  });

  it('collapses the five evidence outcomes to four UI categories', () => {
    const categories = {
      DIRECT_CONTRADICTION: { label_key: 'judgment.direct' },
      INDIRECT_SUSPICION: { label_key: 'judgment.indirect' },
      INSUFFICIENT_GROUNDS: { label_key: 'judgment.insufficient' },
      TRUTH_ATTACKED: { label_key: 'judgment.truth-attacked' },
    };
    const facets = Object.fromEntries(
      FACETS.map((facet) => [facet, { label_key: `facet.${facet}` }]),
    );
    const proofScopes = Object.fromEntries(
      PROOF_SCOPES.map((scope) => [
        scope,
        {
          label_key: `scope.${scope}`,
          missing_feedback_key: `scope.${scope}.missing`,
        },
      ]),
    );
    const resolutionCodes = {
      R_DIRECT_CONTRADICTION: {
        label_key: 'judgment.direct',
        feedback_key: 'judgment.direct.feedback',
        category: 'DIRECT_CONTRADICTION',
      },
      R_INDIRECT_SUSPICION: {
        label_key: 'judgment.indirect',
        feedback_key: 'judgment.indirect.feedback',
        category: 'INDIRECT_SUSPICION',
      },
      R_INSUFFICIENT_GROUNDS: {
        label_key: 'judgment.insufficient',
        feedback_key: 'judgment.insufficient.feedback',
        category: 'INSUFFICIENT_GROUNDS',
      },
      R_TRUTH_ATTACKED: {
        label_key: 'judgment.truth-attacked',
        feedback_key: 'judgment.truth-attacked.feedback',
        category: 'TRUTH_ATTACKED',
      },
      R_IRRELEVANT_EVIDENCE: {
        label_key: 'judgment.insufficient',
        feedback_key: 'judgment.irrelevant.feedback',
        category: 'INSUFFICIENT_GROUNDS',
      },
    };
    const mapping = {
      schema_version: '1.0',
      categories,
      facets,
      proof_scopes: proofScopes,
      resolution_codes: resolutionCodes,
    };

    expect(JudgmentUiMapSchema.safeParse(mapping).success).toBe(true);
    const missingCode = Object.fromEntries(
      Object.entries(resolutionCodes).filter(([code]) => code !== 'R_TRUTH_ATTACKED'),
    );
    expect(
      JudgmentUiMapSchema.safeParse({ ...mapping, resolution_codes: missingCode }).success,
    ).toBe(false);
    expect(
      JudgmentUiMapSchema.safeParse({
        ...mapping,
        resolution_codes: {
          ...resolutionCodes,
          R_IRRELEVANT_EVIDENCE: {
            ...resolutionCodes.R_IRRELEVANT_EVIDENCE,
            feedback_key: resolutionCodes.R_INSUFFICIENT_GROUNDS.feedback_key,
          },
        },
      }).success,
    ).toBe(false);
  });
});
