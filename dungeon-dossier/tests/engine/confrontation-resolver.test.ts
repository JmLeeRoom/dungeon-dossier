import { readFile } from 'node:fs/promises';

import { beforeAll, describe, expect, it } from 'vitest';

import { CardsSchema, type CardCombatProfile, type CardsDefinition } from '../../src/engine/domain';
import {
  applyCardCombatProfile,
  type ClaimExposureState,
  type ConfrontationJudgment,
  type Resolution,
  validateCardCombatSelection,
} from '../../src/engine/resolution';

const CARD_IDS = [
  'card_leading_question',
  'card_toss_dossier',
  'card_point_contradiction',
  'card_decisive_proof',
  'card_bat_threat',
] as const;

const EXPOSURES: readonly ClaimExposureState[] = ['GAP', 'SHIELDED', 'BROKEN'];
const JUDGMENTS: readonly ConfrontationJudgment[] = [
  'DIRECT',
  'INDIRECT',
  'INSUFFICIENT',
  'IRRELEVANT',
  'TRUTH',
];

let cards: CardsDefinition;

function codeFor(judgment: ConfrontationJudgment): Resolution['code'] {
  switch (judgment) {
    case 'UNOPPOSED': return 'R_PRESSURE_APPLIED';
    case 'DIRECT': return 'R_DIRECT_CONTRADICTION';
    case 'INDIRECT': return 'R_INDIRECT_SUSPICION';
    case 'INSUFFICIENT': return 'R_INSUFFICIENT_GROUNDS';
    case 'IRRELEVANT': return 'R_IRRELEVANT_EVIDENCE';
    case 'TRUTH': return 'R_TRUTH_ATTACKED';
  }
}

function baseResolution(judgment: ConfrontationJudgment): Resolution {
  const code = codeFor(judgment);
  return {
    code,
    axes: { validity: 'VALID', procedure: 'FAIR' },
    effects: {
      // Sentinels prove the P1 profile replaces, rather than adds to, generic balance damage.
      composureDelta: -999,
      coercionDelta: 999,
      epistemicState: judgment === 'DIRECT' ? 'REFUTED' : 'SUSPECTED',
      resistanceDelta: -3,
      reveals: [],
      cardEffects: [],
      modifierEffects: [],
      checkObjectives: true,
      consumeCommandPoints: true,
      commandPointDelta: -1,
      phaseTransitionWeight: 9,
    },
    reveals: [],
    reactionKey: code,
    trace: [],
  };
}

function profile(cardId: (typeof CARD_IDS)[number]): CardCombatProfile {
  const value = cards.cards.find((card) => card.card_id === cardId)?.combat_profile;
  if (value === undefined) throw new Error(`Missing combat profile ${cardId}.`);
  return value;
}

beforeAll(async () => {
  const source = await readFile(
    new URL('../../content/common/cards.json', import.meta.url),
    'utf8',
  );
  cards = CardsSchema.parse(JSON.parse(source) as unknown);
});

