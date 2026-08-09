import type { Container } from 'pixi.js';
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
import { createInterrogationScreen } from '../../src/ui/screens/interrogation/createInterrogationScreen';
import type { InterrogationScreenModel } from '../../src/ui/screens/interrogation/model';

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
  resources: { composure: 9, coercion: 10, commandPoints: 1 },
  objectives: [{ label: '모순 지적', completed: true }],
};

function decisionModel(
  overrides: Partial<InterrogationScreenModel> = {},
): InterrogationScreenModel {
  return {
    dto: DTO,
    suspectName: '물컹이',
    partnerName: '김 인턴',
    turn: { current: 3, limit: 8 },
    stress: 60,
    composureMax: 100,
    coercionMax: 100,
    sweetSpotUnlocked: true,
    // The v2 settlement empties the hand before the decision window opens.
    cards: [],
    suspectStatePart: 'base',
    partnerCooldown: { state: 'base', cooldownTurns: 0 },
    partnerSkillAvailable: false,
    canSecureStatement: true,
    pendingDecision: {
      decisionId: 'run:node:1:3:7',
      title: '결정적 진술을 확보할 수 있습니다',
      secureLabel: '진술 확보하고 종료',
      continueLabel: '심문 계속',
    },
    ...overrides,
  };
}

function keyboardEvent(code: string): Event {
  const event = new Event('keydown', { cancelable: true });
  Object.defineProperty(event, 'code', { value: code });
  return event;
}

