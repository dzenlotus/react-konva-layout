import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import Konva from 'konva';
import type { SceneNode } from '../model';
import type { LayoutNode, PerformanceOptions, RenderMetrics } from '../types';
import { openTextEditor } from '../editor';
import { observeHost, readHost, type Bounds, type HostState } from '../host';
import { DrawNode } from './DrawNode';
import { MinimalScene } from './MinimalScene';
import { FullScene } from './FullScene';
import {
  allocatedCacheBytes,
  cacheDensity,
  cacheRoot,
  releaseRoot,
  type CacheEntry,
} from './cache';
import {
  compileIslands,
  intersects,
  settings,
  type BeginEdit,
  type Island,
  type Settings,
} from './scene';

export interface RendererProps {
  scene: SceneNode[];
  root: Konva.Group | null;
  performance?: PerformanceOptions;
  onRenderStats?: (metrics: RenderMetrics) => void;
  onInvalidate?: (id?: string) => void;
  onFocusRequest?: (node: LayoutNode) => void;
}

interface SceneSelection {
  items: Island[];
  lod: boolean;
  minimal: boolean;
}
interface EditSession {
  item: SceneNode;
  target: Konva.Text;
  islandKey: string;
  changed: boolean;
  editor?: ReturnType<typeof openTextEditor>;
}

function findNode(scene: SceneNode[], id: string): SceneNode | undefined {
  for (const item of scene) {
    if (item.layout.id === id) return item;
    const found = findNode(item.children, id);
    if (found) return found;
  }
}

const VIEWPORT_PADDING = 32;
const MINIMAL_LOD_SCALE = 0.12;

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

/** Keep an active editor mounted when its layout root leaves the viewport. */
function selectIslands(
  islands: Island[],
  host: HostState | null,
  config: Settings,
  actualBounds: WeakMap<SceneNode, Bounds>,
  editingKey?: string,
): Island[] {
  if (!host?.visible) return [];
  if (!config.cull) return islands;
  const viewport = {
    x: host.viewport.x - VIEWPORT_PADDING,
    y: host.viewport.y - VIEWPORT_PADDING,
    width: host.viewport.width + VIEWPORT_PADDING * 2,
    height: host.viewport.height + VIEWPORT_PADDING * 2,
  };
  return islands.filter(
    (island) =>
      island.key === editingKey ||
      intersects(actualBounds.get(island.item) ?? island.bounds, viewport),
  );
}

function sameSelection(
  previous: SceneSelection,
  items: Island[],
  lod: boolean,
  minimal: boolean,
): boolean {
  return (
    previous.lod === lod &&
    previous.minimal === minimal &&
    previous.items.length === items.length &&
    previous.items.every((item, index) => item === items[index])
  );
}

