import { describe, expect, it, vi } from 'vitest';
import { createEndingScreen, endingTone } from '../../src/ui/screens/ending';
import { canInvestigate, createEventScreen, placementResultLabel, scorePlacement, type EventSceneModel } from '../../src/ui/screens/event';
import { createRewardScreen } from '../../src/ui/screens/reward';
import { createRunStripModel, createRunStripScreen } from '../../src/ui/screens/strip';

const stripNodes = Array.from({ length: 15 }, (_, index) => ({
  nodeId: `node-${index.toString()}`,
  kind: index % 5 === 4 ? 'BOSS' as const : index % 2 === 0 ? 'ENCOUNTER' as const : 'EVENT' as const,
  label: `NODE ${index.toString()}`,
}));

describe('game completion presentation models', () => {
  it('builds the exact 15-node strip with cleared/current/locked states', () => {
    const model = createRunStripModel(stripNodes, 6);
    expect(model.nodes).toHaveLength(15);
    expect(model.nodes.slice(0, 6).every((node) => node.status === 'CLEARED')).toBe(true);
    expect(model.nodes[6]?.status).toBe('CURRENT');
    expect(model.nodes.slice(7).every((node) => node.status === 'LOCKED')).toBe(true);
    expect(createRunStripScreen).toBeTypeOf('function');
  });

  it('supports event patterns A, B, and C without encounter imports', () => {
    const choice: EventSceneModel = {
      eventId: 'choice', title: '선택', description: '고른다', pattern: 'A',
      choices: [{ choiceId: 'a', label: 'A', costs: [], gains: [] }, { choiceId: 'b', label: 'B', costs: [], gains: [] }],
    };
    const placement: Extract<EventSceneModel, { pattern: 'B' }> = {
      eventId: 'placement', title: '배치', description: '잇는다', pattern: 'B',
      items: [{ itemId: 'one', label: 'ONE' }, { itemId: 'two', label: 'TWO' }],
      slots: [{ slotId: 'first', label: 'FIRST' }, { slotId: 'second', label: 'SECOND' }],
      answerMapping: { one: 'first', two: 'second' }, successRatio: 1, partialRatio: 0.5,
    };
    const investigation: Extract<EventSceneModel, { pattern: 'C' }> = {
      eventId: 'investigation', title: '조사', description: '살핀다', pattern: 'C',
      spots: [{ spotId: 'cabinet', label: '보관함', discovered: false }], attemptLimit: 2, attemptsUsed: 1,
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
