import { memo, useRef, useState } from 'react';
import type { CSSProperties, ReactNode } from 'react';
import { Circle, Line, Rect, Text } from 'react-konva';
import { Box, Col, Flex, Grid, LayoutCanvas, LayoutText, Row } from './lib';
import type { LayoutCanvasHandle, LayoutNode } from './lib';

type Scene = 'node' | 'flex' | 'grid';
const font = 'Arial';
const swatches = ['#c9e7c4', '#e7dfc4', '#d5dfee', '#e9d3c9', '#d9d1e6', '#c6e2dd'];

function Glyph({ name, size = 18 }: { name: 'layout' | 'code' | 'copy' | 'arrow' | 'github' | 'reset'; size?: number }) {
  const paths = {
    layout: <><rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="18" rx="1" /><rect x="3" y="14" width="7" height="7" rx="1" /></>,
    code: <><path d="m8 6-6 6 6 6m8-12 6 6-6 6m-3-15-2 18" /></>,
    copy: <><rect x="8" y="8" width="13" height="13" rx="2" /><path d="M16 8V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h3" /></>,
    arrow: <><path d="M4 12h16m-6-6 6 6-6 6" /></>,
    github: <><path d="M9 21v-4c-4 1-4-2-6-2m12 6v-4c0-1 .2-2-1-3 4 0 6-2 6-5 0-1-.4-2-1-3 0-1 0-2-.2-3-2 0-3 1-4 1-2-.5-4-.5-6 0C8 3 7 2 5 3c-.3 1-.3 2 0 3-1 1-1 2-1 3 0 3 2 5 6 5-1 1-1 2-1 3" /></>,
    reset: <><path d="M3 10a9 9 0 1 1 1 8M3 3v7h7" /></>,
  };
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name]}</svg>;
}

function Label({ children, tag }: { children: string; tag?: string }) {
  return <div className="field-label"><span>{children}</span>{tag ? <code>{tag}</code> : null}</div>;
}

function Port({ index, side }: { index: number; side: string }) {
  return <Box id={`${side}-port-${index}`} data-testid={`${side}-port-${index}`} width={16} height={16} render={() => <><Rect width={16} height={16} cornerRadius={5} fill="#e3e8dd" /><Circle x={8} y={8} radius={3} fill="#63715b" /></>} />;
}

function ImagePreview({ width, height }: { width: number; height: number }) {
  return <>
    <Rect width={width} height={height} fill="#e0e9da" cornerRadius={9} />
    <Circle x={width * .74} y={height * .27} radius={13} fill="#f9faf1" />
    <Line points={[0, height, 0, height * .8, width * .32, height * .28, width * .69, height, width, height]} fill="#a6b99a" closed />
    <Line points={[0, height, width * .64, height * .4, width, height * .8, width, height]} fill="#748d69" closed />
    <Text text="PREVIEW / 01" x={12} y={height - 20} fontSize={9} letterSpacing={1} fill="#fff" fontFamily={font} />
  </>;
}

