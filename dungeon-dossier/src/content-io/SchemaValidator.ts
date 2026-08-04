import type { ZodType } from 'zod';

export type ValidationMode = 'development' | 'release';
export type ValidationPathSegment = string | number;

export interface ValidationIssue {
  readonly code:
    | 'CONTENT_LOAD_FAILED'
    | 'SCHEMA_INVALID'
    | 'DUPLICATE_ID'
    | 'UNRESOLVED_REFERENCE'
    | 'LOCK_WITHOUT_UNLOCK'
    | 'MISSING_FALLBACK';
  readonly source: string;
  readonly path: readonly ValidationPathSegment[];
  readonly message: string;
  readonly referenceId?: string;
}

interface ValidationReportBase {
  readonly source: string;
  readonly issues: readonly ValidationIssue[];
}

export interface ValidValidationReport<T> extends ValidationReportBase {
  readonly valid: true;
  readonly data: T;
}

export interface InvalidValidationReport extends ValidationReportBase {
  readonly valid: false;
}

export type ValidationReport<T> = ValidValidationReport<T> | InvalidValidationReport;
export type ValidationReporter = (report: InvalidValidationReport) => void;

export interface Tier1Context {
  readonly dialogue?: unknown;
  readonly externalIds?: ReadonlySet<string>;
}

type JsonObject = Record<string, unknown>;
type ReferenceKind =
  | 'claim'
  | 'entity'
  | 'event'
  | 'evidence'
  | 'encounter'
  | 'route'
  | 'rule'
  | 'round'
  | 'modifier'
  | 'hypothesis'
  | 'objective'
  | 'outcome'
  | 'choice'
  | 'item'
  | 'slot'
  | 'spot'
  | 'node'
  | 'reaction'
  | 'external';

const DEFINITION_COLLECTIONS = [
  ['entities', 'entity_id', 'entity'],
  ['events', 'event_id', 'event'],
  ['claims', 'claim_id', 'claim'],
  ['inquiry_routes', 'route_id', 'route'],
  ['evidence', 'evidence_id', 'evidence'],
  ['proof_rules', 'rule_id', 'rule'],
  ['encounters', 'encounter_id', 'encounter'],
] as const satisfies readonly (readonly [string, string, ReferenceKind])[];

function asObject(value: unknown): JsonObject | undefined {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as JsonObject)
    : undefined;
}

function pathKey(path: readonly ValidationPathSegment[]): string {
  return JSON.stringify(path);
}

