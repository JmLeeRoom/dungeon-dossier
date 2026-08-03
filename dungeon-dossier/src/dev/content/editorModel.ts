import {
  validateLiveCaseDialogue,
  type LiveValidationOptions,
  type LiveValidationResult,
} from './liveValidation';

export type ContentEditorPatch = Readonly<Record<string, unknown>>;

export interface LiveContentEditorModel {
  readonly caseData: unknown;
  readonly dialogueData: unknown;
  readonly revision: number;
  readonly validation: LiveValidationResult;
  readonly caseSource: string;
  readonly dialogueSource: string;
  readonly externalIds: readonly string[];
}

type JsonObject = Record<string, unknown>;

function asObject(value: unknown): JsonObject | undefined {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as JsonObject)
    : undefined;
}

function cloneDraft<T>(value: T): T {
  return structuredClone(value);
}

function deepFreeze<T>(value: T, seen = new WeakSet<object>()): T {
  if (value === null || typeof value !== 'object' || seen.has(value)) return value;
  seen.add(value);
  for (const child of Object.values(value)) deepFreeze(child, seen);
  return Object.freeze(value);
}

function requireObject(value: unknown, label: string): JsonObject {
  const object = asObject(value);
  if (object === undefined) throw new Error(`${label} must be an object.`);
  return object;
}

function finalizeModel(
  caseData: unknown,
  dialogueData: unknown,
  revision: number,
  options: Required<Pick<LiveValidationOptions, 'caseSource' | 'dialogueSource'>> &
    Readonly<{ externalIds: readonly string[] }>,
): LiveContentEditorModel {
  const frozenCase = deepFreeze(caseData);
  const frozenDialogue = deepFreeze(dialogueData);
  const validation = deepFreeze(
    validateLiveCaseDialogue(frozenCase, frozenDialogue, {
      caseSource: options.caseSource,
      dialogueSource: options.dialogueSource,
      externalIds: new Set(options.externalIds),
    }),
  );
  return deepFreeze({
    caseData: frozenCase,
    dialogueData: frozenDialogue,
    revision,
    validation,
    caseSource: options.caseSource,
    dialogueSource: options.dialogueSource,
    externalIds: [...options.externalIds],
  });
}

function modelSettings(
  model: LiveContentEditorModel,
): Required<Pick<LiveValidationOptions, 'caseSource' | 'dialogueSource'>> &
  Readonly<{ externalIds: readonly string[] }> {
  return {
    caseSource: model.caseSource,
    dialogueSource: model.dialogueSource,
    externalIds: model.externalIds,
  };
}

function effectiveEmbeddedDialogue(caseData: unknown): unknown {
  return asObject(caseData)?.dialogue;
}

export function createContentEditorModel(
  caseData: unknown,
  dialogueData?: unknown,
  options: LiveValidationOptions = {},
): LiveContentEditorModel {
  const clonedCase = cloneDraft(caseData);
  const clonedDialogue = cloneDraft(
    dialogueData ?? effectiveEmbeddedDialogue(clonedCase),
  );
  return finalizeModel(clonedCase, clonedDialogue, 0, {
    caseSource: options.caseSource ?? 'case.json',
    dialogueSource: options.dialogueSource ?? 'dialogue.json',
    externalIds: [...(options.externalIds ?? [])].sort(),
  });
}

export function replaceCaseData(
  model: LiveContentEditorModel,
  caseData: unknown,
): LiveContentEditorModel {
  return finalizeModel(
    cloneDraft(caseData),
    model.dialogueData,
    model.revision + 1,
    modelSettings(model),
  );
}

export function replaceDialogueData(
  model: LiveContentEditorModel,
  dialogueData: unknown,
): LiveContentEditorModel {
  return finalizeModel(
    model.caseData,
    cloneDraft(dialogueData),
    model.revision + 1,
    modelSettings(model),
  );
}

function updateCaseCollection(
  model: LiveContentEditorModel,
  collectionKey: 'claims' | 'evidence',
  idKey: 'claim_id' | 'evidence_id',
  id: string,
  patch: ContentEditorPatch,
): LiveContentEditorModel {
  const root = requireObject(model.caseData, 'caseData');
  const collection = root[collectionKey];
  if (!Array.isArray(collection)) {
    throw new Error(`caseData.${collectionKey} must be an array.`);
  }
  const collectionItems = collection as readonly unknown[];
  const index = collectionItems.findIndex((item) => asObject(item)?.[idKey] === id);
  const label = collectionKey === 'claims' ? 'claim' : 'evidence';
  if (index < 0) throw new Error(`Unknown ${label}: ${id}`);
  const current = requireObject(collectionItems[index], `${collectionKey}[${index}]`);
  const nextCollection = [...collectionItems];
  nextCollection[index] = { ...current, ...cloneDraft(patch) };
  return finalizeModel(
    { ...root, [collectionKey]: nextCollection },
    model.dialogueData,
    model.revision + 1,
    modelSettings(model),
  );
}

