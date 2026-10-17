import type { ViewTransform } from '../lib';

const MIN_ZOOM = 0.02;
const MAX_ZOOM = 8;

export function clampZoom(scale: number): number {
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, scale));
}

export function finiteOr(value: number | undefined, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

/** Keep the same world point under the cursor while changing camera scale. */
export function zoomAtPoint(
  view: ViewTransform,
  point: { x: number; y: number },
  scale: number,
): ViewTransform {
  return {
    scale,
    x: point.x - ((point.x - view.x) / view.scale) * scale,
    y: point.y - ((point.y - view.y) / view.scale) * scale,
  };
}
