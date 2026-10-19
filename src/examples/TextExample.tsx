import { useEffect, useRef, useState, type CSSProperties } from 'react';
import type Konva from 'konva';
import { Layer, Rect, Stage, Text } from 'react-konva';
import { CellText, Flex, Layout } from '../lib';
import type { CellTextProps, CellTextRenderProps, LayoutHandle } from '../lib';
import './embedded.css';
import './typography.css';

const WIDTH = 400;
const HEIGHT = 76;
const ROW_HEIGHT = 112;
type TextCase = Omit<CellTextProps, 'children'> & { id: string; label: string };
const INITIAL_CASES: readonly TextCase[] = [
  {
    id: 'weight-italic',
    label: '22 px · italic · weight 600',
    text: 'Размер, вес и курсив\nMeasure once. Draw the same.',
    fontSize: 22,
    fontStyle: 'italic',
    fontWeight: 600,
    lineHeight: 1.25,
  },
  {
    id: 'oblique-spacing',
    label: 'Oblique → italic · letter spacing · right',
    text: 'Oblique with precise spacing',
    fontSize: 22,
    fontStyle: 'oblique 12deg',
    letterSpacing: 1.2,
    align: 'right',
    verticalAlign: 'middle',
  },
  {
    id: 'small-caps-decoration',
    label: 'Small caps · underline + line-through · center',
    text: 'Canvas text / Small capitals',
    fontSize: 25,
    fontVariant: 'small-caps',
    textDecoration: 'underline line-through',
    align: 'center',
    verticalAlign: 'middle',
    style: { fontSynthesis: 'small-caps' },
  },
  {
    id: 'rtl',
    label: 'RTL · logical start alignment',
    text: 'مرحبا بالعالم — Canvas 2026',
    fontSize: 25,
    direction: 'rtl',
    style: { textAlign: 'start' },
    verticalAlign: 'middle',
  },
  {
    id: 'css-padding',
    label: 'CSS overrides · padding · vertical middle',
    text: 'Стили из CSS имеют приоритет',
    fontSize: 14,
    fontWeight: 400,
    color: '#777777',
    padding: '10px 18px',
    style: {
      fontSize: 21,
      fontWeight: 550,
      fontStyle: 'italic',
      color: '#506f35',
      verticalAlign: 'middle',
    },
  },
  {
    id: 'ellipsis',
    label: 'Fixed width · no wrap · ellipsis',
    text: 'Длинная строка сохраняет границы и обрезается многоточием в конце.',
    fontSize: 23,
    wrap: 'none',
    ellipsis: true,
    verticalAlign: 'middle',
    padding: '10px 14px',
  },
];

/** Visible browser reference: this belongs to the example, not the measurement tree. */
function referenceStyle(item: TextCase): CSSProperties {
  const parser = document.createElement('span').style;
  parser.font = `${item.fontStyle ?? 'normal'} 16px Arial`;
  const style: CSSProperties = {
    display: 'flex',
    flexDirection: 'column',
    justifyContent:
      (item.style?.verticalAlign ?? item.verticalAlign) === 'middle'
        ? 'center'
        : (item.style?.verticalAlign ?? item.verticalAlign) === 'bottom'
          ? 'flex-end'
          : 'flex-start',
    width: item.width ?? WIDTH,
    height: item.height ?? HEIGHT,
    fontFamily: item.fontFamily ?? 'Arial',
    fontSize: item.fontSize ?? 12,
    fontStyle: parser.fontStyle.startsWith('oblique') ? 'italic' : parser.fontStyle || 'normal',
    fontWeight: item.fontWeight ?? (parser.fontWeight || 400),
    fontVariant: item.fontVariant ?? 'normal',
    lineHeight: item.lineHeight ?? 1,
    letterSpacing: item.letterSpacing ?? 0,
    color: item.color ?? '#000000',
    textAlign: item.align ?? 'left',
    textDecoration: item.textDecoration ?? 'none',
    direction: item.direction ?? 'ltr',
    padding: item.padding ?? 0,
    ...item.style,
  };
  if (item.style?.font) {
    parser.font = '';
    parser.font = item.style.font;
    if (parser.fontSize && parser.fontFamily) {
      for (const name of [
        'fontStyle',
        'fontWeight',
        'fontVariant',
        'fontSize',
        'fontFamily',
        'lineHeight',
      ] as const) {
        Object.assign(style, { [name]: item.style[name] ?? parser[name] });
      }
    }
    delete style.font;
  }
  if (typeof style.fontStyle === 'string' && style.fontStyle.startsWith('oblique'))
    style.fontStyle = 'italic';
  return style;
}

interface TextDemoApi {
  stage(): Konva.Stage | null;
  layout(): LayoutHandle | null;
  getProps(): Readonly<Record<string, CellTextRenderProps>>;
  getTexts(): Readonly<Record<string, Konva.Text>>;
  setCase(id: string, patch: Partial<Omit<TextCase, 'id'>>): void;
  reset(): void;
}

