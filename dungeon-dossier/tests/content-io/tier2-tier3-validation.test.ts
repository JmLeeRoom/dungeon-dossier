import { readFile } from 'node:fs/promises';
import { URL } from 'node:url';
import { beforeAll, describe, expect, it } from 'vitest';
import { validateCaseTier2AndTier3 } from '../../src/content-io/ContentSemanticValidator';
import { validateContentFiles } from '../../src/content-io/ToolContentValidator';
import { CaseSchema, type CaseDefinition } from '../../src/engine/domain';

const CASE_SOURCE = 'cases/tutorial/case.json';
let tutorial: CaseDefinition;

function cloneCase(): CaseDefinition {
  return structuredClone(tutorial);
}

function messages(caseDefinition: CaseDefinition): string {
  return validateCaseTier2AndTier3(caseDefinition, CASE_SOURCE)
    .map((problem) => `${problem.kind}:${problem.message}`)
    .join('\n');
}

beforeAll(async () => {
  const source = await readFile(new URL('../../content/cases/tutorial/case.json', import.meta.url), 'utf8');
  tutorial = CaseSchema.parse(JSON.parse(source) as unknown);
});

describe('content validation T2/T3', () => {
  it('accepts the checked-in reachable, solvable tutorial case', () => {
    expect(validateCaseTier2AndTier3(tutorial, CASE_SOURCE)).toEqual([]);
  });

  it('connects T2/T3 failures to the tools/validate build gate', () => {
    const invalid = cloneCase();
    invalid.proof_rules.splice(0);

    expect(validateContentFiles([{ relativePath: CASE_SOURCE, value: invalid }])).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: 'tier2',
          message: expect.stringContaining('REQUIRED_CLAIM_WITHOUT_PROOF') as string,
        }),
      ]),
    );
  });

  it('T2 rejects missing proof rules, unobtainable evidence, and no solvable path', () => {
    const noRule = cloneCase();
    noRule.proof_rules.splice(0);
    expect(messages(noRule)).toContain('REQUIRED_CLAIM_WITHOUT_PROOF');

    const unreachableEvidence = cloneCase();
    const evidence = unreachableEvidence.evidence[0];
    expect(evidence).toBeDefined();
    if (evidence === undefined) return;
    (evidence as { acquire: { node: string; method: string } }).acquire = {
      node: 'unreachable-acquisition-node',
      method: 'INQUIRY',
    };
    const report = messages(unreachableEvidence);
    expect(report).toContain('UNOBTAINABLE_EVIDENCE');
    expect(report).toContain('NO_SOLVABLE_PATH');

    const destructive = cloneCase();
    const encounter = destructive.encounters[0];
    expect(encounter).toBeDefined();
    if (encounter === undefined) return;
    (encounter.modifiers as unknown[]).push({ effect: { type: 'REMOVE_EVIDENCE' } });
    expect(messages(destructive)).toContain('NO_SOLVABLE_PATH');
  });

  it('T2 rejects unreachable and cyclic inquiry routes', () => {
    const raw = structuredClone(tutorial) as unknown as Record<string, unknown>;
    const common = {
      target_slot: 'clm_tutorial_who',
      slot_label_key: 'tutorial.route',
      facet: 'WHO',
      allowed_intents: ['QUERY'],
      reveals: [],
      creates_commitment: false,
      coercion_risk: 0,
      composure_delta: 0,
      single_use: true,
    };
    raw.inquiry_routes = [
      {
        ...common,
        route_id: 'route_tutorial_a',
        preconditions: [{ type: 'ROUTE_USED', route_id: 'route_tutorial_b' }],
        unlocks_routes: ['route_tutorial_b'],
      },
      {
        ...common,
        route_id: 'route_tutorial_b',
        preconditions: [{ type: 'ROUTE_USED', route_id: 'route_tutorial_a' }],
        unlocks_routes: ['route_tutorial_a'],
      },
    ];
    const report = messages(CaseSchema.parse(raw));

    expect(report).toContain('UNREACHABLE_ROUTE');
    expect(report).toContain('CYCLIC_PATH');
  });

  it('T3 rejects invalid guaranteed sets, flag branching, private fields, and bad spans', () => {
    const invalid = cloneCase();
    const rule = invalid.proof_rules[0];
    const node = invalid.encounters[0]?.flow_nodes[0];
    const statement = invalid.dialogue.statements.clm_tutorial_who;
    expect(rule).toBeDefined();
    expect(node).toBeDefined();
    expect(statement).toBeDefined();
    if (rule === undefined || node === undefined || statement === undefined) return;

    (rule.requirements.required_scopes as string[]).splice(0, 1, 'TIME');
    (node.enter_conditions as unknown[]).push({ type: 'FLAG_EQUALS', flag_id: 'F-01', value: true });
    (invalid.dialogue as unknown as Record<string, unknown>).truth_relation = 'PRIVATE';
    const firstSpan = statement.spans[0];
    expect(firstSpan).toBeDefined();
    if (firstSpan === undefined) return;
    (firstSpan as { end: number }).end = 10_000;

    const report = messages(invalid);
    expect(report).toContain('INVALID_GUARANTEED_SET');
    expect(report).toContain('FLAG_ENGINE_BRANCH');
    expect(report).toContain('PRIVATE_FIELD_LEAK');
    expect(report).toContain('AI_SPAN_INTEGRITY');
  });
});
