import type { ViewTransform } from '../lib';

const MIN_ZOOM = 0.02;
const MAX_ZOOM = 8;

export function clampZoom(scale: number): number {
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, scale));
}

export function finiteOr(value: number | undefined, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

export function normalizeView(next: Partial<ViewTransform>): ViewTransform {
  return {
    x: finiteOr(next.x, 0),
    y: finiteOr(next.y, 0),
    scale: clampZoom(finiteOr(next.scale, 1)),
  };
}

/** Demo persistence belongs to the application; the library only observes its Stage. */
export function readSavedView(search: string): ViewTransform {
  const params = new URLSearchParams(search);
  const number = (key: string) => {
    const value = params.get(key);
    return value === null || value.trim() === '' ? undefined : Number(value);
  };
  return normalizeView({ x: number('x'), y: number('y'), scale: number('zoom') });
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