describe('interrogation secure-decision rail (P0-3C)', () => {
  it('confirms the focused choice with Enter and Space, exactly once', () => {
    const inputTarget = new EventTarget();
    const onResolveDecision = vi.fn();
    const screen = createInterrogationScreen(
      decisionModel(),
      { onResolveDecision },
      { inputTarget },
    );

    // Default focus is Secure; Enter fires it once, replays are swallowed.
    inputTarget.dispatchEvent(keyboardEvent('Enter'));
    inputTarget.dispatchEvent(keyboardEvent('Enter'));
    inputTarget.dispatchEvent(keyboardEvent('Space'));
    expect(onResolveDecision).toHaveBeenCalledTimes(1);
    expect(onResolveDecision).toHaveBeenCalledWith('run:node:1:3:7', 'SECURE');

    screen.destroy();
    screen.view.destroy({ children: true });
  });

  it('moves focus with Left/Right and confirms Continue', () => {
    const inputTarget = new EventTarget();
    const onResolveDecision = vi.fn();
    const screen = createInterrogationScreen(
      decisionModel(),
      { onResolveDecision },
      { inputTarget },
    );

    inputTarget.dispatchEvent(keyboardEvent('ArrowRight'));
    inputTarget.dispatchEvent(keyboardEvent('Space'));
    expect(onResolveDecision).toHaveBeenCalledTimes(1);
    expect(onResolveDecision).toHaveBeenCalledWith('run:node:1:3:7', 'CONTINUE');

    screen.destroy();
    screen.view.destroy({ children: true });
  });

  it('treats Escape as a no-op that neither secures nor continues', () => {
    const inputTarget = new EventTarget();
    const onResolveDecision = vi.fn();
    const screen = createInterrogationScreen(
      decisionModel(),
      { onResolveDecision },
      { inputTarget },
    );

    inputTarget.dispatchEvent(keyboardEvent('Escape'));
    expect(onResolveDecision).not.toHaveBeenCalled();
    // The rail is still live after Escape.
    inputTarget.dispatchEvent(keyboardEvent('ArrowLeft'));
    inputTarget.dispatchEvent(keyboardEvent('Enter'));
    expect(onResolveDecision).toHaveBeenCalledWith('run:node:1:3:7', 'CONTINUE');

    screen.destroy();
    screen.view.destroy({ children: true });
  });

  it('locks every other input path while the decision window is open', () => {
    const inputTarget = new EventTarget();
    const onSelectionChange = vi.fn();
    const onSubmit = vi.fn();
    const onSecureStatement = vi.fn();
    const onAdvance = vi.fn();
    const onResolveDecision = vi.fn();
    const model = decisionModel({
      cards: [
        {
          cardId: 'card_contradict_basic',
          instanceId: 'i-1',
          title: '모순 지적',
          description: '증거로 진술의 모순을 지적한다.',
          intent: 'CONTRADICT',
          cpCost: 2,
          requiresEvidence: false,
        },
      ],
    });
    const screen = createInterrogationScreen(
      model,
      { onSelectionChange, onSubmit, onSecureStatement, onAdvance, onResolveDecision },
      { inputTarget },
    );

    // Digit selection is owned by the rail: no selection event fires and the
    // controller's own selection state stays untouched (pins the selectCard
    // guard, not just the callback).
    inputTarget.dispatchEvent(keyboardEvent('Digit1'));
    expect(onSelectionChange).not.toHaveBeenCalled();
    expect(screen.selection.cardId).toBeUndefined();

    // Space belongs to the rail, not the typewriter: it resolves the focused
    // decision and never reaches onAdvance.
    inputTarget.dispatchEvent(keyboardEvent('Space'));
    expect(onAdvance).not.toHaveBeenCalled();
    expect(onResolveDecision).toHaveBeenCalledTimes(1);
    expect(onResolveDecision).toHaveBeenCalledWith('run:node:1:3:7', 'SECURE');

    // The dossier refuses to open while the decision is pending.
    const viewChildrenBefore = screen.view.children.length;
    screen.openDossier();
    expect(screen.view.children.length).toBe(viewChildrenBefore);

    expect(onSubmit).not.toHaveBeenCalled();
    expect(onSecureStatement).not.toHaveBeenCalled();

    screen.destroy();
    screen.view.destroy({ children: true });
  });

  it('drops OS key-repeat events so a held key cannot auto-resolve', () => {
    const inputTarget = new EventTarget();
    const onResolveDecision = vi.fn();
    const screen = createInterrogationScreen(
      decisionModel(),
      { onResolveDecision },
      { inputTarget },
    );

    const held = new Event('keydown', { cancelable: true });
    Object.defineProperty(held, 'code', { value: 'Space' });
    Object.defineProperty(held, 'repeat', { value: true });
    inputTarget.dispatchEvent(held);
    expect(onResolveDecision).not.toHaveBeenCalled();

    // A fresh (non-repeat) press still works.
    inputTarget.dispatchEvent(keyboardEvent('Space'));
    expect(onResolveDecision).toHaveBeenCalledTimes(1);

    screen.destroy();
    screen.view.destroy({ children: true });
  });

  it('unbinds the decision keyboard owner on destroy', () => {
    const inputTarget = new EventTarget();
    const onResolveDecision = vi.fn();
    const screen = createInterrogationScreen(
      decisionModel(),
      { onResolveDecision },
      { inputTarget },
    );

    screen.destroy();
    inputTarget.dispatchEvent(keyboardEvent('Enter'));
    inputTarget.dispatchEvent(keyboardEvent('Space'));
    expect(onResolveDecision).not.toHaveBeenCalled();
    screen.view.destroy({ children: true });
  });

  it('does not render a rail or bind decision keys without a pending decision', () => {
    const inputTarget = new EventTarget();
    const onResolveDecision = vi.fn();
    const rest: Record<string, unknown> = { ...decisionModel() };
    delete rest['pendingDecision'];
    const screen = createInterrogationScreen(
      { ...(rest as unknown as InterrogationScreenModel), canSecureStatement: false },
      { onResolveDecision },
      { inputTarget },
    );

    inputTarget.dispatchEvent(keyboardEvent('Enter'));
    inputTarget.dispatchEvent(keyboardEvent('ArrowRight'));
    inputTarget.dispatchEvent(keyboardEvent('Space'));
    expect(onResolveDecision).not.toHaveBeenCalled();

    screen.destroy();
    screen.view.destroy({ children: true });
  });
});
