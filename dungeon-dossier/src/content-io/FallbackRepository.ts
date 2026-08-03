import { DialogueSchema, type DialogueDefinition } from './schemas';
import {
  ValidatedRuntimeJsonRepository,
  type ValidatedRepositoryOptions,
} from './RuntimeJsonRepository';

const SAFE_FILE_STEM = /^[a-z0-9][a-z0-9_-]*$/;

function safeSegment(value: string, label: string): string {
  if (!SAFE_FILE_STEM.test(value)) {
    throw new Error(`${label} must be a lowercase content path segment.`);
  }
  return encodeURIComponent(value);
}

export class FallbackRepository {
  readonly #repository: ValidatedRuntimeJsonRepository<DialogueDefinition>;

  constructor(options: ValidatedRepositoryOptions = {}) {
    this.#repository = new ValidatedRuntimeJsonRepository(DialogueSchema, options);
  }

  load(caseDirectory: string): Promise<DialogueDefinition | undefined> {
    const safeCase = safeSegment(caseDirectory, 'caseDirectory');
    return this.#repository.load(`/content/cases/${safeCase}/dialogue.json`);
  }

  loadEncounter(
    caseDirectory: string,
    dialogueFile: string,
  ): Promise<DialogueDefinition | undefined> {
    const safeCase = safeSegment(caseDirectory, 'caseDirectory');
    const safeFile = safeSegment(dialogueFile, 'dialogueFile');
    return this.#repository.load(
      `/content/cases/${safeCase}/dialogue/${safeFile}.json`,
    );
  }
}
