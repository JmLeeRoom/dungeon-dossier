import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import {
  CaseSchema,
  RewardsSchema,
  RunStripSchema,
} from '../../src/engine/domain';
import {
  toEndingScreenModel,
  toEventSceneModel,
  toRewardScreenModel,
  toRunStripScreenModel,
} from '../../src/app/gameFlowPresentation';

async function json(relativePath: string): Promise<unknown> {
  return JSON.parse(
    await readFile(new URL(`../../content/${relativePath}`, import.meta.url), 'utf8'),
  ) as unknown;
}

describe('game-flow presentation adapters', () => {
  it('maps checked-in run, event, reward, and ending data to UI-only models', async () => {
    const [strip, tutorial, rewards] = await Promise.all([
      json('common/run-strip.json').then((value) => RunStripSchema.parse(value)),
      json('cases/tutorial/case.json').then((value) => CaseSchema.parse(value)),
      json('common/rewards.json').then((value) => RewardsSchema.parse(value)),
    ]);
    const stripModel = toRunStripScreenModel(strip, { nodeIndex: 5 });
    expect(stripModel.nodes).toHaveLength(15);
    expect(stripModel.nodes[5]?.status).toBe('CURRENT');
    expect(tutorial.events_noncombat.map((event) => toEventSceneModel(event).pattern))
      .toEqual(['A', 'B', 'C']);
    expect(toRewardScreenModel('A', rewards.rewards.slice(0, 3)).choices)
      .toHaveLength(3);
    expect(toEndingScreenModel('ending-true', [{
      endingId: 'ending-true',
      kind: 'TRUE',
      title: '완전한 조서',
      script: ['진실을 기록했다.'],
    }]).kind).toBe('TRUE');
  });
});
