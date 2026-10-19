import { useLayoutEffect, useRef } from 'react';
import type Konva from 'konva';
import { createCamera, getCameraState, validateOptions, type CameraState } from './controller';
import { attachGestures } from './gestures';
import type { CameraController, LayoutDragOptions, PanZoomOptions } from './types';

let cameraId = 0;
const attributes = [
  'x',
  'y',
  'scaleX',
  'scaleY',
  'rotation',
  'skewX',
  'skewY',
  'offsetX',
  'offsetY',
  'width',
  'height',
];

function attach(state: CameraState): void {
  const target = state.options.target.current;
  const stage = target?.getStage() ?? null;
  const ancestors: Konva.Node[] = target ? [target, ...target.getAncestors()] : [];
  if (
    target === state.target &&
    stage === state.stage &&
    state.attachedEnabled === (state.options.enabled !== false) &&
    ancestors.length === state.ancestors.length &&
    ancestors.every((ancestor, index) => ancestor === state.ancestors[index])
  )
    return;
  state.dispose?.();
  state.target = target;
  state.stage = stage;
  state.ancestors = ancestors;
  state.attachedEnabled = state.options.enabled !== false;
  if (!target || !stage) return;
  if (!state.initial) {
    state.commit({
      x: target.x(),
      y: target.y(),
      scale: target.scaleX(),
      ...state.options.initialView,
    });
    state.initial = { ...state.view.current };
  } else state.commit(state.view.current);
  const namespace = `layoutCamera${++cameraId}`;
  const events = attributes.map((attribute) => `${attribute}Change.${namespace}`).join(' ');
  let frame = 0;
  const schedule = () => {
    if (state.writing || frame) return;
    frame = requestAnimationFrame(() => {
      frame = 0;
      state.reconcile();
    });
  };
  for (const ancestor of ancestors) ancestor.on(events, schedule);
  // Bounds getters can change after measurement without a React camera update.
  const beforeDraw = () => {
    if (!state.writing) state.reconcile();
  };
  const layers =
    target === stage
      ? stage.getLayers()
      : [target.getLayer()].filter((layer): layer is Konva.Layer => !!layer);
  for (const layer of layers) layer.on(`beforeDraw.${namespace}`, beforeDraw);
  const resize = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(schedule) : null;
  resize?.observe(stage.container());
  resize?.observe(stage.content);
  const gestures = attachGestures(state);
  state.dispose = () => {
    gestures();
    cancelAnimationFrame(frame);
    for (const ancestor of ancestors) ancestor.off(events, schedule);
    for (const layer of layers) layer.off(`beforeDraw.${namespace}`, beforeDraw);
    resize?.disconnect();
    state.dispose = null;
    state.target = null;
    state.stage = null;
  };
}

/** Controls an existing Stage, Layer, or Group. Keeps React out of the animation loop. */
export function usePanZoom(options: PanZoomOptions): CameraController {
  validateOptions(options);
  const ref = useRef<CameraState | null>(null);
  if (!ref.current) ref.current = createCamera(options);
  const state = ref.current;
  state.options = options;
  useLayoutEffect(() => {
    attach(state);
    state.reconcile();
  });
  useLayoutEffect(
    () => () => {
      state.dispose?.();
      cancelAnimationFrame(state.notification);
      state.notification = 0;
    },
    [state],
  );
  return state.controller;
}

/** Adds constrained camera panning to usePanZoom; every camera update shares these bounds. */
export function useLayoutDrag(options: LayoutDragOptions): void {
  if (options.padding !== undefined && (!Number.isFinite(options.padding) || options.padding < 0))
    throw new RangeError('Camera padding must be finite and nonnegative.');
  const state = getCameraState(options.camera);
  useLayoutEffect(() => {
    state.drag = options;
    state.reconcile();
  });
  useLayoutEffect(
    () => () => {
      state.drag = null;
    },
    [state],
  );
}

export type {
  CameraController,
  CameraPoint,
  CameraTarget,
  CameraBounds,
  PanZoomOptions,
  LayoutDragOptions,
} from './types';
