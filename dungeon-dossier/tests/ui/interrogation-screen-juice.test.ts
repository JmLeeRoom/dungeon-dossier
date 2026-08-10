import { Container } from 'pixi.js';
import { describe, expect, it, vi } from 'vitest';

vi.mock('../../src/ui/core/pixelText', async () => {
  const { Container: TextContainer } = await import('pixi.js');
  return {
    createPixelText(text: string) {
      const view = new TextContainer() as Container & { text: string };
      Object.defineProperties(view, {
        anchor: { value: { set: () => undefined } },
        text: { value: text, writable: true },
      });
      return view;
    },
  };
});

import type { PublicDTO } from '../../src/dto';
import {
  createInterrogationScreen,
  TAG_CHIP_PITCH,
  TAG_ROW_Y,
} from '../../src/ui/screens/interrogation/createInterrogationScreen';
import { PUNISH_TIMELINE } from '../../src/ui/screens/interrogation/punishJuice';
import type {
  InterrogationScreenModel,
  JudgmentFeedbackView,
} from '../../src/ui/screens/interrogation/model';
import { PORTRAIT_SHAKE_PROFILES } from '../../src/ui/widgets/portrait';

const DTO: PublicDTO = {
  statement: [
    {
      claimId: 'clm_when',
      speakerId: 'suspect',
      facet: 'WHEN',
      text: '동쪽 공터에 있었다',
      epistemic: 'UNKNOWN',
      presentation: 'NORMAL',
      resistance: 1,
    },
  ],
  evidence: [
    {
      evidenceId: 'ev_key',
      displayName: '서쪽 창고 열쇠',
      grade: 'B',
      scopes: ['LOCATION'],
      notProvenKeys: [],
    },
  ],
  resources: { composure: 60, coercion: 10, commandPoints: 3 },
  objectives: [{ label: '모순 지적', completed: false }],
};

function screenModel(
  overrides: Partial<InterrogationScreenModel> = {},
): InterrogationScreenModel {
  return {
    dto: DTO,
    suspectName: '물컹이',
    partnerName: '김 인턴',
    turn: { current: 1, limit: 8 },
    stress: 60,
    composureMax: 100,
    coercionMax: 100,
    sweetSpotUnlocked: false,
    cards: [
      {
        cardId: 'card_contradict_basic',
        title: '모순 지적',
        description: '증거로 진술의 모순을 지적한다.',
        intent: 'CONTRADICT',
        cpCost: 2,
        requiresEvidence: true,
      },
    ],
    suspectStatePart: 'base',
    partnerCooldown: { state: 'base', cooldownTurns: 0 },
    partnerSkillAvailable: false,
    ...overrides,
  };
}

const FEEDBACK: JudgmentFeedbackView = {
  tone: 'CONTRADICTION',
  headline: '직접 모순',
  statementQuote: '동쪽 공터에 있었다',
  evidenceQuote: '서쪽 창고 열쇠',
  detail: '증거가 진술을 정면으로 무너뜨렸다.',
  text: '진술 "동쪽 공터에 있었다" ↔ 증거 서쪽 창고 열쇠 · 직접 모순 — 증거가 진술을 정면으로 무너뜨렸다.',
};

/** The scene container every static widget is parented to. */
function content(screen: Readonly<{ view: Container }>): Container {
  const first = screen.view.children[0];
  if (!(first instanceof Container)) throw new Error('Expected a content container.');
  return first;
}

function keyboardEvent(code: string): Event {
  const event = new Event('keydown', { cancelable: true });
  Object.defineProperty(event, 'code', { value: code });
  return event;
}

function tagView(scene: Container, facetIndex: number): Container {
  const x = 12 + facetIndex * TAG_CHIP_PITCH;
  const view = scene.children.find(
    (child) => child instanceof Container && child.position.x === x && child.position.y === TAG_ROW_Y,
  );
  if (!(view instanceof Container)) throw new Error(`Expected tag chip ${facetIndex}.`);
  return view;
}

