import { createContext, memo, useContext, useEffect, useRef, useState } from 'react';
import Konva from 'konva';
import { Circle, Group, Layer, Rect, Stage, Text } from 'react-konva';
import { Cell, CellText, Flex, Layout, useLayout } from '../lib';
import type { LayoutHandle, LayoutMetrics, ViewTransform } from '../lib';
import './embedded.css';

const Theme = createContext('#56744b');

function StatusMark() {
  const color = useContext(Theme);
  return <Circle x={8} y={8} radius={7} fill={color} />;
}

const Card = memo(function Card({ id, left, title }: { id: string; left: number; title: string }) {
  const color = useContext(Theme);
  const [description, setDescription] = useState(
    'Двойной клик по описанию открывает поле. Изменение пересчитает только эту карточку.',
  );
  const layout = useLayout();
  const updateDescription = (value: string) => {
    setDescription(value);
    layout.invalidate(`${id}-description`);
  };
  return (
    <Flex
      id={id}
      layoutRoot
      direction="column"
      width={260}
      minHeight={190}
      padding={20}
      gap={12}
      lodLabel={title}
      style={{ position: 'absolute', left, top: 0 }}
    >
      <Cell width="100%" height="100%" style={{ position: 'absolute', left: 0, top: 0 }}>
        {(bounds) => <Rect {...bounds} fill="#fff" stroke="#cbd8c5" cornerRadius={12} />}
      </Cell>
      <Cell>
        <Flex gap={9} alignItems="center">
          <Cell width={16} height={16}>
            {() => <StatusMark />}
          </Cell>
          <CellText text="EXISTING STAGE / LAYER" fontSize={9} color={color}>
            {(textProps) => <Text {...textProps} />}
          </CellText>
        </Flex>
      </Cell>
      <CellText id={`${id}-title`} text={title} fontSize={20} fontStyle="bold">
        {(textProps) => <Text {...textProps} />}
      </CellText>
      <CellText
        id={`${id}-description`}
        text={description}
        width="100%"
        minHeight={50}
        fontSize={13}
        lineHeight={1.5}
        color="#697461"
        editable
        onTextChange={updateDescription}
      >
        {(textProps) => <Text {...textProps} />}
      </CellText>
      <CellText text="Flex внутри · canvas снаружи" fontSize={10} color={color}>
        {(textProps) => <Text {...textProps} />}
      </CellText>
    </Flex>
  );
});

interface EmbeddedDemoApi {
  stage(): Konva.Stage | null;
  first(): LayoutHandle | null;
  second(): LayoutHandle | null;
  parent(): Konva.Group | null;
}

declare global {
  interface Window {
    embeddedDemo?: EmbeddedDemoApi;
  }
}

/** Copy this composition into an application that already owns its Konva scene. */
export default function EmbeddedExample() {
  const stage = useRef<Konva.Stage | null>(null);
  const parent = useRef<Konva.Group | null>(null);
  const first = useRef<LayoutHandle | null>(null);
  const second = useRef<LayoutHandle | null>(null);
  const [view, setView] = useState<ViewTransform>({ x: 0, y: 0, scale: 1 });
  const [rotation, setRotation] = useState(0);
  const [debug, setDebug] = useState(false);
  const [mounted, setMounted] = useState(true);
  const [green, setGreen] = useState(true);
  const [handlePosition, setHandlePosition] = useState({ x: 70, y: 430 });
  const [metrics, setMetrics] = useState<LayoutMetrics | null>(null);

  useEffect(() => {
    const api: EmbeddedDemoApi = {
      stage: () => stage.current,
      first: () => first.current,
      second: () => second.current,
      parent: () => parent.current,
    };
    window.embeddedDemo = api;
    return () => {
      if (window.embeddedDemo === api) delete window.embeddedDemo;
    };
  }, []);

  return (
    <Theme.Provider value={green ? '#56744b' : '#936fba'}>
      <main className="embedded-example">
        <a href="?playground=1">← Playground</a>
        <p className="embedded-eyebrow">REUSABLE COMPONENT</p>
        <h1>Твоя сцена. Только layout внутри.</h1>
        <p>Один существующий Stage и Layer, два независимых Layout и обычные Konva-фигуры рядом.</p>
        <div className="embedded-controls">
          <button onClick={() => setView((v) => ({ ...v, scale: v.scale === 1 ? 0.7 : 1 }))}>
            Внешний zoom
          </button>
          <button onClick={() => setView((v) => ({ ...v, x: v.x ? 0 : 100, y: v.y ? 0 : 35 }))}>
            Внешний pan
          </button>
          <button onClick={() => setRotation((v) => (v ? 0 : 8))}>Поворот Group</button>
          <button onClick={() => setGreen((v) => !v)}>Контекст темы</button>
          <button onClick={() => setDebug((v) => !v)}>HTML overlay</button>
          <button onClick={() => setMounted((v) => !v)}>
            {mounted ? 'Убрать Layout' : 'Вернуть Layout'}
          </button>
        </div>
        <div className="embedded-stage">
          <Stage
            ref={stage}
            width={960}
            height={520}
            x={view.x}
            y={view.y}
            scaleX={view.scale}
            scaleY={view.scale}
          >
            <Layer>
              <Rect
                id="application-background"
                width={960}
                height={520}
                fill="#e9eee5"
                listening={false}
              />
              <Text
                id="application-title"
                text="Обычная фигура приложения"
                x={30}
                y={24}
                fontSize={14}
                fill="#72806a"
              />
              <Group ref={parent} x={40} y={70} rotation={rotation}>
                {mounted && (
                  <Layout
                    ref={first}
                    id="first-layout"
                    width={560}
                    height={260}
                    debug={debug}
                    onMeasure={setMetrics}
                  >
                    <Card id="first-card" left={0} title="Image transform" />
                    <Card id="second-card" left={280} title="Color adjustment" />
                  </Layout>
                )}
              </Group>
              {mounted && (
                <Group x={680} y={120}>
                  <Flex ref={second} id="second-world" width={260} height={260} debug={debug}>
                    <Card id="third-card" left={0} title="Корневой Flex" />
                  </Flex>
                </Group>
              )}
              <Circle
                id="application-handle"
                {...handlePosition}
                radius={16}
                fill="#789468"
                draggable
                onDragEnd={(event) => setHandlePosition(event.target.position())}
              />
              <Text
                text="Существующая draggable-фигура"
                x={100}
                y={424}
                fontSize={12}
                fill="#72806a"
              />
            </Layer>
          </Stage>
        </div>
        <p className="embedded-metrics">
          Последнее измерение: {metrics?.scope ?? '—'} · {metrics?.measuredNodes ?? 0} элементов ·{' '}
          {metrics?.durationMs.toFixed(1) ?? '—'} ms. Pan/zoom не запускает HTML layout.
        </p>
        <pre>{`<Stage {...yourCamera}>
  <Layer>
    <YourExistingShapes />
    <Layout width={560} height={260}>
      <Flex gap={12}>
        <Cell width={120} height={80}>
          {bounds => <Rect {...bounds} fill="green" />}
        </Cell>
        <CellText text="Описание" fontSize={14}>
          {textProps => <Text {...textProps} />}
        </CellText>
      </Flex>
    </Layout>
  </Layer>
</Stage>`}</pre>
      </main>
    </Theme.Provider>
  );
}
