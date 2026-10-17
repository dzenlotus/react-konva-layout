import type Konva from 'konva';
import type { SceneNode } from '../model';
import type { Bounds } from '../host';
import type { Island, Settings } from './scene';

export interface CacheEntry {
  group: Konva.Group;
  reserved: number;
}

/** Powers of two avoid rebuilding caches on every zoom step; downsizing has hysteresis. */
export function cacheDensity(scale: number, pixelRatio: number, previous = 1): number {
  const product = scale * pixelRatio;
  const required = Math.max(0.25, Number.isNaN(product) ? 1 : product);
  const current = Number.isFinite(previous) && previous > 0 ? Math.max(0.25, previous) : 1;
  if (required <= current && required > current * 0.45) return current;
  const next = 2 ** Math.ceil(Math.log2(required));
  return Number.isFinite(next) ? next : Number.MAX_VALUE;
}

export function allocatedCacheBytes(group: Konva.Group): number {
  const cache = group._getCanvasCache();
  if (!cache) return 0;
  return [cache.scene, cache.filter, cache.hit].reduce(
    (bytes, canvas) => bytes + (canvas ? canvas.width * canvas.height * 4 : 0),
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
  if (
    allowed &&
    config.cache &&
    island.item.props.cache !== false &&
    (island.complex || island.item.props.cache === true)
  ) {
    const bounds = group.getClientRect({ skipTransform: true });
    if (
      bounds.width > 0 &&
      bounds.height > 0 &&
      [bounds.x, bounds.y, bounds.width, bounds.height].every(Number.isFinite)
    ) {
      actualBounds.set(island.item, {
        ...bounds,
        x: bounds.x + island.item.layout.absoluteX,
        y: bounds.y + island.item.layout.absoluteY,
      });
      const ratio = config.cacheRatio;
      const width = Math.ceil(bounds.width + 4),
        height = Math.ceil(bounds.height + 4);
      // Reserve scene + hit + filter surfaces, including future lazy allocations.
      const reserved =
        4 * (Math.ceil(width * ratio) * Math.ceil(height * ratio) * 2 + width * height);
      const used = [...entries.values()].reduce((bytes, entry) => bytes + entry.reserved, 0);
      if (Number.isFinite(reserved) && reserved <= config.budget - used) {
        group.cache({
          x: Math.floor(bounds.x) - 2,
          y: Math.floor(bounds.y) - 2,
          width,
          height,
          pixelRatio: ratio,
          hitCanvasPixelRatio: 1,
        });
        if (group.isCached()) entries.set(island.key, { group, reserved });
      }
    }
  }
  return () => {
    group.clearCache();
    if (entries.get(island.key)?.group === group) entries.delete(island.key);
  };
}
