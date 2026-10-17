import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import Konva from 'konva';
import type { SceneNode } from '../model';
import type { LayoutPlacement, PerformanceOptions, RenderMetrics } from '../types';
import { observeHost, readHost, type Bounds, type HostState } from '../host';
import { DrawNode } from './DrawNode';
import { FullScene } from './FullScene';
import { resolvePlacements } from './placements';
import { allocatedCacheBytes, cacheDensity, cacheRoot, type CacheEntry } from './cache';
import {
  compileIslands,
  countLodCells,
  intersects,
  settings,
  type Island,
  type Settings,
} from './scene';

export interface RendererProps {
  scene: SceneNode[];
  root: Konva.Group | null;
  performance?: PerformanceOptions;
  placements?: readonly LayoutPlacement[];
  onRenderStats?: (metrics: RenderMetrics) => void;
}

const VIEWPORT_PADDING = 32;

function countKonvaNodes(root: Konva.Group): { groups: number; shapes: number } {
  let groups = 0;
  let shapes = 0;
  const visit = (node: Konva.Node) => {
    if (node.nodeType === 'Group') groups++;
    if (node.nodeType === 'Shape') shapes++;
    if (node instanceof Konva.Container) node.getChildren().forEach(visit);
  };
  root.getChildren().forEach(visit);
  return { groups, shapes };
}

function countLayoutRoots(islands: Island[]): number {
  let count = 0;
  for (const island of islands) if (!island.shell) count++;
  return count;
}

function sumCacheBytes(entries: Map<string, CacheEntry>): number {
  let bytes = 0;
  for (const entry of entries.values()) bytes += allocatedCacheBytes(entry.group);
  return bytes;
}

/** Select visible layout roots using the host camera and recorded logical bounds. */
function selectIslands(
  islands: Island[],
  host: HostState | null,
  config: Settings,
  actualBounds: WeakMap<SceneNode, Bounds>,
  placements: Map<string, LayoutPlacement>,
  dragging: Set<string>,
): Island[] {
  if (!host?.visible) return [];
  if (!config.cull) return islands;
  const viewport = {
    x: host.viewport.x - VIEWPORT_PADDING,
    y: host.viewport.y - VIEWPORT_PADDING,
    width: host.viewport.width + VIEWPORT_PADDING * 2,
    height: host.viewport.height + VIEWPORT_PADDING * 2,
  };
  return islands.filter((island) => {
    if (dragging.has(island.key)) return true;
    const bounds = actualBounds.get(island.item) ?? island.bounds;
    const placement = placements.get(island.key);
    return intersects(
      placement
        ? {
            ...bounds,
            x: bounds.x + placement.x - island.item.layout.absoluteX,
            y: bounds.y + placement.y - island.item.layout.absoluteY,
          }
        : bounds,
      viewport,
    );
  });
}

function sameSelection(previous: Island[], items: Island[]): boolean {
  return previous.length === items.length && previous.every((item, index) => item === items[index]);
}

