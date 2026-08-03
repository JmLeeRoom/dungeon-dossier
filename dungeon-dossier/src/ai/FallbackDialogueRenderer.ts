import type { DialogueRequest } from '../dto';
import type { DialogueRenderer } from './DialogueRenderer';

export type FallbackLineCatalog = Readonly<Record<string, readonly string[]>>;

export class FallbackDialogueRenderer implements DialogueRenderer {
  readonly #lines: FallbackLineCatalog;

  constructor(lines: FallbackLineCatalog) {
    this.#lines = lines;
  }

  renderStatement(request: DialogueRequest): Promise<string> {
    return Promise.resolve(this.#selectLine(request));
  }

  renderReaction(request: DialogueRequest): Promise<string> {
    return Promise.resolve(this.#selectLine(request));
  }

  #selectLine(request: DialogueRequest): string {
    const candidates = this.#lines[request.reactionKey];
    if (candidates === undefined || candidates.length === 0) {
      throw new Error(`Missing fallback dialogue for reaction: ${request.reactionKey}`);
    }

    const index = (request.seed >>> 0) % candidates.length;
    return candidates[index] as string;
  }
}