describe('P1 confrontation card matrix', () => {
  it('ships exactly the five canonical non-legacy basic slots', () => {
    const basic = cards.cards.filter((card) => card.combat_profile !== undefined);
    expect(basic.map((card) => card.card_id)).toEqual(CARD_IDS);
    expect(cards.initial_deck).toEqual(CARD_IDS);
    expect(basic.map((card) => card.cost.cp)).toEqual([1, 1, 2, 2, 2]);
    expect(basic.map((card) => card.starting_copies)).toEqual([1, 1, 1, 1, 1]);
    expect(basic.map((card) => card.combat_profile)).toEqual([
      {
        role: 'BASIC_JAB',
        composure_delta: -10,
        coercion_delta: 2,
        target_rule: 'GAP_OR_SHIELD_ATTEMPT',
        evidence_mode: 'OPTIONAL_FOR_SHIELD',
        shield_mode: 'BREAK_ON_DIRECT',
        shield_damage: 1,
      },
      {
        role: 'MENTAL_CONTROL',
        composure_delta: -10,
        coercion_delta: 0,
        target_rule: 'GAP_OR_BROKEN',
        evidence_mode: 'NONE',
        shield_mode: 'BLOCKED',
        shield_damage: 0,
      },
      {
        role: 'FINISHER',
        composure_delta: -25,
        coercion_delta: 5,
        target_rule: 'BROKEN',
        evidence_mode: 'EXACTLY_ONE',
        shield_mode: 'REQUIRE_BROKEN',
        shield_damage: 0,
      },
      {
        role: 'FINISHER',
        composure_delta: -20,
        coercion_delta: 0,
        target_rule: 'ANY_CLAIM',
        evidence_mode: 'EXACTLY_ONE',
        shield_mode: 'IGNORE',
        shield_damage: 0,
      },
      {
        role: 'PHYSICAL_COERCION',
        composure_delta: -30,
        coercion_delta: 15,
        target_rule: 'ANY_CLAIM',
        evidence_mode: 'NONE',
        shield_mode: 'IGNORE',
        shield_damage: 0,
      },
    ]);
    expect(basic.find((card) => card.card_id === 'card_bat_threat')?.tags)
      .toContain('HOT_TEMPER_RISK');
  });

  for (const cardId of CARD_IDS) {
    for (const exposure of EXPOSURES) {
      for (const judgment of JUDGMENTS) {
        it(`${cardId} × ${exposure} × ${judgment}`, () => {
          const cardProfile = profile(cardId);
          const result = applyCardCombatProfile(
            baseResolution(judgment),
            cardProfile,
            exposure,
          );
          const expectedComposure = (() => {
            if (judgment === 'DIRECT') return cardProfile.composure_delta;
            if (judgment === 'INDIRECT') {
              return exposure === 'SHIELDED'
                ? 0
                : Math.trunc(cardProfile.composure_delta * 0.5);
            }
            return 0;
          })();
          const penalty = judgment === 'INSUFFICIENT'
            ? 2
            : judgment === 'IRRELEVANT'
              ? 5
              : judgment === 'TRUTH'
                ? 15
                : 0;
          expect(result.effects.composureDelta).toBe(expectedComposure);
          expect(result.effects.coercionDelta).toBe(
            cardProfile.coercion_delta + penalty,
          );
          expect(result.effects.resistanceDelta).toBe(
            judgment === 'DIRECT' &&
            exposure === 'SHIELDED' &&
            cardProfile.shield_mode === 'BREAK_ON_DIRECT'
              ? -cardProfile.shield_damage
              : 0,
          );
        });
      }
    }
  }

  it('enforces the public target/evidence rules before judgment', () => {
    expect(validateCardCombatSelection(profile('card_leading_question'), 'GAP', 0).valid)
      .toBe(true);
    expect(validateCardCombatSelection(profile('card_leading_question'), 'SHIELDED', 1).valid)
      .toBe(true);
    expect(validateCardCombatSelection(profile('card_leading_question'), 'BROKEN', 0).valid)
      .toBe(false);
    expect(validateCardCombatSelection(profile('card_toss_dossier'), 'SHIELDED', 0).valid)
      .toBe(false);
    expect(validateCardCombatSelection(profile('card_point_contradiction'), 'SHIELDED', 1).valid)
      .toBe(false);
    expect(validateCardCombatSelection(profile('card_point_contradiction'), 'BROKEN', 1).valid)
      .toBe(true);
    expect(validateCardCombatSelection(profile('card_decisive_proof'), 'SHIELDED', 1).valid)
      .toBe(true);
    expect(validateCardCombatSelection(profile('card_bat_threat'), 'SHIELDED', 0).valid)
      .toBe(true);
  });

  it('breaks a direct leading-question shield on the same full-damage hit', () => {
    const result = applyCardCombatProfile(
      baseResolution('DIRECT'),
      profile('card_leading_question'),
      'SHIELDED',
    );
    expect(result.effects).toMatchObject({
      composureDelta: -10,
      coercionDelta: 2,
      resistanceDelta: -1,
    });
    expect(result.effects.epistemicState).toBeUndefined();
  });

  it('keeps decisive proof and bat threats from damaging shields', () => {
    const proof = applyCardCombatProfile(
      baseResolution('DIRECT'),
      profile('card_decisive_proof'),
      'SHIELDED',
    );
    const batTruth = applyCardCombatProfile(
      baseResolution('TRUTH'),
      profile('card_bat_threat'),
      'SHIELDED',
    );
    const batLie = applyCardCombatProfile(
      baseResolution('UNOPPOSED'),
      profile('card_bat_threat'),
      'SHIELDED',
    );
    expect(proof.effects).toMatchObject({
      composureDelta: -20,
      coercionDelta: 0,
      resistanceDelta: 0,
      epistemicState: 'REFUTED',
    });
    expect(batTruth.effects).toMatchObject({
      composureDelta: 0,
      coercionDelta: 30,
      resistanceDelta: 0,
    });
    expect(batLie.effects).toMatchObject({
      composureDelta: -30,
      coercionDelta: 15,
      resistanceDelta: 0,
    });
  });
});
