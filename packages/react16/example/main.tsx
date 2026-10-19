import React, {
  createContext,
  memo,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import ReactDOM from 'react-dom';
import type Konva from 'konva';
import { Circle, Layer, Rect, Stage, Text } from 'react-konva';
import { Cell, CellText, Flex, Layout } from '@dzenlotus/react-konva-layout';
import type {
  LayoutHandle,
  LayoutMetrics,
  LayoutPlacement,
  RenderMetrics,
  ViewTransform,
} from '@dzenlotus/react-konva-layout';
import './style.css';

const ThemeContext = createContext('light');
const CONTEXTS = [ThemeContext];
const DESCRIPTION =
  'Размеры определяет браузер. Измените этот текст — пересчитается только эта карточка.';
const PERFORMANCE = { enabled: true, cache: true, cull: true, cacheBudgetMB: 32 };
const rootElement = document.getElementById('root')!;
const api = {
  unmount: () => ReactDOM.unmountComponentAtNode(rootElement),
  remount: () => ReactDOM.render(<App />, rootElement),
};
declare global {
  interface Window {
    react16Demo: typeof api & {
      stage(): Konva.Stage | null;
      layout(): LayoutHandle | null;
      setView(next: ViewTransform): void;
      setTheme(next: string): void;
      setText(id: string, text: string): void;
      setCount(next: number): void;
      setMounted(next: boolean): void;
      stats(): {
        react: string;
        count: number;
        theme: string;
        selected: string;
        view: ViewTransform;
        measure: LayoutMetrics | null;
        render: RenderMetrics | null;
        textRef: string | undefined;
        htmlElements: number;
      };
    };
  }
}
window.react16Demo = api as Window['react16Demo'];

const DemoCard = memo(function DemoCard({
  id,
  text,
  detail,
  textRef,
}: {
  id: string;
  text: string;
  detail: boolean;
  textRef?: React.Ref<Konva.Text>;
}) {
  const dark = useContext(ThemeContext) === 'dark';
  const ink = dark ? '#f1f4f8' : '#273640';
  const accent = dark ? '#b3c897' : '#73935d';
  return (
    <Flex
      id={id}
      layoutRoot
      layoutTemplate="react16-card"
      width={320}
      direction="column"
      padding={18}
      gap={12}
      fill={dark ? '#28343c' : '#fff'}
      stroke={dark ? '#46535c' : '#dce3d8'}
      cornerRadius={14}
      style={{ position: 'absolute', left: 0, top: 0 }}
    >
      <CellText text="IMAGE PROCESSING" fontSize={10} fontStyle="bold" color={accent}>
        {(props) => <Text {...props} listening={false} />}
      </CellText>
      <CellText
        id={`${id}-title`}
        text="Image transform"
        fontSize={dark ? 20 : 18}
        fontStyle="bold"
        color={ink}
      >
        {(props) => <Text {...props} listening={false} />}
      </CellText>
      <Flex width="100%" gap={10} alignItems="center">
        {['input', 'preview', 'output'].map((part) =>
          part === 'preview' ? (
            <Cell
              key={part}
              flexGrow={1}
              minWidth={0}
              height={106}
              renderWhen={detail}
              fallback={(bounds) => (
                <Rect {...bounds} fill="#dfe9d5" cornerRadius={8} listening={false} />
              )}
            >
              {(bounds) => (
                <>
                  <Rect {...bounds} fill="#dfe9d5" cornerRadius={8} listening={false} />
                  <Circle x={bounds.width / 2} y={53} radius={32} fill={accent} listening={false} />
                  <Circle
                    x={bounds.width / 2 + 23}
                    y={44}
                    radius={15}
                    fill="#bed0b0"
                    listening={false}
                  />
                </>
              )}
            </Cell>
          ) : (
            <Flex key={part} direction="column" gap={12} width={16} flexShrink={0}>
              {[0, 1, 2].map((port) => (
                <Cell key={port} id={`${id}-${part}-${port}`} width={16} height={16}>
                  {(bounds) => (
                    <Rect
                      {...bounds}
                      fill={part === 'input' ? accent : '#7f9aaf'}
                      cornerRadius={5}
                    />
                  )}
                </Cell>
              ))}
            </Flex>
          ),
        )}
      </Flex>
      <CellText
        id={`${id}-description`}
        text={text}
        fontSize={14}
        lineHeight={1.35}
        color={ink}
        width="100%"
        renderWhen={detail}
      >
        {(props) => <Text {...props} ref={textRef} listening={false} />}
      </CellText>
      <Flex width="100%" gap={10}>
        {['Запустить', 'Настройки'].map((label) => (
          <Cell key={label} flexGrow={1} height={32} renderWhen={detail}>
            {(bounds) => (
              <>
                <Rect {...bounds} fill={dark ? '#435345' : '#eef3e9'} cornerRadius={6} />
                <Text
                  {...bounds}
                  text={label}
                  fontSize={12}
                  align="center"
                  verticalAlign="middle"
                  fill={ink}
                  listening={false}
                />
              </>
            )}
          </Cell>
        ))}
      </Flex>
    </Flex>
  );
});

function App() {
  const [count, setCount] = useState(
    new URLSearchParams(location.search).get('count') === '1000' ? 1000 : 1,
  );
  const [theme, setTheme] = useState('light');
  const [texts, setTexts] = useState<Record<string, string>>({});
  const [positions, setPositions] = useState<Record<string, { x: number; y: number }>>({});
  const [selected, setSelected] = useState('item-0');
  const [detail, setDetail] = useState(true);
  const [mounted, setMounted] = useState(true);
  const [size, setSize] = useState({ width: Math.max(320, innerWidth - 48), height: 650 });
  const stage = useRef<Konva.Stage>(null);
  const sceneLayer = useRef<Konva.Layer>(null);
  const dragLayer = useRef<Konva.Layer>(null);
  const layout = useRef<LayoutHandle>(null);
  const textRef = useRef<Konva.Text>(null);
  const activeDrag = useRef<{ group: Konva.Group; parent: Konva.Container } | null>(null);
  const view = useRef<ViewTransform>({ x: 36, y: 36, scale: 1 });
  const zoomLabel = useRef<HTMLOutputElement>(null);
  const metrics = useRef<LayoutMetrics | null>(null);
  const renderMetrics = useRef<RenderMetrics | null>(null);
  const ids = useMemo(() => Array.from({ length: count }, (_, i) => `item-${i}`), [count]);
  const setText = (id: string, text: string) => setTexts((current) => ({ ...current, [id]: text }));
  const stopDrag = () => {
    const active = activeDrag.current;
    if (!active) return;
    active.group.stopDrag();
    active.group.moveTo(active.parent);
    activeDrag.current = null;
    sceneLayer.current?.batchDraw();
    dragLayer.current?.batchDraw();
  };
  const setView = (next: ViewTransform) => {
    stopDrag();
    view.current = next;
    stage.current?.position(next);
    stage.current?.scale({ x: next.scale, y: next.scale });
    stage.current?.batchDraw();
    setDetail(next.scale >= 0.2);
    if (zoomLabel.current) zoomLabel.current.value = `${Math.round(next.scale * 100)}%`;
  };
  const fit = (nextCount = count) =>
    setView(nextCount === 1 ? { x: 36, y: 36, scale: 1 } : { x: 20, y: 20, scale: 0.05 });
  useEffect(() => {
    const resize = () => {
      stopDrag();
      setSize({ width: Math.max(320, innerWidth - 48), height: 650 });
    };
    addEventListener('resize', resize);
    return () => removeEventListener('resize', resize);
  }, []);
  useLayoutEffect(() => {
    fit();
    return stopDrag;
  }, []);
  useLayoutEffect(() => {
    Object.assign(api, {
      stage: () => stage.current,
      layout: () => layout.current,
      setView,
      setTheme,
      setText: (id: string, text: string) => {
        stopDrag();
        setText(id, text);
      },
      setCount: (next: number) => {
        stopDrag();
        setCount(next);
        fit(next);
      },
      setMounted: (next: boolean) => {
        stopDrag();
        setMounted(next);
      },
      stats: () => ({
        react: React.version,
        count,
        theme,
        selected,
        view: view.current,
        measure: metrics.current,
        render: renderMetrics.current,
        textRef: textRef.current?.text(),
        htmlElements: document.querySelectorAll('.konva-layout-element').length,
      }),
    });
  });
  const placements: LayoutPlacement[] = ids.map((id, i) => ({
    id,
    x: positions[id]?.x ?? (i % 40) * 380 + Math.sin(i * 7) * 45,
    y: positions[id]?.y ?? Math.floor(i / 40) * 400 + Math.cos(i * 5) * 30,
    draggable: true,
    onClick: () => setSelected(id),
    onTap: () => setSelected(id),
    onDragStart: (event) => {
      const group = event.currentTarget as Konva.Group;
      activeDrag.current = { group, parent: group.getParent()! };
      group.moveTo(dragLayer.current!);
      sceneLayer.current?.batchDraw();
      dragLayer.current?.batchDraw();
    },
    onDragEnd: (event) => {
      const group = event.currentTarget as Konva.Group;
      const position = group.position();
      if (activeDrag.current?.group === group) {
        group.moveTo(activeDrag.current.parent);
        activeDrag.current = null;
      }
      setSelected(id);
      setPositions((current) => ({ ...current, [id]: position }));
      dragLayer.current?.batchDraw();
    },
  }));
  return (
    <main>
      <header>
        <div>
          <p>REACT {React.version} · KONVA 8</p>
          <h1>Та же компоновка. Ваш canvas.</h1>
        </div>
        <a href="https://github.com/dzenlotus/react-konva-layout">GitHub ↗</a>
      </header>
      <div className="toolbar">
        <button onClick={() => window.react16Demo.setCount(count === 1 ? 1000 : 1)}>
          {count === 1 ? '1000 карточек' : 'Одна карточка'}
        </button>
        <button onClick={() => fit()}>Показать все</button>
        <button
          onClick={() => {
            stopDrag();
            setTheme(theme === 'light' ? 'dark' : 'light');
          }}
        >
          Сменить тему
        </button>
        <output ref={zoomLabel}>100%</output>
        <span>Перемещение карточки · drag фона · колесо для zoom</span>
      </div>
      <div className="canvas">
        <Stage
          ref={stage}
          width={size.width}
          height={size.height}
          draggable
          onDragMove={(event) => {
            if (event.target === stage.current)
              view.current = { ...view.current, ...event.target.position() };
          }}
          onWheel={(event) => {
            event.evt.preventDefault();
            const pointer = stage.current?.getPointerPosition();
            if (!pointer) return;
            const previous = view.current;
            const scale = Math.max(
              0.01,
              Math.min(3, previous.scale * (event.evt.deltaY > 0 ? 0.9 : 1 / 0.9)),
            );
            setView({
              scale,
              x: pointer.x - ((pointer.x - previous.x) / previous.scale) * scale,
              y: pointer.y - ((pointer.y - previous.y) / previous.scale) * scale,
            });
          }}
        >
          <ThemeContext.Provider value={theme}>
            <Layer ref={sceneLayer}>
              {mounted && (
                <Layout
                  ref={layout}
                  width={320}
                  height={400}
                  contexts={CONTEXTS}
                  placements={placements}
                  performance={PERFORMANCE}
                  onMeasure={(next) => {
                    metrics.current = next;
                  }}
                  onRenderStats={(next) => {
                    renderMetrics.current = next;
                  }}
                >
                  {ids.map((id) => (
                    <DemoCard
                      key={id}
                      id={id}
                      text={texts[id] ?? DESCRIPTION}
                      detail={detail}
                      textRef={id === selected ? textRef : undefined}
                    />
                  ))}
                </Layout>
              )}
            </Layer>
            <Layer ref={dragLayer} name="application-drag-layer" />
          </ThemeContext.Provider>
        </Stage>
      </div>
      <div className="editor">
        <label htmlFor="description">Описание · {selected}</label>
        <textarea
          id="description"
          value={texts[selected] ?? DESCRIPTION}
          onChange={(event) => {
            stopDrag();
            setText(selected, event.target.value);
          }}
        />
        <p>
          Поле принадлежит приложению. CellText измеряет содержимое; HTML после измерения удаляется.
          На zoom ниже 20% скрываются только выбранные Cell, размеры сохраняются.
        </p>
      </div>
    </main>
  );
}

api.remount();
