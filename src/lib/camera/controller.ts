import type Konva from 'konva';
import type { Bounds } from '../host';
import type { ViewTransform } from '../types';
import type {
  CameraController,
  CameraPoint,
  CameraTarget,
  LayoutDragOptions,
  PanZoomOptions,
} from './types';

export interface CameraState {
  controller: CameraController;
  options: PanZoomOptions;
  drag: LayoutDragOptions | null;
  target: CameraTarget | null;
  stage: Konva.Stage | null;
  view: { current: ViewTransform };
  initial: ViewTransform | null;
  ancestors: Konva.Node[];
  attachedEnabled: boolean | undefined;
  writing: boolean;
  notification: number;
  dispose: (() => void) | null;
  commit(next: Partial<ViewTransform>): void;
  reconcile(): void;
}

const states = new WeakMap<CameraController, CameraState>();
const finite = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);
const positive = (value: unknown): value is number => finite(value) && value > 0;
export function validBounds(bounds: Bounds | null | undefined): bounds is Bounds {
  return (
    !!bounds &&
    [bounds.x, bounds.y, bounds.width, bounds.height].every(finite) &&
    bounds.width >= 0 &&
    bounds.height >= 0
  );
}

export function getCameraState(controller: CameraController): CameraState {
  const state = states.get(controller);
  if (!state) throw new Error('useLayoutDrag requires the controller returned by usePanZoom.');
  return state;
}

export function validateOptions(options: PanZoomOptions): void {
  const min = options.minScale ?? 0.005;
  const max = options.maxScale ?? 8;
  if (!positive(min) || !positive(max) || min > max)
    throw new RangeError('Camera scales must be finite, positive, and minScale <= maxScale.');
  if (options.wheelSpeed !== undefined && (!finite(options.wheelSpeed) || options.wheelSpeed < 0))
    throw new RangeError('wheelSpeed must be finite and nonnegative.');
}

export function clampScale(state: CameraState, scale: number): number {
  return Math.min(state.options.maxScale ?? 8, Math.max(state.options.minScale ?? 0.005, scale));
}

/** Parent transforms are outside the camera's ownership. */
export function toParent(state: CameraState, point: CameraPoint): CameraPoint | null {
  if (!finite(point.x) || !finite(point.y)) return null;
  const parent = state.target?.getParent();
  if (!parent) return point;
  const transform = parent.getAbsoluteTransform().copy();
  const [a, b, c, d] = transform.getMatrix();
  if (!transform.getMatrix().every(finite) || Math.abs(a * d - b * c) < Number.EPSILON) return null;
  const result = transform.invert().point(point);
  return finite(result.x) && finite(result.y) ? result : null;
}

function constrained(state: CameraState, view: ViewTransform): ViewTransform {
  const options = state.drag;
  const bounds = typeof options?.bounds === 'function' ? options.bounds() : options?.bounds;
  const stage = state.stage;
  if (!validBounds(bounds) || !stage || stage.width() <= 0 || stage.height() <= 0) return view;
  const padding = options?.padding ?? 0;
  const left = Math.min(padding, stage.width() / 2);
  const top = Math.min(padding, stage.height() / 2);
  const corners = [
    { x: left, y: top },
    { x: stage.width() - left, y: top },
    { x: stage.width() - left, y: stage.height() - top },
    { x: left, y: stage.height() - top },
  ].map((point) => toParent(state, point));
  if (corners.some((point) => !point)) return view;
  const points = corners as CameraPoint[];
  const xs = points.map((point) => point.x);
  const ys = points.map((point) => point.y);
  const limit = (position: number, min: number, max: number, origin: number, size: number) => {
    const lower = max - (origin + size) * view.scale;
    const upper = min - origin * view.scale;
    if (!finite(lower) || !finite(upper)) return position;
    return lower > upper ? (lower + upper) / 2 : Math.max(lower, Math.min(upper, position));
  };
  return {
    ...view,
    x: limit(view.x, Math.min(...xs), Math.max(...xs), bounds.x, bounds.width),
    y: limit(view.y, Math.min(...ys), Math.max(...ys), bounds.y, bounds.height),
  };
}

function nativeView(state: CameraState): ViewTransform {
  const target = state.target;
  return target ? { x: target.x(), y: target.y(), scale: target.scaleX() } : state.view.current;
}

