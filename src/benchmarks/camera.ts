import type Konva from 'konva';
import type { LayoutMetrics, RenderMetrics, ViewTransform } from '../lib';

export type CameraKind = 'pan' | 'zoom' | 'overview';

/** StressStats may supply extra fields; these are retained in the result snapshots. */
export interface CameraStats {
  measurement: LayoutMetrics | null;
  rendering: RenderMetrics | null;
  idleHtmlNodes: number;
  canvasPixelRatio: number;
  renderedCards: number;
  worldWidth?: number;
  worldHeight?: number;
  mode?: string;
}

export interface CameraResult {
  kind: CameraKind;
  requestedDurationMs: number;
  warmupMs: number;
  durationMs: number;
  fps: number;
  frameCount: number;
  drawCount: number;
  drawsPerSecond: number;
  renderedFrameCount: number;
  renderedFps: number;
  emptyFrameCount: number;
  frameIntervalsMs: number[];
  drawDurationsMs: number[];
  frameP50Ms: number;
  p95Ms: number;
  p99Ms: number;
  maxFrameMs: number;
  /** Percentage of rAF intervals strictly longer than 20 ms. */
  overBudgetPercent: number;
  approxDropped60HzFrames: number;
  startStats: CameraStats;
  endStats: CameraStats;
  /** Revision delta, not a separate instrumentation of the measurement engine. */
  layoutPasses: number;
  measurementRevisionChanged: boolean;
  maxCacheBytes: number;
  maxHtmlNodes: number;
  minVisibleRoots: number;
  maxVisibleRoots: number;
  minCanvasPixelRatio: number;
  maxCanvasPixelRatio: number;
  canvasPixelRatioChanged: boolean;
  modeChanged: boolean;
}

interface CameraOptions {
  kind: CameraKind;
  stage: Konva.Stage;
  setView: (view: ViewTransform) => void;
  stats: () => CameraStats;
  durationMs?: number;
  warmupMs?: number;
  signal?: AbortSignal;
}

const running = new WeakSet<Konva.Stage>();
const percentile = (sorted: number[], fraction: number) =>
  sorted[Math.max(0, Math.ceil(sorted.length * fraction) - 1)] ?? 0;

/**
 * Measures rAF pacing during the normal camera/batchDraw path and completed full
 * Layer.draw calls (scene + hit). rAF and JS draw time do not prove GPU presentation.
 * stats() is sampled every 250 ms; callers should provide a lightweight snapshot.
 * No canvas quality, cache policy, prototypes, or draw scheduling are changed.
 */
