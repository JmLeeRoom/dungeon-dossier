import { readFile } from 'node:fs/promises';

import { describe, expect, it } from 'vitest';

import { CaseSchema, type CaseDefinition } from '../../src/content-io';

const CASE_FILES = [
  'tutorial/case.json',
  'ep001/case.json',
  'ep004/case.json',
] as const;

const FACETS = ['HOW', 'WHAT', 'WHEN', 'WHERE', 'WHO', 'WHY'] as const;

async function loadCase(relativePath: string): Promise<CaseDefinition> {
  const source = await readFile(
    new URL(`../../content/cases/${relativePath}`, import.meta.url),
    'utf8',
  );
  return CaseSchema.parse(JSON.parse(source) as unknown);
}

describe('P1 confrontation content', () => {
  it.each(CASE_FILES)(
    '%s authors every round as six facets, one proof weakness, and truth traps',
    async (relativePath) => {
      const definition = await loadCase(relativePath);
      const claims = new Map(definition.claims.map((claim) => [claim.claim_id, claim]));
      const evidence = new Map(
        definition.evidence.map((entry) => [entry.evidence_id, entry]),
      );

      for (const encounter of definition.encounters) {
        for (const [roundIndex, round] of encounter.rounds.entries()) {
          const roundLabel = `${encounter.encounter_id}/${round.round_id}`;
          expect(
            round.statement_claims
              .map((claimId) => claims.get(claimId)?.facet)
              .sort(),
            roundLabel,
          ).toEqual(FACETS);
          expect(round.shields.length, roundLabel).toBeGreaterThanOrEqual(2);
          expect(round.shields.length, roundLabel).toBeLessThanOrEqual(3);
          expect(round.shields.every((shield) => shield.durability === 1), roundLabel)
            .toBe(true);

          const weaknessIds = round.shields.flatMap((shield) => {
            const claim = claims.get(shield.claim_id);
            const hasDirectPath = definition.proof_rules.some(
              (rule) =>
                rule.target_claim_id === shield.claim_id
                && rule.direction === 'CONTRADICT'
                && (rule.guaranteed_evidence_sets?.length ?? 0) > 0,
            );
            return claim?.truth.relation === 'CONTRADICTED_BY_WORLD' && hasDirectPath
              ? [shield.claim_id]
              : [];
          });
          expect(weaknessIds, roundLabel).toHaveLength(1);

          const truthTrapIds = round.shields.flatMap((shield) => {
            const claim = claims.get(shield.claim_id);
            const supportRules = definition.proof_rules.filter(
              (rule) =>
                rule.target_claim_id === shield.claim_id
                && rule.direction === 'SUPPORT',
            );
            const hasAcquirableSupport = supportRules.some((rule) =>
              (rule.guaranteed_evidence_sets ?? []).some((set) =>
                set.every((evidenceId) => evidence.get(evidenceId)?.acquire.method === 'STARTING')
                && set.some((evidenceId) =>
                  evidence.get(evidenceId)?.observations.some((observation) =>
                    observation.supports_claim_ids?.includes(shield.claim_id) === true,
                  ) === true,
                ),
              ),
            );
            return claim?.truth.relation === 'CONSISTENT_WITH_WORLD' && hasAcquirableSupport
              ? [shield.claim_id]
              : [];
          });
          expect(truthTrapIds, roundLabel).toHaveLength(round.shields.length - 1);

          if (roundIndex > 0) {
            const priorRound = encounter.rounds[roundIndex - 1];
            const priorWeaknessId = priorRound?.shields.find((shield) =>
              definition.proof_rules.some(
                (rule) =>
                  rule.target_claim_id === shield.claim_id
                  && rule.direction === 'CONTRADICT'
                  && (rule.guaranteed_evidence_sets?.length ?? 0) > 0,
              ),
            )?.claim_id;
            expect(
              encounter.flow_nodes[roundIndex]?.enter_conditions.some(
                (condition) =>
                  condition.type === 'CLAIM_EPISTEMIC'
                  && condition.claim_id === priorWeaknessId
                  && condition.state === 'REFUTED',
              ),
              `${roundLabel} advance_when`,
            ).toBe(true);
          }
        }
      }
    },
  );
});
