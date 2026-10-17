import { useCallback, useMemo, useRef, useState } from 'react';
import { DemoCanvas, type DemoCanvasHandle } from './examples/DemoCanvas';
import type { LayoutNode } from './lib';
import { Glyph } from './playground/Glyph';
import { Inspector } from './playground/Inspector';
import { LayoutOutput } from './playground/LayoutOutput';
import { PlaygroundScene } from './playground/Scenes';
import {
  exampleCode,
  initialSettings,
  type PlaygroundSettings,
  type Scene,
} from './playground/settings';

function flatten(nodes: LayoutNode[]): LayoutNode[] {
  return nodes.flatMap((node) => [node, ...flatten(node.children)]);
}

export default function App() {
  const [scene, setScene] = useState<Scene>('node');
  const [settings, setSettings] = useState(initialSettings);
  const [tree, setTree] = useState<LayoutNode[]>([]);
  const [selected, setSelected] = useState('node');
  const layoutRef = useRef<DemoCanvasHandle>(null);
  const changeSettings = useCallback((changes: Partial<PlaygroundSettings>) => {
    setSettings((previous) => ({ ...previous, ...changes }));
  }, []);
  const { width, gap, direction, count, debug } = settings;
  const nodes = useMemo(() => flatten(tree), [tree]);
  const current = nodes.find((node) => node.id === selected) ?? tree[0];
  const flexColumns = Math.max(1, Math.floor((width - 64 + gap) / (144 + gap)));
  const rows = direction === 'column' ? count : Math.ceil(count / flexColumns);
  const height =
    scene === 'node'
      ? Math.max(464, Math.ceil(nodes.find((node) => node.id === 'node')?.height ?? 0) + 56)
      : scene === 'grid'
        ? Math.max(464, Math.ceil(nodes.find((node) => node.id === 'grid-root')?.height ?? 0))
        : Math.max(464, rows * (96 + gap) - gap + 64);
  const code = exampleCode(scene, settings, height);

  return (
    <div className="app-shell">
      <header className="topbar">
        <a className="brand" href="./">
          <span className="brand-icon">
            <Glyph name="layout" size={21} />
          </span>
          <span>
            react-konva<span className="brand-light"> / layout</span>
          </span>
          <span className="version">0.4.0</span>
        </a>
        <a
          className="repo-link"
          href="https://github.com/dzenlotus/react-konva-layout"
          target="_blank"
          rel="noreferrer"
        >
          <Glyph name="github" size={17} />
          GitHub <span>↗</span>
        </a>
      </header>

      <main>
        <section className="intro">
          <div>
            <div className="eyebrow">
              <span /> BROWSER-NATIVE LAYOUT ENGINE
            </div>
            <h1>
              CSS считает. <span>Canvas рисует.</span>
            </h1>
            <p>Двойной клик / тап по description — редактирование. Колесо — zoom, фон — pan.</p>
          </div>
          <div className="pipeline" aria-label="Layout pipeline">
            <span>HTML / CSS</span>
            <Glyph name="arrow" size={16} />
            <span>DOMRect</span>
            <Glyph name="arrow" size={16} />
            <span className="pipeline-final">Konva</span>
          </div>
        </section>

        <div className="workbench">
          <section className="preview-panel" aria-label="Canvas playground">
            <div className="preview-toolbar">
              <div className="scene-tabs" role="tablist" aria-label="Пример раскладки">
                {(['node', 'flex', 'grid'] as Scene[]).map((s) => (
                  <button
                    key={s}
                    role="tab"
                    aria-selected={scene === s}
                    className={scene === s ? 'active' : ''}
                    onClick={() => {
                      setScene(s);
                      setSelected(s === 'node' ? 'node' : `${s}-root`);
                    }}
                  >
                    {s === 'node' ? 'Нода' : s === 'flex' ? 'Flex' : 'Grid'}
                  </button>
                ))}
              </div>
              <div className="toolbar-actions">
                <button className="remeasure-button" onClick={() => layoutRef.current?.remeasure()}>
                  <Glyph name="reset" size={12} />
                  Пересчитать
                </button>
                <div className="canvas-caption">
                  <span className="live-dot" />
                  LIVE CANVAS
                </div>
              </div>
            </div>
            <div className="canvas-viewport">
              <div className="ruler">
                <span>0</span>
                <span>{Math.round(width / 4)}</span>
                <span>{Math.round(width / 2)}</span>
                <span>{Math.round(width * 0.75)}</span>
                <span>{width} px</span>
              </div>
              <div className="canvas-scroll">
                <div className="canvas-frame" style={{ width }}>
                  <DemoCanvas
                    ref={layoutRef}
                    width={width}
                    height={height}
                    debug={debug}
                    panZoom
                    onLayout={setTree}
                  >
                    <PlaygroundScene scene={scene} settings={settings} onSelect={setSelected} />
                  </DemoCanvas>
                </div>
              </div>
              <span className="canvas-corner">
                {debug ? 'HTML BOUNDS / OVERLAY' : 'RENDERED WITH KONVA'}
              </span>
            </div>
            <div className="preview-status">
              <span>
                <span className="status-dot" />
                {nodes.length} элементов измерено
              </span>
              <span>
                {width} × {height}
                <span className="status-divider">/</span>CSS px
                <span className="status-divider">/</span>getBoundingClientRect()
              </span>
            </div>
          </section>

          <Inspector
            scene={scene}
            settings={settings}
            onChange={changeSettings}
            reset={() => setSettings(initialSettings())}
          />
        </div>

        <LayoutOutput
          tree={tree}
          current={current}
          code={code}
          nodeCount={nodes.length}
          onSelect={setSelected}
        />
        <footer>
          <span>
            react-konva-layout <span className="footer-dot">·</span> MIT{' '}
            <span className="footer-dot">·</span> Рабочий прототип
          </span>
          <a href="?embedded=1">Встраивание в Stage/Layer ↗</a>
          <a href="?stress=1">Стресс-тест: 1000 нод ↗</a>
          <a
            href="https://codesandbox.io/p/sandbox/reverent-darwin-sdgd8h?file=/src/App.js"
            target="_blank"
            rel="noreferrer"
          >
            Структура ноды из примера ↗
          </a>
        </footer>
      </main>
    </div>
  );
}
