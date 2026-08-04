import {
  createGameApplication,
  preloadRuntimeAssets,
  resolveAsset,
  runtimeAssetRegistry,
  type ManagedUiLayer,
  type MountedGameApplication,
} from '../ui/core';
import {
  createEndingDirection,
  createInterrogationScreen,
  createJudgmentDirection,
  directionForOutcome,
  directionForResolution,
  type InterrogationScreenController,
  type InterrogationScreenModel,
  type TimedDirectionOverlay,
} from '../ui/screens/interrogation';
import { createEndingScreen } from '../ui/screens/ending';
import { createEventScreen } from '../ui/screens/event';
import { createRewardScreen } from '../ui/screens/reward';
import { createRunStripScreen } from '../ui/screens/strip';
import {
  BalanceRepository,
  CardRepository,
  CaseRepository,
  FallbackRepository,
  RunCatalogRepository,
  RunStripRepository,
  type BalanceDefinition,
  type CaseDefinition,
  type RewardDefinition,
} from '../content-io';
import { AudioPlayer, RUNTIME_SOUND_DEFINITIONS } from '../audio';
import {
  toRenderableClaims,
  type ResolutionCode,
} from '../dto';
import type { EncounterOutcome, OutcomeEvaluation } from '../engine/encounter';
import {
  createNodeStrip,
  currentRunNode,
  type CaseGrade,
  type NodeDefinition,
  type RunState,
} from '../engine/run';
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
import { createRunSession, type RunSession } from './createRunSession';
import {
  toEndingScreenModel,
  toEventSceneModel,
  toRewardScreenModel,
  toRunStripScreenModel,
} from './gameFlowPresentation';
import {
  createInitialGameRunState,
  encounterGradeMetrics,
  encounterRunProjection,
  ENDING_PRESENTATIONS,
  endingIdForRun,
  rewardRarityForOutcome,
} from './gameRunState';
import { restoreRunState, SaveRepository } from './save';

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

