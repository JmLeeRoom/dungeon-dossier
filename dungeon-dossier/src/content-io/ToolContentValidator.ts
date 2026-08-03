import type { ZodType } from 'zod';
import {
  BalanceSchema,
  CardsSchema,
  CaseSchema,
  DialogueSchema,
  EnhancementsSchema,
  FlagsSchema,
  GradesSchema,
  JudgmentUiMapSchema,
  RelicsSchema,
  RewardsSchema,
  RunStripSchema,
  type CaseDefinition,
} from './schemas';
import { validateCaseTier2AndTier3 } from './ContentSemanticValidator';
import { SchemaValidator, type ValidationIssue } from './SchemaValidator';

export interface ToolContentFile {
  readonly relativePath: string;
  readonly value: unknown;
}

export interface ToolValidationProblem {
  readonly kind: 'schema' | 'tier1' | 'tier2' | 'tier3';
  readonly relativePath: string;
  readonly message: string;
}

type ContentKind =
  | 'balance'
  | 'cards'
  | 'case'
  | 'dialogue'
  | 'enhancements'
  | 'flags'
  | 'grades'
  | 'judgment-ui-map'
  | 'relics'
  | 'rewards'
  | 'run-strip';

interface RegisteredSchema {
  readonly kind: ContentKind;
  readonly schema: ZodType<unknown>;
}

interface ValidatedFile extends ToolContentFile {
  readonly kind: ContentKind;
  readonly data: unknown;
}

type JsonObject = Record<string, unknown>;

function asObject(value: unknown): JsonObject | undefined {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as JsonObject)
    : undefined;
}

function normalisePath(relativePath: string): string {
  return relativePath.replaceAll('\\', '/');
}

function schemaForPath(relativePath: string): RegisteredSchema | undefined {
  const path = normalisePath(relativePath);
  const commonSchemas: Readonly<Record<string, RegisteredSchema>> = {
    'common/balance.json': { kind: 'balance', schema: BalanceSchema },
    'common/cards.json': { kind: 'cards', schema: CardsSchema },
    'common/enhancements.json': { kind: 'enhancements', schema: EnhancementsSchema },
    'common/flags.json': { kind: 'flags', schema: FlagsSchema },
    'common/grades.json': { kind: 'grades', schema: GradesSchema },
    'common/judgment-ui-map.json': {
      kind: 'judgment-ui-map',
      schema: JudgmentUiMapSchema,
    },
    'common/relics.json': { kind: 'relics', schema: RelicsSchema },
    'common/rewards.json': { kind: 'rewards', schema: RewardsSchema },
    'common/run-strip.json': { kind: 'run-strip', schema: RunStripSchema },
  };
  const common = commonSchemas[path];
  if (common) return common;
  if (/^cases\/[a-z0-9_-]+\/case\.json$/.test(path)) {
    return { kind: 'case', schema: CaseSchema };
  }
  if (
    /^cases\/[a-z0-9_-]+\/dialogue\.json$/.test(path) ||
    /^cases\/[a-z0-9_-]+\/dialogue\/[a-z0-9_-]+\.json$/.test(path)
  ) {
    return { kind: 'dialogue', schema: DialogueSchema };
  }
  return undefined;
}

function issueProblem(issue: ValidationIssue): ToolValidationProblem {
  const location = issue.path.length === 0 ? '$' : `$.${issue.path.join('.')}`;
  return {
    kind: issue.code === 'SCHEMA_INVALID' ? 'schema' : 'tier1',
    relativePath: issue.source,
    message: `[${issue.code}] ${location}: ${issue.message}`,
  };
}

function catalogueEntries(data: unknown, key: string): readonly unknown[] {
  const value = asObject(data)?.[key];
  return Array.isArray(value) ? value : [];
}

function addIds(
  destination: Set<string>,
  values: readonly unknown[],
  idKey: string,
): void {
  for (const value of values) {
    const id = asObject(value)?.[idKey];
    if (typeof id === 'string') destination.add(id);
  }
}

function referenceProblem(
  relativePath: string,
  path: string,
  referenceId: string,
): ToolValidationProblem {
  return {
    kind: 'tier1',
    relativePath,
    message: `[UNRESOLVED_REFERENCE] $.${path}: Unresolved reference: ${referenceId}`,
  };
}

function validateReferences(
  relativePath: string,
  ids: readonly unknown[] | undefined,
  known: ReadonlySet<string>,
  path: string,
): ToolValidationProblem[] {
  if (!ids) return [];
  return ids.flatMap((id, index) =>
    typeof id === 'string' && !known.has(id)
      ? [referenceProblem(relativePath, `${path}.${index}`, id)]
      : [],
  );
}

