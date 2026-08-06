import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import {
  CaseSchema,
  RewardsSchema,
  RunStripSchema,
  StringsSchema,
} from '../../src/engine/domain';
import { clearStrings, installStrings } from '../../src/app/i18n';
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

const RAW_KEY_PATTERN = /^[a-z0-9_]+\.[a-z0-9_.]+$/u;

function rawKeyPaths(value: unknown, path = '$'): readonly string[] {
  if (typeof value === 'string') return RAW_KEY_PATTERN.test(value) ? [path] : [];
  if (Array.isArray(value)) {
    return value.flatMap((entry, index) => rawKeyPaths(entry, `${path}[${String(index)}]`));
  }
  if (value === null || typeof value !== 'object') return [];
  return Object.entries(value).flatMap(([key, entry]) =>
    rawKeyPaths(entry, `${path}.${key}`),
  );
}

describe('game-flow presentation adapters', () => {
  it('maps checked-in run, event, reward, and ending data to UI-only models', async () => {
    const [strip, tutorial, ep001, ep004, rewards, strings] = await Promise.all([
      json('common/run-strip.json').then((value) => RunStripSchema.parse(value)),
      json('cases/tutorial/case.json').then((value) => CaseSchema.parse(value)),
      json('cases/ep001/case.json').then((value) => CaseSchema.parse(value)),
      json('cases/ep004/case.json').then((value) => CaseSchema.parse(value)),
      json('common/rewards.json').then((value) => RewardsSchema.parse(value)),
      json('common/strings.ko.json').then((value) => StringsSchema.parse(value)),
    ]);
    installStrings(strings.strings);
    try {
      const stripModel = toRunStripScreenModel(strip, { nodeIndex: 5 });
      const eventModels = [tutorial, ep001, ep004].flatMap((caseDefinition) =>
        caseDefinition.events_noncombat.map((event) => toEventSceneModel(event)),
      );
      const rewardModel = toRewardScreenModel('A', rewards.rewards);
      const endingModel = toEndingScreenModel('ending-true', [{
        endingId: 'ending-true',
        kind: 'TRUE',
        title: '완전한 조서',
        script: ['진실을 기록했다.'],
      }]);

      expect(stripModel.nodes).toHaveLength(15);
      expect(stripModel.nodes[5]?.status).toBe('CURRENT');
      expect(eventModels.map((event) => event.pattern))
        .toEqual(['A', 'B', 'C', 'B', 'C', 'C', 'A']);
      expect(rewardModel.choices).toHaveLength(rewards.rewards.length);
      expect(endingModel.kind).toBe('TRUE');
      expect(rawKeyPaths([stripModel, ...eventModels, rewardModel, endingModel]))
        .toEqual([]);
    } finally {
      clearStrings();
    }
  });
});
