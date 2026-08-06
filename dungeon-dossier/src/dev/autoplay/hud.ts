export interface AutoplayHudView {
  readonly nodeIndex: number;
  readonly nodeCount: number;
  readonly sceneKind: string;
  readonly mode: string;
  readonly policy: string;
  readonly seed: number;
  readonly elapsedMs: number;
  readonly status: string;
  readonly failure?: string;
}

export interface AutoplayHud {
  update(view: AutoplayHudView): void;
  destroy(): void;
}

const HUD_STYLE = [
  'position: fixed',
  'top: 8px',
  'right: 8px',
  'z-index: 2147483647',
  'padding: 8px 10px',
  'background: rgba(12, 12, 16, 0.88)',
  'color: #d8f3d8',
  'border: 1px solid #3d5c3d',
  'border-radius: 4px',
  'font: 11px/1.5 "Consolas", "Courier New", monospace',
  'white-space: pre',
  'pointer-events: none',
  'text-align: left',
].join('; ');

export function createAutoplayHud(): AutoplayHud {
  const root = document.createElement('div');
  root.id = 'dd-autoplay-hud';
  root.setAttribute('style', HUD_STYLE);
  root.textContent = 'AUTOPLAY · starting';
  document.body.append(root);
  return {
    update(view: AutoplayHudView): void {
      const seconds = (view.elapsedMs / 1000).toFixed(1);
      const lines = [
        `AUTOPLAY ${view.status}`,
        `node  ${view.nodeIndex.toString()}/${view.nodeCount.toString()}`,
        `scene ${view.sceneKind}`,
        `run   ${view.mode}/${view.policy} seed=${view.seed.toString()}`,
        `time  ${seconds}s`,
      ];
      if (view.failure !== undefined) lines.push(`fail  ${view.failure}`);
      root.textContent = lines.join('\n');
      root.style.color = view.failure === undefined ? '#d8f3d8' : '#f3c7c7';
      root.style.borderColor = view.failure === undefined ? '#3d5c3d' : '#7c3a3a';
    },
    destroy(): void {
      root.remove();
    },
  };
}
