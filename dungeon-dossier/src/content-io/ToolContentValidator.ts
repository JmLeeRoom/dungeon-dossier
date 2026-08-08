import type { ZodType } from 'zod';
import {
  RESOLUTION_CODES,
  type InvalidReason,
} from '../engine/domain/vocabulary';
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
  type DialogueDefinition,
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

/** The episode every run must open on. Content-layer rule, not an engine one. */
export const FIRST_EPISODE_ID = 'tutorial';

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
    if (file.kind === 'case' && definitions.flagIds.size > 0) {
      catalogueEntries(root, 'flag_hooks').forEach((entry, flagIndex) => {
        const flag = asObject(entry);
        if (!flag) return;
        const flagId = flag.flag_id;
        if (typeof flagId === 'string' && !definitions.flagIds.has(flagId)) {
          problems.push(
            referenceProblem(file.relativePath, `flag_hooks.${flagIndex}.flag_id`, flagId),
          );
        }
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
                  `flag_hooks.${flagIndex}.hooks.${hookIndex}.${key}`,
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
      // Every candidate of every slot must exist and be owned by the episode's
      // own case; a candidate the resolver could pick is as load-bearing as the
      // default one, so all of them are checked, not just `candidates[0]`.
      catalogueEntries(root, 'episodes').forEach((episodeEntry, episodeIndex) => {
        const episode = asObject(episodeEntry);
        if (!episode) return;
        const caseDirectory = episode.case_directory;
        // A run must always open on the tutorial. The engine cannot own this
        // rule — it may not name a case directory — so it lives here.
        if (episodeIndex === 0 && episode.episode_id !== FIRST_EPISODE_ID) {
          problems.push({
            kind: 'tier1',
            relativePath: file.relativePath,
            message:
              `[FIRST_EPISODE_MISMATCH] $.episodes.0.episode_id: ` +
              `a run must begin at ${FIRST_EPISODE_ID}, found ${String(episode.episode_id)}`,
          });
        }
        catalogueEntries(episode, 'slots').forEach((slotEntry, slotIndex) => {
          const slot = asObject(slotEntry);
          if (!slot) return;
          catalogueEntries(slot, 'candidates').forEach((candidateEntry, candidateIndex) => {
            const candidate = asObject(candidateEntry);
            if (!candidate) return;
            const ref = candidate.ref;
            const path =
              `episodes.${episodeIndex}.slots.${slotIndex}.candidates.${candidateIndex}`;
            const referenceOwners = candidate.kind === 'EVENT'
              ? definitions.eventCaseById
              : definitions.encounterCaseById;
            if (typeof ref !== 'string' || !referenceOwners.has(ref)) {
              if (typeof ref === 'string') {
                problems.push(referenceProblem(file.relativePath, `${path}.ref`, ref));
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
                message: `[CASE_DIRECTORY_MISMATCH] $.${path}.ref: ${ref} belongs to ${referenceOwners.get(ref) ?? 'unknown'}`,
              });
            }
          });
        });
      });
    }
  }
  return problems;
}

/**
 * `Resolution.reactionKey` is the invalid reason when one is set and the
 * resolution code otherwise, so both enums bound what the resolver can ask the
 * dialogue for. The resolver publishes the reasons as a type only, so this
 * record re-states them; a new reason breaks compilation here instead of
 * silently shrinking the required set.
 */
const INVALID_REASON_REACTION_KEYS: Readonly<Record<InvalidReason, true>> = {
  INCOMPATIBLE_TARGET: true,
  TARGET_NOT_EXPOSED: true,
  MISSING_TARGET: true,
  MISSING_EVIDENCE: true,
  MISSING_PROOF_RULE: true,
  RESERVED_INTENT: true,
  SILENCE: true,
};

const EMITTABLE_REACTION_KEYS: ReadonlySet<string> = new Set<string>([
  ...RESOLUTION_CODES,
  ...Object.keys(INVALID_REASON_REACTION_KEYS),
]);

const DIALOGUE_KEY_SECTIONS = ['speaker_profiles', 'statements', 'reactions'] as const;

