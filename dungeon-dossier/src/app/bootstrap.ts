import {
  createGameApplication,
  createUiAssetPort,
  preloadRuntimeAssets,
  runtimeAssetRegistry,
  type ManagedUiLayer,
  type MountedGameApplication,
} from '../ui/core';
import type { CutsceneSelection } from '../ui/screens/cutscene';
import {
  createEndingDirection,
  createInterrogationScreen,
  createJudgmentDirection,
  directionForOutcome,
  directionForResolution,
  interrogationCardLayerAssetKey,
  type InterrogationCallbacks,
  type InterrogationSelection,
  type InterrogationScreenController,
  type InterrogationScreenModel,
  type TimedDirectionOverlay,
} from '../ui/screens/interrogation';
import { createEndingScreen } from '../ui/screens/ending';
import {
  createEventScreen,
  eventSceneAssetKeys,
  type EventScreenCallbacks,
} from '../ui/screens/event';
import { createRewardScreen } from '../ui/screens/reward';
import { BOARD_KNOWN_EVENT_ASSET_KEY, createRunStripScreen } from '../ui/screens/strip';
import {
  BalanceRepository,
  CardRepository,
  CaseRepository,
  FallbackRepository,
  JudgmentUiMapRepository,
  RunCatalogRepository,
  RunStripRepository,
  StringsRepository,
  runtimeContentUrl,
  type BalanceDefinition,
  type CaseDefinition,
  type JudgmentUiMapDefinition,
  type RewardDefinition,
} from '../content-io';
import { createErrorBanner, RUN_FLOW_ERROR_MESSAGE } from '../ui/screens/error';
import { createDeadSceneScreen } from '../ui/screens/ending';
import {
  DEAD_SCENE_RETRY_ACTION,
  deadSceneAssetKeys,
  isFailureReason,
  toDeadSceneModel,
  type FailureReason,
} from './deadScene';
import { AudioPlayer, RUNTIME_SOUND_DEFINITIONS } from '../audio';
import {
  toRenderableClaims,
  type ResolutionCode,
  type SuspectStatePart,
} from '../dto';
import type { ActionIntent, CutsceneDefinition } from '../engine/domain';
import type { EncounterOutcome, OutcomeEvaluation } from '../engine/encounter';
import {
  createNodeStrip,
  runEpisodeIds,
  currentRunNode,
  runResourceBoundsFromBalance,
  DEFAULT_RETRY_LIMIT,
  type CaseGrade,
  type NodeDefinition,
  type RunState,
} from '../engine/run';
import {
  collectAutoplaySceneStrings,
  isAutoplayRequested,
  parseAutoplaySeedParameter,
  scaledDirectionDelayMs,
  type AutoplayOptions,
  type AutoplayPort,
  type AutoplayScene,
} from './autoplayPort';
import { createRunSaveRepository } from './autoplayStorage';
import { installStrings } from './i18n';
import {
  collectCutsceneOutcome,
  cutscenePresentationAssetKeys,
  cutsceneForTiming,
  toCutsceneBeatViews,
  type CutsceneChoiceOutcome,
} from './cutscenePlayback';
import { createCutsceneOverlay } from '../ui/screens/cutscene';
import { createEncounterSession, type EncounterSession } from './createEncounterSession';
import {
  cueOutcome,
  cueResolution,
  cueScene,
  outcomeCodeForEvaluation,
  type AudioScene,
} from './gameAudio';
import {
  createPhase4DialogueService,
  toComposureBand,
  type Phase4DialogueService,
} from './createPhase4DialogueService';
import {
  createRunSession,
  type FinishEventInput,
  type RunSession,
} from './createRunSession';
import { buildEvidencePreviewFeedback, buildJudgmentFeedback } from './judgmentFeedback';
import { detectSuspectTransition } from './suspectTransition';
import { createFlowErrorBoundary } from './flowErrorBoundary';
import {
  toEndingScreenModel,
  toEventSceneModel,
  type EventOwnedCardView,
  toRewardScreenModel,
  toRunStripScreenModel,
} from './gameFlowPresentation';
import {
  createInitialGameRunState,
  DEFAULT_RUN_SEED,
  encounterGradeMetrics,
  encounterRunProjection,
  ENDING_PRESENTATIONS,
  endingIdForRun,
  rewardRarityForOutcome,
} from './gameRunState';
import {
  assertRestoredRunSaveSemantics,
  restoreRunState,
} from './save';
import {
  BOARD_ASSET_KEYS,
  CARD_ATTACHMENT_ASSET_KEYS,
  CARD_BASE_ASSET_KEY,
  CARD_ILLUSTRATION_ASSET_KEYS,
  CARD_LOCK_OVERLAY_ASSET_KEY,
  CARD_LOCKED_ILLUSTRATION_ASSET_KEY,
  DETECTIVE_PHOTO_ASSET_KEY,
  HUD_ICON_ASSET_KEYS,
  INTERROGATION_BACKGROUND_ASSET_KEY,
  INTERROGATION_DESK_ASSET_KEY,
  PARTNER_PHOTO_ASSET_KEY,
  RESULT_ASSET_KEYS,
} from './uiAssetBindings';
import { TAG_CHIP_ASSET_KEYS } from '../ui/widgets';
import type { RunStripScreenModel } from '../ui/screens/strip';

function stableDialogueSeed(parts: readonly string[]): number {
  let seed = 2_166_136_261;
  for (const character of parts.join('|')) {
    seed ^= character.codePointAt(0) ?? 0;
    seed = Math.imul(seed, 16_777_619) >>> 0;
  }
  return seed;
}

async function loadPreverifiedCache(url: string): Promise<unknown> {
  try {
    const response = await fetch(url);
    if (!response.ok) return undefined;
    return await response.json();
  } catch {
    return undefined;
  }
}

function required<T>(value: T | undefined, label: string): T {
  if (value === undefined) throw new Error(`${label} could not be loaded.`);
  return value;
}

function encounterSeed(state: RunState): number {
  return (state.runSeed + Math.imul(state.nodeIndex + 1, 0x9e37_79b9)) >>> 0;
}

function uniqueAssetKeys(keys: readonly (string | undefined)[]): readonly string[] {
  return [...new Set(keys.filter((key): key is string => key !== undefined))];
}

/** Only the visible three-slot board is eligible for preload. */
function runStripPresentationAssetKeys(model: RunStripScreenModel): readonly string[] {
  return uniqueAssetKeys([
    BOARD_ASSET_KEYS.background,
    BOARD_ASSET_KEYS.pin,
    DETECTIVE_PHOTO_ASSET_KEY,
    PARTNER_PHOTO_ASSET_KEY,
    ...(model.nodes.some((node) => node.visibility === 'VEILED')
      ? [BOARD_ASSET_KEYS.veiledMarker]
      : []),
    // Only when a revealed stage will actually draw the note.
    ...(model.nodes.some((node) => node.visibility === 'KNOWN' && node.kind === 'EVENT')
      ? [BOARD_KNOWN_EVENT_ASSET_KEY]
      : []),
    ...model.nodes.flatMap((node) =>
      node.visibility === 'KNOWN' ? [node.artAssetKey] : [],
    ),
  ]);
}

/** The exact images the first interrogation mount can ask its widgets for. */
function interrogationPresentationAssetKeys(
  model: InterrogationScreenModel,
  availableCards: readonly { readonly card_id: string; readonly intent: string }[] = [],
): readonly string[] {
  const cards = model.cards.slice(0, 5);
  const evidenceAssetKeys = model.evidenceAssetKeys ?? {};
  return uniqueAssetKeys([
    model.backgroundAssetKey ?? INTERROGATION_BACKGROUND_ASSET_KEY,
    INTERROGATION_DESK_ASSET_KEY,
    ...Object.values(HUD_ICON_ASSET_KEYS),
    ...Object.values(TAG_CHIP_ASSET_KEYS),
    CARD_BASE_ASSET_KEY,
    ...Object.values(CARD_ILLUSTRATION_ASSET_KEYS),
    ...Object.values(CARD_ATTACHMENT_ASSET_KEYS),
    CARD_LOCKED_ILLUSTRATION_ASSET_KEY,
    CARD_LOCK_OVERLAY_ASSET_KEY,
    model.partnerBaseAssetKey,
    model.partnerUsedAssetKey,
    model.suspectAssetSet?.base,
    model.suspectAssetSet?.upset,
    model.suspectAssetSet?.lose,
    ...Object.values(evidenceAssetKeys),
    ...availableCards.map((definition) =>
      interrogationCardLayerAssetKey(
        {
          cardId: definition.card_id,
          title: '',
          description: '',
          intent: definition.intent,
          cpCost: 0,
          requiresEvidence: false,
          ...(CARD_ILLUSTRATION_ASSET_KEYS[definition.card_id] === undefined
            ? {}
            : { artAssetKey: CARD_ILLUSTRATION_ASSET_KEYS[definition.card_id] }),
        },
        'illust',
        undefined,
        evidenceAssetKeys,
      ),
    ),
    ...cards.flatMap((card) => [
      interrogationCardLayerAssetKey(card, 'illust', undefined, evidenceAssetKeys),
      interrogationCardLayerAssetKey(
        card,
        'stamp',
        card.attachments?.stampId,
        evidenceAssetKeys,
      ),
      interrogationCardLayerAssetKey(
        card,
        'post',
        card.attachments?.postId,
        evidenceAssetKeys,
      ),
      ...(card.locked === true
        ? [card.debuffAssetKey ?? CARD_LOCK_OVERLAY_ASSET_KEY]
        : []),
    ]),
  ]);
}

