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
import type {
  Effect,
  EnhancementDefinition,
  Facet,
  FlagDefinition,
  RelicDefinition,
} from '../engine/domain';
import {
  EncounterCoordinator,
  type EncounterCoordinatorDeps,
  type EncounterIdentityDeps,
  type EncounterPresentationFrame,
  type EncounterTurnLoopMode,
} from '../engine/encounter';
import { RESOLUTION_CODES } from '../engine/resolution';
import { createRngState } from '../engine/rng';
import { resolveFlagEffects, type RunState } from '../engine/run';
import { deriveSuspectStatePart } from '../engine/suspectState';
import type { InterrogationScreenModel } from '../ui/screens/interrogation';
import { t } from './i18n';
import {
  CARD_ILLUSTRATION_ASSET_KEYS,
  CARD_LOCK_OVERLAY_ASSET_KEY,
  CARD_LOCKED_ILLUSTRATION_ASSET_KEY,
  CP_PIP_ASSET_KEYS,
  EVIDENCE_ASSET_KEYS,
  PARTNER_ASSET_SET,
  PARTNER_USED_ASSET_KEY,
  interrogationBackgroundAssetKey,
  suspectAssetSet,
} from './uiAssetBindings';

const CARD_ROLE_LABELS = {
  BASIC_JAB: '기본 잽',
  MENTAL_CONTROL: '멘탈 조절',
  FINISHER: '주력기',
  PHYSICAL_COERCION: '물리/강압',
} as const;

