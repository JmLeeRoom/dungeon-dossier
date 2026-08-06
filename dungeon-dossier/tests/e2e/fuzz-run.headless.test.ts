import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import {
  BalanceSchema,
  CardsSchema,
  CaseSchema,
  type CaseDefinition,
} from '../../src/engine/domain';
import {
  EncounterCoordinator,
  type EncounterRuntimeState,
  type SubmissionRequest,
} from '../../src/engine/encounter/EncounterCoordinator';
import {
  HYPOTHESIS_RESULTS,
  INDEPENDENCE_RESULTS,
  lookupResolutionCode,
  RELATIONS,
  RELEVANCES,
  RESOLUTION_CODES,
  SUFFICIENCIES,
} from '../../src/engine/resolution';
import { createRngState } from '../../src/engine/rng';
import {
  getSimulationEncounter,
  SIMULATION_ARCHETYPES,
  type SimulationEncounterCatalogEntry,
} from '../../tools/simulate/routeSimulator';

function common(file: string): unknown {
  return JSON.parse(readFileSync(
    new URL(`../../content/common/${file}`, import.meta.url),
    'utf8',
  )) as unknown;
}

function caseContent(directory: string): CaseDefinition {
  return CaseSchema.parse(JSON.parse(readFileSync(
    new URL(`../../content/cases/${directory}/case.json`, import.meta.url),
    'utf8',
  )) as unknown);
}

const CARDS = CardsSchema.parse(common('cards.json'));
const BALANCE = BalanceSchema.parse(common('balance.json'));
const CASE_BY_ID: ReadonlyMap<string, CaseDefinition> = new Map(
  ['tutorial', 'ep001', 'ep004'].map((directory) => {
    const definition = caseContent(directory);
    return [definition.case_id, definition] as const;
  }),
);

const FUZZ_SEEDS = [11, 29, 47, 83, 131] as const;
/** Machine states in which the encounter still accepts player actions. */
const OPEN_MACHINE_STATES = [
  'BUILD_ARGUMENT',
  'FREE_REVIEW',
  'CHECK_OUTCOME',
] as const;
const TERMINAL_MACHINE_STATES = ['ENCOUNTER_COMPLETE', 'FAILED'] as const;

type Rng = () => number;
type FuzzCardDefinition = (typeof CARDS.cards)[number];

function createFuzzRng(seed: number): Rng {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let mixed = state;
    mixed = Math.imul(mixed ^ (mixed >>> 15), mixed | 1);
    mixed ^= mixed + Math.imul(mixed ^ (mixed >>> 7), mixed | 61);
    return ((mixed ^ (mixed >>> 14)) >>> 0) / 4_294_967_296;
  };
}

function pick<T>(rng: Rng, values: readonly T[]): T | undefined {
  if (values.length === 0) return undefined;
  return values[Math.floor(rng() * values.length) % values.length];
}

function playableHandCards(
  state: EncounterRuntimeState,
): readonly FuzzCardDefinition[] {
  const turn = state.resources.turn;
  return state.deck.hand.flatMap((cardId) => {
    const card = CARDS.cards.find((candidate) => candidate.card_id === cardId);
    if (card === undefined) return [];
    const cost = Math.max(
      0,
      (card.cost.cp ?? 0) + (state.actionCostDeltas[card.intent] ?? 0),
    );
    const playable =
      cost <= state.resources.commandPoints &&
      (state.cards[card.card_id]?.lockedUntilTurn ?? -1) < turn &&
      (state.actionLocks[card.intent] ?? -1) < turn;
    return playable ? [card] : [];
  });
}

/**
 * Wrong-but-legal move generator: random hand cards, random exposed (and
 * occasionally unexposed) target claims, and random evidence subsets whose
 * partial relevance is exactly the path that used to hit the 78 missing
 * resolution-table rows (BLK-0).
 */
function fuzzSubmission(
  rng: Rng,
  definition: CaseDefinition,
  state: EncounterRuntimeState,
): SubmissionRequest {
  const playable = playableHandCards(state);
  const cardId = (rng() < 0.85 ? pick(rng, playable)?.card_id : undefined)
    ?? pick(rng, state.deck.hand)
    ?? pick(rng, CARDS.cards.map((card) => card.card_id))
    ?? 'card_unknown';
  const claimIds = definition.claims.map((claim) => claim.claim_id);
  const exposedClaimIds = state.revealedIds.filter((claimId) =>
    claimIds.includes(claimId),
  );
  const targetRoll = rng();
  const targetClaimId = targetRoll < 0.7
    ? pick(rng, exposedClaimIds)
    : targetRoll < 0.9
      ? pick(rng, claimIds)
      : undefined;
  const acquiredEvidenceIds = Object.entries(state.evidence)
    .filter(([, evidence]) => evidence.acquired)
    .map(([evidenceId]) => evidenceId);
  const evidencePool = rng() < 0.85
    ? acquiredEvidenceIds
    : definition.evidence.map((evidence) => evidence.evidence_id);
  const subsetSize = Math.floor(rng() * 4);
  const evidenceIds: string[] = [];
  for (let index = 0; index < subsetSize; index += 1) {
    const candidate = pick(rng, evidencePool);
    if (candidate !== undefined && !evidenceIds.includes(candidate)) {
      evidenceIds.push(candidate);
    }
  }
  const routeId = rng() < 0.1
    ? pick(rng, definition.inquiry_routes.map((route) => route.route_id))
    : undefined;
  return {
    cardId,
    ...(targetClaimId === undefined ? {} : { targetClaimId }),
    ...(routeId === undefined ? {} : { routeId }),
    evidenceIds,
  };
}

