import type Konva from 'konva';
import { eventToStage } from '../host';
import { clampScale, toParent, type CameraState } from './controller';
import type { CameraPoint } from './types';

interface Pointer extends CameraPoint {
  start: CameraPoint;
  canPan: boolean;
  pointerType: string;
  draggable: Konva.Node | null;
}

const isEditor = (target: EventTarget | null) =>
  target instanceof Element &&
  !!target.closest(
    'input,textarea,select,button,a,[contenteditable]:not([contenteditable="false"])',
  );

/** A single gesture owner for wheel, one-pointer pan, and two-pointer pinch. */
export function attachGestures(state: CameraState): () => void {
  const stage = state.stage!;
  const container = stage.container();
  const win = container.ownerDocument.defaultView ?? window;
  const pointers = new Map<number, Pointer>();
  const oldTouchAction = container.style.touchAction;
  const oldCursor = container.style.cursor;
  let space = false;
  let owned = false;
  let cancelling = false;
  let suppressUntil = 0;
  let releaseGuard: { add(id: number): void } | null = null;
  let lastPinch: { center: CameraPoint; distance: number } | null = null;
  if (state.options.enabled !== false) container.style.touchAction = 'none';
  const active = () => state.options.enabled !== false;
  const pinch = () => {
    const [a, b] = pointers.values();
    return a && b
      ? {
          center: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 },
          distance: Math.hypot(a.x - b.x, a.y - b.y),
        }
      : null;
  };
  const stopDrags = () => {
    for (const pointer of pointers.values()) pointer.draggable?.stopDrag();
    state.target?.stopDrag();
  };
  const cancelPress = () => {
    if (stage.width() <= 0 || stage.height() <= 0) return;
    cancelling = true;
    try {
      const rect = stage.content.getBoundingClientRect();
      for (const [pointerId, pointer] of pointers) {
        stage.content.dispatchEvent(
          new PointerEvent('pointercancel', {
            pointerId,
            pointerType: pointer.pointerType,
            clientX: rect.left + (pointer.x * rect.width) / stage.width(),
            clientY: rect.top + (pointer.y * rect.height) / stage.height(),
          }),
        );
      }
    } finally {
      cancelling = false;
    }
  };
  const claim = () => {
    if (owned) return;
    owned = true;
    // A pressed camera can be disabled, retargeted, or unmounted before release.
    // Keep just this release guard until the outstanding press ends, even after disposal.
    const ids = new Set(pointers.keys());
    let timeout = 0;
    const cleanupGuard = () => {
      win.clearTimeout(timeout);
      win.removeEventListener('pointerup', guardPointer, true);
      win.removeEventListener('pointercancel', guardPointer, true);
      win.removeEventListener('pointerdown', nextPress, true);
      win.removeEventListener('pagehide', cleanupGuard);
      for (const type of ['mouseup', 'touchend', 'click', 'dblclick'])
        win.removeEventListener(type, guardCompatibility, true);
      releaseGuard = null;
    };
    const guardPointer = (event: PointerEvent) => {
      if (cancelling || !ids.has(event.pointerId)) return;
      event.preventDefault();
      event.stopPropagation();
      ids.delete(event.pointerId);
      if (!ids.size) timeout = win.setTimeout(cleanupGuard, 200);
    };
    const guardCompatibility = (event: Event) => {
      if (!container.contains(event.target as Node)) return;
      event.preventDefault();
      event.stopPropagation();
    };
    const nextPress = () => {
      if (!owned || !ids.size) cleanupGuard();
    };
    releaseGuard = {
      add(id) {
        win.clearTimeout(timeout);
        ids.add(id);
      },
    };
    win.addEventListener('pointerup', guardPointer, true);
    win.addEventListener('pointercancel', guardPointer, true);
    win.addEventListener('pointerdown', nextPress, true);
    win.addEventListener('pagehide', cleanupGuard);
    for (const type of ['mouseup', 'touchend', 'click', 'dblclick'])
      win.addEventListener(type, guardCompatibility, { capture: true, passive: false });
    stopDrags();
    cancelPress();
    container.style.cursor = 'grabbing';
    for (const id of pointers.keys()) {
      try {
        container.setPointerCapture?.(id);
      } catch {
        /* Synthetic events have no active capture. */
      }
    }
  };
  const release = (id: number) => {
    if (container.hasPointerCapture?.(id)) container.releasePointerCapture(id);
  };
  const clear = () => {
    if (owned) {
      suppressUntil = performance.now() + 200;
      cancelPress();
    }
    const ids = [...pointers.keys()];
    pointers.clear();
    for (const id of ids) release(id);
    owned = false;
    lastPinch = null;
    space = false;
    container.style.cursor = oldCursor;
  };
  const wheel = (event: WheelEvent) => {
    if (!active() || isEditor(event.target) || event.defaultPrevented || owned) return;
    const point = eventToStage(event, stage);
    if (!point) return;
    const delta =
      event.deltaY * (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? stage.height() : 1);
    const factor = Math.exp(
      Math.max(-50, Math.min(50, -delta * (state.options.wheelSpeed ?? 0.0015))),
    );
    if (!Number.isFinite(factor)) return;
    event.preventDefault();
    for (const pointer of pointers.values())
      if (pointer.draggable?.isDragging()) pointer.draggable.stopDrag();
    if (state.target?.isDragging()) state.target.stopDrag();
    state.controller.zoomBy(factor, point);
  };
  const down = (event: PointerEvent) => {
    if (
      !active() ||
      isEditor(event.target) ||
      event.defaultPrevented ||
      (event.button !== 0 && event.button !== 1)
    )
      return;
    const point = eventToStage(event, stage);
    if (!point) return;
    if (!pointers.size) suppressUntil = 0;
    const hit = stage.getIntersection(point);
    let draggable: Konva.Node | null = hit;
    while (draggable && !draggable.draggable()) draggable = draggable.getParent();
    const drag = state.drag;
    pointers.set(event.pointerId, {
      ...point,
      start: point,
      canPan:
        !!drag &&
        drag.enabled !== false &&
        (event.button === 1 || space || drag.panOn === 'anywhere' || !hit),
      draggable,
      pointerType: event.pointerType,
    });
    if (owned) releaseGuard?.add(event.pointerId);
    if (event.button === 1 || space) event.preventDefault();
    if (pointers.size === 2) {
      claim();
      lastPinch = pinch();
      event.preventDefault();
      event.stopPropagation();
    }
  };
  const move = (event: PointerEvent) => {
    const previous = pointers.get(event.pointerId);
    if (!previous) return;
    if (!active()) {
      clear();
      return;
    }
    const point = eventToStage(event, stage);
    if (!point) return;
    pointers.set(event.pointerId, { ...previous, ...point });
    if (pointers.size >= 2) {
      const next = pinch();
      if (lastPinch && next && lastPinch.distance > 0 && next.distance > 0) {
        claim();
        const current = state.controller.getView();
        const oldAnchor = toParent(state, lastPinch.center);
        const newAnchor = toParent(state, next.center);
        if (oldAnchor && newAnchor) {
          const scale = clampScale(state, (current.scale * next.distance) / lastPinch.distance);
          state.commit({
            scale,
            x: newAnchor.x - ((oldAnchor.x - current.x) * scale) / current.scale,
            y: newAnchor.y - ((oldAnchor.y - current.y) * scale) / current.scale,
          });
        }
      }
      lastPinch = next;
    } else if (
      (previous.canPan || owned) &&
      state.drag &&
      state.drag?.enabled !== false &&
      (owned || Math.hypot(point.x - previous.start.x, point.y - previous.start.y) > 3)
    ) {
      const origin = owned ? previous : previous.start;
      claim();
      state.controller.panBy({ x: point.x - origin.x, y: point.y - origin.y });
    }
    if (owned) {
      stopDrags();
      suppressUntil = performance.now() + 200;
      event.preventDefault();
      event.stopPropagation();
    }
  };
  const up = (event: PointerEvent) => {
    if (cancelling || !pointers.has(event.pointerId)) return;
    if (owned) {
      suppressUntil = performance.now() + 200;
      event.preventDefault();
      event.stopPropagation();
    }
    if (event.type === 'pointercancel') {
      clear();
      return;
    }
    pointers.delete(event.pointerId);
    release(event.pointerId);
    lastPinch = pinch();
    if (pointers.size === 1) {
      // Continue from the remaining finger without a jump to its original press.
      for (const [id, pointer] of pointers)
        pointers.set(id, { ...pointer, start: { x: pointer.x, y: pointer.y } });
    }
    if (!pointers.size) {
      owned = false;
      container.style.cursor = space ? 'grab' : oldCursor;
    }
  };
  const compatibility = (event: Event) => {
    if (!container.contains(event.target as Node)) return;
    // Konva 8's pointercancel leaves compatibility mouse/touch click state alive.
    // Prevent their release handlers from synthesizing a canvas click/tap after a camera gesture.
    if (owned || performance.now() < suppressUntil) {
      event.preventDefault();
      event.stopPropagation();
    }
  };
  const lostCapture = (event: PointerEvent) => {
    if (
      event.target === container &&
      !container.hasPointerCapture?.(event.pointerId) &&
      pointers.has(event.pointerId)
    )
      clear();
  };
  const keydown = (event: KeyboardEvent) => {
    if (
      event.code !== 'Space' ||
      isEditor(event.target) ||
      !active() ||
      !state.drag ||
      state.drag.enabled === false
    )
      return;
    event.preventDefault();
    space = true;
    if (!owned) container.style.cursor = 'grab';
  };
  const keyup = (event: KeyboardEvent) => {
    if (event.code !== 'Space') return;
    space = false;
    if (!owned) container.style.cursor = oldCursor;
  };
  container.addEventListener('wheel', wheel, { passive: false });
  container.addEventListener('pointerdown', down, true);
  container.addEventListener('lostpointercapture', lostCapture);
  win.addEventListener('pointermove', move, { passive: false, capture: true });
  win.addEventListener('pointerup', up, true);
  win.addEventListener('pointercancel', up, true);
  win.addEventListener('keydown', keydown);
  win.addEventListener('keyup', keyup);
  win.addEventListener('blur', clear);
  for (const type of [
    'mouseup',
    'touchend',
    'mousemove',
    'touchmove',
    'click',
    'dblclick',
    'contextmenu',
  ])
    container.addEventListener(type, compatibility, { capture: true, passive: false });
  return () => {
    clear();
    container.style.touchAction = oldTouchAction;
    container.style.cursor = oldCursor;
    container.removeEventListener('wheel', wheel);
    container.removeEventListener('pointerdown', down, true);
    container.removeEventListener('lostpointercapture', lostCapture);
    win.removeEventListener('pointermove', move, true);
    win.removeEventListener('pointerup', up, true);
    win.removeEventListener('pointercancel', up, true);
    win.removeEventListener('keydown', keydown);
    win.removeEventListener('keyup', keyup);
    win.removeEventListener('blur', clear);
    for (const type of [
      'mouseup',
      'touchend',
      'mousemove',
      'touchmove',
      'click',
      'dblclick',
      'contextmenu',
    ])
      container.removeEventListener(type, compatibility, true);
  };
}