describe('interrogation screen impact juice', () => {
  it('deactivates visible facets that the selected card cannot target', () => {
    const inputTarget = new EventTarget();
    const model = screenModel({
      dto: {
        ...DTO,
        statement: [
          {
            claimId: 'clm_who',
            speakerId: 'suspect',
            facet: 'WHO',
            text: '나는 혼자였다',
            epistemic: 'UNKNOWN',
            presentation: 'NORMAL',
            resistance: 0,
          },
          ...DTO.statement,
        ],
      },
      cards: [{
        ...screenModel().cards[0]!,
        allowedFacets: ['WHEN'],
      }],
    });
    const screen = createInterrogationScreen(model, {}, { inputTarget });
    const scene = content(screen);
    const who = tagView(scene, 0);
    const when = tagView(scene, 1);

    // With no card chosen yet both public claims remain available.
    expect(who.eventMode).toBe('static');
    expect(when.eventMode).toBe('static');

    inputTarget.dispatchEvent(keyboardEvent('Digit1'));
    expect(screen.selection.cardId).toBe('card_contradict_basic');
    expect(who.eventMode).toBe('none');
    expect(when.eventMode).toBe('static');

    // The controller guard mirrors eventMode, so a synthetic pointer event
    // cannot bypass the deactivated plate.
    (who as unknown as { emit(event: string): void }).emit('pointertap');
    expect(screen.selection.facet).toBeUndefined();
    (when as unknown as { emit(event: string): void }).emit('pointertap');
    expect(screen.selection.facet).toBe('WHEN');

    screen.destroy();
    screen.view.destroy({ children: true });
  });

  it('echoes the exact selected instance when duplicate blueprints share a card id', () => {
    const inputTarget = new EventTarget();
    const baseCard = { ...screenModel().cards[0]!, requiresEvidence: false };
    const model = screenModel({
      cards: [
        { ...baseCard, instanceId: 'physical-copy-1' },
        { ...baseCard, instanceId: 'physical-copy-2' },
      ],
    });
    const onSelectionChange = vi.fn();
    const screen = createInterrogationScreen(
      model,
      { onSelectionChange },
      { inputTarget },
    );

    inputTarget.dispatchEvent(keyboardEvent('Digit2'));
    expect(screen.selection).toMatchObject({
      cardId: 'card_contradict_basic',
      instanceId: 'physical-copy-2',
    });
    expect(onSelectionChange).toHaveBeenLastCalledWith(expect.objectContaining({
      cardId: 'card_contradict_basic',
      instanceId: 'physical-copy-2',
    }));

    screen.destroy();
    screen.view.destroy({ children: true });
  });

  it('builds with the juice overlay above the scene and below nothing else', () => {
    const screen = createInterrogationScreen(screenModel());

    // content, punish overlay, lose rings — overlays are appended to `view`
    // only while they are open, so they always land on top of these three.
    expect(screen.view.children).toHaveLength(3);
    expect(content(screen).children.length).toBeGreaterThan(5);

    screen.destroy();
    screen.view.destroy({ children: true });
  });

  it('shows the judgment banner without moving the scene', () => {
    const screen = createInterrogationScreen(screenModel());
    const sceneX = content(screen).position.x;

    screen.showJudgmentFeedback(FEEDBACK);
    expect(content(screen).position.x).toBe(sceneX);

    screen.clearJudgmentFeedback();
    screen.destroy();
    screen.view.destroy({ children: true });
  });

  it('shakes the scene on a coercion rise and returns it to rest', () => {
    const screen = createInterrogationScreen(screenModel());
    const scene = content(screen);
    const restingX = scene.position.x;

    screen.playCoercionRise(15);
    screen.update(125);
    expect(scene.position.x).not.toBe(restingX);
    expect(Number.isInteger(scene.position.x)).toBe(true);

    screen.update(PUNISH_TIMELINE.totalMs);
    expect(scene.position.x).toBe(restingX);

    screen.destroy();
    screen.view.destroy({ children: true });
  });

  it('ignores a coercion drop entirely', () => {
    const screen = createInterrogationScreen(screenModel());
    const scene = content(screen);
    const restingX = scene.position.x;

    screen.playCoercionRise(-4);
    screen.update(125);
    expect(scene.position.x).toBe(restingX);

    screen.destroy();
    screen.view.destroy({ children: true });
  });

  it('shakes only the portrait on an upset transition', () => {
    const screen = createInterrogationScreen(screenModel());
    const scene = content(screen);
    const sceneX = scene.position.x;
    const portraitView = scene.children[3];
    if (!(portraitView instanceof Container)) throw new Error('Expected the portrait.');
    const portraitX = portraitView.position.x;

    screen.playSuspectTransition({ from: 'base', to: 'upset' });
    screen.update(40);
    expect(portraitView.position.x).not.toBe(portraitX);
    expect(scene.position.x).toBe(sceneX);

    screen.update(PORTRAIT_SHAKE_PROFILES.upset.durationMs);
    expect(portraitView.position.x).toBe(portraitX);

    screen.destroy();
    screen.view.destroy({ children: true });
  });

  it('shakes the portrait and the whole scene when the suspect breaks', () => {
    const screen = createInterrogationScreen(screenModel({ suspectStatePart: 'upset' }));
    const scene = content(screen);
    const sceneX = scene.position.x;

    screen.playSuspectTransition({ from: 'upset', to: 'lose' });
    screen.update(40);
    expect(scene.position.x).not.toBe(sceneX);

    screen.update(PORTRAIT_SHAKE_PROFILES.lose.durationMs);
    expect(scene.position.x).toBe(sceneX);

    screen.destroy();
    screen.view.destroy({ children: true });
  });

  it('does nothing when a re-mount reports the same state', () => {
    const screen = createInterrogationScreen(screenModel());
    const scene = content(screen);
    const portraitView = scene.children[3];
    if (!(portraitView instanceof Container)) throw new Error('Expected the portrait.');

    screen.playSuspectTransition({ from: 'upset', to: 'upset' });
    screen.update(40);
    expect(portraitView.position.x).toBe(212);
    expect(scene.position.x).toBe(0);

    screen.destroy();
    screen.view.destroy({ children: true });
  });

  it('leaves the scene at rest when destroyed mid-shake', () => {
    const screen = createInterrogationScreen(screenModel());
    const scene = content(screen);

    screen.playCoercionRise(15);
    screen.playSuspectTransition({ from: 'base', to: 'lose' });
    screen.update(60);
    expect(scene.position.x).not.toBe(0);

    screen.destroy();
    expect(scene.position.x).toBe(0);

    screen.view.destroy({ children: true });
  });

  it('keeps ticking the typewriter and stays destroy-idempotent', () => {
    const screen = createInterrogationScreen(screenModel());

    screen.useFallbackStatement('진술을 확인합니다.');
    expect(() => screen.update(16)).not.toThrow();
    screen.finishStatement();

    screen.destroy();
    expect(() => screen.destroy()).not.toThrow();
    screen.view.destroy({ children: true });
  });
});