const CARD_WARNING_LABELS: Readonly<Record<string, string>> = {
  HOT_TEMPER_RISK: '주의: 다혈질·진실 공격 위험',
};

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
  readonly relicDefinitions?: readonly RelicDefinition[];
  readonly enhancementDefinitions?: readonly EnhancementDefinition[];
  /** Extra encounter-start effects, e.g. owned relics with ENCOUNTER_START activation. */
  readonly extraInitialEffects?: readonly Effect[];
  /** P0-3/P0-4 gate: 'V2_ATOMIC' turns on the atomic Submit loop. */
  readonly turnLoop?: EncounterTurnLoopMode;
  readonly identity?: EncounterIdentityDeps;
  readonly contentRevision?: string;
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
  currentModel(frame?: EncounterPresentationFrame): InterrogationScreenModel;
  modelForFrame(frame: EncounterPresentationFrame): InterrogationScreenModel;
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
  return typeof authored === 'string'
    ? authored
    : t(entity?.display_name_key, entityId);
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
  // NOTE: run-level evidence grade overrides (RunState.evidenceGradeById) are
  // NOT applied here yet. An earlier attempt rebuilt the case with a patched
  // evidence array, and the browser matrix caught it flipping
  // enc_ep001_succubus from BEST_RESOLUTION to PARTIAL_RESOLUTION even though
  // every overridden grade was already the authored value — so the regression
  // came from cloning the case object, not from the grade itself. Wiring this
  // needs an identity-safe path plus a browser regression, tracked as the
  // reopened half of ASSET/FLOW work in the audit backlog.
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
  const ownedRelics = (options.relicDefinitions ?? []).filter(
    (relic) =>
      runState?.acquiredRelicIds.includes(relic.relic_id) === true &&
      relic.conditions.every((condition) => condition.type === 'ALWAYS'),
  );
  const ownedEnhancements = (options.enhancementDefinitions ?? []).filter(
    (enhancement) =>
      runState?.acquiredEnhancementIds.includes(enhancement.enhancement_id) === true,
  );
  const ownedRelicInitialEffects = ownedRelics
    .filter((relic) =>
      relic.activation === 'ENCOUNTER_START' || relic.activation === 'PASSIVE',
    )
    .flatMap((relic) => relic.effects);
  const resolutionEffectSources = [
    ...ownedRelics
      .filter((relic) => relic.activation === 'ON_RESOLUTION')
      .map((relic) => ({
        sourceId: relic.relic_id,
        effects: relic.effects,
        ...(relic.uses_per_encounter === undefined
          ? {}
          : { usesPerEncounter: relic.uses_per_encounter }),
      })),
    ...ownedEnhancements.map((enhancement) => ({
      sourceId: enhancement.enhancement_id,
      effects: enhancement.effects,
      ...(enhancement.compatible_intents === undefined
        ? {}
        : { compatibleIntents: enhancement.compatible_intents }),
      ...(enhancement.compatible_card_ids === undefined
        ? {}
        : { compatibleCardIds: enhancement.compatible_card_ids }),
    })),
  ];

  const runSeed = options.runSeed ?? 2_026_080_3;
  const deps: EncounterCoordinatorDeps = {
    caseDefinition: loadedCase,
    encounterId,
    cards: loadedCards.cards,
    balance: loadedBalance,
    rng: createRngState(runSeed, 'DECK_SHUFFLE'),
    ...(options.turnLoop !== 'V2_ATOMIC'
      ? {}
      : {
          cardDrawRng: createRngState(runSeed, 'CARD_DRAW'),
          drawSlots: (loadedCards.initial_deck ?? loadedCards.cards.flatMap(
            (card) => Array.from(
              { length: card.starting_copies },
              () => card.card_id,
            ),
          )).filter(
            (blueprintId, index, blueprintIds) =>
              blueprintIds.indexOf(blueprintId) === index,
          ).slice(0, 5).map(
            (blueprintId, index) => ({
              slotId: `basic-${index + 1}`,
              blueprintId,
            }),
          ),
        }),
    resolutionEffectSources,
    ...(options.turnLoop === undefined ? {} : { turnLoop: options.turnLoop }),
    ...(options.identity === undefined ? {} : { identity: options.identity }),
    ...(options.contentRevision === undefined
      ? {}
      : { contentRevision: options.contentRevision }),
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
          initialEffects: [
            ...resolvedInitialEffects,
            ...ownedRelicInitialEffects,
            ...(options.extraInitialEffects ?? []),
          ],
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
  const suspectArt = suspectAssetSet(portraitName);
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
      const activeClaimId = coordinator.snapshot.claimIdByFacet?.[facet];
      if (activeClaimId !== undefined) return activeClaimId;
      return loadedCase.claims.find(
        (claim) => encounterClaimIds.has(claim.claim_id) && claim.facet === facet,
      )?.claim_id;
    },
    modelForFrame(frame) {
      return this.currentModel(frame);
    },
    currentModel(frame) {
      const snapshot = frame?.snapshot ?? coordinator.snapshot;
      const knowledge = frame?.knowledge ?? coordinator.knowledge;
      const sourceDto = toPublicDTO({
        knowledge,
        resources: {
          composure: snapshot.resources.composure,
          coercion: snapshot.resources.coercion,
          commandPoints: snapshot.resources.commandPoints,
        },
        objectives: [
          ...snapshot.objectives.required,
          ...snapshot.objectives.optional,
        ].map((objective) => ({
          label: t(`objective.${objective.objectiveId}`, objective.objectiveId),
          completed: objective.completed,
        })),
      });
      const activeEncounterClaimIds = snapshot.claimIdByFacet === undefined
        ? encounterClaimIds
        : new Set(Object.values(snapshot.claimIdByFacet));
      const dto: PublicDTO = {
        ...sourceDto,
        statement: sourceDto.statement.filter((claim) =>
          activeEncounterClaimIds.has(claim.claimId),
        ),
        evidence: sourceDto.evidence.map((item) => ({
          ...item,
          displayName: t(item.displayName, item.evidenceId),
        })),
      };
      if (hasForbiddenPublicKey(dto)) {
        throw new Error('PublicDTO projection contains a forbidden private field.');
      }
      const shieldDurabilityByClaimId = snapshot.shieldDurabilityByClaimId ?? {};
      const claimExposureByFacet = Object.fromEntries(
        dto.statement
          .filter((claim) => claim.presentation !== 'HIDDEN')
          .map((claim) => {
            const hasShieldState = Object.prototype.hasOwnProperty.call(
              shieldDurabilityByClaimId,
              claim.claimId,
            );
            return [
              claim.facet,
              claim.resistance > 0
                ? 'SHIELDED'
                : hasShieldState
                  ? 'BROKEN'
                  : 'GAP',
            ] as const;
          }),
      );
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
      const v2TurnLoop = coordinator.turnLoopMode === 'V2_ATOMIC';
      // v2 hands are addressed by physical copy; the legacy loop keeps its
      // definition-id hand until the interrogationV2TurnLoop gate retires it.
      const handEntries: readonly {
        readonly cardId: string;
        readonly instanceId: string | undefined;
      }[] = v2TurnLoop
        ? (snapshot.handInstances ?? []).map((instance) => ({
            cardId: instance.blueprintId,
            instanceId: instance.instanceId,
          }))
        : snapshot.deck.hand.map((cardId) => ({
            cardId,
            instanceId: undefined,
          }));
      const cards = handEntries.flatMap(({ cardId, instanceId }) => {
        const definition = loadedCards.cards.find((card) => card.card_id === cardId);
        if (definition === undefined) return [];
        // A lock is already engine state: the succubus modifier writes
        // `lockedUntilTurn`, so the view only has to project it.
        const lockedUntilTurn = snapshot.cards[cardId]?.lockedUntilTurn ?? -1;
        const lockTurnsRemaining = Math.max(0, lockedUntilTurn - snapshot.resources.turn + 1);
        const locked = lockTurnsRemaining > 0;
        const cpCost = definition.cost.cp ?? 0;
        const affordable = cpCost <= snapshot.resources.commandPoints;
        const artAssetKey = locked
          ? CARD_LOCKED_ILLUSTRATION_ASSET_KEY
          : CARD_ILLUSTRATION_ASSET_KEYS[cardId];
        return [{
          cardId,
          ...(instanceId === undefined ? {} : { instanceId }),
          title: t(definition.name_key ?? definition.title_key, definition.card_id),
          description: t(definition.description_key, ''),
          intent: definition.intent,
          cpCost,
          requiresEvidence: (definition.target.min_evidence ?? 0) > 0,
          affordable,
          minEvidence: definition.target.min_evidence ?? 0,
          ...(definition.target.max_evidence === undefined
            ? {}
            : { maxEvidence: definition.target.max_evidence }),
          costIconAssetKey: affordable ? CP_PIP_ASSET_KEYS.active : CP_PIP_ASSET_KEYS.deactive,
          ...(definition.combat_profile === undefined
            ? {}
            : {
                combat: {
                  roleLabel: CARD_ROLE_LABELS[definition.combat_profile.role],
                  targetRule: definition.combat_profile.target_rule,
                  evidenceMode: definition.combat_profile.evidence_mode,
                },
              }),
          ...((definition.tags ?? [])
            .map((tag) => CARD_WARNING_LABELS[tag])
            .filter((label): label is string => label !== undefined).length === 0
            ? {}
            : {
                warningLabels: (definition.tags ?? [])
                  .map((tag) => CARD_WARNING_LABELS[tag])
                  .filter((label): label is string => label !== undefined),
              }),
          ...(definition.target.facets === undefined
            ? {}
            : { allowedFacets: [...definition.target.facets] }),
          ...(artAssetKey === undefined ? {} : { artAssetKey }),
          ...(locked
            ? {
                locked,
                lockTurnsRemaining,
                debuffAssetKey: CARD_LOCK_OVERLAY_ASSET_KEY,
              }
            : {}),
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
      const backgroundAssetKey = interrogationBackgroundAssetKey(
        options.backgroundAssetKey ?? loadedCase.metadata.background_asset_key,
      );
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
        commandPointsMax: limits.commandPointMax,
        hpMax: limits.stressMax,
        coercionMax: limits.coercionLimit,
        sweetSpotMin: sweetSpot.composureMin,
        sweetSpotMax: sweetSpot.composureMax,
        sweetSpotUnlocked: inSweetSpot,
        cards,
        claimExposureByFacet,
        evidenceCosts: Object.fromEntries(dto.evidence.map((item) => [item.evidenceId, 0])),
        ...(suspectArt === undefined ? {} : { suspectAssetSet: suspectArt }),
        ...(backgroundAssetKey === undefined ? {} : { backgroundAssetKey }),
        evidenceAssetKeys: Object.fromEntries(
          dto.evidence
            .map((item) => [item.evidenceId, EVIDENCE_ASSET_KEYS[item.evidenceId]] as const)
            .filter((pair): pair is readonly [string, string] => pair[1] !== undefined),
        ),
        suspectStatePart,
        partnerBaseAssetKey: PARTNER_ASSET_SET.base,
        partnerUsedAssetKey: PARTNER_USED_ASSET_KEY,
        partnerCooldown: coordinator.partnerCooldown(partnerSkillId),
        partnerSkillAvailable:
          partnerSkillDuration !== undefined && partnerSkillDuration > 0,
        // v2: the engine's canonical pending decision is projected verbatim —
        // the app never recomputes eligibility (design §3.5.6 P0-3C).
        canSecureStatement: v2TurnLoop
          ? (snapshot.pendingSecureDecision ?? null) !== null
          : snapshot.machine.state === 'CHECK_OUTCOME' &&
            requiredComplete &&
            inSweetSpot,
        ...((snapshot.pendingSecureDecision ?? null) === null
          ? {}
          : {
              pendingDecision: {
                decisionId: snapshot.pendingSecureDecision!.decisionId,
                title: '결정적 진술을 확보할 수 있습니다',
                secureLabel: '진술 확보하고 종료',
                continueLabel:
                  snapshot.pendingSecureDecision!.onDecline ===
                  'PARTIAL_RESOLUTION'
                    ? '확보 포기 · 부분 해결'
                    : '심문 계속',
              },
            }),
      };
    },
  };
  return Object.freeze(session);
}
