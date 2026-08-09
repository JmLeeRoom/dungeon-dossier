import { StringsSchema, type StringsDefinition } from './schemas';
import {
  ValidatedRuntimeJsonRepository,
  type ValidatedRepositoryOptions,
} from './RuntimeJsonRepository';
import { runtimeContentUrl } from './runtimeContentUrl';

/** Loads the localization string table used by every presentation mapper. */
export class StringsRepository {
  readonly #repository: ValidatedRuntimeJsonRepository<StringsDefinition>;

  constructor(options: ValidatedRepositoryOptions = {}) {
    this.#repository = new ValidatedRuntimeJsonRepository(StringsSchema, options);
  }

  async load(
    url = runtimeContentUrl('common/strings.ko.json'),
  ): Promise<StringsDefinition | undefined> {
    return this.#repository.load(url);
  }
}
