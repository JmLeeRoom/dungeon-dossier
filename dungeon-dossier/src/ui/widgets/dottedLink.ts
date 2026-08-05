export interface LinkPoint {
  readonly x: number;
  readonly y: number;
}

export interface DottedLinkSegment {
  readonly from: LinkPoint;
  readonly to: LinkPoint;
}

export interface DottedLinkOptions {
  readonly dashLength?: number;
  readonly gapLength?: number;
  readonly samples?: number;
  /** Perpendicular bow of the stippled curve, in stage pixels. */
  readonly curve?: number;
}

function quadraticPoint(from: LinkPoint, control: LinkPoint, to: LinkPoint, t: number): LinkPoint {
  const inverse = 1 - t;
  return {
    x: inverse * inverse * from.x + 2 * inverse * t * control.x + t * t * to.x,
    y: inverse * inverse * from.y + 2 * inverse * t * control.y + t * t * to.y,
  };
}

export function dottedLinkControlPoint(
  from: LinkPoint,
  to: LinkPoint,
  curve: number,
): LinkPoint {
  const midpoint = { x: (from.x + to.x) / 2, y: (from.y + to.y) / 2 };
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const length = Math.hypot(dx, dy);
  if (length === 0) return midpoint;
  return {
    x: midpoint.x + (-dy / length) * curve,
    y: midpoint.y + (dx / length) * curve,
  };
}

/**
 * Walks a quadratic curve at a fixed arc step and emits alternating dash/gap
 * segments. Returning plain segments keeps the stipple pattern testable without
 * a renderer.
 */
export function dottedLinkSegments(
  from: LinkPoint,
  to: LinkPoint,
  options: DottedLinkOptions = {},
): readonly DottedLinkSegment[] {
  const dashLength = Math.max(1, options.dashLength ?? 6);
  const gapLength = Math.max(1, options.gapLength ?? 4);
  const samples = Math.max(2, Math.floor(options.samples ?? 48));
  const control = dottedLinkControlPoint(from, to, options.curve ?? 0);

  const points = Array.from({ length: samples + 1 }, (_, index) =>
    quadraticPoint(from, control, to, index / samples),
  );

  const segments: DottedLinkSegment[] = [];
  const period = dashLength + gapLength;
  let travelled = 0;
  let dashStart: LinkPoint | undefined = points[0];

  for (let index = 1; index < points.length; index += 1) {
    const previous = points[index - 1] as LinkPoint;
    const current = points[index] as LinkPoint;
    const step = Math.hypot(current.x - previous.x, current.y - previous.y);
    const phaseBefore = travelled % period;
    travelled += step;
    const phaseAfter = travelled % period;
    const inDash = phaseBefore < dashLength;
    const nextInDash = phaseAfter < dashLength;

    if (inDash && dashStart === undefined) dashStart = previous;
    if (inDash && !nextInDash && dashStart !== undefined) {
      segments.push({ from: dashStart, to: current });
      dashStart = undefined;
    }
    if (!inDash && nextInDash) dashStart = current;
  }

  const tail = points.at(-1);
  if (dashStart !== undefined && tail !== undefined && dashStart !== tail) {
    segments.push({ from: dashStart, to: tail });
  }
  return segments;
}