type JoinIssueCode = 'DUPLICATE_ID' | 'MISSING_FALLBACK' | 'UNRESOLVED_REFERENCE';

interface EncounterJoinView {
  readonly encounterId: string;
  readonly targetEntity: string;
  readonly claimIds: ReadonlySet<string>;
  readonly flowReactionKeys: ReadonlySet<string>;
}

interface CaseJoinView {
  readonly relativePath: string;
  readonly directory: string;
  readonly definition: CaseDefinition;
  readonly rawDialogue: JsonObject | undefined;
  readonly encounters: readonly EncounterJoinView[];
  readonly entityIds: ReadonlySet<string>;
  readonly claimIds: ReadonlySet<string>;
}

interface DialogueJoinSource {
  readonly relativePath: string;
  /** Issue-location prefix; dialogue embedded in a case sits under `$.dialogue`. */
  readonly locationPrefix: string;
  /** Pre-parse object, because trimmed id keys collapse during parsing. */
  readonly rawSections: JsonObject | undefined;
  readonly definition: DialogueDefinition;
  readonly caseView: CaseJoinView;
  /** Encounters this source is authored for. */
  readonly scope: readonly EncounterJoinView[];
  /** Encounters that load this source at runtime, per createEncounterSession. */
  readonly served: readonly EncounterJoinView[];
  readonly scopeLabel: string;
}

interface DialogueFileReference {
  readonly directory: string;
  readonly encounterId: string;
  readonly file: ValidatedFile;
}

function joinProblem(
  relativePath: string,
  code: JoinIssueCode,
  location: string,
  message: string,
): ToolValidationProblem {
  return {
    kind: 'tier1',
    relativePath,
    message: `[${code}] ${location === '' ? '$' : `$.${location}`}: ${message}`,
  };
}

function encounterJoinViews(
  definition: CaseDefinition,
): readonly EncounterJoinView[] {
  return definition.encounters.map((encounter) => ({
    encounterId: encounter.encounter_id,
    targetEntity: encounter.target_entity,
    claimIds: new Set(encounter.rounds.flatMap((round) => round.statement_claims)),
    flowReactionKeys: new Set(encounter.flow_nodes.map((node) => node.reaction_key)),
  }));
}

function caseJoinView(file: ValidatedFile, directory: string): CaseJoinView {
  const definition = file.data as CaseDefinition;
  return {
    relativePath: file.relativePath,
    directory,
    definition,
    rawDialogue: asObject(asObject(file.value)?.dialogue),
    encounters: encounterJoinViews(definition),
    entityIds: new Set(definition.entities.map((entity) => entity.entity_id)),
    claimIds: new Set(definition.claims.map((claim) => claim.claim_id)),
  };
}

function duplicateKeyProblems(source: DialogueJoinSource): ToolValidationProblem[] {
  const problems: ToolValidationProblem[] = [];
  for (const section of DIALOGUE_KEY_SECTIONS) {
    const raw = asObject(source.rawSections?.[section]);
    if (!raw) continue;
    const firstSpelling = new Map<string, string>();
    for (const key of Object.keys(raw)) {
      const id = key.trim();
      const previous = firstSpelling.get(id);
      if (previous === undefined) {
        firstSpelling.set(id, key);
        continue;
      }
      problems.push(
        joinProblem(
          source.relativePath,
          'DUPLICATE_ID',
          `${source.locationPrefix}${section}.${id}`,
          `Duplicate ${section} key: "${previous}" and "${key}" resolve to ${id}`,
        ),
      );
    }
  }
  return problems;
}

