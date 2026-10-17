import {
  forwardRef,
  memo,
  useCallback,
  useImperativeHandle,
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from 'react';
import Konva from 'konva';
import { Group, useContextBridge } from 'react-konva';
import { LayoutContext } from './context';
import { MeasurementEngine } from './measurement/MeasurementEngine';
import { MeasurementRoot } from './measurementRoot';
import { observeHost } from './host/observeHost';
import Renderer from './rendering/Renderer';
import type { LayoutComponentProps, LayoutHandle } from './types';

/** Camera and placement updates cannot reconcile the detached measurement tree. */
const MeasurementContent = memo(function MeasurementContent({
  engine,
  children,
}: {
  engine: MeasurementEngine;
  children: ReactNode;
}) {
  const measurement = useRef<MeasurementRoot | null>(null);
  const lifetime = useRef(0);
  const Bridge = useContextBridge();
  useLayoutEffect(() => {
    lifetime.current += 1;
    measurement.current ??= new MeasurementRoot(engine);
    return () => {
      engine.stop();
      const ended = ++lifetime.current;
      // Preserve the second renderer's component state during StrictMode replay.
      queueMicrotask(() => {
        if (lifetime.current !== ended) return;
        measurement.current?.dispose();
        measurement.current = null;
        engine.dispose();
      });
    };
  }, [engine]);
  useLayoutEffect(() => {
    // Context updates still render this component and forward their current values.
    measurement.current?.render(Bridge, children);
  });
  return null;
});

/** Measures one logical layout and draws it in the caller's existing Konva tree. */
export const Layout = forwardRef<LayoutHandle, LayoutComponentProps>(function Layout(
  {
    width,
    height,
    x,
    y,
    id,
    debug = false,
    performance,
    placements,
    children,
    onLayout,
    onMeasure,
    onRenderStats,
  },
  forwardedRef,
) {
  const [engine] = useState(() => new MeasurementEngine());
  const [hostSize, setHostSize] = useState({ width: 0, height: 0 });
  const logicalWidth = width ?? hostSize.width;
  const logicalHeight = height ?? hostSize.height;
  const [root, setRoot] = useState<Konva.Group | null>(null);
  const group = useRef<Konva.Group | null>(null);
  const snapshot = useSyncExternalStore(engine.subscribe, engine.getSnapshot, engine.getSnapshot);

  const attachGroup = useCallback((node: Konva.Group | null) => {
    group.current = node;
    setRoot(node);
  }, []);

  useImperativeHandle(
    forwardedRef,
    () => ({
      getGroup: () => group.current,
      getStage: () => group.current?.getStage() ?? null,
      invalidate: engine.invalidate,
      remeasure: engine.remeasure,
      getLayout: engine.getLayout,
      getMetrics: engine.getMetrics,
    }),
    [engine],
  );

  useLayoutEffect(() => {
    engine.configure({
      width: logicalWidth,
      height: logicalHeight,
      debug,
      performance,
      onLayout,
      onMeasure,
    });
  });

  useLayoutEffect(() => {
    const stage = root?.getStage();
    if (!root || !stage) return;
    engine.start(stage.content, () => root.getAbsoluteTransform().getMatrix());
    const sync = () => {
      const next = { width: stage.width(), height: stage.height() };
      setHostSize((previous) =>
        previous.width === next.width && previous.height === next.height ? previous : next,
      );
      engine.syncDebugTransform();
    };
    sync();
    const release = observeHost(root, sync);
    return () => {
      release();
      engine.stop();
    };
  }, [engine, root]);

  return (
    <LayoutContext.Provider value={engine.context}>
      <MeasurementContent engine={engine}>{children}</MeasurementContent>
      <Group ref={attachGroup} x={x} y={y} id={id} width={logicalWidth} height={logicalHeight}>
        <Renderer
          scene={snapshot.scene}
          root={root}
          performance={performance}
          placements={placements}
          onRenderStats={onRenderStats}
        />
      </Group>
    </LayoutContext.Provider>
  );
});
