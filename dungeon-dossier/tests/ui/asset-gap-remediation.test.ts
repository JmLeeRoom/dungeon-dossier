import { Container, Graphics, Sprite } from 'pixi.js';
import { describe, expect, it, vi } from 'vitest';

vi.mock('../../src/ui/core/pixelText', async () => {
  const { Container: TextContainer } = await import('pixi.js');
  return {
    createPixelText(text: string, options: Record<string, unknown> = {}) {
      const view = new TextContainer();
      const anchor = {
        x: 0,
        y: 0,
        set(x: number, y?: number): void {
          anchor.x = x;
          anchor.y = y ?? x;
        },
      };
      Object.defineProperties(view, {
        anchor: { value: anchor },
        text: { value: text, writable: true },
        tint: { value: 0xffffff, writable: true },
        pixelTextOptions: { value: options },
      });
      return view;
    },
  };
});

import { DEAD_SCENE_TABLE, toDeadSceneModel } from '../../src/app/deadScene';
import { createCutsceneOverlay } from '../../src/ui/screens/cutscene';
import {
  BOARD_KNOWN_EVENT_ASSET_KEY,
  BOARD_VEILED_MARKER_ASSET_KEY,
  createRunStripScreen,
} from '../../src/ui/screens/strip';
import { createRunStripModel } from '../../src/ui/screens/strip/model';
import { createEvidenceTray } from '../../src/ui/widgets/evidenceTray';

const WHITE_TEXTURE_URL =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

function allSprites(node: Container, found: Sprite[] = []): Sprite[] {
  for (const child of node.children) {
    if (child instanceof Sprite) found.push(child);
    if (child instanceof Container) allSprites(child, found);
  }
  return found;
}

describe('dead-scene failure stinger', () => {
  it('carries the cue the reason table selected all the way to the model', () => {
    for (const [reason, preset] of Object.entries(DEAD_SCENE_TABLE)) {
      const model = toDeadSceneModel({
        reason: reason as keyof typeof DEAD_SCENE_TABLE,
        state: {
          nodeIndex: 4,
          acquiredEvidenceIds: [],
          completedNodeIds: ['n1', 'n2', 'n3', 'n4'],
          stress: 0,
          retryCount: 0,
        },
        totalNodes: 9,
        coercion: 0,
        retryLimit: 2,
      });
      // The table has always named a stinger; the model used to drop it, so
      // nothing could ever play it.
      expect(model.audioCue, reason).toBe(preset.audioCue);
      expect(model.audioCue.startsWith('sting_'), reason).toBe(true);
    }
  });

  it('gives each failure reason its own distinct cue', () => {
    const cues = Object.values(DEAD_SCENE_TABLE).map((preset) => preset.audioCue);
    expect(new Set(cues).size).toBe(cues.length);
  });
});

describe('cutscene art composition', () => {
  const BEATS = [
    {
      beatId: 'beat_test',
      speaker: '김태훈',
      text: '기록을 다시 본다.',
      backgroundAssetKey: 'bg/event/scene0',
      portraits: [{ side: 'LEFT' as const, assetKey: 'portrait/김태훈/base', dim: false }],
      choices: [],
      treatment: 'NONE' as const,
      durationMs: 1_200,
    },
  ];

  it('drops the stand-in once real art resolves', () => {
    const overlay = createCutsceneOverlay(BEATS, {
      assets: { resolveUrl: () => WHITE_TEXTURE_URL },
      skippable: false,
    });
    const stage = overlay.view.children[0];
    if (!(stage instanceof Container)) throw new Error('Expected the cutscene stage.');
    const portraitLayer = stage.children[1];
    if (!(portraitLayer instanceof Container)) throw new Error('Expected the portrait layer.');
    const frame = portraitLayer.children[0];
    if (!(frame instanceof Container)) throw new Error('Expected a portrait frame.');

    // Portraits are transparent PNGs. A stand-in left underneath one shows its
    // panel, head circle and shoulders through every transparent pixel, which
    // reads as a second figure standing behind the character.
    expect(frame.children.filter((child) => child instanceof Graphics)).toHaveLength(0);
    expect(frame.children.filter((child) => child instanceof Sprite)).toHaveLength(1);

    overlay.view.destroy({ children: true });
  });

  it('still draws the stand-in when nothing resolves', () => {
    const overlay = createCutsceneOverlay(BEATS, {
      assets: { resolveUrl: () => undefined },
      skippable: false,
    });
    const stage = overlay.view.children[0];
    if (!(stage instanceof Container)) throw new Error('Expected the cutscene stage.');
    const portraitLayer = stage.children[1];
    if (!(portraitLayer instanceof Container)) throw new Error('Expected the portrait layer.');
    const frame = portraitLayer.children[0];
    if (!(frame instanceof Container)) throw new Error('Expected a portrait frame.');

    expect(frame.children.filter((child) => child instanceof Graphics)).toHaveLength(1);
    expect(frame.children.filter((child) => child instanceof Sprite)).toHaveLength(0);

    overlay.view.destroy({ children: true });
  });
});

