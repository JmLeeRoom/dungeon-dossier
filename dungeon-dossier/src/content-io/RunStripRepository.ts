import { RunStripSchema, type RunStripDefinition } from './schemas';
import {
  ValidatedRuntimeJsonRepository,
  type ValidatedRepositoryOptions,
} from './RuntimeJsonRepository';
import { runtimeContentUrl } from './runtimeContentUrl';

/** Loads the canonical, data-owned 15-node run order. */
export class RunStripRepository {
  readonly #repository: ValidatedRuntimeJsonRepository<RunStripDefinition>;

  constructor(options: ValidatedRepositoryOptions = {}) {
    this.#repository = new ValidatedRuntimeJsonRepository(RunStripSchema, options);
  }

  load(): Promise<RunStripDefinition | undefined> {
    return this.#repository.load(runtimeContentUrl('common/run-strip.json'));
  }
}
