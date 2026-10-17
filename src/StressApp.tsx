import { DemoCanvas, type DemoCanvasHandle } from './examples/DemoCanvas';
import { memo, useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import Konva from 'konva';
import { Circle, Line, Rect, Text } from 'react-konva';
import { Cell, CellText, Flex, useLayout } from './lib';
import type {
  LayoutNode,
  LayoutMetrics,
  PerformanceOptions,
  RenderMetrics,
  ViewTransform,
} from './lib';
import './stress.css';

const COUNT = 1000;
const RETINA = new URLSearchParams(window.location.search).has('retina');
const COLUMNS = 25;
const CARD_WIDTH = 230;
const CARD_HEIGHT = 284;
const WORLD_WIDTH = COLUMNS * CARD_WIDTH + (COLUMNS - 1) * 14 + 40;
const WORLD_HEIGHT =
  Math.ceil(COUNT / COLUMNS) * CARD_HEIGHT + (Math.ceil(COUNT / COLUMNS) - 1) * 14 + 40;
const EXPECTED_PRIMITIVES = COUNT * 25 + 1;
const FONT = 'Arial';
const DESCRIPTION =
  'Этот модуль обрабатывает изображение. Переносы текста и вложенную раскладку рассчитывает браузер.';
const OPTIMIZED: PerformanceOptions = {
  enabled: true,
  compact: true,
  cull: true,
  cache: true,
  cacheBudgetMB: 32,
  cachePixelRatio: RETINA ? 'auto' : 1,
  lodScale: 0.3,
  overscan: 100,
};
const BASELINE: PerformanceOptions = { enabled: false };
type Mode = 'optimized' | 'baseline';
const attrs = (id: string) => ({ id, 'data-testid': id });
const rounded = (value: number) => Math.round(value * 100) / 100;

export interface StressStats {
  mode: Mode;
  cards: number;
  primitives: number;
  groups: number;
  shapes: number;
  idleHtmlNodes: number;
  attachedMeasurementRoots: number;
  viewportWidth: number;
  viewportHeight: number;
  worldWidth: number;
  worldHeight: number;
  devicePixelRatio: number;
  canvasPixelRatio: number;
  complete: boolean;
  renderedCards: number;
  measurement: LayoutMetrics | null;
  rendering: RenderMetrics | null;
}

export interface StressResult extends StressStats {
  operation: 'mount' | 'resize' | 'remeasure' | 'edit' | 'view';
  mountToLayoutMs: number;
  totalToCanvasFrameMs: number;
  canvasDrawMs: number;
  forcedRedraw: boolean;
  timestamp: string;
  layoutPasses: number;
}

interface StressApi {
  run: (mode?: Mode) => Promise<StressResult>;
  resize: () => Promise<StressResult>;
  remeasure: () => Promise<StressResult>;
  stats: () => StressStats;
  overview: (enabled?: boolean) => void;
  edit: (text?: string) => Promise<StressResult>;
  view: (view: Partial<ViewTransform>) => Promise<StressResult>;
}

declare global {
  interface Window {
    layoutStress?: StressApi;
  }
}

function Preview({ width, height, index }: { width: number; height: number; index: number }) {
  const colors = ['#bbcea9', '#b2c8d5', '#ccb9d2', '#d5c9a5'];
  return (
    <>
      <Rect width={width} height={height} fill="#e7ede1" cornerRadius={6} />
      <Circle x={width * 0.76} y={height * 0.27} radius={11} fill="#fafcf5" />
      <Line
        points={[0, height, 0, height * 0.8, width * 0.32, height * 0.3, width * 0.76, height]}
        fill={colors[index % colors.length]}
        closed
      />
      <Line
        points={[0, height, width * 0.68, height * 0.42, width, height * 0.8, width, height]}
        fill="#718667"
        closed
      />
      <Text
        x={8}
        y={height - 16}
        text={`FRAME ${String(index + 1).padStart(4, '0')}`}
        fontFamily={FONT}
        fontSize={8}
        fill="#fff"
      />
    </>
  );
}

function StressCard({ index, width }: { index: number; width: number }) {
  const prefix = `stress-node-${String(index).padStart(4, '0')}`;
  const prop = (suffix: string) => attrs(`${prefix}-${suffix}`);
  const [description, setDescription] = useState(DESCRIPTION);
  const { invalidate } = useLayout();
  const updateDescription = useCallback(
    (text: string) => {
      setDescription(text);
      invalidate(prefix + '-description');
    },
    [invalidate, prefix],
  );
  return (
    <Flex
      direction="column"
      {...prop('card')}
      layoutRoot
      layoutTemplate="processing-card-v2"
      lodLabel={'Node ' + (index + 1)}
      width={width}
      minWidth={0}
      minHeight={CARD_HEIGHT}
      padding={12}
      gap={8}
      justifyContent="space-between"
      fill="#fff"
      stroke="#d5ddcb"
      strokeWidth={1}
      cornerRadius={9}
      style={{
        position: 'absolute',
        left: 20 + (index % COLUMNS) * (width + 14),
        top: 20 + Math.floor(index / COLUMNS) * (CARD_HEIGHT + 14),
      }}
    >
      <Flex {...prop('heading')} width="100%" gap={8} alignItems="center">
        <Cell {...prop('icon')} width={22} height={22} flexShrink={0}>
          {() => (
            <>
              <Circle x={11} y={11} radius={10} fill="#e7efda" />
              <Line points={[6, 12, 10, 16, 16, 7]} stroke="#6b874c" strokeWidth={1.6} />
            </>
          )}
        </Cell>
        <Flex direction="column" {...prop('titles')} flexGrow={1} minWidth={0} gap={3}>
          <CellText
            {...prop('label')}
            text="IMAGE PROCESSING"
            fontSize={8}
            fontFamily={FONT}
            fontStyle="bold"
            color="#798d69"
          >
            {(textProps) => <Text {...textProps} />}
          </CellText>
          <CellText
            {...prop('title')}
            text={`Image transform ${String(index + 1).padStart(4, '0')}`}
            width="100%"
            height={18}
            wrap="none"
            fontSize={15}
            fontFamily={FONT}
            fontStyle="bold"
            color="#2b3725"
          >
            {(textProps) => <Text {...textProps} />}
          </CellText>
        </Flex>
      </Flex>
      <CellText
        {...prop('subtitle')}
        text="Нормализация входящего изображения"
        fontSize={9}
        fontFamily={FONT}
        color="#8a9481"
      >
        {(textProps) => <Text {...textProps} />}
      </CellText>
      <Flex {...prop('figure')} width="100%" height={92} gap={8} alignItems="center">
        <Flex direction="column" {...prop('input-ports')} gap={14} flexShrink={0}>
          {[0, 1, 2].map((port) => (
            <Cell key={port} {...prop(`input-${port}`)} width={12} height={12}>
              {() => (
                <Circle x={6} y={6} radius={5} fill="#d3dfc5" stroke="#92a580" strokeWidth={1} />
              )}
            </Cell>
          ))}
        </Flex>
        <Cell {...prop('preview')} height={92} flexGrow={1} minWidth={0}>
          {({ width, height }) => <Preview {...{ width, height, index }} />}
        </Cell>
        <Flex direction="column" {...prop('output-ports')} gap={14} flexShrink={0}>
          {[0, 1, 2].map((port) => (
            <Cell key={port} {...prop(`output-${port}`)} width={12} height={12}>
              {() => (
                <Circle x={6} y={6} radius={5} fill="#d3dfc5" stroke="#92a580" strokeWidth={1} />
              )}
            </Cell>
          ))}
        </Flex>
      </Flex>
      <CellText
        {...prop('description')}
        text={description}
        editable
        onTextChange={updateDescription}
        width="100%"
        minHeight={42}
        fontSize={10}
        lineHeight={1.4}
        fontFamily={FONT}
        color="#7b8771"
      >
        {(textProps) => <Text {...textProps} />}
      </CellText>
      <Flex
        {...prop('actions')}
        height={32}
        width="100%"
        padding={4}
        gap={6}
        alignItems="center"
        fill="#f0f4e9"
        cornerRadius={6}
      >
        <Cell {...prop('run')} width={24} height={24} fill="#d2e6ba" cornerRadius={4}>
          {() => <Line points={[9, 6, 17, 12, 9, 18]} fill="#58733e" closed />}
        </Cell>
        <Cell {...prop('settings')} width={24} height={24} fill="#e0e7d8" cornerRadius={4}>
          {() => (
            <>
              <Line points={[5, 8, 19, 8, 5, 16, 19, 16]} stroke="#7d8d6f" strokeWidth={1.2} />
              <Circle x={10} y={8} radius={2.5} fill="#6c7e5d" />
            </>
          )}
        </Cell>
        <Cell {...prop('spacer')} flexGrow={1} />
        <Flex {...prop('status')} gap={4} alignItems="center">
          <Cell {...prop('status-dot')} width={5} height={5}>
            {() => <Circle x={2.5} y={2.5} radius={2.5} fill="#86a962" />}
          </Cell>
          <CellText
            {...prop('status-text')}
            text={`node_${String(index + 1).padStart(4, '0')}`}
            width={48}
            height={10}
            wrap="none"
            fontSize={8}
            fontFamily="monospace"
            color="#8e9c81"
          >
            {(textProps) => <Text {...textProps} />}
          </CellText>
        </Flex>
      </Flex>
    </Flex>
  );
}

const StressScene = memo(function StressScene({ worldWidth }: { worldWidth: number }) {
  const width = (worldWidth - 40 - (COLUMNS - 1) * 14) / COLUMNS;
  return (
    <Flex {...attrs('stress-world')} width={worldWidth} height={WORLD_HEIGHT}>
      {Array.from({ length: COUNT }, (_, index) => (
        <StressCard key={index} index={index} width={width} />
      ))}
    </Flex>
  );
});

function countTree(nodes: LayoutNode[]): number {
  let count = 0;
  for (const node of nodes) count += 1 + countTree(node.children);
  return count;
}

interface Pending {
  operation: StressResult['operation'];
  startedAt: number;
  layoutAt: number | null;
  drawMs: number | null;
  layoutPasses: number;
  expectedText?: string;
  expectedView?: ViewTransform;
  measurement?: LayoutMetrics;
  resolve: (value: StressResult) => void;
  reject: (error: Error) => void;
  timeout: number;
}

const nextFrame = () => new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));