export function updateClaim(
  model: LiveContentEditorModel,
  claimId: string,
  patch: ContentEditorPatch,
): LiveContentEditorModel {
  return updateCaseCollection(model, 'claims', 'claim_id', claimId, patch);
}

export function updateEvidence(
  model: LiveContentEditorModel,
  evidenceId: string,
  patch: ContentEditorPatch,
): LiveContentEditorModel {
  return updateCaseCollection(model, 'evidence', 'evidence_id', evidenceId, patch);
}

export function updateObservation(
  model: LiveContentEditorModel,
  evidenceId: string,
  observationIndex: number,
  patch: ContentEditorPatch,
): LiveContentEditorModel {
  const root = requireObject(model.caseData, 'caseData');
  const evidence = root.evidence;
  if (!Array.isArray(evidence)) throw new Error('caseData.evidence must be an array.');
  const evidenceItems = evidence as readonly unknown[];
  const evidenceIndex = evidenceItems.findIndex(
    (item) => asObject(item)?.evidence_id === evidenceId,
  );
  if (evidenceIndex < 0) throw new Error(`Unknown evidence: ${evidenceId}`);
  const currentEvidence = requireObject(
    evidenceItems[evidenceIndex],
    `evidence[${evidenceIndex}]`,
  );
  const observations = currentEvidence.observations;
  if (!Array.isArray(observations)) {
    throw new Error(`Evidence observations must be an array: ${evidenceId}`);
  }
  const observationItems = observations as readonly unknown[];
  if (
    !Number.isInteger(observationIndex) ||
    observationIndex < 0 ||
    observationIndex >= observationItems.length
  ) {
    throw new RangeError(`Unknown observation index ${observationIndex} for evidence: ${evidenceId}`);
  }
  const currentObservation = requireObject(
    observationItems[observationIndex],
    `evidence[${evidenceIndex}].observations[${observationIndex}]`,
  );
  const nextObservations = [...observationItems];
  nextObservations[observationIndex] = {
    ...currentObservation,
    ...cloneDraft(patch),
  };
  const nextEvidence = [...evidenceItems];
  nextEvidence[evidenceIndex] = {
    ...currentEvidence,
    observations: nextObservations,
  };
  return finalizeModel(
    { ...root, evidence: nextEvidence },
    model.dialogueData,
    model.revision + 1,
    modelSettings(model),
  );
}

function requireKnownClaim(model: LiveContentEditorModel, claimId: string): void {
  const claims = requireObject(model.caseData, 'caseData').claims;
  if (
    !Array.isArray(claims) ||
    !claims.some((claim) => asObject(claim)?.claim_id === claimId)
  ) {
    throw new Error(`Unknown claim: ${claimId}`);
  }
}

export function setClaimFallbackLines(
  model: LiveContentEditorModel,
  claimId: string,
  lines: readonly string[],
): LiveContentEditorModel {
  requireKnownClaim(model, claimId);
  const dialogue = asObject(model.dialogueData) ?? {};
  const statements = asObject(dialogue.statements) ?? {};
  const currentStatement = asObject(statements[claimId]);
  const nextStatement = {
    ...(currentStatement ?? { spans: [] }),
    fallback: [...lines],
  };
  return finalizeModel(
    model.caseData,
    {
      ...dialogue,
      statements: { ...statements, [claimId]: nextStatement },
    },
    model.revision + 1,
    modelSettings(model),
  );
}

export function setReactionFallbackLines(
  model: LiveContentEditorModel,
  reactionKey: string,
  lines: readonly string[],
): LiveContentEditorModel {
  if (reactionKey.trim().length === 0) throw new Error('reactionKey cannot be empty.');
  const dialogue = asObject(model.dialogueData) ?? {};
  const reactions = asObject(dialogue.reactions) ?? {};
  return finalizeModel(
    model.caseData,
    {
      ...dialogue,
      reactions: { ...reactions, [reactionKey]: [...lines] },
    },
    model.revision + 1,
    modelSettings(model),
  );
}

/** Useful for adapters that keep validation settings but perform a custom edit. */
export function revalidateContentEditorModel(
  model: LiveContentEditorModel,
): LiveContentEditorModel {
  return finalizeModel(
    model.caseData,
    model.dialogueData,
    model.revision,
    modelSettings(model),
  );
}
