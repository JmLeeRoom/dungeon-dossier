import balanceJson from '../../../content/common/balance.json';
import cardsJson from '../../../content/common/cards.json';
import type {
  AutoplayOptions,
  AutoplayPort,
  AutoplayScene,
  AutoplaySubmission,
} from '../../app/autoplayPort';
import { BalanceSchema, CardsSchema } from '../../engine/domain';
import { t } from '../../app/i18n';
import { createAutoplayHud } from './hud';
import {
  chooseEventChoice,
  chooseReward,
  bestFillerSubmission,
  coercedSubmission,
  createFuzzRng,
  deriveProofPaths,
  fuzzSubmission,
  greedySubmission,
  hasIncompleteNonProofObjective,
  nextIncompleteProofPathIndex,
  partialSubmission,
  planBestLiveAction,
  type LegalSubmissionContext,
  type ProofPathStep,
} from './policy';
import {
  AUTOPLAY_REPORT_SCHEMA_VERSION,
  findAutoplayInvariantFailures,
  findRawI18nKeys,
  publishReport,
  type AutoplayNodeReport,
  type AutoplayReport,
  type AutoplayReportEvidence,
} from './report';

type InterrogationScene = Extract<AutoplayScene, { kind: 'INTERROGATION' }>;

interface ModeConfig {
  readonly timeScale: number;
  readonly actionDelayMs: number;
  readonly sceneStallMs: number;
  readonly runTimeoutMs: number;
  readonly skipTypewriter: boolean;
  /** Cinematic pacing target: the run is stretched to land on this length. */
  readonly targetDurationSec?: number;
}

export const MODE_CONFIGS: Readonly<Record<AutoplayOptions['mode'], ModeConfig>> = {
  watch: {
    timeScale: 1,
    actionDelayMs: 600,
    sceneStallMs: 90_000,
    runTimeoutMs: 1_200_000,
    skipTypewriter: false,
  },
  turbo: {
    timeScale: 20,
    actionDelayMs: 30,
    sceneStallMs: 6_000,
    runTimeoutMs: 120_000,
    skipTypewriter: true,
  },
  record: {
    timeScale: 5,
    actionDelayMs: 250,
    sceneStallMs: 30_000,
    runTimeoutMs: 600_000,
    skipTypewriter: false,
  },
  // 2m30s promo/demo recording: realtime directions, readable 1.8s action
  // cadence, full typewriter, and a per-node schedule that lands on 150s.
  video: {
    timeScale: 1,
    actionDelayMs: 1_800,
    sceneStallMs: 90_000,
    runTimeoutMs: 200_000,
    skipTypewriter: false,
    targetDurationSec: 150,
  },
};

const POLL_INTERVAL_MS = 150;
const NODE_COUNT = 15;
/** Hover → dotted docking → submit beat before a staged cinematic action fires. */
export const CINEMATIC_LEAD_MS = 1_500;

/** Earliest run offset (ms) at which node `nodeIndex` may leave the strip. */
export function videoNodeGateMs(
  nodeIndex: number,
  targetDurationSec: number,
  nodeCount: number = NODE_COUNT,
): number {
  if (!Number.isFinite(nodeIndex) || nodeIndex < 0) return 0;
  return Math.max(0, Math.floor((targetDurationSec * 1000 * nodeIndex) / nodeCount));
}

interface NodeProgress {
  readonly index: number;
  readonly nodeId: string;
  readonly kind: AutoplayNodeReport['kind'];
  readonly ref: string;
  readonly startedAt: number;
  readonly flagsBefore: Readonly<Record<string, boolean | number | string>>;
  submissions: number;
  turns: number;
  grade?: string;
  rewardOffered?: readonly string[];
  rewardClaimed?: string;
  readonly warnings: string[];
}

