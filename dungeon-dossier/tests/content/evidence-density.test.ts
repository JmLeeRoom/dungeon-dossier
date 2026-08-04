import { readFile } from 'node:fs/promises';

import { beforeAll, describe, expect, it } from 'vitest';

import { CaseSchema, type CaseDefinition } from '../../src/engine/domain';

const CASE_FILES = [
  'tutorial/case.json',
  'ep001/case.json',
  'ep004/case.json',
] as const;

let cases: readonly CaseDefinition[];

async function loadCase(file: (typeof CASE_FILES)[number]): Promise<CaseDefinition> {
  const source = await readFile(
    new URL(`../../content/cases/${file}`, import.meta.url),
    'utf8',
  );
  return CaseSchema.parse(JSON.parse(source) as unknown);
}

function caseById(caseId: string): CaseDefinition {
  const definition = cases.find((candidate) => candidate.case_id === caseId);
  if (definition === undefined) throw new Error(`Missing real case ${caseId}.`);
  return definition;
}

beforeAll(async () => {
  cases = await Promise.all(CASE_FILES.map(loadCase));
});

describe('real-content evidence density', () => {
  it('keeps every case at eight authored evidence items with at least one B grade', () => {
    for (const definition of cases) {
      expect(definition.evidence.length).toBeGreaterThanOrEqual(8);
      expect(definition.evidence.length).toBeLessThanOrEqual(10);
      expect(definition.evidence).toHaveLength(8);
      expect(
        definition.evidence.some((evidence) => evidence.grade.initial === 'B'),
      ).toBe(true);
    }
  });

  it('retains scopes, complete independence metadata, and proof boundaries', () => {
    for (const definition of cases) {
      const evidenceIds = new Set(
        definition.evidence.map((evidence) => evidence.evidence_id),
      );
      expect(evidenceIds.size).toBe(definition.evidence.length);

      for (const evidence of definition.evidence) {
        expect(evidence.source_category.length).toBeGreaterThan(0);
        expect(evidence.independence.source_id.length).toBeGreaterThan(0);
        expect(evidence.independence.group.length).toBeGreaterThan(0);
        expect(evidence.independence).toHaveProperty('derived_from');
        if (evidence.independence.derived_from !== null) {
          expect(evidenceIds.has(evidence.independence.derived_from)).toBe(true);
        }
        expect(evidence.observations.length).toBeGreaterThanOrEqual(1);
        for (const observation of evidence.observations) {
          expect(observation.scopes.length).toBeGreaterThanOrEqual(1);
        }
        expect(evidence.not_proven_keys.length).toBeGreaterThanOrEqual(1);
      }
    }
  });

  it('adds the two tutorial forensic records at their intended encounter starts', () => {
    const tutorial = caseById('case_tutorial');
    const wingprint = tutorial.evidence.find(
      (evidence) => evidence.evidence_id === 'ev_tutorial_cabinet_wingprint',
    );
    const handle = tutorial.evidence.find(
      (evidence) => evidence.evidence_id === 'ev_tutorial_handle_forensics',
    );

    expect(wingprint?.grade.initial).toBe('A');
    expect(wingprint?.acquire).toEqual({
      node: 'node_tutorial_harpy',
      method: 'STARTING',
    });
    expect(wingprint?.observations[0]?.contradicts_claim_ids).toContain(
      'clm_tutorial_harpy_who',
    );
    expect(handle?.grade.initial).toBe('A');
    expect(handle?.acquire).toEqual({
      node: 'node_tutorial_minotaur',
      method: 'STARTING',
    });
    expect(handle?.observations[0]?.contradicts_claim_ids).toContain(
      'clm_tutorial_minotaur_who',
    );
  });

  it('provides two independent Succubus location proof routes', () => {
    const ep001 = caseById('case_ep001_red_ledger');
    const register = ep001.evidence.find(
      (evidence) => evidence.evidence_id === 'ev_ep001_reception_register',
    );
    const backup = ep001.evidence.find(
      (evidence) => evidence.evidence_id === 'ev_ep001_orc_backup_bundle',
    );
    const rule = ep001.proof_rules.find(
      (candidate) => candidate.rule_id === 'rule_ep001_succubus_where',
    );

    expect(register?.grade.initial).toBe('A');
    expect(register?.acquire.node).toBe('node_ep001_succubus_start');
    expect(backup?.observations.some((observation) =>
      observation.contradicts_claim_ids?.includes('clm_ep001_succubus_where'),
    )).toBe(true);
    expect(rule?.guaranteed_evidence_sets).toEqual([
      ['ev_ep001_reception_register'],
      ['ev_ep001_orc_backup_bundle', 'ev_ep001_seal_residue'],
    ]);
  });

  it('pairs the B platform manifest with an independent signal log', () => {
    const ep004 = caseById('case_ep004_midnight_express');
    const manifest = ep004.evidence.find(
      (evidence) => evidence.evidence_id === 'ev_ep004_platform_manifest',
    );
    const signal = ep004.evidence.find(
      (evidence) => evidence.evidence_id === 'ev_ep004_signal_switch_log',
    );
    const whereRule = ep004.proof_rules.find(
      (rule) => rule.rule_id === 'rule_ep004_fallen_hero_where',
    );
    const howRule = ep004.proof_rules.find(
      (rule) => rule.rule_id === 'rule_ep004_how',
    );
    const whenRule = ep004.proof_rules.find(
      (rule) => rule.rule_id === 'rule_ep004_fallen_hero_when',
    );

    expect(manifest?.grade.initial).toBe('B');
    expect(signal?.grade.initial).toBe('A');
    expect(manifest?.independence.group).not.toBe(signal?.independence.group);
    expect(whereRule?.requirements.minimum_independent_sources).toBe(2);
    expect(whereRule?.guaranteed_evidence_sets).toEqual([[
      'ev_ep004_platform_manifest',
      'ev_ep004_signal_switch_log',
    ]]);
    expect(howRule?.guaranteed_evidence_sets).toContainEqual([
      'ev_ep004_signal_switch_log',
    ]);
    expect(signal?.observations.some((observation) =>
      observation.supports_claim_ids?.includes('clm_ep004_fallen_hero_when'),
    )).toBe(true);
    expect(whenRule?.direction).toBe('SUPPORT');
    expect(whenRule?.guaranteed_evidence_sets).toEqual([[
      'ev_ep004_signal_switch_log',
    ]]);
  });
});
