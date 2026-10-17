import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import Konva from 'konva';
import type { SceneNode } from '../model';
import type { LayoutNode, PerformanceOptions, RenderMetrics } from '../types';
import { openTextEditor } from '../editor';
import { observeHost, readHost, type Bounds } from '../host';
import { DrawNode, type BeginEdit } from './DrawNode';
import { MinimalScene } from './MinimalScene';
import { FullScene } from './FullScene';
import {
  allocatedCacheBytes,
  cacheDensity,
  cacheRoot,
  releaseRoot,
  type CacheEntry,
} from './cache';
import { compileIslands, intersects, settings, type Island } from './scene';

export interface RendererProps {
  scene: SceneNode[];
  root: Konva.Group | null;
  performance?: PerformanceOptions;
  onRenderStats?: (metrics: RenderMetrics) => void;
  onInvalidate?: (id?: string) => void;
  onFocusRequest?: (node: LayoutNode) => void;
}

interface Selection {
  items: Island[];
  lod: boolean;
  minimal: boolean;
}
interface Editing {
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
  const configRef = useRef(config),
    islandsRef = useRef(islands),
    rootRef = useRef(root);
  const callbacks = useRef({ onRenderStats, onInvalidate, onFocusRequest });
  const mounted = useRef(true),
    statsFrame = useRef(0);
  const entries = useRef(new Map<string, CacheEntry>());
  const actualBounds = useRef(new WeakMap<SceneNode, Bounds>());
  const editingRef = useRef<Editing | null>(null);
  const [editingKey, setEditingKey] = useState<string>();
  const [selection, setSelection] = useState<Selection>({ items: [], lod: false, minimal: false });
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
      let groups = 0,
        shapes = 0;
      const count = (node: Konva.Node) => {
        if (node.nodeType === 'Group') groups++;
        if (node.nodeType === 'Shape') shapes++;
        if (node instanceof Konva.Container) node.getChildren().forEach(count);
      };
      drawing.getChildren().forEach(count);
      const { items, lod, minimal } = selectionRef.current;
      callbacks.current.onRenderStats?.({
        visibleRoots: (configRef.current.enabled ? items : islandsRef.current).filter(
          (item) => !item.shell,
        ).length,
        totalRoots: islandsRef.current.filter((item) => !item.shell).length,
        cachedRoots: entries.current.size,
        cacheBytes: [...entries.current.values()].reduce(
          (bytes, entry) => bytes + allocatedCacheBytes(entry.group),
          0,
        ),
        lod,
        lodLevel: lod ? (minimal ? 'minimal' : 'labels') : 'full',
        groups,
        shapes,
      });
    });
  }, []);

  const selectVisible = useCallback(() => {
    const currentRoot = rootRef.current,
      config = configRef.current;
    const host = currentRoot && readHost(currentRoot, config.overscan);
    if (host && automaticDensity.current) {
      const nextDensity = cacheDensity(host.scale, host.pixelRatio, densityRef.current);
      if (nextDensity !== densityRef.current) {
        densityRef.current = nextDensity;
        setDensity(nextDensity);
      }
    }
    const viewport = host && {
      x: host.viewport.x - 32,
      y: host.viewport.y - 32,
      width: host.viewport.width + 64,
      height: host.viewport.height + 64,
    };
    const next =
      !host || !host.visible
        ? []
        : config.cull
          ? islandsRef.current.filter(
              (island) =>
                island.key === editingRef.current?.islandKey ||
                intersects(actualBounds.current.get(island.item) ?? island.bounds, viewport!),
            )
          : islandsRef.current;
    const lod = Boolean(host && host.scale < config.lodScale);
    const minimal = Boolean(lod && host && host.scale < 0.12);
    const previous = selectionRef.current;
    if (
      previous.lod !== lod ||
      previous.minimal !== minimal ||
      previous.items.length !== next.length ||
      previous.items.some((item, index) => item !== next[index])
    ) {
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
      const current: Editing = { item, target, islandKey, changed: false };
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
