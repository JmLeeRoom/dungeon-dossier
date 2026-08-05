import { z } from 'zod';

import { ContentIdSchema } from '../vocabulary';
import {
  JsonSchemaReferenceSchema,
  NonNegativeIntegerSchema,
  NonNegativeNumberSchema,
  PositiveIntegerSchema,
  VersionSchema,
} from './primitives';

const NonNegativeBalanceValueSchema = NonNegativeNumberSchema;

export const EncounterBalanceOverrideSchema = z
  .strictObject({
    composureMax: z.number().positive().finite().optional(),
    cpPerTurn: NonNegativeIntegerSchema.optional(),
    cpMax: PositiveIntegerSchema.optional(),
    coercionLimit: z.number().positive().finite().optional(),
    shieldsPerRound: NonNegativeIntegerSchema.optional(),
  })
  .refine((override) => Object.keys(override).length > 0, {
    message: 'an encounter override must replace at least one value',
  });

export const BalanceSchema = z
  .strictObject({
    $schema: JsonSchemaReferenceSchema.optional(),
    schema_version: VersionSchema,
    draw: z.strictObject({
      initial: NonNegativeIntegerSchema,
      perTurn: NonNegativeIntegerSchema,
      handLimit: PositiveIntegerSchema,
      reshuffleOnEmpty: z.boolean(),
    }),
    stress: z.strictObject({
      max: z.number().positive().finite(),
    }),
    dp: z.strictObject({
      initial: NonNegativeBalanceValueSchema,
      rewardBattle: NonNegativeBalanceValueSchema,
    }),
    dmg: z.strictObject({
      contradict: NonNegativeBalanceValueSchema,
      pressure: NonNegativeBalanceValueSchema,
      requery: NonNegativeBalanceValueSchema,
      chainPursuit: NonNegativeBalanceValueSchema,
    }),
    shield: z.strictObject({
      durabilityDefault: z.number().positive().finite(),
    }),
    composureDmg: z.strictObject({
      indirect: NonNegativeBalanceValueSchema,
    }),
    coercion: z.strictObject({
      insufficient: NonNegativeBalanceValueSchema,
      truthAttack: NonNegativeBalanceValueSchema,
      irrelevant: NonNegativeBalanceValueSchema,
      redStampFactor: NonNegativeBalanceValueSchema,
      goblinReflectFactor: NonNegativeBalanceValueSchema,
      breathReduce: NonNegativeBalanceValueSchema,
      finalConfirmReduce: NonNegativeBalanceValueSchema,
    }),
    committedMultiplier: z.number().positive().finite(),
    independence: z.strictObject({
      partialWeight: z.number().min(0).max(1).finite(),
    }),
    partner: z.strictObject({
      cooldowns: z.record(ContentIdSchema, NonNegativeIntegerSchema),
    }),
    trust: z.strictObject({
      max: PositiveIntegerSchema,
      thresholds: z.array(NonNegativeIntegerSchema),
    }),
    composure: z.strictObject({
      regen: z.record(z.string(), NonNegativeBalanceValueSchema),
    }),
    overrides: z.strictObject({
      byEncounter: z.record(ContentIdSchema, EncounterBalanceOverrideSchema),
    }),
    sweetSpot: z.strictObject({
      min: z.number().min(0).max(100).finite(),
      max: z.number().min(0).max(100).finite(),
    }),
  })
  .superRefine((balance, context) => {
    if (balance.draw.initial > balance.draw.handLimit) {
      context.addIssue({
        code: 'custom',
        message: 'draw.initial cannot exceed draw.handLimit',
        path: ['draw', 'initial'],
      });
    }

    if (balance.sweetSpot.min > balance.sweetSpot.max) {
      context.addIssue({
        code: 'custom',
        message: 'sweetSpot.min cannot exceed sweetSpot.max',
        path: ['sweetSpot', 'min'],
      });
    }

    balance.trust.thresholds.forEach((threshold, index, thresholds) => {
      if (threshold > balance.trust.max) {
        context.addIssue({
          code: 'custom',
          message: 'trust threshold cannot exceed trust.max',
          path: ['trust', 'thresholds', index],
        });
      }
      if (index > 0 && threshold <= (thresholds[index - 1] ?? -1)) {
        context.addIssue({
          code: 'custom',
          message: 'trust thresholds must be strictly increasing',
          path: ['trust', 'thresholds', index],
        });
      }
    });
  });
export type BalanceDefinition = z.infer<typeof BalanceSchema>;
