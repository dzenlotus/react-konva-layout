import type Konva from 'konva';
import type { DemoCanvasHandle } from '../examples/DemoCanvas';
import type { LayoutMetrics, RenderMetrics, ViewTransform } from '../lib';
import type { CameraKind, CameraResult } from '../benchmarks/camera';

export type Mode = 'optimized' | 'baseline';

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
  assetReadyMs: number;
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

export interface StressApi {
  run: (mode?: Mode, initialView?: Partial<ViewTransform>) => Promise<StressResult>;
  resize: () => Promise<StressResult>;
  remeasure: () => Promise<StressResult>;
  stats: () => StressStats;
  overview: (enabled?: boolean) => void;
  edit: (text?: string) => Promise<StressResult>;
  view: (view: Partial<ViewTransform>) => Promise<StressResult>;
  camera: (kind: CameraKind, durationMs?: number, warmupMs?: number) => Promise<CameraResult>;
  inspect: () => { stage: Konva.Stage | null; layout: DemoCanvasHandle | null };
}

declare global {
  interface Window {
    layoutStress?: StressApi;
  }
}

export interface PendingMeasurement {
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
