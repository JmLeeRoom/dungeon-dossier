import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('pixi.js', () => {
  class ApplicationMock {
    static readonly instances: ApplicationMock[] = [];

    readonly canvas = {
      className: '',
      dataset: {} as Record<string, string>,
      style: {} as Record<string, string>,
    };

    readonly stage = {
      addChild: vi.fn(),
      scale: { set: vi.fn() },
    };

    readonly init = vi.fn(async () => undefined);
    readonly destroy = vi.fn();

    constructor() {
      ApplicationMock.instances.push(this);
    }
  }

  return {
    Application: ApplicationMock,
    TextureSource: { defaultOptions: { scaleMode: 'linear' } },
  };
});

vi.mock('../../src/ui/core/sceneManager', () => {
  class SceneManagerMock {
    static readonly instances: SceneManagerMock[] = [];

    readonly view = { kind: 'scene-root' };
    readonly destroy = vi.fn();

    constructor() {
      SceneManagerMock.instances.push(this);
    }
  }

  return { SceneManager: SceneManagerMock };
});

import { Application, TextureSource } from 'pixi.js';
import { createGameApplication } from '../../src/ui/core/createGameApplication';
import { SceneManager } from '../../src/ui/core/sceneManager';

interface ApplicationDouble {
  readonly canvas: {
    className: string;
    dataset: Record<string, string>;
    style: Record<string, string>;
  };
  readonly stage: {
    addChild: ReturnType<typeof vi.fn>;
    scale: { set: ReturnType<typeof vi.fn> };
  };
  readonly init: ReturnType<typeof vi.fn>;
  readonly destroy: ReturnType<typeof vi.fn>;
}

interface SceneManagerDouble {
  readonly view: unknown;
  readonly destroy: ReturnType<typeof vi.fn>;
}

function applicationInstances(): ApplicationDouble[] {
  return (Application as unknown as { instances: ApplicationDouble[] }).instances;
}

function sceneManagerInstances(): SceneManagerDouble[] {
  return (SceneManager as unknown as { instances: SceneManagerDouble[] }).instances;
}

describe('createGameApplication', () => {
  beforeEach(() => {
    applicationInstances().length = 0;
    sceneManagerInstances().length = 0;
    (TextureSource.defaultOptions as { scaleMode: string }).scaleMode = 'linear';
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('configures nearest-neighbour HD rendering and owns resize cleanup', async () => {
    const resizeListeners = new Set<() => void>();
    const windowDouble = {
      devicePixelRatio: 2,
      addEventListener: vi.fn((type: string, listener: () => void) => {
        if (type === 'resize') resizeListeners.add(listener);
      }),
      removeEventListener: vi.fn((type: string, listener: () => void) => {
        if (type === 'resize') resizeListeners.delete(listener);
      }),
    };
    vi.stubGlobal('window', windowDouble);

    let clientWidth = 1_920;
    let clientHeight = 1_080;
    const append = vi.fn();
    const mount = {
      get clientWidth() {
        return clientWidth;
      },
      get clientHeight() {
        return clientHeight;
      },
      append,
    } as unknown as HTMLElement;

    const mounted = await createGameApplication(mount);
    const app = applicationInstances()[0];
    const scenes = sceneManagerInstances()[0];
    if (app === undefined || scenes === undefined) {
      throw new Error('Expected one application and scene manager instance.');
    }

    expect(TextureSource.defaultOptions.scaleMode).toBe('nearest');
    expect(app.init).toHaveBeenCalledOnce();
    expect(app.init).toHaveBeenCalledWith({
      width: 1_280,
      height: 800,
      antialias: false,
      autoDensity: true,
      resolution: 2,
      backgroundColor: 0x0f0d0a,
    });
    expect(app.stage.scale.set).toHaveBeenCalledWith(2);
    expect(app.stage.addChild).toHaveBeenCalledWith(scenes.view);
    expect(append).toHaveBeenCalledWith(app.canvas);
    expect(app.canvas.className).toBe('game-canvas');
    expect(app.canvas.style).toMatchObject({
      imageRendering: 'pixelated',
      width: '1280px',
      height: '800px',
      left: '320px',
      top: '140px',
    });
    expect(app.canvas.dataset.fits).toBe('true');
    expect(resizeListeners.size).toBe(1);

    clientWidth = 640;
    clientHeight = 400;
    resizeListeners.forEach((listener) => listener());
    expect(app.canvas.style).toMatchObject({
      width: '640px',
      height: '400px',
      left: '0px',
      top: '0px',
    });
    expect(app.canvas.dataset.fits).toBe('true');

    clientWidth = 639;
    clientHeight = 399;
    resizeListeners.forEach((listener) => listener());
    expect(app.canvas.style).toMatchObject({
      width: '640px',
      height: '400px',
      left: '-1px',
      top: '-1px',
    });
    expect(app.canvas.dataset.fits).toBe('false');

    mounted.destroy();
    expect(resizeListeners.size).toBe(0);
    expect(windowDouble.removeEventListener).toHaveBeenCalledOnce();
    expect(scenes.destroy).toHaveBeenCalledOnce();
    expect(app.destroy).toHaveBeenCalledWith(
      { removeView: true },
      { children: true, texture: true },
    );
  });
});
