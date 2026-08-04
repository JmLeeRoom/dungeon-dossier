import { readFile } from 'node:fs/promises';

import { beforeAll, describe, expect, it } from 'vitest';

import { CaseSchema, type CaseDefinition } from '../../src/engine/domain';

const CASE_FILES = [
  'tutorial/case.json',
  'ep001/case.json',
  'ep004/case.json',
] as const;

const BOSS_IDS = new Set([
  'enc_tutorial_minotaur',
  'enc_ep001_succubus',
  'enc_ep004_fallen_hero',
]);

const EXPECTED_REQUIRED_OBJECTIVES = new Map<string, readonly string[]>([
  [
    'enc_tutorial_slime',
    ['objective_tutorial_when', 'objective_tutorial_survive_turn_2'],
  ],
  [
    'enc_tutorial_harpy',
    ['objective_tutorial_where', 'objective_tutorial_preserve_corridor_photo'],
  ],
  [
    'enc_tutorial_minotaur',
    [
      'objective_tutorial_what',
      'objective_tutorial_minotaur_who',
      'objective_tutorial_minotaur_keep_coercion',
    ],
  ],
  [
    'enc_ep001_goblin',
    ['objective_ep001_goblin_who', 'objective_ep001_goblin_when'],
  ],
  [
    'enc_ep001_orc',
    ['objective_ep001_orc_where', 'objective_ep001_orc_what'],
  ],
  [
    'enc_ep001_succubus',
    [
      'objective_ep001_succubus_how',
      'objective_ep001_succubus_why',
      'objective_ep001_succubus_where',
    ],
  ],
  [
    'enc_ep004_dwarf',
    ['objective_ep004_dwarf_who', 'objective_ep004_dwarf_when'],
  ],
  [
    'enc_ep004_cyclops',
    ['objective_ep004_cyclops_where', 'objective_ep004_cyclops_what'],
  ],
  [
    'enc_ep004_fallen_hero',
    [
      'objective_ep004_fallen_hero_how',
      'objective_ep004_fallen_hero_confirm_when',
      'objective_ep004_fallen_hero_where',
    ],
  ],
]);

const EXPECTED_OPTIONAL_OBJECTIVES = new Map<string, readonly string[]>([
  ['enc_tutorial_slime', ['objective_tutorial_confirm_who']],
  ['enc_ep004_fallen_hero', ['objective_ep004_fallen_hero_why']],
]);

let cases: readonly CaseDefinition[];

async function loadCase(file: (typeof CASE_FILES)[number]): Promise<CaseDefinition> {
  const source = await readFile(
    new URL(`../../content/cases/${file}`, import.meta.url),
    'utf8',
  );
  return CaseSchema.parse(JSON.parse(source) as unknown);
}

beforeAll(async () => {
  cases = await Promise.all(CASE_FILES.map(loadCase));
});

describe('expanded real-content objectives', () => {
  it('authors two required objectives per regular encounter and three per boss', () => {
    const encounters = cases.flatMap((definition) => definition.encounters);
    expect(encounters).toHaveLength(9);

    for (const encounter of encounters) {
      expect(encounter.objectives.required.map((objective) => objective.objective_id)).toEqual(
        EXPECTED_REQUIRED_OBJECTIVES.get(encounter.encounter_id),
      );
      expect(encounter.objectives.required).toHaveLength(
        BOSS_IDS.has(encounter.encounter_id) ? 3 : 2,
      );
      expect(
        encounter.objectives.optional.map((objective) => objective.objective_id),
      ).toEqual(EXPECTED_OPTIONAL_OBJECTIVES.get(encounter.encounter_id) ?? []);
    }
  });

  it('puts confirmation, evidence preservation, and coercion restraint in required goals', () => {
    const required = cases.flatMap((definition) =>
      definition.encounters.flatMap((encounter) => encounter.objectives.required),
    );
    const types = new Set(required.map((objective) => objective.type));

    expect(types.has('CONFIRM_CLAIM')).toBe(true);
    expect(types.has('PRESERVE_EVIDENCE')).toBe(true);
    expect(types.has('KEEP_COERCION_BELOW')).toBe(true);
  });

  it('marks every required claim and gives it a direction-matched starting proof path', () => {
    for (const definition of cases) {
      const evidenceById = new Map(
        definition.evidence.map((evidence) => [evidence.evidence_id, evidence]),
      );
      for (const encounter of definition.encounters) {
        const encounterNodeIds = new Set(
          encounter.flow_nodes.map((node) => node.node_id),
        );
        for (const objective of encounter.objectives.required) {
          if (objective.claim_id === undefined) continue;
          const claim = definition.claims.find(
            (candidate) => candidate.claim_id === objective.claim_id,
          );
          expect(claim?.is_required).toBe(true);

          const direction =
            objective.type === 'CONFIRM_CLAIM' ? 'SUPPORT' : 'CONTRADICT';
          const rules = definition.proof_rules.filter(
            (rule) =>
              rule.target_claim_id === objective.claim_id &&
              rule.direction === direction,
          );
          expect(rules.length).toBeGreaterThanOrEqual(1);
          expect(
            rules.some((rule) =>
              (rule.guaranteed_evidence_sets ?? []).some(
                (set) =>
                  set.length > 0 &&
                  set.every((evidenceId) => {
                    const evidence = evidenceById.get(evidenceId);
                    return (
                      evidence?.acquire.method === 'STARTING' &&
                      encounterNodeIds.has(evidence.acquire.node)
                    );
                  }),
              ),
            ),
          ).toBe(true);
        }
      }
    }
  });

  it('binds non-claim objectives to real starting evidence and explicit limits', () => {
    const tutorial = cases.find(
      (definition) => definition.case_id === 'case_tutorial',
    );
    if (tutorial === undefined) throw new Error('Missing tutorial case.');

    const slime = tutorial.encounters.find(
      (encounter) => encounter.encounter_id === 'enc_tutorial_slime',
    );
    expect(
      slime?.objectives.required.find(
        (objective) => objective.type === 'SURVIVE_UNTIL_TURN',
      )?.turn,
    ).toBe(2);

    const harpy = tutorial.encounters.find(
      (encounter) => encounter.encounter_id === 'enc_tutorial_harpy',
    );
    const preserve = harpy?.objectives.required.find(
      (objective) => objective.type === 'PRESERVE_EVIDENCE',
    );
    const corridorPhoto = tutorial.evidence.find(
      (evidence) => evidence.evidence_id === preserve?.evidence_id,
    );
    expect(corridorPhoto?.acquire).toEqual({
      node: 'node_tutorial_harpy',
      method: 'STARTING',
    });
    expect(corridorPhoto?.integrity?.initial).toBe('INTACT');

    const minotaur = tutorial.encounters.find(
      (encounter) => encounter.encounter_id === 'enc_tutorial_minotaur',
    );
    expect(
      minotaur?.objectives.required.find(
        (objective) => objective.type === 'KEEP_COERCION_BELOW',
      )?.max,
    ).toBe(40);
  });
});
