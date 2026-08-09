import { JudgmentUiMapSchema, type JudgmentUiMapDefinition } from './schemas';
import {
  ValidatedRuntimeJsonRepository,
  type ValidatedRepositoryOptions,
} from './RuntimeJsonRepository';
import { runtimeContentUrl } from './runtimeContentUrl';

/**
 * Loads the authored judgment presentation map: the label and feedback string
 * keys the interrogation screen quotes back after a submission.
 */
export class JudgmentUiMapRepository {
  readonly #repository: ValidatedRuntimeJsonRepository<JudgmentUiMapDefinition>;

  constructor(options: ValidatedRepositoryOptions = {}) {
    this.#repository = new ValidatedRuntimeJsonRepository(JudgmentUiMapSchema, options);
  }

  load(): Promise<JudgmentUiMapDefinition | undefined> {
    return this.#repository.load(runtimeContentUrl('common/judgment-ui-map.json'));
  }
}