function normaliseKey(key: string): string {
  return key.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`).toLowerCase();
}

function camelCaseKey(key: string): string {
  return key.replace(/_([a-z])/g, (_match, letter: string) => letter.toUpperCase());
}

function field(object: JsonObject, key: string): unknown {
  return object[key] ?? object[camelCaseKey(key)];
}

function referenceKindForKey(key: string): ReferenceKind | undefined {
  const normalised = normaliseKey(key);

  if (
    normalised === 'speaker' ||
    normalised.includes('entity_id') ||
    normalised === 'subject_id' ||
    normalised === 'object_id' ||
    normalised === 'location_id' ||
    normalised === 'participants' ||
    normalised === 'objects' ||
    normalised === 'instructed_by'
  ) {
    return 'entity';
  }
  if (normalised === 'target_entity') return 'entity';
  if (normalised.includes('claim_id') || normalised === 'statement_claims') return 'claim';
  if (
    normalised === 'contradicting_events' ||
    normalised.includes('event_id') ||
    normalised === 'caused_by'
  ) {
    return 'event';
  }
  if (
    normalised.includes('evidence_id') ||
    normalised === 'guaranteed_evidence_sets' ||
    normalised === 'known_insufficient_sets' ||
    normalised === 'disqualifying_evidence_sets' ||
    normalised === 'evidence' ||
    normalised === 'derived_from'
  ) {
    return 'evidence';
  }
  if (normalised.includes('encounter_id') || normalised === 'encounter') return 'encounter';
  if (normalised.includes('route_id')) return 'route';
  if (normalised === 'unlocks_routes' || normalised === 'open_route_ids') return 'route';
  if (normalised.includes('rule_id')) return 'rule';
  if (normalised.includes('round_id')) return 'round';
  if (normalised.includes('modifier_id')) return 'modifier';
  if (
    normalised === 'activate_modifiers' ||
    normalised === 'deactivate_modifiers'
  ) {
    return 'modifier';
  }
  if (normalised.includes('hypothesis_id') || normalised.includes('hypotheses')) {
    return 'hypothesis';
  }
  if (normalised.includes('objective_id')) return 'objective';
  if (normalised.includes('outcome_id')) return 'outcome';
  if (
    normalised === 'node' ||
    normalised.includes('node_id') ||
    normalised === 'next_node' ||
    normalised === 'on_success' ||
    normalised === 'on_fail'
  ) {
    return 'node';
  }
  if (normalised.includes('reaction_key')) return 'reaction';
  if (
    normalised.includes('card_id') ||
    normalised.includes('skill_id') ||
    normalised.includes('flag_id') ||
    normalised.includes('relic_id') ||
    normalised.includes('enhancement_id')
    || normalised === 'partner_skills'
    || normalised === 'cards'
    || normalised === 'relics'
  ) {
    return 'external';
  }

  return undefined;
}

interface StringLeaf {
  readonly value: string;
  readonly path: readonly ValidationPathSegment[];
}

function collectStringLeaves(
  value: unknown,
  output: StringLeaf[],
  path: readonly ValidationPathSegment[] = [],
): void {
  if (typeof value === 'string') {
    output.push({ value, path });
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((child, index) => collectStringLeaves(child, output, [...path, index]));
  }
}

function hasMeaningfulUnlockCondition(value: unknown): boolean {
  return (
    Array.isArray(value) &&
    value.some((condition) => {
      const object = asObject(condition);
      const type = object?.type;
      return typeof type === 'string' && type.trim().length > 0;
    })
  );
}

function hasFallbackLines(value: unknown): boolean {
  return (
    Array.isArray(value) &&
    value.some((line) =>
      typeof line === 'string'
        ? line.trim().length > 0
        : (() => {
            const object = asObject(line);
            const text = object?.text ?? object?.body;
            return typeof text === 'string' && text.trim().length > 0;
          })(),
    )
  );
}

function defaultReporter(report: InvalidValidationReport): void {
  console.error(formatValidationReport(report));
}

export class ContentValidationError extends Error {
  readonly report: InvalidValidationReport;

  constructor(report: InvalidValidationReport) {
    super(formatValidationReport(report));
    this.name = 'ContentValidationError';
    this.report = report;
  }
}

export function formatValidationReport(report: ValidationReport<unknown>): string {
  const details = report.issues
    .map((issue) => {
      const location = issue.path.length === 0 ? '$' : `$.${issue.path.join('.')}`;
      return `[${issue.code}] ${location}: ${issue.message}`;
    })
    .join('\n');
  return `${report.source}: ${report.issues.length} validation error(s)${details ? `\n${details}` : ''}`;
}

export function loadFailureReport(source: string, error: unknown): InvalidValidationReport {
  return {
    valid: false,
    source,
    issues: [
      {
        code: 'CONTENT_LOAD_FAILED',
        source,
        path: [],
        message: error instanceof Error ? error.message : String(error),
      },
    ],
  };
}

export function applyValidationPolicy<T>(
  report: ValidationReport<T>,
  mode: ValidationMode,
  reporter: ValidationReporter = defaultReporter,
): T | undefined {
  if (report.valid) return report.data;
  if (mode === 'development') throw new ContentValidationError(report);
  reporter(report);
  return undefined;
}

export function validateTier1Case(
  caseDefinition: unknown,
  source: string,
  context: Tier1Context = {},
): readonly ValidationIssue[] {
  const root = asObject(caseDefinition);
  if (!root) return [];

  const issues: ValidationIssue[] = [];
  const definitions = new Map<ReferenceKind, Set<string>>();
  const allDefinitions = new Set<string>();
  const definitionPaths = new Set<string>();

  const namespace = (kind: ReferenceKind): Set<string> => {
    let values = definitions.get(kind);
    if (!values) {
      values = new Set<string>();
      definitions.set(kind, values);
    }
    return values;
  };

  const register = (
    id: unknown,
    kind: ReferenceKind,
    path: readonly ValidationPathSegment[],
  ): void => {
    if (typeof id !== 'string') return;
    definitionPaths.add(pathKey(path));
    if (allDefinitions.has(id)) {
      issues.push({
        code: 'DUPLICATE_ID',
        source,
        path,
        message: `ID is defined more than once: ${id}`,
        referenceId: id,
      });
      return;
    }
    namespace(kind).add(id);
    allDefinitions.add(id);
  };

  register(field(root, 'case_id'), 'external', ['case_id']);

  for (const [collectionKey, idKey, kind] of DEFINITION_COLLECTIONS) {
    const collection = root[collectionKey];
    if (!Array.isArray(collection)) continue;
    collection.forEach((item, index) => {
      const object = asObject(item);
      if (!object) return;
      register(field(object, idKey), kind, [collectionKey, index, idKey]);
    });
  }

  const proofRules = Array.isArray(root.proof_rules) ? root.proof_rules : [];
  proofRules.forEach((proofRule, ruleIndex) => {
    const hypotheses = asObject(proofRule)?.alternate_hypotheses;
    if (!Array.isArray(hypotheses)) return;
    hypotheses.forEach((hypothesis, hypothesisIndex) => {
      const object = asObject(hypothesis);
      if (object) {
        register(field(object, 'hypothesis_id'), 'hypothesis', [
          'proof_rules',
          ruleIndex,
          'alternate_hypotheses',
          hypothesisIndex,
          'hypothesis_id',
        ]);
      }
    });
  });

  const encounters = Array.isArray(root.encounters) ? root.encounters : [];
  const encounterNodes: Set<string>[] = encounters.map(() => new Set<string>());
  encounters.forEach((encounter, encounterIndex) => {
    const encounterObject = asObject(encounter);
    if (!encounterObject) return;
    const nestedDefinitions = [
      ['rounds', 'round_id', 'round'],
      ['flow_nodes', 'node_id', 'node'],
      ['modifiers', 'modifier_id', 'modifier'],
    ] as const;
    for (const [collectionKey, idKey, kind] of nestedDefinitions) {
      const collection = encounterObject[collectionKey];
      if (!Array.isArray(collection)) continue;
      collection.forEach((item, index) => {
        const object = asObject(item);
        if (object) {
          const id = field(object, idKey);
          register(id, kind, [
            'encounters',
            encounterIndex,
            collectionKey,
            index,
            idKey,
          ]);
          if (kind === 'node' && typeof id === 'string') {
            encounterNodes[encounterIndex]?.add(id);
          }
        }
      });
    }

    const objectives = asObject(encounterObject.objectives);
    for (const group of ['required', 'optional'] as const) {
      const groupDefinitions = objectives?.[group];
      if (!Array.isArray(groupDefinitions)) continue;
      groupDefinitions.forEach((objective, objectiveIndex) => {
        const object = asObject(objective);
        if (object) {
          register(field(object, 'objective_id'), 'objective', [
            'encounters',
            encounterIndex,
            'objectives',
            group,
            objectiveIndex,
            'objective_id',
          ]);
        }
      });
    }

    const outcomes = encounterObject.outcomes;
    if (Array.isArray(outcomes)) {
      outcomes.forEach((outcome, outcomeIndex) => {
        const object = asObject(outcome);
        if (object) {
          register(field(object, 'outcome_id'), 'outcome', [
            'encounters',
            encounterIndex,
            'outcomes',
            outcomeIndex,
            'outcome_id',
          ]);
        }
      });
    }
  });

  const nonCombatEvents = Array.isArray(root.events_noncombat) ? root.events_noncombat : [];
  nonCombatEvents.forEach((event, index) => {
    const object = asObject(event);
    if (!object) return;
    register(field(object, 'event_id'), 'event', ['events_noncombat', index, 'event_id']);
    register(field(object, 'node'), 'node', ['events_noncombat', index, 'node']);
    const nestedDefinitions = [
      ['choices', 'choice_id', 'choice'],
      ['items', 'item_id', 'item'],
      ['slots', 'slot_id', 'slot'],
      ['spots', 'spot_id', 'spot'],
    ] as const;
    for (const [collectionKey, idKey, kind] of nestedDefinitions) {
      const collection = object[collectionKey];
      if (!Array.isArray(collection)) continue;
      collection.forEach((definition, definitionIndex) => {
        const definitionObject = asObject(definition);
        if (definitionObject) {
          register(field(definitionObject, idKey), kind, [
            'events_noncombat',
            index,
            collectionKey,
            definitionIndex,
            idKey,
          ]);
        }
      });
    }
  });

  const embeddedDialogue = asObject(root.dialogue);
  const externalDialogue = asObject(context.dialogue);
  const dialogue = externalDialogue ?? embeddedDialogue;
  const reactions = asObject(dialogue?.reactions);
  if (reactions) {
    for (const reactionKey of Object.keys(reactions)) {
      namespace('reaction').add(reactionKey);
      allDefinitions.add(reactionKey);
    }
  }

  const speakerProfiles = asObject(dialogue?.speaker_profiles ?? dialogue?.speakerProfiles);
  if (speakerProfiles) {
    for (const speakerId of Object.keys(speakerProfiles)) {
      if (!namespace('entity').has(speakerId)) {
        issues.push({
          code: 'UNRESOLVED_REFERENCE',
          source,
          path: ['dialogue', 'speaker_profiles', speakerId],
          message: `Unresolved entity reference: ${speakerId}`,
          referenceId: speakerId,
        });
      }
    }
  }

  const statements = asObject(dialogue?.statements);
  if (statements) {
    for (const claimId of Object.keys(statements)) {
      if (!namespace('claim').has(claimId)) {
        issues.push({
          code: 'UNRESOLVED_REFERENCE',
          source,
          path: ['dialogue', 'statements', claimId],
          message: `Unresolved claim reference: ${claimId}`,
          referenceId: claimId,
        });
      }
    }
  }

  const addUnresolved = (
    kind: ReferenceKind,
    referenceId: string,
    path: readonly ValidationPathSegment[],
  ): void => {
    if (namespace(kind).has(referenceId)) return;
    issues.push({
      code: 'UNRESOLVED_REFERENCE',
      source,
      path,
      message: `Unresolved ${kind} reference: ${referenceId}`,
      referenceId,
    });
  };

  const inquiryRoutes = Array.isArray(root.inquiry_routes) ? root.inquiry_routes : [];
  inquiryRoutes.forEach((route, routeIndex) => {
    const object = asObject(route);
    if (!object) return;
    const targetSlot = field(object, 'target_slot');
    if (typeof targetSlot === 'string') {
      addUnresolved('claim', targetSlot, ['inquiry_routes', routeIndex, 'target_slot']);
    }
    const reveals = object.reveals;
    if (Array.isArray(reveals)) {
      reveals.forEach((claimId, claimIndex) => {
        if (typeof claimId === 'string') {
          addUnresolved('claim', claimId, [
            'inquiry_routes',
            routeIndex,
            'reveals',
            claimIndex,
          ]);
        }
      });
    }
  });

  nonCombatEvents.forEach((event, eventIndex) => {
    const object = asObject(event);
    const answerMapping = asObject(object?.answer_mapping);
    if (!answerMapping) return;
    for (const [itemId, slotId] of Object.entries(answerMapping)) {
      addUnresolved('item', itemId, [
        'events_noncombat',
        eventIndex,
        'answer_mapping',
        itemId,
      ]);
      if (typeof slotId === 'string') {
        addUnresolved('slot', slotId, [
          'events_noncombat',
          eventIndex,
          'answer_mapping',
          itemId,
        ]);
      }
    }
  });

  const visitReferences = (
    value: unknown,
    path: readonly ValidationPathSegment[] = [],
  ): void => {
    if (Array.isArray(value)) {
      value.forEach((child, index) => visitReferences(child, [...path, index]));
      return;
    }
    const object = asObject(value);
    if (!object) return;

    for (const [key, child] of Object.entries(object)) {
      const childPath = [...path, key];
      const kind = referenceKindForKey(key);
      if (kind && !definitionPaths.has(pathKey(childPath))) {
        const references: StringLeaf[] = [];
        collectStringLeaves(child, references);
        for (const reference of references) {
          const referenceId = reference.value;
          const scopedNodes =
            kind === 'node' &&
            path[0] === 'encounters' &&
            typeof path[1] === 'number'
              ? encounterNodes[path[1]]
              : undefined;
          const bundleScopedFlagHookReference =
            path[0] === 'flag_hooks' &&
            (kind === 'encounter' ||
              kind === 'event' ||
              kind === 'choice' ||
              (kind === 'external' && key === 'flag_id'));
          const known = bundleScopedFlagHookReference
            ? true
            : kind === 'external'
              ? context.externalIds?.has(referenceId) === true
              : scopedNodes
                ? scopedNodes.has(referenceId)
                : namespace(kind).has(referenceId);
          if (!known) {
            issues.push({
              code: 'UNRESOLVED_REFERENCE',
              source,
              path: [...childPath, ...reference.path],
              message: `Unresolved ${kind} reference: ${referenceId}`,
              referenceId,
            });
          }
        }
      }
      visitReferences(child, childPath);
    }
  };
  visitReferences(root);
  if (externalDialogue) visitReferences(externalDialogue, ['dialogue']);

  const claims = Array.isArray(root.claims) ? root.claims : [];
  claims.forEach((claim, index) => {
    const object = asObject(claim);
    if (!object) return;
    const claimId = object.claim_id ?? object.claimId;
    const initial = asObject(object.initial);
    const lock = asObject(object.lock);
    const locked =
      initial?.presentation === 'LOCKED' ||
      initial?.presentationState === 'LOCKED' ||
      lock?.locked_at_start === true ||
      lock?.lockedAtStart === true;
    const unlockConditions =
      lock?.unlock_conditions ??
      lock?.unlockConditions ??
      object.unlock_conditions ??
      object.unlockConditions ??
      initial?.unlock_conditions ??
      initial?.unlockConditions;
    if (locked && !hasMeaningfulUnlockCondition(unlockConditions)) {
      issues.push({
        code: 'LOCK_WITHOUT_UNLOCK',
        source,
        path: ['claims', index, 'lock'],
        message: `LOCKED claim has no unlock condition: ${String(claimId)}`,
      });
    }

    const statement = typeof claimId === 'string' ? asObject(statements?.[claimId]) : undefined;
    if (!statement || !hasFallbackLines(statement.fallback)) {
      issues.push({
        code: 'MISSING_FALLBACK',
        source,
        path: ['dialogue', 'statements', String(claimId), 'fallback'],
        message: `Claim has no fallback line: ${String(claimId)}`,
      });
    }
  });

  if (reactions) {
    for (const [reactionKey, lines] of Object.entries(reactions)) {
      if (!hasFallbackLines(lines)) {
        issues.push({
          code: 'MISSING_FALLBACK',
          source,
          path: ['dialogue', 'reactions', reactionKey],
          message: `ReactionKey has no fallback line: ${reactionKey}`,
        });
      }
    }
  }

  return issues;
}

export class SchemaValidator {
  validate<T>(schema: ZodType<T>, input: unknown, source: string): ValidationReport<T> {
    const result = schema.safeParse(input);
    if (!result.success) {
      return {
        valid: false,
        source,
        issues: result.error.issues.map((issue) => ({
          code: 'SCHEMA_INVALID',
          source,
          path: issue.path.map((part) =>
            typeof part === 'number' || typeof part === 'string' ? part : String(part),
          ),
          message: issue.message,
        })),
      };
    }
    return { valid: true, source, issues: [], data: result.data };
  }

  validateCase<T>(
    schema: ZodType<T>,
    input: unknown,
    source: string,
    context: Tier1Context = {},
  ): ValidationReport<T> {
    const schemaReport = this.validate(schema, input, source);
    if (!schemaReport.valid) return schemaReport;
    return this.validateTier1Case(schemaReport.data, source, context);
  }

  validateTier1Case<T>(
    data: T,
    source: string,
    context: Tier1Context = {},
  ): ValidationReport<T> {
    const tier1Issues = validateTier1Case(data, source, context);
    return tier1Issues.length === 0
      ? { valid: true, source, issues: [], data }
      : { valid: false, source, issues: tier1Issues };
  }
}
