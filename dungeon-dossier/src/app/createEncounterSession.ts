import type { FallbackCatalog, FallbackResponseTemplate, SpeakerProfile } from '../ai';
import {
  BalanceRepository,
  CardRepository,
  CaseRepository,
  FallbackRepository,
  type BalanceDefinition,
  type CardsDefinition,
  type CaseDefinition,
  type DialogueDefinition,
} from '../content-io';
import {
  hasForbiddenPublicKey,
  toPublicDTO,
  type PartnerCooldownView,
  type PublicDTO,
} from '../dto';
import type { Facet, FlagDefinition } from '../engine/domain';
import {
  EncounterCoordinator,
  type EncounterCoordinatorDeps,
} from '../engine/encounter';
import { RESOLUTION_CODES } from '../engine/resolution';
import { createRngState } from '../engine/rng';
import { resolveFlagEffects, type RunState } from '../engine/run';
import { deriveSuspectStatePart } from '../engine/suspectState';
import type { InterrogationScreenModel } from '../ui/screens/interrogation';

interface CaseLoader {
  load(caseDirectory: string): Promise<CaseDefinition | undefined>;
}

interface CardLoader {
  load(): Promise<CardsDefinition | undefined>;
}

interface BalanceLoader {
  reload(): Promise<BalanceDefinition | undefined>;
}

interface EncounterDialogueLoader {
  loadEncounter(
    caseDirectory: string,
    dialogueFile: string,
  ): Promise<DialogueDefinition | undefined>;
}

export interface CreateEncounterSessionOptions {
  readonly caseDirectory?: string;
  readonly encounterId?: string;
  readonly runSeed?: number;
  readonly caseRepository?: CaseLoader;
  readonly cardRepository?: CardLoader;
  readonly balanceRepository?: BalanceLoader;
  readonly fallbackRepository?: EncounterDialogueLoader;
  readonly partnerName?: string;
  readonly partnerSkillId?: string;
  readonly backgroundAssetKey?: string;
  readonly acquiredEvidenceIds?: readonly string[];
  readonly runState?: RunState;
  readonly flagDefinitions?: readonly FlagDefinition[];
}

export interface EncounterSession {
  readonly coordinator: EncounterCoordinator;
  readonly caseDefinition: CaseDefinition;
  readonly cardsDefinition: CardsDefinition;
  readonly balance: BalanceDefinition;
  readonly encounterId: string;
  readonly fallbackCatalog: FallbackCatalog;
  readonly speakerProfile: SpeakerProfile;
  applyBalance(balance: BalanceDefinition): void;
  usePartnerSkill(skillId?: string): PartnerCooldownView;
  currentModel(): InterrogationScreenModel;
  targetClaimIdForFacet(facet: Facet): string | undefined;
}

function required<T>(value: T | undefined, label: string): T {
  if (value === undefined) throw new Error(`${label} could not be loaded.`);
  return value;
}

function statementTemplate(
  claimId: string,
  fullText: string,
  start: number,
  end: number,
): FallbackResponseTemplate {
  return {
    full_text: fullText,
    tokens: [{
      token_id: `authored-${claimId}`,
      claim_ids: [claimId],
      text: fullText.slice(start, end),
      span_start: start,
      span_end: end,
    }],
  };
}

function createFallbackCatalog(definition: DialogueDefinition): FallbackCatalog {
  const authoredReactions = Object.fromEntries(
    Object.entries(definition.reactions).map(([reactionKey, lines]) => [
      reactionKey,
      lines.map((fullText) => ({ full_text: fullText, tokens: [] })),
    ]),
  );
  const genericLine = Object.values(definition.reactions)[0]?.[0] ??
    '판정 결과를 사건 기록에 반영했습니다.';
  const resolverReactionKeys = [
    ...RESOLUTION_CODES,
    'INCOMPATIBLE_TARGET',
    'TARGET_NOT_EXPOSED',
    'MISSING_TARGET',
    'MISSING_EVIDENCE',
    'MISSING_PROOF_RULE',
    'RESERVED_INTENT',
    'SILENCE',
  ];
  return {
    statements: Object.fromEntries(
      Object.entries(definition.statements).map(([claimId, entry]) => [
        claimId,
        entry.fallback.map((fullText) => {
          const span = entry.spans.find((candidate) => candidate.claim_id === claimId);
          return statementTemplate(
            claimId,
            fullText,
            Math.min(span?.start ?? 0, fullText.length - 1),
            Math.min(Math.max(span?.end ?? fullText.length, 1), fullText.length),
          );
        }),
      ]),
    ),
    reactions: {
      ...Object.fromEntries(resolverReactionKeys.map((reactionKey) => [
        reactionKey,
        [{ full_text: genericLine, tokens: [] }],
      ])),
      ...authoredReactions,
    },
  };
}

