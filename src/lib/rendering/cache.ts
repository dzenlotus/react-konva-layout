import type Konva from 'konva';
import type { SceneNode } from '../model';
import type { Bounds } from '../host';
import type { Island, Settings } from './scene';

export interface CacheEntry {
  group: Konva.Group;
  reserved: number;
}

export const MIN_CACHE_DENSITY = 1 / 64;
const DENSITY_DOWNSIZE_THRESHOLD = 0.45;
const OVERVIEW_DOWNSIZE_THRESHOLD = 0.35;
const OVERVIEW_CACHE_DENSITY = 1 / 8;
const CACHE_PADDING = 2;
const BYTES_PER_PIXEL = 4;

/** Powers of two avoid rebuilding caches on every zoom step; downsizing has hysteresis. */
export function cacheDensity(scale: number, pixelRatio: number, previous = 1): number {
  const product = scale * pixelRatio;
  const required = Math.max(MIN_CACHE_DENSITY, Number.isNaN(product) ? 1 : product);
  const current =
    Number.isFinite(previous) && previous > 0 ? Math.max(MIN_CACHE_DENSITY, previous) : 1;
  // Keep tiny overview bitmaps stable across narrow pinch ranges around a density boundary.
  const threshold =
    current <= OVERVIEW_CACHE_DENSITY ? OVERVIEW_DOWNSIZE_THRESHOLD : DENSITY_DOWNSIZE_THRESHOLD;
  if (required <= current && required > current * threshold) return current;
  const next = 2 ** Math.ceil(Math.log2(required));
  return Number.isFinite(next) ? next : Number.MAX_VALUE;
}

export function allocatedCacheBytes(group: Konva.Group): number {
  const cache = group._getCanvasCache();
  if (!cache) return 0;
  return [cache.scene, cache.filter, cache.hit].reduce(
    (bytes, canvas) => bytes + (canvas ? canvas.width * canvas.height * BYTES_PER_PIXEL : 0),
    0,
  );
}

export function releaseRoot(entries: Map<string, CacheEntry>, key: string) {
  entries.get(key)?.group.clearCache();
  entries.delete(key);
}

/** Only visible, revised roots or density changes inspect bounds; pan reuses recorded bounds. */
export function cacheRoot(
  entries: Map<string, CacheEntry>,
  actualBounds: WeakMap<SceneNode, Bounds>,
  island: Island,
  group: Konva.Group,
  allowed: boolean,
  config: Settings,
): () => void {
  releaseRoot(entries, island.key);
  const release = () => {
    group.clearCache();
    if (entries.get(island.key)?.group === group) entries.delete(island.key);
  };
  const shouldCache =
    allowed &&
    config.cache &&
    island.item.props.cache !== false &&
    (island.complex || island.item.props.cache === true);
  if (!shouldCache) return release;

  const bounds = group.getClientRect({ skipTransform: true });
  if (
    bounds.width <= 0 ||
    bounds.height <= 0 ||
    ![bounds.x, bounds.y, bounds.width, bounds.height].every(Number.isFinite)
  )
    return release;

  actualBounds.set(island.item, {
    ...bounds,
    x: bounds.x + island.item.layout.absoluteX,
    y: bounds.y + island.item.layout.absoluteY,
  });
  const ratio = config.cacheRatio;
  const hitRatio = Math.min(1, ratio);
  const width = Math.ceil(bounds.width + CACHE_PADDING * 2);
  const height = Math.ceil(bounds.height + CACHE_PADDING * 2);
  // Konva allocates its filter surface lazily; plain groups only need scene + hit.
  const sceneSurfaces = group.filters()?.length ? 2 : 1;
  const reserved =
    BYTES_PER_PIXEL *
    (Math.ceil(width * ratio) * Math.ceil(height * ratio) * sceneSurfaces +
      Math.ceil(width * hitRatio) * Math.ceil(height * hitRatio));
  let used = 0;
  for (const entry of entries.values()) used += entry.reserved;
  if (!(Number.isFinite(reserved) && reserved <= config.budget - used)) return release;

  group.cache({
    x: Math.floor(bounds.x) - CACHE_PADDING,
    y: Math.floor(bounds.y) - CACHE_PADDING,
    width,
    height,
    pixelRatio: ratio,
    hitCanvasPixelRatio: hitRatio,
  });
  if (group.isCached()) entries.set(island.key, { group, reserved });
  return release;
}