export async function bootstrap(mount: HTMLElement): Promise<MountedGameApplication> {
  mount.dataset.assetCount = runtimeAssetRegistry.size.toString();
  try {
    await document.fonts.load('11px Galmuri11');
  } catch (error) {
    console.warn('Galmuri11 could not be preloaded; continuing with the browser fallback.', error);
  }
  const mounted = await createGameApplication(mount);
  const audio = new AudioPlayer();
  audio.registerAll(RUNTIME_SOUND_DEFINITIONS);
  await preloadRuntimeAssets();
  const fallback = runtimeAssetRegistry.get('placeholder/missing/fallback');
  const assets = {
    resolveUrl(key: string): string | undefined {
      if (fallback === undefined) {
        const exact = runtimeAssetRegistry.get(key);
        if (exact === undefined) console.warn(`Missing asset "${key}"; no fallback is installed.`);
        return exact?.url;
      }
      return resolveAsset(runtimeAssetRegistry, key, fallback).url;
    },
  };

  const balanceRepository = new BalanceRepository();
  const caseRepository = new CaseRepository();
  const cardRepository = new CardRepository();
  const fallbackRepository = new FallbackRepository();
  const runCatalogRepository = new RunCatalogRepository();
  const runStripRepository = new RunStripRepository();
  const [balanceValue, cardsValue, runCatalogValue, runStripValue] = await Promise.all([
    balanceRepository.reload(),
    cardRepository.load(),
    runCatalogRepository.load(),
    runStripRepository.load(),
  ]);
  required(balanceValue, 'Balance catalogue');
  const cards = required(cardsValue, 'Card catalogue');
  const runCatalog = required(runCatalogValue, 'Run catalogue');
  const runStripDefinition = required(runStripValue, 'Run strip');
  const strip = createNodeStrip(runStripDefinition);
  const caseDirectories = strip
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

  const saveRepository = new SaveRepository(window.localStorage);
  const freshState = (): RunState => createInitialGameRunState(
    cards,
    balanceRepository.current(),
    runCatalog.flags,
  );
  let initialState: RunState;
  try {
    const saved = saveRepository.load();
    initialState = saved === undefined ? freshState() : restoreRunState(saved);
    if (initialState.nodeIndex > strip.length) {
      throw new Error('Saved run position is outside the canonical strip.');
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
    let disposeOverlay: (() => void) | undefined;
    let update = (): void => undefined;
    const runCompletion = (): void => {
      if (completionRan) return;
      completionRan = true;
      onComplete?.();
    };
    const stopTicker = (): boolean => {
      if (finished) return false;
      finished = true;
      mounted.app.ticker.remove(update);
      return true;
    };
    update = (): void => {
      overlay.update(mounted.app.ticker.deltaMS);
      if (!overlay.complete || !stopTicker()) return;
      disposeOverlay?.();
      runCompletion();
    };
    const layer: ManagedUiLayer = {
      view: overlay.view,
      onEnter: (): void => overlay.onEnter?.(),
      onExit: (): void => overlay.onExit?.(),
      onDestroy: (): void => {
        const interrupted = stopTicker();
        overlay.onDestroy?.();
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
  };

  const syncDevFlags = (): void => {
    for (const flagId of Object.keys(devState.flags)) {
      devState.flags[flagId] = runSession.snapshot.flags[flagId] === true;
    }
  };

  const handleFlowError = (error: unknown): void => {
    const message = error instanceof Error ? error.message : String(error);
    mount.dataset.flowError = message;
    console.error('Game run flow failed.', error);
  };

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

  const mountStrip = (): void => {
    encounterSession = undefined;
    dialogueService = undefined;
    interrogation = undefined;
    const view = createRunStripScreen(
      toRunStripScreenModel(runStripDefinition, runSession.snapshot),
      {
        onContinue(): void {
          activateAudio('AMBIENT');
          void openCurrentNode().catch(handleFlowError);
        },
      },
    );
    setScene({ view }, 'AMBIENT');
  };

  const mountEnding = (): void => {
    encounterSession = undefined;
    dialogueService = undefined;
    interrogation = undefined;
    const model = toEndingScreenModel(
      endingIdForRun(runSession.snapshot),
      ENDING_PRESENTATIONS,
    );
    const view = createEndingScreen(model, assets, () => {
      activateAudio('AMBIENT');
      saveRepository.clear();
      runSession = newRunSession(freshState());
      syncDevFlags();
      devState.nodeId = strip[0]?.ref ?? 'run-complete';
      mountStrip();
    });
    setScene({ view }, 'ENDING');
  };

  const routeAfterBoundary = (): void => {
    syncDevFlags();
    if (runSession.snapshot.terminal || runSession.snapshot.nodeIndex >= strip.length) {
      mountEnding();
      return;
    }
    mountStrip();
  };

  const mountReward = (
    grade: CaseGrade,
    choices: readonly RewardDefinition[],
  ): void => {
    encounterSession = undefined;
    dialogueService = undefined;
    interrogation = undefined;
    let selected = false;
    const view = createRewardScreen(toRewardScreenModel(grade, choices), (rewardId) => {
      if (selected) return;
      activateAudio('AMBIENT');
      selected = true;
      try {
        runSession.claimReward(rewardId);
        routeAfterBoundary();
      } catch (error) {
        selected = false;
        handleFlowError(error);
      }
    });
    setScene({ view }, 'AMBIENT');
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
    input: Readonly<{
      choiceId?: string;
      placement?: Readonly<Record<string, string>>;
      investigatedSpotIds?: readonly string[];
    }>,
  ) => runSession.finishEvent({ eventDefinition: event, ...input });

  const mountEvent = (
    node: NodeDefinition,
    discoveredSpotIds: readonly string[] = [],
  ): void => {
    encounterSession = undefined;
    dialogueService = undefined;
    interrogation = undefined;
    const definition = caseForNode(node);
    const event = definition.events_noncombat.find(
      (candidate) => candidate.event_id === node.ref,
    );
    if (event === undefined) throw new Error(`Missing event ${node.ref}.`);
    const model = toEventSceneModel(event, {
      discoveredSpotIds,
      attemptsUsed: discoveredSpotIds.length,
    });
    let completed = false;
    const view = createEventScreen(model, {
      onChoice(choiceId): void {
        if (completed) return;
        activateAudio('AMBIENT');
        completed = true;
        try {
          finishEvent(event, { choiceId });
          routeAfterBoundary();
        } catch (error) {
          completed = false;
          handleFlowError(error);
        }
      },
      onPlacementSubmit(placement): void {
        if (completed) return;
        activateAudio('AMBIENT');
        completed = true;
        try {
          if (model.pattern !== 'B') {
            throw new Error('배치 제출은 패턴 B 이벤트에서만 가능합니다.');
          }
          const completion = finishEvent(event, { placement });
          if (completion.placementResult === undefined) {
            throw new Error('배치 이벤트 결과를 계산하지 못했습니다.');
          }
          const resultView = createEventScreen(
            {
              ...model,
              placementResult: {
                correct: completion.placementResult.correct,
                total: completion.placementResult.total,
                ratio: completion.placementResult.ratio,
                result: completion.placementResult.result,
              },
            },
            { onContinue: routeAfterBoundary },
          );
          setScene({ view: resultView }, 'AMBIENT');
        } catch (error) {
          completed = false;
          handleFlowError(error);
        }
      },
      onInvestigate(spotId): void {
        if (completed || discoveredSpotIds.includes(spotId)) return;
        activateAudio('AMBIENT');
        const next = [...discoveredSpotIds, spotId];
        const targetAttempts = event.pattern === 'C'
          ? Math.min(event.attempt_limit, event.spots.length)
          : 0;
        if (next.length >= targetAttempts) {
          completed = true;
          try {
            finishEvent(event, { investigatedSpotIds: next });
            routeAfterBoundary();
          } catch (error) {
            completed = false;
            handleFlowError(error);
          }
          return;
        }
        mountEvent(node, next);
      },
    });
    setScene({ view }, 'AMBIENT');
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
      ...(authoredOutcome?.rewards === undefined
        ? {}
        : { outcomeRewards: authoredOutcome.rewards }),
    });
    syncDevFlags();
    let routed = false;
    return (): void => {
      if (routed) return;
      routed = true;
      outcomeTransitionPending = false;
      if (outcomeBgmMuted) {
        audio.unmute();
        outcomeBgmMuted = false;
      }
      if (completion.rewardChoices.length > 0) {
        mountReward(completion.grade, completion.rewardChoices);
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
    outcomeTransitionPending = true;
    let routeAfterDirection: () => void;
    try {
      routeAfterDirection = commitEncounter(outcome);
    } catch (error) {
      outcomeTransitionPending = false;
      throw error;
    }
    const finishQueuedEncounter = (): void => {
      try {
        routeAfterDirection();
      } catch (error) {
        outcomeTransitionPending = false;
        handleFlowError(error);
      }
    };
    const showEndingDirection = (): void => {
      try {
        const outcomeCode = outcomeCodeForEvaluation(evaluation);
        const direction = directionForOutcome(outcomeCode);
        cueOutcome(audio, outcomeCode);
        outcomeBgmMuted = direction === 'ENDING_BGM_MUTE';
        const overlay = createEndingDirection(direction, direction === 'ENDING_TRANSFER_STAMP'
          ? { assets, audio }
          : { assets });
        showTimedDirection(overlay, finishQueuedEncounter);
      } catch (error) {
        handleFlowError(error);
        finishQueuedEncounter();
      }
    };
    if (resolution === undefined) {
      showEndingDirection();
      return;
    }
    try {
      cueResolution(audio, resolution);
      showTimedDirection(
        createJudgmentDirection(directionForResolution(resolution), { assets }),
        showEndingDirection,
      );
    } catch (error) {
      handleFlowError(error);
      showEndingDirection();
    }
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
      }).catch(() => {
        if (interrogation === controller && revision === statementRequestRevision) {
          controller.useFallbackStatement(selectedClaim.canonicalMeaning);
        }
      });
    };
    const controller = createInterrogationScreen(
      activeModel(),
      {
        onSelectionChange(selection): void {
          if (outcomeTransitionPending) return;
          audio.play('paper_flip');
          if (selection.facet !== undefined) renderStatementForFacet(selection.facet);
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
              const turnOutcome = active.coordinator.endTurn();
              if (turnOutcome.terminalOutcome !== null) {
                mountInterrogation();
                queueEncounterOutcome(turnOutcome);
                return;
              }
            }
            if (active.coordinator.snapshot.machine.state === 'FREE_REVIEW') {
              active.coordinator.beginArgument();
            }
            audio.play('card_snap');
            const evidenceBefore = new Map(
              active.currentModel().dto.evidence.map((evidence) => [
                evidence.evidenceId,
                evidence.grade,
              ]),
            );
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
            if (result.outcome.terminalOutcome !== null) {
              mountInterrogation();
              queueEncounterOutcome(
                result.outcome,
                result.resolution.code,
              );
              return;
            }
            mountInterrogation();
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
              .catch(() => {
                if (interrogation === reactionController) {
                  reactionController.useFallbackStatement(selectedClaim.canonicalMeaning);
                }
              });
          } catch (error) {
            controller.useFallbackStatement(
              error instanceof Error ? error.message : '제출을 처리하지 못했습니다.',
            );
          }
        },
        onAdvance(): void {
          audio.play('typewriter_return');
          controller.finishStatement();
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
            controller.useFallbackStatement(
              error instanceof Error ? error.message : '진술을 확보하지 못했습니다.',
            );
          }
        },
        onKeystroke(): void {
          audio.play('typewriter');
        },
      },
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
              '/content/ai-cache/tutorial-slime-full-statement.json',
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
        mountEnding();
        return;
      }
      devState.nodeId = node.ref;
      if (node.kind === 'EVENT') {
        mountEvent(node);
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
      });
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
    mountEnding();
  } else {
    mountStrip();
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
          balanceRepository.applyInstantly(nextBalance);
          if (encounterSession !== undefined) {
            resourceOverrides.stress = Math.min(activeModel().stress, nextBalance.stress.max);
          }
        },
      },
    });
    recordDevJudgment = (input, result): void => devConsole.recordJudgment(input, result);
    destroyDevConsole = (): void => devConsole.destroy();
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
