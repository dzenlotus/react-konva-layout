import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import Konva from 'konva';
import type { DemoCanvasHandle } from '../examples/DemoCanvas';
import { clampZoom, normalizeView, readSavedView, zoomAtPoint } from '../examples/camera';
import type { LayoutNode, LayoutMetrics, RenderMetrics, ViewTransform } from '../lib';
import {
  COUNT,
  WORLD_WIDTH,
  WORLD_HEIGHT,
  EXPECTED_PRIMITIVES,
  DESCRIPTION,
} from '../examples/DesignedStressScene';
import {
  runCameraBenchmark,
  type CameraKind,
  type CameraResult,
  type CameraStats,
} from '../benchmarks/camera';
import type { Mode, PendingMeasurement, StressApi, StressResult, StressStats } from './types';
import { findCanvasText, isCompletedDraw } from './completedDraw';

const rounded = (value: number) => Math.round(value * 100) / 100;
const errorMessage = (reason: unknown) =>
  reason instanceof Error ? reason.message : String(reason);
function countTree(nodes: LayoutNode[]): number {
  let count = 0;
  for (const node of nodes) count += 1 + countTree(node.children);
  return count;
}

const nextFrame = () => new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));

export function useStressBenchmark() {
  const [savedView] = useState(() => readSavedView(window.location.search));
  const [previewImage, setPreviewImage] = useState<HTMLImageElement>();
  const [cameraResults, setCameraResults] = useState<CameraResult[]>([]);
  const imagePromise = useRef<Promise<HTMLImageElement> | null>(null);
  const assetReadyMs = useRef(0);
  const activeCamera = useRef<AbortController | null>(null);
  const prepareImage = useCallback(() => {
    if (!imagePromise.current) {
      const startedAt = performance.now();
      imagePromise.current = new Promise<HTMLImageElement>((resolve, reject) => {
        const image = new Image();
        image.onload = async () => {
          try {
            await image.decode();
            image.onload = null;
            image.onerror = null;
            assetReadyMs.current = rounded(performance.now() - startedAt);
            setPreviewImage(image);
            resolve(image);
          } catch (error) {
            reject(error);
          }
        };
        image.onerror = () => reject(new Error('Не удалось загрузить фотографию превью.'));
        image.src = `${import.meta.env.BASE_URL}node-preview.jpg`;
      });
    }
    return imagePromise.current;
  }, []);
  const [config, setConfig] = useState({
    generation: 0,
    width: 1400,
    worldWidth: WORLD_WIDTH,
    mounted: false,
    mode: 'optimized' as Mode,
    initialView: savedView,
  });
  const [selectedMode, setSelectedMode] = useState<Mode>('optimized');
  const [busy, setBusy] = useState(false);
  const [results, setResults] = useState<StressResult[]>([]);
  const [error, setError] = useState('');
  const [overview, setOverview] = useState(false);
  const [view, setView] = useState<ViewTransform>(savedView);
  const [lastMeasure, setLastMeasure] = useState<LayoutMetrics | null>(null);
  const holder = useRef<HTMLDivElement>(null);
  const layout = useRef<DemoCanvasHandle>(null);
  const configRef = useRef(config);
  const pending = useRef<PendingMeasurement | null>(null);
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
      assetReadyMs: assetReadyMs.current,
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
    (
      operation: StressResult['operation'],
      extras: Pick<PendingMeasurement, 'expectedText' | 'expectedView'> = {},
    ) =>
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
    async (
      operation: 'mount' | 'resize' | 'remeasure',
      mode?: Mode,
      initialView?: Partial<ViewTransform>,
    ): Promise<StressResult> => {
      if (pending.current || preparing.current) throw new Error('Замер уже выполняется.');
      if (operation !== 'mount' && !configRef.current.mounted)
        throw new Error('Сначала запустите сцену.');
      preparing.current = true;
      setBusy(true);
      setError('');
      setOverview(false);
      try {
        const mountView = normalizeView(initialView ?? savedView);
        if (operation === 'mount') {
          await Promise.all([prepareImage(), document.fonts.ready]);
          flushSync(() => setConfig((previous) => ({ ...previous, mounted: false })));
          await nextFrame();
          await nextFrame();
          primitiveCount.current = 0;
          renderStats.current = null;
          setView(mountView);
        } else {
          layout.current?.setView({ x: 0, y: 0, scale: 1 });
          await nextFrame();
          await nextFrame();
        }
        const result = makeJob(operation, {
          expectedView: operation === 'mount' ? mountView : { x: 0, y: 0, scale: 1 },
        });
        if (operation === 'mount')
          setConfig((previous) => ({
            generation: previous.generation + 1,
            width: 1400,
            worldWidth: WORLD_WIDTH,
            mounted: true,
            mode: mode ?? selectedMode,
            initialView: mountView,
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
    [makeJob, selectedMode, prepareImage, savedView],
  );

  const moveView = useCallback(
    async (next: Partial<ViewTransform>) => {
      if (pending.current || preparing.current) throw new Error('Замер уже выполняется.');
      const currentLayout = layout.current;
      if (!configRef.current.mounted || !currentLayout) throw new Error('Сначала запустите сцену.');
      setBusy(true);
      setError('');
      const expectedView = { ...currentLayout.getView(), ...next };
      const result = makeJob('view', { expectedView });
      currentLayout.setView(expectedView);
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
        const target = stage()?.findOne('#stress-node-0000-card-description-text');
        const canvasText = findCanvasText(target);
        if (!canvasText) throw new Error('Description не найден.');
        canvasText.fire('dblclick', { evt: new MouseEvent('dblclick', { bubbles: true }) }, true);
        await nextFrame();
        await nextFrame();
        const editor = document.querySelector<HTMLTextAreaElement>(
          '[data-testid="layout-text-editor"]',
        );
        if (!editor) throw new Error('Редактор не появился.');
        const setValue = Object.getOwnPropertyDescriptor(
          HTMLTextAreaElement.prototype,
          'value',
        )?.set;
        if (!setValue) throw new Error('Редактор не поддерживает изменение текста.');
        setValue.call(editor, text);
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

  const cameraStats = useCallback(
    (): CameraStats => ({
      measurement: layout.current?.getMetrics() ?? null,
      rendering: renderStats.current,
      idleHtmlNodes: holder.current?.querySelectorAll('[data-layout-key]').length ?? 0,
      canvasPixelRatio: stage()?.getLayers()[0]?.getCanvas().getPixelRatio() ?? 1,
      renderedCards: renderStats.current?.visibleRoots ?? 0,
      worldWidth: configRef.current.worldWidth,
      worldHeight: WORLD_HEIGHT,
      mode: configRef.current.mode,
    }),
    [stage],
  );

  const camera = useCallback(
    async (kind: CameraKind, durationMs = 5000, warmupMs = 1000) => {
      if (pending.current || preparing.current) throw new Error('Замер уже выполняется.');
      const currentStage = stage();
      if (!configRef.current.mounted || !currentStage || !layout.current)
        throw new Error('Сначала запустите сцену.');
      preparing.current = true;
      setBusy(true);
      setError('');
      const controller = new AbortController();
      activeCamera.current = controller;
      try {
        const result = await runCameraBenchmark({
          kind,
          stage: currentStage,
          setView: (next) => layout.current?.setView(next),
          stats: cameraStats,
          durationMs,
          warmupMs,
          signal: controller.signal,
        });
        setCameraResults((previous) => [...previous.slice(-29), result]);
        return result;
      } finally {
        preparing.current = false;
        activeCamera.current = null;
        setBusy(false);
      }
    },
    [stage, cameraStats],
  );

  useLayoutEffect(() => {
    const drawing = stage()?.getLayers()[0];
    if (!drawing) return;
    const originalDraw = drawing.draw;
    const ownDraw = Object.getOwnPropertyDescriptor(drawing, 'draw');
    const measuredDraw = function (this: Konva.Layer) {
      const job = pending.current,
        current = this.getStage(),
        model = layout.current?.getLayout('stress-world');
      const eligible = Boolean(
        job &&
        current &&
        model &&
        holder.current &&
        layout.current &&
        isCompletedDraw({
          layer: this,
          holder: holder.current,
          model,
          camera: layout.current.getView(),
          config: configRef.current,
          job,
        }),
      );
      const before = eligible ? performance.now() : 0;
      const returned = originalDraw.call(this);
      if (eligible && job && pending.current === job) {
        job.drawMs = performance.now() - before;
        frame.current = requestAnimationFrame(finish);
      }
      return returned;
    };
    drawing.draw = measuredDraw;
    return () => {
      if (drawing.draw !== measuredDraw) return;
      if (ownDraw) Object.defineProperty(drawing, 'draw', ownDraw);
      else delete (drawing as Partial<Konva.Layer>).draw;
    };
  }, [config.mounted, config.generation, finish, stage]);

  useEffect(() => {
    const api: StressApi = {
      run: (mode, initialView) => start('mount', mode, initialView),
      resize: () => start('resize'),
      remeasure: () => start('remeasure'),
      stats,
      overview: setWorldView,
      edit,
      view: moveView,
      camera,
      inspect: () => ({ stage: stage(), layout: layout.current }),
    };
    window.layoutStress = api;
    return () => {
      if (window.layoutStress === api) delete window.layoutStress;
      activeCamera.current?.abort();
      cancelAnimationFrame(frame.current);
      if (pending.current) {
        clearTimeout(pending.current.timeout);
        pending.current.reject(new Error('Benchmark закрыт.'));
        pending.current = null;
      }
    };
  }, [edit, finish, moveView, setWorldView, stage, start, stats, camera]);

  const invoke = (operation: 'mount' | 'resize' | 'remeasure' | 'edit') => {
    void (operation === 'edit' ? edit() : start(operation)).catch((reason) =>
      setError(errorMessage(reason)),
    );
  };
  const zoomCentered = (factor: number) => {
    const current = layout.current?.getView();
    if (!current) return;
    const scale = clampZoom(current.scale * factor);
    layout.current?.setView(zoomAtPoint(current, { x: config.width / 2, y: 380 }, scale));
  };
  return {
    previewImage,
    cameraResults,
    config,
    selectedMode,
    setSelectedMode,
    busy,
    results,
    error,
    overview,
    view,
    lastMeasure,
    holder,
    layout,
    onLayout,
    onMeasure,
    onRenderStats,
    setView,
    invoke,
    zoomCentered,
    setWorldView,
    runCamera: (kind: CameraKind) => {
      void camera(kind).catch((reason: unknown) => setError(errorMessage(reason)));
    },
  };
}
