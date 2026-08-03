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
  LocalizationKeySchema,
  NonEmptyStringSchema,
  NonNegativeIntegerSchema,
  VersionSchema,
  uniqueContentIds,
} from './primitives';

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
    chain: z.array(CardChainStepSchema).min(2).optional(),
    starting_copies: NonNegativeIntegerSchema,
    acquisition: NonEmptyStringSchema.optional(),
    tags: z.array(NonEmptyStringSchema).optional(),
  })
  .refine((card) => card.name_key !== undefined || card.title_key !== undefined, {
    message: 'a card must declare name_key or title_key',
    path: ['name_key'],
  });
export type CardDefinition = z.infer<typeof CardSchema>;

export const CardsSchema = z
  .strictObject({
    $schema: JsonSchemaReferenceSchema.optional(),
    schema_version: VersionSchema,
    cards: z.array(CardSchema).length(14),
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
