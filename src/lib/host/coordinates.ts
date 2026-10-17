import type Konva from 'konva';

export interface Bounds {
  x: number;
  y: number;
  width: number;
  height: number;
}
export interface HostState {
  stage: Konva.Stage;
  viewport: Bounds;
  /** Largest screen stretch of the complete layout-to-stage matrix. */
  scale: number;
  /** Density of the consumer's existing scene canvas. */
  pixelRatio: number;
  matrix: number[];
  visible: boolean;
  listening: boolean;
}

export function readHost(root: Konva.Group, overscan = 0): HostState | null {
  const stage = root.getStage();
  if (!stage) return null;
  const transform = root.getAbsoluteTransform().copy();
  const matrix = transform.getMatrix().slice();
  const [a, b, c, d] = matrix;
  if (!matrix.every(Number.isFinite) || Math.abs(a * d - b * c) < Number.EPSILON) return null;
  transform.invert();
  const points = [
    { x: -overscan, y: -overscan },
    { x: stage.width() + overscan, y: -overscan },
    { x: stage.width() + overscan, y: stage.height() + overscan },
    { x: -overscan, y: stage.height() + overscan },
  ].map((point) => transform.point(point));
  const xs = points.map((point) => point.x);
  const ys = points.map((point) => point.y);
  const x = Math.min(...xs);
  const y = Math.min(...ys);
  const trace = a * a + b * b + c * c + d * d;
  const determinant = a * d - b * c;
  // Largest singular value: safe screen stretch for rotated, skewed and nonuniform hosts.
  const discriminant = Math.max(0, trace * trace - 4 * determinant * determinant);
  const scale = Math.sqrt((trace + Math.sqrt(discriminant)) / 2);
  return {
    stage,
    matrix,
    pixelRatio: root.getLayer()?.getCanvas().getPixelRatio() ?? 1,
    visible: root.isVisible(),
    listening: root.isListening(),
    viewport: {
      x,
      y,
      width: Math.max(...xs) - x,
      height: Math.max(...ys) - y,
    },
    scale,
  };
}

/** Read native coordinates without changing Konva's shared pointer state. */
export function eventToStage(event: Event, stage: Konva.Stage): { x: number; y: number } | null {
  const source = event as MouseEvent & Partial<TouchEvent>;
  const point = source.touches?.[0] ?? source.changedTouches?.[0] ?? source;
  if (!Number.isFinite(point.clientX) || !Number.isFinite(point.clientY)) return null;
  const bounds = stage.content.getBoundingClientRect();
  if (!bounds.width || !bounds.height) return null;
  return {
    x: ((point.clientX - bounds.left) * stage.width()) / bounds.width,
    y: ((point.clientY - bounds.top) * stage.height()) / bounds.height,
  };
}

export function stageToLayout(root: Konva.Group, point: { x: number; y: number }) {
  const transform = root.getAbsoluteTransform().copy();
  const [a, b, c, d] = transform.getMatrix();
  if (Math.abs(a * d - b * c) < Number.EPSILON) return null;
  return transform.invert().point(point);
}
