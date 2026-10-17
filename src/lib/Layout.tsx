import {
  forwardRef,
  useCallback,
  useImperativeHandle,
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react';
import Konva from 'konva';
import { Group, useContextBridge } from 'react-konva';
import { LayoutContext } from './context';
import { MeasurementEngine } from './measurement/MeasurementEngine';
import { MeasurementRoot } from './measurementRoot';
import { observeHost } from './host/observeHost';
import Renderer from './rendering/Renderer';
import type { LayoutComponentProps, LayoutHandle } from './types';

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
    children,
    onLayout,
    onMeasure,
    onRenderStats,
    onFocusRequest,
  },
  forwardedRef,
) {
  const [engine] = useState(() => new MeasurementEngine());
  const [hostSize, setHostSize] = useState({ width: 0, height: 0 });
  const logicalWidth = width ?? hostSize.width;
  const logicalHeight = height ?? hostSize.height;
  const [root, setRoot] = useState<Konva.Group | null>(null);
  const group = useRef<Konva.Group | null>(null);
  const measurement = useRef<MeasurementRoot | null>(null);
  const lifetime = useRef(0);
  const Bridge = useContextBridge();
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
    lifetime.current += 1;
    measurement.current ??= new MeasurementRoot(engine);
    return () => {
      engine.stop();
      const ended = ++lifetime.current;
      // A second renderer cannot be synchronously unmounted during a Konva commit.
      // The token also preserves the DOM component state during StrictMode replay.
      queueMicrotask(() => {
        if (lifetime.current !== ended) return;
        measurement.current?.dispose();
        measurement.current = null;
        engine.dispose();
      });
    };
  }, [engine]);

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

  useLayoutEffect(() => {
    // ContextBridge forwards application providers into the detached DOM renderer.
    // The drawing renderer observes camera changes independently of this component.
    measurement.current?.render(Bridge, children);
  });

  return (
    <LayoutContext.Provider value={engine.context}>
      <Group ref={attachGroup} x={x} y={y} id={id} width={logicalWidth} height={logicalHeight}>
        <Renderer
          scene={snapshot.scene}
          root={root}
          performance={performance}
          onRenderStats={onRenderStats}
          onInvalidate={engine.invalidate}
          onFocusRequest={onFocusRequest}
        />
      </Group>
    </LayoutContext.Provider>
  );
});
