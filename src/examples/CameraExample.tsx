import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type Konva from 'konva';
import { Group, Layer, Rect, Stage, Text } from 'react-konva';
import { Cell, CellText, Flex, Grid, Layout, useLayoutDrag, usePanZoom } from '../lib';
import type {
  CameraBounds,
  CameraController,
  LayoutHandle,
  LayoutMetrics,
  ViewTransform,
} from '../lib';
import './embedded.css';
import './camera-example.css';

const WORLD = { x: 0, y: 0, width: 1600, height: 1100 };
const INITIAL_VIEW = { x: 0, y: 0, scale: 0.75 };
const COLORS = ['#dce8cc', '#d7e5e9', '#eadfc8', '#e2dbea'];

interface SceneCameraApi {
  camera: CameraController;
  stage(): Konva.Stage | null;
  target(): Konva.Group | null;
  layout(): LayoutHandle | null;
  renders(): number;
  clicks(): number;
  setBounds(bounds: CameraBounds | null): void;
  setAxis(axis: 'both' | 'x' | 'y'): void;
  setEnabled(enabled: boolean): void;
}

declare global {
  interface Window {
    sceneCamera?: SceneCameraApi;
  }
}

/** The application owns its Stage/Layer; both hooks share only the camera Group. */
export default function CameraExample() {
  const stage = useRef<Konva.Stage | null>(null);
  const target = useRef<Konva.Group | null>(null);
  const layout = useRef<LayoutHandle | null>(null);
  const zoom = useRef<HTMLOutputElement | null>(null);
  const coordinates = useRef<HTMLOutputElement | null>(null);
  const slider = useRef<HTMLInputElement | null>(null);
  const clickOutput = useRef<HTMLOutputElement | null>(null);
  const renderCount = useRef(0);
  const clickCount = useRef(0);
  renderCount.current += 1;
  const [axis, setAxis] = useState<'both' | 'x' | 'y'>('both');
  const [enabled, setEnabled] = useState(true);
  const [bounds, setBounds] = useState<CameraBounds | null>(WORLD);
  const [metrics, setMetrics] = useState<LayoutMetrics | null>(null);
  const [viewport, setViewport] = useState({ width: 960, height: 600 });
  const holder = useRef<HTMLDivElement | null>(null);

  const reportView = useCallback((view: ViewTransform) => {
    if (zoom.current) zoom.current.textContent = `${Math.round(view.scale * 100)}%`;
    if (coordinates.current)
      coordinates.current.textContent = `${view.x.toFixed(1)}, ${view.y.toFixed(1)}`;
    if (slider.current) slider.current.value = String(view.scale);
  }, []);
  const camera = usePanZoom({
    target,
    initialView: INITIAL_VIEW,
    minScale: 0.005,
    maxScale: 8,
    enabled,
    onChange: reportView,
  });
  useLayoutDrag({
    camera,
    bounds: () =>
      bounds === WORLD ? (layout.current?.getLayout('camera-content') ?? WORLD) : bounds,
    padding: 24,
    axis,
    panOn: 'anywhere',
  });

  useEffect(() => {
    const element = holder.current;
    if (!element) return;
    const resize = new ResizeObserver(([entry]) => {
      const width = Math.max(1, Math.floor(entry.contentRect.width));
      setViewport((previous) => (previous.width === width ? previous : { ...previous, width }));
    });
    resize.observe(element);
    return () => resize.disconnect();
  }, []);
  useEffect(() => {
    const api: SceneCameraApi = {
      camera,
      stage: () => stage.current,
      target: () => target.current,
      layout: () => layout.current,
      renders: () => renderCount.current,
      clicks: () => clickCount.current,
      setBounds,
      setAxis,
      setEnabled,
    };
    window.sceneCamera = api;
    return () => {
      if (window.sceneCamera === api) delete window.sceneCamera;
    };
  }, [camera]);

  const click = useCallback(() => {
    clickCount.current += 1;
    if (clickOutput.current) clickOutput.current.textContent = String(clickCount.current);
  }, []);
  const content = useMemo(
    () => (
      <Flex
        id="camera-content"
        width={WORLD.width}
        height={WORLD.height}
        direction="column"
        padding={48}
        gap={24}
        fill="#f2f5ed"
      >
        <CellText text="Одна сцена. Одна камера." fontSize={40} fontStyle="bold" color="#26331e">
          {(props) => <Text {...props} listening={false} />}
        </CellText>
        <CellText
          text="Масштаб и перемещение работают вместе. Границы остаются в координатах раскладки."
          fontSize={19}
          color="#738367"
        >
          {(props) => <Text {...props} listening={false} />}
        </CellText>
        <Grid gridTemplateColumns="repeat(4, minmax(0, 1fr))" gap={24}>
          {Array.from({ length: 12 }, (_, index) => (
            <Cell key={index} id={`camera-tile-${index}`} height={232} onClick={click}>
              <Cell width="100%" height="100%" style={{ position: 'absolute', left: 0, top: 0 }}>
                {(box) => <Rect {...box} fill={COLORS[index % COLORS.length]} cornerRadius={16} />}
              </Cell>
              <Flex padding={24} direction="column" gap={12}>
                <CellText text={String(index + 1).padStart(2, '0')} fontSize={34} color="#52654a">
                  {(props) => <Text {...props} listening={false} />}
                </CellText>
                <CellText text="Элемент раскладки" fontSize={18} fontStyle="bold" color="#26331e">
                  {(props) => <Text {...props} listening={false} />}
                </CellText>
                <CellText text="Нажмите или переместите сцену" fontSize={13} color="#738367">
                  {(props) => <Text {...props} listening={false} />}
                </CellText>
              </Flex>
            </Cell>
          ))}
        </Grid>
      </Flex>
    ),
    [click],
  );

  return (
    <main className="embedded-example camera-example">
      <nav>
        <a href="?embedded=1">Flex / Cell / CellText</a>
        <a href="?scene=1">Свободная сцена</a>
        <a href="?stress=1">1000 элементов</a>
        <a href="https://github.com/dzenlotus/react-konva-layout">GitHub ↗</a>
      </nav>
      <p className="embedded-eyebrow">REACT KONVA / CAMERA CONTROLS</p>
      <h1>Перемещение камеры.</h1>
      <p>Перетаскивайте сцену. Колесо и два пальца меняют масштаб вокруг выбранной точки.</p>
      <div className="embedded-controls">
        <button onClick={() => camera.zoomBy(1 / 1.25)}>−</button>
        <button onClick={() => camera.zoomBy(1.25)}>+</button>
        <button onClick={() => camera.fitBounds(WORLD, 24)}>Показать всё</button>
        <button onClick={() => camera.reset()}>Сброс</button>
        <button aria-pressed={enabled} onClick={() => setEnabled((value) => !value)}>
          Управление камерой
        </button>
        <button
          aria-pressed={!!bounds}
          onClick={() => setBounds((value) => (value ? null : WORLD))}
        >
          Границы сцены
        </button>
        <select
          aria-label="Ось перемещения"
          value={axis}
          onChange={(event) => setAxis(event.target.value as typeof axis)}
        >
          <option value="both">Обе оси</option>
          <option value="x">Только X</option>
          <option value="y">Только Y</option>
        </select>
        <label>
          Zoom
          <input
            ref={slider}
            aria-label="Масштаб камеры"
            type="range"
            min={0.005}
            max={2}
            step={0.005}
            defaultValue={INITIAL_VIEW.scale}
            onChange={(event) => camera.zoomTo(Number(event.target.value))}
          />
          <output ref={zoom}>75%</output>
        </label>
      </div>
      <div ref={holder} className="embedded-stage camera-stage">
        <Stage ref={stage} width={viewport.width} height={viewport.height}>
          <Layer>
            <Group ref={target}>
              <Layout ref={layout} width={WORLD.width} height={WORLD.height} onMeasure={setMetrics}>
                {content}
              </Layout>
            </Group>
          </Layer>
        </Stage>
      </div>
      <div className="embedded-status">
        <span>
          Камера: <output ref={coordinates}>0, 0</output>
        </span>
        <span>
          Клики: <output ref={clickOutput}>0</output>
        </span>
        <span>
          Layout: {metrics?.scope ?? '—'} / {metrics?.measuredElements ?? 0} измерений
        </span>
      </div>
    </main>
  );
}
