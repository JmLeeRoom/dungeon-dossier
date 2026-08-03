import type { DialogueRequest } from '../dto';

export interface DialogueRenderer {
  renderStatement(request: DialogueRequest): Promise<string>;
  renderReaction(request: DialogueRequest): Promise<string>;
}

