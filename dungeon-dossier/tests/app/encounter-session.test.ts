import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import {
  BalanceSchema,
  CardsSchema,
  CaseSchema,
  FlagsSchema,
  RunStripSchema,
} from '../../src/content-io';
import { hasForbiddenPublicKey } from '../../src/dto';
import { serializeJudgmentLog } from '../../src/engine/log';
import { createRunState } from '../../src/engine/run';
import { createEncounterSession } from '../../src/app/createEncounterSession';

async function content(relativePath: string): Promise<unknown> {
  return JSON.parse(
    await readFile(new URL(`../../content/${relativePath}`, import.meta.url), 'utf8'),
  ) as unknown;
}

describe('encounter app session', () => {
  it('loads validated real content and derives the interrogation model from coordinator state', async () => {
    const [caseDefinition, cardsDefinition, balance] = await Promise.all([
      content('cases/tutorial/case.json').then((value) => CaseSchema.parse(value)),
      content('common/cards.json').then((value) => CardsSchema.parse(value)),
      content('common/balance.json').then((value) => BalanceSchema.parse(value)),
    ]);
    const session = await createEncounterSession({
      caseRepository: { load: async () => caseDefinition },
      cardRepository: { load: async () => cardsDefinition },
      balanceRepository: { reload: async () => balance },
      runSeed: 2_026_080_3,
    });

    const model = session.currentModel();
    expect(session.encounterId).toBe('enc_tutorial_slime');
    expect(session.targetClaimIdForFacet('WHEN')).toBe('clm_tutorial_when');
    expect(model.dto.statement.map((claim) => claim.claimId)).toEqual([
      'clm_tutorial_who',
      'clm_tutorial_when',
      'clm_tutorial_slime_where',
      'clm_tutorial_slime_what',
      'clm_tutorial_slime_how',
      'clm_tutorial_slime_why',
    ]);
    expect(model.cards.map((card) => card.cardId)).toEqual(
      session.coordinator.snapshot.deck.hand,
    );
    expect(hasForbiddenPublicKey(model.dto)).toBe(false);
    expect(session.fallbackCatalog.statements.clm_tutorial_when).toHaveLength(1);
    expect(session.fallbackCatalog.reactions.R_DIRECT_CONTRADICTION).toHaveLength(1);
    expect(session.fallbackCatalog.reactions.MISSING_PROOF_RULE).toHaveLength(1);
  });

  it('G-C1/G-C2 completes the authored tutorial encounter and replays byte-identically', async () => {
    const [caseDefinition, cardsDefinition, balance] = await Promise.all([
      content('cases/tutorial/case.json').then((value) => CaseSchema.parse(value)),
      content('common/cards.json').then((value) => CardsSchema.parse(value)),
      content('common/balance.json').then((value) => BalanceSchema.parse(value)),
    ]);
    const play = async (): Promise<string> => {
      const session = await createEncounterSession({
        caseRepository: { load: async () => caseDefinition },
        cardRepository: { load: async () => cardsDefinition },
        balanceRepository: { reload: async () => balance },
        runSeed: 77,
      });
      const coordinator = session.coordinator;
      expect(coordinator.snapshot.deck.hand).toHaveLength(5);
      const request = {
        cardId: 'card_contradict_basic',
        targetClaimId: 'clm_tutorial_when',
        evidenceIds: ['ev_tutorial_gate_log'],
      } as const;

      coordinator.beginArgument();
      const first = coordinator.submit(request);
      expect(first.resolution.code).toBe('R_DIRECT_CONTRADICTION');
      expect(first.outcome.bestResolution.secureStatementEnabled).toBe(false);
      expect(coordinator.snapshot.deck.discardPile).toContain('card_contradict_basic');
      coordinator.endTurn();
      coordinator.beginArgument();
      const query = coordinator.submit({
        cardId: 'card_query_when',
        targetClaimId: 'clm_tutorial_when',
        evidenceIds: [],
      });
      expect(query.resolution.code).toBe('R_QUERY_SUCCESS');
      expect(coordinator.snapshot.usedRouteIds).toContain('route_tutorial_when');
      expect(coordinator.snapshot.openRouteIds).toContain('route_tutorial_slime_how');
      coordinator.endTurn();
      expect(coordinator.snapshot.deck.hand).toContain('card_contradict_basic');
      coordinator.beginArgument();
      const second = coordinator.submit(request);
      expect(second.resolution.code).toBe('R_DIRECT_CONTRADICTION');
      expect(second.outcome.bestResolution.secureStatementEnabled).toBe(true);
      expect(coordinator.secureStatement().terminalOutcome).toBe('BEST_RESOLUTION');
      expect(hasForbiddenPublicKey(session.currentModel().dto)).toBe(false);
      return serializeJudgmentLog(coordinator.snapshot.log);
    };

    expect(await play()).toBe(await play());
  });

  it('carries run resources, deck, evidence, and consumed flag effects into the next encounter', async () => {
    const [caseDefinition, cardsDefinition, balance, flags] = await Promise.all([
      content('cases/tutorial/case.json').then((value) => CaseSchema.parse(value)),
      content('common/cards.json').then((value) => CardsSchema.parse(value)),
      content('common/balance.json').then((value) => BalanceSchema.parse(value)),
      content('common/flags.json').then((value) => FlagsSchema.parse(value)),
    ]);
    const cardIds = cardsDefinition.cards.flatMap((card) =>
      Array.from({ length: card.starting_copies }, () => card.card_id),
    );
    const runState = createRunState({
      runSeed: 71,
      stress: 60,
      dp: 7,
      trust: 0,
      deck: { drawPile: cardIds, hand: [], discardPile: [], exhaustPile: [] },
      flags: { 'F-02': true, 'F-03': true },
      acquiredEvidenceIds: ['ev_tutorial_receipt'],
    });
    const session = await createEncounterSession({
      caseRepository: { load: async () => caseDefinition },
      cardRepository: { load: async () => cardsDefinition },
      balanceRepository: { reload: async () => balance },
      encounterId: 'enc_tutorial_harpy',
      runState,
      flagDefinitions: flags.flags,
    });

    expect(session.coordinator.snapshot.resources).toMatchObject({
      stress: 60,
      dp: 7,
      trust: 1,
    });
    expect(session.coordinator.snapshot.deck.hand).toHaveLength(5);
    expect(session.coordinator.snapshot.evidence.ev_tutorial_receipt?.acquired).toBe(true);
    expect(session.coordinator.snapshot.evidence.ev_tutorial_corridor_photo?.acquired)
      .toBe(true);
  });

  it('applies every enabled authored flag consumer across all nine real encounters', async () => {
    const [cardsDefinition, balance, flags, stripDefinition] = await Promise.all([
      content('common/cards.json').then((value) => CardsSchema.parse(value)),
      content('common/balance.json').then((value) => BalanceSchema.parse(value)),
      content('common/flags.json').then((value) => FlagsSchema.parse(value)),
      content('common/run-strip.json').then((value) => RunStripSchema.parse(value)),
    ]);
    const definitions = Object.fromEntries(await Promise.all(
      ['tutorial', 'ep001', 'ep004'].map(async (directory) => [
        directory,
        CaseSchema.parse(await content(`cases/${directory}/case.json`)),
      ] as const),
    ));
    const cardIds = cardsDefinition.cards.flatMap((card) =>
      Array.from({ length: card.starting_copies }, () => card.card_id),
    );
    const runState = createRunState({
      runSeed: 91,
      stress: 80,
      dp: 5,
      trust: 0,
      deck: { drawPile: cardIds, hand: [], discardPile: [], exhaustPile: [] },
      flags: Object.fromEntries(flags.flags.map((flag) => [flag.flag_id, true])),
    });
    const encounterNodes = stripDefinition.nodes.filter(
      (node) => node.kind !== 'EVENT',
    );

    for (const node of encounterNodes) {
      const definition = definitions[node.case_directory];
      if (definition === undefined) throw new Error(`Missing case ${node.case_directory}.`);
      const session = await createEncounterSession({
        caseRepository: { load: async () => definition },
        cardRepository: { load: async () => cardsDefinition },
        balanceRepository: { reload: async () => balance },
        encounterId: node.ref,
        runState,
        flagDefinitions: flags.flags,
      });
      expect(hasForbiddenPublicKey(session.currentModel().dto)).toBe(false);
      expect(session.coordinator.snapshot.machine.state).toBe('FREE_REVIEW');
    }
    expect(encounterNodes).toHaveLength(9);
  });
});
