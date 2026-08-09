import { CaseSchema, type CaseDefinition } from './schemas';
import {
  ValidatedRuntimeJsonRepository,
  type ValidatedRepositoryOptions,
} from './RuntimeJsonRepository';
import { SchemaValidator } from './SchemaValidator';
import { runtimeContentUrl } from './runtimeContentUrl';

export interface CaseRepositoryOptions extends ValidatedRepositoryOptions {
  /** IDs defined by common catalogues (cards, partner skills, flags, relics). */
  readonly externalIds?: ReadonlySet<string>;
}

export class CaseRepository {
  readonly #repository: ValidatedRuntimeJsonRepository<CaseDefinition>;
  readonly #validator: SchemaValidator;
  readonly #externalIds: ReadonlySet<string> | undefined;

  constructor(options: CaseRepositoryOptions = {}) {
    const { externalIds, ...repositoryOptions } = options;
    this.#validator = options.validator ?? new SchemaValidator();
    this.#externalIds = externalIds;
    this.#repository = new ValidatedRuntimeJsonRepository(CaseSchema, {
      ...repositoryOptions,
      validator: this.#validator,
    });
  }

  load(caseDirectory: string): Promise<CaseDefinition | undefined> {
    const safeDirectory = encodeURIComponent(caseDirectory);
    return this.#repository.load(
      runtimeContentUrl(`cases/${safeDirectory}/case.json`),
      (data, source) =>
        this.#validator.validateTier1Case(data, source, {
          ...(this.#externalIds ? { externalIds: this.#externalIds } : {}),
        }),
    );
  }
}
