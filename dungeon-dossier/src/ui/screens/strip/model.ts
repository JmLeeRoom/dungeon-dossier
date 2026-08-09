export type RunStripNodeKind = 'ENCOUNTER' | 'EVENT' | 'BOSS';
export type EpisodeSlotRole = 'COMBAT' | 'EVENT' | 'BOSS';
export type EpisodeNodeStatus = 'CLEARED' | 'CURRENT' | 'AVAILABLE';

/**
 * A slot the player may see. `VEILED` carries no label, kind or ref, so future
 * content cannot leak through the renderer, autoplay telemetry or the
 * accessibility tree — the redaction happens here, not at draw time.
 */
export type EpisodeNodeView =
  | {
      readonly visibility: 'KNOWN';
      readonly nodeId: string;
      readonly kind: RunStripNodeKind;
      readonly role: EpisodeSlotRole;
      readonly label: string;
      readonly status: EpisodeNodeStatus;
      /**
       * Only a KNOWN slot may carry art. The VEILED arm has no such field, so
       * a future node's photograph cannot be produced, preloaded or logged.
       */
      readonly artAssetKey?: string;
    }
  | {
      readonly visibility: 'VEILED';
      readonly role: EpisodeSlotRole;
    };

export interface EpisodeSummaryView {
  readonly episodeId: string;
  readonly displayIndex: number;
  readonly label: string;
}

export interface RunStripScreenModel {
  readonly title: string;
  /** Episode the board is focused on. */
  readonly episodeId: string;
  /** 1-based position shown to the player. */
  readonly episodeDisplayIndex: number;
  readonly episodeCount: number;
  readonly episodeLabel: string;
  /** Exactly the three stages of the active episode. */
  readonly nodes: readonly [EpisodeNodeView, EpisodeNodeView, EpisodeNodeView];
  /** Cleared episodes, oldest first; rendered as small stamps, not as nodes. */
  readonly clearedEpisodes: readonly EpisodeSummaryView[];
  /** Present while a later episode exists; never names it. */
  readonly nextEpisodeVeiled: boolean;
  /** Index of the active stage inside the episode. */
  readonly activeSlotIndex: number;
}

export const EPISODE_BOARD_SLOT_COUNT = 3;

export interface EpisodeBoardNodeInput {
  readonly nodeId: string;
  readonly kind: RunStripNodeKind;
  readonly role: EpisodeSlotRole;
  readonly label: string;
  readonly artAssetKey?: string;
}

export interface EpisodeBoardInput {
  readonly episodeId: string;
  readonly episodeLabel: string;
  readonly episodeDisplayIndex: number;
  readonly episodeCount: number;
  readonly nodes: readonly EpisodeBoardNodeInput[];
  /** Stage the player stands on, 0-2. */
  readonly activeSlotIndex: number;
  readonly clearedEpisodes?: readonly EpisodeSummaryView[];
  readonly hasNextEpisode: boolean;
  /**
   * Reveals the whole active episode at once instead of stage by stage. The
   * data shape is identical either way, so this stays a pure UX switch.
   */
  readonly revealWholeEpisode?: boolean;
  readonly title?: string;
}

/**
 * Builds the focused board. Stages after the active one are veiled unless the
 * episode is revealed whole; every later episode is a single unnamed marker.
 */
export function createRunStripModel(input: EpisodeBoardInput): RunStripScreenModel {
  if (input.nodes.length !== EPISODE_BOARD_SLOT_COUNT) {
    throw new Error('An episode board must contain exactly 3 stages.');
  }
  if (
    !Number.isInteger(input.activeSlotIndex) ||
    input.activeSlotIndex < 0 ||
    input.activeSlotIndex >= EPISODE_BOARD_SLOT_COUNT
  ) {
    throw new RangeError('Episode board activeSlotIndex must be 0, 1 or 2.');
  }

  const nodes = input.nodes.map((node, index): EpisodeNodeView => {
    if (index < input.activeSlotIndex) {
      return { visibility: 'KNOWN', ...node, status: 'CLEARED' };
    }
    if (index === input.activeSlotIndex) {
      return { visibility: 'KNOWN', ...node, status: 'CURRENT' };
    }
    if (input.revealWholeEpisode === true) {
      return { visibility: 'KNOWN', ...node, status: 'AVAILABLE' };
    }
    return { visibility: 'VEILED', role: node.role };
  }) as unknown as readonly [EpisodeNodeView, EpisodeNodeView, EpisodeNodeView];

  return {
    title: input.title ?? '수사 진행 기록',
    episodeId: input.episodeId,
    episodeDisplayIndex: input.episodeDisplayIndex,
    episodeCount: input.episodeCount,
    episodeLabel: input.episodeLabel,
    nodes,
    clearedEpisodes: [...(input.clearedEpisodes ?? [])],
    nextEpisodeVeiled: input.hasNextEpisode,
    activeSlotIndex: input.activeSlotIndex,
  };
}
