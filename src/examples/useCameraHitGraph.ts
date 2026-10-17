import { useCallback, useLayoutEffect, useRef, type RefObject } from 'react';
import type Konva from 'konva';

const IDLE_MS = 120;
const CAMERA_EVENTS =
  'xChange.cameraHitGraph yChange.cameraHitGraph scaleXChange.cameraHitGraph scaleYChange.cameraHitGraph widthChange.cameraHitGraph heightChange.cameraHitGraph';

/** The application pauses hit-map painting during camera motion, then restores picking. */
export function useCameraHitGraph(
  stage: RefObject<Konva.Stage | null>,
  layer: RefObject<Konva.Layer | null>,
): () => void {
  const paused = useRef<{ layer: Konva.Layer; listening: boolean } | null>(null);
  const idleTimer = useRef<number | undefined>(undefined);

  const restore = useCallback((immediateHit = false) => {
    window.clearTimeout(idleTimer.current);
    idleTimer.current = undefined;
    const previous = paused.current;
    paused.current = null;
    if (!previous) return;
    previous.layer.listening(previous.listening);
    if (!previous.layer.getStage()) return;
    if (immediateHit) previous.layer.drawHit();
    else previous.layer.batchDraw();
  }, []);

  const cameraChanged = useCallback(() => {
    const current = layer.current;
    if (!current) return;
    if (!paused.current) {
      const listening = current.listening();
      if (!listening) return;
      paused.current = { layer: current, listening };
      current.listening(false);
    }
    window.clearTimeout(idleTimer.current);
    idleTimer.current = window.setTimeout(() => restore(), IDLE_MS);
  }, [layer, restore]);

  useLayoutEffect(() => {
    const current = stage.current;
    if (!current) return;
    const container = current.container();
    const beforePick = () => restore(true);
    current.on(CAMERA_EVENTS, cameraChanged);
    // Capture precedes Konva and the application's bubbling pointer handlers.
    for (const event of ['pointerdown', 'mousedown', 'touchstart'])
      container.addEventListener(event, beforePick, { capture: true, passive: true });
    return () => {
      current.off('.cameraHitGraph');
      for (const event of ['pointerdown', 'mousedown', 'touchstart'])
        container.removeEventListener(event, beforePick, true);
      restore();
    };
  }, [stage, cameraChanged, restore]);

  return cameraChanged;
}