function entityDisplayName(definition: CaseDefinition, entityId: string): string {
  const entity = definition.entities.find((candidate) => candidate.entity_id === entityId);
  const authored = entity?.attributes.display_name;
  return typeof authored === 'string' ? authored : (entity?.display_name_key ?? entityId);
}

function entityPortraitAssetName(
  definition: CaseDefinition,
  entityId: string,
): string | undefined {
  const entity = definition.entities.find((candidate) => candidate.entity_id === entityId);
  const authored = entity?.attributes.portrait_asset_name ?? entity?.attributes.display_name;
  return typeof authored === 'string' && authored.trim().length > 0
    ? authored.trim().replaceAll(/\s+/gu, '_')
    : undefined;
}

/** Browser composition boundary: validated repositories in, headless coordinator out. */
export async function createEncounterSession(
  options: CreateEncounterSessionOptions = {},
): Promise<EncounterSession> {
  const caseDirectory = options.caseDirectory ?? 'tutorial';
  const caseRepository = options.caseRepository ?? new CaseRepository();
  const cardRepository = options.cardRepository ?? new CardRepository();
  const balanceRepository = options.balanceRepository ?? new BalanceRepository();
  const [caseDefinition, cardsDefinition, balance] = await Promise.all([
    caseRepository.load(caseDirectory),
    cardRepository.load(),
    balanceRepository.reload(),
  ]);
  const loadedCase = required(caseDefinition, `Case ${caseDirectory}`);
  const loadedCards = required(cardsDefinition, 'Card catalogue');
  const loadedBalance = required(balance, 'Balance catalogue');
  const encounterId = options.encounterId ?? loadedCase.encounters[0]?.encounter_id;
  if (encounterId === undefined) throw new Error(`Case ${caseDirectory} has no encounter.`);
  const encounter = loadedCase.encounters.find(
    (candidate) => candidate.encounter_id === encounterId,
  );
  if (encounter === undefined) throw new Error(`Unknown encounter ${encounterId}.`);
  const fallbackRepository = options.fallbackRepository ?? (
    options.caseRepository === undefined &&
    options.cardRepository === undefined &&
    options.balanceRepository === undefined
      ? new FallbackRepository()
      : undefined
  );
  const encounterDialogue = await fallbackRepository?.loadEncounter(
    caseDirectory,
    encounterId,
  );
  const dialogue = encounterDialogue ?? loadedCase.dialogue;

  const runState = options.runState;
  const resolvedInitialEffects = runState === undefined
    ? []
    : resolveFlagEffects(
        runState.flags,
        options.flagDefinitions ?? [],
        { encounter: encounterId },
      ).map((resolved) => resolved.apply);

  const deps: EncounterCoordinatorDeps = {
    caseDefinition: loadedCase,
    encounterId,
    cards: loadedCards.cards,
    balance: loadedBalance,
    rng: createRngState(options.runSeed ?? 2_026_080_3, 'DECK_SHUFFLE'),
    acquiredEvidenceIds: [
      ...(runState?.acquiredEvidenceIds ?? []),
      ...(options.acquiredEvidenceIds ?? []),
    ].filter((evidenceId, index, evidenceIds) =>
      evidenceIds.indexOf(evidenceId) === index,
    ),
    ...(runState === undefined
      ? {}
      : {
          initialDeckCardIds: [
            ...runState.deck.drawPile,
            ...runState.deck.hand,
            ...runState.deck.discardPile,
          ],
          initialResources: {
            stress: runState.stress,
            dp: runState.dp,
            trust: runState.trust,
          },
          initialEffects: resolvedInitialEffects,
        }),
  };
  const coordinator = EncounterCoordinator.begin(deps);
  const encounterClaimIds = new Set(
    encounter.rounds.flatMap((round) => round.statement_claims),
  );
  const target = loadedCase.entities.find(
    (entity) => entity.entity_id === encounter.target_entity,
  );
  const profile = dialogue.speaker_profiles[encounter.target_entity] ??
    loadedCase.dialogue.speaker_profiles[encounter.target_entity] ?? {
    race: typeof target?.attributes.archetype === 'string'
      ? target.attributes.archetype
      : 'UNKNOWN',
    personality: ['NEUTRAL'],
    speech: 'PLAIN',
    forbidden_expressions: [],
  };
  const fallbackCatalog = createFallbackCatalog(dialogue);
  const portraitName = entityPortraitAssetName(loadedCase, encounter.target_entity);
  let currentBalance = loadedBalance;

  const session: EncounterSession = {
    coordinator,
    caseDefinition: loadedCase,
    cardsDefinition: loadedCards,
    get balance(): BalanceDefinition {
      return currentBalance;
    },
    encounterId,
    fallbackCatalog,
    speakerProfile: profile,
    applyBalance(balance): void {
      coordinator.applyBalance(balance);
      currentBalance = balance;
    },
    usePartnerSkill(skillId): PartnerCooldownView {
      return coordinator.usePartnerSkill(skillId ?? options.partnerSkillId);
    },
    targetClaimIdForFacet(facet) {
      return loadedCase.claims.find(
        (claim) => encounterClaimIds.has(claim.claim_id) && claim.facet === facet,
      )?.claim_id;
    },
    currentModel() {
      const snapshot = coordinator.snapshot;
      const sourceDto = toPublicDTO({
        knowledge: coordinator.knowledge,
        resources: {
          composure: snapshot.resources.composure,
          coercion: snapshot.resources.coercion,
          commandPoints: snapshot.resources.commandPoints,
        },
        objectives: [
          ...snapshot.objectives.required,
          ...snapshot.objectives.optional,
        ].map((objective) => ({
          label: objective.objectiveId,
          completed: objective.completed,
        })),
      });
      const dto: PublicDTO = {
        ...sourceDto,
        statement: sourceDto.statement.filter((claim) => encounterClaimIds.has(claim.claimId)),
      };
      if (hasForbiddenPublicKey(dto)) {
        throw new Error('PublicDTO projection contains a forbidden private field.');
      }
      const limits = coordinator.resourceLimits;
      const sweetSpot = coordinator.sweetSpot;
      const stateConditions = encounter.objectives.state_conditions;
      const requiredComplete = snapshot.objectives.required.every(
        (objective) => objective.completed,
      );
      const inSweetSpot =
        snapshot.resources.composure >= sweetSpot.composureMin &&
        snapshot.resources.composure <= sweetSpot.composureMax &&
        (stateConditions.coercion_max === undefined ||
          snapshot.resources.coercion <= stateConditions.coercion_max);
      const cards = snapshot.deck.hand.flatMap((cardId) => {
        const definition = loadedCards.cards.find((card) => card.card_id === cardId);
        if (definition === undefined) return [];
        return [{
          cardId,
          title: definition.name_key ?? definition.card_id,
          description: definition.description_key,
          intent: definition.intent,
          cpCost: definition.cost.cp ?? 0,
          requiresEvidence: (definition.target.min_evidence ?? 0) > 0,
          attachments: {
            ...(definition.card_modifier?.stamp === undefined
              ? {}
              : { stampId: definition.card_modifier.stamp }),
            ...(definition.card_modifier?.postit === undefined &&
            definition.card_modifier?.clip !== true
              ? {}
              : {
                  postId: definition.card_modifier?.postit ?? 'CLIP',
                }),
            evidenceIds: [],
          },
        }];
      });
      const confessed =
        snapshot.outcome === 'BEST_RESOLUTION' ||
        snapshot.outcome === 'COERCED_CONFESSION';
      const suspectStatePart = deriveSuspectStatePart({
        composure: snapshot.resources.composure,
        composureMax: limits.composureMax,
        confessed,
      });
      const backgroundAssetKey =
        options.backgroundAssetKey ?? loadedCase.metadata.background_asset_key;
      const partnerSkillId =
        options.partnerSkillId ?? Object.keys(currentBalance.partner.cooldowns)[0];
      const partnerSkillDuration = partnerSkillId === undefined
        ? undefined
        : currentBalance.partner.cooldowns[partnerSkillId];
      return {
        dto,
        suspectName: entityDisplayName(loadedCase, encounter.target_entity),
        partnerName: options.partnerName ?? '김 인턴',
        turn: {
          current: snapshot.resources.turn,
          limit: loadedCase.metadata.estimated_turns,
        },
        stress: snapshot.resources.stress,
        composureMax: limits.composureMax,
        coercionMax: limits.coercionLimit,
        sweetSpotMin: sweetSpot.composureMin,
        sweetSpotMax: sweetSpot.composureMax,
        sweetSpotUnlocked: inSweetSpot,
        cards,
        evidenceCosts: Object.fromEntries(dto.evidence.map((item) => [item.evidenceId, 0])),
        ...(portraitName === undefined
          ? {}
          : {
              portraitBaseAssetKey: `portrait/${portraitName}/base`,
              portraitStatePartsAssetKeys: {
                base: `portrait/${portraitName}/base`,
                upset: `portrait/${portraitName}/upset`,
                lose: `portrait/${portraitName}/lose`,
              },
            }),
        ...(backgroundAssetKey === undefined ? {} : { backgroundAssetKey }),
        suspectStatePart,
        partnerBaseAssetKey: 'portrait/김_인턴/base',
        partnerUsedAssetKey: 'portrait/김_인턴/used',
        partnerCooldown: coordinator.partnerCooldown(partnerSkillId),
        partnerSkillAvailable:
          partnerSkillDuration !== undefined && partnerSkillDuration > 0,
        canSecureStatement:
          snapshot.machine.state === 'CHECK_OUTCOME' && requiredComplete && inSweetSpot,
      };
    },
  };
  return Object.freeze(session);
}
