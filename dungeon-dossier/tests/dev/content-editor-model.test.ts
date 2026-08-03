import { describe, expect, it } from 'vitest';
import caseFixture from '../../content/cases/tutorial/case.json';
import dialogueFixture from '../../content/cases/tutorial/dialogue.json';
import type {
  CaseDefinition,
  DialogueDefinition,
} from '../../src/content-io/schemas';
import {
  createContentEditorModel,
  replaceCaseData,
  replaceDialogueData,
  revalidateContentEditorModel,
  setClaimFallbackLines,
  setReactionFallbackLines,
  updateClaim,
  updateEvidence,
  updateObservation,
} from '../../src/dev/content';

function tutorialFixtures(): {
  caseData: CaseDefinition;
  dialogueData: DialogueDefinition;
} {
  return {
    caseData: structuredClone(caseFixture) as unknown as CaseDefinition,
    dialogueData: structuredClone(dialogueFixture),
  };
}

function addEditorEvidence(caseData: CaseDefinition): void {
  const encounter = caseData.encounters[0];
  if (encounter === undefined) throw new Error('Tutorial fixture needs one encounter.');
  encounter.flow_nodes.push({
    node_id: 'node_editor',
    enter_conditions: [],
    reveal_claim_ids: [],
    revise_claim_ids: [],
    open_route_ids: [],
    activate_modifiers: [],
    deactivate_modifiers: [],
    reaction_key: 'reaction.editor',
    resource_delta: {},
    is_terminal: false,
  });
  caseData.evidence.push({
    evidence_id: 'ev_editor',
    title_key: 'evidence.editor.title',
    acquire: { node: 'node_editor', method: 'STARTING' },
    source_category: 'DOCUMENT',
    independence: {
      source_id: 'source_editor',
      group: 'DOCUMENT',
      derived_from: null,
    },
    grade: { initial: 'A', upgrades: [] },
    observations: [
      {
        predicate: 'RECORDED_AT_TIME',
        summary_key: 'evidence.editor.observation',
        scopes: ['TIME'],
        detail: {},
        confidence: 1,
        supports_claim_ids: ['clm_tutorial_who'],
      },
    ],
    not_proven_keys: ['evidence.editor.not_proven'],
  });
}