interface FuzzRunResult {
  readonly submissions: number;
  readonly failedSubmissions: number;
  readonly maxSubmissions: number;
  readonly finalState: EncounterRuntimeState;
}

function driveFuzzEncounter(
  entry: SimulationEncounterCatalogEntry,
  definition: CaseDefinition,
  seed: number,
): FuzzRunResult {
  const rng = createFuzzRng(seed);
  const coordinator = EncounterCoordinator.begin({
    caseDefinition: definition,
    encounterId: entry.encounterId,
    cards: CARDS.cards,
    balance: BALANCE,
    rng: createRngState(seed, 'DECK_SHUFFLE'),
    ...(CARDS.initial_deck === undefined
      ? {}
      : { initialDeckCardIds: CARDS.initial_deck }),
  });
  const maxSubmissions = entry.turnLimit * 2 + 1;
  const iterationCap = maxSubmissions * 4 + 8;
  let submissions = 0;
  let failedSubmissions = 0;

  for (let iteration = 0; iteration < iterationCap; iteration += 1) {
    const snapshot = coordinator.snapshot;
    // The submit() rollback guarantees the machine never rests in RESOLVE.
    expect(snapshot.machine.state).not.toBe('RESOLVE');
    if (snapshot.outcome !== null || submissions >= maxSubmissions) break;

    const machineState = snapshot.machine.state;
    if (machineState === 'FREE_REVIEW') {
      coordinator.review();
      coordinator.beginArgument();
      continue;
    }
    if (machineState === 'BUILD_ARGUMENT') {
      submissions += 1;
      const request = fuzzSubmission(rng, definition, snapshot);
      try {
        const submission = coordinator.submit(request);
        expect(RESOLUTION_CODES).toContain(submission.resolution.code);
      } catch (error) {
        failedSubmissions += 1;
        expect(error).toBeInstanceOf(Error);
        // Expected validation errors must roll back to BUILD_ARGUMENT.
        expect(coordinator.snapshot.machine.state).toBe('BUILD_ARGUMENT');
      }
      continue;
    }
    if (machineState === 'CHECK_OUTCOME') {
      coordinator.endTurn();
      continue;
    }
    throw new Error(`Fuzz driver reached unexpected machine state ${machineState}.`);
  }

  return {
    submissions,
    failedSubmissions,
    maxSubmissions,
    finalState: coordinator.snapshot,
  };
}

describe('L1 fuzz runs (wrong-but-legal submissions across every encounter)', () => {
  it('probes all 432 resolution-table combinations without a single throw', () => {
    let combinations = 0;
    for (const intent of ['CONTRADICT', 'CONFIRM'] as const) {
      for (const relevance of RELEVANCES) {
        for (const relation of RELATIONS) {
          for (const sufficiency of SUFFICIENCIES) {
            for (const independence of INDEPENDENCE_RESULTS) {
              for (const hypotheses of HYPOTHESIS_RESULTS) {
                combinations += 1;
                const code = lookupResolutionCode({
                  intent,
                  relevance,
                  relation,
                  sufficiency,
                  independence,
                  hypotheses,
                });
                expect(RESOLUTION_CODES).toContain(code);
              }
            }
          }
        }
      }
    }
    expect(combinations).toBe(432);
  });

  describe.each([...SIMULATION_ARCHETYPES])('%s', (archetype) => {
    it.each([...FUZZ_SEEDS])(
      'seed %d always ends in a defined condition and never sticks in RESOLVE',
      (seed) => {
        const entry = getSimulationEncounter(archetype);
        const definition = CASE_BY_ID.get(entry.caseId);
        if (definition === undefined) {
          throw new Error(`Missing case definition ${entry.caseId}.`);
        }

        const result = driveFuzzEncounter(entry, definition, seed);
        const finalMachineState = result.finalState.machine.state;

        expect(result.submissions).toBeGreaterThan(0);
        expect(result.submissions).toBeLessThanOrEqual(result.maxSubmissions);
        expect(finalMachineState).not.toBe('RESOLVE');
        if (result.finalState.outcome !== null) {
          // Terminal outcome reached: the machine committed a terminal state.
          expect(TERMINAL_MACHINE_STATES).toContain(finalMachineState);
        } else {
          // Step cap reached: the machine must still be accepting actions.
          expect(result.submissions).toBe(result.maxSubmissions);
          expect(OPEN_MACHINE_STATES).toContain(finalMachineState);
        }
      },
    );
  });
});
