import { useEffect, useRef, useState } from 'react';
import type Konva from 'konva';
import { Group, Layer, Rect, Stage } from 'react-konva';
import type { LayoutHandle, LayoutMetrics, ViewTransform } from '../lib';
import { ReferenceNode } from './ReferenceNode';
import './embedded.css';

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

/** The application owns its existing Stage, Layer and camera. */
export default function EmbeddedExample() {
  const stage = useRef<Konva.Stage | null>(null);
  const parent = useRef<Konva.Group | null>(null);
  const layout = useRef<LayoutHandle | null>(null);
  const [width, setWidth] = useState(300);
  const [schematic, setSchematic] = useState(true);
  const [debug, setDebug] = useState(false);
  const [description, setDescription] = useState(
    'Описание ноды. Двойной клик открывает редактор; изменение текста пересчитывает только эту ноду.',
  );
  const [metrics, setMetrics] = useState<LayoutMetrics | null>(null);
  const [action, setAction] = useState<'run' | 'settings' | null>(null);
  const [view, setView] = useState<ViewTransform>({ x: 0, y: 0, scale: 1 });

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

  return (
    <main className="embedded-example">
      <nav>
        <a href="?playground=1">Playground</a>
        <a href="?stress=1">1000 нод</a>
        <a href="https://github.com/dzenlotus/react-konva-layout">GitHub ↗</a>
      </nav>
      <p className="embedded-eyebrow">FLEX / CELL / CELLTEXT</p>
      <h1>Нода по твоей схеме.</h1>
      <p>
        Вся композиция внутри canvas. Нативный редактор появляется по двойному клику на описание.
      </p>
      <div className="embedded-controls">
        <button aria-pressed={!schematic} onClick={() => setSchematic((value) => !value)}>
          {schematic ? 'Показать содержимое' : 'Показать схему'}
        </button>
        <button aria-pressed={debug} onClick={() => setDebug((value) => !value)}>
          HTML overlay
        </button>
        <button
          onClick={() => setView((value) => ({ ...value, scale: value.scale === 1 ? 0.7 : 1 }))}
        >
          Внешний zoom
        </button>
        <button
          onClick={() =>
            setView((value) => ({ ...value, x: value.x ? 0 : 30, y: value.y ? 0 : 20 }))
          }
        >
          Внешний pan
        </button>
        <label>
          Ширина{' '}
          <input
            type="range"
            aria-label="Ширина ноды"
            min={260}
            max={380}
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
          width={634}
          height={984}
          x={view.x}
          y={view.y}
          scaleX={view.scale}
          scaleY={view.scale}
        >
          <Layer>
            <Rect
              id="application-background"
              width={634}
              height={984}
              fill="#fff"
              listening={false}
            />
            <Group ref={parent} x={145} y={123}>
              <ReferenceNode
                ref={layout}
                width={width}
                schematic={schematic}
                debug={debug}
                description={description}
                onDescriptionChange={setDescription}
                onMeasure={setMetrics}
                onAction={setAction}
              />
            </Group>
          </Layer>
        </Stage>
      </div>
      <p className="embedded-metrics">
        Измерение: {metrics?.scope ?? '—'} · {metrics?.measuredNodes ?? 0} элементов ·{' '}
        {metrics?.durationMs.toFixed(1) ?? '—'} ms.{action ? ` Нажата кнопка: ${action}.` : ''}
      </p>
      <p>При ширине 300 px: gap 16 · превью 204×200 · порты 32×32 · кнопки 60×60.</p>
    </main>
  );
}
