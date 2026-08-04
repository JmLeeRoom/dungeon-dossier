import { readFile } from 'node:fs/promises';

import { beforeAll, describe, expect, it } from 'vitest';

import { CaseSchema, type CaseDefinition } from '../../src/engine/domain';
import {
  FLOW_ENTER_CONDITION_TYPES,
  assertFlowDefinition,
  runFlowTransition,
  type FlowRuntimeState,
} from '../../src/engine/encounter/FlowRunner';

const CASE_FILES = [
  'tutorial/case.json',
  'ep001/case.json',
  'ep004/case.json',
] as const;

const BOSS_IDS = [
  'enc_tutorial_minotaur',
  'enc_ep001_succubus',
  'enc_ep004_fallen_hero',
] as const;

let cases: readonly CaseDefinition[];

async function loadCase(file: (typeof CASE_FILES)[number]): Promise<CaseDefinition> {
  const source = await readFile(
    new URL(`../../content/cases/${file}`, import.meta.url),
    'utf8',
  );
  return CaseSchema.parse(JSON.parse(source) as unknown);
}

function bossById(encounterId: (typeof BOSS_IDS)[number]) {
  for (const definition of cases) {
    const encounter = definition.encounters.find(
      (candidate) => candidate.encounter_id === encounterId,
    );
    if (encounter !== undefined) return { definition, encounter };
  }
  throw new Error(`Missing real boss encounter ${encounterId}.`);
}

beforeAll(async () => {
  cases = await Promise.all(CASE_FILES.map(loadCase));
});

describe('authored boss phases', () => {
  it('gives every boss two or three well-formed rounds with durable shields', () => {
    for (const bossId of BOSS_IDS) {
      const { encounter } = bossById(bossId);
      expect(encounter.rounds.length).toBeGreaterThanOrEqual(2);
      expect(encounter.rounds.length).toBeLessThanOrEqual(3);
      expect(new Set(encounter.rounds.map((round) => round.round_id)).size).toBe(
        encounter.rounds.length,
      );

      for (const round of encounter.rounds) {
        expect(round.statement_claims.length).toBeGreaterThanOrEqual(1);
        expect(round.shields.length).toBeGreaterThanOrEqual(1);
        for (const shield of round.shields) {
          expect(round.statement_claims).toContain(shield.claim_id);
          expect(shield.durability).toBeGreaterThan(0);
        }
      }
    }
  });

  it('uses an ALWAYS opening and only claim-epistemic phase gates', () => {
    for (const bossId of BOSS_IDS) {
      const { encounter } = bossById(bossId);
      expect(encounter.flow_nodes.length).toBeGreaterThanOrEqual(2);
      expect(encounter.flow_nodes.length).toBeLessThanOrEqual(3);
      expect(
        new Set(encounter.flow_nodes.map((node) => node.node_id)).size,
      ).toBe(encounter.flow_nodes.length);
      expect(encounter.flow_nodes[0]?.enter_conditions).toEqual([
        { type: 'ALWAYS' },
      ]);

      const claimIds = new Set(
        encounter.rounds.flatMap((round) => round.statement_claims),
      );
      const priorReveals = new Set(encounter.flow_nodes[0]?.reveal_claim_ids);
      for (const node of encounter.flow_nodes.slice(1)) {
        expect(node.enter_conditions.length).toBeGreaterThanOrEqual(1);
        for (const condition of node.enter_conditions) {
          expect(FLOW_ENTER_CONDITION_TYPES).toContain(condition.type);
          expect(condition.type).toBe('CLAIM_EPISTEMIC');
          expect(condition.state ?? condition.epistemic).toBe('REFUTED');
          expect(claimIds.has(condition.claim_id ?? '')).toBe(true);
          expect(priorReveals.has(condition.claim_id ?? '')).toBe(true);
        }
        node.reveal_claim_ids.forEach((claimId) => priorReveals.add(claimId));
      }

      expect(() => assertFlowDefinition(encounter.flow_nodes)).not.toThrow();
    }
  });

  it('ends each ordered flow with a terminal node and preserves the Minotaur target id', () => {
    for (const bossId of BOSS_IDS) {
      const { encounter } = bossById(bossId);
      expect(encounter.flow_nodes.slice(0, -1).every((node) => !node.is_terminal)).toBe(
        true,
      );
      expect(encounter.flow_nodes.at(-1)?.is_terminal).toBe(true);
    }

    const { encounter: minotaur } = bossById('enc_tutorial_minotaur');
    expect(minotaur.flow_nodes[1]?.node_id).toBe(
      'node_tutorial_minotaur_fury',
    );
  });

  it('reproduces T-6 by revising the Fallen Hero committed claim', () => {
    const { definition, encounter } = bossById('enc_ep004_fallen_hero');
    const secondNode = encounter.flow_nodes[1];
    const revisedClaimId = secondNode?.revise_claim_ids[0];
    const gateClaimId = secondNode?.enter_conditions[0]?.claim_id;
    expect(revisedClaimId).toBeDefined();
    expect(gateClaimId).toBeDefined();

    const bossClaimIds = new Set(
      encounter.rounds.flatMap((round) => round.statement_claims),
    );
    const initialState: FlowRuntimeState = {
      enteredNodeIds: [],
      claims: Object.fromEntries(
        definition.claims
          .filter((claim) => bossClaimIds.has(claim.claim_id))
          .map((claim) => [
            claim.claim_id,
            {
              commitment: claim.initial.commitment,
              epistemic: 'UNKNOWN' as const,
              presentation: claim.initial.presentation,
            },
          ]),
      ),
      revealedClaimIds: [],
      openRouteIds: [],
      activeModifierIds: [],
      resources: {},
      terminal: false,
    };

    expect(initialState.claims[revisedClaimId!]?.commitment).toBe('COMMITTED');
    const opening = runFlowTransition(encounter.flow_nodes, initialState);
    expect(opening.node?.node_id).toBe('node_ep004_fallen_hero_start');

    const gateClaim = opening.state.claims[gateClaimId!];
    if (gateClaim === undefined) throw new Error('Missing Fallen Hero gate claim.');
    const readyState: FlowRuntimeState = {
      ...opening.state,
      claims: {
        ...opening.state.claims,
        [gateClaimId!]: { ...gateClaim, epistemic: 'REFUTED' },
      },
      terminal: false,
    };
    const secondPhase = runFlowTransition(encounter.flow_nodes, readyState);

    expect(secondPhase.node?.node_id).toBe(
      'node_ep004_fallen_hero_last_stand',
    );
    expect(secondPhase.state.claims[revisedClaimId!]?.commitment).toBe(
      'CONTRADICTED',
    );
    expect(secondPhase.state.claims[revisedClaimId!]?.epistemic).toBe(
      'REFUTED',
    );
  });
});