function speakerJoinProblems(source: DialogueJoinSource): ToolValidationProblem[] {
  const problems: ToolValidationProblem[] = [];
  const interrogated = new Set(source.scope.map((encounter) => encounter.targetEntity));
  for (const entityId of Object.keys(source.definition.speaker_profiles)) {
    if (!source.caseView.entityIds.has(entityId)) {
      problems.push(
        joinProblem(
          source.relativePath,
          'UNRESOLVED_REFERENCE',
          `${source.locationPrefix}speaker_profiles.${entityId}`,
          `Unresolved entity reference: ${entityId}`,
        ),
      );
      continue;
    }
    if (!interrogated.has(entityId)) {
      problems.push(
        joinProblem(
          source.relativePath,
          'UNRESOLVED_REFERENCE',
          `${source.locationPrefix}speaker_profiles.${entityId}`,
          `Speaker profile is never interrogated by ${source.scopeLabel}: ${entityId}`,
        ),
      );
    }
  }
  for (const encounter of source.served) {
    const authored =
      source.definition.speaker_profiles[encounter.targetEntity] ??
      source.caseView.definition.dialogue.speaker_profiles[encounter.targetEntity];
    if (authored !== undefined) continue;
    problems.push(
      joinProblem(
        source.relativePath,
        'MISSING_FALLBACK',
        `${source.locationPrefix}speaker_profiles.${encounter.targetEntity}`,
        `Encounter ${encounter.encounterId} has no speaker profile: ${encounter.targetEntity}`,
      ),
    );
  }
  return problems;
}

function statementJoinProblems(source: DialogueJoinSource): ToolValidationProblem[] {
  const problems: ToolValidationProblem[] = [];
  const presented = new Set(
    source.scope.flatMap((encounter) => [...encounter.claimIds]),
  );
  for (const claimId of Object.keys(source.definition.statements)) {
    if (!source.caseView.claimIds.has(claimId)) {
      problems.push(
        joinProblem(
          source.relativePath,
          'UNRESOLVED_REFERENCE',
          `${source.locationPrefix}statements.${claimId}`,
          `Unresolved claim reference: ${claimId}`,
        ),
      );
      continue;
    }
    if (!presented.has(claimId)) {
      problems.push(
        joinProblem(
          source.relativePath,
          'UNRESOLVED_REFERENCE',
          `${source.locationPrefix}statements.${claimId}`,
          `Claim is never presented by ${source.scopeLabel}: ${claimId}`,
        ),
      );
    }
  }
  for (const encounter of source.served) {
    for (const claimId of encounter.claimIds) {
      if (source.definition.statements[claimId] !== undefined) continue;
      problems.push(
        joinProblem(
          source.relativePath,
          'MISSING_FALLBACK',
          `${source.locationPrefix}statements.${claimId}.fallback`,
          `Encounter ${encounter.encounterId} presents a claim with no statement: ${claimId}`,
        ),
      );
    }
  }
  return problems;
}

function reactionJoinProblems(source: DialogueJoinSource): ToolValidationProblem[] {
  const problems: ToolValidationProblem[] = [];
  const authored = new Set(Object.keys(source.definition.reactions));
  // Flow nodes name their own reaction keys, so they widen what may be
  // authored without widening what the resolver asks for after an action.
  const flowKeys = new Set(
    source.scope.flatMap((encounter) => [...encounter.flowReactionKeys]),
  );
  for (const reactionKey of authored) {
    if (EMITTABLE_REACTION_KEYS.has(reactionKey) || flowKeys.has(reactionKey)) continue;
    problems.push(
      joinProblem(
        source.relativePath,
        'UNRESOLVED_REFERENCE',
        `${source.locationPrefix}reactions.${reactionKey}`,
        `No resolution code, invalid reason, or flow node of ${source.scopeLabel} emits this reaction key: ${reactionKey}`,
      ),
    );
  }
  if (source.served.length === 0) return problems;
  for (const reactionKey of EMITTABLE_REACTION_KEYS) {
    if (authored.has(reactionKey)) continue;
    problems.push(
      joinProblem(
        source.relativePath,
        'MISSING_FALLBACK',
        `${source.locationPrefix}reactions.${reactionKey}`,
        `Resolver can emit this reaction key but ${source.scopeLabel} has no line: ${reactionKey}`,
      ),
    );
  }
  return problems;
}

