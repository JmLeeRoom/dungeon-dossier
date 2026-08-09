import { describe, expect, it, vi } from 'vitest';
import { createEndingScreen, endingTone } from '../../src/ui/screens/ending';
import { canInvestigate, createEventScreen, placementResultLabel, scorePlacement, type EventSceneModel } from '../../src/ui/screens/event';
import { createRewardScreen } from '../../src/ui/screens/reward';
import {
  createRunStripModel,
  createRunStripScreen,
  CASE_FILE_PHOTO_LAYOUT,
  EPISODE_BOARD_SLOT_COUNT,
  episodeSlotX,
  RUN_STRIP_STAGE_SIZE,
  type EpisodeBoardInput,
  type EpisodeBoardNodeInput,
  type EpisodeNodeView,
} from '../../src/ui/screens/strip';

/** One episode is exactly COMBAT ▸ EVENT ▸ BOSS; the board never shows more. */
const STAGE_COMBAT: EpisodeBoardNodeInput = {
  nodeId: 'run_ep001_01', kind: 'ENCOUNTER', role: 'COMBAT', label: '고블린 서기 심문',
};
const STAGE_EVENT: EpisodeBoardNodeInput = {
  nodeId: 'run_ep001_02', kind: 'EVENT', role: 'EVENT', label: '감식반 동행',
};
const STAGE_BOSS: EpisodeBoardNodeInput = {
  nodeId: 'run_ep001_05', kind: 'BOSS', role: 'BOSS', label: '서큐버스 대면',
};
const EPISODE_STAGES: readonly EpisodeBoardNodeInput[] = [STAGE_COMBAT, STAGE_EVENT, STAGE_BOSS];

function board(
  activeSlotIndex: number,
  overrides: Partial<EpisodeBoardInput> = {},
): EpisodeBoardInput {
  return {
    episodeId: 'ep001',
    episodeLabel: 'EPISODE 001 · 붉은 장부와 사라진 보급품',
    episodeDisplayIndex: 2,
    episodeCount: 3,
    nodes: EPISODE_STAGES,
    activeSlotIndex,
    clearedEpisodes: [
      { episodeId: 'tutorial', displayIndex: 1, label: '튜토리얼 · 황금 엘릭서 믹스커피 절도' },
    ],
    hasNextEpisode: true,
    ...overrides,
  };
}

function shape(nodes: readonly EpisodeNodeView[]): readonly string[] {
  return nodes.map((node) =>
    node.visibility === 'VEILED' ? 'VEILED' : `KNOWN:${node.status}`,
  );
}