function collectBundleDefinitions(files: readonly ValidatedFile[]): {
  readonly externalIds: ReadonlySet<string>;
  readonly cardIds: ReadonlySet<string>;
  readonly enhancementIds: ReadonlySet<string>;
  readonly flagIds: ReadonlySet<string>;
  readonly relicIds: ReadonlySet<string>;
  readonly caseIds: ReadonlySet<string>;
  readonly encounterIds: ReadonlySet<string>;
  readonly eventIds: ReadonlySet<string>;
  readonly choiceIds: ReadonlySet<string>;
  readonly encounterCaseById: ReadonlyMap<string, string>;
  readonly eventCaseById: ReadonlyMap<string, string>;
} {
  const cardIds = new Set<string>();
  const enhancementIds = new Set<string>();
  const flagIds = new Set<string>();
  const relicIds = new Set<string>();
  const rewardIds = new Set<string>();
  const caseIds = new Set<string>();
  const encounterIds = new Set<string>();
  const eventIds = new Set<string>();
  const choiceIds = new Set<string>();
  const skillIds = new Set<string>();
  const encounterCaseById = new Map<string, string>();
  const eventCaseById = new Map<string, string>();

  for (const file of files) {
    if (file.kind === 'cards') addIds(cardIds, catalogueEntries(file.data, 'cards'), 'card_id');
    if (file.kind === 'enhancements') {
      addIds(enhancementIds, catalogueEntries(file.data, 'enhancements'), 'enhancement_id');
    }
    if (file.kind === 'flags') addIds(flagIds, catalogueEntries(file.data, 'flags'), 'flag_id');
    if (file.kind === 'relics') addIds(relicIds, catalogueEntries(file.data, 'relics'), 'relic_id');
    if (file.kind === 'rewards') addIds(rewardIds, catalogueEntries(file.data, 'rewards'), 'reward_id');
    if (file.kind === 'balance') {
      const cooldowns = asObject(asObject(asObject(file.data)?.partner)?.cooldowns);
      if (cooldowns) Object.keys(cooldowns).forEach((id) => skillIds.add(id));
    }
    if (file.kind === 'case') {
      const root = asObject(file.data);
      const caseDirectory = normalisePath(file.relativePath).match(
        /^cases\/([a-z0-9_-]+)\/case\.json$/u,
      )?.[1];
      const caseId = root?.case_id;
      if (typeof caseId === 'string') caseIds.add(caseId);
      const encounters = Array.isArray(root?.encounters) ? root.encounters : [];
      addIds(encounterIds, encounters, 'encounter_id');
      if (caseDirectory) {
        encounters.forEach((encounter) => {
          const id = asObject(encounter)?.encounter_id;
          if (typeof id === 'string') encounterCaseById.set(id, caseDirectory);
        });
      }
      addIds(eventIds, Array.isArray(root?.events) ? root.events : [], 'event_id');
      const nonCombat = Array.isArray(root?.events_noncombat) ? root.events_noncombat : [];
      addIds(eventIds, nonCombat, 'event_id');
      if (caseDirectory) {
        nonCombat.forEach((event) => {
          const id = asObject(event)?.event_id;
          if (typeof id === 'string') eventCaseById.set(id, caseDirectory);
        });
      }
      for (const event of nonCombat) {
        addIds(choiceIds, catalogueEntries(event, 'choices'), 'choice_id');
      }
    }
  }

  return {
    externalIds: new Set([
      ...cardIds,
      ...enhancementIds,
      ...flagIds,
      ...relicIds,
      ...rewardIds,
      ...skillIds,
    ]),
    cardIds,
    enhancementIds,
    flagIds,
    relicIds,
    caseIds,
    encounterIds,
    eventIds,
    choiceIds,
    encounterCaseById,
    eventCaseById,
  };
}