function dialogueJoinSources(
  caseView: CaseJoinView,
  caseScopeFile: ValidatedFile | undefined,
  encounterScopeFiles: readonly DialogueFileReference[],
): readonly DialogueJoinSource[] {
  const dedicated = new Map(
    encounterScopeFiles.map((reference) => [reference.encounterId, reference.file]),
  );
  const caseScopeLabel = `case ${caseView.directory}`;
  const sources: DialogueJoinSource[] = [{
    relativePath: caseView.relativePath,
    locationPrefix: 'dialogue.',
    rawSections: caseView.rawDialogue,
    definition: caseView.definition.dialogue,
    caseView,
    scope: caseView.encounters,
    served: caseView.encounters.filter(
      (encounter) => !dedicated.has(encounter.encounterId),
    ),
    scopeLabel: caseScopeLabel,
  }];
  if (caseScopeFile !== undefined) {
    sources.push({
      relativePath: caseScopeFile.relativePath,
      locationPrefix: '',
      rawSections: asObject(caseScopeFile.value),
      definition: caseScopeFile.data as DialogueDefinition,
      caseView,
      scope: caseView.encounters,
      // FallbackRepository.load() backs the developer console only; the session
      // falls back to the case-embedded dialogue, never to this file.
      served: [],
      scopeLabel: caseScopeLabel,
    });
  }
  for (const encounter of caseView.encounters) {
    const file = dedicated.get(encounter.encounterId);
    if (file === undefined) continue;
    sources.push({
      relativePath: file.relativePath,
      locationPrefix: '',
      rawSections: asObject(file.value),
      definition: file.data as DialogueDefinition,
      caseView,
      scope: [encounter],
      served: [encounter],
      scopeLabel: encounter.encounterId,
    });
  }
  return sources;
}

function validateDialogueJoins(files: readonly ValidatedFile[]): ToolValidationProblem[] {
  const caseViews = new Map<string, CaseJoinView>();
  const caseScopeFiles = new Map<string, ValidatedFile>();
  const encounterScopeFiles: DialogueFileReference[] = [];

  for (const file of files) {
    const path = normalisePath(file.relativePath);
    if (file.kind === 'case') {
      const directory = path.match(/^cases\/([a-z0-9_-]+)\/case\.json$/u)?.[1];
      if (directory !== undefined) caseViews.set(directory, caseJoinView(file, directory));
      continue;
    }
    if (file.kind !== 'dialogue') continue;
    const caseScope = path.match(/^cases\/([a-z0-9_-]+)\/dialogue\.json$/u)?.[1];
    if (caseScope !== undefined) {
      caseScopeFiles.set(caseScope, file);
      continue;
    }
    const encounterScope = path.match(
      /^cases\/([a-z0-9_-]+)\/dialogue\/([a-z0-9_-]+)\.json$/u,
    );
    const directory = encounterScope?.[1];
    const encounterId = encounterScope?.[2];
    if (directory !== undefined && encounterId !== undefined) {
      encounterScopeFiles.push({ directory, encounterId, file });
    }
  }

  const problems: ToolValidationProblem[] = [];
  for (const [directory, caseView] of caseViews) {
    const encounterIds = new Set(
      caseView.encounters.map((encounter) => encounter.encounterId),
    );
    const owned = encounterScopeFiles.filter(
      (reference) => reference.directory === directory,
    );
    for (const reference of owned) {
      if (encounterIds.has(reference.encounterId)) continue;
      problems.push(
        joinProblem(
          reference.file.relativePath,
          'UNRESOLVED_REFERENCE',
          '',
          `Dialogue file name does not match an encounter of case ${directory}: ${reference.encounterId}`,
        ),
      );
    }
    const sources = dialogueJoinSources(
      caseView,
      caseScopeFiles.get(directory),
      owned.filter((reference) => encounterIds.has(reference.encounterId)),
    );
    for (const source of sources) {
      problems.push(
        ...duplicateKeyProblems(source),
        ...speakerJoinProblems(source),
        ...statementJoinProblems(source),
        ...reactionJoinProblems(source),
      );
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
  problems.push(...validateDialogueJoins(validated));
  return problems;
}