const NodeExample = memo(function NodeExample({ gap, maxWidth, onSelect }: { gap: number; maxWidth: number; onSelect: (id: string) => void }) {
  const [description, setDescription] = useState('Этот модуль создан для того, чтобы помогать людям. Размеры и переносы рассчитывает браузер.');
  return <Flex id="scene-root" data-testid="scene-root" width="100%" height="100%" padding={28} alignItems="center" justifyContent="center">
    <Col id="node" data-testid="node" layoutRoot lodLabel="Image transform" width="100%" maxWidth={maxWidth} flexShrink={0} gap={gap} padding={24} fill="#ffffff" stroke="#d8ddd2" cornerRadius={16}>
      <Row id="main" width="100%" gap={8} alignItems="center">
        <Col id="content" data-testid="node-content" width="100%" gap={gap}>
          <Row id="label-row" alignItems="center" gap={7}>
            <Box id="status-dot" width={6} height={6} render={() => <Circle x={3} y={3} radius={3} fill="#688c4d" />} />
            <LayoutText id="label" text="IMAGE PROCESSING" fontSize={10} fontFamily={font} fontStyle="bold" color="#6d7e60" />
          </Row>
          <Col id="heading" gap={6}>
            <LayoutText id="title" data-testid="node-title" text="Image transform" fontSize={24} fontFamily={font} fontStyle="bold" color="#20281c" />
            <LayoutText id="subtitle" text="Нормализация входящего изображения" fontSize={12} fontFamily={font} color="#848a7e" />
          </Col>
          <Row id="figure" data-testid="node-figure" width="100%" gap={gap} alignItems="center">
            <Col id="inPorts" data-testid="input-ports" gap={12}>{[0, 1, 2].map(i => <Port key={i} index={i} side="in" />)}</Col>
            <Box id="image" data-testid="node-image" flexGrow={1} minWidth={0} height={116} render={ImagePreview} onClick={() => onSelect('image')} />
            <Col id="outPorts" data-testid="output-ports" gap={12}>{[0, 1, 2].map(i => <Port key={i} index={i} side="out" />)}</Col>
          </Row>
          <LayoutText id="description" data-testid="node-description" text={description} editable onTextChange={setDescription} width="100%" fontSize={12} lineHeight={1.5} fontFamily={font} color="#737b6c" />
        </Col>
      </Row>
      <Row id="actionPanel" data-testid="action-panel" height={40} width="100%" padding={5} gap={8} alignItems="center" fill="#f1f3ed" cornerRadius={8}>
        {['run', 'settings'].map((action, i) => <Box key={action} id={action} data-testid={`node-${action}`} width={30} height={30} fill={i === 0 ? '#d1e5ba' : '#e1e6da'} cornerRadius={5} onClick={() => onSelect(action)} render={() => i === 0 ? <Line points={[12, 9, 21, 15, 12, 21]} closed fill="#496239" /> : <><Line points={[8, 11, 22, 11, 8, 19, 22, 19]} stroke="#64715b" strokeWidth={1.5} /><Circle x={13} y={11} radius={3} fill="#64715b" /><Circle x={18} y={19} radius={3} fill="#64715b" /></>} />)}
        <Box id="action-spacer" flexGrow={1} />
        <LayoutText id="node-id" text="node_01" fontSize={10} fontFamily="monospace" color="#969e8d" />
        <Box id="action-end-space" width={5} />
      </Row>
    </Col>
  </Flex>;
});

function Tile({ index, onSelect, grow = false }: { index: number; onSelect: (id: string) => void; grow?: boolean }) {
  return <Col id={`item-${index}`} data-testid={`item-${index}`} width={grow ? undefined : 144} minWidth={grow ? 0 : 90} height={grow ? undefined : 96} minHeight={96} flexGrow={grow ? 1 : 0} padding={grow ? 12 : 16} gap={10} fill={swatches[index % swatches.length]} cornerRadius={10} onClick={() => onSelect(`item-${index}`)}>
    <LayoutText id={`number-${index}`} text={`0${index + 1}`} fontFamily="monospace" fontSize={11} color="#62715b" />
    <LayoutText id={`name-${index}`} text={['Источник', 'Обработка', 'Результат', 'Маска', 'Метаданные', 'Экспорт'][index % 6]} fontFamily={font} fontSize={14} fontStyle="bold" color="#34422d" />
  </Col>;
}

function flatten(nodes: LayoutNode[]): LayoutNode[] {
  return nodes.flatMap(node => [node, ...flatten(node.children)]);
}

function initialCanvasWidth() {
  return Math.min(720, Math.max(320, Math.floor((window.innerWidth - (window.innerWidth > 760 ? 360 : 56)) / 10) * 10));
}

function TreeRows({ nodes, selected, onSelect, depth = 0 }: { nodes: LayoutNode[]; selected: string; onSelect: (id: string) => void; depth?: number }) {
  return <>{nodes.map(node => <div key={node.id}>
    <button className={`tree-row ${selected === node.id ? 'selected' : ''}`} style={{ paddingLeft: 14 + depth * 15 }} onClick={() => onSelect(node.id)}>
      <span className="tree-branch">{node.children.length ? '⌄' : '·'}</span><span className={`type-icon type-${node.type}`}>{node.type.slice(0, 1).toUpperCase()}</span><span>{node.id}</span><span className="tree-size">{Math.round(node.width)} × {Math.round(node.height)}</span>
    </button>
    <TreeRows nodes={node.children} selected={selected} onSelect={onSelect} depth={depth + 1} />
  </div>)}</>;
}

