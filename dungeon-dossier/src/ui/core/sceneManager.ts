import { Container } from 'pixi.js';

/** A one-shot scene or overlay whose Pixi container is owned by the manager. */
export interface ManagedUiLayer {
  readonly view: Container;
  onEnter?(): void;
  onExit?(): void;
  onDestroy?(): void;
}

export interface SceneStackState<T> {
  readonly scene: T | null;
  readonly overlays: readonly T[];
}

export type SceneStackAction<T> =
  | Readonly<{ type: 'SET_SCENE'; scene: T | null }>
  | Readonly<{ type: 'PUSH_OVERLAY'; overlay: T }>
  | Readonly<{ type: 'REMOVE_OVERLAY'; overlay: T }>
  | Readonly<{ type: 'CLEAR_OVERLAYS' }>;

export function createSceneStackState<T>(): SceneStackState<T> {
  return { scene: null, overlays: [] };
}

/** Pure stack transition used by the Pixi adapter and unit-testable without a renderer. */
export function reduceSceneStack<T>(
  state: SceneStackState<T>,
  action: SceneStackAction<T>,
): SceneStackState<T> {
  switch (action.type) {
    case 'SET_SCENE':
      return { scene: action.scene, overlays: [] };
    case 'PUSH_OVERLAY':
      return { scene: state.scene, overlays: [...state.overlays, action.overlay] };
    case 'REMOVE_OVERLAY':
      return {
        scene: state.scene,
        overlays: state.overlays.filter((overlay) => overlay !== action.overlay),
      };
    case 'CLEAR_OVERLAYS':
      return state.overlays.length === 0 ? state : { scene: state.scene, overlays: [] };
  }
}

/**
 * Owns the active scene and overlay containers. Managed layers are one-shot:
 * leaving the stack destroys their containers but deliberately preserves shared textures.
 */
export class SceneManager {
  readonly view = new Container();
  readonly sceneLayer = new Container();
  readonly overlayLayer = new Container();

  #state: SceneStackState<ManagedUiLayer> = createSceneStackState();
  #destroyed = false;

  constructor() {
    this.view.addChild(this.sceneLayer, this.overlayLayer);
  }

  get scene(): ManagedUiLayer | null {
    return this.#state.scene;
  }

  get overlays(): readonly ManagedUiLayer[] {
    return this.#state.overlays;
  }

  setScene(scene: ManagedUiLayer | null): void {
    this.#assertAlive();
    if (scene === this.#state.scene) return;
    this.#assertNotManaged(scene);

    const previous = this.#state;
    this.#state = reduceSceneStack(previous, { type: 'SET_SCENE', scene });

    for (const overlay of [...previous.overlays].reverse()) {
      this.#release(overlay);
    }
    if (previous.scene !== null) this.#release(previous.scene);

    if (scene !== null) this.#mount(scene, this.sceneLayer);
  }

  /** Pushes an overlay and returns an idempotent disposer for that exact overlay. */
  showOverlay(overlay: ManagedUiLayer): () => void {
    this.#assertAlive();
    this.#assertNotManaged(overlay);
    this.#state = reduceSceneStack(this.#state, { type: 'PUSH_OVERLAY', overlay });

    try {
      this.#mount(overlay, this.overlayLayer);
    } catch (error) {
      this.#state = reduceSceneStack(this.#state, { type: 'REMOVE_OVERLAY', overlay });
      throw error;
    }

    let disposed = false;
    return () => {
      if (disposed) return;
      disposed = true;
      this.hideOverlay(overlay);
    };
  }

  /** Removes one overlay. With no argument, removes the top-most overlay. */
  hideOverlay(overlay: ManagedUiLayer | null = null): void {
    if (this.#destroyed) return;
    const target = overlay ?? this.#state.overlays.at(-1) ?? null;
    if (target === null || !this.#state.overlays.includes(target)) return;

    this.#state = reduceSceneStack(this.#state, { type: 'REMOVE_OVERLAY', overlay: target });
    this.#release(target);
  }

  clearOverlays(): void {
    if (this.#destroyed || this.#state.overlays.length === 0) return;
    const overlays = [...this.#state.overlays].reverse();
    this.#state = reduceSceneStack(this.#state, { type: 'CLEAR_OVERLAYS' });
    for (const overlay of overlays) this.#release(overlay);
  }

  destroy(): void {
    if (this.#destroyed) return;
    this.clearOverlays();

    const scene = this.#state.scene;
    this.#state = createSceneStackState();
    if (scene !== null) this.#release(scene);

    this.#destroyed = true;
    this.view.removeFromParent();
    this.view.destroy({ children: true });
  }

  #mount(layer: ManagedUiLayer, parent: Container): void {
    parent.addChild(layer.view);
    try {
      layer.onEnter?.();
    } catch (error) {
      this.#release(layer, false);
      throw error;
    }
  }

  #release(layer: ManagedUiLayer, callExit = true): void {
    try {
      if (callExit) layer.onExit?.();
    } finally {
      layer.view.removeFromParent();
      try {
        layer.onDestroy?.();
      } finally {
        layer.view.destroy({ children: true });
      }
    }
  }

  #assertNotManaged(layer: ManagedUiLayer | null): void {
    if (layer === null) return;
    if (layer === this.#state.scene || this.#state.overlays.includes(layer)) {
      throw new Error('A UI layer cannot be mounted more than once.');
    }
    if (layer.view.destroyed) {
      throw new Error('A destroyed UI layer cannot be mounted.');
    }
  }

  #assertAlive(): void {
    if (this.#destroyed) throw new Error('SceneManager has been destroyed.');
  }
}
