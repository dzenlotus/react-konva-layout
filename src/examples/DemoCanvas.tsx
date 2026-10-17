import {
  forwardRef,
  useCallback,
  useImperativeHandle,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from 'react';
import Konva from 'konva';
import { Layer, Stage } from 'react-konva';
import { Layout } from '../lib';
import type { LayoutComponentProps, LayoutHandle, LayoutNode, ViewTransform } from '../lib';
import { useDemoGestures } from './useDemoGestures';

export interface DemoCanvasHandle extends LayoutHandle {
  getView(): ViewTransform;
  setView(next: Partial<ViewTransform>): void;
}

interface DemoCanvasProps extends Omit<LayoutComponentProps, 'x' | 'y' | 'id'> {
  width: number;
  height: number;
  panZoom?: boolean;
  pixelRatio?: number;
  onViewChange?: (view: ViewTransform) => void;
  style?: CSSProperties;
  className?: string;
  children: ReactNode;
}

/** Application-owned Stage, Layer and camera. This file is excluded from the package. */
export const DemoCanvas = forwardRef<DemoCanvasHandle, DemoCanvasProps>(function DemoCanvas(
  { width, height, panZoom = false, pixelRatio, onViewChange, style, className, ...layoutProps },
  forwardedRef,
) {
  const stage = useRef<Konva.Stage | null>(null);
  const layer = useRef<Konva.Layer | null>(null);
  const layout = useRef<LayoutHandle | null>(null);
  const nativeRatio = useRef<number | null>(null);
  const view = useRef<ViewTransform>({ x: 0, y: 0, scale: 1 });
  const [camera, setCamera] = useState(view.current);
  const onChange = useRef(onViewChange);
  onChange.current = onViewChange;

  const setView = useCallback((next: Partial<ViewTransform>) => {
    const current = view.current;
    const scale = Number.isFinite(next.scale)
      ? Math.min(8, Math.max(0.05, next.scale!))
      : current.scale;
    const updated = {
      x: Number.isFinite(next.x) ? next.x! : current.x,
      y: Number.isFinite(next.y) ? next.y! : current.y,
      scale,
    };
    view.current = updated;
    stage.current?.position(updated);
    stage.current?.scale({ x: scale, y: scale });
    stage.current?.batchDraw();
    setCamera(updated);
    onChange.current?.(updated);
  }, []);

  useDemoGestures(stage, panZoom, view, setView);

  useLayoutEffect(() => {
    // Canvas quality is an application decision, separate from Layout raster caches.
    const drawing = layer.current;
    if (!drawing) return;
    nativeRatio.current ??= drawing.getCanvas().getPixelRatio();
    const ratio = pixelRatio ?? nativeRatio.current;
    if (drawing.getCanvas().getPixelRatio() !== ratio) {
      drawing.getCanvas().setPixelRatio(ratio);
      drawing.batchDraw();
    }
  }, [width, height, pixelRatio]);

  useImperativeHandle(
    forwardedRef,
    () => ({
      getGroup: () => layout.current?.getGroup() ?? null,
      getStage: () => stage.current,
      getView: () => ({ ...view.current }),
      setView,
      getLayout: (id) => layout.current?.getLayout(id),
      getMetrics: () => layout.current?.getMetrics() ?? null,
      invalidate: (id) => layout.current?.invalidate(id),
      remeasure: (id) => layout.current?.remeasure(id),
    }),
    [setView],
  );

  const focusNode = useCallback(
    (node: LayoutNode) => {
      const scale = 0.8;
      setView({
        scale,
        x: width / 2 - (node.absoluteX + node.width / 2) * scale,
        y: height / 2 - (node.absoluteY + node.height / 2) * scale,
      });
      layoutProps.onFocusRequest?.(node);
    },
    [width, height, setView, layoutProps.onFocusRequest],
  );

  return (
    <div className={className} style={{ ...style, position: 'relative', width, height }}>
      <Stage
        ref={stage}
        width={width}
        height={height}
        x={camera.x}
        y={camera.y}
        scaleX={camera.scale}
        scaleY={camera.scale}
      >
        <Layer ref={layer}>
          <Layout
            {...layoutProps}
            ref={layout}
            width={width}
            height={height}
            onFocusRequest={focusNode}
          />
        </Layer>
      </Stage>
    </div>
  );
});