declare global {
  interface Window {
    textDemo?: TextDemoApi;
  }
}

/** The host owns Stage and Layer; CellText only measures and supplies native Text props. */
export default function TextExample() {
  const stage = useRef<Konva.Stage | null>(null);
  const layout = useRef<LayoutHandle | null>(null);
  const measuredProps = useRef<Record<string, CellTextRenderProps>>({});
  const nativeTexts = useRef<Record<string, Konva.Text>>({});
  const [cases, setCases] = useState(INITIAL_CASES);
  const [changed, setChanged] = useState(false);

  useEffect(() => {
    const api: TextDemoApi = {
      stage: () => stage.current,
      layout: () => layout.current,
      getProps: () => measuredProps.current,
      getTexts: () => nativeTexts.current,
      setCase: (id, patch) =>
        setCases((previous) =>
          previous.map((item) => (item.id === id ? { ...item, ...patch } : item)),
        ),
      reset: () => setCases(INITIAL_CASES),
    };
    window.textDemo = api;
    return () => {
      if (window.textDemo === api) delete window.textDemo;
    };
  }, []);

  function toggleWeight() {
    const next = !changed;
    setChanged(next);
    setCases((previous) =>
      previous.map((item) =>
        item.id === 'weight-italic'
          ? { ...item, fontSize: next ? 19 : 22, fontWeight: next ? 800 : 600 }
          : item,
      ),
    );
  }

  return (
    <main className="embedded-example typography-example">
      <nav>
        <a href="?camera=1">Камера сцены</a>
        <a href="?embedded=1">Пример layout</a>
        <a href="https://github.com/dzenlotus/react-konva-layout">GitHub ↗</a>
      </nav>
      <p className="embedded-eyebrow">CELLTEXT / NATIVE KONVA TEXT</p>
      <h1>Один текст. Одинаковые параметры.</h1>
      <p>Слева — HTML, справа — Konva Text с параметрами из callback CellText.</p>
      <div className="embedded-controls">
        <button aria-pressed={changed} onClick={toggleWeight}>
          Изменить размер и вес первой строки
        </button>
      </div>
      <div className="typography-comparison">
        <section aria-label="HTML reference">
          <h2>HTML reference</h2>
          <div className="typography-rows">
            {cases.map((item) => (
              <article className="typography-row" key={item.id}>
                <div className="typography-label">{item.label}</div>
                <div
                  className="typography-reference"
                  style={referenceStyle(item)}
                  data-text-case={item.id}
                >
                  <span
                    style={{
                      whiteSpace:
                        item.style?.whiteSpace ?? (item.wrap === 'none' ? 'pre' : 'pre-wrap'),
                      overflowWrap:
                        item.style?.overflowWrap ??
                        (item.wrap === 'char' ? 'anywhere' : 'break-word'),
                      overflow: item.ellipsis ? 'hidden' : undefined,
                      textOverflow: item.ellipsis ? 'ellipsis' : undefined,
                    }}
                  >
                    {item.text}
                  </span>
                </div>
              </article>
            ))}
          </div>
        </section>
        <section aria-label="Canvas text">
          <h2>Canvas / CellText</h2>
          <div className="typography-rows typography-canvas">
            <Stage ref={stage} width={WIDTH} height={cases.length * ROW_HEIGHT}>
              <Layer>
                {cases.map((item, index) => (
                  <Rect
                    key={item.id}
                    x={0}
                    y={index * ROW_HEIGHT + 24}
                    width={WIDTH}
                    height={HEIGHT}
                    fill="#ffffff"
                    listening={false}
                  />
                ))}
                {cases.map((item, index) => (
                  <Text
                    key={item.id}
                    x={0}
                    y={index * ROW_HEIGHT + 2}
                    text={item.label}
                    fontFamily="Arial"
                    fontSize={11}
                    fill="#78826d"
                    listening={false}
                  />
                ))}
                <Layout ref={layout} y={24} width={WIDTH} performance={{ cache: false }}>
                  <Flex id="text-cases" direction="column" width={WIDTH} gap={ROW_HEIGHT - HEIGHT}>
                    {cases.map(({ label: _label, ...item }) => (
                      <CellText
                        key={item.id}
                        {...item}
                        layoutRoot
                        width={item.width ?? WIDTH}
                        height={item.height ?? HEIGHT}
                      >
                        {(props) => {
                          measuredProps.current[item.id] = props;
                          return (
                            <Text
                              {...props}
                              id={`native-${item.id}`}
                              ref={(text) => {
                                if (text) nativeTexts.current[item.id] = text;
                                else delete nativeTexts.current[item.id];
                              }}
                              listening={false}
                            />
                          );
                        }}
                      </CellText>
                    ))}
                  </Flex>
                </Layout>
              </Layer>
            </Stage>
          </div>
        </section>
      </div>
      <p className="typography-note">
        HTML-эталон виден только в этом примере. Измерительная HTML-структура CellText удаляется
        после расчёта.
      </p>
    </main>
  );
}