export function createCamera(options: PanZoomOptions): CameraState {
  const view = { current: { x: 0, y: 0, scale: 1 } };
  const state: CameraState = {
    controller: null as unknown as CameraController,
    options,
    drag: null,
    target: null,
    stage: null,
    view,
    initial: null,
    ancestors: [],
    attachedEnabled: undefined,
    writing: false,
    notification: 0,
    dispose: null,
    commit(next) {
      const target = state.target;
      if (
        target &&
        ([
          target.rotation(),
          target.skewX(),
          target.skewY(),
          target.offsetX(),
          target.offsetY(),
        ].some((value) => value !== 0) ||
          target.transformsEnabled() !== 'all')
      )
        throw new RangeError(
          'The camera target requires translation and uniform scale. Put rotation, skew, and offset on a parent Group.',
        );
      const current = view.current;
      const result = constrained(state, {
        x: finite(next.x) ? next.x : current.x,
        y: finite(next.y) ? next.y : current.y,
        scale: clampScale(state, positive(next.scale) ? next.scale : current.scale),
      });
      const changed =
        result.x !== current.x || result.y !== current.y || result.scale !== current.scale;
      view.current = result;
      if (
        target &&
        (target.x() !== result.x ||
          target.y() !== result.y ||
          target.scaleX() !== result.scale ||
          target.scaleY() !== result.scale)
      ) {
        state.writing = true;
        try {
          target.setAttrs({ x: result.x, y: result.y, scaleX: result.scale, scaleY: result.scale });
        } finally {
          state.writing = false;
        }
        if (target === state.stage) state.stage?.batchDraw();
        else target.getLayer()?.batchDraw();
      }
      if (changed && !state.notification && typeof requestAnimationFrame !== 'undefined') {
        state.notification = requestAnimationFrame(() => {
          state.notification = 0;
          state.options.onChange?.({ ...view.current });
        });
      }
    },
    reconcile() {
      state.commit(nativeView(state));
    },
  };
  const zoomTo = (scale: number, point?: CameraPoint) => {
    if (!positive(scale)) return;
    state.reconcile();
    const current = view.current;
    const anchor = toParent(
      state,
      point ?? {
        x: (state.stage?.width() ?? 0) / 2,
        y: (state.stage?.height() ?? 0) / 2,
      },
    );
    if (!anchor || !finite(anchor.x) || !finite(anchor.y)) return;
    const next = clampScale(state, scale);
    state.commit({
      x: anchor.x - ((anchor.x - current.x) / current.scale) * next,
      y: anchor.y - ((anchor.y - current.y) / current.scale) * next,
      scale: next,
    });
  };
  const controller: CameraController = {
    view,
    getView() {
      state.reconcile();
      return { ...view.current };
    },
    setView(next) {
      state.reconcile();
      state.commit(next);
    },
    zoomTo,
    zoomBy(factor, point) {
      if (positive(factor)) zoomTo(controller.getView().scale * factor, point);
    },
    panBy(delta) {
      if (!finite(delta.x) || !finite(delta.y)) return;
      state.reconcile();
      const origin = toParent(state, { x: 0, y: 0 });
      const point = toParent(state, {
        x: state.drag?.axis === 'y' ? 0 : delta.x,
        y: state.drag?.axis === 'x' ? 0 : delta.y,
      });
      if (!origin || !point) return;
      state.commit({
        x: view.current.x + point.x - origin.x,
        y: view.current.y + point.y - origin.y,
      });
    },
    reset() {
      state.commit(state.initial ?? options.initialView ?? { x: 0, y: 0, scale: 1 });
    },
    fitBounds(bounds, padding = 0) {
      if (
        !validBounds(bounds) ||
        !finite(padding) ||
        padding < 0 ||
        !state.stage ||
        state.stage.width() <= 0 ||
        state.stage.height() <= 0
      )
        return;
      const stage = state.stage;
      const parent = state.target?.getParent();
      const matrix = parent?.getAbsoluteTransform().getMatrix() ?? [1, 0, 0, 1, 0, 0];
      const [a, b, c, d] = matrix;
      const width = Math.abs(a) * bounds.width + Math.abs(c) * bounds.height;
      const height = Math.abs(b) * bounds.width + Math.abs(d) * bounds.height;
      const fitted = Math.min(
        width > 0 ? Math.max(0, stage.width() - 2 * padding) / width : Infinity,
        height > 0 ? Math.max(0, stage.height() - 2 * padding) / height : Infinity,
      );
      const scale = clampScale(state, Number.isFinite(fitted) ? fitted : view.current.scale);
      const center = toParent(state, { x: stage.width() / 2, y: stage.height() / 2 });
      if (!center || !positive(scale)) return;
      state.commit({
        scale,
        x: center.x - (bounds.x + bounds.width / 2) * scale,
        y: center.y - (bounds.y + bounds.height / 2) * scale,
      });
    },
  };
  state.controller = controller;
  states.set(controller, state);
  return state;
}