describe('evidence pouch thumbnails', () => {
  const EVIDENCE = [
    {
      evidenceId: 'ev_tutorial_receipt',
      displayName: '자판기 영수증',
      grade: 'B' as const,
      scopes: [],
      notProvenKeys: [],
    },
  ];
  const KEYS = { ev_tutorial_receipt: 'ui/card/evidence03' };

  it('shows the polaroid a selected exhibit will put on the card', () => {
    const requested: string[] = [];
    const tray = createEvidenceTray(EVIDENCE, ['ev_tutorial_receipt'], {
      evidenceAssetKeys: KEYS,
      resolveUrl: (key) => {
        requested.push(key);
        return WHITE_TEXTURE_URL;
      },
    });

    // Resolved by evidence id through the same table the card layers use, so
    // the pouch and the card cannot disagree about which exhibit this is.
    expect(requested).toContain('ui/card/evidence03');
    const visible = allSprites(tray.view).filter((sprite) => sprite.visible);
    expect(visible).toHaveLength(1);
    expect(visible[0]?.eventMode).toBe('none');
    // Square source into a square slot: no distortion.
    expect(visible[0]?.width).toBe(visible[0]?.height);

    tray.view.destroy({ children: true });
  });

  it('falls back to the grade letter when no art resolves', () => {
    const tray = createEvidenceTray(EVIDENCE, ['ev_tutorial_receipt'], {
      evidenceAssetKeys: KEYS,
      resolveUrl: () => undefined,
    });
    expect(allSprites(tray.view).filter((sprite) => sprite.visible)).toHaveLength(0);
    tray.view.destroy({ children: true });
  });

  it('needs no art table at all to keep working', () => {
    const tray = createEvidenceTray(EVIDENCE, ['ev_tutorial_receipt'], {});
    expect(allSprites(tray.view).filter((sprite) => sprite.visible)).toHaveLength(0);
    tray.view.destroy({ children: true });
  });
});

describe('investigation board notes', () => {
  const board = (revealWholeEpisode: boolean) =>
    createRunStripModel({
      episodeId: 'tutorial',
      episodeLabel: '튜토리얼',
      episodeDisplayIndex: 1,
      episodeCount: 3,
      activeSlotIndex: 0,
      hasNextEpisode: true,
      revealWholeEpisode,
      nodes: [
        { nodeId: 'run_tutorial_01', kind: 'ENCOUNTER', role: 'COMBAT', label: '물컹이 심문' },
        { nodeId: 'run_tutorial_02', kind: 'EVENT', role: 'EVENT', label: '탕비실 야근' },
        { nodeId: 'run_tutorial_05', kind: 'BOSS', role: 'BOSS', label: '미노타우로스 대면' },
      ],
    });

  it('pins a note on a revealed investigation stage', () => {
    const requested: string[] = [];
    const view = createRunStripScreen(board(true), {
      assets: {
        resolveUrl: (key) => {
          requested.push(key);
          return WHITE_TEXTURE_URL;
        },
      },
    });
    // The note is a renderer constant, exactly like the veil marker: no node
    // ever supplies it, so there is nothing for the model to redact.
    expect(requested).toContain(BOARD_KNOWN_EVENT_ASSET_KEY);
    expect(BOARD_KNOWN_EVENT_ASSET_KEY).not.toBe(BOARD_VEILED_MARKER_ASSET_KEY);
    view.destroy({ children: true });
  });

  it('never draws the note on a veiled stage, and never the marker on a known one', () => {
    const veiled: string[] = [];
    createRunStripScreen(board(false), {
      assets: {
        resolveUrl: (key) => {
          veiled.push(key);
          return WHITE_TEXTURE_URL;
        },
      },
    }).destroy({ children: true });

    // Slots 1 and 2 are veiled here, so the marker is drawn and the note is not:
    // the two images must never mean the same thing on one board.
    expect(veiled).toContain(BOARD_VEILED_MARKER_ASSET_KEY);
    expect(veiled).not.toContain(BOARD_KNOWN_EVENT_ASSET_KEY);

    const revealed: string[] = [];
    createRunStripScreen(board(true), {
      assets: {
        resolveUrl: (key) => {
          revealed.push(key);
          return WHITE_TEXTURE_URL;
        },
      },
    }).destroy({ children: true });
    expect(revealed).not.toContain(BOARD_VEILED_MARKER_ASSET_KEY);
  });

  it('keeps the veiled model free of any art key', () => {
    const model = board(false);
    const veiledNodes = model.nodes.filter((node) => node.visibility === 'VEILED');
    expect(veiledNodes.length).toBeGreaterThan(0);
    for (const node of veiledNodes) {
      expect(Object.keys(node).sort()).toEqual(['role', 'visibility']);
    }
    expect(JSON.stringify(model)).not.toContain(BOARD_KNOWN_EVENT_ASSET_KEY);
  });
});
