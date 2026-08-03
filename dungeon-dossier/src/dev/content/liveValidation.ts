import type { ZodType } from 'zod';
import { CaseSchema, DialogueSchema } from '../../content-io/schemas';
import {
  SchemaValidator,
  validateTier1Case,
  type ValidationIssue,
  type ValidationPathSegment,
} from '../../content-io/SchemaValidator';

export type LiveContentDocument = 'case' | 'dialogue';
export type LiveValidationIssueCode =
  | ValidationIssue['code']
  | 'MISSING_OBSERVATION_SCOPES';

export interface LiveValidationIssue {
  readonly code: LiveValidationIssueCode;
  readonly document: LiveContentDocument;
  readonly source: string;
  readonly path: readonly ValidationPathSegment[];
  readonly message: string;
  readonly referenceId?: string;
}

export interface LiveValidationResult {
  readonly valid: boolean;
  readonly issues: readonly LiveValidationIssue[];
}

export interface LiveValidationOptions {
  readonly caseSource?: string;
  readonly dialogueSource?: string;
  readonly externalIds?: ReadonlySet<string>;
}

type JsonObject = Record<string, unknown>;

const CaseWithoutDialogueSchema = CaseSchema.omit({ dialogue: true });

function asObject(value: unknown): JsonObject | undefined {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as JsonObject)
    : undefined;
}

function pathKey(
  document: LiveContentDocument,
  path: readonly ValidationPathSegment[],
): string {
  return `${document}:${JSON.stringify(path)}`;
}

function issueKey(issue: LiveValidationIssue): string {
  return JSON.stringify([
    issue.code,
    issue.document,
    issue.path,
    issue.referenceId ?? null,
    issue.message,
  ]);
}

function withoutEmbeddedDialogue(caseData: unknown): unknown {
  const root = asObject(caseData);
  if (root === undefined) return caseData;
  const copy = { ...root };
  delete copy.dialogue;
  return copy;
}

function mapSchemaIssues(
  schema: ZodType<unknown>,
  input: unknown,
  document: LiveContentDocument,
  source: string,
): LiveValidationIssue[] {
  const report = new SchemaValidator().validate(schema, input, source);
  if (report.valid) return [];
  return report.issues.map((issue) => ({
    code: issue.code,
    document,
    source,
    path: issue.path,
    message: issue.message,
    ...(issue.referenceId === undefined ? {} : { referenceId: issue.referenceId }),
  }));
}

function mapTier1Issue(
  issue: ValidationIssue,
  caseSource: string,
  dialogueSource: string,
): LiveValidationIssue {
  const belongsToDialogue = issue.path[0] === 'dialogue';
  return {
    code: issue.code,
    document: belongsToDialogue ? 'dialogue' : 'case',
    source: belongsToDialogue ? dialogueSource : caseSource,
    path: belongsToDialogue ? issue.path.slice(1) : issue.path,
    message: issue.message,
    ...(issue.referenceId === undefined ? {} : { referenceId: issue.referenceId }),
  };
}

function hasFallbackLine(value: unknown): boolean {
  return (
    Array.isArray(value) &&
    value.some((line) => {
      if (typeof line === 'string') return line.trim().length > 0;
      const object = asObject(line);
      const text = object?.text ?? object?.body;
      return typeof text === 'string' && text.trim().length > 0;
    })
  );
}

function collectReferencedReactionKeys(value: unknown, output: Set<string>): void {
  if (Array.isArray(value)) {
    for (const child of value) collectReferencedReactionKeys(child, output);
    return;
  }
  const object = asObject(value);
  if (object === undefined) return;

  for (const [key, child] of Object.entries(object)) {
    const normalized = key.replace(/[A-Z]/gu, (letter) => `_${letter.toLowerCase()}`);
    if (normalized === 'reaction_key' && typeof child === 'string') output.add(child);
    collectReferencedReactionKeys(child, output);
  }
}

