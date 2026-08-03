import { CardsSchema, type CardsDefinition } from './schemas';
import {
  ValidatedRuntimeJsonRepository,
  type ValidatedRepositoryOptions,
} from './RuntimeJsonRepository';

export class CardRepository {
  readonly #repository: ValidatedRuntimeJsonRepository<CardsDefinition>;

  constructor(options: ValidatedRepositoryOptions = {}) {
    this.#repository = new ValidatedRuntimeJsonRepository(CardsSchema, options);
  }

  load(): Promise<CardsDefinition | undefined> {
    return this.#repository.load('/content/common/cards.json');
  }
}