export default function App() {
  const [scene, setScene] = useState<Scene>('node');
  const [width, setWidth] = useState(initialCanvasWidth);
  const [gap, setGap] = useState(12);
  const [maxWidth, setMaxWidth] = useState(340);
  const [direction, setDirection] = useState<'row' | 'column'>('row');
  const [align, setAlign] = useState<CSSProperties['alignItems']>('center');
  const [justify, setJustify] = useState<CSSProperties['justifyContent']>('center');
  const [columns, setColumns] = useState(3);
  const [count, setCount] = useState(6);
  const [debug, setDebug] = useState(false);
  const [tree, setTree] = useState<LayoutNode[]>([]);
  const [selected, setSelected] = useState('node');
  const [tab, setTab] = useState<'tree' | 'jsx'>('tree');
  const [copied, setCopied] = useState(false);
  const layoutRef = useRef<LayoutCanvasHandle>(null);
  const nodes = flatten(tree);
  const current = nodes.find(node => node.id === selected) ?? tree[0];
  const flexColumns = Math.max(1, Math.floor((width - 64 + gap) / (144 + gap)));
  const rows = direction === 'column' ? count : Math.ceil(count / flexColumns);
  const height = scene === 'node'
    ? Math.max(464, Math.ceil(nodes.find(node => node.id === 'node')?.height ?? 0) + 56)
    : scene === 'grid'
      ? Math.max(464, Math.ceil(nodes.find(node => node.id === 'grid-root')?.height ?? 0))
      : Math.max(464, rows * (96 + gap) - gap + 64);
  const code = scene === 'node' ? `<LayoutCanvas width={${width}} height={${height}} debug={${debug}}>
  <Flex width="100%" height="100%"
    alignItems="center" justifyContent="center">
    <Col maxWidth={${maxWidth}} width="100%" gap={${gap}}>
      <Row><Col>{/* label, title, subtitle */}
        <Row gap={${gap}} alignItems="center">
          <Col>{/* input ports */}</Col>
          <Box flexGrow={1} height={116}
            render={({ width, height }) => <ImagePreview {...{width, height}} />} />
          <Col>{/* output ports */}</Col>
        </Row>
        <LayoutText text="Описание модуля" />
      </Col></Row>
      <Row height={40}>{/* action buttons */}</Row>
    </Col>
  </Flex>
</LayoutCanvas>` : scene === 'flex' ? `<LayoutCanvas width={${width}} height={${height}} debug={${debug}}>
  <Flex width="100%" height="100%" padding={32}
    direction="${direction}" gap={${gap}} flexWrap="wrap"
    alignItems="${align}" justifyContent="${justify}">
    {items.map(item => <Tile key={item.id} {...item} />)}
  </Flex>
</LayoutCanvas>` : `<LayoutCanvas width={${width}} height={${height}} debug={${debug}}>
  <Grid width="100%" padding={32} gap={${gap}}
    gridTemplateColumns="repeat(${columns}, minmax(0, 1fr))">
    {items.map(item => <Tile key={item.id} {...item} />)}
  </Grid>
</LayoutCanvas>`;

  let content: ReactNode;
  if (scene === 'node') content = <NodeExample gap={gap} maxWidth={maxWidth} onSelect={setSelected} />;
  else if (scene === 'flex') content = <Flex id="flex-root" data-testid="flex-root" direction={direction} width="100%" height="100%" padding={32} gap={gap} flexWrap="wrap" alignItems={align} justifyContent={justify}>{Array.from({ length: count }, (_, i) => <Tile key={i} index={i} onSelect={setSelected} />)}</Flex>;
  else content = <Grid id="grid-root" data-testid="grid-root" width="100%" padding={32} gap={gap} gridTemplateColumns={`repeat(${columns}, minmax(0, 1fr))`}>{Array.from({ length: count }, (_, i) => <Tile key={i} index={i} onSelect={setSelected} grow />)}</Grid>;

  function reset() {
    setWidth(initialCanvasWidth()); setGap(12); setMaxWidth(340); setDirection('row'); setAlign('center'); setJustify('center'); setColumns(3); setCount(6); setDebug(false);
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(tab === 'tree' ? JSON.stringify(tree, null, 2) : code);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch { setCopied(false); }
  }

  return <div className="app-shell">
    <header className="topbar">
      <a className="brand" href="./"><span className="brand-icon"><Glyph name="layout" size={21} /></span><span>react-konva<span className="brand-light"> / layout</span></span><span className="version">0.2.0</span></a>
      <a className="repo-link" href="https://github.com/dzenlotus/react-konva-layout" target="_blank" rel="noreferrer"><Glyph name="github" size={17} />GitHub <span>↗</span></a>
    </header>

    <main>
      <section className="intro">
        <div><div className="eyebrow"><span /> BROWSER-NATIVE LAYOUT ENGINE</div><h1>CSS считает. <span>Canvas рисует.</span></h1><p>Двойной клик / тап по description — редактирование. Колесо — zoom, фон — pan.</p></div>
        <div className="pipeline" aria-label="Layout pipeline"><span>HTML / CSS</span><Glyph name="arrow" size={16} /><span>DOMRect</span><Glyph name="arrow" size={16} /><span className="pipeline-final">Konva</span></div>
      </section>

      <div className="workbench">
        <section className="preview-panel" aria-label="Canvas playground">
          <div className="preview-toolbar"><div className="scene-tabs" role="tablist" aria-label="Пример раскладки">{(['node', 'flex', 'grid'] as Scene[]).map(s => <button key={s} role="tab" aria-selected={scene === s} className={scene === s ? 'active' : ''} onClick={() => { setScene(s); setSelected(s === 'node' ? 'node' : `${s}-root`); }}>{s === 'node' ? 'Нода' : s === 'flex' ? 'Flex' : 'Grid'}</button>)}</div><div className="toolbar-actions"><button className="remeasure-button" onClick={() => layoutRef.current?.remeasure()}><Glyph name="reset" size={12} />Пересчитать</button><div className="canvas-caption"><span className="live-dot" />LIVE CANVAS</div></div></div>
          <div className="canvas-viewport">
            <div className="ruler"><span>0</span><span>{Math.round(width / 4)}</span><span>{Math.round(width / 2)}</span><span>{Math.round(width * .75)}</span><span>{width} px</span></div>
            <div className="canvas-scroll"><div className="canvas-frame" style={{ width }}><LayoutCanvas ref={layoutRef} width={width} height={height} debug={debug} panZoom onLayout={setTree}>{content}</LayoutCanvas></div></div>
            <span className="canvas-corner">{debug ? 'HTML BOUNDS / OVERLAY' : 'RENDERED WITH KONVA'}</span>
          </div>
          <div className="preview-status"><span><span className="status-dot" />{nodes.length} элементов измерено</span><span>{width} × {height}<span className="status-divider">/</span>CSS px<span className="status-divider">/</span>getBoundingClientRect()</span></div>
        </section>

        <aside className="inspector" aria-label="Параметры layout">
          <div className="inspector-heading"><div><span className="eyebrow">PLAYGROUND</span><h2>Параметры layout</h2></div><button className="icon-button" title="Сбросить параметры" aria-label="Сбросить параметры" onClick={reset}><Glyph name="reset" size={17} /></button></div>
          <div className="control-section">
            <Label tag="width">Ширина canvas</Label><div className="range-value"><strong>{width}</strong><span>px</span></div><input aria-label="Ширина canvas" type="range" min="320" max="960" step="10" value={width} onChange={e => setWidth(+e.target.value)} /><div className="range-limits"><span>320</span><span>960</span></div>
            <div className="field-spacer"><Label tag="gap">Расстояние</Label><div className="inline-range"><input aria-label="Расстояние gap" type="range" min="0" max="32" step="2" value={gap} onChange={e => setGap(+e.target.value)} /><output>{gap}<span>px</span></output></div></div>
            {scene === 'node' ? <div className="field-spacer"><Label tag="maxWidth">Максимальная ширина ноды</Label><div className="inline-range"><input aria-label="Максимальная ширина ноды" type="range" min="220" max="460" step="10" value={maxWidth} onChange={e => setMaxWidth(+e.target.value)} /><output>{maxWidth}<span>px</span></output></div></div> : null}
            {scene === 'flex' ? <><div className="field-spacer"><Label tag="direction">Направление</Label><div className="segmented">{(['row', 'column'] as const).map(d => <button key={d} className={direction === d ? 'active' : ''} onClick={() => setDirection(d)}>{d === 'row' ? '↔ Row' : '↕ Col'}</button>)}</div></div><div className="select-pair"><label><span>alignItems</span><select value={align} onChange={e => setAlign(e.target.value)}><option value="flex-start">start</option><option value="center">center</option><option value="flex-end">end</option><option value="stretch">stretch</option></select></label><label><span>justifyContent</span><select value={justify} onChange={e => setJustify(e.target.value)}><option value="flex-start">start</option><option value="center">center</option><option value="flex-end">end</option><option value="space-between">space-between</option></select></label></div></> : null}
            {scene === 'grid' ? <div className="field-spacer"><Label tag="columns">Колонки Grid</Label><div className="segmented">{[2, 3, 4].map(n => <button key={n} className={columns === n ? 'active' : ''} onClick={() => setColumns(n)}>{n}</button>)}</div></div> : null}
            {scene !== 'node' ? <div className="field-spacer"><Label tag="children">Элементы</Label><div className="stepper"><button aria-label="Удалить элемент" disabled={count <= 1} onClick={() => setCount(n => n - 1)}>−</button><output>{count}</output><button aria-label="Добавить элемент" disabled={count >= 9} onClick={() => setCount(n => n + 1)}>+</button></div></div> : null}
          </div>
          <div className="overlay-control"><div><strong>Показать layout</strong><p>Границы HTML поверх canvas</p></div><button className={`switch ${debug ? 'on' : ''}`} role="switch" aria-checked={debug} aria-label="Показать layout" onClick={() => setDebug(v => !v)}><span /></button></div>
          <div className="testid-note"><code>DOM detached</code><p>После замера HTML-дерево удаляется из документа. Testid доступны при измерении и в debug.</p></div>
        </aside>
      </div>

      <section className="output-panel" aria-label="Результат измерения">
        <div className="output-main"><div className="output-toolbar"><div className="output-tabs"><button className={tab === 'tree' ? 'active' : ''} onClick={() => setTab('tree')}><Glyph name="layout" size={14} />Layout tree <span>{nodes.length}</span></button><button className={tab === 'jsx' ? 'active' : ''} onClick={() => setTab('jsx')}><Glyph name="code" size={16} />JSX</button></div><button className="copy-button" onClick={copy}><Glyph name="copy" size={14} />{copied ? 'Скопировано' : tab === 'tree' ? 'Copy JSON' : 'Copy JSX'}</button></div>{tab === 'tree' ? <div className="tree-scroll"><TreeRows nodes={tree} selected={current?.id ?? ''} onSelect={setSelected} /></div> : <pre className="code-output"><code>{code}</code></pre>}</div>
        <div className="node-details"><span className="eyebrow">MEASURED BOUNDS</span><h3>{current?.id ?? 'Измеряем…'}</h3><div className="bounds-grid">{(['x', 'y', 'width', 'height'] as const).map(key => <div key={key}><span>{key}</span><strong>{current ? Math.round(current[key] * 100) / 100 : '—'}<small>px</small></strong></div>)}</div><div className="detail-line"><span>absolute</span><code>{current ? `${Math.round(current.absoluteX)}, ${Math.round(current.absoluteY)}` : '—'}</code></div><div className="detail-line testid-detail"><span>testid</span><code>{current?.testId ?? '—'}</code></div><p className="detail-hint">Выберите элемент в дереве или нажмите на изображение, кнопку или плитку на canvas.</p></div>
      </section>
      <footer><span>react-konva-layout <span className="footer-dot">·</span> MIT <span className="footer-dot">·</span> Рабочий прототип</span><a href="?stress=1">Стресс-тест: 1000 нод ↗</a><a href="https://codesandbox.io/p/sandbox/reverent-darwin-sdgd8h?file=/src/App.js" target="_blank" rel="noreferrer">Структура ноды из примера ↗</a></footer>
    </main>
  </div>;
}
