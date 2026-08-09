export const INTERNAL_WIDTH = 640;
export const INTERNAL_HEIGHT = 400;
export const HD_WIDTH = 1280;
export const HD_HEIGHT = 800;
export const DEFAULT_TARGET_SCALE = 2;

export interface IntegerViewport {
  readonly scale: number;
  readonly width: number;
  readonly height: number;
  readonly offsetX: number;
  readonly offsetY: number;
  readonly fits: boolean;
}

export function calculateIntegerViewport(containerWidth: number, containerHeight: number): IntegerViewport {
  const availableScale = Math.min(
    containerWidth / INTERNAL_WIDTH,
    containerHeight / INTERNAL_HEIGHT,
  );
  // Keep the authored 2x ceiling, but scale continuously below 800px tall.
  // A 720p viewport therefore displays at 1.8x instead of collapsing to 1x.
  const renderScale = Math.min(DEFAULT_TARGET_SCALE, Math.max(1, availableScale));
  const width = INTERNAL_WIDTH * renderScale;
  const height = INTERNAL_HEIGHT * renderScale;

  return {
    scale: renderScale,
    width,
    height,
    offsetX: Math.floor((containerWidth - width) / 2),
    offsetY: Math.floor((containerHeight - height) / 2),
    fits: availableScale >= renderScale,
  };
}
