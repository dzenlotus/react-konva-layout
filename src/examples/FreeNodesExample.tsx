import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type Konva from 'konva';
import { Layer, Rect, Stage } from 'react-konva';
import { Flex, Layout } from '../lib';
import type {
  LayoutHandle,
  LayoutMetrics,
  LayoutPlacement,
  RenderMetrics,
  ViewTransform,
} from '../lib';
import { ReferenceNode } from './ReferenceNode';
import { DESCRIPTION } from './DesignedStressScene';
import { normalizeView, readSavedView, zoomAtPoint } from './camera';
import {
  createFreeNodes,
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
import './free-nodes.css';

type DescriptionSetter = (value: string) => void;
type RegisterDescription = (id: string, setter: DescriptionSetter | null) => void;
type PlacementEvent = Konva.KonvaEventObject<Event>;

const INITIAL_NODES = createFreeNodes();
const PERFORMANCE = { cacheBudgetMB: 32, overscan: 100 };

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
  view(): ViewTransform;
  setView(view: Partial<ViewTransform>): void;
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
  showPreview,
  showDescription,
  showActions,
}: {
  id: string;
  index: number;
  previewImage: HTMLImageElement;
  registerDescription: RegisterDescription;
} & ReferenceNodeDetail) {
  const [description, setDescription] = useState(DESCRIPTION);
  useEffect(() => {
    registerDescription(id, setDescription);
    return () => registerDescription(id, null);
  }, [id, registerDescription]);
  return (
    <ReferenceNode
      id={id}
      width={FREE_NODE_WIDTH}
      layoutTemplate="free-node-v1"
      footerLabel={`node_${String(index + 1).padStart(4, '0')}`}
      previewImage={previewImage}
      description={description}
      onDescriptionChange={setDescription}
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
  const container = useRef<HTMLDivElement | null>(null);
  const [viewport, setViewport] = useState({ width: 1200, height: 680 });
  const [nodes, setNodes] = useState(() => INITIAL_NODES);
  const [order, setOrder] = useState(() =>
    shuffled(
      INITIAL_NODES.map((node) => node.id),
      INITIAL_SEED,
    ),
  );
  const [selected, setSelected] = useState<string | null>(null);
  const [dragPosition, setDragPosition] = useState<FreeNodePosition | null>(null);
  const [previewImage, setPreviewImage] = useState<HTMLImageElement>();
  const [imageError, setImageError] = useState(false);
  const [metrics, setMetrics] = useState<LayoutMetrics | null>(null);
  const [renderStats, setRenderStats] = useState<RenderMetrics | null>(null);
  const [view, setView] = useState<ViewTransform>(() => {
    const params = new URLSearchParams(window.location.search);
    return params.has('zoom') || params.has('x') || params.has('y')
      ? readSavedView(window.location.search)
      : INITIAL_VIEW;
  });
  const nodesRef = useRef(nodes);
  const orderRef = useRef(order);
  const selectedRef = useRef(selected);
  const viewRef = useRef(view);
  const seed = useRef(INITIAL_SEED);
  const descriptions = useRef(new Map<string, DescriptionSetter>());
  nodesRef.current = nodes;
  orderRef.current = order;
  selectedRef.current = selected;

  const setCamera = useCallback((next: Partial<ViewTransform>) => {
    const current = normalizeView({ ...viewRef.current, ...next });
    viewRef.current = current;
    stage.current?.position(current);
    stage.current?.scale({ x: current.scale, y: current.scale });
    stage.current?.batchDraw();
    setView(current);
  }, []);
  useDemoGestures(stage, true, viewRef, setCamera);

  useEffect(() => {
    const host = container.current;
    if (!host) return;
    const observer = new ResizeObserver(([entry]) => {
      setViewport({ width: entry.contentRect.width, height: entry.contentRect.height });
    });
    observer.observe(host);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    let active = true;
    const image = new Image();
    image.src = `${import.meta.env.BASE_URL}node-preview.jpg`;
    Promise.all([image.decode(), document.fonts.ready]).then(
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

  const registerDescription = useCallback<RegisterDescription>((id, setter) => {
    if (setter) descriptions.current.set(id, setter);
    else descriptions.current.delete(id);
  }, []);

  const select = useCallback((id: string | null) => {
    if (id && !nodesRef.current.some((node) => node.id === id))
      throw new Error(`Unknown node: ${id}`);
    setSelected(id);
    if (!id) return;
    stage.current?.find((node: Konva.Node) => node.getAttr('layoutRootId') === id)[0]?.moveToTop();
    setOrder((previous) =>
      previous.at(-1) === id ? previous : [...previous.filter((value) => value !== id), id],
    );
  }, []);

  const move = useCallback((id: string, position: { x: number; y: number }) => {
    if (!nodesRef.current.some((node) => node.id === id)) throw new Error(`Unknown node: ${id}`);
    if (!Number.isFinite(position.x) || !Number.isFinite(position.y))
      throw new Error('Node coordinates must be finite.');
    setNodes((previous) =>
      previous.map((node) => (node.id === id ? { ...node, ...position } : node)),
    );
  }, []);

  const reorder = useCallback((ids: readonly string[]) => {
    const known = new Set(nodesRef.current.map((node) => node.id));
    if (
      ids.length !== known.size ||
      new Set(ids).size !== known.size ||
      ids.some((id) => !known.has(id))
    ) {
      throw new Error('Order must contain every node ID exactly once.');
    }
    setOrder([...ids]);
  }, []);

  const scatter = useCallback(() => {
    seed.current++;
    setNodes((previous) => scatterFreeNodes(previous, seed.current));
    setSelected(null);
    setDragPosition(null);
    setCamera(INITIAL_VIEW);
  }, [setCamera]);

  const reset = useCallback(() => {
    seed.current = INITIAL_SEED;
    setNodes(createFreeNodes());
    setOrder(
      shuffled(
        INITIAL_NODES.map((node) => node.id),
        INITIAL_SEED,
      ),
    );
    setSelected(null);
    setDragPosition(null);
    setCamera(INITIAL_VIEW);
  }, [setCamera]);

  const onSelect = useCallback(
    (event: PlacementEvent) => {
      select(event.currentTarget.getAttr('layoutRootId') as string);
    },
    [select],
  );
  const onDragStart = useCallback(
    (event: PlacementEvent) => {
      const id = event.currentTarget.getAttr('layoutRootId') as string;
      event.currentTarget.moveToTop();
      select(id);
      setDragPosition({ id, ...event.currentTarget.position() });
    },
    [select],
  );
  const onDragMove = useCallback((event: PlacementEvent) => {
    setDragPosition({
      id: event.currentTarget.getAttr('layoutRootId') as string,
      ...event.currentTarget.position(),
    });
  }, []);
  const onDragEnd = useCallback(
    (event: PlacementEvent) => {
      move(event.currentTarget.getAttr('layoutRootId') as string, event.currentTarget.position());
      setDragPosition(null);
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
  const { showPreview, showDescription, showActions } = referenceNodeDetail(view.scale);
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
              showPreview={showPreview}
              showDescription={showDescription}
              showActions={showActions}
            />
          ))}
        </Flex>
      ) : null,
    [previewImage, registerDescription, showPreview, showDescription, showActions],
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
        setter(text);
      },
      view: () => ({ ...viewRef.current }),
      setView: setCamera,
    };
    window.freeNodes = api;
    return () => {
      if (window.freeNodes === api) delete window.freeNodes;
    };
  }, [select, move, reorder, scatter, setCamera]);

  const selectedNode = selected
    ? dragPosition?.id === selected
      ? dragPosition
      : nodeById.get(selected)
    : undefined;
  const selectedBounds = selected ? layout.current?.getLayout(selected) : undefined;

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
        <button onClick={() => setOrder((previous) => shuffled(previous, ++seed.current))}>
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
      </div>
      <div ref={container} className="free-nodes-stage">
        <Stage
          ref={stage}
          width={viewport.width}
          height={viewport.height}
          x={view.x}
          y={view.y}
          scaleX={view.scale}
          scaleY={view.scale}
          onClick={(event) => {
            if (event.target === stage.current) select(null);
          }}
          onTap={(event) => {
            if (event.target === stage.current) select(null);
          }}
        >
          <Layer>
            {content && (
              <Layout
                ref={layout}
                width={FREE_NODE_WIDTH}
                height={FREE_NODE_HEIGHT}
                placements={placements}
                onMeasure={setMetrics}
                onRenderStats={setRenderStats}
                performance={PERFORMANCE}
              >
                {content}
              </Layout>
            )}
            {selectedNode && selectedBounds && (
              <Rect
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
        <span>
          {selectedNode
            ? `${selectedNode.id} · x ${Math.round(selectedNode.x)}, y ${Math.round(selectedNode.y)}`
            : 'Выберите ноду, чтобы изменить её позицию и порядок'}
        </span>
        <span>
          {FREE_NODE_COUNT} нод · на экране {renderStats?.visibleRoots ?? 0} · zoom{' '}
          {Math.round(view.scale * 100)}% · layout {metrics?.scope ?? '…'} /{' '}
          {metrics?.measuredNodes ?? 0} измерений
        </span>
      </div>
      {imageError && <p role="alert">Не удалось загрузить превью нод.</p>}
      <p className="free-nodes-caption">
        Координаты и порядок хранятся в state приложения. Все ноды используют один Layout: drag не
        запускает HTML-измерение, изменение текста пересчитывает только его ноду. LOD меняет
        отдельные ячейки, сохраняя их размеры.
      </p>
    </main>
  );
}