function validateCommonReferences(
  files: readonly ValidatedFile[],
  definitions: ReturnType<typeof collectBundleDefinitions>,
): ToolValidationProblem[] {
  const problems: ToolValidationProblem[] = [];
  for (const file of files) {
    const root = asObject(file.data);
    if (!root) continue;
    if (file.kind === 'cards') {
      problems.push(
        ...validateReferences(
          file.relativePath,
          Array.isArray(root.initial_deck) ? root.initial_deck : undefined,
          definitions.cardIds,
          'initial_deck',
        ),
      );
    }
    if (file.kind === 'enhancements') {
      catalogueEntries(root, 'enhancements').forEach((entry, index) => {
        const enhancement = asObject(entry);
        if (!enhancement) return;
        for (const key of ['compatible_card_ids', 'merge_card_ids'] as const) {
          problems.push(
            ...validateReferences(
              file.relativePath,
              Array.isArray(enhancement[key]) ? enhancement[key] : undefined,
              definitions.cardIds,
              `enhancements.${index}.${key}`,
            ),
          );
        }
        const resultCard = enhancement.result_card_id;
        if (typeof resultCard === 'string' && !definitions.cardIds.has(resultCard)) {
          problems.push(
            referenceProblem(
              file.relativePath,
              `enhancements.${index}.result_card_id`,
              resultCard,
            ),
          );
        }
      });
    }
    if (file.kind === 'relics') {
      catalogueEntries(root, 'relics').forEach((entry, index) => {
        const linkedFlag = asObject(entry)?.linked_flag_id;
        if (typeof linkedFlag === 'string' && !definitions.flagIds.has(linkedFlag)) {
          problems.push(
            referenceProblem(file.relativePath, `relics.${index}.linked_flag_id`, linkedFlag),
          );
        }
      });
    }
    if (file.kind === 'rewards') {
      catalogueEntries(root, 'rewards').forEach((entry, index) => {
        const reward = asObject(entry);
        if (!reward) return;
        const referenceId = reward.reference_id;
        const known =
          reward.type === 'CARD'
            ? definitions.cardIds
            : reward.type === 'ENHANCEMENT'
              ? definitions.enhancementIds
              : reward.type === 'RELIC'
                ? definitions.relicIds
                : undefined;
        if (typeof referenceId === 'string' && known && !known.has(referenceId)) {
          problems.push(
            referenceProblem(file.relativePath, `rewards.${index}.reference_id`, referenceId),
          );
        }
        problems.push(
          ...validateReferences(
            file.relativePath,
            Array.isArray(reward.episode_ids) ? reward.episode_ids : undefined,
            definitions.caseIds,
            `rewards.${index}.episode_ids`,
          ),
        );
      });
    }
    if (file.kind === 'flags') {
      catalogueEntries(root, 'flags').forEach((entry, flagIndex) => {
        const flag = asObject(entry);
        if (!flag) return;
        const setBy: unknown[] = Array.isArray(flag.set_by)
          ? (flag.set_by as unknown[])
          : [];
        const consumedBy: unknown[] = Array.isArray(flag.consumed_by)
          ? (flag.consumed_by as unknown[])
          : [];
        const hooks: unknown[] = [...setBy, ...consumedBy];
        hooks.forEach((hook, hookIndex) => {
          const object = asObject(hook);
          if (!object) return;
          const references = [
            ['encounter', definitions.encounterIds],
            ['event', definitions.eventIds],
            ['choice', definitions.choiceIds],
          ] as const;
          for (const [key, known] of references) {
            const id = object[key];
            if (typeof id === 'string' && !known.has(id)) {
              problems.push(
                referenceProblem(
                  file.relativePath,
                  `flags.${flagIndex}.hooks.${hookIndex}.${key}`,
                  id,
                ),
              );
            }
          }
        });
      });
    }
    if (file.kind === 'balance') {
      const byEncounter = asObject(asObject(root.overrides)?.byEncounter);
      if (byEncounter) {
        for (const encounterId of Object.keys(byEncounter)) {
          if (!definitions.encounterIds.has(encounterId)) {
            problems.push(
              referenceProblem(
                file.relativePath,
                `overrides.byEncounter.${encounterId}`,
                encounterId,
              ),
            );
          }
        }
      }
    }
    if (file.kind === 'run-strip') {
      catalogueEntries(root, 'nodes').forEach((entry, index) => {
        const node = asObject(entry);
        if (!node) return;
        const ref = node.ref;
        const caseDirectory = node.case_directory;
        const referenceOwners = node.kind === 'EVENT'
          ? definitions.eventCaseById
          : definitions.encounterCaseById;
        if (typeof ref !== 'string' || !referenceOwners.has(ref)) {
          if (typeof ref === 'string') {
            problems.push(referenceProblem(file.relativePath, `nodes.${index}.ref`, ref));
          }
          return;
        }
        if (
          typeof caseDirectory === 'string' &&
          referenceOwners.get(ref) !== caseDirectory
        ) {
          problems.push({
            kind: 'tier1',
            relativePath: file.relativePath,
            message: `[CASE_DIRECTORY_MISMATCH] $.nodes.${index}.case_directory: ${ref} belongs to ${referenceOwners.get(ref) ?? 'unknown'}`,
          });
        }
      });
    }
  }
  return problems;
}

export function validateContentFiles(
  files: readonly ToolContentFile[],
): readonly ToolValidationProblem[] {
  const validator = new SchemaValidator();
  const problems: ToolValidationProblem[] = [];
  const validated: ValidatedFile[] = [];

  for (const file of files) {
    const registration = schemaForPath(file.relativePath);
    if (!registration) {
      problems.push({
        kind: 'schema',
        relativePath: file.relativePath,
        message: '[SCHEMA_NOT_REGISTERED] No Zod schema is registered for this content file.',
      });
      continue;
    }
    const report = validator.validate(registration.schema, file.value, file.relativePath);
    if (!report.valid) {
      problems.push(...report.issues.map(issueProblem));
      continue;
    }
    validated.push({ ...file, kind: registration.kind, data: report.data });
  }

  const definitions = collectBundleDefinitions(validated);
  for (const file of validated) {
    if (file.kind !== 'case') continue;
    const report = validator.validateTier1Case(file.data, file.relativePath, {
      externalIds: definitions.externalIds,
    });
    if (!report.valid) {
      problems.push(...report.issues.map(issueProblem));
      continue;
    }
    problems.push(
      ...validateCaseTier2AndTier3(file.data as CaseDefinition, file.relativePath),
    );
  }
  problems.push(...validateCommonReferences(validated, definitions));
  return problems;
}