function formatConsoleArg(value: unknown): string {
  if (typeof value === 'string') return value;
  if (value instanceof Error) return value.message;
  try {
    return JSON.stringify(value) ?? String(value);
  } catch {
    return String(value);
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * L2 in-page autoplay: drives the real screens through the bootstrap-owned
 * AutoplayPort (input bypass only — rendering, directions, and typography all
 * run for real). Failures are reported, never worked around: a scene that
 * stops responding, a flow error, or a submission-cap overrun ends the run
 * with a FAIL report in window.__DD_AUTOPLAY_REPORT__ and document.title.
 */
export function startAutoplay(port: AutoplayPort, options: AutoplayOptions): void {
  const config = MODE_CONFIGS[options.mode];
  const balance = BalanceSchema.parse(balanceJson);
  const cards = CardsSchema.parse(cardsJson);
  const fuzzRng = createFuzzRng(options.seed >>> 0);
  const hud = createAutoplayHud();
  const startedAt = Date.now();

  const consoleErrors: string[] = [];
  const missingAssetKeys: string[] = [];
  const rawI18nKeys = new Set<string>();
  const nodes: AutoplayNodeReport[] = [];

  let finished = false;
  let failure: string | undefined;
  let endingId: string | undefined;
  let currentNode: NodeProgress | undefined;
  let lastScene: AutoplayScene | undefined;
  let lastActedScene: AutoplayScene | undefined;
  let lastProgressAt = startedAt;
  let lastActionAt = 0;
  let directionSince: number | undefined;
  let stagedActionTimer: number | undefined;
  let currentEncounterId: string | undefined;
  let encounterSubmissions = 0;
  let encounterTurnLimit = 0;
  let proofPaths: readonly ProofPathStep[] = [];

  const originalConsoleError = console.error.bind(console);
  const originalConsoleWarn = console.warn.bind(console);
  console.error = (...args: unknown[]): void => {
    consoleErrors.push(args.map(formatConsoleArg).join(' '));
    originalConsoleError(...args);
  };
  console.warn = (...args: unknown[]): void => {
    const message = args.map(formatConsoleArg).join(' ');
    if (/asset/iu.test(message)) missingAssetKeys.push(message);
    originalConsoleWarn(...args);
  };

  const finalizeNode = (): void => {
    const progress = currentNode;
    if (progress === undefined) return;
    currentNode = undefined;
    const snapshot = port.runSnapshot();
    const flagsAfter = snapshot.flags;
    const gradeRecord = snapshot.gradeHistory.find(
      (record) => record.nodeId === progress.nodeId,
    );
    const flagsSet = Object.keys(flagsAfter).filter(
      (key) => flagsAfter[key] !== progress.flagsBefore[key],
    );
    nodes.push({
      index: progress.index,
      nodeId: progress.nodeId,
      kind: progress.kind,
      ref: progress.ref,
      submissions: progress.submissions,
      turns: progress.turns,
      ...(gradeRecord === undefined ? {} : { outcome: gradeRecord.outcome }),
      ...(gradeRecord?.grade === undefined
        ? (progress.grade === undefined ? {} : { grade: progress.grade })
        : { grade: gradeRecord.grade }),
      ...(progress.rewardOffered === undefined
        ? {}
        : { rewardOffered: progress.rewardOffered }),
      ...(progress.rewardClaimed === undefined
        ? {}
        : { rewardClaimed: progress.rewardClaimed }),
      flagsSet,
      durationMs: Math.round(Date.now() - progress.startedAt),
      warnings: [...progress.warnings],
    });
  };

  const updateHud = (sceneKind: string, status: string): void => {
    hud.update({
      nodeIndex: port.runSnapshot().nodeIndex,
      nodeCount: NODE_COUNT,
      sceneKind,
      mode: options.mode,
      policy: options.policy,
      seed: options.seed,
      elapsedMs: Date.now() - startedAt,
      status,
      ...(failure === undefined ? {} : { failure }),
      ...(config.targetDurationSec === undefined
        ? {}
        : {
            targetDurationMs: config.targetDurationSec * 1000,
            ...(currentNode === undefined
              ? {}
              : { nodeLabel: t(`node.${currentNode.ref}`, currentNode.ref) }),
          }),
    });
  };

  // Video mode plays a hover → dotted-docking → submit beat before the real
  // action lands so recordings stay readable; other modes act immediately.
  const performWithCinematic = (caption: string, action: () => void): void => {
    if (config.targetDurationSec === undefined) {
      action();
      return;
    }
    hud.showAction(caption);
    stagedActionTimer = window.setTimeout(() => {
      stagedActionTimer = undefined;
      try {
        action();
      } catch (error) {
        fail(`staged action threw: ${errorMessage(error)}`);
      }
    }, CINEMATIC_LEAD_MS);
  };

  const facetLabel = (facet: string): string =>
    t(`facet.${facet.toLowerCase()}`, facet);

  const submissionCaption = (
    scene: InterrogationScene,
    submission: AutoplaySubmission,
  ): string => {
    const card = scene.model.cards.find(
      (candidate) => candidate.cardId === submission.cardId,
    );
    return `${card?.title ?? submission.cardId} → [${facetLabel(submission.facet)}] 도킹`;
  };

  const cinematicScene = (scene: InterrogationScene): InterrogationScene => ({
    ...scene,
    submit: (submission): void => {
      performWithCinematic(submissionCaption(scene, submission), () => {
        scene.submit(submission);
      });
    },
    secureStatement: (): void => {
      performWithCinematic('진술 확보 — 서명 날인', () => {
        scene.secureStatement();
      });
    },
  });

  const finish = (): void => {
    if (finished) return;
    finished = true;
    window.clearInterval(pollTimer);
    if (stagedActionTimer !== undefined) {
      window.clearTimeout(stagedActionTimer);
      stagedActionTimer = undefined;
    }
    unsubscribe();
    console.error = originalConsoleError;
    console.warn = originalConsoleWarn;
    finalizeNode();
    const snapshot = port.runSnapshot();
    const evidence: AutoplayReportEvidence = {
      schemaVersion: AUTOPLAY_REPORT_SCHEMA_VERSION,
      seed: options.seed,
      mode: options.mode,
      policy: options.policy,
      durationMs: Math.round(Date.now() - startedAt),
      nodes: [...nodes],
      ...(endingId === undefined ? {} : { ending: { endingId } }),
      ...(snapshot.terminal ? { terminalMarker: 'RUN_COMPLETED' as const } : {}),
      finalState: {
        nodeIndex: snapshot.nodeIndex,
        terminal: snapshot.terminal,
        dp: snapshot.dp,
        stress: snapshot.stress,
        trust: snapshot.trust,
        flags: { ...snapshot.flags },
        completedNodeIds: [...snapshot.completedNodeIds],
        claimedRewardIds: [...snapshot.claimedRewardIds],
        pendingRewardIds: [...snapshot.pendingRewardIds],
        gradeHistory: snapshot.gradeHistory.map((record) => ({ ...record })),
      },
      consoleErrors: [...consoleErrors],
      missingAssetKeys: [...missingAssetKeys],
      rawI18nKeysSeen: [...rawI18nKeys],
    };
    const invariantFailures = findAutoplayInvariantFailures(evidence);
    failure ??= invariantFailures[0];
    const report: AutoplayReport = {
      ...evidence,
      ...(failure === undefined ? {} : { failure }),
      invariantFailures,
      result: failure === undefined ? 'PASS' : 'FAIL',
    };
    publishReport(report);
    updateHud(endingId === undefined ? 'NONE' : 'ENDING', report.result);
  };

  const fail = (reason: string): void => {
    if (finished) return;
    failure = reason;
    finish();
  };

  const beginNode = (scene: Extract<AutoplayScene, { kind: 'STRIP' }>): void => {
    finalizeNode();
    currentNode = {
      index: scene.nodeIndex,
      nodeId: scene.nodeId,
      kind: scene.nodeKind,
      ref: scene.nodeRef,
      startedAt: Date.now(),
      flagsBefore: { ...port.runSnapshot().flags },
      submissions: 0,
      turns: 0,
      warnings: [],
    };
  };

  const registerSubmission = (): void => {
    encounterSubmissions += 1;
    if (currentNode !== undefined) currentNode.submissions += 1;
  };

  const scanInterrogationStrings = (scene: InterrogationScene): void => {
    const strings = [
      scene.model.suspectName,
      scene.model.partnerName,
      ...scene.model.cards.flatMap((card) => [card.title, card.description]),
      ...scene.model.dto.statement.map((token) => token.text),
      ...scene.model.dto.evidence.map((evidence) => evidence.displayName),
      ...scene.model.dto.objectives.map((objective) => objective.label),
    ];
    for (const key of findRawI18nKeys(strings)) rawI18nKeys.add(key);
  };

  const submissionContext = (scene: InterrogationScene): LegalSubmissionContext => ({
    handCards: scene.model.cards.map((card) => ({
      cardId: card.cardId,
      cpCost:
        scene.cardPlayability[card.cardId]?.effectiveCpCost ?? card.cpCost,
      requiresEvidence: card.requiresEvidence,
      intent: card.intent,
      playable: scene.cardPlayability[card.cardId]?.playable === true,
    })),
    commandPoints: scene.model.dto.resources.commandPoints,
    facets: scene.model.dto.statement.map((token) => token.facet),
    evidenceIds: scene.model.dto.evidence.map((evidence) => evidence.evidenceId),
  });

  const policySubmission = (
    context: LegalSubmissionContext,
  ): AutoplaySubmission | undefined => {
    switch (options.policy) {
      case 'greedy':
        return greedySubmission(context);
      case 'fuzz':
        return fuzzSubmission(context, fuzzRng);
      case 'partial':
        return partialSubmission(context);
      case 'coerced':
        return coercedSubmission(context);
      case 'best':
        return greedySubmission(context);
    }
  };

  const shouldSecure = (): boolean => {
    if (options.policy === 'greedy' || options.policy === 'partial') return true;
    if (options.policy === 'fuzz') return fuzzRng() < 0.25;
    return false;
  };

  const actInterrogation = (scene: InterrogationScene): void => {
    if (scene.encounterId !== currentEncounterId) {
      currentEncounterId = scene.encounterId;
      encounterSubmissions = 0;
      encounterTurnLimit = scene.turnLimit;
      proofPaths =
        options.policy === 'best'
          ? deriveProofPaths(scene.caseDefinition, scene.encounterId, cards, balance)
          : [];
    }
    if (currentNode !== undefined) {
      currentNode.turns = Math.max(currentNode.turns, scene.turn);
    }
    scanInterrogationStrings(scene);
    if (config.skipTypewriter) scene.skipTypewriter();
    const submissionCap = encounterTurnLimit * 2 + 1;
    if (encounterSubmissions >= submissionCap) {
      fail(
        `submission cap ${submissionCap.toString()} reached in ${scene.encounterId}`,
      );
      return;
    }
    if (options.policy === 'best') {
      const nextProofPathIndex = nextIncompleteProofPathIndex(
        proofPaths,
        scene.requiredObjectives,
      );
      const waitingForNonProofObjective = hasIncompleteNonProofObjective(
        proofPaths,
        scene.requiredObjectives,
      );
      if (scene.machineState === 'CHECK_OUTCOME') {
        if (
          scene.secureStatementEnabled &&
          nextProofPathIndex >= proofPaths.length
        ) {
          registerSubmission();
          scene.secureStatement();
        } else {
          scene.endTurn();
        }
        return;
      }
      if (
        nextProofPathIndex >= proofPaths.length &&
        waitingForNonProofObjective
      ) {
        const filler = bestFillerSubmission(submissionContext(scene));
        if (filler === undefined) {
          fail(`best policy has no neutral turn filler in ${scene.encounterId}`);
          return;
        }
        registerSubmission();
        scene.submit(filler);
        return;
      }
      const action = planBestLiveAction(
        proofPaths,
        nextProofPathIndex,
        scene.secureStatementEnabled,
        submissionContext(scene),
        cards,
      );
      if (action.kind === 'BLOCKED') {
        fail(`best policy blocked in ${scene.encounterId}: ${action.reason}`);
        return;
      }
      if (action.kind === 'SECURE') {
        registerSubmission();
        scene.secureStatement();
        return;
      }
      registerSubmission();
      scene.submit(action.submission);
      return;
    }
    if (scene.secureStatementEnabled && shouldSecure()) {
      registerSubmission();
      scene.secureStatement();
      return;
    }
    const submission = policySubmission(submissionContext(scene));
    if (submission === undefined) {
      // No legal move: never mask a soft-lock — leave the scene untouched and
      // let the stall watchdog report it.
      currentNode?.warnings.push(
        `no legal submission in ${scene.encounterId} on turn ${scene.turn.toString()}`,
      );
      return;
    }
    registerSubmission();
    scene.submit(submission);
  };

  const act = (scene: AutoplayScene): void => {
    lastActedScene = scene;
    lastActionAt = Date.now();
    lastProgressAt = Date.now();
    try {
      switch (scene.kind) {
        case 'STRIP':
          beginNode(scene);
          scene.continue();
          break;
        case 'EVENT':
          if (scene.pattern === 'A') {
            const choiceId = chooseEventChoice(scene.eventId, scene.choiceIds);
            if (choiceId === undefined) {
              fail(`event ${scene.eventId} offers no choices`);
              break;
            }
            performWithCinematic('선택지 결정', () => {
              scene.choose(choiceId);
            });
          } else if (scene.pattern === 'B') {
            performWithCinematic('연결 배치 제출', () => {
              scene.submitPlacement(scene.answerMapping);
            });
          } else {
            const spotId = scene.spotIds.find(
              (candidate) => !scene.discoveredSpotIds.includes(candidate),
            );
            if (spotId === undefined) {
              fail(`event ${scene.eventId} has no undiscovered spot left`);
              break;
            }
            performWithCinematic('현장 조사', () => {
              scene.investigate(spotId);
            });
          }
          break;
        case 'EVENT_RESULT':
          scene.continue();
          break;
        case 'INTERROGATION':
          actInterrogation(
            config.targetDurationSec === undefined ? scene : cinematicScene(scene),
          );
          break;
        case 'REWARD': {
          const rewardId = chooseReward(
            scene.rewardIds,
            port.runSnapshot().claimedRewardIds,
          );
          if (rewardId === undefined) {
            fail('reward scene offered no choices');
            break;
          }
          if (currentNode !== undefined) {
            currentNode.grade = scene.grade;
            currentNode.rewardOffered = [...scene.rewardIds];
            currentNode.rewardClaimed = rewardId;
          }
          performWithCinematic('보상 카드 선택', () => {
            scene.select(rewardId);
          });
          break;
        }
        case 'ENDING':
          endingId = scene.endingId;
          finish();
          break;
        case 'DIRECTION':
          break;
      }
    } catch (error) {
      fail(`action threw on ${scene.kind}: ${errorMessage(error)}`);
    }
  };

  const tick = (): void => {
    if (finished) return;
    const flowError = port.lastFlowError();
    if (flowError !== undefined && flowError !== '') {
      fail(`flow error: ${flowError}`);
      return;
    }
    const now = Date.now();
    if (now - startedAt > config.runTimeoutMs) {
      fail(`run timeout after ${config.runTimeoutMs.toString()}ms`);
      return;
    }
    const scene = port.scene();
    updateHud(scene?.kind ?? 'NONE', 'running');
    if (scene !== undefined && scene !== lastScene) {
      lastScene = scene;
      lastProgressAt = now;
    }
    if (scene !== undefined && scene.kind === 'DIRECTION') {
      // Directions share one stable scene instance, so a hung overlay would
      // otherwise idle until the global run timeout instead of failing fast.
      directionSince ??= now;
      if (now - directionSince > config.sceneStallMs) {
        fail(`STALLED on DIRECTION after ${config.sceneStallMs.toString()}ms`);
      }
      return;
    }
    directionSince = undefined;
    if (scene === undefined) return;
    // A staged cinematic beat owns the next action; do not double-act.
    if (stagedActionTimer !== undefined) return;
    if (scene === lastActedScene) {
      if (now - lastProgressAt > config.sceneStallMs) {
        fail(`STALLED on ${scene.kind} after ${config.sceneStallMs.toString()}ms`);
      }
      return;
    }
    if (
      config.targetDurationSec !== undefined &&
      scene.kind === 'STRIP' &&
      now - startedAt < videoNodeGateMs(scene.nodeIndex, config.targetDurationSec)
    ) {
      // Hold fast nodes on the strip so the full run lands on the video budget.
      return;
    }
    if (now - lastActionAt < config.actionDelayMs) return;
    act(scene);
  };

  // Actions always run from timers, never synchronously inside a scene
  // notification, so mount code is never re-entered from its own callbacks.
  const pollTimer = window.setInterval(tick, POLL_INTERVAL_MS);
  const unsubscribe = port.onSceneChange(() => {
    window.setTimeout(tick, 0);
  });
  port.setDirectionTimeScale(config.timeScale);
  window.setTimeout(tick, 0);
}
