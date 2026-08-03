import {
  RunStripSchema,
  type ContentId,
  type RunNodeKind,
  type RunStripDefinition,
} from '../domain';

export interface NodeDefinition {
  readonly nodeId: ContentId;
  readonly kind: RunNodeKind;
  readonly ref: ContentId;
  readonly caseDirectory: string;
}

/** Validates injected run-strip data and preserves its declared array order. */
export function createNodeStrip(
  definition: RunStripDefinition,
): readonly NodeDefinition[] {
  const parsed = RunStripSchema.parse(definition);
  return parsed.nodes.map((node) => Object.freeze({
    nodeId: node.node_id,
    kind: node.kind,
    ref: node.ref,
    caseDirectory: node.case_directory,
  }));
}

function assertNodeIndex(strip: readonly NodeDefinition[], nodeIndex: number): void {
  if (!Number.isInteger(nodeIndex) || nodeIndex < 0 || nodeIndex > strip.length) {
    throw new RangeError('Run node index must be an integer within the strip bounds.');
  }
}

export function currentRunNode(
  strip: readonly NodeDefinition[],
  nodeIndex: number,
): NodeDefinition | null {
  assertNodeIndex(strip, nodeIndex);
  return strip[nodeIndex] ?? null;
}

/** Linear index advancement is the only run-strip transition. */
export function advanceRunNodeIndex(
  strip: readonly NodeDefinition[],
  nodeIndex: number,
): number {
  assertNodeIndex(strip, nodeIndex);
  if (nodeIndex === strip.length) throw new Error('The run strip is already complete.');
  return nodeIndex + 1;
}

export function isRunStripComplete(
  strip: readonly NodeDefinition[],
  nodeIndex: number,
): boolean {
  assertNodeIndex(strip, nodeIndex);
  return nodeIndex === strip.length;
}
