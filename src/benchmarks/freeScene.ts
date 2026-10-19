import type Konva from 'konva';
import type { ViewTransform } from '../lib';
import type { CameraResult, CameraStats } from './camera';

export type InteractionKind = 'drag' | 'pan' | 'zoom';

export interface DragResult {
  id: string;
  started: number;
  moved: number;
  ended: number;
  start: { x: number; y: number };
  end: { x: number; y: number };
  expectedEnd: { x: number; y: number };
  positionError: number;
  stopped: boolean;
  /** Synchronous native startDrag call, including application dragstart handlers. */
  startCallMs: number;
  /** Time from entering startDrag to the first completed Layer.draw. */
  firstDrawAfterStartMs: number | null;
  /** Synchronous release dispatch, including any synchronous application commit. */
  releaseCallMs: number;
  /** First completed draw on any Stage layer after entering release dispatch. */
  firstDrawAfterReleaseMs: number | null;
}

export interface InteractionResult extends Omit<CameraResult, 'kind'> {
  kind: InteractionKind;
  view: ViewTransform;
  panAmplitude: { x: number; y: number } | null;
  /** Actual preparation time; synchronous work can exceed the requested warmupMs. */
  actualWarmupMs: number;
  warmupFrameIntervalsMs: number[];
  warmupMaxFrameMs: number;
  /** performance.now() timestamps, from the same clock as frameIntervalsMs. */
  measurementStartedAtMs: number;
  measurementEndedAtMs: number;
  /** Records how far the rAF timestamp preceded actual measurement start. */
  measurementStartRafOffsetMs: number;
  /** Interval end timestamps and draw flags, aligned with frameIntervalsMs. */
  frameTimestampsMs: number[];
  frameHadDraw: boolean[];
  drawP95Ms: number;
  drawP99Ms: number;
  /** One entry per completed draw, aligned with drawDurationsMs. */
  drawLayerIndices: number[];
  drawsByLayer: Record<string, number>;
  measurementRectReads: number;
  measurementRootAttachments: number;
  drag: DragResult | null;
}

export interface InteractionOptions {
  kind: InteractionKind;
  stage: Konva.Stage;
  setView: (view: ViewTransform) => void;
  stats: () => CameraStats;
  /** Required for drag. Return the actual draggable placement Group. */
  getTarget?: () => Konva.Group | null;
  /** Starting camera, shared across the free-position and grid fixtures. */
  view?: ViewTransform;
  /** Zoom is anchored at the viewport centre; all values are logical scale factors. */
  zoomRange?: { min: number; max: number };
  /** Keep an overview on screen; absent means a linear -240/-120 px/s pan. */
  panAmplitude?: { x: number; y: number };
  durationMs?: number;
  warmupMs?: number;
  signal?: AbortSignal;
}

const running = new WeakSet<Konva.Stage>();
const percentile = (sorted: number[], fraction: number) =>
  sorted[Math.max(0, Math.ceil(sorted.length * fraction) - 1)] ?? 0;

/**
 * Uses the application's normal camera path or native Konva drag with DOM mouse
 * events. Completed scene + hit Layer.draw calls are counted separately from rAF.
 * This measures browser JavaScript pacing, not GPU presentation or physical input.
 */
