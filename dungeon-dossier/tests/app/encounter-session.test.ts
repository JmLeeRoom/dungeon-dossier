import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import {
  BalanceSchema,
  CardsSchema,
  CaseSchema,
  FlagsSchema,
  RunStripSchema,
  StringsSchema,
} from '../../src/content-io';
import { hasForbiddenPublicKey } from '../../src/dto';
import { serializeJudgmentLog } from '../../src/engine/log';
import { createRunState } from '../../src/engine/run';
import { createEncounterSession } from '../../src/app/createEncounterSession';
import { clearStrings, installStrings } from '../../src/app/i18n';

async function content(relativePath: string): Promise<unknown> {
  return JSON.parse(
    await readFile(new URL(`../../content/${relativePath}`, import.meta.url), 'utf8'),
  ) as unknown;
}

const RAW_KEY_PATTERN = /^[a-z0-9_]+\.[a-z0-9_.]+$/u;

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
    for (const card of model.cards) {
      const authored = cardsDefinition.cards.find((entry) => entry.card_id === card.cardId);
      expect(card.allowedFacets).toEqual(authored?.target.facets);
      expect(card.minEvidence).toBe(authored?.target.min_evidence ?? 0);
      expect(card.maxEvidence).toBe(authored?.target.max_evidence);
      expect(card.affordable).toBe((authored?.cost.cp ?? 0) <= model.dto.resources.commandPoints);
      expect(card.costIconAssetKey).toBe(
        card.affordable === true ? 'ui/icon_cp/active' : 'ui/icon_cp/deactive',
      );
      if (authored?.combat_profile !== undefined) {
        expect(card.combat).toMatchObject({
          targetRule: authored.combat_profile.target_rule,
          evidenceMode: authored.combat_profile.evidence_mode,
        });
        expect(card.combat?.roleLabel).not.toMatch(/^[A-Z_]+$/u);
      }
    }
    expect(model.claimExposureByFacet).toMatchObject({
      WHO: 'SHIELDED',
      WHEN: 'SHIELDED',
    });
    expect(model.suspectName).toBe('물컹이');
    // The case authors a tinted room that the delivery does not contain, so the
    // app layer rebinds it to the one approved interrogation background.
    expect(model.backgroundAssetKey).toBe('bg/interrogationroom/base');
    expect(model.suspectAssetSet).toEqual({
      base: 'idle/mulkung/base',
      upset: 'idle/mulkung/upset',
      lose: 'idle/mulkung/lose',
      stateMode: 'replace',
    });
    expect(model.partnerBaseAssetKey).toBe('idle/coffee/base');
    expect(model.partnerUsedAssetKey).toBe('idle/coffee/used');
    expect(model.suspectStatePart).toBe('base');
    expect(model.partnerCooldown).toEqual({ state: 'base', cooldownTurns: 0 });
    // Partner skill is live now that balance.json ships a configured cooldown (U-1).
    expect(model.partnerSkillAvailable).toBe(true);
    expect(hasForbiddenPublicKey(model.dto)).toBe(false);
    expect(session.fallbackCatalog.statements.clm_tutorial_when).toHaveLength(1);
    expect(session.fallbackCatalog.reactions.R_DIRECT_CONTRADICTION).toHaveLength(1);
    expect(session.fallbackCatalog.reactions.MISSING_PROOF_RULE).toHaveLength(1);
  });

  it('localizes every player-facing interrogation model field', async () => {
    const [caseDefinition, cardsDefinition, balance, strings] = await Promise.all([
      content('cases/tutorial/case.json').then((value) => CaseSchema.parse(value)),
      content('common/cards.json').then((value) => CardsSchema.parse(value)),
      content('common/balance.json').then((value) => BalanceSchema.parse(value)),
      content('common/strings.ko.json').then((value) => StringsSchema.parse(value)),
    ]);
    installStrings(strings.strings);
    try {
      const session = await createEncounterSession({
        caseRepository: { load: async () => caseDefinition },
        cardRepository: { load: async () => cardsDefinition },
        balanceRepository: { reload: async () => balance },
        runSeed: 2_026_080_3,
      });
      const model = session.currentModel();

      expect(model.cards.every((card) => !RAW_KEY_PATTERN.test(card.title))).toBe(true);
      expect(model.cards.every((card) => !RAW_KEY_PATTERN.test(card.description))).toBe(true);
      expect(model.dto.objectives[0]?.label).toBe('퇴근 시각 진술의 모순을 입증한다.');
      expect(model.dto.evidence.every((item) => !RAW_KEY_PATTERN.test(item.displayName)))
        .toBe(true);
      const displayedStrings = [
        model.suspectName,
        model.partnerName,
        ...model.cards.flatMap((card) => [card.title, card.description]),
        ...model.dto.statement.map((statement) => statement.text),
        ...model.dto.evidence.map((item) => item.displayName),
        ...model.dto.objectives.map((objective) => objective.label),
      ];
      expect(displayedStrings.filter((value) => RAW_KEY_PATTERN.test(value))).toEqual([]);
    } finally {
      clearStrings();
    }
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
      expect(second.outcome.bestResolution.secureStatementEnabled).toBe(false);
      coordinator.endTurn();
      while (!coordinator.snapshot.deck.hand.includes('card_contradict_basic')) {
        const cardId = coordinator.snapshot.deck.hand[0];
        if (cardId === undefined) throw new Error('Expected a playable card while cycling the deck.');
        coordinator.beginArgument();
        coordinator.submit({ cardId, evidenceIds: [] });
        coordinator.endTurn();
      }
      coordinator.beginArgument();
      const third = coordinator.submit(request);
      expect(third.resolution.code).toBe('R_DIRECT_CONTRADICTION');
      expect(third.outcome.bestResolution.secureStatementEnabled).toBe(true);
      expect(coordinator.secureStatement().terminalOutcome).toBe('BEST_RESOLUTION');
      expect(session.currentModel().suspectStatePart).toBe('lose');
      expect(hasForbiddenPublicKey(session.currentModel().dto)).toBe(false);
      return serializeJudgmentLog(coordinator.snapshot.log);
    };

    expect(await play()).toBe(await play());
  });

  it('projects the v2 atomic loop: instance-addressed hand and decision state', async () => {
    const [caseDefinition, cardsDefinition, balance] = await Promise.all([
      content('cases/tutorial/case.json').then((value) => CaseSchema.parse(value)),
      content('common/cards.json').then((value) => CardsSchema.parse(value)),
      content('common/balance.json').then((value) => BalanceSchema.parse(value)),
    ]);
    const session = await createEncounterSession({
      caseRepository: { load: async () => caseDefinition },
      cardRepository: { load: async () => cardsDefinition },
      balanceRepository: { reload: async () => balance },
      runSeed: 0,
      turnLoop: 'V2_ATOMIC',
      identity: {
        nodeId: 'node_tutorial',
        encounterAttemptId: 'test:node_tutorial:1',
        initialDrawSerial: 0,
      },
    });

    const model = session.currentModel();
    const instances = session.coordinator.snapshot.handInstances ?? [];
    expect(instances).toHaveLength(5);
    const drawSlots = session.coordinator.snapshot.drawSlots ?? [];
    expect(drawSlots).toHaveLength(5);
    expect(new Set(drawSlots.map((slot) => slot.blueprintId))).toHaveProperty(
      'size',
      5,
    );
    expect(session.coordinator.snapshot.cardDrawCursor).toBe(5);
    expect(model.dto.statement).toHaveLength(6);
    expect(model.dto.statement.filter((claim) => claim.resistance > 0)).toEqual([
      expect.objectContaining({ claimId: 'clm_tutorial_who', resistance: 1 }),
      expect.objectContaining({ claimId: 'clm_tutorial_when', resistance: 1 }),
    ]);
    // Every card view is addressed by its physical copy, in hand order.
    expect(model.cards.map((card) => card.instanceId)).toEqual(
      instances.map((instance) => instance.instanceId),
    );
    expect(model.cards.map((card) => card.cardId)).toEqual(
      instances.map((instance) => instance.blueprintId),
    );
    const duplicateGroup = model.cards.filter(
      (card) => model.cards.filter((candidate) => candidate.cardId === card.cardId).length > 1,
    );
    expect(duplicateGroup).toHaveLength(2);
    expect(new Set(duplicateGroup.map((card) => card.instanceId)).size).toBe(2);
    expect(model.pendingDecision).toBeUndefined();
    expect(model.canSecureStatement).toBe(false);

    // One valid Submit through the app boundary consumes exactly one turn.
    const contradiction = model.cards.find(
      (card) => card.cardId === 'card_decisive_proof',
    );
    if (contradiction?.instanceId === undefined) {
      throw new Error('Expected the tutorial decisive-proof card in hand.');
    }
    const firstHandInstanceIds = new Set(
      model.cards.map((card) => card.instanceId),
    );
    const result = session.coordinator.submitTransaction({
      cardId: 'card_decisive_proof',
      instanceId: contradiction.instanceId,
      targetClaimId: 'clm_tutorial_when',
      evidenceIds: ['ev_tutorial_gate_log'],
    });
    expect(result.kind).toBe('COMMITTED');
    if (result.kind !== 'COMMITTED') throw new Error('unreachable');
    expect(result.resolution.code).toBe('R_DIRECT_CONTRADICTION');
    expect(result.turnsSpent).toBe(1);
    expect(result.phase).toBe('INPUT');
    expect(session.modelForFrame(result.impactFrame).cards).toHaveLength(4);
    expect(session.modelForFrame(result.impactFrame).turn.current).toBe(1);
    expect(session.modelForFrame(result.settledFrame).cards).toHaveLength(0);
    expect(session.modelForFrame(result.committedFrame).cards).toHaveLength(5);
    expect(session.modelForFrame(result.committedFrame).turn.current).toBe(2);

    const after = session.currentModel();
    expect(after.turn.current).toBe(2);
    expect(after.pendingDecision).toBeUndefined();
    // The settlement discarded the whole hand; the next turn's cards are all
    // freshly minted instances.
    for (const card of after.cards) {
      expect(card.instanceId).toBeDefined();
      expect(firstHandInstanceIds.has(card.instanceId)).toBe(false);
    }
    expect(hasForbiddenPublicKey(after.dto)).toBe(false);
  });

  it('runs the P1 truth trap, shield break, and broken-claim finisher across turns', async () => {
    const [caseDefinition, cardsDefinition, balance] = await Promise.all([
      content('cases/tutorial/case.json').then((value) => CaseSchema.parse(value)),
      content('common/cards.json').then((value) => CardsSchema.parse(value)),
      content('common/balance.json').then((value) => BalanceSchema.parse(value)),
    ]);
    const session = await createEncounterSession({
      caseRepository: { load: async () => caseDefinition },
      cardRepository: { load: async () => cardsDefinition },
      balanceRepository: { reload: async () => balance },
      runSeed: 0,
      turnLoop: 'V2_ATOMIC',
      identity: { nodeId: 'node_truth_trap', encounterAttemptId: 'p1:slime:1' },
    });
    const instance = (cardId: string): string => {
      const value = session.currentModel().cards.find(
        (card) => card.cardId === cardId,
      )?.instanceId;
      if (value === undefined) throw new Error(`Expected ${cardId} in the current hand.`);
      return value;
    };
    expect(session.currentModel().cards.find(
      (card) => card.cardId === 'card_bat_threat',
    )?.warningLabels).toEqual(['주의: 다혈질·진실 공격 위험']);

    const truth = session.coordinator.submitTransaction({
      cardId: 'card_bat_threat',
      instanceId: instance('card_bat_threat'),
      targetClaimId: 'clm_tutorial_who',
      evidenceIds: [],
    });
    expect(truth.kind).toBe('COMMITTED');
    if (truth.kind !== 'COMMITTED') throw new Error('unreachable');
    expect(truth.resolution).toMatchObject({
      code: 'R_TRUTH_ATTACKED',
      effects: { composureDelta: 0, coercionDelta: 30, resistanceDelta: 0 },
    });
    expect(session.coordinator.snapshot.shieldDurabilityByClaimId?.clm_tutorial_who)
      .toBe(1);

    const breakShield = session.coordinator.submitTransaction({
      cardId: 'card_leading_question',
      instanceId: instance('card_leading_question'),
      targetClaimId: 'clm_tutorial_when',
      evidenceIds: ['ev_tutorial_gate_log'],
    });
    expect(breakShield.kind).toBe('COMMITTED');
    if (breakShield.kind !== 'COMMITTED') throw new Error('unreachable');
    expect(breakShield.resolution.effects).toMatchObject({
      composureDelta: -10,
      coercionDelta: 2,
      resistanceDelta: -1,
    });
    expect(breakShield.resolution.effects.epistemicState).toBeUndefined();
    expect(session.coordinator.snapshot.shieldDurabilityByClaimId?.clm_tutorial_when)
      .toBe(0);
    expect(session.coordinator.snapshot.claims.clm_tutorial_when?.epistemic)
      .toBe('UNKNOWN');

    const finish = session.coordinator.submitTransaction({
      cardId: 'card_point_contradiction',
      instanceId: instance('card_point_contradiction'),
      targetClaimId: 'clm_tutorial_when',
      evidenceIds: ['ev_tutorial_gate_log'],
    });
    expect(finish.kind).toBe('COMMITTED');
    if (finish.kind !== 'COMMITTED') throw new Error('unreachable');
    expect(finish.resolution.effects).toMatchObject({
      composureDelta: -25,
      coercionDelta: 5,
      resistanceDelta: 0,
      epistemicState: 'REFUTED',
    });
    expect(session.coordinator.snapshot.shieldDurabilityByClaimId?.clm_tutorial_when)
      .toBe(0);
  });

  it('evaluates supporting evidence before an IGNORE/BREAK shield mode and gates truth damage', async () => {
    const [caseDefinition, cardsDefinition, balance] = await Promise.all([
      content('cases/tutorial/case.json').then((value) => CaseSchema.parse(value)),
      content('common/cards.json').then((value) => CardsSchema.parse(value)),
      content('common/balance.json').then((value) => BalanceSchema.parse(value)),
    ]);
    const guardedCards = CardsSchema.parse({
      ...cardsDefinition,
      cards: cardsDefinition.cards.map((card) =>
        card.card_id === 'card_leading_question'
          ? {
              ...card,
              modifiers: [
                { type: 'ADJUST_RESOURCE', resource: 'composure', delta: -99 },
                { type: 'MODIFY_SHIELDS', target: 'runtime-selected-claim', delta: -1 },
              ],
            }
          : card,
      ),
    });
    const session = await createEncounterSession({
      caseRepository: { load: async () => caseDefinition },
      cardRepository: { load: async () => guardedCards },
      balanceRepository: { reload: async () => balance },
      runSeed: 1,
      turnLoop: 'V2_ATOMIC',
      identity: { nodeId: 'node_evidence_truth', encounterAttemptId: 'p1:truth:1' },
    });
    const leading = session.currentModel().cards.find(
      (card) => card.cardId === 'card_leading_question',
    );
    if (leading?.instanceId === undefined) throw new Error('Expected leading question.');
    const result = session.coordinator.submitTransaction({
      cardId: leading.cardId,
      instanceId: leading.instanceId,
      targetClaimId: 'clm_tutorial_who',
      evidenceIds: ['ev_tutorial_roster'],
    });
    expect(result.kind).toBe('COMMITTED');
    if (result.kind !== 'COMMITTED') throw new Error('unreachable');
    expect(result.resolution).toMatchObject({
      code: 'R_TRUTH_ATTACKED',
      effects: { composureDelta: 0, coercionDelta: 17, resistanceDelta: 0 },
    });
    expect(session.coordinator.snapshot.shieldDurabilityByClaimId?.clm_tutorial_who)
      .toBe(1);
  });

  it('advances logical and presented active-round cursors only through authored flow', async () => {
    const [caseDefinition, cardsDefinition, balance] = await Promise.all([
      content('cases/tutorial/case.json').then((value) => CaseSchema.parse(value)),
      content('common/cards.json').then((value) => CardsSchema.parse(value)),
      content('common/balance.json').then((value) => BalanceSchema.parse(value)),
    ]);
    const session = await createEncounterSession({
      caseRepository: { load: async () => caseDefinition },
      cardRepository: { load: async () => cardsDefinition },
      balanceRepository: { reload: async () => balance },
      encounterId: 'enc_tutorial_minotaur',
      runSeed: 0,
      turnLoop: 'V2_ATOMIC',
      identity: { nodeId: 'node_rounds', encounterAttemptId: 'p1:minotaur:1' },
    });
    expect(session.coordinator.snapshot).toMatchObject({
      activeRoundIndex: 0,
      presentedRoundIndex: 0,
    });
    const proof = session.currentModel().cards.find(
      (card) => card.cardId === 'card_decisive_proof',
    );
    if (proof?.instanceId === undefined) throw new Error('Expected decisive proof.');

    const result = session.coordinator.submitTransaction({
      cardId: proof.cardId,
      instanceId: proof.instanceId,
      targetClaimId: 'clm_tutorial_what',
      evidenceIds: ['ev_tutorial_locker_inventory'],
    });
    expect(result.kind).toBe('COMMITTED');
    if (result.kind !== 'COMMITTED') throw new Error('unreachable');
    expect(result.resolution.code).toBe('R_DIRECT_CONTRADICTION');
    expect(result.impactFrame.snapshot).toMatchObject({
      activeRoundIndex: 0,
      presentedRoundIndex: 0,
    });
    expect(result.settledFrame.snapshot).toMatchObject({
      activeRoundIndex: 1,
      presentedRoundIndex: 0,
    });
    expect(result.committedFrame.snapshot).toMatchObject({
      activeRoundIndex: 1,
      presentedRoundIndex: 1,
    });
    expect(session.targetClaimIdForFacet('HOW')).toBe('clm_tutorial_minotaur_how');
  });

  it('applies validated balance changes to the active encounter without restarting it', async () => {
    const [caseDefinition, cardsDefinition, balance] = await Promise.all([
      content('cases/tutorial/case.json').then((value) => CaseSchema.parse(value)),
      content('common/cards.json').then((value) => CardsSchema.parse(value)),
      content('common/balance.json').then((value) => BalanceSchema.parse(value)),
    ]);
    const session = await createEncounterSession({
      caseRepository: { load: async () => caseDefinition },
      cardRepository: { load: async () => cardsDefinition },
      balanceRepository: { reload: async () => balance },
      runSeed: 77,
    });
    const tuned = structuredClone(balance);
    tuned.dmg.contradict = 25;
    tuned.sweetSpot = { min: 10, max: 20 };
    tuned.overrides.byEncounter.enc_tutorial_slime = {
      composureMax: 75,
      coercionLimit: 55,
    };

    session.applyBalance(tuned);

    expect(session.balance).toBe(tuned);
    expect(session.coordinator.snapshot.resources.turn).toBe(1);
    expect(session.currentModel()).toMatchObject({
      composureMax: 75,
      coercionMax: 55,
      sweetSpotMin: 7.5,
      sweetSpotMax: 15,
    });
    session.coordinator.beginArgument();
    const result = session.coordinator.submit({
      cardId: 'card_contradict_basic',
      targetClaimId: 'clm_tutorial_when',
      evidenceIds: ['ev_tutorial_gate_log'],
    });

    expect(result.resolution.effects.composureDelta).toBe(-25);
    expect(session.coordinator.snapshot.resources.composure).toBe(35);
  });

  it('projects a configured partner cooldown as used until turn-start ticks reach zero', async () => {
    const [caseDefinition, cardsDefinition, balance] = await Promise.all([
      content('cases/tutorial/case.json').then((value) => CaseSchema.parse(value)),
      content('common/cards.json').then((value) => CardsSchema.parse(value)),
      content('common/balance.json').then((value) => BalanceSchema.parse(value)),
    ]);
    const configured = structuredClone(balance);
    configured.partner.cooldowns.partner_runtime = 2;
    const session = await createEncounterSession({
      caseRepository: { load: async () => caseDefinition },
      cardRepository: { load: async () => cardsDefinition },
      balanceRepository: { reload: async () => configured },
      partnerSkillId: 'partner_runtime',
      runSeed: 77,
    });

    expect(session.currentModel().partnerSkillAvailable).toBe(true);
    expect(session.usePartnerSkill()).toEqual({ state: 'used', cooldownTurns: 2 });
    expect(session.currentModel().partnerCooldown).toEqual({
      state: 'used',
      cooldownTurns: 2,
    });

    session.coordinator.beginArgument();
    session.coordinator.submit({
      cardId: 'card_contradict_basic',
      targetClaimId: 'clm_tutorial_when',
      evidenceIds: ['ev_tutorial_gate_log'],
    });
    session.coordinator.endTurn();
    expect(session.currentModel().partnerCooldown).toEqual({
      state: 'used',
      cooldownTurns: 1,
    });

    session.coordinator.beginArgument();
    session.coordinator.submit({
      cardId: 'card_query_when',
      targetClaimId: 'clm_tutorial_when',
      evidenceIds: [],
    });
    session.coordinator.endTurn();
    expect(session.currentModel().partnerCooldown).toEqual({
      state: 'base',
      cooldownTurns: 0,
    });
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
    // Driven by the authored catalogue, not the resolved route: a route that
    // stops visiting an encounter must not silently drop it from this gate.
    const authoredEncounters = Object.entries(definitions).flatMap(
      ([caseDirectory, definition]) =>
        definition.encounters.map((encounter) => ({
          caseDirectory,
          encounterId: encounter.encounter_id,
        })),
    );

    for (const node of authoredEncounters) {
      const definition = definitions[node.caseDirectory];
      if (definition === undefined) throw new Error(`Missing case ${node.caseDirectory}.`);
      const session = await createEncounterSession({
        caseRepository: { load: async () => definition },
        cardRepository: { load: async () => cardsDefinition },
        balanceRepository: { reload: async () => balance },
        encounterId: node.encounterId,
        runState,
        flagDefinitions: flags.flags,
      });
      expect(hasForbiddenPublicKey(session.currentModel().dto)).toBe(false);
      expect(session.coordinator.snapshot.machine.state).toBe('FREE_REVIEW');
    }
    expect(authoredEncounters.map((node) => node.encounterId)).toEqual([
      'enc_tutorial_slime',
      'enc_tutorial_harpy',
      'enc_tutorial_minotaur',
      'enc_ep001_goblin',
      'enc_ep001_orc',
      'enc_ep001_succubus',
      'enc_ep004_dwarf',
      'enc_ep004_cyclops',
      'enc_ep004_fallen_hero',
    ]);
    expect(authoredEncounters).toHaveLength(9);

    // …and the catalogue must still cover every encounter the strip can route.
    const routableEncounterRefs = stripDefinition.episodes.flatMap((episode) =>
      episode.slots
        .filter((slot) => slot.role !== 'EVENT')
        .flatMap((slot) => slot.candidates.map((candidate) => candidate.ref)),
    );
    expect(routableEncounterRefs.length).toBeGreaterThan(0);
    const covered = new Set(authoredEncounters.map((node) => node.encounterId));
    expect(routableEncounterRefs.filter((ref) => !covered.has(ref))).toEqual([]);
  });
});
