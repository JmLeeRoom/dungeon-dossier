import { Application, TextureSource } from 'pixi.js';
import { calculateIntegerViewport, INTERNAL_HEIGHT, INTERNAL_WIDTH } from './integerScale';
import { SceneManager } from './sceneManager';

export interface MountedGameApplication {
  readonly app: Application;
  readonly scenes: SceneManager;
  destroy(): void;
}

export async function createGameApplication(mount: HTMLElement): Promise<MountedGameApplication> {
  TextureSource.defaultOptions.scaleMode = 'nearest';

  const app = new Application();
  await app.init({
    width: INTERNAL_WIDTH,
    height: INTERNAL_HEIGHT,
    antialias: false,
    autoDensity: false,
    resolution: 1,
    backgroundColor: 0x101018,
  });

  const canvas = app.canvas;
  canvas.className = 'game-canvas';
  canvas.style.imageRendering = 'pixelated';
  mount.append(canvas);
  const scenes = new SceneManager();
  app.stage.addChild(scenes.view);

  const resize = (): void => {
    const viewport = calculateIntegerViewport(mount.clientWidth, mount.clientHeight);
    canvas.style.width = `${viewport.width}px`;
    canvas.style.height = `${viewport.height}px`;
    canvas.style.left = `${viewport.offsetX}px`;
    canvas.style.top = `${viewport.offsetY}px`;
    canvas.dataset.fits = String(viewport.fits);
  };

  resize();
  window.addEventListener('resize', resize);

  return {
    app,
    scenes,
    destroy(): void {
      window.removeEventListener('resize', resize);
      scenes.destroy();
      app.destroy({ removeView: true }, { children: true, texture: true });
    },
  };
}
