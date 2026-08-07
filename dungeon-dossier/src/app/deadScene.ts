import type { OutcomeReason } from '../engine/encounter';
import type { RunState } from '../engine/run';
import type {
  DeadSceneAction,
  DeadSceneScreenModel,
  DeadSceneTreatment,
} from '../ui/screens/ending';
import { t } from './i18n';

/**
 * The four ways an encounter ends in `FAILED`. `OutcomeReason` also carries
 * non-failure reasons, so the dead-scene table narrows to just these.
 */
export const FAILURE_REASONS = [
  'STRESS_DEPLETED',
  'COERCION_LIMIT_EXCEEDED',
  'TURN_LIMIT_EXCEEDED',
  'NO_SOLVABLE_PATH',
] as const;

export type FailureReason = Extract<OutcomeReason, (typeof FAILURE_REASONS)[number]>;

export function isFailureReason(reason: OutcomeReason): reason is FailureReason {
  return (FAILURE_REASONS as readonly string[]).includes(reason);
}

export interface DeadScenePreset {
  readonly illustrationAssetKey: string;
  readonly titleKey: string;
  readonly causeKey: string;
  readonly audioCue: string;
  readonly treatment: DeadSceneTreatment;
}

/**
 * Defeat presentation is selected by data, mirroring how judgment and ending
 * directions are chosen. Renderers never branch on a reason id.
 */
export const DEAD_SCENE_TABLE: Readonly<Record<FailureReason, DeadScenePreset>> = {
  STRESS_DEPLETED: {
    illustrationAssetKey: 'dead/과로/기본',
    titleKey: 'dead.stress.title',
    causeKey: 'dead.stress.cause',
    audioCue: 'sting_collapse',
    treatment: 'SLOW_FADE',
  },
  COERCION_LIMIT_EXCEEDED: {
    illustrationAssetKey: 'dead/징계/기본',
    titleKey: 'dead.coercion.title',
    causeKey: 'dead.coercion.cause',
    audioCue: 'sting_gavel',
    treatment: 'FLASH',
  },
  TURN_LIMIT_EXCEEDED: {
    illustrationAssetKey: 'dead/시한/기본',
    titleKey: 'dead.turn.title',
    causeKey: 'dead.turn.cause',
    audioCue: 'sting_clock',
    treatment: 'FADE_OUT',
  },
  NO_SOLVABLE_PATH: {
    illustrationAssetKey: 'dead/미제/기본',
    titleKey: 'dead.unsolvable.title',
    causeKey: 'dead.unsolvable.cause',
    audioCue: 'sting_file_close',
    treatment: 'SLOW_FADE',
  },
};

export const DEAD_SCENE_RETRY_ACTION = 'RETRY';
export const DEAD_SCENE_RETURN_ACTION = 'RETURN';

export interface DeadSceneContext {
  readonly reason: FailureReason;
  readonly state: Pick<
    RunState,
    'nodeIndex' | 'acquiredEvidenceIds' | 'completedNodeIds' | 'stress' | 'retryCount'
  >;
  readonly totalNodes: number;
  readonly coercion: number;
  readonly retryLimit: number;
}

export function toDeadSceneModel(context: DeadSceneContext): DeadSceneScreenModel {
  const preset = DEAD_SCENE_TABLE[context.reason];
  const retriesLeft = Math.max(0, context.retryLimit - context.state.retryCount);
  const retry: DeadSceneAction = {
    actionId: DEAD_SCENE_RETRY_ACTION,
    label: t('dead.action.retry', '재시도'),
    enabled: retriesLeft > 0,
    ...(retriesLeft > 0
      ? {}
      : { disabledReason: t('dead.action.retry_exhausted', '재시도 횟수 소진') }),
  };
  return {
    title: t(preset.titleKey),
    cause: t(preset.causeKey),
    illustrationAssetKey: preset.illustrationAssetKey,
    treatment: preset.treatment,
    stats: [
      {
        label: t('dead.stat.node', '도달 노드'),
        value: `${String(context.state.nodeIndex + 1)} / ${String(context.totalNodes)}`,
      },
      {
        label: t('dead.stat.cleared', '해결한 노드'),
        value: String(context.state.completedNodeIds.length),
      },
      {
        label: t('dead.stat.evidence', '확보 증거'),
        value: String(context.state.acquiredEvidenceIds.length),
      },
      {
        label: t('dead.stat.coercion', '누적 강압'),
        value: String(Math.round(context.coercion)),
      },
      {
        label: t('dead.stat.retries', '남은 재시도'),
        value: `${String(retriesLeft)} / ${String(context.retryLimit)}`,
      },
    ],
    actions: [
      retry,
      {
        actionId: DEAD_SCENE_RETURN_ACTION,
        label: t('dead.action.return', '진행 기록으로'),
        enabled: true,
      },
    ],
  };
}
