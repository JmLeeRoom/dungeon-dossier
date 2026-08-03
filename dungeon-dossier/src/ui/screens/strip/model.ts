export type RunStripNodeKind = 'ENCOUNTER' | 'EVENT' | 'BOSS';
export type RunStripNodeStatus = 'CLEARED' | 'CURRENT' | 'LOCKED';

export interface RunStripNodeView {
  readonly nodeId: string;
  readonly kind: RunStripNodeKind;
  readonly label: string;
  readonly status: RunStripNodeStatus;
}

export interface RunStripScreenModel {
  readonly title: string;
  readonly nodes: readonly RunStripNodeView[];
  readonly currentIndex: number;
}

export function createRunStripModel(
  nodes: readonly Omit<RunStripNodeView, 'status'>[],
  currentIndex: number,
  title = '수사 진행 기록',
): RunStripScreenModel {
  if (nodes.length !== 15) throw new Error('The run strip must contain exactly 15 nodes.');
  if (!Number.isInteger(currentIndex) || currentIndex < 0 || currentIndex >= nodes.length) {
    throw new RangeError('Run strip currentIndex is outside the 15-node strip.');
  }
  return {
    title,
    currentIndex,
    nodes: nodes.map((node, index) => ({
      ...node,
      status: index < currentIndex ? 'CLEARED' : index === currentIndex ? 'CURRENT' : 'LOCKED',
    })),
  };
}
