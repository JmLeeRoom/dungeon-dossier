import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import {
  CaseSchema,
  RewardsSchema,
  RunStripSchema,
  StringsSchema,
  type CaseDefinition,
  type RewardDefinition,
  type RunStripDefinition,
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

interface ShippedContent {
  readonly strip: RunStripDefinition;
  readonly cases: readonly CaseDefinition[];
  readonly rewards: readonly RewardDefinition[];
}

async function loadContent(): Promise<ShippedContent> {
  const [strip, tutorial, ep001, ep004, rewards, strings] = await Promise.all([
    json('common/run-strip.json').then((value) => RunStripSchema.parse(value)),
    json('cases/tutorial/case.json').then((value) => CaseSchema.parse(value)),
    json('cases/ep001/case.json').then((value) => CaseSchema.parse(value)),
    json('cases/ep004/case.json').then((value) => CaseSchema.parse(value)),
    json('common/rewards.json').then((value) => RewardsSchema.parse(value)),
    json('common/strings.ko.json').then((value) => StringsSchema.parse(value)),
  ]);
  installStrings(strings.strings);
  return { strip, cases: [tutorial, ep001, ep004], rewards: rewards.rewards };
}

const EPISODE_ORDER = ['tutorial', 'ep001', 'ep004'] as const;
type EpisodeId = (typeof EPISODE_ORDER)[number];

const EPISODE_LABELS = {
  tutorial: '튜토리얼 · 황금 엘릭서 믹스커피 절도',
  ep001: 'EPISODE 001 · 붉은 장부와 사라진 보급품',
  ep004: 'EPISODE 004 · 심야 용맥 급행의 우회권',
} as const satisfies Readonly<Record<EpisodeId, string>>;

/**
 * The shipped canonical route: three episodes of COMBAT ▸ EVENT ▸ BOSS, each
 * slot taking its first candidate. Every expectation below is derived from this
 * table so a content change has to be re-stated here deliberately.
 */
interface RouteEntry {
  readonly episodeId: EpisodeId;
  readonly nodeId: string;
  readonly kind: 'ENCOUNTER' | 'EVENT' | 'BOSS';
  readonly role: 'COMBAT' | 'EVENT' | 'BOSS';
  readonly ref: string;
  readonly label: string;
}

const CANONICAL_ROUTE: readonly RouteEntry[] = [
  { episodeId: 'tutorial', nodeId: 'run_tutorial_01', kind: 'ENCOUNTER', role: 'COMBAT', ref: 'enc_tutorial_slime', label: '물컹이 심문' },
  { episodeId: 'tutorial', nodeId: 'run_tutorial_02', kind: 'EVENT', role: 'EVENT', ref: 'event_tutorial_choice', label: '탕비실 야근' },
  { episodeId: 'tutorial', nodeId: 'run_tutorial_05', kind: 'BOSS', role: 'BOSS', ref: 'enc_tutorial_minotaur', label: '미노타우로스 대면' },
  { episodeId: 'ep001', nodeId: 'run_ep001_01', kind: 'ENCOUNTER', role: 'COMBAT', ref: 'enc_ep001_goblin', label: '고블린 서기 심문' },
  { episodeId: 'ep001', nodeId: 'run_ep001_02', kind: 'EVENT', role: 'EVENT', ref: 'event_ep001_forensic_sweep', label: '감식반 동행' },
  { episodeId: 'ep001', nodeId: 'run_ep001_05', kind: 'BOSS', role: 'BOSS', ref: 'enc_ep001_succubus', label: '서큐버스 대면' },
  { episodeId: 'ep004', nodeId: 'run_ep004_01', kind: 'ENCOUNTER', role: 'COMBAT', ref: 'enc_ep004_dwarf', label: '드워프 정비사 심문' },
  { episodeId: 'ep004', nodeId: 'run_ep004_02', kind: 'EVENT', role: 'EVENT', ref: 'event_ep004_machine_room', label: '기관실 수색' },
  { episodeId: 'ep004', nodeId: 'run_ep004_05', kind: 'BOSS', role: 'BOSS', ref: 'enc_ep004_fallen_hero', label: '타락한 용사 최후 심문' },
];

function routeEntry(nodeIndex: number): RouteEntry {
  const entry = CANONICAL_ROUTE[nodeIndex];
  if (entry === undefined) throw new Error(`No canonical route entry at ${String(nodeIndex)}.`);
  return entry;
}

describe('game-flow presentation adapters', () => {
  it('maps checked-in run, event, reward, and ending data to UI-only models', async () => {
    const { strip, cases, rewards } = await loadContent();
    try {
      // Node 5 is the ep001 boss: the second episode, standing on its last stage.
      const stripModel = toRunStripScreenModel(strip, { nodeIndex: 5 });
      const eventModels = cases.flatMap((caseDefinition) =>
        caseDefinition.events_noncombat.map((event) => toEventSceneModel(event)),
      );
      const rewardModel = toRewardScreenModel('A', rewards);
      const endingModel = toEndingScreenModel('ending-true', [{
        endingId: 'ending-true',
        kind: 'TRUE',
        title: '완전한 조서',
        script: ['진실을 기록했다.'],
      }]);

      expect(stripModel.nodes).toHaveLength(3);
      expect(stripModel.episodeId).toBe('ep001');
      expect(stripModel.episodeDisplayIndex).toBe(2);
      expect(stripModel.episodeCount).toBe(3);
      expect(stripModel.episodeLabel).toBe(EPISODE_LABELS.ep001);
      expect(stripModel.activeSlotIndex).toBe(2);
      expect(stripModel.nodes[2]?.visibility).toBe('KNOWN');
      expect(stripModel.nodes.map((node) =>
        node.visibility === 'KNOWN' ? node.status : 'VEILED',
      )).toEqual(['CLEARED', 'CLEARED', 'CURRENT']);
      expect(stripModel.nodes).toEqual(
        CANONICAL_ROUTE.slice(3, 6).map((entry, index) => ({
          visibility: 'KNOWN',
          nodeId: entry.nodeId,
          kind: entry.kind,
          role: entry.role,
          label: entry.label,
          status: index === 2 ? 'CURRENT' : 'CLEARED',
        })),
      );
      expect(stripModel.clearedEpisodes).toEqual([
        { episodeId: 'tutorial', displayIndex: 1, label: EPISODE_LABELS.tutorial },
      ]);
      expect(stripModel.nextEpisodeVeiled).toBe(true);

      expect(eventModels.map((event) => event.pattern))
        .toEqual(['A', 'B', 'C', 'F', 'C', 'D', 'E']);
      expect(rewardModel.choices).toHaveLength(rewards.length);
      expect(endingModel.kind).toBe('TRUE');
      expect(rawKeyPaths([stripModel, ...eventModels, rewardModel, endingModel]))
        .toEqual([]);
    } finally {
      clearStrings();
    }
  });

  it('walks the nine-node canonical route one episode board at a time', async () => {
    const { strip } = await loadContent();
    try {
      const models = CANONICAL_ROUTE.map((_, nodeIndex) =>
        toRunStripScreenModel(strip, { nodeIndex }),
      );

      expect(models.map((model) => model.episodeId)).toEqual(
        CANONICAL_ROUTE.map((entry) => entry.episodeId),
      );
      expect(models.map((model) => model.activeSlotIndex))
        .toEqual([0, 1, 2, 0, 1, 2, 0, 1, 2]);
      expect(models.map((model) => model.episodeDisplayIndex))
        .toEqual([1, 1, 1, 2, 2, 2, 3, 3, 3]);
      expect(models.map((model) => model.nextEpisodeVeiled))
        .toEqual([true, true, true, true, true, true, false, false, false]);
      expect(models.map((model) => model.clearedEpisodes.map((episode) => episode.episodeId)))
        .toEqual([
          [], [], [],
          ['tutorial'], ['tutorial'], ['tutorial'],
          ['tutorial', 'ep001'], ['tutorial', 'ep001'], ['tutorial', 'ep001'],
        ]);

      models.forEach((model, nodeIndex) => {
        const activeSlot = nodeIndex % 3;
        expect(model.nodes).toHaveLength(3);
        expect(model.nodes.map((node) => node.role)).toEqual(['COMBAT', 'EVENT', 'BOSS']);
        expect(model.nodes.map((node) =>
          node.visibility === 'KNOWN' ? node.status : 'VEILED',
        )).toEqual([
          ...Array.from({ length: activeSlot }, () => 'CLEARED'),
          'CURRENT',
          ...Array.from({ length: 2 - activeSlot }, () => 'VEILED'),
        ]);

        // Known stages resolve to the canonical route's own nodes and labels.
        const episodeStart = nodeIndex - activeSlot;
        model.nodes.forEach((node, slotIndex) => {
          if (node.visibility !== 'KNOWN') return;
          const entry = routeEntry(episodeStart + slotIndex);
          expect(node).toEqual({
            visibility: 'KNOWN',
            nodeId: entry.nodeId,
            kind: entry.kind,
            role: entry.role,
            label: entry.label,
            status: slotIndex === activeSlot ? 'CURRENT' : 'CLEARED',
          });
        });

        // A veiled stage is redacted in the model, not merely hidden at draw time.
        for (const node of model.nodes) {
          if (node.visibility !== 'VEILED') continue;
          expect(Object.keys(node).sort()).toEqual(['role', 'visibility']);
        }
      });

      // Every player-visible string is real localized text, board by board.
      for (const model of models) expect(rawKeyPaths(model)).toEqual([]);

      // The whole run is still reachable: the boards together name all 9 nodes.
      const seen = models.flatMap((model) =>
        model.nodes.flatMap((node) => (node.visibility === 'KNOWN' ? [node.nodeId] : [])),
      );
      expect([...new Set(seen)]).toEqual(CANONICAL_ROUTE.map((entry) => entry.nodeId));
    } finally {
      clearStrings();
    }
  });

  it('never leaks a later episode’s node, ref or localized name into the board', async () => {
    const { strip } = await loadContent();
    try {
      let secretsChecked = 0;
      CANONICAL_ROUTE.forEach((entry, nodeIndex) => {
        const model = toRunStripScreenModel(strip, { nodeIndex });
        const serialized = JSON.stringify(model);
        const episodePosition = EPISODE_ORDER.indexOf(entry.episodeId);
        expect(episodePosition).toBeGreaterThanOrEqual(0);

        const laterEpisodes: readonly EpisodeId[] = EPISODE_ORDER.slice(episodePosition + 1);
        const forbidden = [
          ...laterEpisodes.map((episodeId) => EPISODE_LABELS[episodeId]),
          ...laterEpisodes,
          ...CANONICAL_ROUTE.filter((candidate) =>
            laterEpisodes.includes(candidate.episodeId),
          ).flatMap((candidate) => [candidate.nodeId, candidate.ref, candidate.label]),
        ];
        for (const secret of forbidden) {
          secretsChecked += 1;
          expect(
            serialized.includes(secret),
            `node ${String(nodeIndex)} leaked "${secret}"`,
          ).toBe(false);
        }

        // Unreached stages of the CURRENT episode stay sealed too.
        const unreachedRefs = CANONICAL_ROUTE.slice(nodeIndex + 1)
          .filter((candidate) => candidate.episodeId === entry.episodeId)
          .flatMap((candidate) => [candidate.nodeId, candidate.ref, candidate.label]);
        for (const secret of unreachedRefs) {
          secretsChecked += 1;
          expect(
            serialized.includes(secret),
            `node ${String(nodeIndex)} leaked upcoming stage "${secret}"`,
          ).toBe(false);
        }
      });
      // Later-episode secrets: 11 per later episode (label + id + 3 nodes x 3
      // fields) = 3 boards x 22 + 3 boards x 11 = 99. Sealed stages of the
      // active episode add (2+1+0) x 3 fields x 3 episodes = 27. Guards the
      // sweep against silently becoming vacuous.
      expect(secretsChecked).toBe(126);

      // Revealing the episode on purpose exposes the rest of THAT episode only.
      const revealed = toRunStripScreenModel(strip, { nodeIndex: 3 }, {
        revealWholeEpisode: true,
      });
      expect(revealed.nodes.map((node) =>
        node.visibility === 'KNOWN' ? node.label : 'VEILED',
      )).toEqual(['고블린 서기 심문', '감식반 동행', '서큐버스 대면']);
      const revealedJson = JSON.stringify(revealed);
      for (const secret of ['ep004', EPISODE_LABELS.ep004, '드워프 정비사 심문']) {
        expect(revealedJson.includes(secret), `revealed board leaked "${secret}"`).toBe(false);
      }
    } finally {
      clearStrings();
    }
  });

  it('refuses to render a board for a finished run', async () => {
    const { strip } = await loadContent();
    try {
      expect(() => toRunStripScreenModel(strip, { nodeIndex: CANONICAL_ROUTE.length }))
        .toThrow(/ending/u);
    } finally {
      clearStrings();
    }
  });
});
