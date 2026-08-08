import {
  EPISODE_NODE_COUNT,
  RunStripSchema,
  type ContentId,
  type RunEpisodeDefinition,
  type RunNodeKind,
  type RunSlotRole,
  type RunStripDefinition,
  type RunStripSlotDefinition,
} from '../domain';

export interface NodeDefinition {
  readonly nodeId: ContentId;
  readonly kind: RunNodeKind;
  readonly ref: ContentId;
  readonly caseDirectory: string;
  /** Episode this node was resolved into. */
  readonly episodeId: string;
  /** Zero-based episode position; equals the episode's `sequence_index`. */
  readonly episodeIndex: number;
  /** Which of the episode's three stages this node fills. */
  readonly slotRole: RunSlotRole;
  /** 0, 1 or 2 within the episode. */
  readonly slotIndex: number;
}

export interface EpisodeDefinitionView {
  readonly episodeId: string;
  readonly episodeIndex: number;
  readonly caseDirectory: string;
  /** Index of this episode's first node in the resolved route. */
  readonly startNodeIndex: number;
}

export interface ResolveRunRouteOptions {
  /**
   * Run seed. Omitted resolves the canonical route (every slot takes its first
   * candidate), which is what content validation and fixtures rely on.
   */
  readonly seed?: number;
}

/**
 * Self-contained mulberry32 step. The run layer may not depend on engine/rng,
 * so topology selection carries its own stream exactly as RewardSystem does.
 */
function nextTopologyRandom(seedStream: number): Readonly<{
  value: number;
  seedStream: number;
}> {
  const next = (seedStream + 0x6d2b79f5) >>> 0;
  let mixed = next;
  mixed = Math.imul(mixed ^ (mixed >>> 15), mixed | 1);
  mixed ^= mixed + Math.imul(mixed ^ (mixed >>> 7), mixed | 61);
  return {
    value: ((mixed ^ (mixed >>> 14)) >>> 0) / 4294967296,
    seedStream: next,
  };
}

function selectCandidateIndex(
  slot: RunStripSlotDefinition,
  seeded: boolean,
  seedStream: number,
): Readonly<{ index: number; seedStream: number }> {
  if (!seeded || slot.selection === 'FIXED' || slot.candidates.length === 1) {
    return { index: 0, seedStream };
  }
  const step = nextTopologyRandom(seedStream);
  const index = Math.min(
    slot.candidates.length - 1,
    Math.floor(step.value * slot.candidates.length),
  );
  return { index, seedStream: step.seedStream };
}

function resolveEpisode(
  episode: RunEpisodeDefinition,
  seeded: boolean,
  initialSeedStream: number,
): Readonly<{ nodes: readonly NodeDefinition[]; seedStream: number }> {
  let seedStream = initialSeedStream;
  const nodes = episode.slots.map((slot, slotIndex) => {
    const selected = selectCandidateIndex(slot, seeded, seedStream);
    seedStream = selected.seedStream;
    const candidate = slot.candidates[selected.index];
    if (candidate === undefined) {
      throw new Error(
        `Run slot ${episode.episode_id}.${slot.role} resolved to an absent candidate.`,
      );
    }
    return Object.freeze({
      nodeId: candidate.node_id,
      kind: candidate.kind,
      ref: candidate.ref,
      caseDirectory: episode.case_directory,
      episodeId: episode.episode_id,
      episodeIndex: episode.sequence_index,
      slotRole: slot.role,
      slotIndex,
    });
  });
  return { nodes, seedStream };
}

/**
 * Validates injected run-strip data and resolves one node per episode slot.
 * The resolved route is always `episodes.length * EPISODE_NODE_COUNT` nodes in
 * declared episode order, so the caller still sees a flat, linear strip.
 */
export function createNodeStrip(
  definition: RunStripDefinition,
  options: ResolveRunRouteOptions = {},
): readonly NodeDefinition[] {
  const parsed = RunStripSchema.parse(definition);
  const seeded = options.seed !== undefined;
  // Dedicated topology stream, derived so it can never collide with the reward
  // stream that RewardSystem folds out of the same run seed.
  let seedStream = ((options.seed ?? 0) ^ 0x5f37_1d29) >>> 0;
  const nodes: NodeDefinition[] = [];
  for (const episode of parsed.episodes) {
    const resolved = resolveEpisode(episode, seeded, seedStream);
    seedStream = resolved.seedStream;
    nodes.push(...resolved.nodes);
  }
  return Object.freeze(nodes);
}

/** Episode boundaries of a resolved route, in play order. */
export function runEpisodes(
  strip: readonly NodeDefinition[],
): readonly EpisodeDefinitionView[] {
  const episodes: EpisodeDefinitionView[] = [];
  strip.forEach((node, index) => {
    if (node.slotIndex !== 0) return;
    episodes.push(Object.freeze({
      episodeId: node.episodeId,
      episodeIndex: node.episodeIndex,
      caseDirectory: node.caseDirectory,
      startNodeIndex: index,
    }));
  });
  return Object.freeze(episodes);
}

export function runEpisodeIds(strip: readonly NodeDefinition[]): readonly string[] {
  return runEpisodes(strip).map((episode) => episode.episodeId);
}

/** Nodes belonging to one episode, in stage order. */
export function episodeNodes(
  strip: readonly NodeDefinition[],
  episodeId: string,
): readonly NodeDefinition[] {
  return strip.filter((node) => node.episodeId === episodeId);
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

/**
 * Episode that owns `nodeIndex`. A completed run clamps to the final episode so
 * ending screens still report where the run finished.
 */
export function episodeIdAt(
  strip: readonly NodeDefinition[],
  nodeIndex: number,
): string {
  assertNodeIndex(strip, nodeIndex);
  const node = strip[Math.min(nodeIndex, strip.length - 1)];
  if (node === undefined) throw new Error('Cannot read an episode from an empty run strip.');
  return node.episodeId;
}

/** True when the node at `nodeIndex` is its episode's BOSS stage. */
export function isEpisodeFinalNode(
  strip: readonly NodeDefinition[],
  nodeIndex: number,
): boolean {
  assertNodeIndex(strip, nodeIndex);
  return strip[nodeIndex]?.slotIndex === EPISODE_NODE_COUNT - 1;
}

/**
 * Episode that follows the one owning `nodeIndex`, or null when that episode is
 * the last. Scans forward for the next *distinct* episode, so it answers the
 * same question from any stage rather than only from an episode boundary.
 */
export function nextEpisodeId(
  strip: readonly NodeDefinition[],
  nodeIndex: number,
): string | null {
  assertNodeIndex(strip, nodeIndex);
  const current = strip[nodeIndex];
  if (current === undefined) return null;
  return (
    strip.slice(nodeIndex + 1).find((node) => node.episodeId !== current.episodeId)
      ?.episodeId ?? null
  );
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