/** Renders Konva children inside a host-owned Group, Stage and Layer. */
export default memo(function Renderer({
  scene,
  root,
  performance,
  onRenderStats,
  onInvalidate,
  onFocusRequest,
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
      performance?.lodScale,
      density,
    ],
  );
  const islands = useMemo(() => compileIslands(scene), [scene]);
  const configRef = useRef(config);
  const islandsRef = useRef(islands);
  const rootRef = useRef(root);
  const callbacks = useRef({ onRenderStats, onInvalidate, onFocusRequest });
  const mounted = useRef(true);
  const statsFrame = useRef(0);
  const entries = useRef(new Map<string, CacheEntry>());
  const actualBounds = useRef(new WeakMap<SceneNode, Bounds>());
  const editingRef = useRef<EditSession | null>(null);
  const [editingKey, setEditingKey] = useState<string>();
  const [selection, setSelection] = useState<SceneSelection>({
    items: [],
    lod: false,
    minimal: false,
  });
  const selectionRef = useRef(selection);
  configRef.current = config;
  islandsRef.current = islands;
  rootRef.current = root;
  callbacks.current = { onRenderStats, onInvalidate, onFocusRequest };
  selectionRef.current = selection;

  const report = useCallback(() => {
    if (!mounted.current || statsFrame.current) return;
    statsFrame.current = requestAnimationFrame(() => {
      statsFrame.current = 0;
      const drawing = rootRef.current;
      if (!mounted.current || !drawing) return;
      const { groups, shapes } = countKonvaNodes(drawing);
      const { items, lod, minimal } = selectionRef.current;
      callbacks.current.onRenderStats?.({
        visibleRoots: countLayoutRoots(configRef.current.enabled ? items : islandsRef.current),
        totalRoots: countLayoutRoots(islandsRef.current),
        cachedRoots: entries.current.size,
        cacheBytes: sumCacheBytes(entries.current),
        lod,
        lodLevel: lod ? (minimal ? 'minimal' : 'labels') : 'full',
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
      editingRef.current?.islandKey,
    );
    const lod = Boolean(host && host.scale < currentConfig.lodScale);
    const minimal = Boolean(lod && host && host.scale < MINIMAL_LOD_SCALE);
    const previous = selectionRef.current;
    if (!sameSelection(previous, next, lod, minimal)) {
      const selected = { items: next, lod, minimal };
      selectionRef.current = selected;
      setSelection(selected);
    }
  }, []);

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

  const finishEdit = useCallback(
    (saved: boolean) => {
      const current = editingRef.current;
      if (!current) return;
      editingRef.current = null;
      current.editor?.();
      if (mounted.current) setEditingKey(undefined);
      if (saved && current.changed) callbacks.current.onInvalidate?.(current.item.layout.id);
      current.item.props.onEditEnd?.(saved);
      if (mounted.current) selectVisible();
      report();
    },
    [report, selectVisible],
  );

  const beginEdit = useCallback<BeginEdit>(
    (item, target, islandKey) => {
      if (editingRef.current || !item.props.editable || !item.textStyle) return;
      releaseRoot(entries.current, islandKey);
      const current: EditSession = { item, target, islandKey, changed: false };
      editingRef.current = current;
      setEditingKey(islandKey);
      item.props.onEditStart?.();
      current.editor = openTextEditor({
        target,
        node: item.layout,
        textStyle: item.textStyle,
        onCommit: (value) => {
          current.changed = true;
          current.item.props.onTextChange?.(value);
        },
        onClose: finishEdit,
      });
      report();
    },
    [finishEdit, report],
  );

  const requestFocus = useCallback((island: Island) => {
    callbacks.current.onFocusRequest?.(island.item.layout);
  }, []);

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
  }, [islands, config, selectVisible, report]);
  useLayoutEffect(() => {
    report();
  }, [selection, scene, editingKey, report]);

  useLayoutEffect(() => {
    const current = editingRef.current;
    if (!current) return;
    const next = findNode(scene, current.item.layout.id);
    if (!next?.props.editable || !next.textStyle || !root?.isAncestorOf(current.target)) {
      finishEdit(false);
      return;
    }
    current.item = next;
    current.editor?.update(next.layout, next.textStyle);
  }, [scene, root, config.compact, config.enabled, finishEdit]);

  useEffect(() => {
    mounted.current = true;
    report();
    return () => {
      mounted.current = false;
      cancelAnimationFrame(statsFrame.current);
      statsFrame.current = 0;
      entries.current.forEach((entry) => entry.group.clearCache());
      entries.current.clear();
      finishEdit(false);
    };
  }, [finishEdit, report]);

  if (!root) return null;
  return config.enabled ? (
    <>
      <FullScene
        scene={scene}
        allIslands={islands}
        islands={selection.items}
        config={config}
        lod={selection.lod}
        minimal={selection.minimal}
        editingKey={editingKey}
        beginEdit={beginEdit}
        requestFocus={requestFocus}
        register={register}
      />
      {selection.minimal && (
        <MinimalScene
          islands={selection.items.filter((island) => !island.shell && island.key !== editingKey)}
          config={config}
          root={root}
          beginEdit={beginEdit}
          requestFocus={requestFocus}
          register={register}
        />
      )}
    </>
  ) : (
    scene.map((item) => (
      <DrawNode
        key={item.key}
        item={item}
        compact={false}
        optimized={false}
        islandKey={item.key}
        beginEdit={beginEdit}
      />
    ))
  );
});
