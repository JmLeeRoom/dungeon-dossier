import { readFile } from 'node:fs/promises';
import { URL } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  validateContentFiles,
  type ToolContentFile,
  type ToolValidationProblem,
} from '../../src/content-io/ToolContentValidator';
import { RESOLUTION_CODES, type InvalidReason } from '../../src/engine/resolution';

const CONTENT_ROOT = new URL('../../content/', import.meta.url);
const CASE_SOURCE = 'cases/tutorial/case.json';
const CASE_DIALOGUE_SOURCE = 'cases/tutorial/dialogue.json';
const SLIME_SOURCE = 'cases/tutorial/dialogue/enc_tutorial_slime.json';

/** The resolver publishes its invalid reasons as a type, so a rename breaks compilation here. */
const INVALID_REASONS = [
  'INCOMPATIBLE_TARGET',
  'TARGET_NOT_EXPOSED',
  'MISSING_TARGET',
  'MISSING_EVIDENCE',
  'MISSING_PROOF_RULE',
  'RESERVED_INTENT',
  'SILENCE',
] as const satisfies readonly InvalidReason[];

type JsonRecord = Record<string, unknown>;

async function contentFile(relativePath: string): Promise<ToolContentFile> {
  const source = await readFile(new URL(relativePath, CONTENT_ROOT), 'utf8');
  return { relativePath, value: JSON.parse(source) as unknown };
}

async function joinBundle(): Promise<ToolContentFile[]> {
  return Promise.all([
    contentFile('common/cards.json'),
    contentFile('common/balance.json'),
    contentFile(CASE_SOURCE),
    contentFile(CASE_DIALOGUE_SOURCE),
    contentFile(SLIME_SOURCE),
    contentFile('cases/tutorial/dialogue/enc_tutorial_harpy.json'),
    contentFile('cases/tutorial/dialogue/enc_tutorial_minotaur.json'),
  ]);
}