describe('game completion presentation models', () => {
  it('keeps both case-file portraits inside the stage and outside every node card', () => {
    const nodeCards = [0, 1, 2].map((index) => ({
      x: episodeSlotX(index),
      y: 128,
      width: 148,
      height: 128,
    }));
    const overlaps = (
      left: Readonly<{ x: number; y: number; width: number; height: number }>,
      right: Readonly<{ x: number; y: number; width: number; height: number }>,
    ): boolean =>
      left.x < right.x + right.width &&
      left.x + left.width > right.x &&
      left.y < right.y + right.height &&
      left.y + left.height > right.y;

    for (const photo of CASE_FILE_PHOTO_LAYOUT) {
      expect(photo.x).toBeGreaterThanOrEqual(0);
      expect(photo.y).toBeGreaterThanOrEqual(0);
      expect(photo.x + photo.width).toBeLessThanOrEqual(RUN_STRIP_STAGE_SIZE.width);
      expect(photo.y + photo.height).toBeLessThanOrEqual(RUN_STRIP_STAGE_SIZE.height);
      expect(nodeCards.some((card) => overlaps(photo, card))).toBe(false);
    }
  });

  it('builds the exact 3-stage episode board with cleared/current/veiled states', () => {
    expect(EPISODE_BOARD_SLOT_COUNT).toBe(3);

    const first = createRunStripModel(board(0));
    const second = createRunStripModel(board(1));
    const third = createRunStripModel(board(2));

    for (const model of [first, second, third]) {
      expect(model.nodes).toHaveLength(EPISODE_BOARD_SLOT_COUNT);
      expect(model.episodeId).toBe('ep001');
      expect(model.episodeLabel).toBe('EPISODE 001 · 붉은 장부와 사라진 보급품');
      expect(model.episodeDisplayIndex).toBe(2);
      expect(model.episodeCount).toBe(3);
      expect(model.nextEpisodeVeiled).toBe(true);
      expect(model.clearedEpisodes).toEqual([
        { episodeId: 'tutorial', displayIndex: 1, label: '튜토리얼 · 황금 엘릭서 믹스커피 절도' },
      ]);
      // Every stage keeps its role badge, veiled or not, so the silhouette holds.
      expect(model.nodes.map((node) => node.role)).toEqual(['COMBAT', 'EVENT', 'BOSS']);
    }

    expect(first.activeSlotIndex).toBe(0);
    expect(shape(first.nodes)).toEqual(['KNOWN:CURRENT', 'VEILED', 'VEILED']);
    expect(second.activeSlotIndex).toBe(1);
    expect(shape(second.nodes)).toEqual(['KNOWN:CLEARED', 'KNOWN:CURRENT', 'VEILED']);
    expect(third.activeSlotIndex).toBe(2);
    expect(shape(third.nodes)).toEqual(['KNOWN:CLEARED', 'KNOWN:CLEARED', 'KNOWN:CURRENT']);

    // The revealed stages carry the authored identity through unchanged.
    expect(third.nodes).toEqual([
      { visibility: 'KNOWN', ...STAGE_COMBAT, status: 'CLEARED' },
      { visibility: 'KNOWN', ...STAGE_EVENT, status: 'CLEARED' },
      { visibility: 'KNOWN', ...STAGE_BOSS, status: 'CURRENT' },
    ]);
    expect(createRunStripScreen).toBeTypeOf('function');
  });

  it('redacts veiled stages down to visibility and role only', () => {
    const model = createRunStripModel(board(0));
    const veiled = model.nodes.slice(1);
    expect(veiled).toEqual([
      { visibility: 'VEILED', role: 'EVENT' },
      { visibility: 'VEILED', role: 'BOSS' },
    ]);
    // The redaction happens in the model, not at draw time: the fields must be
    // absent, not merely blank, so nothing can leak via telemetry or a11y trees.
    for (const node of veiled) {
      expect(Object.keys(node).sort()).toEqual(['role', 'visibility']);
      expect(node).not.toHaveProperty('nodeId');
      expect(node).not.toHaveProperty('kind');
      expect(node).not.toHaveProperty('label');
    }
    const serialized = JSON.stringify(model);
    // `role` survives on purpose (it is the silhouette); identity must not.
    for (const hidden of [
      STAGE_EVENT.nodeId, STAGE_EVENT.label,
      STAGE_BOSS.nodeId, STAGE_BOSS.label,
    ]) {
      expect(serialized).not.toContain(hidden);
    }
    // The next episode is announced but never named.
    expect(serialized).not.toContain('ep004');
  });

  it('reveals the whole episode as AVAILABLE only when asked, and rejects bad boards', () => {
    const revealed = createRunStripModel(board(0, { revealWholeEpisode: true }));
    expect(shape(revealed.nodes))
      .toEqual(['KNOWN:CURRENT', 'KNOWN:AVAILABLE', 'KNOWN:AVAILABLE']);
    expect(revealed.nodes.map((node) => (node.visibility === 'KNOWN' ? node.label : null)))
      .toEqual(['고블린 서기 심문', '감식반 동행', '서큐버스 대면']);

    expect(() => createRunStripModel(board(0, { nodes: EPISODE_STAGES.slice(0, 2) })))
      .toThrow(/exactly 3 stages/u);
    expect(() => createRunStripModel(board(3))).toThrow(RangeError);
    expect(() => createRunStripModel(board(-1))).toThrow(RangeError);
  });

  it('supports event patterns A, B, and C without encounter imports', () => {
    const choice: EventSceneModel = {
      eventId: 'choice', title: '선택', description: '고른다', pattern: 'A',
      choices: [
        { choiceId: 'a', label: 'A', costs: [], gains: [], affordable: true },
        { choiceId: 'b', label: 'B', costs: [], gains: [], affordable: false, blockedReason: 'DP 부족 (0/5)' },
      ],
    };
    const placement: Extract<EventSceneModel, { pattern: 'B' }> = {
      eventId: 'placement', title: '배치', description: '잇는다', pattern: 'B',
      items: [{ itemId: 'one', label: 'ONE' }, { itemId: 'two', label: 'TWO' }],
      slots: [{ slotId: 'first', label: 'FIRST' }, { slotId: 'second', label: 'SECOND' }],
      answerMapping: { one: 'first', two: 'second' }, successRatio: 1, partialRatio: 0.5,
    };
    const investigation: Extract<EventSceneModel, { pattern: 'C' }> = {
      eventId: 'investigation', title: '조사', description: '살핀다', pattern: 'C',
      spots: [{ spotId: 'cabinet', label: '보관함', discovered: false, findings: [], affordable: true }],
      attemptLimit: 2, attemptsUsed: 1, attemptCosts: [],
    };
    expect(choice.pattern).toBe('A');
    expect(createEventScreen).toBeTypeOf('function');
    expect(scorePlacement(placement, { one: 'first', two: 'second' }).result).toBe('SUCCESS');
    expect(scorePlacement(placement, { one: 'first', two: 'first' }).result).toBe('PARTIAL');
    expect(placementResultLabel('PARTIAL')).toBe('부분 성공');
    expect(canInvestigate(investigation, 'cabinet')).toBe(true);
  });

  it('renders two/three-choice rewards and all ending tones', () => {
    const selected = vi.fn();
    const rewardModel = {
      heading: '정산', grade: 'A',
      choices: [
        { rewardId: 'one', kind: 'RESOURCE', title: 'DP', description: '10', rarity: 'COMMON' },
        { rewardId: 'two', kind: 'CARD', title: '카드', description: '획득', rarity: 'UNCOMMON' },
        { rewardId: 'three', kind: 'RELIC', title: '유물', description: '획득', rarity: 'RARE' },
      ],
    } as const;
    expect(createRewardScreen).toBeTypeOf('function');
    expect(rewardModel.choices).toHaveLength(3);
    expect(selected).not.toHaveBeenCalled();
    expect(endingTone('TRUE')).toContain('진실');
    expect(endingTone('NORMAL')).toContain('의문');
    expect(endingTone('BAD')).toContain('진실');
    expect(createEndingScreen).toBeTypeOf('function');
  });
});
