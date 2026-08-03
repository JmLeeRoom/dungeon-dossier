import { z } from 'zod';

import { ContentIdSchema } from '../vocabulary';
import {
  ConditionSchema,
  JsonSchemaReferenceSchema,
  NonNegativeIntegerSchema,
  NonNegativeNumberSchema,
  PositiveIntegerSchema,
  VersionSchema,
} from './primitives';

export const RewardSchema = z
  .strictObject({
    reward_id: ContentIdSchema,
    type: z.enum(['CARD', 'ENHANCEMENT', 'RELIC', 'RESOURCE']),
    reference_id: ContentIdSchema.optional(),
    resource: z.enum(['DP', 'STRESS', 'TRUST']).optional(),
    amount: NonNegativeNumberSchema.optional(),
    rarity: z.enum(['COMMON', 'UNCOMMON', 'RARE', 'CASE', 'LEGENDARY']),
    weight: z.number().positive().finite(),
    min_act: NonNegativeIntegerSchema.optional(),
    max_act: NonNegativeIntegerSchema.optional(),
    episode_ids: z.array(ContentIdSchema).optional(),
    conditions: z.array(ConditionSchema).optional(),
  })
  .superRefine((reward, context) => {
    if (reward.type === 'RESOURCE' && reward.resource === undefined) {
      context.addIssue({
        code: 'custom',
        message: 'RESOURCE rewards require resource',
        path: ['resource'],
      });
    }
    if (reward.type !== 'RESOURCE' && reward.reference_id === undefined) {
      context.addIssue({
        code: 'custom',
        message: `${reward.type} rewards require reference_id`,
        path: ['reference_id'],
      });
    }
    if (
      reward.min_act !== undefined &&
      reward.max_act !== undefined &&
      reward.min_act > reward.max_act
    ) {
      context.addIssue({
        code: 'custom',
        message: 'min_act cannot exceed max_act',
        path: ['min_act'],
      });
    }
  });
export type RewardDefinition = z.infer<typeof RewardSchema>;

export const RewardsSchema = z
  .strictObject({
    $schema: JsonSchemaReferenceSchema.optional(),
    schema_version: VersionSchema,
    selection: z.strictObject({
      battle_choices: PositiveIntegerSchema,
      boss_choices: PositiveIntegerSchema,
    }),
    rewards: z.array(RewardSchema),
  })
  .superRefine((catalogue, context) => {
    const seen = new Set<string>();
    catalogue.rewards.forEach((reward, index) => {
      if (seen.has(reward.reward_id)) {
        context.addIssue({
          code: 'custom',
          message: `duplicate reward_id: ${reward.reward_id}`,
          path: ['rewards', index, 'reward_id'],
        });
      }
      seen.add(reward.reward_id);
    });
  });
export type RewardsDefinition = z.infer<typeof RewardsSchema>;