function record(value: unknown, label: string): JsonRecord {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${label} is not a JSON object.`);
  }
  return value as JsonRecord;
}

function fileValue(files: readonly ToolContentFile[], relativePath: string): JsonRecord {
  const file = files.find((candidate) => candidate.relativePath === relativePath);
  if (file === undefined) throw new Error(`Fixture is missing ${relativePath}.`);
  return record(file.value, relativePath);
}

function section(dialogue: JsonRecord, key: string): JsonRecord {
  return record(dialogue[key], `dialogue.${key}`);
}

function embeddedDialogue(files: readonly ToolContentFile[]): JsonRecord {
  return record(fileValue(files, CASE_SOURCE).dialogue, 'case dialogue');
}

function withoutFile(
  files: readonly ToolContentFile[],
  relativePath: string,
): ToolContentFile[] {
  return files.filter((candidate) => candidate.relativePath !== relativePath);
}

function report(problems: readonly ToolValidationProblem[]): string {
  return problems.map((problem) => `${problem.relativePath}: ${problem.message}`).join('\n');
}

function located(
  problems: readonly ToolValidationProblem[],
  relativePath: string,
  code: string,
  location: string,
): boolean {
  return problems.some(
    (problem) =>
      problem.relativePath === relativePath &&
      problem.message.startsWith(`[${code}] $.${location}:`),
  );
}

describe('dialogue ↔ encounter join validation', () => {
  it('accepts the checked-in tutorial case joined with its per-encounter dialogue', async () => {
    const problems = validateContentFiles(await joinBundle());
    expect(problems, report(problems)).toEqual([]);
  });

  it('rejects a speaker profile keyed to an entity the case does not define', async () => {
    const files = await joinBundle();
    const profiles = section(fileValue(files, SLIME_SOURCE), 'speaker_profiles');
    profiles.ent_tutorial_ghost = record(profiles.ent_tutorial_slime, 'slime profile');

    const problems = validateContentFiles(files);
    expect(
      located(problems, SLIME_SOURCE, 'UNRESOLVED_REFERENCE', 'speaker_profiles.ent_tutorial_ghost'),
      report(problems),
    ).toBe(true);
  });

  it('rejects a speaker profile the joined encounter never interrogates', async () => {
    const files = await joinBundle();
    const profiles = section(fileValue(files, SLIME_SOURCE), 'speaker_profiles');
    profiles.ent_tutorial_harpy = record(profiles.ent_tutorial_slime, 'slime profile');

    const problems = validateContentFiles(files);
    expect(
      located(problems, SLIME_SOURCE, 'UNRESOLVED_REFERENCE', 'speaker_profiles.ent_tutorial_harpy'),
      report(problems),
    ).toBe(true);
  });

  it('reports a target entity left without a speaker profile anywhere in the chain', async () => {
    const files = await joinBundle();
    delete section(fileValue(files, SLIME_SOURCE), 'speaker_profiles').ent_tutorial_slime;
    const stillResolved = validateContentFiles(files);
    expect(
      located(stillResolved, SLIME_SOURCE, 'MISSING_FALLBACK', 'speaker_profiles.ent_tutorial_slime'),
      report(stillResolved),
    ).toBe(false);

    delete section(embeddedDialogue(files), 'speaker_profiles').ent_tutorial_slime;
    const problems = validateContentFiles(files);
    expect(
      located(problems, SLIME_SOURCE, 'MISSING_FALLBACK', 'speaker_profiles.ent_tutorial_slime'),
      report(problems),
    ).toBe(true);
  });

  it('rejects a statement for a claim the joined encounter never presents', async () => {
    const files = await joinBundle();
    const statements = section(fileValue(files, SLIME_SOURCE), 'statements');
    statements.clm_tutorial_harpy_who = record(statements.clm_tutorial_who, 'slime statement');

    const problems = validateContentFiles(files);
    expect(
      located(problems, SLIME_SOURCE, 'UNRESOLVED_REFERENCE', 'statements.clm_tutorial_harpy_who'),
      report(problems),
    ).toBe(true);
  });

  it('rejects a statement for a claim the case does not define', async () => {
    const files = await joinBundle();
    const statements = section(fileValue(files, SLIME_SOURCE), 'statements');
    statements.clm_tutorial_ghost = record(statements.clm_tutorial_who, 'slime statement');

    const problems = validateContentFiles(files);
    expect(
      located(problems, SLIME_SOURCE, 'UNRESOLVED_REFERENCE', 'statements.clm_tutorial_ghost'),
      report(problems),
    ).toBe(true);
  });

  it('reports a presented claim the runtime dialogue source cannot voice', async () => {
    const files = await joinBundle();
    delete section(fileValue(files, SLIME_SOURCE), 'statements').clm_tutorial_who;

    const problems = validateContentFiles(files);
    expect(
      located(problems, SLIME_SOURCE, 'MISSING_FALLBACK', 'statements.clm_tutorial_who.fallback'),
      report(problems),
    ).toBe(true);
  });

  it('rejects a reaction key no resolution code, invalid reason, or flow node emits', async () => {
    const files = await joinBundle();
    const reactions = section(fileValue(files, SLIME_SOURCE), 'reactions');
    reactions.R_TUTORIAL_INVENTED = ['만들어 낸 반응입니다.'];
    // A flow node reaction key only widens the dialogue that owns that node.
    reactions['reaction.tutorial.harpy'] = ['다른 인카운터의 흐름 반응입니다.'];

    const problems = validateContentFiles(files);
    expect(
      located(problems, SLIME_SOURCE, 'UNRESOLVED_REFERENCE', 'reactions.R_TUTORIAL_INVENTED'),
      report(problems),
    ).toBe(true);
    expect(
      located(problems, SLIME_SOURCE, 'UNRESOLVED_REFERENCE', 'reactions.reaction.tutorial.harpy'),
      report(problems),
    ).toBe(true);
  });

  it('reports every resolver-emittable reaction key the dialogue leaves uncovered', async () => {
    const files = await joinBundle();
    const dialogue = fileValue(files, SLIME_SOURCE);
    dialogue.reactions = {};

    const problems = validateContentFiles(files);
    const uncovered = [...RESOLUTION_CODES, ...INVALID_REASONS].filter(
      (reactionKey) =>
        !located(problems, SLIME_SOURCE, 'MISSING_FALLBACK', `reactions.${reactionKey}`),
    );
    expect(uncovered, report(problems)).toEqual([]);
  });

  it('rejects claim, speaker, and reaction keys duplicated inside one dialogue file', async () => {
    const files = await joinBundle();
    const dialogue = fileValue(files, SLIME_SOURCE);
    const profiles = section(dialogue, 'speaker_profiles');
    const statements = section(dialogue, 'statements');
    const reactions = section(dialogue, 'reactions');
    profiles[' ent_tutorial_slime'] = record(profiles.ent_tutorial_slime, 'slime profile');
    statements[' clm_tutorial_who'] = record(statements.clm_tutorial_who, 'slime statement');
    reactions[' SILENCE'] = ['중복된 침묵 반응입니다.'];

    const problems = validateContentFiles(files);
    expect(
      located(problems, SLIME_SOURCE, 'DUPLICATE_ID', 'speaker_profiles.ent_tutorial_slime'),
      report(problems),
    ).toBe(true);
    expect(
      located(problems, SLIME_SOURCE, 'DUPLICATE_ID', 'statements.clm_tutorial_who'),
      report(problems),
    ).toBe(true);
    expect(
      located(problems, SLIME_SOURCE, 'DUPLICATE_ID', 'reactions.SILENCE'),
      report(problems),
    ).toBe(true);
  });

  it('rejects a per-encounter dialogue file named after no encounter of its case', async () => {
    const files = await joinBundle();
    const orphanSource = 'cases/tutorial/dialogue/enc_tutorial_ghost.json';
    const orphaned: ToolContentFile[] = [
      ...withoutFile(files, SLIME_SOURCE),
      { relativePath: orphanSource, value: fileValue(files, SLIME_SOURCE) },
    ];

    const problems = validateContentFiles(orphaned);
    expect(
      problems.some(
        (problem) =>
          problem.relativePath === orphanSource &&
          problem.message.startsWith('[UNRESOLVED_REFERENCE] $:'),
      ),
      report(problems),
    ).toBe(true);
  });

  it('falls back to the case-embedded dialogue when a per-encounter file is absent', async () => {
    const files = await joinBundle();
    const problems = validateContentFiles(withoutFile(files, SLIME_SOURCE));

    expect(
      located(problems, CASE_SOURCE, 'MISSING_FALLBACK', 'dialogue.reactions.R_DIRECT_CONTRADICTION'),
      report(problems),
    ).toBe(true);
    // The shadowed case dialogue keeps its flow-node reaction keys unflagged.
    expect(
      located(problems, CASE_SOURCE, 'UNRESOLVED_REFERENCE', 'dialogue.reactions.reaction.tutorial.slime'),
      report(problems),
    ).toBe(false);
  });
});