/** Renders Konva children inside a host-owned Group, Stage and Layer. */
export default memo(function Renderer({
  scene,
  root,
  performance,
  placements,
  onRenderStats,
}: RendererProps) {
  const [density, setDensity] = useState(1);
  const densityRef = useRef(density);
  const fixedRatio = performance?.cachePixelRatio;
  const automaticDensity = useRef(true);
  automaticDensity.current =
    typeof fixedRatio !== 'number' || !Number.isFinite(fixedRatio) || fixedRatio <= 0;
  const config = useMemo(
    () => settings(performance, density),
    [
      performance?.enabled,
      performance?.compact,
      performance?.cull,
      performance?.overscan,
      performance?.cache,
      performance?.cacheBudgetMB,
      performance?.cachePixelRatio,
      density,
    ],
  );
  const islands = useMemo(() => compileIslands(scene), [scene]);
  const placed = useMemo(() => resolvePlacements(islands, placements), [islands, placements]);
  const placementsRef = useRef(new Map<string, LayoutPlacement>());
  placementsRef.current = new Map(placed.map(({ island, placement }) => [island.key, placement]));
  const dragging = useRef(new Set<string>());
  const dragFrame = useRef(0);
  const configRef = useRef(config);
  const islandsRef = useRef(islands);
  const sceneRef = useRef(scene);
  const rootRef = useRef(root);
  const callbacks = useRef({ onRenderStats });
  const mounted = useRef(true);
  const statsFrame = useRef(0);
  const entries = useRef(new Map<string, CacheEntry>());
  const actualBounds = useRef(new WeakMap<SceneNode, Bounds>());
  const [selection, setSelection] = useState<Island[]>([]);
  const selectionRef = useRef(selection);
  configRef.current = config;
  islandsRef.current = islands;
  sceneRef.current = scene;
  rootRef.current = root;
  callbacks.current = { onRenderStats };
  selectionRef.current = selection;

  const report = useCallback(() => {
    if (!mounted.current || statsFrame.current) return;
    statsFrame.current = requestAnimationFrame(() => {
      statsFrame.current = 0;
      const drawing = rootRef.current;
      if (!mounted.current || !drawing) return;
      const { groups, shapes } = countKonvaNodes(drawing);
      const optimized = configRef.current.enabled;
      const visible = optimized ? selectionRef.current : islandsRef.current;
      let lodCells = 0;
      if (optimized) {
        for (const island of visible) lodCells += countLodCells(island.item);
      } else {
        for (const item of sceneRef.current) lodCells += countLodCells(item);
      }
      callbacks.current.onRenderStats?.({
        visibleRoots: countLayoutRoots(visible),
        totalRoots: countLayoutRoots(islandsRef.current),
        cachedRoots: entries.current.size,
        cacheBytes: sumCacheBytes(entries.current),
        lod: lodCells > 0,
        lodLevel: lodCells > 0 ? 'cell' : 'full',
        lodCells,
        groups,
        shapes,
      });
    });
  }, []);

  const selectVisible = useCallback(() => {
    const currentRoot = rootRef.current;
    const currentConfig = configRef.current;
    const host = currentRoot ? readHost(currentRoot, currentConfig.overscan) : null;
    if (host && automaticDensity.current) {
      const nextDensity = cacheDensity(host.scale, host.pixelRatio, densityRef.current);
      if (nextDensity !== densityRef.current) {
        densityRef.current = nextDensity;
        setDensity(nextDensity);
      }
    }
    const next = selectIslands(
      islandsRef.current,
      host,
      currentConfig,
      actualBounds.current,
      placementsRef.current,
      dragging.current,
    );
    const previous = selectionRef.current;
    if (!sameSelection(previous, next)) {
      selectionRef.current = next;
      setSelection(next);
    }
  }, []);

  const onDragState = useCallback(
    (key: string, active: boolean) => {
      if (active) {
        dragging.current.add(key);
        selectVisible();
      } else if (dragging.current.delete(key) && mounted.current) {
        // The application commits final coordinates in onDragEnd's React batch.
        cancelAnimationFrame(dragFrame.current);
        dragFrame.current = requestAnimationFrame(() => {
          dragFrame.current = 0;
          selectVisible();
        });
      }
    },
    [selectVisible],
  );

  const register = useCallback(
    (island: Island, group: Konva.Group, allowed: boolean) => {
      const release = cacheRoot(
        entries.current,
        actualBounds.current,
        island,
        group,
        allowed,
        configRef.current,
      );
      report();
      return () => {
        release();
        report();
      };
    },
    [report],
  );

  useLayoutEffect(() => {
    if (!root) return;
    return observeHost(root, () => {
      selectVisible();
      report();
    });
  }, [root, selectVisible, report]);

  useLayoutEffect(() => {
    selectVisible();
    report();
  }, [islands, placed, config, selectVisible, report]);
  useLayoutEffect(() => {
    report();
  }, [selection, scene, report]);

  useEffect(() => {
    mounted.current = true;
    report();
    return () => {
      mounted.current = false;
      cancelAnimationFrame(statsFrame.current);
      cancelAnimationFrame(dragFrame.current);
      statsFrame.current = 0;
      dragFrame.current = 0;
      dragging.current.clear();
      entries.current.forEach((entry) => entry.group.clearCache());
      entries.current.clear();
    };
  }, [report]);

  if (!root) return null;
  if (!config.enabled && placed.length === 0) {
    return scene.map((item) => (
      <DrawNode key={item.key} item={item} compact={false} optimized={false} />
    ));
  }
  return (
    <FullScene
      scene={scene}
      allIslands={islands}
      islands={config.enabled ? selection : islands}
      placed={placed}
      onDragState={onDragState}
      config={config}
      register={register}
    />
  );
});
