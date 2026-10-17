import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import { flushSync, unstable_batchedUpdates } from 'react-dom';
import type Konva from 'konva';
import { Layer, Rect, Stage } from 'react-konva';
import { Flex, Layout } from '../lib';
import type {
  LayoutHandle,
  LayoutMetrics,
  LayoutNode,
  LayoutPlacement,
  RenderMetrics,
  ViewTransform,
} from '../lib';
import { DEFAULT_NODE_ACTIONS, ReferenceNode } from './ReferenceNode';
import type { ReferenceNodeAction } from './ReferenceNode';
import { DESCRIPTION } from './DesignedStressScene';
import { normalizeView, readSavedView, zoomAtPoint } from './camera';
import {
  createFreeNodes,
  createGridNodes,
  fitFreeNodes,
  FREE_NODE_COUNT,
  FREE_NODE_HEIGHT,
  FREE_NODE_WIDTH,
  INITIAL_SEED,
  INITIAL_VIEW,
  scatterFreeNodes,
  shuffled,
} from './freeNodesModel';
import type { FreeNodePosition } from './freeNodesModel';
import { referenceNodeDetail } from './referenceNodeDetail';
import type { ReferenceNodeDetail } from './referenceNodeDetail';
import { useDemoGestures } from './useDemoGestures';
import { useCameraHitGraph } from './useCameraHitGraph';
import { measureFreeSceneMount } from '../benchmarks/freeMount';
import type { FreeMountResult, FreeSceneStats, SceneArrangement } from '../benchmarks/freeMount';
import { runInteractionBenchmark } from '../benchmarks/freeScene';
import type { InteractionOptions, InteractionResult } from '../benchmarks/freeScene';
import './free-nodes.css';

type DescriptionSetter = (value: string) => void;
type RegisterDescription = (id: string, setter: DescriptionSetter | null) => void;
type NodeActions = {
  items: readonly ReferenceNodeAction[];
  set: Dispatch<SetStateAction<readonly ReferenceNodeAction[]>>;
};
type RegisterActions = (id: string, actions: NodeActions | null) => void;
type PlacementEvent = Konva.KonvaEventObject<Event>;
type NodeDrag = { group: Konva.Group; parent: Konva.Container };

const INITIAL_NODES = createFreeNodes();
const PERFORMANCE = { cacheBudgetMB: 32, overscan: 100 };
const EXPECTED_PRIMITIVES = 35_001;
const nextFrame = () => new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));

type BenchmarkInteraction = Pick<
  InteractionOptions,
  'kind' | 'view' | 'zoomRange' | 'panAmplitude' | 'durationMs' | 'warmupMs'
> & { targetId?: string };

function countTree(nodes: readonly LayoutNode[], counts: WeakMap<LayoutNode, number>): number {
  let total = 0;
  for (const node of nodes) {
    let count = counts.get(node);
    if (count === undefined) {
      count = 1 + countTree(node.children, counts);
      counts.set(node, count);
    }
    total += count;
  }
  return total;
}

interface FreeNodesApi {
  stage(): Konva.Stage | null;
  layout(): LayoutHandle | null;
  nodes(): FreeNodePosition[];
  order(): string[];
  selected(): string | null;
  select(id: string | null): void;
  move(id: string, position: { x: number; y: number }): void;
  reorder(ids: readonly string[]): void;
  scatter(): void;
  setDescription(id: string, text: string): void;
  actions(id: string): ReferenceNodeAction[];
  setActions(id: string, actions: readonly ReferenceNodeAction[]): void;
  view(): ViewTransform;
  setView(view: Partial<ViewTransform>): void;
  stats(): FreeSceneStats;
  benchmark: {
    mount(options: {
      arrangement: SceneArrangement;
      view?: ViewTransform;
    }): Promise<FreeMountResult>;
    interact(options: BenchmarkInteraction): Promise<InteractionResult>;
  };
}

declare global {
  interface Window {
    freeNodes?: FreeNodesApi;
  }
}