export default function StressApp() {
  const [config, setConfig] = useState({
    generation: 0,
    width: 1400,
    worldWidth: WORLD_WIDTH,
    mounted: false,
    mode: 'optimized' as Mode,
  });
  const [selectedMode, setSelectedMode] = useState<Mode>('optimized');
  const [busy, setBusy] = useState(false);
  const [results, setResults] = useState<StressResult[]>([]);
  const [error, setError] = useState('');
  const [overview, setOverview] = useState(false);
  const [view, setView] = useState<ViewTransform>({ x: 0, y: 0, scale: 1 });
  const [lastMeasure, setLastMeasure] = useState<LayoutMetrics | null>(null);
  const holder = useRef<HTMLDivElement>(null);
  const layout = useRef<DemoCanvasHandle>(null);
  const configRef = useRef(config);
  const pending = useRef<Pending | null>(null);
  const preparing = useRef(false);
  const primitiveCount = useRef(0);
  const renderStats = useRef<RenderMetrics | null>(null);
  const frame = useRef(0);
  configRef.current = config;
  const stage = useCallback(
    () =>
      layout.current?.getStage() ??
      Konva.stages.find((item) => holder.current?.contains(item.container())) ??
      null,
    [],
  );

  const stats = useCallback((): StressStats => {
    const current = stage(),
      groups = current?.find('Group') ?? [];
    const model = layout.current?.getLayout('stress-world');
    const cards = model?.children.length ?? 0;
    const renderedCards = groups.filter((node) => /^stress-node-\d+-card$/.test(node.id())).length;
    const shapes = current?.find('Shape').length ?? 0;
    const idleHtmlNodes = holder.current?.querySelectorAll('[data-layout-key]').length ?? 0;
    const attachedMeasurementRoots =
      holder.current?.querySelectorAll('.konva-layout-measure').length ?? 0;
    return {
      mode: configRef.current.mode,
      cards,
      renderedCards,
      primitives: primitiveCount.current,
      groups: groups.length,
      shapes,
      idleHtmlNodes,
      attachedMeasurementRoots,
      viewportWidth: configRef.current.width,
      viewportHeight: 760,
      worldWidth: configRef.current.worldWidth,
      worldHeight: WORLD_HEIGHT,
      devicePixelRatio: window.devicePixelRatio,
      canvasPixelRatio: current?.getLayers()[0]?.getCanvas().getPixelRatio() ?? 1,
      measurement: layout.current?.getMetrics() ?? null,
      rendering: renderStats.current,
      complete:
        cards === COUNT &&
        primitiveCount.current === EXPECTED_PRIMITIVES &&
        renderedCards > 0 &&
        idleHtmlNodes === 0 &&
        attachedMeasurementRoots === 0,
    };
  }, [stage]);

  const fail = useCallback((reason: string) => {
    const job = pending.current;
    if (!job) return;
    pending.current = null;
    clearTimeout(job.timeout);
    cancelAnimationFrame(frame.current);
    setBusy(false);
    setError(reason);
    job.reject(new Error(reason));
  }, []);

  const finish = useCallback(() => {
    const job = pending.current;
    if (!job || job.layoutAt === null || job.drawMs === null) return;
    const frameAt = performance.now();
    const snapshot = stats();
    if (!snapshot.complete) {
      fail('Неполное дерево или измерительный HTML остался в документе.');
      return;
    }
    const result: StressResult = {
      ...snapshot,
      operation: job.operation,
      mountToLayoutMs: rounded(job.layoutAt - job.startedAt),
      canvasDrawMs: rounded(job.drawMs),
      totalToCanvasFrameMs: rounded(frameAt - job.startedAt),
      forcedRedraw: job.operation === 'remeasure',
      layoutPasses: job.layoutPasses,
      timestamp: new Date().toISOString(),
      measurement: job.measurement ?? null,
    };
    pending.current = null;
    clearTimeout(job.timeout);
    setBusy(false);
    setResults((previous) => [...previous.slice(-29), result]);
    job.resolve(result);
  }, [fail, stats]);

  const onLayout = useCallback((tree: LayoutNode[]) => {
    const at = performance.now();
    if (!primitiveCount.current) primitiveCount.current = countTree(tree);
    const job = pending.current;
    if (job && (job.operation === 'mount' || job.operation === 'resize')) job.layoutAt ??= at;
  }, []);

  const onMeasure = useCallback(
    (metrics: LayoutMetrics) => {
      setLastMeasure(metrics);
      const job = pending.current;
      if (!job) return;
      if (metrics.measuredNodes) job.layoutPasses++;
      if (metrics.scope !== 'visual') job.measurement = metrics;
      if (job.operation !== 'view' && metrics.scope !== 'visual')
        job.layoutAt ??= performance.now();
      if (job.operation === 'remeasure')
        frame.current = requestAnimationFrame(() => stage()?.getLayers()[0]?.draw());
    },
    [stage],
  );

  const onRenderStats = useCallback((metrics: RenderMetrics) => {
    renderStats.current = metrics;
  }, []);

  const makeJob = useCallback(
    (operation: StressResult['operation'], extras: Partial<Pending> = {}) =>
      new Promise<StressResult>((resolve, reject) => {
        const startedAt = performance.now();
        pending.current = {
          operation,
          startedAt,
          layoutAt: operation === 'view' ? startedAt : null,
          drawMs: null,
          layoutPasses: 0,
          expectedView: { x: 0, y: 0, scale: 1 },
          resolve,
          reject,
          timeout: window.setTimeout(() => fail('Замер превысил 60 секунд.'), 60_000),
          ...extras,
        };
      }),
    [fail],
  );

  const start = useCallback(
    async (operation: 'mount' | 'resize' | 'remeasure', mode?: Mode): Promise<StressResult> => {
      if (pending.current || preparing.current) throw new Error('Замер уже выполняется.');
      if (operation !== 'mount' && !configRef.current.mounted)
        throw new Error('Сначала запустите сцену.');
      preparing.current = true;
      setBusy(true);
      setError('');
      setOverview(false);
      try {
        if (operation === 'mount') {
          flushSync(() => setConfig((previous) => ({ ...previous, mounted: false })));
          await nextFrame();
          await nextFrame();
          primitiveCount.current = 0;
          renderStats.current = null;
          setView({ x: 0, y: 0, scale: 1 });
        } else {
          layout.current?.setView({ x: 0, y: 0, scale: 1 });
          await nextFrame();
          await nextFrame();
        }
        const result = makeJob(operation);
        if (operation === 'mount')
          setConfig((previous) => ({
            generation: previous.generation + 1,
            width: 1400,
            worldWidth: WORLD_WIDTH,
            mounted: true,
            mode: mode ?? selectedMode,
          }));
        else if (operation === 'resize')
          setConfig((previous) => ({
            ...previous,
            width: previous.width === 1400 ? 1160 : 1400,
            worldWidth: previous.worldWidth === WORLD_WIDTH ? WORLD_WIDTH - 500 : WORLD_WIDTH,
          }));
        else layout.current?.remeasure();
        preparing.current = false;
        return await result;
      } catch (reason) {
        preparing.current = false;
        setBusy(false);
        throw reason;
      }
    },
    [makeJob, selectedMode],
  );

  const moveView = useCallback(
    async (next: Partial<ViewTransform>) => {
      if (pending.current || preparing.current) throw new Error('Замер уже выполняется.');
      if (!configRef.current.mounted) throw new Error('Сначала запустите сцену.');
      setBusy(true);
      setError('');
      const expectedView = { ...layout.current!.getView(), ...next };
      const result = makeJob('view', { expectedView });
      layout.current!.setView(expectedView);
      return result;
    },
    [makeJob],
  );

  const setWorldView = useCallback(
    (enabled = true) => {
      if (pending.current || preparing.current) return;
      const current = stage();
      if (!current) return;
      const scale = enabled
        ? Math.min(current.width() / configRef.current.worldWidth, current.height() / WORLD_HEIGHT)
        : 1;
      layout.current?.setView({
        scale,
        x: enabled ? (current.width() - configRef.current.worldWidth * scale) / 2 : 0,
        y: 0,
      });
      setOverview(enabled);
    },
    [stage],
  );

  const edit = useCallback(
    async (text = DESCRIPTION + ' Изменённое описание. '.repeat(18)) => {
      if (pending.current || preparing.current) throw new Error('Замер уже выполняется.');
      preparing.current = true;
      setBusy(true);
      setError('');
      try {
        layout.current?.setView({ x: 0, y: 0, scale: 1 });
        await nextFrame();
        await nextFrame();
        const target = stage()?.findOne('#stress-node-0000-description');
        const canvasText =
          target instanceof Konva.Text
            ? target
            : target instanceof Konva.Container
              ? target.findOne('Text')
              : undefined;
        if (!canvasText) throw new Error('Description не найден.');
        canvasText.fire('dblclick', { evt: new MouseEvent('dblclick', { bubbles: true }) }, true);
        await nextFrame();
        await nextFrame();
        const editor = document.querySelector<HTMLTextAreaElement>(
          '[data-testid="layout-text-editor"]',
        );
        if (!editor) throw new Error('Редактор не появился.');
        Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!.call(
          editor,
          text,
        );
        editor.dispatchEvent(new Event('input', { bubbles: true }));
        await nextFrame();
        await nextFrame();
        const result = makeJob('edit', { expectedText: text });
        preparing.current = false;
        editor.dispatchEvent(
          new KeyboardEvent('keydown', { key: 'Enter', ctrlKey: true, bubbles: true }),
        );
        return await result;
      } catch (reason) {
        preparing.current = false;
        setBusy(false);
        throw reason;
      }
    },
    [makeJob, stage],
  );

  useLayoutEffect(() => {
    const drawing = stage()?.getLayers()[0];
    const originalDraw = drawing?.draw;
    const measuredDraw = function (this: Konva.Layer) {
      const job = pending.current,
        current = this.getStage(),
        model = layout.current?.getLayout('stress-world');
      let eligible = Boolean(
        job &&
        job.layoutAt !== null &&
        job.drawMs === null &&
        current &&
        holder.current?.contains(current.container()) &&
        model?.children.length === COUNT,
      );
      if (eligible && job && current && model) {
        if (current.width() !== configRef.current.width || current.height() !== 760)
          eligible = false;
        const roots = new Map(
          this.find('Group')
            .filter((node) => /^stress-node-\d+-card$/.test(node.id()))
            .map((node) => [node.id(), node]),
        );
        const camera = layout.current!.getView();
        if (
          job.expectedView &&
          ['x', 'y', 'scale'].some(
            (key) =>
              Math.abs(
                camera[key as keyof ViewTransform] - job.expectedView![key as keyof ViewTransform],
              ) > 0.001,
          )
        )
          eligible = false;
        if (
          job.expectedView &&
          (Math.abs(current.x() - job.expectedView.x) > 0.001 ||
            Math.abs(current.y() - job.expectedView.y) > 0.001 ||
            Math.abs(current.scaleX() - job.expectedView.scale) > 0.001)
        )
          eligible = false;
        const required =
          configRef.current.mode === 'baseline'
            ? model.children
            : model.children.filter((node) => {
                const x = node.absoluteX * camera.scale + camera.x,
                  y = node.absoluteY * camera.scale + camera.y;
                return (
                  x < current.width() &&
                  x + node.width * camera.scale > 0 &&
                  y < current.height() &&
                  y + node.height * camera.scale > 0
                );
              });
        if (
          !required.length ||
          required.some((node) => {
            const drawn = roots.get(node.id);
            if (!drawn) return true;
            const position = drawn.getAbsolutePosition();
            return (
              Math.abs(drawn.width() - node.width) > 0.1 ||
              Math.abs(drawn.height() - node.height) > 0.1 ||
              Math.abs(position.x - (node.absoluteX * camera.scale + camera.x)) > 0.1 ||
              Math.abs(position.y - (node.absoluteY * camera.scale + camera.y)) > 0.1
            );
          })
        )
          eligible = false;
        const expectedWidth = (configRef.current.worldWidth - 40 - (COLUMNS - 1) * 14) / COLUMNS;
        if (model.children.some((node) => Math.abs(node.width - expectedWidth) > 0.1))
          eligible = false;
        if (job.expectedText !== undefined) {
          const target = this.findOne('#stress-node-0000-description');
          const text =
            target instanceof Konva.Text
              ? target
              : target instanceof Konva.Container
                ? target.findOne('Text')
                : undefined;
          if (!(text instanceof Konva.Text) || text.text() !== job.expectedText) eligible = false;
        }
      }
      const before = eligible ? performance.now() : 0;
      const returned = originalDraw!.call(this);
      if (eligible && job && pending.current === job) {
        job.drawMs = performance.now() - before;
        frame.current = requestAnimationFrame(finish);
      }
      return returned;
    };
    if (drawing) drawing.draw = measuredDraw;
    return () => {
      if (drawing && drawing.draw === measuredDraw) drawing.draw = originalDraw!;
    };
  }, [config.mounted, config.generation, finish, stage]);

  useEffect(() => {
    const api: StressApi = {
      run: (mode) => start('mount', mode),
      resize: () => start('resize'),
      remeasure: () => start('remeasure'),
      stats,
      overview: setWorldView,
      edit,
      view: moveView,
    };
    window.layoutStress = api;
    return () => {
      if (window.layoutStress === api) delete window.layoutStress;
      cancelAnimationFrame(frame.current);
      if (pending.current) {
        clearTimeout(pending.current.timeout);
        pending.current.reject(new Error('Benchmark закрыт.'));
        pending.current = null;
      }
    };
  }, [edit, finish, moveView, setWorldView, stage, start, stats]);

  const invoke = (operation: 'mount' | 'resize' | 'remeasure' | 'edit') => {
    void (operation === 'edit' ? edit() : start(operation)).catch((reason) =>
      setError(String(reason.message ?? reason)),
    );
  };
  const zoomCentered = (factor: number) => {
    const current = layout.current?.getView();
    if (!current) return;
    const scale = Math.min(8, Math.max(0.05, current.scale * factor));
    layout.current?.setView({
      scale,
      x: config.width / 2 - ((config.width / 2 - current.x) * scale) / current.scale,
      y: 380 - ((380 - current.y) * scale) / current.scale,
    });
  };
  const last = results.at(-1);
  return (
    <div className="stress-shell">
      <header className="stress-header">
        <a href="./">
          react-konva <span>/ layout</span>
        </a>
        <span>
          PERFORMANCE LAB <i /> {import.meta.env.PROD ? 'PRODUCTION' : 'DEVELOPMENT'} / CAMERA +
          LOCAL LAYOUT
        </span>
      </header>
      <main className="stress-main">
        <section className="stress-intro">
          <div>
            <p className="stress-eyebrow">BROWSER LAYOUT → VISIBLE CANVAS → LOCAL EDIT</p>
            <h1>1 000 сложных нод.</h1>
            <p>
              Колесо — zoom к курсору. Фон — pan. Двойной клик или тап по description —
              редактирование.
            </p>
          </div>
          <a href="./">← Playground</a>
        </section>
        <div className="stress-controls">
          <div>
            <strong>25 001</strong>
            <span>элементов в layout tree</span>
          </div>
          <div>
            <strong>{Math.round(view.scale * 100)}%</strong>
            <span>zoom / камера без HTML layout</span>
          </div>
          <div className="stress-buttons">
            <select
              aria-label="Режим производительности"
              value={selectedMode}
              disabled={busy}
              onChange={(e) => setSelectedMode(e.target.value as Mode)}
            >
              <option value="optimized">Optimized</option>
              <option value="baseline">Baseline / все объекты</option>
            </select>
            <button disabled={busy} className="stress-primary" onClick={() => invoke('mount')}>
              {busy ? 'Измеряем…' : 'Новый монтаж'}
            </button>
            <button disabled={busy || !config.mounted} onClick={() => invoke('remeasure')}>
              Layout
            </button>
            <button disabled={busy || !config.mounted} onClick={() => invoke('resize')}>
              Resize
            </button>
            <button disabled={busy || !config.mounted} onClick={() => invoke('edit')}>
              Edit description
            </button>
          </div>
        </div>
        <section className="stress-preview" aria-label="Стресс сцена Konva">
          <div className="stress-preview-bar">
            <span>
              <i />
              {busy ? 'MEASURING' : config.mounted ? config.mode.toUpperCase() : 'READY'}
            </span>
            <div className="stress-camera-buttons">
              <button disabled={busy || !config.mounted} onClick={() => zoomCentered(1.25)}>
                +
              </button>
              <button disabled={busy || !config.mounted} onClick={() => zoomCentered(1 / 1.25)}>
                −
              </button>
              <button disabled={busy || !config.mounted} onClick={() => setWorldView(!overview)}>
                {overview ? '1:1' : 'Все 1000 / LOD'}
              </button>
              <button disabled={busy || !config.mounted} onClick={() => setWorldView(false)}>
                Сброс камеры
              </button>
            </div>
            <code>{config.width} × 760</code>
          </div>
          <div className="stress-canvas-scroll">
            <div
              ref={holder}
              data-stress-canvas
              className="stress-canvas-holder"
              style={{ width: config.width, height: 760 }}
            >
              {config.mounted ? (
                <DemoCanvas
                  key={config.generation}
                  ref={layout}
                  width={config.width}
                  height={760}
                  panZoom={!busy}
                  pixelRatio={RETINA ? undefined : 1}
                  performance={config.mode === 'optimized' ? OPTIMIZED : BASELINE}
                  onLayout={onLayout}
                  onMeasure={onMeasure}
                  onRenderStats={onRenderStats}
                  onViewChange={setView}
                >
                  <StressScene worldWidth={config.worldWidth} />
                </DemoCanvas>
              ) : (
                <div className="stress-empty">
                  <span>1 000</span>
                  <p>Выберите режим и запустите сцену.</p>
                </div>
              )}
            </div>
          </div>
        </section>
        {error ? (
          <p className="stress-error" role="alert">
            {error}
          </p>
        ) : null}
        <section className="stress-results">
          <div className="stress-result-heading">
            <h2>Фактические замеры</h2>
            <span>
              {last
                ? 'Последний замер: ' +
                  last.cards +
                  ' в модели · ' +
                  last.renderedCards +
                  ' смонтировано · ' +
                  last.groups +
                  ' групп · ' +
                  last.shapes +
                  ' фигур · HTML ' +
                  last.idleHtmlNodes
                : 'Таймер заканчивается после полного Layer.draw + следующий RAF'}
            </span>
          </div>
          <div className="stress-metrics">
            <div>
              <span>Начало → layout</span>
              <strong>
                {last?.mountToLayoutMs ?? '—'}
                <small>ms</small>
              </strong>
            </div>
            <div>
              <span>Draw / scene + hit</span>
              <strong>
                {last?.canvasDrawMs ?? '—'}
                <small>ms</small>
              </strong>
            </div>
            <div>
              <span>Начало → кадр</span>
              <strong>
                {last?.totalToCanvasFrameMs ?? '—'}
                <small>ms</small>
              </strong>
            </div>
          </div>
          <p className="stress-definitions">
            Последний layout: {lastMeasure?.scope ?? '—'} · прочитано{' '}
            {lastMeasure?.measuredNodes ?? 0} элементов · корни:{' '}
            {lastMeasure?.measuredRoots.join(', ') || '—'} · template hits{' '}
            {lastMeasure?.templateHits ?? 0}.{' '}
            {lastMeasure ? Math.round(lastMeasure.durationMs * 100) / 100 + ' ms' : ''}
            <br />
            Модель хранит все 1000 карточек. Optimized монтирует видимые с запасом, использует кеш и
            LOD. Измерительный HTML отсутствует в документе в покое. HTML редактора существует
            только во время ввода; Cmd/Ctrl+Enter — сохранить, Escape — отменить.
          </p>
          {results.length ? (
            <div className="stress-table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Прогон</th>
                    <th>Режим / операция</th>
                    <th>До layout</th>
                    <th>Draw</th>
                    <th>До кадра</th>
                    <th>Измерено / область</th>
                    <th>Konva объекты</th>
                  </tr>
                </thead>
                <tbody>
                  {results.map((result, index) => (
                    <tr key={result.timestamp}>
                      <td>{index + 1}</td>
                      <td>
                        {result.mode} / {result.operation}
                      </td>
                      <td>{result.mountToLayoutMs} ms</td>
                      <td>{result.canvasDrawMs} ms</td>
                      <td>{result.totalToCanvasFrameMs} ms</td>
                      <td>
                        {result.measurement
                          ? result.measurement.measuredNodes + ' / ' + result.measurement.scope
                          : '0 / camera'}
                      </td>
                      <td>
                        {result.groups + result.shapes} · HTML {result.idleHtmlNodes}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
        </section>
        <footer className="stress-footer">
          <span>
            Ноды расположены независимо; Flex внутри рассчитывает браузер. Размер описания может
            менять высоту только своей ноды.
          </span>
          <span>
            Кеш ≤32 MB · {RETINA ? 'DPR устройства' : 'DPR 1'} · CPU slowdown задаётся в DevTools
          </span>
        </footer>
      </main>
    </div>
  );
}
