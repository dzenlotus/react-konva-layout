import { useEffect, type RefObject } from 'react';
import type Konva from 'konva';
import type { ViewTransform } from '../lib';
import { clampZoom, zoomAtPoint } from './camera';

/** Example application camera controls; the library installs no camera handlers. */
export function useDemoGestures(
  stage: RefObject<Konva.Stage | null>,
  enabled: boolean,
  view: RefObject<ViewTransform>,
  setView: (next: Partial<ViewTransform>) => void,
): void {
  useEffect(() => {
    const currentStage = stage.current;
    if (!enabled || !currentStage) return;
    const container = currentStage.container();
    const oldTouchAction = container.style.touchAction;
    container.style.touchAction = 'none';
    const pointers = new Map<
      number,
      {
        x: number;
        y: number;
        startX: number;
        startY: number;
        canPan: boolean;
        pointerType: string;
        dragTarget?: Konva.Node;
      }
    >();
    let space = false,
      dragging = false,
      lastClickBlock = 0;
    let lastPinch: { x: number; y: number; distance: number } | null = null;
    const point = (event: { clientX: number; clientY: number }) => {
      const rect = container.getBoundingClientRect();
      return {
        x: ((event.clientX - rect.left) * currentStage.width()) / rect.width,
        y: ((event.clientY - rect.top) * currentStage.height()) / rect.height,
      };
    };
    const pinch = () => {
      const [a, b] = [...pointers.values()];
      return a && b
        ? { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, distance: Math.hypot(a.x - b.x, a.y - b.y) }
        : null;
    };
    const stopNodeDrags = () => {
      for (const pointer of pointers.values()) pointer.dragTarget?.stopDrag();
    };
    const wheel = (event: WheelEvent) => {
      event.preventDefault();
      const position = point(event),
        current = view.current;
      const delta =
        event.deltaY *
        (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? currentStage.height() : 1);
      const scale = clampZoom(current.scale * Math.exp(-delta * 0.0015));
      setView(zoomAtPoint(current, position, scale));
    };
    const down = (event: PointerEvent) => {
      if (event.button !== 0 && event.button !== 1) return;
      const position = point(event);
      const hit = currentStage.getIntersection(position);
      const background = !hit;
      let dragTarget: Konva.Node | undefined = hit ?? undefined;
      while (dragTarget && !dragTarget.draggable())
        dragTarget = dragTarget.getParent() ?? undefined;
      const canPan =
        event.button === 1 || space || background || (event.pointerType === 'touch' && !dragTarget);
      pointers.set(event.pointerId, {
        ...position,
        startX: position.x,
        startY: position.y,
        canPan,
        pointerType: event.pointerType,
        dragTarget,
      });
      if (event.button === 1) event.preventDefault();
      if (pointers.size > 1) {
        // Two fingers switch to the application camera, ending any native node drag.
        stopNodeDrags();
        lastPinch = pinch();
      }
    };
    const move = (event: PointerEvent) => {
      const previous = pointers.get(event.pointerId);
      if (!previous) return;
      const position = point(event);
      pointers.set(event.pointerId, { ...previous, ...position });
      const current = view.current;
      const wasDragging = dragging;
      if (pointers.size > 1) {
        stopNodeDrags();
        const next = pinch();
        if (lastPinch && next && lastPinch.distance > 0) {
          const scale = clampZoom((current.scale * next.distance) / lastPinch.distance);
          setView({
            scale,
            x: next.x - ((lastPinch.x - current.x) / current.scale) * scale,
            y: next.y - ((lastPinch.y - current.y) / current.scale) * scale,
          });
          dragging = true;
        }
        lastPinch = next;
      } else if (
        previous.canPan &&
        (dragging || Math.hypot(position.x - previous.startX, position.y - previous.startY) > 3)
      ) {
        setView({ x: current.x + position.x - previous.x, y: current.y + position.y - previous.y });
        dragging = true;
      }
      if (dragging) {
        if (!wasDragging) {
          // Cancel the original press when it becomes a camera gesture, so custom shapes cannot receive a stray tap.
          const rect = container.getBoundingClientRect();
          pointers.forEach((pointer, pointerId) =>
            currentStage.content.dispatchEvent(
              new PointerEvent('pointercancel', {
                pointerId,
                pointerType: pointer.pointerType,
                clientX: rect.left + (pointer.x * rect.width) / currentStage.width(),
                clientY: rect.top + (pointer.y * rect.height) / currentStage.height(),
              }),
            ),
          );
        }
        event.preventDefault();
        container.setPointerCapture?.(event.pointerId);
        lastClickBlock = performance.now();
      }
    };
    const up = (event: PointerEvent) => {
      pointers.delete(event.pointerId);
      if (container.hasPointerCapture?.(event.pointerId))
        container.releasePointerCapture(event.pointerId);
      lastPinch = pinch();
      if (!pointers.size) dragging = false;
    };
    const keydown = (event: KeyboardEvent) => {
      if (
        event.code !== 'Space' ||
        (event.target instanceof Element &&
          event.target.closest('input,textarea,button,select,a,[contenteditable]'))
      )
        return;
      event.preventDefault();
      space = true;
      container.style.cursor = 'grab';
    };
    const keyup = (event: KeyboardEvent) => {
      if (event.code === 'Space') {
        space = false;
        container.style.cursor = '';
      }
    };
    const suppressDragClick = (event: Event) => {
      if (performance.now() - lastClickBlock < 150) {
        event.preventDefault();
        event.stopPropagation();
      }
    };
    const context = (event: Event) => {
      if (dragging) event.preventDefault();
    };
    container.addEventListener('wheel', wheel, { passive: false });
    container.addEventListener('pointerdown', down);
    window.addEventListener('pointermove', move, { passive: false });
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
    window.addEventListener('keydown', keydown);
    window.addEventListener('keyup', keyup);
    container.addEventListener('click', suppressDragClick, true);
    container.addEventListener('dblclick', suppressDragClick, true);
    container.addEventListener('contextmenu', context);
    return () => {
      container.style.touchAction = oldTouchAction;
      container.style.cursor = '';
      container.removeEventListener('wheel', wheel);
      container.removeEventListener('pointerdown', down);
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
      window.removeEventListener('keydown', keydown);
      window.removeEventListener('keyup', keyup);
      container.removeEventListener('click', suppressDragClick, true);
      container.removeEventListener('dblclick', suppressDragClick, true);
      container.removeEventListener('contextmenu', context);
    };
  }, [enabled, setView, stage, view]);
}
