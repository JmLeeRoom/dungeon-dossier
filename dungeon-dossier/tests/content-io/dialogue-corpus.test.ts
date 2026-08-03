import { readFile } from 'node:fs/promises';

import { describe, expect, it } from 'vitest';

import {
  CaseSchema,
  DialogueSchema,
  type CaseDefinition,
  type DialogueDefinition,
} from '../../src/content-io';

const CASE_FILES = [
  'cases/tutorial/case.json',
  'cases/ep001/case.json',
  'cases/ep004/case.json',
] as const;

const FACETS = ['WHO', 'WHEN', 'WHERE', 'WHAT', 'HOW', 'WHY'] as const;

const ENCOUNTER_DIALOGUE_FILES = [
  'cases/tutorial/dialogue/enc_tutorial_slime.json',
  'cases/tutorial/dialogue/enc_tutorial_harpy.json',
  'cases/tutorial/dialogue/enc_tutorial_minotaur.json',
  'cases/ep001/dialogue/enc_ep001_goblin.json',
  'cases/ep001/dialogue/enc_ep001_orc.json',
  'cases/ep001/dialogue/enc_ep001_succubus.json',
  'cases/ep004/dialogue/enc_ep004_dwarf.json',
  'cases/ep004/dialogue/enc_ep004_cyclops.json',
  'cases/ep004/dialogue/enc_ep004_fallen_hero.json',
] as const;

const REQUIRED_REACTION_KEYS = [
  'R_DIRECT_CONTRADICTION',
  'R_INDIRECT_SUSPICION',
  'R_INSUFFICIENT_GROUNDS',
  'R_TRUTH_ATTACKED',
  'R_IRRELEVANT_EVIDENCE',
  'R_CONFIRM_LOCKED',
  'R_CONFIRM_PROVISIONAL',
  'R_CONFIRM_CONFLICT',
  'R_QUERY_SUCCESS',
  'R_QUERY_BLOCKED',
  'R_CLARIFY_SUCCESS',
  'R_CLARIFY_NOOP',
  'R_COMMIT_SUCCESS',
  'R_COMMIT_REFUSED',
  'R_FORENSIC_REVEALED',
  'R_PRESSURE_APPLIED',
  'R_PRESSURE_BACKFIRE',
  'R_RECOVER_APPLIED',
  'R_SPECIAL_APPLIED',
  'R_ACTION_INVALID',
  'R_PROCEDURE_VIOLATION',
  'INCOMPATIBLE_TARGET',
  'TARGET_NOT_EXPOSED',
  'MISSING_TARGET',
  'MISSING_EVIDENCE',
  'MISSING_PROOF_RULE',
  'RESERVED_INTENT',
  'SILENCE',
] as const;

async function loadDialogue(relativePath: string): Promise<DialogueDefinition> {
  const source = await readFile(
    new URL(`../../content/${relativePath}`, import.meta.url),
    'utf8',
  );
  return DialogueSchema.parse(JSON.parse(source) as unknown);
}

async function loadCase(relativePath: string): Promise<CaseDefinition> {
  const source = await readFile(
    new URL(`../../content/${relativePath}`, import.meta.url),
    'utf8',
  );
  return CaseSchema.parse(JSON.parse(source) as unknown);
}

function lineCount(dialogue: DialogueDefinition): number {
  const statements = Object.values(dialogue.statements).reduce(
    (total, statement) => total + statement.fallback.length,
    0,
  );
  const reactions = Object.values(dialogue.reactions).reduce(
    (total, lines) => total + lines.length,
    0,
  );
  return (
    statements +
    reactions +
    dialogue.confession.full.length +
    dialogue.confession.coerced.length
  );
}

describe('per-encounter fallback dialogue corpus', () => {
  it('exposes six target-spoken facets and two immediately usable query routes per encounter', async () => {
    const cases = await Promise.all(CASE_FILES.map(loadCase));

    for (const definition of cases) {
      for (const encounter of definition.encounters) {
        const claimIds = encounter.rounds.flatMap((round) => round.statement_claims);
        const claims = claimIds.map((claimId) => {
          const claim = definition.claims.find((candidate) => candidate.claim_id === claimId);
          if (claim === undefined) throw new Error(`Missing claim ${claimId}.`);
          return claim;
        });
        expect(claims).toHaveLength(6);
        expect(claims.map((claim) => claim.facet).sort()).toEqual([...FACETS].sort());
        expect(claims.every((claim) => claim.speaker === encounter.target_entity)).toBe(true);

        const opening = encounter.flow_nodes[0];
        if (opening === undefined) throw new Error(`Missing opening node for ${encounter.encounter_id}.`);
        expect(opening.reveal_claim_ids).toEqual(expect.arrayContaining(claimIds));
        expect(opening.open_route_ids).toHaveLength(2);
        for (const routeId of opening.open_route_ids) {
          const route = definition.inquiry_routes.find(
            (candidate) => candidate.route_id === routeId,
          );
          if (route === undefined) throw new Error(`Missing route ${routeId}.`);
          const target = definition.claims.find(
            (claim) => claim.claim_id === route.target_slot,
          );
          expect(route.allowed_intents).toContain('QUERY');
          expect(route.preconditions).toEqual([]);
          expect(['WHO', 'WHEN']).toContain(route.facet);
          expect(target?.speaker).toBe(encounter.target_entity);
          expect(target?.facet).toBe(route.facet);
        }
      }
    }
  });

  it.each(ENCOUNTER_DIALOGUE_FILES)('%s parses and covers runtime reactions', async (path) => {
    const dialogue = await loadDialogue(path);

    expect(Object.keys(dialogue.speaker_profiles)).toHaveLength(1);
    expect(Object.keys(dialogue.statements)).toHaveLength(6);
    expect(Object.keys(dialogue.reactions)).toEqual(
      expect.arrayContaining([...REQUIRED_REACTION_KEYS]),
    );

    for (const [claimId, statement] of Object.entries(dialogue.statements)) {
      for (const span of statement.spans) {
        expect(span.claim_id).toBe(claimId);
        for (const line of statement.fallback) {
          expect(span.end).toBeLessThanOrEqual(line.length);
          expect(line.slice(span.start, span.end)).not.toBe('');
        }
      }
    }
  });

  it('keeps the nine-encounter corpus within the authored 260-410 line budget', async () => {
    const dialogues = await Promise.all(ENCOUNTER_DIALOGUE_FILES.map(loadDialogue));
    const total = dialogues.reduce(
      (sum, dialogue) => sum + lineCount(dialogue),
      0,
    );

    expect(dialogues).toHaveLength(9);
    expect(total).toBeGreaterThanOrEqual(260);
    expect(total).toBeLessThanOrEqual(410);
  });
});
