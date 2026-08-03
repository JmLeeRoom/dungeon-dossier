import { describe, expect, it } from 'vitest';
import {
  HYPOTHESIS_RESULTS,
  INDEPENDENCE_RESULTS,
  RELATIONS,
  RELEVANCES,
  RESOLUTION_TABLE,
  SUFFICIENCIES,
  lookupResolutionCode,
  lookupResolutionTableRow,
  type ResolutionTableInput,
} from '../../src/engine/resolution';

const EVIDENCE_INTENTS = ['CONTRADICT', 'CONFIRM'] as const;

function findWitness(row: (typeof RESOLUTION_TABLE)[number]): ResolutionTableInput | undefined {
  for (const intent of EVIDENCE_INTENTS) {
    for (const relevance of RELEVANCES) {
      for (const relation of RELATIONS) {
        for (const sufficiency of SUFFICIENCIES) {
          for (const independence of INDEPENDENCE_RESULTS) {
            for (const hypotheses of HYPOTHESIS_RESULTS) {
              const input = {
                intent,
                relevance,
                relation,
                sufficiency,
                independence,
                hypotheses,
              } satisfies ResolutionTableInput;
              try {
                if (lookupResolutionTableRow(input) === row) return input;
              } catch {
                // Undefined combinations are expected while searching for a witness.
              }
            }
          }
        }
      }
    }
  }
  return undefined;
}

describe('type-safe resolution lookup table', () => {
  it.each(RESOLUTION_TABLE.map((row, index) => [index, row] as const))(
    'has a reachable witness for row %i',
    (_index, row) => {
      const witness = findWitness(row);
      expect(witness).toBeDefined();
      expect(lookupResolutionCode(witness as ResolutionTableInput)).toBe(row.code);
    },
  );

  it('throws explicitly for a combination absent from the table', () => {
    expect(() =>
      lookupResolutionCode({
        intent: 'CONFIRM',
        relevance: 'PARTIAL',
        relation: 'NEUTRAL',
        sufficiency: 'SUFFICIENT',
        independence: 'MET',
        hypotheses: 'NOT_APPLICABLE',
      }),
    ).toThrow('Undefined resolution combination');
  });
});
