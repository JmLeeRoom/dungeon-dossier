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
import { toPublicDTO, type PublicDTO } from '../dto';
import type { Facet, FlagDefinition } from '../engine/domain';
import {
  EncounterCoordinator,
  type EncounterCoordinatorDeps,
} from '../engine/encounter';
import { RESOLUTION_CODES } from '../engine/resolution';
import { createRngState } from '../engine/rng';
import { resolveFlagEffects, type RunState } from '../engine/run';
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
  currentModel(): InterrogationScreenModel;
  targetClaimIdForFacet(facet: Facet): string | undefined;
}

const PORTRAIT_NAME_BY_RACE: Readonly<Record<string, string>> = Object.freeze({
  SLIME: '물컹이',
  HARPY: '하피',
  MINOTAUR: '미노타우로스',
  GOBLIN: '고블린',
  ORC: '오크',
  DWARF: '드워프',
  CYCLOPS: '사이클롭스',
  SUCCUBUS: '서큐버스',
  FALLEN_HERO: '타락한_용사',
});

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
  const portraitName = PORTRAIT_NAME_BY_RACE[profile.race];

  const session: EncounterSession = {
    coordinator,
    caseDefinition: loadedCase,
    cardsDefinition: loadedCards,
    balance: loadedBalance,
    encounterId,
    fallbackCatalog,
    speakerProfile: profile,
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
      const stateConditions = encounter.objectives.state_conditions;
      const requiredComplete = snapshot.objectives.required.every(
        (objective) => objective.completed,
      );
      const inSweetSpot =
        snapshot.resources.composure >= stateConditions.composure_min &&
        snapshot.resources.composure <= stateConditions.composure_max &&
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
        }];
      });
      return {
        dto,
        suspectName: entityDisplayName(loadedCase, encounter.target_entity),
        partnerName: options.partnerName ?? '김 인턴',
        turn: {
          current: snapshot.resources.turn,
          limit: loadedCase.metadata.estimated_turns,
        },
        stress: snapshot.resources.stress,
        composureMax: encounter.resources.composure_max,
        coercionMax: encounter.resources.coercion_limit,
        sweetSpotUnlocked: inSweetSpot,
        cards,
        evidenceCosts: Object.fromEntries(dto.evidence.map((item) => [item.evidenceId, 0])),
        ...(portraitName === undefined
          ? {}
          : {
              portraitBaseAssetKey: `portrait/${portraitName}/base`,
              portraitPartsAssetKey: `portrait/${portraitName}/parts`,
            }),
        partnerAssetKey: 'portrait/김_인턴/base',
        canSecureStatement:
          snapshot.machine.state === 'CHECK_OUTCOME' && requiredComplete && inSweetSpot,
      };
    },
  };
  return Object.freeze(session);
}
