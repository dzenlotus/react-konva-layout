import { useCallback, useEffect, useRef, useState } from 'react';
import type Konva from 'konva';
import { Group, Layer, Rect, Shape, Stage } from 'react-konva';
import type { LayoutHandle, LayoutMetrics, ViewTransform } from '../lib';
import { ReferenceNode } from './ReferenceNode';
import { useDemoGestures } from './useDemoGestures';
import { zoomAtPoint } from './camera';
import './embedded.css';

const CANVAS_WIDTH = 960;
const CANVAS_HEIGHT = 640;

interface ReferenceDemoApi {
  stage(): Konva.Stage | null;
  layout(): LayoutHandle | null;
  parent(): Konva.Group | null;
}
declare global {
  interface Window {
    referenceDemo?: ReferenceDemoApi;
  }
}

/** Stage, Layer, image loading and camera belong to this application. */
export default function EmbeddedExample() {
  const stage = useRef<Konva.Stage | null>(null);
  const parent = useRef<Konva.Group | null>(null);
  const layout = useRef<LayoutHandle | null>(null);
  const [width, setWidth] = useState(360);
  const [debug, setDebug] = useState(false);
  const [description, setDescription] = useState(
    'Этот модуль обрабатывает изображение: приводит цвета и размеры к единому формату и передаёт результат дальше по графу.',
  );
  const [previewImage, setPreviewImage] = useState<HTMLImageElement>();
  const [previewError, setPreviewError] = useState(false);
  const [metrics, setMetrics] = useState<LayoutMetrics | null>(null);
  const [action, setAction] = useState<'run' | 'settings' | null>(null);
  const [selectedPort, setSelectedPort] = useState('');
  const [view, setView] = useState<ViewTransform>({ x: 0, y: 0, scale: 1 });
  const viewRef = useRef(view);
  const setCamera = useCallback((next: Partial<ViewTransform>) => {
    const current = { ...viewRef.current, ...next };
    viewRef.current = current;
    stage.current?.position(current);
    stage.current?.scale({ x: current.scale, y: current.scale });
    stage.current?.batchDraw();
    setView(current);
  }, []);
  useDemoGestures(stage, true, viewRef, setCamera);

  useEffect(() => {
    let active = true;
    const image = new Image();
    image.onload = () => {
      if (active) setPreviewImage(image);
    };
    image.onerror = () => {
      if (active) setPreviewError(true);
    };
    image.src = `${import.meta.env.BASE_URL}node-preview.jpg`;
    return () => {
      active = false;
      image.onload = null;
      image.onerror = null;
    };
  }, []);
  useEffect(() => {
    const api: ReferenceDemoApi = {
      stage: () => stage.current,
      layout: () => layout.current,
      parent: () => parent.current,
    };
    window.referenceDemo = api;
    return () => {
      if (window.referenceDemo === api) delete window.referenceDemo;
    };
  }, []);
  const selectPort = useCallback((side: 'input' | 'output', index: number) => {
    setAction(null);
    setSelectedPort(`${side === 'input' ? 'Вход' : 'Выход'} ${index + 1}`);
  }, []);
  const zoom = () => {
    const previous = viewRef.current;
    const scale = previous.scale === 1 ? 0.8 : 1;
    setCamera(zoomAtPoint(previous, { x: CANVAS_WIDTH / 2, y: CANVAS_HEIGHT / 2 }, scale));
  };

  return (
    <main className="embedded-example">
      <nav>
        <a href="?playground=1">Playground</a>
        <a href="?stress=1">1000 нод</a>
        <a href="https://github.com/dzenlotus/react-konva-layout">GitHub ↗</a>
      </nav>
      <p className="embedded-eyebrow">REACT KONVA / FLEX LAYOUT</p>
      <h1>Нода обработки изображения.</h1>
      <p>Двойной клик по описанию — редактирование. Колесо — zoom, перетаскивание фона — pan.</p>
      <div className="embedded-controls">
        <button aria-pressed={debug} onClick={() => setDebug((value) => !value)}>
          HTML overlay
        </button>
        <button onClick={zoom}>Zoom {Math.round(view.scale * 100)}%</button>
        <button onClick={() => setCamera({ x: 0, y: 0, scale: 1 })}>Сброс камеры</button>
        <label>
          Ширина{' '}
          <input
            type="range"
            aria-label="Ширина ноды"
            min={280}
            max={440}
            step={10}
            value={width}
            onChange={(event) => setWidth(Number(event.target.value))}
          />
          <output>{width}</output>
        </label>
      </div>
      <div className="embedded-stage">
        <Stage
          ref={stage}
          width={CANVAS_WIDTH}
          height={CANVAS_HEIGHT}
          x={view.x}
          y={view.y}
          scaleX={view.scale}
          scaleY={view.scale}
        >
          <Layer>
            <Rect
              id="application-background"
              width={CANVAS_WIDTH}
              height={CANVAS_HEIGHT}
              fill="#f4f6f0"
              listening={false}
            />
            <Shape
              fill="#d9e1d2"
              listening={false}
              perfectDrawEnabled={false}
              sceneFunc={(context, shape) => {
                context.beginPath();
                for (let y = 12; y < CANVAS_HEIGHT; y += 24)
                  for (let x = 12; x < CANVAS_WIDTH; x += 24) {
                    context.moveTo(x + 0.8, y);
                    context.arc(x, y, 0.8, 0, Math.PI * 2);
                  }
                context.fillStrokeShape(shape);
              }}
            />
            <Group ref={parent} x={(CANVAS_WIDTH - width) / 2} y={84}>
              <ReferenceNode
                ref={layout}
                width={width}
                debug={debug}
                previewImage={previewImage}
                description={description}
                onDescriptionChange={setDescription}
                onMeasure={setMetrics}
                onAction={setAction}
                onPortSelect={selectPort}
              />
            </Group>
          </Layer>
        </Stage>
      </div>
      <div className="embedded-status">
        <p className="embedded-metrics">
          Layout: {metrics?.scope ?? '—'} · {metrics?.measuredNodes ?? 0} элементов ·{' '}
          {metrics?.durationMs.toFixed(1) ?? '—'} ms
        </p>
        <span aria-live="polite">
          {action ? `Событие: ${action}` : selectedPort || 'Готово к подключению'}
        </span>
      </div>
      {previewError && <p role="alert">Не удалось загрузить превью.</p>}
      <p className="embedded-caption">
        Один существующий Stage/Layer. Внутри — Flex, Cell и CellText. HTML отсутствует после
        измерения.
      </p>
    </main>
  );
}
