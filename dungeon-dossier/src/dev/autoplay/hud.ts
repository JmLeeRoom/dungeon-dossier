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
  /** Present in cinematic video mode: run budget for the countdown banner. */
  readonly targetDurationMs?: number;
  readonly nodeLabel?: string;
}

export interface AutoplayHud {
  update(view: AutoplayHudView): void;
  /** Cinematic beat: caption chip plus a virtual-cursor glide over the canvas. */
  showAction(caption: string): void;
  destroy(): void;
}

const PANEL_STYLE = [
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

const BANNER_STYLE = [
  'position: fixed',
  'top: 10px',
  'left: 50%',
  'transform: translateX(-50%)',
  'z-index: 2147483647',
  'padding: 8px 18px',
  'background: rgba(10, 10, 14, 0.92)',
  'color: #f3e3b3',
  'border: 2px solid #b9973f',
  'border-radius: 6px',
  'font: 13px/1.6 "Consolas", "Courier New", monospace',
  'white-space: pre',
  'pointer-events: none',
  'text-align: center',
  'box-shadow: 0 0 14px rgba(185, 151, 63, 0.45)',
].join('; ');

const CAPTION_STYLE = [
  'position: fixed',
  'top: 76px',
  'left: 50%',
  'transform: translateX(-50%)',
  'z-index: 2147483647',
  'padding: 4px 14px',
  'background: rgba(16, 34, 38, 0.92)',
  'color: #8fe8e8',
  'border: 1px solid #2f8f8f',
  'border-radius: 12px',
  'font: 12px/1.5 "Consolas", "Courier New", monospace',
  'pointer-events: none',
  'opacity: 0',
  'transition: opacity 0.25s ease',
  'box-shadow: 0 0 10px rgba(87, 230, 230, 0.4)',
].join('; ');

const CURSOR_STYLE = [
  'position: fixed',
  'z-index: 2147483647',
  'font-size: 26px',
  'pointer-events: none',
  'opacity: 0',
  'transform: translate(-50%, -50%)',
  'transition: left 1.2s cubic-bezier(0.45, 0, 0.25, 1), top 1.2s cubic-bezier(0.45, 0, 0.25, 1), opacity 0.2s ease',
  'text-shadow: 0 0 10px rgba(87, 230, 230, 0.9), 0 0 22px rgba(87, 230, 230, 0.6)',
].join('; ');

/** Cursor movement starts before the staged game action is allowed to fire. */
export const AUTOPLAY_CURSOR_DOCK_START_MS = 0;

const TRAIL_STYLE = [
  'position: fixed',
  'z-index: 2147483646',
  'height: 0',
  'border-top: 2px dashed #57e6e6',
  'transform-origin: 0 50%',
  'pointer-events: none',
  'opacity: 0',
  'transition: opacity 0.3s ease',
  'box-shadow: 0 0 8px rgba(87, 230, 230, 0.8)',
].join('; ');

function formatClock(milliseconds: number): string {
  const totalSeconds = Math.max(0, Math.floor(milliseconds / 1000));
  const minutes = Math.floor(totalSeconds / 60).toString().padStart(2, '0');
  const seconds = (totalSeconds % 60).toString().padStart(2, '0');
  return `${minutes}:${seconds}`;
}

function progressBar(ratio: number, width = 26): string {
  const clamped = Math.min(1, Math.max(0, ratio));
  const filled = Math.round(clamped * width);
  return `[${'▓'.repeat(filled)}${'░'.repeat(width - filled)}] ${Math.round(clamped * 100).toString()}%`;
}

function canvasRect(): DOMRect | undefined {
  const canvas = document.querySelector<HTMLCanvasElement>('#game-root canvas') ??
    document.querySelector<HTMLCanvasElement>('canvas');
  const rect = canvas?.getBoundingClientRect();
  return rect !== undefined && rect.width > 0 ? rect : undefined;
}

export function createAutoplayHud(): AutoplayHud {
  const panel = document.createElement('div');
  panel.id = 'dd-autoplay-hud';
  panel.setAttribute('style', PANEL_STYLE);
  panel.textContent = 'AUTOPLAY · starting';
  document.body.append(panel);

  const banner = document.createElement('div');
  banner.id = 'dd-autoplay-banner';
  banner.setAttribute('style', BANNER_STYLE);
  banner.style.display = 'none';
  document.body.append(banner);

  const caption = document.createElement('div');
  caption.id = 'dd-autoplay-caption';
  caption.setAttribute('style', CAPTION_STYLE);
  document.body.append(caption);

  const cursor = document.createElement('div');
  cursor.id = 'dd-autoplay-cursor';
  cursor.setAttribute('style', CURSOR_STYLE);
  cursor.textContent = '🔍';
  document.body.append(cursor);

  const trail = document.createElement('div');
  trail.id = 'dd-autoplay-trail';
  trail.setAttribute('style', TRAIL_STYLE);
  document.body.append(trail);

  let actionSide = 1;
  let captionTimer: number | undefined;
  let cursorTimer: number | undefined;

  return {
    update(view: AutoplayHudView): void {
      if (view.targetDurationMs === undefined) {
        banner.style.display = 'none';
        panel.style.display = 'block';
        const seconds = (view.elapsedMs / 1000).toFixed(1);
        const lines = [
          `AUTOPLAY ${view.status}`,
          `node  ${view.nodeIndex.toString()}/${view.nodeCount.toString()}`,
          `scene ${view.sceneKind}`,
          `run   ${view.mode}/${view.policy} seed=${view.seed.toString()}`,
          `time  ${seconds}s`,
        ];
        if (view.failure !== undefined) lines.push(`fail  ${view.failure}`);
        panel.textContent = lines.join('\n');
        panel.style.color = view.failure === undefined ? '#d8f3d8' : '#f3c7c7';
        panel.style.borderColor = view.failure === undefined ? '#3d5c3d' : '#7c3a3a';
        return;
      }

      // Cinematic broadcast banner: the corner debug panel stays hidden so the
      // recording only carries the scoreboard, timer, and progress strip.
      panel.style.display = 'none';
      banner.style.display = 'block';
      const nodeNumber = Math.min(view.nodeIndex + 1, view.nodeCount);
      const heading = view.failure !== undefined
        ? `⛔ 시연 중단 — ${view.failure}`
        : view.status === 'PASS'
          ? '✅ 수사 완료 — 자백 확보 성공'
          // The run length is data, not a caption: the strip resolves to nine
          // nodes today and the banner used to claim fifteen.
          : `🎬 ${view.nodeCount.toString()}-NODE CINEMATIC DEMO  |  NODE ${nodeNumber
              .toString()
              .padStart(2, '0')} / ${view.nodeCount.toString()}${
              view.nodeLabel === undefined ? '' : `: ${view.nodeLabel}`
            }  |  ⏱️ ${formatClock(view.elapsedMs)} / ${formatClock(view.targetDurationMs)}`;
      banner.textContent = `${heading}\n${progressBar(view.elapsedMs / view.targetDurationMs)}`;
      banner.style.borderColor = view.failure === undefined ? '#b9973f' : '#a04040';
      banner.style.color = view.failure === undefined ? '#f3e3b3' : '#f3c7c7';
    },
    showAction(caption_: string): void {
      caption.textContent = `▶ ${caption_}`;
      caption.style.opacity = '1';
      if (captionTimer !== undefined) window.clearTimeout(captionTimer);
      captionTimer = window.setTimeout(() => {
        caption.style.opacity = '0';
      }, 1_600);

      const rect = canvasRect();
      if (rect === undefined) return;
      actionSide = -actionSide;
      const startX = rect.left + rect.width * (0.5 + actionSide * 0.14);
      const startY = rect.top + rect.height * 0.88;
      const endX = rect.left + rect.width * (0.5 - actionSide * 0.08);
      const endY = rect.top + rect.height * 0.36;

      // Dotted docking preview between the hand zone and the statement tags.
      const distance = Math.hypot(endX - startX, endY - startY);
      const angle = Math.atan2(endY - startY, endX - startX);
      trail.style.left = `${startX.toString()}px`;
      trail.style.top = `${startY.toString()}px`;
      trail.style.width = `${distance.toString()}px`;
      trail.style.transform = `rotate(${angle.toString()}rad)`;
      trail.style.opacity = '1';

      cursor.style.transition = 'opacity 0.2s ease';
      cursor.style.left = `${startX.toString()}px`;
      cursor.style.top = `${startY.toString()}px`;
      cursor.style.opacity = '1';
      // Commit the starting position so the next task begins a real CSS
      // transition instead of coalescing both positions into one paint.
      void cursor.getBoundingClientRect();
      window.setTimeout(() => {
        cursor.style.transition = CURSOR_STYLE
          .split('; ')
          .find((rule) => rule.startsWith('transition: '))
          ?.slice('transition: '.length) ?? '';
        cursor.style.left = `${endX.toString()}px`;
        cursor.style.top = `${endY.toString()}px`;
      }, AUTOPLAY_CURSOR_DOCK_START_MS);
      if (cursorTimer !== undefined) window.clearTimeout(cursorTimer);
      cursorTimer = window.setTimeout(() => {
        cursor.style.opacity = '0';
        trail.style.opacity = '0';
      }, 1_450);
    },
    destroy(): void {
      if (captionTimer !== undefined) window.clearTimeout(captionTimer);
      if (cursorTimer !== undefined) window.clearTimeout(cursorTimer);
      panel.remove();
      banner.remove();
      caption.remove();
      cursor.remove();
      trail.remove();
    },
  };
}
