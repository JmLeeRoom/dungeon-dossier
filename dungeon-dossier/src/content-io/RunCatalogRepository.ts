import {
  EnhancementsSchema,
  FlagsSchema,
  GradesSchema,
  RelicsSchema,
  RewardsSchema,
  type EnhancementsDefinition,
  type FlagsDefinition,
  type GradesDefinition,
  type RelicsDefinition,
  type RewardsDefinition,
} from './schemas';
import {
  ValidatedRuntimeJsonRepository,
  type ValidatedRepositoryOptions,
} from './RuntimeJsonRepository';
import { runtimeContentUrl } from './runtimeContentUrl';

export interface RunCatalogDefinition {
  readonly flags: FlagsDefinition;
  readonly grades: GradesDefinition;
  readonly rewards: RewardsDefinition;
  readonly relics: RelicsDefinition;
  readonly enhancements: EnhancementsDefinition;
}

/** Loads the catalogues needed at every run boundary as one unit. */
export class RunCatalogRepository {
  readonly #flags: ValidatedRuntimeJsonRepository<FlagsDefinition>;
  readonly #grades: ValidatedRuntimeJsonRepository<GradesDefinition>;
  readonly #rewards: ValidatedRuntimeJsonRepository<RewardsDefinition>;
  readonly #relics: ValidatedRuntimeJsonRepository<RelicsDefinition>;
  readonly #enhancements: ValidatedRuntimeJsonRepository<EnhancementsDefinition>;

  constructor(options: ValidatedRepositoryOptions = {}) {
    this.#flags = new ValidatedRuntimeJsonRepository(FlagsSchema, options);
    this.#grades = new ValidatedRuntimeJsonRepository(GradesSchema, options);
    this.#rewards = new ValidatedRuntimeJsonRepository(RewardsSchema, options);
    this.#relics = new ValidatedRuntimeJsonRepository(RelicsSchema, options);
    this.#enhancements = new ValidatedRuntimeJsonRepository(EnhancementsSchema, options);
  }

  async load(): Promise<RunCatalogDefinition | undefined> {
    const [flags, grades, rewards, relics, enhancements] = await Promise.all([
      this.#flags.load(runtimeContentUrl('common/flags.json')),
      this.#grades.load(runtimeContentUrl('common/grades.json')),
      this.#rewards.load(runtimeContentUrl('common/rewards.json')),
      this.#relics.load(runtimeContentUrl('common/relics.json')),
      this.#enhancements.load(runtimeContentUrl('common/enhancements.json')),
    ]);
    if (
      flags === undefined ||
      grades === undefined ||
      rewards === undefined ||
      relics === undefined ||
      enhancements === undefined
    ) {
      return undefined;
    }
    return { flags, grades, rewards, relics, enhancements };
  }
}
