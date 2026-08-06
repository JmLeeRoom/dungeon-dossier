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
  type ResolutionTableRow,
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

  it('resolves every one of the 432 axis combinations without throwing', () => {
    let combinations = 0;
    for (const intent of EVIDENCE_INTENTS) {
      for (const relevance of RELEVANCES) {
        for (const relation of RELATIONS) {
          for (const sufficiency of SUFFICIENCIES) {
            for (const independence of INDEPENDENCE_RESULTS) {
              for (const hypotheses of HYPOTHESIS_RESULTS) {
                combinations += 1;
                const code = lookupResolutionCode({
                  intent,
                  relevance,
                  relation,
                  sufficiency,
                  independence,
                  hypotheses,
                });
                expect(code).toMatch(/^R_/);
              }
            }
          }
        }
      }
    }
    expect(combinations).toBe(432);
  });

  it('covers the full table explicitly so the runtime fallback row stays cold', () => {
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
                const authored = (RESOLUTION_TABLE as readonly ResolutionTableRow[]).some((row) =>
                  row.intent === input.intent &&
                  (row.relevance === '*' || row.relevance === input.relevance) &&
                  (row.relation === '*' || row.relation === input.relation) &&
                  (row.sufficiency === '*' || row.sufficiency === input.sufficiency) &&
                  (row.independence === '*' || row.independence === input.independence) &&
                  (row.hypotheses === '*' || row.hypotheses === input.hypotheses),
                );
                expect(authored, JSON.stringify(input)).toBe(true);
              }
            }
          }
        }
      }
    }
  });
});
