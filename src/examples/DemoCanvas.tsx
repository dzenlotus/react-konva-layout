import {
  forwardRef,
  useImperativeHandle,
  useLayoutEffect,
  useRef,
  type CSSProperties,
  type ReactNode,
} from 'react';
import Konva from 'konva';
import { Layer, Stage } from 'react-konva';
import { Layout, usePanZoom, useLayoutDrag } from '../lib';
import type { LayoutComponentProps, LayoutHandle, ViewTransform } from '../lib';

export interface DemoCanvasHandle extends LayoutHandle {
  getView(): ViewTransform;
  setView(next: Partial<ViewTransform>): void;
}

interface DemoCanvasProps extends Omit<LayoutComponentProps, 'x' | 'y' | 'id'> {
  width: number;
  height: number;
  panZoom?: boolean;
  pixelRatio?: number;
  initialView?: ViewTransform;
  onViewChange?: (view: ViewTransform) => void;
  style?: CSSProperties;
  className?: string;
  children: ReactNode;
}

/** Application-owned Stage, Layer and camera. This file is excluded from the package. */
export const DemoCanvas = forwardRef<DemoCanvasHandle, DemoCanvasProps>(function DemoCanvas(
  {
    width,
    height,
    panZoom = false,
    pixelRatio,
    initialView = { x: 0, y: 0, scale: 1 },
    onViewChange,
    style,
    className,
    ...layoutProps
  },
  forwardedRef,
) {
  const stage = useRef<Konva.Stage | null>(null);
  const layer = useRef<Konva.Layer | null>(null);
  const layout = useRef<LayoutHandle | null>(null);
  const nativeRatio = useRef<number | null>(null);
  const camera = usePanZoom({
    target: stage,
    initialView,
    enabled: panZoom,
    onChange: onViewChange,
  });
  useLayoutDrag({ camera, enabled: panZoom });

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
      getView: camera.getView,
      setView: camera.setView,
      getLayout: (id) => layout.current?.getLayout(id),
      getMetrics: () => layout.current?.getMetrics() ?? null,
      invalidate: (id) => layout.current?.invalidate(id),
      remeasure: (id) => layout.current?.remeasure(id),
    }),
    [camera],
  );

  return (
    <div className={className} style={{ ...style, position: 'relative', width, height }}>
      <Stage ref={stage} width={width} height={height}>
        <Layer ref={layer}>
          <Layout {...layoutProps} ref={layout} width={width} height={height} />
        </Layer>
      </Stage>
    </div>
  );
});
