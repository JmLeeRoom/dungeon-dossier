import { readFile } from 'node:fs/promises';

import { beforeAll, describe, expect, it } from 'vitest';

import { CaseSchema, type CaseDefinition } from '../../src/engine/domain';
import {
  MODIFIER_EFFECT_TYPES,
  applyTriggeredModifiers,
  type ModifierRuntimeState,
} from '../../src/engine/encounter/ModifierSystem';

const CASE_FILES = [
  'tutorial/case.json',
  'ep001/case.json',
  'ep004/case.json',
] as const;

const DETERMINISTIC_SELECTIONS = new Set([
  'DETERMINISTIC_BY_INDEX',
  'HIGHEST_RESISTANCE',
  'MOST_RECENT',
  'SEEDED_RANDOM',
]);

const CANONICAL_MODIFIERS = [
  {
    encounterId: 'enc_tutorial_slime',
    trigger: 'ON_ENCOUNTER_START',
    effects: ['LOCK_CLAIM'],
  },
  {
    encounterId: 'enc_tutorial_harpy',
    trigger: 'ON_TURN_START_PRE_DRAW',
    effects: ['TRIGGER_QTE'],
  },
  {
    encounterId: 'enc_tutorial_minotaur',
    trigger: 'ON_COMPOSURE_THRESHOLD',
    effects: ['CHANGE_PHASE'],
  },
  {
    encounterId: 'enc_ep001_goblin',
    trigger: 'ON_RESOLUTION',
    effects: ['APPLY_COERCION'],
  },
  {
    encounterId: 'enc_ep001_orc',
    trigger: 'ON_TURN_START_PRE_DRAW',
    effects: ['ADD_TIMER', 'DAMAGE_EVIDENCE'],
  },
  {
    encounterId: 'enc_ep001_succubus',
    trigger: 'ON_ENCOUNTER_START',
    effects: ['ADD_TIMER'],
  },
  {
    encounterId: 'enc_ep001_succubus',
    trigger: 'ON_HAND_READY',
    effects: ['LOCK_CARD'],
  },
  {
    encounterId: 'enc_ep004_dwarf',
    trigger: 'ON_DIRECT_CONTRADICTION',
    effects: ['DISTORT_CLAIM_VIEW'],
  },
  {
    encounterId: 'enc_ep004_cyclops',
    trigger: 'ON_ENCOUNTER_START',
    effects: ['REDUCE_CP'],
  },
  {
    encounterId: 'enc_ep004_fallen_hero',
    trigger: 'ON_TURN_START_PRE_DRAW',
    effects: ['SEAL_EVIDENCE'],
  },
] as const;

let cases: readonly CaseDefinition[];

async function loadCase(directory: (typeof CASE_FILES)[number]): Promise<CaseDefinition> {
  const source = await readFile(
    new URL(`../../content/cases/${directory}`, import.meta.url),
    'utf8',
  );
  return CaseSchema.parse(JSON.parse(source) as unknown);
}

function encounterById(encounterId: string) {
  for (const definition of cases) {
    const encounter = definition.encounters.find(
      (candidate) => candidate.encounter_id === encounterId,
    );
    if (encounter !== undefined) return { definition, encounter };
  }
  throw new Error(`Missing real encounter ${encounterId}.`);
}

function modifierState(
  definition: CaseDefinition,
  encounterId: string,
  resources: Readonly<Record<string, number>>,
): ModifierRuntimeState {
  const { encounter } = encounterById(encounterId);
  const claimIds = encounter.rounds.flatMap((round) => round.statement_claims);
  return {
    turn: resources.turn ?? 1,
    claims: Object.fromEntries(
      claimIds.map((claimId) => {
        const claim = definition.claims.find(
          (candidate) => candidate.claim_id === claimId,
        );
        if (claim === undefined) throw new Error(`Missing claim ${claimId}.`);
        return [
          claimId,
          {
            commitment: claim.initial.commitment,
            epistemic: 'UNKNOWN' as const,
            presentation: claim.initial.presentation,
            resistance: claim.resistance ?? 0,
            facet: claim.facet,
          },
        ];
      }),
    ),
    evidence: Object.fromEntries(
      definition.evidence.map((evidence) => [
        evidence.evidence_id,
        {
          integrity: evidence.integrity?.initial ?? ('INTACT' as const),
          acquired: true,
        },
      ]),
    ),
    cards: {
      card_contradict_basic: {},
    },
    resources,
    revealedClaimIds: claimIds,
    evidenceOrder: definition.evidence.map((evidence) => evidence.evidence_id),
    hand: ['card_contradict_basic'],
    drawPile: [],
    discardPile: [],
    activeModifierIds: encounter.modifiers.map((modifier) => modifier.modifier_id),
    modifierActivations: {},
  };
}

beforeAll(async () => {
  cases = await Promise.all(CASE_FILES.map(loadCase));
});