export async function runCameraBenchmark({
  kind,
  stage,
  setView,
  stats,
  durationMs = 5_000,
  warmupMs = 1_000,
  signal,
}: CameraOptions): Promise<CameraResult> {
  if (!Number.isFinite(durationMs) || durationMs <= 0 || !Number.isFinite(warmupMs) || warmupMs < 0)
    throw new Error('Camera duration must be positive and warmup must be non-negative.');
  if (signal?.aborted) throw new DOMException('Camera benchmark aborted.', 'AbortError');
  if (document.hidden) throw new Error('Camera benchmark requires a visible browser tab.');
  if (running.has(stage)) throw new Error('A camera benchmark is already running on this stage.');
  const layer = stage.getLayers()[0];
  if (!layer || !stage.container().isConnected || stage.width() <= 0 || stage.height() <= 0)
    throw new Error('Camera benchmark requires a mounted stage and layer.');

  running.add(stage);
  const originalDraw = layer.draw;
  const ownDraw = Object.getOwnPropertyDescriptor(layer, 'draw');
  const frameIntervalsMs: number[] = [];
  const drawDurationsMs: number[] = [];
  let measuring = false;
  let settled = false;
  let frame = 0;
  let timeout = 0;
  let renderedFrameCount = 0;
  let previousDrawCount = 0;
  let maxCacheBytes = 0;
  let maxHtmlNodes = 0;
  let minVisibleRoots = Infinity;
  let maxVisibleRoots = 0;
  let minCanvasPixelRatio = Infinity;
  let maxCanvasPixelRatio = 0;
  let measurementRevisionChanged = false;
  let modeChanged = false;
  let startStats: CameraStats;

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
    maxHtmlNodes = Math.max(maxHtmlNodes, current.idleHtmlNodes);
    const visible = current.rendering?.visibleRoots ?? current.renderedCards;
    minVisibleRoots = Math.min(minVisibleRoots, visible);
    maxVisibleRoots = Math.max(maxVisibleRoots, visible);
    sampleRatio(current.canvasPixelRatio);
    measurementRevisionChanged ||=
      current.measurement?.revision !== startStats.measurement?.revision;
    modeChanged ||= current.mode !== startStats.mode;
  };

  return new Promise<CameraResult>((resolve, reject) => {
    const cleanup = () => {
      measuring = false;
      settled = true;
      cancelAnimationFrame(frame);
      clearTimeout(timeout);
      signal?.removeEventListener('abort', onAbort);
      document.removeEventListener('visibilitychange', onVisibility);
      if (layer.draw === measuredDraw) {
        if (ownDraw) Object.defineProperty(layer, 'draw', ownDraw);
        else delete (layer as Partial<Konva.Layer>).draw;
      }
      running.delete(stage);
    };
    const fail = (reason: unknown) => {
      if (settled) return;
      cleanup();
      reject(reason);
    };
    const onAbort = () => fail(new DOMException('Camera benchmark aborted.', 'AbortError'));
    const onVisibility = () => {
      if (document.hidden)
        fail(new Error('Camera benchmark stopped because the tab became hidden.'));
    };
    const measuredDraw: Konva.Layer['draw'] = function (this: Konva.Layer) {
      const startedAt = performance.now();
      try {
        const returned = originalDraw.call(this);
        if (measuring) {
          drawDurationsMs.push(performance.now() - startedAt);
          sampleRatio(this.getCanvas().getPixelRatio());
        }
        return returned;
      } catch (reason) {
        fail(reason);
        throw reason;
      }
    };
    const alive = () => {
      if (!stage.container().isConnected || layer.getStage() !== stage)
        throw new Error('Camera benchmark stage was unmounted.');
    };

    let warmupStartedAt: number | undefined;
    let startedAt = 0;
    let previousFrameAt = 0;
    let lastSampleAt = 0;
    let tailFrames = 0;
    let measuredDuration = 0;
    let worldWidth = 9_616;
    let worldHeight = 18_176;
    const viewAt = (elapsedMs: number): ViewTransform => {
      const seconds = elapsedMs / 1_000;
      if (kind === 'pan') return { x: -600 - 240 * seconds, y: -300 - 120 * seconds, scale: 1 };
      if (kind === 'zoom') {
        const scale = 0.65 + (0.95 * (1 - Math.cos((seconds * Math.PI * 2) / 2.5))) / 2;
        return {
          x: stage.width() / 2 - (stage.width() / 2 + 600) * scale,
          y: stage.height() / 2 - (stage.height() / 2 + 400) * scale,
          scale,
        };
      }
      const angle = (seconds * Math.PI * 2) / 5;
      const scale = 0.08 - 0.02 * Math.cos(angle);
      return {
        x: stage.width() / 2 - worldWidth * (0.5 + 0.12 * Math.sin(angle)) * scale,
        y: stage.height() / 2 - worldHeight * (0.5 + 0.14 * Math.cos(angle)) * scale,
        scale,
      };
    };

    const finish = () => {
      alive();
      const endStats = snapshot();
      sample(endStats);
      if (!drawDurationsMs.length)
        throw new Error('Camera moved without a completed Layer.draw().');
      const sorted = [...frameIntervalsMs].sort((a, b) => a - b);
      const frameCount = frameIntervalsMs.length;
      const drawCount = drawDurationsMs.length;
      const result: CameraResult = {
        kind,
        requestedDurationMs: durationMs,
        warmupMs,
        durationMs: measuredDuration,
        fps: (frameCount * 1_000) / measuredDuration,
        frameCount,
        drawCount,
        drawsPerSecond: (drawCount * 1_000) / measuredDuration,
        renderedFrameCount,
        renderedFps: (renderedFrameCount * 1_000) / measuredDuration,
        emptyFrameCount: frameCount - renderedFrameCount,
        frameIntervalsMs,
        drawDurationsMs,
        frameP50Ms: percentile(sorted, 0.5),
        p95Ms: percentile(sorted, 0.95),
        p99Ms: percentile(sorted, 0.99),
        maxFrameMs: sorted.at(-1) ?? 0,
        overBudgetPercent:
          (frameIntervalsMs.filter((interval) => interval > 20).length * 100) / frameCount,
        approxDropped60HzFrames: frameIntervalsMs.reduce(
          (dropped, interval) => dropped + Math.max(0, Math.round(interval / (1_000 / 60)) - 1),
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
        maxHtmlNodes,
        minVisibleRoots,
        maxVisibleRoots,
        minCanvasPixelRatio,
        maxCanvasPixelRatio,
        canvasPixelRatioChanged: minCanvasPixelRatio !== maxCanvasPixelRatio,
        modeChanged,
      };
      cleanup();
      resolve(result);
    };
    const tick = (at: number) => {
      if (settled) return;
      try {
        alive();
        const now = performance.now();
        warmupStartedAt ??= now;
        if (tailFrames) {
          if (++tailFrames === 3) finish();
        } else if (!measuring) {
          if (now - warmupStartedAt < warmupMs) {
            // Warm only a nearby patch; the measured pan continues into new roots.
            setView(
              kind === 'pan'
                ? { x: -100 - 100 * Math.sin((now - warmupStartedAt) / 200), y: -100, scale: 1 }
                : viewAt(now - warmupStartedAt),
            );
          } else {
            startStats = snapshot();
            worldWidth = startStats.worldWidth ?? worldWidth;
            worldHeight = startStats.worldHeight ?? worldHeight;
            sample(startStats);
            measuring = true;
            startedAt = performance.now();
            previousFrameAt = at;
            lastSampleAt = startedAt;
            setView(viewAt(0));
          }
        } else {
          frameIntervalsMs.push(at - previousFrameAt);
          previousFrameAt = at;
          if (drawDurationsMs.length > previousDrawCount) renderedFrameCount++;
          previousDrawCount = drawDurationsMs.length;
          const elapsed = now - startedAt;
          if (elapsed >= durationMs) {
            measuring = false;
            measuredDuration = frameIntervalsMs.reduce((sum, interval) => sum + interval, 0);
            tailFrames = 1;
          } else {
            setView(viewAt(elapsed));
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
      layer.draw = measuredDraw;
      signal?.addEventListener('abort', onAbort, { once: true });
      document.addEventListener('visibilitychange', onVisibility);
      timeout = window.setTimeout(
        () => fail(new Error('Camera benchmark timed out before completion.')),
        Math.min(30_000, Math.max(3_000, warmupMs + durationMs + 10_000)),
      );
      frame = requestAnimationFrame(tick);
    } catch (reason) {
      fail(reason);
    }
  });
}