export async function bootstrap(mount: HTMLElement): Promise<MountedGameApplication> {
  mount.dataset.assetCount = runtimeAssetRegistry.size.toString();
  delete mount.dataset.flowError;
  try {
    await document.fonts.load('11px Galmuri11');
  } catch (error) {
    console.warn('Galmuri11 could not be preloaded; continuing with the browser fallback.', error);
  }
  const mounted = await createGameApplication(mount);
  const audio = new AudioPlayer();
  audio.registerAll(RUNTIME_SOUND_DEFINITIONS);
  // Boot-critical bundles are awaited; event and result art is fetched behind
  // the first frame and single-flighted with any later explicit preload.
  await preloadRuntimeAssets();
  const assets = createUiAssetPort();

  const balanceRepository = new BalanceRepository();
  const caseRepository = new CaseRepository();
  const cardRepository = new CardRepository();
  const fallbackRepository = new FallbackRepository();
  const runCatalogRepository = new RunCatalogRepository();
  const runStripRepository = new RunStripRepository();
  const stringsRepository = new StringsRepository();
  const judgmentUiMapRepository = new JudgmentUiMapRepository();
  const [
    balanceValue,
    cardsValue,
    runCatalogValue,
    runStripValue,
    stringsValue,
    judgmentUiMapValue,
  ] = await Promise.all([
      balanceRepository.reload(),
      cardRepository.load(),
      runCatalogRepository.load(),
      runStripRepository.load(),
      stringsRepository.load(),
      judgmentUiMapRepository.load(),
    ]);
  const strings = required(stringsValue, 'Korean string table');
  installStrings(strings.strings);
  required(balanceValue, 'Balance catalogue');
  const cards = required(cardsValue, 'Card catalogue');
  const runCatalog = required(runCatalogValue, 'Run catalogue');
  const runStripDefinition = required(runStripValue, 'Run strip');
  // Presentation-only: a missing map degrades the banner to its tone defaults
  // instead of blocking boot.
  const judgmentUiMap: JudgmentUiMapDefinition | undefined = judgmentUiMapValue;
  // Resolved after the seed is known so SEEDED_ONE slots vary per run; the
  // canonical route (every slot's first candidate) is the seedless fallback.
  const canonicalStrip = createNodeStrip(runStripDefinition);
  const caseDirectories = canonicalStrip
    .map((node) => node.caseDirectory)
    .filter((directory, index, directories) => directories.indexOf(directory) === index);
  const loadedCases = await Promise.all(
    caseDirectories.map(async (directory) => [
      directory,
      required(await caseRepository.load(directory), `Case ${directory}`),
    ] as const),
  );
  const casesByDirectory: Readonly<Record<string, CaseDefinition>> =
    Object.fromEntries(loadedCases);
  const caseIdsByDirectory = Object.fromEntries(loadedCases.map(([directory, definition]) => [
    directory,
    definition.case_id,
  ]));
  const contentVersionsByDirectory = Object.fromEntries(
    loadedCases.map(([directory, definition]) => [
      directory,
      definition.metadata.content_version ?? definition.schema_version,
    ]),
  );
  const cachedCaseRepository = {
    async load(caseDirectory: string): Promise<CaseDefinition | undefined> {
      return casesByDirectory[caseDirectory];
    },
  };
  const cachedCardRepository = {
    async load() {
      return cards;
    },
  };
  const cachedBalanceRepository = {
    async reload() {
      return balanceRepository.current();
    },
  };

  const urlParams = new URLSearchParams(window.location.search);
  const autoplayParameter = urlParams.get('autoplay');
  const autoplayRequested = isAutoplayRequested(
    autoplayParameter,
    import.meta.env.DEV,
  );
  const devSeedParam = import.meta.env.DEV ? urlParams.get('seed') : null;
  const runSeedOverride = parseAutoplaySeedParameter(devSeedParam);

  // Deterministic autoplay discards only the run save. Workbench transforms,
  // locks, and other same-origin preferences must survive in localStorage.
  const saveRepository = createRunSaveRepository(
    window.localStorage,
    autoplayRequested,
  );
  // A resumed run must walk the exact route it was saved on, so the saved seed
  // wins over the URL seed whenever a save exists.
  const savedRun = saveRepository.load();
  const routeSeed = savedRun?.run_seed ?? runSeedOverride ?? DEFAULT_RUN_SEED;
  const strip = createNodeStrip(runStripDefinition, { seed: routeSeed });
  const episodeIds = runEpisodeIds(strip);

  const freshState = (): RunState => createInitialGameRunState(
    cards,
    balanceRepository.current(),
    runCatalog.flags,
    runSeedOverride,
    episodeIds,
  );
  let initialState: RunState;
  try {
    const saved = savedRun;
    if (saved === undefined) {
      initialState = freshState();
    } else {
      initialState = restoreRunState(
        saved,
        runResourceBoundsFromBalance(balanceRepository.current()),
        strip,
      );
      assertRestoredRunSaveSemantics(saved, initialState, {
        strip,
        cardIds: cards.cards.map((card) => card.card_id),
        rewardIds: runCatalog.rewards.rewards.map((reward) => reward.reward_id),
        relicIds: runCatalog.relics.relics.map((relic) => relic.relic_id),
        enhancementIds: runCatalog.enhancements.enhancements.map(
          (enhancement) => enhancement.enhancement_id,
        ),
        evidenceIds: loadedCases.flatMap(([, definition]) =>
          definition.evidence.map((evidence) => evidence.evidence_id),
        ),
        flagIds: runCatalog.flags.flags.map((flag) => flag.flag_id),
        caseIdsByDirectory,
        contentVersionsByDirectory,
      });
    }
  } catch (error) {
    console.warn('Saved run could not be restored; starting a fresh run.', error);
    saveRepository.clear();
    initialState = freshState();
  }

  const newRunSession = (state: RunState): RunSession => createRunSession({
    initialState: state,
    strip,
    flags: runCatalog.flags.flags,
    rewards: runCatalog.rewards,
    grades: runCatalog.grades,
    saveRepository,
    caseIdsByDirectory,
    contentVersionsByDirectory,
  });
  let runSession = newRunSession(initialState);
  let encounterSession: EncounterSession | undefined;
  let dialogueService: Phase4DialogueService | undefined;
  let interrogation: InterrogationScreenController | undefined;
  let openingNode = false;
  let destroyed = false;
  let audioActivated = false;
  let outcomeTransitionPending = false;
  let outcomeBgmMuted = false;
  let lastFailureReason: FailureReason | undefined;
  // The interrogation screen is rebuilt from scratch on every submission, so no
  // widget survives long enough to notice a state change. Bootstrap is the only
  // layer that sees both sides of a re-mount.
  let lastSuspectStatePart: SuspectStatePart | undefined;
  let lastSuspectEncounterId: string | undefined;
  let recordDevJudgment: ((input: unknown, result: unknown) => void) | undefined;
  let destroyDevConsole = (): void => undefined;
  const resourceOverrides: Partial<Record<
    'composure' | 'coercion' | 'commandPoints' | 'stress',
    number
  >> = {};
  const devState = {
    nodeId: currentRunNode(strip, runSession.snapshot.nodeIndex)?.ref ?? 'run-complete',
    aiEnabled: false,
    qteAutoSuccess: false,
    flags: Object.fromEntries(
      Array.from({ length: 13 }, (_, index) => {
        const flagId = `F-${String(index + 1).padStart(2, '0')}`;
        return [flagId, runSession.snapshot.flags[flagId] === true];
      }),
    ) as Record<string, boolean>,
  };
  const availableNodes = Object.values(casesByDirectory).flatMap((definition) =>
    definition.encounters.flatMap((encounter) =>
      encounter.flow_nodes.map((node) => node.node_id),
    ),
  );

  const sceneListeners = new Set<() => void>();
  let autoplayScene: AutoplayScene | undefined;
  let directionDepth = 0;
  let directionTimeScale = 1;
  const notifySceneChange = (): void => {
    for (const listener of [...sceneListeners]) listener();
  };
  const setAutoplayScene = (scene: AutoplayScene | undefined): void => {
    autoplayScene = scene;
    notifySceneChange();
  };
  // A stable instance so the driver's identity-based stall watchdog can tell
  // "same direction still running" apart from a genuinely new scene.
  const DIRECTION_SCENE: AutoplayScene = { kind: 'DIRECTION' };
  const currentAutoplayScene = (): AutoplayScene | undefined =>
    directionDepth > 0 ? DIRECTION_SCENE : autoplayScene;

  const activateAudio = (scene: AudioScene): void => {
    if (audioActivated) return;
    audioActivated = true;
    cueScene(audio, scene);
  };

  const setScene = (scene: ManagedUiLayer, audioScene: AudioScene): void => {
    mounted.scenes.setScene(scene);
    if (!audioActivated) return;
    audio.play('crt_switch');
    cueScene(audio, audioScene);
  };

  const showTimedDirection = (
    overlay: TimedDirectionOverlay,
    onComplete?: () => void,
  ): void => {
    overlay.view.eventMode = 'static';
    let finished = false;
    let completionRan = false;
    let directionCounted = false;
    let disposeOverlay: (() => void) | undefined;
    let completionTimer: number | undefined;
    let update = (): void => undefined;
    const endDirection = (): void => {
      if (!directionCounted) return;
      directionCounted = false;
      directionDepth = Math.max(0, directionDepth - 1);
      notifySceneChange();
    };
    const runCompletion = (): void => {
      if (completionRan) return;
      completionRan = true;
      onComplete?.();
    };
    const stopTicker = (): boolean => {
      if (finished) return false;
      finished = true;
      mounted.app.ticker.remove(update);
      if (completionTimer !== undefined) {
        window.clearTimeout(completionTimer);
        completionTimer = undefined;
      }
      return true;
    };
    const completePlayback = (): void => {
      if (!stopTicker()) return;
      disposeOverlay?.();
      endDirection();
      runCompletion();
    };
    update = (): void => {
      overlay.update(mounted.app.ticker.deltaMS * directionTimeScale);
      if (overlay.complete) completePlayback();
    };
    const layer: ManagedUiLayer = {
      view: overlay.view,
      onEnter: (): void => overlay.onEnter?.(),
      onExit: (): void => overlay.onExit?.(),
      onDestroy: (): void => {
        const interrupted = stopTicker();
        overlay.onDestroy?.();
        endDirection();
        if (interrupted && onComplete !== undefined && !destroyed) {
          queueMicrotask(runCompletion);
        }
      },
    };
    mounted.app.ticker.add(update);
    try {
      disposeOverlay = mounted.scenes.showOverlay(layer);
    } catch (error) {
      stopTicker();
      throw error;
    }
    directionCounted = true;
    directionDepth += 1;
    notifySceneChange();
    completionTimer = window.setTimeout(() => {
      overlay.update(Math.max(0, overlay.durationMs - overlay.elapsedMs));
      completePlayback();
    }, scaledDirectionDelayMs(
      overlay.durationMs,
      overlay.elapsedMs,
      directionTimeScale,
    ));
  };

  const syncDevFlags = (): void => {
    for (const flagId of Object.keys(devState.flags)) {
      devState.flags[flagId] = runSession.snapshot.flags[flagId] === true;
    }
  };

  const flowErrorBoundary = createFlowErrorBoundary({
    userMessage: RUN_FLOW_ERROR_MESSAGE,
    publishTechnicalError(message): void {
      mount.dataset.flowError = message;
    },
    clearTechnicalError(): void {
      delete mount.dataset.flowError;
    },
    reportError(error): void {
      console.error('Game run flow failed.', error);
    },
    reportBannerError(error): void {
      console.error('Flow-error banner could not be shown.', error);
    },
    returnToSafeState(): void {
      outcomeTransitionPending = false;
      openingNode = false;
      if (outcomeBgmMuted) {
        audio.unmute();
        outcomeBgmMuted = false;
      }
      // The run may already hold an unclaimed reward or a terminal result;
      // jumping straight to the strip would strand or corrupt that state.
      if (runSession.snapshot.pendingRewardIds.length > 0) {
        mountPendingReward();
        return;
      }
      routeAfterBoundary();
    },
    showBanner(message, callbacks): () => void {
      const banner = createErrorBanner({ message }, {
        onRetry: callbacks.onRetry,
        onReturnToStrip: callbacks.onReturnToSafeState,
      });
      return mounted.scenes.showOverlay({ view: banner });
    },
  });
  const handleFlowError = flowErrorBoundary.handle;

  const activeModel = (): InterrogationScreenModel => {
    if (encounterSession === undefined) throw new Error('No encounter is active.');
    const model = encounterSession.currentModel();
    return {
      ...model,
      dto: {
        ...model.dto,
        resources: {
          composure: resourceOverrides.composure ?? model.dto.resources.composure,
          coercion: resourceOverrides.coercion ?? model.dto.resources.coercion,
          commandPoints:
            resourceOverrides.commandPoints ?? model.dto.resources.commandPoints,
        },
      },
      stress: resourceOverrides.stress ?? model.stress,
    };
  };

  const caseForNode = (node: NodeDefinition): CaseDefinition => {
    const definition = casesByDirectory[node.caseDirectory];
    if (definition === undefined) throw new Error(`Missing case ${node.caseDirectory}.`);
    return definition;
  };

  const mountStrip = async (): Promise<void> => {
    encounterSession = undefined;
    dialogueService = undefined;
    interrogation = undefined;
    const continueRun = (): void => {
      activateAudio('AMBIENT');
      void openCurrentNode().catch((error: unknown) => {
        handleFlowError(error, continueRun);
      });
    };
    const model = toRunStripScreenModel(runStripDefinition, runSession.snapshot, { strip });
    await assets.preloadKeys(runStripPresentationAssetKeys(model));
    if (destroyed) return;
    const view = createRunStripScreen(model, { assets, onContinue: continueRun });
    const node = currentRunNode(strip, runSession.snapshot.nodeIndex);
    if (node === null) {
      throw new Error('Cannot mount the run strip after the terminal node.');
    }
    setScene({ view }, 'AMBIENT');
    setAutoplayScene({
      kind: 'STRIP',
      nodeIndex: runSession.snapshot.nodeIndex,
      nodeId: node.nodeId,
      nodeKind: node.kind,
      nodeRef: node.ref,
      displayStrings: collectAutoplaySceneStrings(model),
      continue: continueRun,
    });
  };

  const mountEnding = async (): Promise<void> => {
    encounterSession = undefined;
    dialogueService = undefined;
    interrogation = undefined;
    const endingId = endingIdForRun(runSession.snapshot);
    const model = toEndingScreenModel(endingId, ENDING_PRESENTATIONS);
    await assets.preloadKeys(
      model.illustrationAssetKey === undefined ? [] : [model.illustrationAssetKey],
    );
    if (destroyed) return;
    const restartRun = (): void => {
      try {
        activateAudio('AMBIENT');
        saveRepository.clear();
        runSession = newRunSession(freshState());
        syncDevFlags();
        devState.nodeId = strip[0]?.ref ?? 'run-complete';
        void mountStrip().catch((error: unknown) => {
          handleFlowError(error, restartRun);
        });
      } catch (error) {
        handleFlowError(error, restartRun);
      }
    };
    const view = createEndingScreen(model, assets, restartRun);
    setScene({ view }, 'ENDING');
    setAutoplayScene({
      kind: 'ENDING',
      endingId,
      displayStrings: collectAutoplaySceneStrings(model),
      restart: restartRun,
    });
  };

  const routeAfterBoundary = (): void => {
    syncDevFlags();
    if (runSession.snapshot.terminal || runSession.snapshot.nodeIndex >= strip.length) {
      void mountEnding().catch((error: unknown) => {
        handleFlowError(error, routeAfterBoundary);
      });
      return;
    }
    void mountStrip().catch((error: unknown) => {
      handleFlowError(error, routeAfterBoundary);
    });
  };

  const mountReward = (
    grade: CaseGrade,
    choices: readonly RewardDefinition[],
  ): void => {
    encounterSession = undefined;
    dialogueService = undefined;
    interrogation = undefined;
    let selected = false;
    const selectReward = (rewardId: string): void => {
      if (selected) return;
      activateAudio('AMBIENT');
      selected = true;
      try {
        runSession.claimReward(rewardId);
      } catch (error) {
        selected = false;
        handleFlowError(error, () => selectReward(rewardId));
        return;
      }
      try {
        routeAfterBoundary();
      } catch (error) {
        handleFlowError(error, routeAfterBoundary);
      }
    };
    const model = toRewardScreenModel(grade, choices);
    const view = createRewardScreen(model, selectReward);
    setScene({ view }, 'AMBIENT');
    setAutoplayScene({
      kind: 'REWARD',
      grade,
      rewardIds: choices.map((choice) => choice.reward_id),
      displayStrings: collectAutoplaySceneStrings(model),
      select: selectReward,
    });
  };

  const mountPendingReward = (): void => {
    const pending = new Set(runSession.snapshot.pendingRewardIds);
    const choices = runCatalog.rewards.rewards.filter((reward) =>
      pending.has(reward.reward_id),
    );
    if (choices.length !== pending.size) {
      throw new Error('Saved reward choices no longer match the reward catalogue.');
    }
    const grade = runSession.snapshot.gradeHistory.at(-1)?.grade;
    if (grade === undefined) throw new Error('Pending rewards have no recorded grade.');
    mountReward(grade, choices);
  };

  const finishEvent = (
    event: CaseDefinition['events_noncombat'][number],
    input: Omit<FinishEventInput, 'eventDefinition'>,
  ) => runSession.finishEvent({ eventDefinition: event, ...input });

  /** Per-visit progress the run layer only receives once the node completes. */
  interface EventProgress {
    readonly discoveredSpotIds: readonly string[];
    readonly canvassedTopicIds: readonly string[];
    readonly collectedTargetIds: readonly string[];
    readonly selectedOptionId?: string;
    readonly selectedCardId?: string;
    /** Branch consequences staged by an opening cutscene, committed with the node. */
    readonly cutsceneOutcome?: CutsceneChoiceOutcome;
  }

  const emptyEventProgress: EventProgress = {
    discoveredSpotIds: [],
    canvassedTopicIds: [],
    collectedTargetIds: [],
  };

  const cardIntentsById: Readonly<Record<string, ActionIntent>> = Object.fromEntries(
    cards.cards.map((card) => [card.card_id, card.intent]),
  );
  const cardNameKeysById: Readonly<Record<string, string | undefined>> = Object.fromEntries(
    cards.cards.map((card) => [card.card_id, card.name_key]),
  );

  const ownedCardViews = (): readonly EventOwnedCardView[] => {
    const deck = runSession.snapshot.deck;
    const owned = [
      ...deck.drawPile,
      ...deck.hand,
      ...deck.discardPile,
      ...deck.exhaustPile,
    ].filter((cardId, index, ids) => ids.indexOf(cardId) === index);
    return owned.flatMap((cardId) => {
      const intent = cardIntentsById[cardId];
      const nameKey = cardNameKeysById[cardId];
      return intent === undefined || nameKey === undefined
        ? []
        : [{ cardId, intent, nameKey }];
    });
  };

  /**
   * Plays a node's cutscene through the existing timed-direction runtime and
   * hands any branch consequences back so the run layer commits them with the
   * node itself.
   */
  const playCutscene = (
    cutscene: CutsceneDefinition,
    onFinish: (outcome: CutsceneChoiceOutcome) => void,
  ): void => {
    const selections: CutsceneSelection[] = [];
    const finish = (): void => {
      onFinish(collectCutsceneOutcome(cutscene, selections));
    };
    try {
      const overlay = createCutsceneOverlay(toCutsceneBeatViews(cutscene), {
        assets,
        // Beats have always declared an `audioCue`; without the port the
        // overlay had nothing to play it through.
        audio,
        skippable: cutscene.skippable,
        onChoice(beatId, choiceId): void {
          selections.push({ beatId, choiceId });
        },
        onSkipChoices(defaults): void {
          selections.push(...defaults);
        },
      });
      showTimedDirection(overlay, finish);
    } catch (error) {
      // A missing required plate or malformed branch is a flow error. Advancing
      // here would silently commit/skip narrative state behind a blank scene.
      handleFlowError(error, () => playCutscene(cutscene, onFinish));
    }
  };

  const mountEvent = (
    node: NodeDefinition,
    progress: EventProgress = emptyEventProgress,
  ): void => {
    encounterSession = undefined;
    dialogueService = undefined;
    interrogation = undefined;
    const definition = caseForNode(node);
    const event = definition.events_noncombat.find(
      (candidate) => candidate.event_id === node.ref,
    );
    if (event === undefined) throw new Error(`Missing event ${node.ref}.`);
    const { discoveredSpotIds } = progress;
    const model = toEventSceneModel(event, {
      discoveredSpotIds,
      attemptsUsed: discoveredSpotIds.length,
      resources: runSession.snapshot,
      ownedCards: ownedCardViews(),
      cardTuning: runSession.snapshot.cardTuning,
      canvassedTopicIds: progress.canvassedTopicIds,
      collectedTargetIds: progress.collectedTargetIds,
      acquiredEvidenceIds: runSession.snapshot.acquiredEvidenceIds,
      ...(progress.selectedOptionId === undefined
        ? {}
        : { selectedOptionId: progress.selectedOptionId }),
      ...(progress.selectedCardId === undefined
        ? {}
        : { selectedCardId: progress.selectedCardId }),
    });
    let completed = false;
    const closing = cutsceneForTiming(event, 'AFTER');
    const routeAfterEvent = (): void => {
      const advance = (): void => {
        try {
          routeAfterBoundary();
        } catch (error) {
          handleFlowError(error, routeAfterBoundary);
        }
      };
      if (closing === undefined) {
        advance();
        return;
      }
      // A closing cutscene plays after the node has already committed, so its
      // branches are narrative only and cannot change what was just recorded.
      playCutscene(closing, advance);
    };
    const finishEventAndRoute = (
      input: Parameters<typeof finishEvent>[1],
      retry: () => void,
    ): void => {
      completed = true;
      try {
        finishEvent(event, {
          ...input,
          ...(progress.cutsceneOutcome === undefined
            ? {}
            : { cutsceneOutcome: progress.cutsceneOutcome }),
        });
      } catch (error) {
        completed = false;
        handleFlowError(error, retry);
        return;
      }
      routeAfterEvent();
    };
    const eventCallbacks: EventScreenCallbacks = {
      onChoice(choiceId: string): void {
        if (completed) return;
        activateAudio('AMBIENT');
        finishEventAndRoute({ choiceId }, () => eventCallbacks.onChoice?.(choiceId));
      },
      onPlacementSubmit(placement: Readonly<Record<string, string>>): void {
        if (completed) return;
        activateAudio('AMBIENT');
        completed = true;
        let placementResult: NonNullable<ReturnType<typeof finishEvent>['placementResult']>;
        try {
          if (model.pattern !== 'B') {
            throw new Error('배치 제출은 패턴 B 이벤트에서만 가능합니다.');
          }
          const completion = finishEvent(event, { placement });
          if (completion.placementResult === undefined) {
            throw new Error('배치 이벤트 결과를 계산하지 못했습니다.');
          }
          placementResult = completion.placementResult;
        } catch (error) {
          completed = false;
          handleFlowError(error, () => eventCallbacks.onPlacementSubmit?.(placement));
          return;
        }
        const showPlacementResult = (): void => {
          const resultModel = {
            ...model,
            placementResult: {
              correct: placementResult.correct,
              total: placementResult.total,
              ratio: placementResult.ratio,
              result: placementResult.result,
            },
          };
          const resultView = createEventScreen(
            resultModel,
            { onContinue: routeAfterEvent },
            { assets },
          );
          setScene({ view: resultView }, 'AMBIENT');
          setAutoplayScene({
            kind: 'EVENT_RESULT',
            eventId: event.event_id,
            displayStrings: collectAutoplaySceneStrings(resultModel),
            continue: routeAfterEvent,
          });
        };
        try {
          showPlacementResult();
        } catch (error) {
          handleFlowError(error, showPlacementResult);
        }
      },
      onInvestigate(spotId: string): void {
        if (completed || discoveredSpotIds.includes(spotId)) return;
        activateAudio('AMBIENT');
        const next = [...discoveredSpotIds, spotId];
        const targetAttempts = event.pattern === 'C'
          ? Math.min(event.attempt_limit, event.spots.length)
          : 0;
        if (next.length >= targetAttempts) {
          finishEventAndRoute({ investigatedSpotIds: next }, () =>
            eventCallbacks.onInvestigate?.(spotId),
          );
          return;
        }
        mountEvent(node, { ...progress, discoveredSpotIds: next });
      },
      onSelectTuning(selection): void {
        if (completed) return;
        mountEvent(node, {
          ...progress,
          ...(selection.optionId === undefined
            ? {}
            : { selectedOptionId: selection.optionId }),
          ...(selection.cardId === undefined ? {} : { selectedCardId: selection.cardId }),
        });
      },
      onApplyTuning(optionId, cardId): void {
        if (completed) return;
        activateAudio('AMBIENT');
        completed = true;
        try {
          finishEvent(event, { optionId, tunedCardId: cardId, cardIntentsById });
        } catch (error) {
          completed = false;
          handleFlowError(error, () => eventCallbacks.onApplyTuning?.(optionId, cardId));
          return;
        }
        try {
          routeAfterBoundary();
        } catch (error) {
          handleFlowError(error, routeAfterBoundary);
        }
      },
      onCanvass(topicId): void {
        if (completed || progress.canvassedTopicIds.includes(topicId)) return;
        activateAudio('AMBIENT');
        const next = [...progress.canvassedTopicIds, topicId];
        const limit = event.pattern === 'E'
          ? Math.min(event.attempt_limit, event.topics.length)
          : 0;
        if (next.length >= limit) {
          finishEventAndRoute({ canvassedTopicIds: next }, () =>
            eventCallbacks.onCanvass?.(topicId),
          );
          return;
        }
        mountEvent(node, { ...progress, canvassedTopicIds: next });
      },
      onCollect(targetId): void {
        if (completed || progress.collectedTargetIds.includes(targetId)) return;
        activateAudio('AMBIENT');
        const next = [...progress.collectedTargetIds, targetId];
        const limit = event.pattern === 'F'
          ? Math.min(event.attempt_limit, event.targets.length)
          : 0;
        if (next.length >= limit) {
          finishEventAndRoute({ collectedTargetIds: next }, () =>
            eventCallbacks.onCollect?.(targetId),
          );
          return;
        }
        mountEvent(node, { ...progress, collectedTargetIds: next });
      },
      onContinue(): void {
        // Patterns D/E/F let the player stop early; the run layer still needs
        // whatever was gathered before they walked away.
        if (completed) return;
        activateAudio('AMBIENT');
        if (event.pattern === 'E') {
          finishEventAndRoute({ canvassedTopicIds: progress.canvassedTopicIds }, () =>
            eventCallbacks.onContinue?.(),
          );
          return;
        }
        if (event.pattern === 'F') {
          finishEventAndRoute({ collectedTargetIds: progress.collectedTargetIds }, () =>
            eventCallbacks.onContinue?.(),
          );
          return;
        }
        if (event.pattern === 'D') {
          finishEventAndRoute({ cardIntentsById }, () => eventCallbacks.onContinue?.());
          return;
        }
        finishEventAndRoute({ investigatedSpotIds: discoveredSpotIds }, () =>
          eventCallbacks.onContinue?.(),
        );
      },
    };
    const view = createEventScreen(model, eventCallbacks, { assets });
    setScene({ view }, 'AMBIENT');
    setAutoplayScene({
      kind: 'EVENT',
      eventId: event.event_id,
      pattern: event.pattern,
      choiceIds: event.pattern === 'A'
        ? event.choices.map((choice) => choice.choice_id)
        : [],
      answerMapping: event.pattern === 'B' ? { ...event.answer_mapping } : {},
      spotIds: event.pattern === 'C' ? event.spots.map((spot) => spot.spot_id) : [],
      discoveredSpotIds,
      attemptLimit: event.pattern === 'C'
        ? event.attempt_limit
        : event.pattern === 'E' || event.pattern === 'F'
          ? event.attempt_limit
          : 0,
      tuningOptionIds: model.pattern === 'D'
        ? model.options.filter((option) => option.affordable).map((option) => option.optionId)
        : [],
      tuningCardIdsByOption: model.pattern === 'D'
        ? Object.fromEntries(
            model.options.map((option) => [option.optionId, option.eligibleCardIds]),
          )
        : {},
      topicIds: event.pattern === 'E' ? event.topics.map((topic) => topic.topic_id) : [],
      canvassedTopicIds: progress.canvassedTopicIds,
      collectTargetIds: model.pattern === 'F'
        ? model.targets
            .filter((target) => !target.alreadyHeld)
            .map((target) => target.targetId)
        : [],
      collectedTargetIds: progress.collectedTargetIds,
      displayStrings: collectAutoplaySceneStrings(model),
      choose: (choiceId): void => { eventCallbacks.onChoice?.(choiceId); },
      submitPlacement: (placement): void => { eventCallbacks.onPlacementSubmit?.(placement); },
      investigate: (spotId): void => { eventCallbacks.onInvestigate?.(spotId); },
      applyTuning: (optionId, cardId): void => {
        eventCallbacks.onApplyTuning?.(optionId, cardId);
      },
      canvass: (topicId): void => { eventCallbacks.onCanvass?.(topicId); },
      collect: (targetId): void => { eventCallbacks.onCollect?.(targetId); },
      finish: (): void => { eventCallbacks.onContinue?.(); },
    });
  };

  const mountDeadScene = (reason: FailureReason, coercion: number): void => {
    encounterSession = undefined;
    dialogueService = undefined;
    interrogation = undefined;
    const model = toDeadSceneModel({
      reason,
      state: runSession.snapshot,
      totalNodes: strip.length,
      coercion,
      retryLimit: DEFAULT_RETRY_LIMIT,
    });
    const retryNode = (): void => {
      void openCurrentNode().catch((error: unknown) => {
        handleFlowError(error, retryNode);
      });
    };
    const takeDeadSceneAction = (actionId: string): void => {
      activateAudio('AMBIENT');
      if (actionId === DEAD_SCENE_RETRY_ACTION) {
        retryNode();
        return;
      }
      routeAfterBoundary();
    };
    // The failure stinger is the only audio this screen has. It is fired here
    // rather than inside the screen so the renderer stays free of transports,
    // and it is safe when the file is absent: play() returns false in silence.
    audio.play(model.audioCue);
    const controller = createDeadSceneScreen(model, { assets }, {
      onAction: takeDeadSceneAction,
    });
    const update = (): void => controller.update(mounted.app.ticker.deltaMS);
    mounted.app.ticker.add(update);
    setScene({
      view: controller.view,
      onDestroy(): void {
        mounted.app.ticker.remove(update);
        controller.destroy();
      },
    }, 'ENDING');
    setAutoplayScene({
      kind: 'DEAD_SCENE',
      reason,
      actionIds: model.actions.filter((action) => action.enabled).map((action) => action.actionId),
      displayStrings: [model.title, model.cause],
      act: takeDeadSceneAction,
    });
  };

  const commitEncounter = (outcome: EncounterOutcome): (() => void) => {
    const active = encounterSession;
    if (active === undefined) throw new Error('No encounter is active.');
    const runNode = currentRunNode(strip, runSession.snapshot.nodeIndex);
    const encounter = active.caseDefinition.encounters.find(
      (candidate) => candidate.encounter_id === active.encounterId,
    );
    const authoredOutcome = encounter?.outcomes
      .filter((candidate) => candidate.grade === outcome)
      .sort((left, right) => right.priority - left.priority)[0];
    const completion = runSession.finishEncounter({
      outcome,
      rewardRarity: rewardRarityForOutcome(
        outcome,
        active.caseDefinition.metadata.act,
        runNode?.kind === 'BOSS',
      ),
      episodeId: active.caseDefinition.case_id,
      act: active.caseDefinition.metadata.act,
      gradeMetrics: encounterGradeMetrics(active),
      encounterState: encounterRunProjection(active, runSession.snapshot),
      // A defeat keeps the run alive while retries remain; the dead scene is
      // where the player decides whether to spend one.
      failurePolicy: 'RETRY',
      ...(authoredOutcome?.rewards === undefined
        ? {}
        : { outcomeRewards: authoredOutcome.rewards }),
    });
    syncDevFlags();
    const coercionAtDefeat = active.currentModel().dto.resources.coercion;
    let routed = false;
    return (): void => {
      if (routed) return;
      outcomeTransitionPending = false;
      if (outcomeBgmMuted) {
        audio.unmute();
        outcomeBgmMuted = false;
      }
      routed = true;
      if (completion.rewardChoices.length > 0) {
        mountReward(completion.grade, completion.rewardChoices);
        return;
      }
      if (outcome === 'FAILED' && lastFailureReason !== undefined) {
        mountDeadScene(lastFailureReason, coercionAtDefeat);
        return;
      }
      routeAfterBoundary();
    };
  };

  const queueEncounterOutcome = (
    evaluation: OutcomeEvaluation,
    resolution?: ResolutionCode,
  ): void => {
    if (outcomeTransitionPending) return;
    const outcome = evaluation.terminalOutcome;
    if (outcome === null) throw new Error('Cannot queue a non-terminal encounter outcome.');
    lastFailureReason = isFailureReason(evaluation.reason) ? evaluation.reason : undefined;
    outcomeTransitionPending = true;
    let routeAfterDirection: () => void;
    try {
      routeAfterDirection = commitEncounter(outcome);
    } catch (error) {
      outcomeTransitionPending = false;
      throw error;
    }
    const outcomeAssetKeys = uniqueAssetKeys([
      outcome === 'FAILED' ? RESULT_ASSET_KEYS.fail : RESULT_ASSET_KEYS.clear,
      ...(outcome === 'FAILED' && lastFailureReason !== undefined
        ? deadSceneAssetKeys(lastFailureReason)
        : []),
    ]);
    let outcomeAssetsReady: Promise<void> | undefined;
    const preloadOutcomeAssets = (): Promise<void> => {
      outcomeAssetsReady ??= assets.preloadKeys(outcomeAssetKeys).catch((error: unknown) => {
        outcomeAssetsReady = undefined;
        throw error;
      });
      return outcomeAssetsReady;
    };
    // Start while the judgment treatment is still playing. The actual result
    // overlay below still awaits this same single-flight promise.
    void preloadOutcomeAssets().catch(() => undefined);
    const finishQueuedEncounter = (): void => {
      try {
        routeAfterDirection();
      } catch (error) {
        outcomeTransitionPending = false;
        handleFlowError(error, finishQueuedEncounter);
      }
    };
    const showEndingDirection = (): void => {
      void preloadOutcomeAssets().then(() => {
        const outcomeCode = outcomeCodeForEvaluation(evaluation);
        const direction = directionForOutcome(outcomeCode);
        cueOutcome(audio, outcomeCode);
        outcomeBgmMuted = direction === 'ENDING_BGM_MUTE';
        const overlay = createEndingDirection(direction, direction === 'ENDING_TRANSFER_STAMP'
          ? { assets, audio }
          : { assets });
        showTimedDirection(overlay, finishQueuedEncounter);
      }).catch((error: unknown) => {
        handleFlowError(error, showEndingDirection);
      });
    };
    if (resolution === undefined) {
      showEndingDirection();
      return;
    }
    const showResolutionDirection = (): void => {
      try {
        cueResolution(audio, resolution);
        showTimedDirection(
          createJudgmentDirection(directionForResolution(resolution), { assets }),
          showEndingDirection,
        );
      } catch (error) {
        handleFlowError(error, showResolutionDirection);
      }
    };
    showResolutionDirection();
  };

  const mountInterrogation = (renderInitialStatement = false): void => {
    const active = encounterSession;
    const dialogue = dialogueService;
    if (active === undefined || dialogue === undefined) {
      throw new Error('Encounter presentation is not ready.');
    }
    let statementRequestRevision = 0;
    const renderStatementForFacet = (
      facet: InterrogationScreenModel['dto']['statement'][number]['facet'],
    ): void => {
      const selectedClaim = toRenderableClaims(active.currentModel().dto).find(
        (claim) => claim.facet === facet,
      );
      if (selectedClaim === undefined) return;
      const revision = ++statementRequestRevision;
      const model = active.currentModel();
      const requestStatement = (): void => {
        try {
          void dialogue.renderStatement(
            {
              allowedClaims: [selectedClaim],
              reactionKey: `statement.${selectedClaim.claimId}`,
              missingScopes: [],
              seed: stableDialogueSeed([active.encounterId, selectedClaim.claimId]),
            },
            {
              aiEnabled: devState.aiEnabled,
              composureBand: toComposureBand(
                model.dto.resources.composure,
                model.composureMax,
              ),
            },
          ).then((line) => {
            if (interrogation === controller && revision === statementRequestRevision) {
              controller.useFallbackStatement(line);
            }
          }).catch((error: unknown) => {
            if (interrogation === controller && revision === statementRequestRevision) {
              handleFlowError(error, requestStatement);
            }
          });
        } catch (error) {
          if (interrogation === controller && revision === statementRequestRevision) {
            handleFlowError(error, requestStatement);
          }
        }
      };
      requestStatement();
    };
    const screenModel = activeModel();
    const advanceEncounterTurn = (): boolean => {
      const turnOutcome = active.coordinator.endTurn();
      if (turnOutcome.terminalOutcome === null) return false;
      mountInterrogation();
      queueEncounterOutcome(turnOutcome);
      return true;
    };
    const endTurnForAutoplay = (): void => {
      try {
        if (!advanceEncounterTurn()) mountInterrogation();
      } catch (error) {
        handleFlowError(error, endTurnForAutoplay);
      }
    };
    /**
     * Proof rules are case-private, so the coverage check can only happen here
     * in the app layer. The banner it feeds says "under review", never a
     * verdict: the resolver still owns the judgment.
     */
    const previewSelection = (selection: InterrogationSelection): void => {
      if (selection.cardId === undefined || selection.facet === undefined) return;
      const card = active.cardsDefinition.cards.find(
        (candidate) => candidate.card_id === selection.cardId,
      );
      if (card === undefined) return;
      const direction = card.intent === 'CONTRADICT'
        ? 'CONTRADICT'
        : card.intent === 'CONFIRM'
          ? 'SUPPORT'
          : undefined;
      if (direction === undefined) return;
      const targetClaimId = active.targetClaimIdForFacet(selection.facet);
      if (targetClaimId === undefined) return;
      const rule = active.caseDefinition.proof_rules.find(
        (candidate) =>
          candidate.target_claim_id === targetClaimId && candidate.direction === direction,
      );
      if (rule === undefined) return;
      const model = active.currentModel();
      const docked = model.dto.evidence.filter((evidence) =>
        selection.evidenceIds.includes(evidence.evidenceId),
      );
      if (docked.length === 0) return;
      const statement = toRenderableClaims(model.dto).find(
        (claim) => claim.claimId === targetClaimId,
      )?.canonicalMeaning;
      interrogation?.showJudgmentFeedback(
        buildEvidencePreviewFeedback({
          requiredScopes: rule.requirements.required_scopes,
          coveredScopes: docked.flatMap((evidence) => evidence.scopes),
          evidenceNames: docked.map((evidence) => evidence.displayName),
          ...(statement === undefined ? {} : { statement }),
          ...(judgmentUiMap === undefined ? {} : { uiMap: judgmentUiMap }),
        }),
      );
    };
    const interrogationCallbacks: InterrogationCallbacks = {
        onSelectionChange(selection): void {
          if (outcomeTransitionPending) return;
          audio.play('paper_flip');
          if (selection.facet !== undefined) renderStatementForFacet(selection.facet);
          previewSelection(selection);
        },
        onSubmit(selection): void {
          if (outcomeTransitionPending) return;
          if (selection.cardId === undefined || selection.facet === undefined) {
            controller.useFallbackStatement('선택한 진술을 다시 확인하겠습니다.');
            return;
          }
          const targetClaimId = active.targetClaimIdForFacet(selection.facet);
          if (targetClaimId === undefined) {
            controller.useFallbackStatement('이 진술에는 해당 태그가 없습니다.');
            return;
          }
          try {
            if (active.coordinator.snapshot.machine.state === 'CHECK_OUTCOME') {
              if (advanceEncounterTurn()) return;
            }
            if (active.coordinator.snapshot.machine.state === 'FREE_REVIEW') {
              active.coordinator.beginArgument();
            }
            audio.play('card_snap');
            const modelBefore = active.currentModel();
            const evidenceBefore = new Map(
              modelBefore.dto.evidence.map((evidence) => [
                evidence.evidenceId,
                evidence.grade,
              ]),
            );
            // Quoted back by the judgment banner. Both are read before the
            // submission because a resolution can hide the claim or shred the
            // evidence it was argued with.
            const submittedStatement = toRenderableClaims(modelBefore.dto).find(
              (claim) => claim.claimId === targetClaimId,
            )?.canonicalMeaning;
            const submittedEvidenceNames = selection.evidenceIds.flatMap((evidenceId) => {
              const item = modelBefore.dto.evidence.find(
                (candidate) => candidate.evidenceId === evidenceId,
              );
              return item === undefined ? [] : [item.displayName];
            });
            const result = active.coordinator.submit({
              cardId: selection.cardId,
              targetClaimId,
              evidenceIds: selection.evidenceIds,
            });
            const evidenceAfter = new Map(
              active.currentModel().dto.evidence.map((evidence) => [
                evidence.evidenceId,
                evidence.grade,
              ]),
            );
            const gradeOrder = ['C', 'B', 'A'] as const;
            const evidenceWasDamaged = [...evidenceBefore].some(([evidenceId, grade]) => {
              const currentGrade = evidenceAfter.get(evidenceId);
              return currentGrade === undefined
                || gradeOrder.indexOf(currentGrade) < gradeOrder.indexOf(grade);
            });
            if (evidenceWasDamaged) audio.play('shredder');
            recordDevJudgment?.(
              { source: 'ENCOUNTER_SUBMISSION', selection, nodeId: devState.nodeId },
              {
                resolutionCode: result.resolution.code,
                outcome: result.outcome.terminalOutcome,
              },
            );
            // Measured against the live gauge, never read off the resolution:
            // card modifiers, encounter modifiers, and relics all move coercion
            // after the judgment computes its own delta. If a relic absorbed
            // the penalty the gauge did not move, and the player must not be
            // shown a punishment the relic just cancelled.
            const coercionRise =
              active.currentModel().dto.resources.coercion -
              modelBefore.dto.resources.coercion;
            // The screen is rebuilt on every submission, so the judgment feed
            // has to be replayed onto the controller that just replaced it.
            const presentJudgment = (): void => {
              const controllerAfterMount = interrogation;
              if (controllerAfterMount === undefined) return;
              controllerAfterMount.showJudgmentFeedback(
                buildJudgmentFeedback({
                  resolution: result.resolution,
                  ...(submittedStatement === undefined
                    ? {}
                    : { statement: submittedStatement }),
                  evidenceNames: submittedEvidenceNames,
                  ...(judgmentUiMap === undefined ? {} : { uiMap: judgmentUiMap }),
                }),
              );
              controllerAfterMount.playCoercionRise(coercionRise);
            };
            if (result.outcome.terminalOutcome !== null) {
              mountInterrogation();
              presentJudgment();
              queueEncounterOutcome(
                result.outcome,
                result.resolution.code,
              );
              return;
            }
            mountInterrogation();
            presentJudgment();
            cueResolution(audio, result.resolution.code);
            showTimedDirection(
              createJudgmentDirection(
                directionForResolution(result.resolution.code),
                { assets },
              ),
            );
            const reactionController = interrogation;
            const selectedClaim = toRenderableClaims(active.currentModel().dto).find(
              (claim) => claim.claimId === targetClaimId,
            );
            if (reactionController === undefined || selectedClaim === undefined) {
              reactionController?.useFallbackStatement('판정 결과를 사건 기록에 반영했습니다.');
              return;
            }
            const model = active.currentModel();
            const request = {
              allowedClaims: [selectedClaim],
              reactionKey: result.reactionKey,
              missingScopes: result.missingScopes,
              seed: stableDialogueSeed([
                selection.cardId,
                selection.facet,
                ...selection.evidenceIds,
              ]),
            } as const;
            const requestReaction = (): void => {
              try {
                void dialogue
                  .renderReaction(request, {
                    aiEnabled: devState.aiEnabled,
                    composureBand: toComposureBand(
                      model.dto.resources.composure,
                      model.composureMax,
                    ),
                  })
                  .then((line) => {
                    if (interrogation === reactionController) {
                      reactionController.useFallbackStatement(line);
                    }
                  })
                  .catch((error: unknown) => {
                    if (interrogation === reactionController) {
                      handleFlowError(error, requestReaction);
                    }
                  });
              } catch (error) {
                if (interrogation === reactionController) {
                  handleFlowError(error, requestReaction);
                }
              }
            };
            requestReaction();
          } catch (error) {
            handleFlowError(error, mountInterrogation);
          }
        },
        onAdvance(): void {
          try {
            audio.play('typewriter_return');
            controller.finishStatement();
          } catch (error) {
            handleFlowError(error, () => interrogationCallbacks.onAdvance?.());
          }
        },
        onSecureStatement(): void {
          if (outcomeTransitionPending) return;
          try {
            const outcome = active.coordinator.secureStatement();
            recordDevJudgment?.(
              { source: 'SECURE_STATEMENT', encounterId: active.encounterId },
              { outcome: outcome.terminalOutcome },
            );
            if (outcome.terminalOutcome === null) {
              throw new Error('진술 확보가 종료 결과를 만들지 못했습니다.');
            }
            mountInterrogation();
            queueEncounterOutcome(outcome);
          } catch (error) {
            handleFlowError(error, mountInterrogation);
          }
        },
        ...(screenModel.partnerSkillAvailable
          ? {
              onUsePartner(): void {
                if (outcomeTransitionPending) return;
                try {
                  active.usePartnerSkill();
                  mountInterrogation();
                } catch (error) {
                  handleFlowError(error, mountInterrogation);
                }
              },
            }
          : {}),
        onKeystroke(): void {
          audio.play('typewriter');
        },
    };
    const controller = createInterrogationScreen(
      screenModel,
      interrogationCallbacks,
      { assets },
    );
    interrogation = controller;
    const update = (): void => controller.update(mounted.app.ticker.deltaMS);
    mounted.app.ticker.add(update);
    const runNode = currentRunNode(strip, runSession.snapshot.nodeIndex);
    setScene({
      view: controller.view,
      onDestroy(): void {
        mounted.app.ticker.remove(update);
        if (interrogation === controller) interrogation = undefined;
        controller.destroy();
      },
    }, runNode?.kind === 'BOSS' ? 'BOSS' : 'INTERROGATION');
    const coordinatorSnapshot = active.coordinator.snapshot;
    const cardPlayability = Object.fromEntries(screenModel.cards.map((card) => {
      const definition = active.cardsDefinition.cards.find(
        (candidate) => candidate.card_id === card.cardId,
      );
      const effectiveCpCost = definition === undefined
        ? card.cpCost
        : Math.max(
            0,
            (definition.cost.cp ?? 0) +
              (coordinatorSnapshot.actionCostDeltas[definition.intent] ?? 0),
          );
      const cardLocked =
        (coordinatorSnapshot.cards[card.cardId]?.lockedUntilTurn ?? -1) >=
        coordinatorSnapshot.resources.turn;
      const actionLocked =
        definition === undefined ||
        (coordinatorSnapshot.actionLocks[definition.intent] ?? -1) >=
          coordinatorSnapshot.resources.turn;
      return [card.cardId, {
        effectiveCpCost,
        playable:
          definition !== undefined &&
          !cardLocked &&
          !actionLocked &&
          effectiveCpCost <= coordinatorSnapshot.resources.commandPoints,
      }] as const;
    }));
    setAutoplayScene({
      kind: 'INTERROGATION',
      encounterId: active.encounterId,
      machineState: coordinatorSnapshot.machine.state,
      turn: coordinatorSnapshot.resources.turn,
      turnLimit: active.caseDefinition.metadata.estimated_turns,
      secureStatementEnabled: screenModel.canSecureStatement === true,
      model: screenModel,
      caseDefinition: active.caseDefinition,
      cardPlayability,
      requiredObjectives: coordinatorSnapshot.objectives.required.map((objective) => ({
        objectiveId: objective.objectiveId,
        completed: objective.completed,
      })),
      displayStrings: collectAutoplaySceneStrings(screenModel),
      submit: (submission): void => {
        interrogationCallbacks.onSubmit?.({
          cardId: submission.cardId,
          facet: submission.facet,
          evidenceIds: submission.evidenceIds,
        });
      },
      endTurn: endTurnForAutoplay,
      secureStatement: (): void => {
        interrogationCallbacks.onSecureStatement?.();
      },
      skipTypewriter: (): void => {
        controller.finishStatement();
      },
    });
    const suspectTransition = detectSuspectTransition(
      { encounterId: lastSuspectEncounterId, statePart: lastSuspectStatePart },
      { encounterId: active.encounterId, statePart: screenModel.suspectStatePart },
    );
    lastSuspectStatePart = screenModel.suspectStatePart;
    lastSuspectEncounterId = active.encounterId;
    if (suspectTransition !== undefined) controller.playSuspectTransition(suspectTransition);
    if (renderInitialStatement) {
      const initialFacet = active.currentModel().dto.statement.find(
        (claim) => claim.presentation !== 'HIDDEN',
      )?.facet;
      if (initialFacet !== undefined) renderStatementForFacet(initialFacet);
    }
  };

  const prepareDialogue = async (active: EncounterSession): Promise<Phase4DialogueService> => {
    const allowedTimeHours = active.caseDefinition.claims.flatMap((claim) => {
      const hour = Number(String(claim.time_ref?.from ?? '').split(':')[0]);
      return Number.isInteger(hour) ? [hour] : [];
    }).filter((hour, index, hours) => hours.indexOf(hour) === index);
    return createPhase4DialogueService({
      speakerProfile: active.speakerProfile,
      fallbackCatalog: active.fallbackCatalog,
      forbiddenInformation: [
        'truth_relation',
        'proof_rules',
        'hypotheses',
        'exact_composure',
      ],
      allowedTimeHours,
      ...(active.encounterId === 'enc_tutorial_slime'
        ? {
            preverifiedCacheFile: await loadPreverifiedCache(
              runtimeContentUrl('ai-cache/tutorial-slime-full-statement.json'),
            ),
          }
        : {}),
    });
  };

  async function openCurrentNode(): Promise<void> {
    if (openingNode || destroyed) return;
    openingNode = true;
    try {
      const node = currentRunNode(strip, runSession.snapshot.nodeIndex);
      if (node === null) {
        await mountEnding();
        return;
      }
      devState.nodeId = node.ref;
      // A new node means a new suspect: the first mount must never shake.
      lastSuspectStatePart = undefined;
      lastSuspectEncounterId = undefined;
      if (node.kind === 'EVENT') {
        const definition = caseForNode(node);
        const event = definition.events_noncombat.find(
          (candidate) => candidate.event_id === node.ref,
        );
        if (event === undefined) throw new Error(`Missing event ${node.ref}.`);
        const opening = cutsceneForTiming(event, 'BEFORE');
        const closing = cutsceneForTiming(event, 'AFTER');
        await assets.preloadKeys(uniqueAssetKeys([
          ...eventSceneAssetKeys(toEventSceneModel(event)),
          ...(opening === undefined ? [] : cutscenePresentationAssetKeys(opening)),
          ...(closing === undefined ? [] : cutscenePresentationAssetKeys(closing)),
        ]));
        if (destroyed) return;
        if (opening === undefined) {
          mountEvent(node);
          return;
        }
        playCutscene(opening, (outcome) => {
          mountEvent(node, { ...emptyEventProgress, cutsceneOutcome: outcome });
        });
        return;
      }
      for (const key of Object.keys(resourceOverrides) as Array<keyof typeof resourceOverrides>) {
        delete resourceOverrides[key];
      }
      const active = await createEncounterSession({
        caseDirectory: node.caseDirectory,
        encounterId: node.ref,
        runSeed: encounterSeed(runSession.snapshot),
        runState: runSession.snapshot,
        flagDefinitions: runCatalog.flags.flags,
        caseRepository: cachedCaseRepository,
        cardRepository: cachedCardRepository,
        balanceRepository: cachedBalanceRepository,
        fallbackRepository,
        relicDefinitions: runCatalog.relics.relics,
        enhancementDefinitions: runCatalog.enhancements.enhancements,
      });
      if (destroyed) return;
      await assets.preloadKeys(
        interrogationPresentationAssetKeys(
          active.currentModel(),
          active.cardsDefinition.cards,
        ),
      );
      if (destroyed) return;
      encounterSession = active;
      devState.nodeId = active.coordinator.snapshot.flowNodeId ?? active.encounterId;
      dialogueService = await prepareDialogue(active);
      if (destroyed || encounterSession !== active) return;
      audio.play('door_knock');
      audio.play('shuffle_bubble');
      mountInterrogation(true);
    } finally {
      openingNode = false;
    }
  }

  if (runSession.snapshot.pendingRewardIds.length > 0) {
    mountPendingReward();
  } else if (
    runSession.snapshot.terminal ||
    runSession.snapshot.nodeIndex >= strip.length
  ) {
    await mountEnding();
  } else {
    await mountStrip();
  }

  if (import.meta.env.DEV) {
    const { mountDeveloperConsole } = await import('../dev');
    const devConsole = await mountDeveloperConsole({
      mount,
      balanceRepository,
      caseDirectory: 'tutorial',
      runtime: {
        getSnapshot() {
          const model = encounterSession === undefined ? undefined : activeModel();
          return {
            composure: model?.dto.resources.composure ?? 0,
            coercion: model?.dto.resources.coercion ?? 0,
            commandPoints: model?.dto.resources.commandPoints ?? 0,
            stress: model?.stress ?? runSession.snapshot.stress,
            nodeId: devState.nodeId,
            aiEnabled: devState.aiEnabled,
            qteAutoSuccess: devState.qteAutoSuccess,
            flags: { ...devState.flags },
          };
        },
        availableNodes() {
          return availableNodes;
        },
        setResource(key, value): void {
          resourceOverrides[key] = value;
          if (encounterSession !== undefined && dialogueService !== undefined) {
            mountInterrogation();
          }
        },
        jumpToNode(nodeId): void {
          if (!availableNodes.includes(nodeId)) {
            throw new Error(`Unknown encounter node: ${nodeId}`);
          }
          devState.nodeId = nodeId;
          interrogation?.useFallbackStatement(`개발자 노드 점프 · ${nodeId}`);
        },
        setAiEnabled(enabled): void {
          devState.aiEnabled = enabled;
        },
        setQteAutoSuccess(enabled): void {
          devState.qteAutoSuccess = enabled;
        },
        setFlag(flagId, enabled): void {
          devState.flags[flagId] = enabled;
        },
        replayDialogue(text): void {
          interrogation?.useFallbackStatement(text);
        },
        applyBalance(nextBalance: BalanceDefinition): void {
          encounterSession?.applyBalance(nextBalance);
          if (encounterSession !== undefined) {
            resourceOverrides.stress = Math.min(activeModel().stress, nextBalance.stress.max);
            if (dialogueService !== undefined) mountInterrogation();
          }
        },
      },
    });
    recordDevJudgment = (input, result): void => devConsole.recordJudgment(input, result);
    destroyDevConsole = (): void => devConsole.destroy();

    if (autoplayRequested) {
      const { startAutoplay } = await import('../dev/autoplay');
      const port: AutoplayPort = {
        scene: currentAutoplayScene,
        runSnapshot: () => ({
          nodeIndex: runSession.snapshot.nodeIndex,
          flags: runSession.snapshot.flags,
          dp: runSession.snapshot.dp,
          stress: runSession.snapshot.stress,
          trust: runSession.snapshot.trust,
          claimedRewardIds: runSession.snapshot.claimedRewardIds,
          pendingRewardIds: runSession.snapshot.pendingRewardIds,
          acquiredRelicIds: runSession.snapshot.acquiredRelicIds,
          completedNodeIds: runSession.snapshot.completedNodeIds,
          gradeHistory: runSession.snapshot.gradeHistory,
          outcomeHistory: runSession.snapshot.outcomeHistory,
          terminal: runSession.snapshot.terminal,
        }),
        lastFlowError: () => mount.dataset.flowError,
        setDirectionTimeScale(scale): void {
          if (!Number.isFinite(scale) || scale <= 0) {
            throw new RangeError('Direction time scale must be a positive finite number.');
          }
          directionTimeScale = scale;
        },
        onSceneChange(listener): () => void {
          sceneListeners.add(listener);
          return (): void => {
            sceneListeners.delete(listener);
          };
        },
      };
      const modeParam = urlParams.get('mode');
      const policyParam = urlParams.get('policy');
      const autoplayModes: readonly AutoplayOptions['mode'][] =
        ['watch', 'turbo', 'record', 'video', 'submission'];
      const autoplayPolicies: readonly AutoplayOptions['policy'][] =
        ['best', 'partial', 'coerced', 'greedy', 'fuzz'];
      // A typo in a URL parameter must degrade to defaults, never crash boot.
      const mode = autoplayModes.find((known) => known === modeParam) ?? 'turbo';
      const policy = autoplayPolicies.find((known) => known === policyParam) ?? 'best';
      if (modeParam !== null && mode !== modeParam) {
        console.warn(`Unknown autoplay mode "${modeParam}"; falling back to "${mode}".`);
      }
      if (policyParam !== null && policy !== policyParam) {
        console.warn(`Unknown autoplay policy "${policyParam}"; falling back to "${policy}".`);
      }
      startAutoplay(port, {
        mode,
        policy,
        // The seed the strip was actually resolved with, so the report is
        // judged against the route it walked. A resumed run keeps its saved
        // seed, which `runSeedOverride ?? DEFAULT_RUN_SEED` would have lost.
        seed: routeSeed,
      });
    }
  }

  return {
    app: mounted.app,
    scenes: mounted.scenes,
    destroy(): void {
      destroyed = true;
      destroyDevConsole();
      audio.destroy();
      mounted.destroy();
    },
  };
}