export async function runInteractionBenchmark({
  kind,
  stage,
  setView,
  stats,
  getTarget,
  view = { ...stage.position(), scale: stage.scaleX() },
  zoomRange = { min: view.scale * 0.65, max: view.scale * 1.6 },
  panAmplitude,
  durationMs = 5_000,
  warmupMs = 1_000,
  signal,
}: InteractionOptions): Promise<InteractionResult> {
  if (!Number.isFinite(durationMs) || durationMs <= 0 || !Number.isFinite(warmupMs) || warmupMs < 0)
    throw new Error('Benchmark duration must be positive and warmup must be non-negative.');
  if (
    ![view.x, view.y, view.scale, zoomRange.min, zoomRange.max].every(Number.isFinite) ||
    view.scale <= 0 ||
    zoomRange.min <= 0 ||
    zoomRange.max < zoomRange.min
  )
    throw new Error('Benchmark camera and zoom range must be finite and positive.');
  if (
    panAmplitude &&
    (![panAmplitude.x, panAmplitude.y].every(Number.isFinite) ||
      panAmplitude.x < 0 ||
      panAmplitude.y < 0)
  )
    throw new Error('Pan amplitude must be finite and non-negative.');
  if (signal?.aborted) throw new DOMException('Interaction benchmark aborted.', 'AbortError');
  if (document.hidden) throw new Error('Interaction benchmark requires a visible browser tab.');
  if (running.has(stage)) throw new Error('An interaction benchmark is already running.');
  if (
    !stage.getLayers().length ||
    !stage.container().isConnected ||
    stage.width() <= 0 ||
    stage.height() <= 0
  )
    throw new Error('Interaction benchmark requires a mounted stage and layer.');
  if (kind === 'drag' && !getTarget) throw new Error('Drag benchmark requires getTarget().');

  running.add(stage);
  const frameIntervalsMs: number[] = [];
  const frameTimestampsMs: number[] = [];
  const frameHadDraw: boolean[] = [];
  const warmupFrameIntervalsMs: number[] = [];
  const drawDurationsMs: number[] = [];
  const drawLayerIndices: number[] = [];
  const wrappers = new Map<
    Konva.Layer,
    { original: Konva.Layer['draw']; own?: PropertyDescriptor; wrapped: Konva.Layer['draw'] }
  >();
  const originalRect = Element.prototype.getBoundingClientRect;
  const rectDescriptor = Object.getOwnPropertyDescriptor(
    Element.prototype,
    'getBoundingClientRect',
  );
  let measurementRectReads = 0;
  let measurementRootAttachments = 0;
  let recordingDom = false;
  const measuredRect: Element['getBoundingClientRect'] = function (this: Element) {
    if (recordingDom && this.hasAttribute('data-layout-key')) measurementRectReads++;
    return originalRect.call(this);
  };
  const countAttachments = (records: MutationRecord[]) => {
    if (!recordingDom) return;
    for (const record of records)
      for (const element of record.addedNodes)
        if (element instanceof Element && element.classList.contains('konva-layout-measure'))
          measurementRootAttachments++;
  };
  const observer = new MutationObserver(countAttachments);
  let measuring = false;
  let settled = false;
  let frame = 0;
  let timeout = 0;
  let renderedFrameCount = 0;
  let previousDrawCount = 0;
  let startStats: CameraStats;
  let maxCacheBytes = 0;
  let maxHtmlElements = 0;
  let minVisibleRoots = Infinity;
  let maxVisibleRoots = 0;
  let minCanvasPixelRatio = Infinity;
  let maxCanvasPixelRatio = 0;
  let measurementRevisionChanged = false;
  let modeChanged = false;
  let target: Konva.Group | null = null;
  let drag: DragResult | null = null;
  let dragStartedAt: number | undefined;
  let dragReleasedAt: number | undefined;
  let pointer = { x: 0, y: 0 };
  let lastPointer = pointer;
  let parentInverse: Konva.Transform | undefined;
  const snapshot = (): CameraStats => {
    const current = stats();
    return {
      ...current,
      measurement: current.measurement && {
        ...current.measurement,
        measuredRoots: [...current.measurement.measuredRoots],
      },
      rendering: current.rendering && { ...current.rendering },
    };
  };
  const sampleRatio = (ratio: number) => {
    minCanvasPixelRatio = Math.min(minCanvasPixelRatio, ratio);
    maxCanvasPixelRatio = Math.max(maxCanvasPixelRatio, ratio);
  };
  const sample = (current: CameraStats) => {
    maxCacheBytes = Math.max(maxCacheBytes, current.rendering?.cacheBytes ?? 0);
    maxHtmlElements = Math.max(maxHtmlElements, current.idleHtmlElements);
    const visible = current.rendering?.visibleRoots ?? current.renderedCards;
    minVisibleRoots = Math.min(minVisibleRoots, visible);
    maxVisibleRoots = Math.max(maxVisibleRoots, visible);
    sampleRatio(current.canvasPixelRatio);
    measurementRevisionChanged ||=
      current.measurement?.revision !== startStats.measurement?.revision;
    modeChanged ||= current.mode !== startStats.mode;
  };
  const mouseEvent = (type: string, point: { x: number; y: number }, pressed: boolean) => {
    const rect = stage.content.getBoundingClientRect();
    return new MouseEvent(type, {
      bubbles: true,
      cancelable: true,
      button: 0,
      buttons: pressed ? 1 : 0,
      clientX: rect.left + (point.x * rect.width) / stage.width(),
      clientY: rect.top + (point.y * rect.height) / stage.height(),
    });
  };
  const startDrag = () => {
    target = getTarget?.() ?? null;
    if (!target || target.getStage() !== stage || !target.draggable())
      throw new Error('Drag target must be a mounted, draggable Group.');
    target.moveToTop();
    pointer = target.getAbsoluteTransform().point({ x: Math.min(24, target.width() / 2), y: 24 });
    lastPointer = pointer;
    if (pointer.x < 0 || pointer.y < 0 || pointer.x > stage.width() || pointer.y > stage.height())
      throw new Error('Drag target must be visible at the benchmark camera.');
    parentInverse = target.getParent()!.getAbsoluteTransform().copy().invert();
    drag = {
      id: (target.getAttr('layoutRootId') as string) || target.id(),
      started: 0,
      moved: 0,
      ended: 0,
      start: { ...target.position() },
      end: { ...target.position() },
      expectedEnd: { ...target.position() },
      positionError: 0,
      stopped: false,
      startCallMs: 0,
      firstDrawAfterStartMs: null,
      releaseCallMs: 0,
      firstDrawAfterReleaseMs: null,
    };
    stage.on('dragstart.freeSceneBenchmark', (event) => {
      if (drag && Object.is(event.target, target)) drag.started++;
    });
    stage.on('dragmove.freeSceneBenchmark', (event) => {
      if (drag && Object.is(event.target, target)) drag.moved++;
    });
    stage.on('dragend.freeSceneBenchmark', (event) => {
      if (drag && Object.is(event.target, target)) drag.ended++;
    });
    const down = mouseEvent('mousedown', pointer, true);
    stage.setPointersPositions(down);
    const nativeStart = stage.getPointerPosition();
    if (!nativeStart) throw new Error('Native drag pointer was not registered.');
    // MouseEvent client coordinates can be rounded by the browser. At 3% a
    // fractional screen pixel is many world units: validate against delivered input.
    pointer = { ...nativeStart };
    lastPointer = pointer;
    // Explicit start avoids hit-testing a tiny, overlapping 3% card to select a target.
    // Movement uses Konva's window handlers; release bubbles from the canvas content.
    dragStartedAt = performance.now();
    if (!target.isDragging()) target.startDrag({ evt: down });
    drag.startCallMs = performance.now() - dragStartedAt;
    if (!target.isDragging()) throw new Error('Native Konva drag did not start.');
  };
  const moveDrag = (elapsedMs: number) => {
    const seconds = elapsedMs / 1_000;
    const requestedPointer = {
      x: pointer.x + 90 * Math.sin((seconds * Math.PI * 2) / 2.5),
      y: pointer.y + 50 * Math.sin((seconds * Math.PI * 2) / 1.7),
    };
    window.dispatchEvent(mouseEvent('mousemove', requestedPointer, true));
    const nativePointer = stage.getPointerPosition();
    if (!nativePointer) throw new Error('Native drag pointer was lost.');
    lastPointer = { ...nativePointer };
  };
  const releaseDrag = () => {
    if (!target || !drag) return;
    dragReleasedAt = performance.now();
    stage.content.dispatchEvent(mouseEvent('mouseup', lastPointer, false));
    if (target.isDragging()) target.stopDrag();
    drag.releaseCallMs = performance.now() - dragReleasedAt;
    drag.end = { ...target.position() };
    const from = parentInverse!.point(pointer);
    const to = parentInverse!.point(lastPointer);
    drag.expectedEnd = { x: drag.start.x + to.x - from.x, y: drag.start.y + to.y - from.y };
    drag.positionError = Math.hypot(
      drag.end.x - drag.expectedEnd.x,
      drag.end.y - drag.expectedEnd.y,
    );
    drag.stopped = !target.isDragging();
  };
  const center = { x: stage.width() / 2, y: stage.height() / 2 };
  const anchor = { x: (center.x - view.x) / view.scale, y: (center.y - view.y) / view.scale };
  const update = (elapsedMs: number) => {
    if (kind === 'drag') return moveDrag(elapsedMs);
    const seconds = elapsedMs / 1_000;
    if (kind === 'pan') {
      setView({
        ...view,
        x:
          view.x +
          (panAmplitude ? panAmplitude.x * Math.sin((seconds * Math.PI * 2) / 5) : -240 * seconds),
        y:
          view.y +
          (panAmplitude
            ? panAmplitude.y * Math.sin((seconds * Math.PI * 2) / 3.5)
            : -120 * seconds),
      });
    } else {
      const scale =
        zoomRange.min +
        ((zoomRange.max - zoomRange.min) * (1 - Math.cos((seconds * Math.PI * 2) / 2.5))) / 2;
      setView({ x: center.x - anchor.x * scale, y: center.y - anchor.y * scale, scale });
    }
  };

  return new Promise<InteractionResult>((resolve, reject) => {
    const cleanup = () => {
      measuring = false;
      settled = true;
      cancelAnimationFrame(frame);
      clearTimeout(timeout);
      signal?.removeEventListener('abort', onAbort);
      document.removeEventListener('visibilitychange', onVisibility);
      stage.off('.freeSceneBenchmark');
      if (target?.isDragging()) target.stopDrag();
      countAttachments(observer.takeRecords());
      observer.disconnect();
      recordingDom = false;
      if (Element.prototype.getBoundingClientRect === measuredRect && rectDescriptor)
        Object.defineProperty(Element.prototype, 'getBoundingClientRect', rectDescriptor);
      for (const [layer, { own, wrapped }] of wrappers)
        if (layer.draw === wrapped) {
          if (own) Object.defineProperty(layer, 'draw', own);
          else delete (layer as Partial<Konva.Layer>).draw;
        }
      running.delete(stage);
    };
    const fail = (reason: unknown) => {
      if (!settled) {
        cleanup();
        reject(reason);
      }
    };
    const onAbort = () => fail(new DOMException('Interaction benchmark aborted.', 'AbortError'));
    const onVisibility = () => {
      if (document.hidden) fail(new Error('Benchmark tab became hidden.'));
    };
    const wrapLayers = () => {
      for (const [index, layer] of stage.getLayers().entries()) {
        if (wrappers.has(layer)) continue;
        const original = layer.draw;
        const own = Object.getOwnPropertyDescriptor(layer, 'draw');
        const wrapped: Konva.Layer['draw'] = function (this: Konva.Layer) {
          const startedAt = performance.now();
          try {
            const returned = original.call(this);
            if (drag && dragStartedAt !== undefined && drag.firstDrawAfterStartMs === null)
              drag.firstDrawAfterStartMs = performance.now() - dragStartedAt;
            if (drag && dragReleasedAt !== undefined && drag.firstDrawAfterReleaseMs === null)
              drag.firstDrawAfterReleaseMs = performance.now() - dragReleasedAt;
            if (measuring) {
              drawDurationsMs.push(performance.now() - startedAt);
              drawLayerIndices.push(index);
              sampleRatio(this.getCanvas().getPixelRatio());
            }
            return returned;
          } catch (reason) {
            fail(reason);
            throw reason;
          }
        };
        wrappers.set(layer, { original, own, wrapped });
        layer.draw = wrapped;
      }
    };
    const alive = () => {
      if (!stage.container().isConnected || !stage.getLayers().length)
        throw new Error('Benchmark stage was unmounted.');
      if (target && target.getStage() !== stage) throw new Error('Drag target was unmounted.');
    };
    let warmupStartedAt = 0;
    let previousWarmupFrameAt: number | undefined;
    let startedAt = 0;
    let endedAt = 0;
    let measurementStartRafOffsetMs = 0;
    let previousFrameAt = 0;
    let lastSampleAt = 0;
    let tailFrames = 0;
    let measuredDuration = 0;
    const finish = () => {
      alive();
      const endStats = snapshot();
      sample(endStats);
      countAttachments(observer.takeRecords());
      if (!drawDurationsMs.length)
        throw new Error('Interaction produced no completed Layer.draw().');
      if (
        drag &&
        (!drag.started || !drag.moved || !drag.ended || !drag.stopped || drag.positionError > 0.01)
      )
        throw new Error(`Native drag did not complete correctly: ${JSON.stringify(drag)}`);
      const sorted = [...frameIntervalsMs].sort((a, b) => a - b);
      const sortedDraws = [...drawDurationsMs].sort((a, b) => a - b);
      const frameCount = frameIntervalsMs.length;
      const drawCount = drawDurationsMs.length;
      const drawsByLayer: Record<string, number> = {};
      for (const index of drawLayerIndices) drawsByLayer[index] = (drawsByLayer[index] ?? 0) + 1;
      const result: InteractionResult = {
        kind,
        view: { ...view },
        panAmplitude: panAmplitude ? { ...panAmplitude } : null,
        requestedDurationMs: durationMs,
        warmupMs,
        actualWarmupMs: startedAt - warmupStartedAt,
        warmupFrameIntervalsMs,
        warmupMaxFrameMs: warmupFrameIntervalsMs.reduce(
          (maximum, interval) => Math.max(maximum, interval),
          0,
        ),
        measurementStartedAtMs: startedAt,
        measurementEndedAtMs: endedAt,
        measurementStartRafOffsetMs,
        durationMs: measuredDuration,
        fps: (frameCount * 1_000) / measuredDuration,
        frameCount,
        drawCount,
        drawsPerSecond: (drawCount * 1_000) / measuredDuration,
        renderedFrameCount,
        renderedFps: (renderedFrameCount * 1_000) / measuredDuration,
        emptyFrameCount: frameCount - renderedFrameCount,
        frameIntervalsMs,
        frameTimestampsMs,
        frameHadDraw,
        drawDurationsMs,
        drawLayerIndices,
        drawsByLayer,
        frameP50Ms: percentile(sorted, 0.5),
        p95Ms: percentile(sorted, 0.95),
        p99Ms: percentile(sorted, 0.99),
        drawP95Ms: percentile(sortedDraws, 0.95),
        drawP99Ms: percentile(sortedDraws, 0.99),
        maxFrameMs: sorted.at(-1) ?? 0,
        overBudgetPercent:
          (frameIntervalsMs.filter((interval) => interval > 20).length * 100) / frameCount,
        approxDropped60HzFrames: frameIntervalsMs.reduce(
          (total, interval) => total + Math.max(0, Math.round(interval / (1_000 / 60)) - 1),
          0,
        ),
        startStats,
        endStats,
        layoutPasses: Math.max(
          0,
          (endStats.measurement?.revision ?? 0) - (startStats.measurement?.revision ?? 0),
        ),
        measurementRevisionChanged,
        maxCacheBytes,
        maxHtmlElements,
        minVisibleRoots,
        maxVisibleRoots,
        minCanvasPixelRatio,
        maxCanvasPixelRatio,
        canvasPixelRatioChanged: minCanvasPixelRatio !== maxCanvasPixelRatio,
        modeChanged,
        measurementRectReads,
        measurementRootAttachments,
        drag,
      };
      cleanup();
      resolve(result);
    };
    const tick = (at: number) => {
      if (settled) return;
      try {
        alive();
        wrapLayers();
        const now = performance.now();
        warmupStartedAt ||= now;
        if (tailFrames) {
          if (++tailFrames === 3) finish();
        } else if (!measuring) {
          if (previousWarmupFrameAt !== undefined)
            warmupFrameIntervalsMs.push(now - previousWarmupFrameAt);
          previousWarmupFrameAt = now;
          if (kind === 'drag' && !target) startDrag();
          if (now - warmupStartedAt < warmupMs) update(now - warmupStartedAt);
          else {
            startStats = snapshot();
            sample(startStats);
            measuring = true;
            recordingDom = true;
            startedAt = performance.now();
            measurementStartRafOffsetMs = startedAt - at;
            previousFrameAt = startedAt;
            lastSampleAt = startedAt;
            update(0);
          }
        } else {
          frameIntervalsMs.push(now - previousFrameAt);
          frameTimestampsMs.push(now);
          previousFrameAt = now;
          const hadDraw = drawDurationsMs.length > previousDrawCount;
          frameHadDraw.push(hadDraw);
          if (hadDraw) renderedFrameCount++;
          previousDrawCount = drawDurationsMs.length;
          const elapsed = now - startedAt;
          if (elapsed >= durationMs) {
            measuring = false;
            endedAt = now;
            measuredDuration = frameIntervalsMs.reduce((sum, interval) => sum + interval, 0);
            if (kind === 'drag') releaseDrag();
            tailFrames = 1;
          } else {
            update(elapsed);
            if (now - lastSampleAt >= 250) {
              sample(snapshot());
              lastSampleAt = now;
            }
          }
        }
        if (!settled) frame = requestAnimationFrame(tick);
      } catch (reason) {
        fail(reason);
      }
    };
    try {
      setView(view);
      wrapLayers();
      Element.prototype.getBoundingClientRect = measuredRect;
      observer.observe(document.body, { childList: true, subtree: true });
      signal?.addEventListener('abort', onAbort, { once: true });
      document.addEventListener('visibilitychange', onVisibility);
      timeout = window.setTimeout(
        () => fail(new Error('Interaction benchmark timed out.')),
        warmupMs + durationMs + 15_000,
      );
      frame = requestAnimationFrame(tick);
    } catch (reason) {
      fail(reason);
    }
  });
}
