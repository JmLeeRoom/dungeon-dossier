export const INTERNAL_WIDTH = 640;
export const INTERNAL_HEIGHT = 400;

export interface IntegerViewport {
  readonly scale: number;
  readonly width: number;
  readonly height: number;
  readonly offsetX: number;
  readonly offsetY: number;
  readonly fits: boolean;
}

export function calculateIntegerViewport(containerWidth: number, containerHeight: number): IntegerViewport {
  const scale = Math.floor(
    Math.min(containerWidth / INTERNAL_WIDTH, containerHeight / INTERNAL_HEIGHT),
  );
  // Default to 2x (1280x800) when container is unconstrained or >= 1280x800
  const renderScale = Math.max(2, scale);
  const width = INTERNAL_WIDTH * renderScale;
  const height = INTERNAL_HEIGHT * renderScale;

  return {
    scale: renderScale,
    width,
    height,
    offsetX: Math.floor((containerWidth - width) / 2),
    offsetY: Math.floor((containerHeight - height) / 2),
    fits: scale >= 1,
  };
}

