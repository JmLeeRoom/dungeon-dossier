import { z } from 'zod';

import {
  ClaimDefinitionSchema,
  ClaimTruthSchema,
} from './schemas/claim';
import { uniqueContentIds } from './schemas/primitives';

export const TruthRecordSchema = z.strictObject({
  claim: ClaimDefinitionSchema,
  truth: z.strictObject({
    relation: ClaimTruthSchema.shape.relation,
    contradictingEvents: uniqueContentIds(),
  }),
});
export type TruthRecord = z.infer<typeof TruthRecordSchema>;

export const TruthGraphSchema = z.strictObject({
  records: z.array(TruthRecordSchema),
});
export type TruthGraph = z.infer<typeof TruthGraphSchema>;

function deepFreeze<T>(value: T): Readonly<T> {
  if (value !== null && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) {
      deepFreeze(child);
    }

    Object.freeze(value);
  }

  return value;
}

/** Creates the runtime read-only truth layer after content validation. */
export function createTruthGraph(records: readonly TruthRecord[]): Readonly<TruthGraph> {
  const graph: TruthGraph = {
    records: records.map((record) => ({
      claim: { ...record.claim },
      truth: {
        relation: record.truth.relation,
        contradictingEvents: [...record.truth.contradictingEvents],
      },
    })),
  };

  return deepFreeze(graph);
}
