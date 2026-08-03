import { describe, expect, it } from 'vitest';
import caseFixture from '../../content/cases/tutorial/case.json';
import dialogueFixture from '../../content/cases/tutorial/dialogue.json';
import type {
  CaseDefinition,
  DialogueDefinition,
} from '../../src/content-io/schemas';
import { validateLiveCaseDialogue } from '../../src/dev/content';

interface EditorFixtures {
  readonly caseData: CaseDefinition;
  readonly dialogueData: DialogueDefinition;
}

function fixturesWithEvidenceAndReaction(): EditorFixtures {
  const caseData = structuredClone(caseFixture) as unknown as CaseDefinition;
  const dialogueData = structuredClone(dialogueFixture) as unknown as DialogueDefinition;
  const encounter = caseData.encounters[0];
  if (encounter === undefined) throw new Error('Tutorial fixture needs one encounter.');

  encounter.flow_nodes.push({
    node_id: 'node_editor_start',
    enter_conditions: [],
    reveal_claim_ids: [],
    revise_claim_ids: [],
    open_route_ids: [],
    activate_modifiers: [],
    deactivate_modifiers: [],
    reaction_key: 'reaction.editor.start',
    resource_delta: {},
    is_terminal: false,
  });
  dialogueData.reactions['reaction.editor.start'] = ['편집기 반응 대사입니다.'];
  caseData.evidence.push({
    evidence_id: 'ev_editor_schedule',
    title_key: 'evidence.editor.schedule.title',
    acquire: { node: 'node_editor_start', method: 'STARTING' },
    source_category: 'DOCUMENT',
    independence: {
      source_id: 'source_editor_schedule',
      group: 'DOCUMENT',
      derived_from: null,
    },
    grade: { initial: 'A', upgrades: [] },
    observations: [
      {
        observation_id: 'obs_editor_schedule',
        subject_id: 'ent_tutorial_slime',
        predicate: 'RECORDED_AT_TIME',
        summary_key: 'evidence.editor.schedule.observation',
        scopes: ['TIME'],
        detail: {},
        confidence: 1,
        supports_claim_ids: ['clm_tutorial_who'],
      },
    ],
    not_proven_keys: ['evidence.editor.schedule.not_proven'],
  });
  return { caseData, dialogueData };
}

describe('live case/dialogue validation', () => {
  it('accepts a schema-valid, fully referenced editor draft', () => {
    const { caseData, dialogueData } = fixturesWithEvidenceAndReaction();
    expect(
      validateLiveCaseDialogue(caseData, dialogueData, {
        caseSource: 'cases/editor/case.json',
        dialogueSource: 'cases/editor/dialogue.json',
      }),
    ).toEqual({ valid: true, issues: [] });
  });

  it('reports malformed claim, evidence, and reaction references with editor paths', () => {
    const { caseData, dialogueData } = fixturesWithEvidenceAndReaction();
    const encounter = caseData.encounters[0];
    const evidence = caseData.evidence[0];
    if (encounter === undefined || evidence === undefined) throw new Error('Fixture incomplete.');
    const round = encounter.rounds[0];
    const observation = evidence.observations[0];
    const flowNode = encounter.flow_nodes[0];
    if (round === undefined || observation === undefined || flowNode === undefined) {
      throw new Error('Fixture nested records incomplete.');
    }

    round.statement_claims[0] = 'clm_missing';
    observation.supports_claim_ids = ['clm_missing'];
    evidence.independence.derived_from = 'ev_missing';
    flowNode.reaction_key = 'reaction.missing';

    const result = validateLiveCaseDialogue(caseData, dialogueData);
    const unresolved = result.issues.filter(
      (issue) => issue.code === 'UNRESOLVED_REFERENCE',
    );
    expect(result.valid).toBe(false);
    expect(unresolved.map((issue) => issue.referenceId)).toEqual(
      expect.arrayContaining(['clm_missing', 'ev_missing', 'reaction.missing']),
    );
    expect(unresolved).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          document: 'case',
          path: ['encounters', 0, 'rounds', 0, 'statement_claims', 0],
          referenceId: 'clm_missing',
        }),
        expect.objectContaining({
          document: 'case',
          path: ['evidence', 0, 'independence', 'derived_from'],
          referenceId: 'ev_missing',
        }),
        expect.objectContaining({
          document: 'case',
          path: ['encounters', 0, 'flow_nodes', 0, 'reaction_key'],
          referenceId: 'reaction.missing',
        }),
      ]),
    );
    expect(result.issues).toContainEqual(
      expect.objectContaining({
        code: 'MISSING_FALLBACK',
        document: 'dialogue',
        path: ['reactions', 'reaction.missing'],
      }),
    );
  });

  it('gives missing observation scopes a dedicated real-time issue', () => {
    const { caseData, dialogueData } = fixturesWithEvidenceAndReaction();
    const observation = caseData.evidence[0]?.observations[0];
    if (observation === undefined) throw new Error('Fixture observation missing.');
    observation.scopes = [];

    const result = validateLiveCaseDialogue(caseData, dialogueData);
    expect(result.issues).toContainEqual({
      code: 'MISSING_OBSERVATION_SCOPES',
      document: 'case',
      source: 'case.json',
      path: ['evidence', 0, 'observations', 0, 'scopes'],
      message: 'Evidence observation must declare at least one proof scope.',
    });
    expect(
      result.issues.filter(
        (issue) =>
          issue.code === 'SCHEMA_INVALID' &&
          issue.path.join('.') === 'evidence.0.observations.0.scopes',
      ),
    ).toEqual([]);
  });

  it('enforces A-6 for every claim and every defined or referenced ReactionKey', () => {
    const { caseData, dialogueData } = fixturesWithEvidenceAndReaction();
    const statement = dialogueData.statements.clm_tutorial_who;
    if (statement === undefined) throw new Error('Fixture statement missing.');
    statement.fallback = [];
    dialogueData.reactions['reaction.editor.start'] = [];
    dialogueData.reactions['reaction.unused'] = [];

    const result = validateLiveCaseDialogue(caseData, dialogueData);
    const missing = result.issues.filter((issue) => issue.code === 'MISSING_FALLBACK');
    expect(missing).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          path: ['statements', 'clm_tutorial_who', 'fallback'],
          referenceId: 'clm_tutorial_who',
        }),
        expect.objectContaining({
          path: ['reactions', 'reaction.editor.start'],
          referenceId: 'reaction.editor.start',
        }),
        expect.objectContaining({
          path: ['reactions', 'reaction.unused'],
          referenceId: 'reaction.unused',
        }),
      ]),
    );
    expect(missing).toHaveLength(3);
  });

  it('still returns schema diagnostics for malformed case and dialogue shapes', () => {
    const result = validateLiveCaseDialogue(
      { claims: 'not-an-array', evidence: [] },
      { statements: [], reactions: [] },
    );
    expect(result.valid).toBe(false);
    expect(result.issues.some((issue) => issue.code === 'SCHEMA_INVALID')).toBe(true);
    expect(result.issues.some((issue) => issue.document === 'case')).toBe(true);
    expect(result.issues.some((issue) => issue.document === 'dialogue')).toBe(true);
  });
});
