import { RunStripSchema, type RunStripDefinition } from './schemas';
import {
  ValidatedRuntimeJsonRepository,
  type ValidatedRepositoryOptions,
} from './RuntimeJsonRepository';

/** Loads the canonical, data-owned 15-node run order. */
export class RunStripRepository {
  readonly #repository: ValidatedRuntimeJsonRepository<RunStripDefinition>;

  constructor(options: ValidatedRepositoryOptions = {}) {
    this.#repository = new ValidatedRuntimeJsonRepository(RunStripSchema, options);
  }

  load(): Promise<RunStripDefinition | undefined> {
    return this.#repository.load('/content/common/run-strip.json');
  }
}