describe('authored encounter modifiers', () => {
  it('gives all nine encounters at least one canonical modifier', () => {
    const encounters = cases.flatMap((definition) => definition.encounters);
    expect(encounters).toHaveLength(9);

    for (const expected of CANONICAL_MODIFIERS) {
      const { encounter } = encounterById(expected.encounterId);
      expect(encounter.modifiers.length).toBeGreaterThanOrEqual(1);
      for (const effect of expected.effects) {
        expect(
          encounter.modifiers.some(
            (modifier) =>
              modifier.trigger === expected.trigger &&
              modifier.effect.type === effect,
          ),
        ).toBe(true);
      }
    }
  });

  it('uses only ModifierSystem effect types and deterministic selector vocabulary', () => {
    for (const definition of cases) {
      for (const encounter of definition.encounters) {
        for (const modifier of encounter.modifiers) {
          expect(MODIFIER_EFFECT_TYPES).toContain(modifier.effect.type);
          const selection = modifier.effect.target_selector?.selection;
          if (selection === undefined) continue;
          expect(DETERMINISTIC_SELECTIONS.has(selection)).toBe(true);
          if (selection.includes('RANDOM')) {
            expect(selection).toBe('SEEDED_RANDOM');
          }
        }
      }
    }
  });

  it('keeps a usable counterplay route on every modifier', () => {
    for (const definition of cases) {
      for (const encounter of definition.encounters) {
        for (const modifier of encounter.modifiers) {
          expect(
            modifier.counterplay.allowed_intents.length > 0 ||
              modifier.counterplay.always_available,
          ).toBe(true);
        }
      }
    }
  });

  it('keeps every EP001 required proof path alive after one evidence loss', () => {
    const ep001 = cases.find(
      (definition) => definition.case_id === 'case_ep001_red_ledger',
    );
    if (ep001 === undefined) throw new Error('Missing EP001 case.');
    const requiredClaimIds = new Set(
      ep001.encounters.flatMap((encounter) =>
        encounter.objectives.required.flatMap((objective) =>
          objective.claim_id === undefined ? [] : [objective.claim_id],
        ),
      ),
    );

    for (const claimId of requiredClaimIds) {
      const rules = ep001.proof_rules.filter(
        (rule) => rule.target_claim_id === claimId,
      );
      expect(rules.length).toBeGreaterThan(0);
      expect(
        rules.some((rule) =>
          rule.guaranteed_evidence_sets?.some(
            (set) =>
              set.length >= 2 && set.includes('ev_ep001_orc_backup_bundle'),
          ),
        ),
      ).toBe(true);
    }
  });

  it('activates the Minotaur threshold compatibility phase through ON_RESOLUTION', () => {
    const { definition, encounter } = encounterById('enc_tutorial_minotaur');
    const result = applyTriggeredModifiers(
      modifierState(definition, encounter.encounter_id, {
        turn: 2,
        composure: 50,
        commandPoints: 0,
        coercion: 0,
      }),
      encounter.modifiers,
      'ON_RESOLUTION',
    );

    expect(result.appliedModifierIds).toContain(
      'mod_tutorial_minotaur_phase_shift_resolution',
    );
    expect(result.state.phaseId).toBe('node_tutorial_minotaur_fury');
  });

  it('activates the Dwarf direct-contradiction compatibility distortion', () => {
    const { definition, encounter } = encounterById('enc_ep004_dwarf');
    const state = modifierState(definition, encounter.encounter_id, {
      turn: 2,
      composure: 80,
      commandPoints: 1,
      coercion: 0,
    });
    const result = applyTriggeredModifiers(
      {
        ...state,
        claims: {
          ...state.claims,
          clm_ep004_who: {
            ...state.claims.clm_ep004_who!,
            epistemic: 'REFUTED',
          },
        },
      },
      encounter.modifiers,
      'ON_RESOLUTION',
    );

    expect(result.appliedModifierIds).toContain(
      'mod_ep004_dwarf_double_distortion_resolution',
    );
    expect(
      Object.values(result.state.claims).filter(
        (claim) => claim.presentation === 'DISTORTED',
      ),
    ).toHaveLength(2);
  });

  it('applies both Orc timer pressure and evidence damage from real data', () => {
    const { definition, encounter } = encounterById('enc_ep001_orc');
    const result = applyTriggeredModifiers(
      modifierState(definition, encounter.encounter_id, {
        turn: 1,
        composure: 100,
        commandPoints: 3,
        coercion: 0,
      }),
      encounter.modifiers,
      'ON_TURN_START_PRE_DRAW',
    );

    expect(result.appliedModifierIds).toEqual([
      'mod_ep001_orc_countdown',
      'mod_ep001_orc_evidence_damage',
    ]);
    expect(result.state.timerTurns).toBe(3);
    expect(result.state.evidence.ev_ep001_west_gate_log?.integrity).toBe(
      'DEGRADED',
    );
  });
});
