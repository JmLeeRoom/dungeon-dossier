import {
  FlagsSchema,
  GradesSchema,
  RewardsSchema,
  type FlagsDefinition,
  type GradesDefinition,
  type RewardsDefinition,
} from './schemas';
import {
  ValidatedRuntimeJsonRepository,
  type ValidatedRepositoryOptions,
} from './RuntimeJsonRepository';

export interface RunCatalogDefinition {
  readonly flags: FlagsDefinition;
  readonly grades: GradesDefinition;
  readonly rewards: RewardsDefinition;
}

/** Loads the three catalogues needed at every run boundary as one unit. */
export class RunCatalogRepository {
  readonly #flags: ValidatedRuntimeJsonRepository<FlagsDefinition>;
  readonly #grades: ValidatedRuntimeJsonRepository<GradesDefinition>;
  readonly #rewards: ValidatedRuntimeJsonRepository<RewardsDefinition>;

  constructor(options: ValidatedRepositoryOptions = {}) {
    this.#flags = new ValidatedRuntimeJsonRepository(FlagsSchema, options);
    this.#grades = new ValidatedRuntimeJsonRepository(GradesSchema, options);
    this.#rewards = new ValidatedRuntimeJsonRepository(RewardsSchema, options);
  }

  async load(): Promise<RunCatalogDefinition | undefined> {
    const [flags, grades, rewards] = await Promise.all([
      this.#flags.load('/content/common/flags.json'),
      this.#grades.load('/content/common/grades.json'),
      this.#rewards.load('/content/common/rewards.json'),
    ]);
    if (flags === undefined || grades === undefined || rewards === undefined) {
      return undefined;
    }
    return { flags, grades, rewards };
  }
}