function missingScopeIssues(caseData: unknown, source: string): LiveValidationIssue[] {
  const evidence = asObject(caseData)?.evidence;
  if (!Array.isArray(evidence)) return [];

  const issues: LiveValidationIssue[] = [];
  evidence.forEach((item, evidenceIndex) => {
    const observations = asObject(item)?.observations;
    if (!Array.isArray(observations)) return;
    observations.forEach((observation, observationIndex) => {
      const scopes = asObject(observation)?.scopes;
      if (Array.isArray(scopes) && scopes.length > 0) return;
      issues.push({
        code: 'MISSING_OBSERVATION_SCOPES',
        document: 'case',
        source,
        path: ['evidence', evidenceIndex, 'observations', observationIndex, 'scopes'],
        message: 'Evidence observation must declare at least one proof scope.',
      });
    });
  });
  return issues;
}

function fallbackIssues(
  caseData: unknown,
  dialogueData: unknown,
  source: string,
): LiveValidationIssue[] {
  const root = asObject(caseData);
  const dialogue = asObject(dialogueData);
  const statements = asObject(dialogue?.statements);
  const reactions = asObject(dialogue?.reactions);
  const issues: LiveValidationIssue[] = [];

  const claims = root?.claims;
  if (Array.isArray(claims)) {
    for (const claim of claims) {
      const claimId = asObject(claim)?.claim_id;
      if (typeof claimId !== 'string') continue;
      const statement = asObject(statements?.[claimId]);
      if (statement !== undefined && hasFallbackLine(statement.fallback)) continue;
      issues.push({
        code: 'MISSING_FALLBACK',
        document: 'dialogue',
        source,
        path: ['statements', claimId, 'fallback'],
        message: `Claim has no fallback line: ${claimId}`,
        referenceId: claimId,
      });
    }
  }

  const reactionKeys = new Set<string>(reactions === undefined ? [] : Object.keys(reactions));
  collectReferencedReactionKeys(caseData, reactionKeys);
  for (const reactionKey of [...reactionKeys].sort()) {
    if (hasFallbackLine(reactions?.[reactionKey])) continue;
    issues.push({
      code: 'MISSING_FALLBACK',
      document: 'dialogue',
      source,
      path: ['reactions', reactionKey],
      message: `ReactionKey has no fallback line: ${reactionKey}`,
      referenceId: reactionKey,
    });
  }
  return issues;
}

/**
 * Runs the editor's live checks without mutating either draft. Schema checks
 * and the canonical Tier-1 reference walker are reused so CI and the drawer
 * agree, while A-6 and missing-scope errors receive editor-specific paths.
 */
export function validateLiveCaseDialogue(
  caseData: unknown,
  dialogueData?: unknown,
  options: LiveValidationOptions = {},
): LiveValidationResult {
  const caseSource = options.caseSource ?? 'case.json';
  const dialogueSource = options.dialogueSource ?? 'dialogue.json';
  const effectiveDialogue = dialogueData ?? asObject(caseData)?.dialogue;

  const semanticIssues = [
    ...missingScopeIssues(caseData, caseSource),
    ...fallbackIssues(caseData, effectiveDialogue, dialogueSource),
  ];
  const semanticPaths = new Set(
    semanticIssues.map((issue) => pathKey(issue.document, issue.path)),
  );

  const schemaIssues = [
    ...mapSchemaIssues(
      CaseWithoutDialogueSchema,
      withoutEmbeddedDialogue(caseData),
      'case',
      caseSource,
    ),
    ...mapSchemaIssues(DialogueSchema, effectiveDialogue, 'dialogue', dialogueSource),
  ].filter(
    (issue) =>
      issue.code !== 'SCHEMA_INVALID' ||
      !semanticPaths.has(pathKey(issue.document, issue.path)),
  );

  const tier1Issues = validateTier1Case(withoutEmbeddedDialogue(caseData), caseSource, {
    dialogue: effectiveDialogue,
    ...(options.externalIds === undefined ? {} : { externalIds: options.externalIds }),
  })
    .filter((issue) => issue.code !== 'MISSING_FALLBACK')
    .map((issue) => mapTier1Issue(issue, caseSource, dialogueSource));

  const unique = new Map<string, LiveValidationIssue>();
  for (const issue of [...schemaIssues, ...tier1Issues, ...semanticIssues]) {
    unique.set(issueKey(issue), issue);
  }
  const issues = [...unique.values()].sort((left, right) => {
    const leftKey = `${left.document}:${JSON.stringify(left.path)}:${left.code}`;
    const rightKey = `${right.document}:${JSON.stringify(right.path)}:${right.code}`;
    return leftKey.localeCompare(rightKey);
  });
  return { valid: issues.length === 0, issues };
}