const FreeNodeContent = memo(function FreeNodeContent({
  id,
  index,
  previewImage,
  registerDescription,
  registerActions,
  showPreview,
  showDescription,
  showActions,
}: {
  id: string;
  index: number;
  previewImage: HTMLImageElement;
  registerDescription: RegisterDescription;
  registerActions: RegisterActions;
} & ReferenceNodeDetail) {
  const [description, setDescription] = useState(DESCRIPTION);
  const [actions, setActions] = useState(DEFAULT_NODE_ACTIONS);
  useEffect(() => {
    registerDescription(id, setDescription);
    return () => registerDescription(id, null);
  }, [id, registerDescription]);
  useLayoutEffect(() => {
    registerActions(id, { items: actions, set: setActions });
    return () => registerActions(id, null);
  }, [id, actions, registerActions]);
  return (
    <ReferenceNode
      id={id}
      width={FREE_NODE_WIDTH}
      layoutTemplate="free-node-v1"
      footerLabel={`node_${String(index + 1).padStart(4, '0')}`}
      previewImage={previewImage}
      description={description}
      onDescriptionChange={setDescription}
      actions={actions}
      showPreview={showPreview}
      showDescription={showDescription}
      showActions={showActions}
    />
  );
});

/** An application-owned graph: data, z-order, native dragging and camera are external to Layout. */
export default function FreeNodesExample() {
  const stage = useRef<Konva.Stage | null>(null);
  const layout = useRef<LayoutHandle | null>(null);
  const sceneLayer = useRef<Konva.Layer | null>(null);
  const dragLayer = useRef<Konva.Layer | null>(null);
  const selectionOutline = useRef<Konva.Rect | null>(null);
  const coordinateStatus = useRef<HTMLSpanElement | null>(null);
  const zoomOutput = useRef<HTMLOutputElement | null>(null);
  const activeDrag = useRef<NodeDrag | null>(null);
  const applyingCamera = useRef(false);
  const container = useRef<HTMLDivElement | null>(null);
  const [benchmarkMode] = useState(() =>
    new URLSearchParams(window.location.search).has('benchmark'),
  );
  const [viewport, setViewport] = useState(() =>
    benchmarkMode ? { width: 1400, height: 760 } : { width: 1200, height: 680 },
  );
  const [mountConfig, setMountConfig] = useState({
    mounted: true,
    generation: 0,
    arrangement: 'free' as SceneArrangement,
  });
  const [nodes, setNodes] = useState(() => INITIAL_NODES);
  const [order, setOrder] = useState(() =>
    shuffled(
      INITIAL_NODES.map((node) => node.id),
      INITIAL_SEED,
    ),
  );
  const [selected, setSelected] = useState<string | null>(null);
  const [, setDragging] = useState(false);
  const [previewImage, setPreviewImage] = useState<HTMLImageElement>();
  const [imageError, setImageError] = useState(false);
  const [metrics, setMetrics] = useState<LayoutMetrics | null>(null);
  const [renderStats, setRenderStats] = useState<RenderMetrics | null>(null);
  const [initialView] = useState<ViewTransform>(() => {
    const params = new URLSearchParams(window.location.search);
    return params.has('zoom') || params.has('x') || params.has('y')
      ? readSavedView(window.location.search)
      : INITIAL_VIEW;
  });
  const [detail, setDetail] = useState(() => referenceNodeDetail(initialView.scale));
  const detailRef = useRef(detail);
  const nodesRef = useRef(nodes);
  const orderRef = useRef(order);
  const selectedRef = useRef(selected);
  const viewRef = useRef(initialView);
  const seed = useRef(INITIAL_SEED);
  const descriptions = useRef(new Map<string, DescriptionSetter>());
  const nodeActions = useRef(new Map<string, NodeActions>());
  const actionCountDelta = useRef(0);
  const nextActionId = useRef(0);
  const measurementRef = useRef<LayoutMetrics | null>(null);
  const measurementAt = useRef<{ at: number; metrics: LayoutMetrics } | null>(null);
  const renderingRef = useRef<RenderMetrics | null>(null);
  const primitiveCount = useRef(0);
  const primitiveCounts = useRef(new WeakMap<LayoutNode, number>());
  const imageReady = useRef<Promise<HTMLImageElement> | null>(null);
  const mountBusy = useRef(false);
  const arrangementRef = useRef(mountConfig.arrangement);
  arrangementRef.current = mountConfig.arrangement;
  nodesRef.current = nodes;
  orderRef.current = order;
  selectedRef.current = selected;

  useLayoutEffect(() => {
    const current = stage.current;
    if (!current) return;
    // Initialize before the image/content mounts; subsequent camera updates are native.
    current.position(initialView);
    current.scale({ x: initialView.scale, y: initialView.scale });
    current.batchDraw();
  }, [initialView]);

  const stopActiveDrag = useCallback(() => activeDrag.current?.group.stopDrag(), []);

  useEffect(() => {
    const current = stage.current;
    if (!current) return;
    const events =
      'xChange.freeNodeDrag yChange.freeNodeDrag scaleXChange.freeNodeDrag scaleYChange.freeNodeDrag widthChange.freeNodeDrag heightChange.freeNodeDrag';
    // A camera/viewport transition ends the gesture before culling can reorder
    // React-owned siblings around the temporarily reparented native Group.
    current.on(events, stopActiveDrag);
    return () => {
      current.off('.freeNodeDrag');
    };
  }, [stopActiveDrag]);

  useLayoutEffect(() => {
    const drag = activeDrag.current;
    const overlay = dragLayer.current;
    if (!drag || !overlay || !drag.group.isDragging() || drag.group.getLayer() === overlay) return;
    // Wait for the selection React commit before moving its native Group.
    // Only this app-owned layer is redrawn during drag; the other 999 cards stay still.
    const position = drag.group.getAbsolutePosition();
    const sceneLayer = drag.group.getLayer();
    drag.group.moveTo(overlay);
    drag.group.absolutePosition(position);
    selectionOutline.current?.moveToTop();
    sceneLayer?.batchDraw();
    overlay.batchDraw();
  });

  useLayoutEffect(
    () => () => {
      const drag = activeDrag.current;
      activeDrag.current = null;
      if (!drag) return;
      if (drag.group.getStage() && drag.parent.getStage()) drag.group.moveTo(drag.parent);
      drag.group.stopDrag();
    },
    [],
  );

  const cameraChanged = useCameraHitGraph(stage, sceneLayer);

  const recordCamera = useCallback((current: ViewTransform) => {
    viewRef.current = current;
    if (zoomOutput.current)
      zoomOutput.current.textContent = String(Math.round(current.scale * 100));
    const nextDetail = referenceNodeDetail(current.scale);
    const previous = detailRef.current;
    if (
      previous.showPreview !== nextDetail.showPreview ||
      previous.showDescription !== nextDetail.showDescription ||
      previous.showActions !== nextDetail.showActions
    ) {
      detailRef.current = nextDetail;
      setDetail(nextDetail);
    }
  }, []);

  useEffect(() => {
    const current = stage.current;
    if (!current) return;
    const syncCamera = () => {
      if (!applyingCamera.current) recordCamera({ ...current.position(), scale: current.scaleX() });
    };
    const events =
      'xChange.freeNodeView yChange.freeNodeView scaleXChange.freeNodeView scaleYChange.freeNodeView';
    current.on(events, syncCamera);
    return () => {
      current.off('.freeNodeView');
    };
  }, [recordCamera]);

  const setCamera = useCallback(
    (next: Partial<ViewTransform>) => {
      stopActiveDrag();
      const current = normalizeView({ ...viewRef.current, ...next });
      const native = stage.current;
      if (
        native &&
        (native.x() !== current.x ||
          native.y() !== current.y ||
          native.scaleX() !== current.scale ||
          native.scaleY() !== current.scale)
      ) {
        cameraChanged();
        applyingCamera.current = true;
        try {
          native.position(current);
          native.scale({ x: current.scale, y: current.scale });
          native.batchDraw();
        } finally {
          applyingCamera.current = false;
        }
      }
      // Native camera updates stay off the React render path between Cell LOD changes.
      recordCamera(current);
    },
    [stopActiveDrag, cameraChanged, recordCamera],
  );
  useDemoGestures(stage, true, viewRef, setCamera);

  useEffect(() => {
    if (benchmarkMode) return;
    const host = container.current;
    if (!host) return;
    const observer = new ResizeObserver(([entry]) => {
      setViewport({ width: entry.contentRect.width, height: entry.contentRect.height });
    });
    observer.observe(host);
    return () => observer.disconnect();
  }, [benchmarkMode]);

  useEffect(() => {
    let active = true;
    const image = new Image();
    image.src = `${import.meta.env.BASE_URL}node-preview.jpg`;
    const ready = Promise.all([image.decode(), document.fonts.ready]).then(() => image);
    imageReady.current = ready;
    ready.then(
      () => {
        if (active) setPreviewImage(image);
      },
      () => {
        if (active) setImageError(true);
      },
    );
    return () => {
      active = false;
    };
  }, []);

  const onLayout = useCallback((tree: LayoutNode[]) => {
    primitiveCount.current = countTree(tree, primitiveCounts.current);
  }, []);
  const onMeasure = useCallback((next: LayoutMetrics) => {
    measurementRef.current = next;
    if (next.scope !== 'visual') measurementAt.current = { at: performance.now(), metrics: next };
    setMetrics(next);
  }, []);
  const onRenderStats = useCallback((next: RenderMetrics) => {
    renderingRef.current = next;
    setRenderStats(next);
  }, []);

  const stats = useCallback((): FreeSceneStats => {
    const current = stage.current;
    const model = layout.current?.getLayout('free-world');
    const cards = model?.children.length ?? 0;
    const positions = nodesRef.current;
    let minX = Infinity,
      minY = Infinity,
      maxX = -Infinity,
      maxY = -Infinity;
    for (const position of positions) {
      minX = Math.min(minX, position.x);
      minY = Math.min(minY, position.y);
      maxX = Math.max(maxX, position.x + FREE_NODE_WIDTH);
      maxY = Math.max(maxY, position.y + FREE_NODE_HEIGHT);
    }
    const idleHtmlNodes = container.current?.querySelectorAll('[data-layout-key]').length ?? 0;
    const attachedMeasurementRoots =
      container.current?.querySelectorAll('.konva-layout-measure').length ?? 0;
    const renderedCards = renderingRef.current?.visibleRoots ?? 0;
    return {
      mode: 'optimized',
      arrangement: arrangementRef.current,
      cards,
      primitives: primitiveCount.current,
      renderedCards,
      measurement: measurementRef.current,
      rendering: renderingRef.current,
      idleHtmlNodes,
      attachedMeasurementRoots,
      viewportWidth: current?.width() ?? 0,
      viewportHeight: current?.height() ?? 0,
      devicePixelRatio: window.devicePixelRatio,
      canvasPixelRatio: current?.getLayers()[0]?.getCanvas().getPixelRatio() ?? 1,
      worldBounds: { x: minX, y: minY, width: maxX - minX, height: maxY - minY },
      worldWidth: maxX - minX,
      worldHeight: maxY - minY,
      complete:
        cards === FREE_NODE_COUNT &&
        primitiveCount.current === EXPECTED_PRIMITIVES + actionCountDelta.current &&
        renderedCards > 0 &&
        idleHtmlNodes === 0 &&
        attachedMeasurementRoots === 0,
    };
  }, []);

  const benchmarkMount = useCallback(
    async ({
      arrangement,
      view: requestedView,
    }: {
      arrangement: SceneArrangement;
      view?: ViewTransform;
    }): Promise<FreeMountResult> => {
      if (!benchmarkMode)
        throw new Error('Open ?nodes=1&benchmark=1 for the fixed 1400×760 benchmark viewport.');
      if (mountBusy.current) throw new Error('A mount benchmark is already running.');
      if (arrangement !== 'free' && arrangement !== 'grid')
        throw new Error('Unknown scene arrangement.');
      mountBusy.current = true;
      try {
        stopActiveDrag();
        if (!imageReady.current) throw new Error('The preview asset is not ready.');
        await imageReady.current;
        await document.fonts.ready;
        flushSync(() => setMountConfig((previous) => ({ ...previous, mounted: false })));
        await nextFrame();
        await nextFrame();
        const nextNodes = arrangement === 'grid' ? createGridNodes() : createFreeNodes();
        const camera = normalizeView(requestedView ?? { x: 0, y: 0, scale: 1 });
        flushSync(() => {
          setNodes(nextNodes);
          setOrder(
            arrangement === 'grid'
              ? nextNodes.map((node) => node.id)
              : shuffled(
                  nextNodes.map((node) => node.id),
                  INITIAL_SEED,
                ),
          );
          setSelected(null);
          setCamera(camera);
          setMountConfig((previous) => ({ ...previous, arrangement }));
        });
        measurementRef.current = null;
        measurementAt.current = null;
        renderingRef.current = null;
        primitiveCount.current = 0;
        const current = stage.current;
        if (!current) throw new Error('The benchmark Stage is not mounted.');
        return await measureFreeSceneMount({
          stage: current,
          view: camera,
          stats,
          getModel: () => layout.current?.getLayout('free-world'),
          getPositions: () => nodesRef.current,
          getMeasurement: () => measurementAt.current,
          mount: () =>
            flushSync(() =>
              setMountConfig((previous) => ({
                ...previous,
                mounted: true,
                generation: previous.generation + 1,
              })),
            ),
        });
      } finally {
        mountBusy.current = false;
      }
    },
    [benchmarkMode, setCamera, stats, stopActiveDrag],
  );

  const benchmarkInteract = useCallback(
    (options: BenchmarkInteraction) => {
      const current = stage.current;
      if (mountBusy.current || !current || !stats().complete)
        throw new Error('Mount a complete scene before benchmarking interaction.');
      const { targetId = 'free-node-0000', ...interaction } = options;
      return runInteractionBenchmark({
        ...interaction,
        stage: current,
        setView: setCamera,
        stats,
        getTarget: () =>
          (current.find((node: Konva.Node) => node.getAttr('layoutRootId') === targetId)[0] as
            Konva.Group | undefined) ?? null,
      });
    },
    [setCamera, stats],
  );

  const registerDescription = useCallback<RegisterDescription>((id, setter) => {
    if (setter) descriptions.current.set(id, setter);
    else descriptions.current.delete(id);
  }, []);

  const registerActions = useCallback<RegisterActions>((id, actions) => {
    const previous = nodeActions.current.get(id);
    actionCountDelta.current +=
      (actions?.items.length ?? DEFAULT_NODE_ACTIONS.length) -
      (previous?.items.length ?? DEFAULT_NODE_ACTIONS.length);
    if (actions) nodeActions.current.set(id, actions);
    else nodeActions.current.delete(id);
  }, []);

  const setActions = useCallback(
    (id: string, actions: readonly ReferenceNodeAction[]) => {
      const current = nodeActions.current.get(id);
      if (!current) throw new Error(`Node content is not ready: ${id}`);
      if (
        actions.some(
          (action) => !action.id || (action.kind !== 'run' && action.kind !== 'settings'),
        ) ||
        new Set(actions.map((action) => action.id)).size !== actions.length
      )
        throw new Error('Actions need unique, nonempty IDs and a run/settings kind.');
      stopActiveDrag();
      current.set(actions.map((action) => ({ ...action })));
    },
    [stopActiveDrag],
  );

  const changeSelectedActions = useCallback(
    (operation: 'add' | 'remove' | 'reverse') => {
      const id = selectedRef.current;
      const current = id ? nodeActions.current.get(id) : undefined;
      if (!current) return;
      stopActiveDrag();
      let actionId = '';
      if (operation === 'add') {
        do actionId = `action-${++nextActionId.current}`;
        while (current.items.some((action) => action.id === actionId));
      }
      current.set((previous) => {
        if (operation === 'remove') return previous.slice(0, -1);
        if (operation === 'reverse') return [...previous].reverse();
        if (previous.length >= 12) return previous;
        return [...previous, { id: actionId, kind: previous.length % 2 ? 'settings' : 'run' }];
      });
    },
    [stopActiveDrag],
  );

  const select = useCallback(
    (id: string | null, group?: Konva.Group) => {
      if (id && !nodesRef.current.some((node) => node.id === id))
        throw new Error(`Unknown node: ${id}`);
      if (activeDrag.current && activeDrag.current.group.getAttr('layoutRootId') !== id)
        stopActiveDrag();
      setSelected(id);
      if (!id) return;
      const target =
        group ?? stage.current?.find((node: Konva.Node) => node.getAttr('layoutRootId') === id)[0];
      target?.moveToTop();
      setOrder((previous) =>
        previous.at(-1) === id ? previous : [...previous.filter((value) => value !== id), id],
      );
    },
    [stopActiveDrag],
  );

  const move = useCallback(
    (id: string, position: { x: number; y: number }) => {
      if (!nodesRef.current.some((node) => node.id === id)) throw new Error(`Unknown node: ${id}`);
      if (!Number.isFinite(position.x) || !Number.isFinite(position.y))
        throw new Error('Node coordinates must be finite.');
      stopActiveDrag();
      setNodes((previous) =>
        previous.map((node) => (node.id === id ? { ...node, ...position } : node)),
      );
    },
    [stopActiveDrag],
  );

  const reorder = useCallback(
    (ids: readonly string[]) => {
      const known = new Set(nodesRef.current.map((node) => node.id));
      if (
        ids.length !== known.size ||
        new Set(ids).size !== known.size ||
        ids.some((id) => !known.has(id))
      ) {
        throw new Error('Order must contain every node ID exactly once.');
      }
      stopActiveDrag();
      setOrder([...ids]);
    },
    [stopActiveDrag],
  );

  const scatter = useCallback(() => {
    stopActiveDrag();
    seed.current++;
    setNodes((previous) => scatterFreeNodes(previous, seed.current));
    setSelected(null);
    setCamera(INITIAL_VIEW);
  }, [setCamera, stopActiveDrag]);

  const reset = useCallback(() => {
    stopActiveDrag();
    seed.current = INITIAL_SEED;
    setNodes(createFreeNodes());
    setOrder(
      shuffled(
        INITIAL_NODES.map((node) => node.id),
        INITIAL_SEED,
      ),
    );
    setSelected(null);
    setCamera(INITIAL_VIEW);
  }, [setCamera, stopActiveDrag]);

  const onSelect = useCallback(
    (event: PlacementEvent) => {
      select(
        event.currentTarget.getAttr('layoutRootId') as string,
        event.currentTarget as Konva.Group,
      );
    },
    [select],
  );
  const onDragStart = useCallback((event: PlacementEvent) => {
    if (event.target !== event.currentTarget) return;
    const group = event.currentTarget as Konva.Group;
    const parent = group.getParent();
    if (!parent) return;
    activeDrag.current = { group, parent };
    // React 16 does not batch state updates from Konva's native event handlers.
    unstable_batchedUpdates(() => {
      setSelected(group.getAttr('layoutRootId') as string);
      setDragging(true);
    });
  }, []);
  const onDragMove = useCallback((event: PlacementEvent) => {
    if (event.target !== event.currentTarget) return;
    const { x, y } = event.currentTarget.position();
    selectionOutline.current?.position({ x: x - 4, y: y - 4 });
    if (coordinateStatus.current)
      coordinateStatus.current.textContent = `${event.currentTarget.getAttr('layoutRootId')} · x ${Math.round(x)}, y ${Math.round(y)}`;
  }, []);
  const onDragEnd = useCallback(
    (event: PlacementEvent) => {
      if (event.target !== event.currentTarget) return;
      const drag = activeDrag.current;
      if (!drag || drag.group !== event.currentTarget) return;
      activeDrag.current = null;
      // Restore React's native parent before committing the new external coordinates.
      const position = drag.group.getAbsolutePosition();
      drag.group.moveTo(drag.parent);
      drag.group.absolutePosition(position);
      const id = drag.group.getAttr('layoutRootId') as string;
      unstable_batchedUpdates(() => {
        move(id, drag.group.position());
        setOrder((previous) =>
          previous.at(-1) === id ? previous : [...previous.filter((value) => value !== id), id],
        );
        setDragging(false);
      });
      dragLayer.current?.batchDraw();
    },
    [move],
  );

  const nodeById = useMemo(() => new Map(nodes.map((node) => [node.id, node])), [nodes]);
  const placements = useMemo<LayoutPlacement[]>(
    () =>
      order.map((id) => ({
        ...nodeById.get(id)!,
        draggable: true,
        onClick: onSelect,
        onTap: onSelect,
        onDragStart,
        onDragMove,
        onDragEnd,
      })),
    [nodeById, order, onSelect, onDragStart, onDragMove, onDragEnd],
  );
  const { showPreview, showDescription, showActions } = detail;
  // Coordinates, selection and z-order never enter the HTML measurement tree.
  const content = useMemo(
    () =>
      previewImage ? (
        <Flex id="free-world" width={FREE_NODE_WIDTH} height={FREE_NODE_HEIGHT}>
          {INITIAL_NODES.map((node, index) => (
            <FreeNodeContent
              key={node.id}
              id={node.id}
              index={index}
              previewImage={previewImage}
              registerDescription={registerDescription}
              registerActions={registerActions}
              showPreview={showPreview}
              showDescription={showDescription}
              showActions={showActions}
            />
          ))}
        </Flex>
      ) : null,
    [previewImage, registerDescription, registerActions, showPreview, showDescription, showActions],
  );

  useEffect(() => {
    const api: FreeNodesApi = {
      stage: () => stage.current,
      layout: () => layout.current,
      nodes: () => nodesRef.current.map((node) => ({ ...node })),
      order: () => [...orderRef.current],
      selected: () => selectedRef.current,
      select,
      move,
      reorder,
      scatter,
      setDescription: (id, text) => {
        const setter = descriptions.current.get(id);
        if (!setter) throw new Error(`Node content is not ready: ${id}`);
        stopActiveDrag();
        setter(text);
      },
      actions: (id) => {
        const actions = nodeActions.current.get(id);
        if (!actions) throw new Error(`Node content is not ready: ${id}`);
        return actions.items.map((action) => ({ ...action }));
      },
      setActions,
      view: () => ({ ...viewRef.current }),
      setView: setCamera,
      stats,
      benchmark: { mount: benchmarkMount, interact: benchmarkInteract },
    };
    window.freeNodes = api;
    return () => {
      if (window.freeNodes === api) delete window.freeNodes;
    };
  }, [
    select,
    move,
    reorder,
    scatter,
    setActions,
    setCamera,
    stats,
    benchmarkMount,
    benchmarkInteract,
    stopActiveDrag,
  ]);

  const selectedNode = selected
    ? activeDrag.current?.group.getAttr('layoutRootId') === selected
      ? { id: selected, ...activeDrag.current.group.position() }
      : nodeById.get(selected)
    : undefined;
  const selectedBounds = selected ? layout.current?.getLayout(selected) : undefined;
  const selectedActions = selected ? nodeActions.current.get(selected)?.items : undefined;

  return (
    <main className="free-nodes-example">
      <nav>
        <a href="?embedded=1">Одна нода</a>
        <a href="?stress=1">Стресс-тест</a>
        <a href="?playground=1">Playground</a>
        <a href="https://github.com/dzenlotus/react-konva-layout">GitHub ↗</a>
      </nav>
      <div className="free-nodes-heading">
        <div>
          <p className="free-nodes-eyebrow">REACT KONVA / APPLICATION-OWNED GRAPH</p>
          <h1>1000 нод. Свободные позиции.</h1>
        </div>
        <p>
          Перетаскивайте ноды. Клик поднимает ноду наверх. Колесо — zoom, фон — pan. Двойной клик по
          описанию — редактирование.
        </p>
      </div>
      <div className="free-nodes-controls">
        <button onClick={scatter}>Перемешать позиции</button>
        <button onClick={() => reorder(shuffled(orderRef.current, ++seed.current))}>
          Перемешать порядок
        </button>
        <button
          onClick={() =>
            setCamera(fitFreeNodes(nodes, viewport, (id) => layout.current?.getLayout(id)))
          }
        >
          Показать все
        </button>
        <button
          onClick={() =>
            setCamera(
              zoomAtPoint(viewRef.current, { x: viewport.width / 2, y: viewport.height / 2 }, 1),
            )
          }
        >
          100%
        </button>
        <button onClick={reset}>Сброс</button>
        <span className="free-nodes-actions-label">
          Действия{selectedActions ? `: ${selectedActions.length}` : ' выбранной ноды'}
        </span>
        <button
          data-testid="free-node-action-add"
          disabled={!selectedActions || selectedActions.length >= 12}
          onClick={() => changeSelectedActions('add')}
        >
          + Действие
        </button>
        <button
          data-testid="free-node-action-remove"
          disabled={!selectedActions?.length}
          onClick={() => changeSelectedActions('remove')}
        >
          − Действие
        </button>
        <button
          data-testid="free-node-action-reverse"
          disabled={!selectedActions || selectedActions.length < 2}
          onClick={() => changeSelectedActions('reverse')}
        >
          Развернуть действия
        </button>
      </div>
      <div
        ref={container}
        className="free-nodes-stage"
        style={
          benchmarkMode ? { width: 1400, height: 760, minHeight: 760, flexShrink: 0 } : undefined
        }
      >
        <Stage
          ref={stage}
          width={viewport.width}
          height={viewport.height}
          onClick={(event) => {
            if (event.target === stage.current) select(null);
          }}
          onTap={(event) => {
            if (event.target === stage.current) select(null);
          }}
        >
          <Layer ref={sceneLayer} name="free-node-scene">
            {content && mountConfig.mounted && (
              <Layout
                key={mountConfig.generation}
                ref={layout}
                width={FREE_NODE_WIDTH}
                height={FREE_NODE_HEIGHT}
                placements={placements}
                onLayout={onLayout}
                onMeasure={onMeasure}
                onRenderStats={onRenderStats}
                performance={PERFORMANCE}
              >
                {content}
              </Layout>
            )}
          </Layer>
          <Layer ref={dragLayer} name="free-node-interaction">
            {selectedNode && selectedBounds && (
              <Rect
                ref={selectionOutline}
                name="selected-node-outline"
                x={selectedNode.x - 4}
                y={selectedNode.y - 4}
                width={selectedBounds.width + 8}
                height={selectedBounds.height + 8}
                stroke="#789b58"
                strokeWidth={2}
                strokeScaleEnabled={false}
                cornerRadius={20}
                listening={false}
              />
            )}
          </Layer>
        </Stage>
      </div>
      <div className="free-nodes-status" aria-live="polite">
        <span ref={coordinateStatus}>
          {selectedNode
            ? `${selectedNode.id} · x ${Math.round(selectedNode.x)}, y ${Math.round(selectedNode.y)}`
            : 'Выберите ноду, чтобы изменить её позицию и порядок'}
        </span>
        <span>
          {FREE_NODE_COUNT} нод · на экране {renderStats?.visibleRoots ?? 0} · zoom{' '}
          <output ref={zoomOutput}>{Math.round(viewRef.current.scale * 100)}</output>% · layout{' '}
          {metrics?.scope ?? '…'} / {metrics?.measuredNodes ?? 0} измерений
        </span>
      </div>
      {imageError && <p role="alert">Не удалось загрузить превью нод.</p>}
      <p className="free-nodes-caption">
        Координаты и порядок хранятся в state приложения. Все ноды используют один Layout: drag не
        запускает HTML-измерение. Добавляйте и переставляйте действия выбранной ноды: сначала
        пересчитывается их блок, при изменении его высоты — родительская нода. LOD меняет отдельные
        ячейки, сохраняя их размеры.
      </p>
    </main>
  );
}
