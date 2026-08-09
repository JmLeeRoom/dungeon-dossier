import { z } from 'zod';

import {
  ActionIntentSchema,
  ContentIdSchema,
  FacetSchema,
  ProofScopeSchema,
} from '../vocabulary';
import {
  ConditionSchema,
  CostSchema,
  EffectSchema,
  JsonSchemaReferenceSchema,
  FiniteNumberSchema,
  LocalizationKeySchema,
  NonEmptyStringSchema,
  NonNegativeIntegerSchema,
  VersionSchema,
  uniqueContentIds,
} from './primitives';

export const CardCombatRoleSchema = z.enum([
  'BASIC_JAB',
  'MENTAL_CONTROL',
  'FINISHER',
  'PHYSICAL_COERCION',
]);

export const CardCombatTargetRuleSchema = z.enum([
  'GAP_OR_SHIELD_ATTEMPT',
  'GAP_OR_BROKEN',
  'BROKEN',
  'ANY_CLAIM',
]);

export const CardCombatEvidenceModeSchema = z.enum([
  'NONE',
  'OPTIONAL_FOR_SHIELD',
  'EXACTLY_ONE',
]);

export const CardCombatShieldModeSchema = z.enum([
  'BREAK_ON_DIRECT',
  'BLOCKED',
  'REQUIRE_BROKEN',
  'IGNORE',
]);

/** P1 nominal combat payload. Generic balance damage must never be added to it. */
export const CardCombatProfileSchema = z.strictObject({
  role: CardCombatRoleSchema,
  composure_delta: FiniteNumberSchema,
  coercion_delta: FiniteNumberSchema,
  target_rule: CardCombatTargetRuleSchema,
  evidence_mode: CardCombatEvidenceModeSchema,
  shield_mode: CardCombatShieldModeSchema,
  shield_damage: z.union([z.literal(0), z.literal(1)]),
});
export type CardCombatProfile = z.infer<typeof CardCombatProfileSchema>;

export const CardTargetSchema = z.strictObject({
  kind: z.enum(['CLAIM', 'ROUTE', 'EVIDENCE', 'SELF', 'SPECIAL']),
  facets: z.array(FacetSchema).optional(),
  required_scopes: z.array(ProofScopeSchema).optional(),
  conditions: z.array(ConditionSchema).optional(),
  min_evidence: NonNegativeIntegerSchema.optional(),
  max_evidence: NonNegativeIntegerSchema.optional(),
});

export const CardChainStepSchema = z.strictObject({
  intent: ActionIntentSchema,
  cost: CostSchema.optional(),
  effects: z.array(EffectSchema),
});

export const CardModifierSchema = z
  .strictObject({
    stamp: z.enum(['BLUE', 'RED']).optional(),
    postit: FacetSchema.optional(),
    clip: z.boolean().optional(),
  })
  .refine((modifier) => Object.keys(modifier).length > 0, {
    message: 'card_modifier must configure a stamp, postit, or clip',
  });

export const CardSchema = z
  .strictObject({
    card_id: ContentIdSchema,
    name_key: LocalizationKeySchema.optional(),
    title_key: LocalizationKeySchema.optional(),
    description_key: LocalizationKeySchema,
    category: z.enum(['BASE', 'SPECIAL', 'EXCLUSIVE']),
    intent: ActionIntentSchema,
    cost: CostSchema,
    target: CardTargetSchema,
    modifiers: z.array(EffectSchema),
    special_effect_id: ContentIdSchema.optional(),
    card_modifier: CardModifierSchema.optional(),
    chain: z.array(CardChainStepSchema).min(2).optional(),
    starting_copies: NonNegativeIntegerSchema,
    acquisition: NonEmptyStringSchema.optional(),
    tags: z.array(NonEmptyStringSchema).optional(),
    /** Transitional definitions stay loadable but never occupy a P1 basic slot. */
    legacy: z.boolean().optional(),
    combat_profile: CardCombatProfileSchema.optional(),
  })
  .refine((card) => card.name_key !== undefined || card.title_key !== undefined, {
    message: 'a card must declare name_key or title_key',
    path: ['name_key'],
  })
  .superRefine((card, context) => {
    if (card.legacy === true && card.combat_profile !== undefined) {
      context.addIssue({
        code: 'custom',
        message: 'a legacy card cannot occupy a P1 combat slot',
        path: ['combat_profile'],
      });
    }
    const profile = card.combat_profile;
    if (profile === undefined) return;
    const expectedShieldDamage = profile.shield_mode === 'BREAK_ON_DIRECT' ? 1 : 0;
    if (profile.shield_damage !== expectedShieldDamage) {
      context.addIssue({
        code: 'custom',
        message: `${profile.shield_mode} requires shield_damage ${expectedShieldDamage}`,
        path: ['combat_profile', 'shield_damage'],
      });
    }
  });
export type CardDefinition = z.infer<typeof CardSchema>;

export const CardsSchema = z
  .strictObject({
    $schema: JsonSchemaReferenceSchema.optional(),
    schema_version: VersionSchema,
    // P1 removes the historical fixed-size fourteen-card catalogue. Five is
    // the minimum viable interrogation bar; expansions and legacy migration
    // may add more definitions without a schema revision.
    cards: z.array(CardSchema).min(5),
    initial_deck: uniqueContentIds().optional(),
  })
  .superRefine((catalogue, context) => {
    const seen = new Set<string>();
    catalogue.cards.forEach((card, index) => {
      if (seen.has(card.card_id)) {
        context.addIssue({
          code: 'custom',
          message: `duplicate card_id: ${card.card_id}`,
          path: ['cards', index, 'card_id'],
        });
      }
      seen.add(card.card_id);
    });
  });
export type CardsDefinition = z.infer<typeof CardsSchema>;
