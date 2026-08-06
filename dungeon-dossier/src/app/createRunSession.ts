import type {
  FlagDefinition,
  GradesDefinition,
  NonCombatEventDefinition,
  RewardsDefinition,
} from '../engine/domain';
import {
  claimRunReward,
  completeEncounterNode,
  completeEventNode,
  type EncounterGradeMetrics,
  type NodeDefinition,
  type RewardRarity,
  type RunEventCompletion,
  type RunNodeCompletion,
  type RunState,
} from '../engine/run';
import type { SaveRepository } from './save/SaveRepository';
import { saveRunAtNodeBoundary } from './save/runSave';

export interface RunSessionOptions {
  readonly initialState: RunState;
  readonly strip: readonly NodeDefinition[];
  readonly flags: readonly FlagDefinition[];
  readonly rewards: RewardsDefinition;
  readonly grades: GradesDefinition;
  readonly saveRepository?: SaveRepository;
  readonly caseIdsByDirectory: Readonly<Record<string, string>>;
  readonly contentVersionsByDirectory?: Readonly<Record<string, string>>;
}

export interface FinishEncounterInput {
  readonly outcome: Parameters<typeof completeEncounterNode>[1]['outcome'];
  readonly rewardRarity: RewardRarity;
  readonly episodeId: string;
  readonly act: number;
  readonly gradeMetrics: EncounterGradeMetrics;
  readonly encounterState?: Parameters<typeof completeEncounterNode>[1]['encounterState'];
  readonly outcomeRewards?: Parameters<typeof completeEncounterNode>[1]['outcomeRewards'];
}

export interface FinishEventInput {
  readonly choiceId?: string;
  readonly eventDefinition: NonCombatEventDefinition;
  readonly placement?: Readonly<Record<string, string>>;
  readonly investigatedSpotIds?: readonly string[];
}

/** App-owned run orchestration. Engine functions stay pure; each boundary auto-saves. */
export class RunSession {
  readonly #options: RunSessionOptions;
  #state: RunState;

  constructor(options: RunSessionOptions) {
    this.#options = options;
    this.#state = options.initialState;
  }

  get snapshot(): RunState {
    return this.#state;
  }

  finishEncounter(input: FinishEncounterInput): RunNodeCompletion {
    const completion = completeEncounterNode(this.#state, {
      strip: this.#options.strip,
      outcome: input.outcome,
      flagDefinitions: this.#options.flags,
      rewardCatalogue: this.#options.rewards,
      rewardRarity: input.rewardRarity,
      episodeId: input.episodeId,
      act: input.act,
      gradeCatalogue: this.#options.grades,
      gradeMetrics: input.gradeMetrics,
      ...(input.encounterState === undefined
        ? {}
        : { encounterState: input.encounterState }),
      ...(input.outcomeRewards === undefined
        ? {}
        : { outcomeRewards: input.outcomeRewards }),
    });
    this.#commit(completion.state);
    return completion;
  }

  finishEvent(input: FinishEventInput): RunEventCompletion {
    const completion = completeEventNode(this.#state, {
      strip: this.#options.strip,
      flagDefinitions: this.#options.flags,
      ...input,
    });
    this.#commit(completion.state);
    return completion;
  }

  claimReward(rewardId: string): RunState {
    const reward = this.#options.rewards.rewards.find(
      (candidate) => candidate.reward_id === rewardId,
    );
    if (reward === undefined) throw new Error(`Unknown reward ${rewardId}.`);
    const nextState = claimRunReward(this.#state, reward);
    this.#commit(nextState);
    return this.#state;
  }

  /** Persist first so a storage failure leaves the retryable in-memory state intact. */
  #commit(nextState: RunState): void {
    const repository = this.#options.saveRepository;
    if (repository === undefined) {
      this.#state = nextState;
      return;
    }
    const nodeIndex = Math.min(
      nextState.nodeIndex,
      this.#options.strip.length - 1,
    );
    const directory = this.#options.strip[nodeIndex]?.caseDirectory;
    if (directory === undefined) throw new Error('Cannot save an empty run strip.');
    const caseId = this.#options.caseIdsByDirectory[directory];
    if (caseId === undefined) {
      throw new Error(`Missing case ID metadata for ${directory}.`);
    }
    saveRunAtNodeBoundary(repository, nextState, {
      caseId,
      contentVersion:
        this.#options.contentVersionsByDirectory?.[directory] ?? '1.0',
    });
    this.#state = nextState;
  }
}

export function createRunSession(options: RunSessionOptions): RunSession {
  return new RunSession(options);
}