describe('immutable live content editor model', () => {
  it('clones and deep-freezes the initial drafts with validation metadata', () => {
    const { caseData, dialogueData } = tutorialFixtures();
    const model = createContentEditorModel(caseData, dialogueData, {
      caseSource: 'cases/live/case.json',
      dialogueSource: 'cases/live/dialogue.json',
    });
    caseData.metadata.title = '외부에서 바꾼 제목';

    const storedCase = model.caseData as CaseDefinition;
    expect(model.revision).toBe(0);
    expect(model.validation).toEqual({ valid: true, issues: [] });
    expect(model.caseSource).toBe('cases/live/case.json');
    expect(storedCase.metadata.title).toBe('황금 엘릭서 믹스커피 절도');
    expect(Object.isFrozen(model)).toBe(true);
    expect(Object.isFrozen(storedCase)).toBe(true);
    expect(Object.isFrozen(storedCase.claims)).toBe(true);
    expect(Object.isFrozen(model.validation.issues)).toBe(true);
  });

  it('updates a claim immutably, increments revision, and revalidates', () => {
    const { caseData, dialogueData } = tutorialFixtures();
    const initial = createContentEditorModel(caseData, dialogueData);
    const updated = updateClaim(initial, 'clm_tutorial_who', {
      canonical_meaning: '편집한 의미',
    });

    const initialClaim = (initial.caseData as CaseDefinition).claims[0];
    const updatedClaim = (updated.caseData as CaseDefinition).claims[0];
    expect(initialClaim?.canonical_meaning).not.toBe('편집한 의미');
    expect(updatedClaim?.canonical_meaning).toBe('편집한 의미');
    expect(updated.revision).toBe(1);
    expect(updated.validation.valid).toBe(true);
    expect(updated.dialogueData).toBe(initial.dialogueData);
  });

  it('edits claim fallback lines without mutating spans or the prior revision', () => {
    const { caseData, dialogueData } = tutorialFixtures();
    const initial = createContentEditorModel(caseData, dialogueData);
    const invalid = setClaimFallbackLines(initial, 'clm_tutorial_who', []);

    expect(initial.validation.valid).toBe(true);
    expect(invalid.validation.valid).toBe(false);
    expect(invalid.validation.issues).toContainEqual(
      expect.objectContaining({
        code: 'MISSING_FALLBACK',
        path: ['statements', 'clm_tutorial_who', 'fallback'],
      }),
    );
    const initialDialogue = initial.dialogueData as DialogueDefinition;
    const invalidDialogue = invalid.dialogueData as DialogueDefinition;
    expect(initialDialogue.statements.clm_tutorial_who?.fallback).toHaveLength(1);
    expect(invalidDialogue.statements.clm_tutorial_who?.spans).toEqual(
      initialDialogue.statements.clm_tutorial_who?.spans,
    );

    const repaired = setClaimFallbackLines(invalid, 'clm_tutorial_who', ['수정한 대사']);
    expect(repaired.validation.valid).toBe(true);
    expect(repaired.revision).toBe(2);
  });

  it('updates evidence and an observation as isolated immutable branches', () => {
    const { caseData, dialogueData } = tutorialFixtures();
    addEditorEvidence(caseData);
    dialogueData.reactions['reaction.editor'] = ['반응'];
    const initial = createContentEditorModel(caseData, dialogueData);
    const renamed = updateEvidence(initial, 'ev_editor', {
      title_key: 'evidence.editor.renamed',
    });
    const missingScopes = updateObservation(renamed, 'ev_editor', 0, { scopes: [] });

    const initialEvidenceList = (initial.caseData as CaseDefinition).evidence;
    const renamedEvidenceList = (renamed.caseData as CaseDefinition).evidence;
    const editorIndex = initialEvidenceList.findIndex(
      (evidence) => evidence.evidence_id === 'ev_editor',
    );
    const initialEvidence = initialEvidenceList[editorIndex];
    const renamedEvidence = renamedEvidenceList[editorIndex];
    expect(initialEvidence?.title_key).toBe('evidence.editor.title');
    expect(renamedEvidence?.title_key).toBe('evidence.editor.renamed');
    expect(initialEvidence?.observations[0]?.scopes).toEqual(['TIME']);
    expect(missingScopes.validation.issues).toContainEqual(
      expect.objectContaining({
        code: 'MISSING_OBSERVATION_SCOPES',
        path: ['evidence', editorIndex, 'observations', 0, 'scopes'],
      }),
    );
    expect(missingScopes.revision).toBe(2);
  });

  it('creates a missing ReactionKey fallback and clears both live errors', () => {
    const { caseData, dialogueData } = tutorialFixtures();
    addEditorEvidence(caseData);
    const initial = createContentEditorModel(caseData, dialogueData);
    expect(initial.validation.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: 'UNRESOLVED_REFERENCE',
          referenceId: 'reaction.editor',
        }),
        expect.objectContaining({
          code: 'MISSING_FALLBACK',
          referenceId: 'reaction.editor',
        }),
      ]),
    );

    const repaired = setReactionFallbackLines(initial, 'reaction.editor', ['새 반응']);
    expect(repaired.validation).toEqual({ valid: true, issues: [] });
    expect(
      (repaired.dialogueData as DialogueDefinition).reactions['reaction.editor'],
    ).toEqual(['새 반응']);
    expect((initial.dialogueData as DialogueDefinition).reactions['reaction.editor']).toBeUndefined();
  });

  it('replaces whole drafts immutably and supports explicit revalidation', () => {
    const { caseData, dialogueData } = tutorialFixtures();
    const initial = createContentEditorModel(caseData, dialogueData);
    const replacedCase = replaceCaseData(initial, {});
    const replacedDialogue = replaceDialogueData(initial, {});

    expect(replacedCase.revision).toBe(1);
    expect(replacedCase.validation.valid).toBe(false);
    expect(replacedDialogue.revision).toBe(1);
    expect(replacedDialogue.validation.valid).toBe(false);
    expect(initial.validation.valid).toBe(true);

    const revalidated = revalidateContentEditorModel(initial);
    expect(revalidated).not.toBe(initial);
    expect(revalidated.revision).toBe(initial.revision);
    expect(revalidated.validation).toEqual(initial.validation);
  });

  it('rejects edits aimed at unknown records or observation indexes', () => {
    const { caseData, dialogueData } = tutorialFixtures();
    const model = createContentEditorModel(caseData, dialogueData);
    expect(() => updateClaim(model, 'missing', {})).toThrow(/Unknown claim/u);
    expect(() => updateEvidence(model, 'missing', {})).toThrow(/Unknown evidence/u);
    expect(() => updateObservation(model, 'missing', 0, {})).toThrow(/Unknown evidence/u);
    expect(() => setClaimFallbackLines(model, 'missing', ['line'])).toThrow(
      /Unknown claim/u,
    );
    expect(() => setReactionFallbackLines(model, '   ', ['line'])).toThrow(
      /cannot be empty/u,
    );
  });
});
