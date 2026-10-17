import { memo, useCallback, useEffect, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import Konva from 'konva';
import { Circle, Line, Rect, Text } from 'react-konva';
import { Box, Col, Grid, LayoutCanvas, LayoutText, Row } from './lib';
import type { LayoutCanvasHandle, LayoutNode } from './lib';
import './stress.css';

const COUNT = 1000;
const COLUMNS = 25;
const CARD_WIDTH = 230;
const CARD_HEIGHT = 284;
const WORLD_WIDTH = COLUMNS * CARD_WIDTH + (COLUMNS - 1) * 14 + 40;
const WORLD_HEIGHT = Math.ceil(COUNT / COLUMNS) * CARD_HEIGHT + (Math.ceil(COUNT / COLUMNS) - 1) * 14 + 40;
const EXPECTED_PRIMITIVES = COUNT * 25 + 1;
const FONT = 'Arial';
const attrs = (id: string) => ({ id, 'data-testid': id });
const rounded = (value: number) => Math.round(value * 100) / 100;

export interface StressStats {
  cards: number;
  primitives: number;
  groups: number;
  shapes: number;
  idleHtmlNodes: number;
  attachedMeasurementRoots: number;
  viewportWidth: number;
  viewportHeight: number;
  worldWidth: number;
  worldHeight: number;
  devicePixelRatio: number;
  complete: boolean;
}

export interface StressResult extends StressStats {
  operation: 'mount' | 'resize' | 'remeasure';
  mountToLayoutMs: number;
  totalToCanvasFrameMs: number;
  canvasDrawMs: number;
  forcedRedraw: boolean;
  timestamp: string;
}

interface StressApi {
  run: () => Promise<StressResult>;
  resize: () => Promise<StressResult>;
  remeasure: () => Promise<StressResult>;
  stats: () => StressStats;
  overview: (enabled?: boolean) => void;
}

declare global {
  interface Window { layoutStress?: StressApi }
}

function Preview({ width, height, index }: { width: number; height: number; index: number }) {
  const colors = ['#bbcea9', '#b2c8d5', '#ccb9d2', '#d5c9a5'];
  return <>
    <Rect width={width} height={height} fill="#e7ede1" cornerRadius={6} />
    <Circle x={width * .76} y={height * .27} radius={11} fill="#fafcf5" />
    <Line points={[0, height, 0, height * .8, width * .32, height * .3, width * .76, height]} fill={colors[index % colors.length]} closed />
    <Line points={[0, height, width * .68, height * .42, width, height * .8, width, height]} fill="#718667" closed />
    <Text x={8} y={height - 16} text={`FRAME ${String(index + 1).padStart(4, '0')}`} fontFamily={FONT} fontSize={8} fill="#fff" />
  </>;
}

function StressCard({ index }: { index: number }) {
  const prefix = `stress-node-${String(index).padStart(4, '0')}`;
  const prop = (suffix: string) => attrs(`${prefix}-${suffix}`);
  return <Col {...prop('card')} width="100%" minWidth={0} height={CARD_HEIGHT} padding={12} gap={8} justifyContent="space-between" fill="#fff" stroke="#d5ddcb" strokeWidth={1} cornerRadius={9}>
    <Row {...prop('heading')} width="100%" gap={8} alignItems="center">
      <Box {...prop('icon')} width={22} height={22} flexShrink={0} render={() => <><Circle x={11} y={11} radius={10} fill="#e7efda" /><Line points={[6, 12, 10, 16, 16, 7]} stroke="#6b874c" strokeWidth={1.6} /></>} />
      <Col {...prop('titles')} flexGrow={1} minWidth={0} gap={3}>
        <LayoutText {...prop('label')} text="IMAGE PROCESSING" fontSize={8} fontFamily={FONT} fontStyle="bold" color="#798d69" />
        <LayoutText {...prop('title')} text={`Image transform ${String(index + 1).padStart(4, '0')}`} fontSize={15} fontFamily={FONT} fontStyle="bold" color="#2b3725" />
      </Col>
    </Row>
    <LayoutText {...prop('subtitle')} text="Нормализация входящего изображения" fontSize={9} fontFamily={FONT} color="#8a9481" />
    <Row {...prop('figure')} width="100%" height={92} gap={8} alignItems="center">
      <Col {...prop('input-ports')} gap={14} flexShrink={0}>{[0, 1, 2].map(port => <Box key={port} {...prop(`input-${port}`)} width={12} height={12} render={() => <Circle x={6} y={6} radius={5} fill="#d3dfc5" stroke="#92a580" strokeWidth={1} />} />)}</Col>
      <Box {...prop('preview')} height={92} flexGrow={1} minWidth={0} render={({ width, height }) => <Preview {...{ width, height, index }} />} />
      <Col {...prop('output-ports')} gap={14} flexShrink={0}>{[0, 1, 2].map(port => <Box key={port} {...prop(`output-${port}`)} width={12} height={12} render={() => <Circle x={6} y={6} radius={5} fill="#d3dfc5" stroke="#92a580" strokeWidth={1} />} />)}</Col>
    </Row>
    <LayoutText {...prop('description')} text="Этот модуль обрабатывает изображение. Переносы текста и вложенную раскладку рассчитывает браузер." width="100%" height={42} fontSize={10} lineHeight={1.4} fontFamily={FONT} color="#7b8771" />
    <Row {...prop('actions')} height={32} width="100%" padding={4} gap={6} alignItems="center" fill="#f0f4e9" cornerRadius={6}>
      <Box {...prop('run')} width={24} height={24} fill="#d2e6ba" cornerRadius={4} render={() => <Line points={[9, 6, 17, 12, 9, 18]} fill="#58733e" closed />} />
      <Box {...prop('settings')} width={24} height={24} fill="#e0e7d8" cornerRadius={4} render={() => <><Line points={[5, 8, 19, 8, 5, 16, 19, 16]} stroke="#7d8d6f" strokeWidth={1.2} /><Circle x={10} y={8} radius={2.5} fill="#6c7e5d" /></>} />
      <Box {...prop('spacer')} flexGrow={1} />
      <Row {...prop('status')} gap={4} alignItems="center">
        <Box {...prop('status-dot')} width={5} height={5} render={() => <Circle x={2.5} y={2.5} radius={2.5} fill="#86a962" />} />
        <LayoutText {...prop('status-text')} text={`node_${String(index + 1).padStart(4, '0')}`} fontSize={8} fontFamily="monospace" color="#8e9c81" />
      </Row>
    </Row>
  </Col>;
}

const StressScene = memo(function StressScene({ worldWidth }: { worldWidth: number }) {
  return <Grid {...attrs('stress-world')} width={worldWidth} padding={20} gap={14} gridTemplateColumns={`repeat(${COLUMNS}, minmax(0, 1fr))`}>
    {Array.from({ length: COUNT }, (_, index) => <StressCard key={index} index={index} />)}
  </Grid>;
});

function countTree(nodes: LayoutNode[]): number {
  let count = 0;
  for (const node of nodes) count += 1 + countTree(node.children);
  return count;
}

interface Pending {
  operation: StressResult['operation'];
  startedAt: number;
  layoutAt: number | null;
  drawMs: number | null;
  drawFinishedAt: number | null;
  resolve: (result: StressResult) => void;
  reject: (error: Error) => void;
  timeout: number;
}

export default function StressApp() {
  const [config, setConfig] = useState({ generation: 0, width: 1400, worldWidth: WORLD_WIDTH, mounted: false });
  const [busy, setBusy] = useState(false);
  const [results, setResults] = useState<StressResult[]>([]);
  const [error, setError] = useState('');
  const [overview, setOverview] = useState(false);
  const holder = useRef<HTMLDivElement>(null);
  const layout = useRef<LayoutCanvasHandle>(null);
  const configRef = useRef(config);
  const pending = useRef<Pending | null>(null);
  const preparing = useRef(false);
  const primitiveCount = useRef(0);
  const frame = useRef(0);
  configRef.current = config;

  const stage = useCallback(() => Konva.stages.find(item => holder.current?.contains(item.container())), []);

  const stats = useCallback((): StressStats => {
    const current = stage();
    const groups = current?.find('Group') ?? [];
    const cards = groups.filter(node => /^stress-node-\d+-card$/.test(node.id())).length;
    const shapes = current?.find('Shape').length ?? 0;
    const idleHtmlNodes = holder.current?.querySelectorAll('.konva-layout-node').length ?? 0;
    const attachedMeasurementRoots = holder.current?.querySelectorAll('.konva-layout-measure').length ?? 0;
    return {
      cards, primitives: primitiveCount.current, groups: groups.length, shapes, idleHtmlNodes,
      attachedMeasurementRoots,
      viewportWidth: configRef.current.width, viewportHeight: 760,
      worldWidth: configRef.current.worldWidth, worldHeight: WORLD_HEIGHT,
      devicePixelRatio: window.devicePixelRatio,
      complete: cards === COUNT && primitiveCount.current === EXPECTED_PRIMITIVES && groups.length === EXPECTED_PRIMITIVES && shapes === COUNT * 26 && idleHtmlNodes === 0 && attachedMeasurementRoots === 0,
    };
  }, [stage]);

  const fail = useCallback((reason: string) => {
    const job = pending.current;
    if (!job) return;
    pending.current = null;
    window.clearTimeout(job.timeout);
    cancelAnimationFrame(frame.current);
    setBusy(false);
    setError(reason);
    job.reject(new Error(reason));
  }, []);

  const finish = useCallback(() => {
    const job = pending.current;
    if (!job || job.layoutAt === null || job.drawMs === null) return;
    // Record the frame boundary before counting the Konva tree (diagnostics are excluded).
    const frameAt = performance.now();
    const snapshot = stats();
    if (!snapshot.complete) { fail('Неполная сцена: ожидались 1000 карточек, 25001 групп и 26000 фигур.'); return; }
    const result: StressResult = {
      ...snapshot, operation: job.operation,
      mountToLayoutMs: rounded(job.layoutAt - job.startedAt),
      canvasDrawMs: rounded(job.drawMs),
      forcedRedraw: job.operation === 'remeasure',
      totalToCanvasFrameMs: rounded(frameAt - job.startedAt),
      timestamp: new Date().toISOString(),
    };
    pending.current = null;
    window.clearTimeout(job.timeout);
    setBusy(false);
    setResults(previous => [...previous.slice(-19), result]);
    job.resolve(result);
  }, [fail, stats]);

  const onLayout = useCallback((tree: LayoutNode[]) => {
    const at = performance.now();
    primitiveCount.current = countTree(tree);
    if (pending.current && primitiveCount.current === EXPECTED_PRIMITIVES) pending.current.layoutAt ??= at;
  }, []);

  const setWorldView = useCallback((enabled = true) => {
    if (pending.current) throw new Error('Дождитесь окончания замера перед сменой масштаба.');
    const current = stage();
    if (!current) return;
    const worldWidth = configRef.current.worldWidth;
    const scale = enabled ? Math.min(current.width() / worldWidth, current.height() / WORLD_HEIGHT) : 1;
    current.scale({ x: scale, y: scale });
    current.position({ x: enabled ? (current.width() - worldWidth * scale) / 2 : 0, y: 0 });
    current.draw();
    setOverview(enabled);
  }, [stage]);

  const start = useCallback(async (operation: StressResult['operation']): Promise<StressResult> => {
    if (pending.current || preparing.current) return Promise.reject(new Error('Замер уже выполняется.'));
    if (operation !== 'mount' && !configRef.current.mounted) return Promise.reject(new Error('Сначала запустите 1000 нод.'));
    setError('');
    setOverview(false);
    preparing.current = true;
    setBusy(true);
    if (operation === 'mount' && configRef.current.mounted) {
      // Destroy the previous scene outside the fresh-mount interval.
      flushSync(() => setConfig(previous => ({ ...previous, mounted: false })));
      await new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
    }
    const current = stage();
    current?.scale({ x: 1, y: 1 });
    current?.position({ x: 0, y: 0 });
    preparing.current = false;
    return new Promise((resolve, reject) => {
      const startedAt = performance.now();
      pending.current = {
        operation, startedAt, layoutAt: null, drawMs: null, drawFinishedAt: null, resolve, reject,
        timeout: window.setTimeout(() => fail('Замер превысил 60 секунд. Состояние сцены доступно через layoutStress.stats().'), 60_000),
      };
      setBusy(true);
      if (operation === 'mount') {
        primitiveCount.current = 0;
        setConfig(previous => ({ generation: previous.generation + 1, width: 1400, worldWidth: WORLD_WIDTH, mounted: true }));
      } else if (operation === 'resize') {
        setConfig(previous => ({ ...previous, width: previous.width === 1400 ? 1160 : 1400, worldWidth: previous.worldWidth === WORLD_WIDTH ? WORLD_WIDTH - 500 : WORLD_WIDTH }));
      } else layout.current?.remeasure();
    });
  }, [fail, stage]);

  useEffect(() => {
    const originalDraw = Konva.Layer.prototype.draw;
    // Node.draw runs both drawScene and drawHit; the Layer "draw" event alone omits hit drawing.
    Konva.Layer.prototype.draw = function measuredDraw() {
      const job = pending.current;
      const current = this.getStage();
      const root = this.getChildren()[0];
      const cardWidth = (configRef.current.worldWidth - 40 - (COLUMNS - 1) * 14) / COLUMNS;
      const isCompleteScene = current && holder.current?.contains(current.container())
        && root instanceof Konva.Group && root.id() === 'stress-world' && root.getChildren().length === COUNT
        && Math.abs(root.width() - configRef.current.worldWidth) < .1
        && Math.abs(root.getChildren()[0].width() - cardWidth) < .1
        && Math.abs(root.getChildren()[COUNT - 1].width() - cardWidth) < .1;
      const eligible = job && job.layoutAt !== null && job.drawMs === null && isCompleteScene;
      const before = eligible ? performance.now() : 0;
      const returned = originalDraw.call(this);
      if (eligible && pending.current === job) {
        job.drawFinishedAt = performance.now();
        job.drawMs = job.drawFinishedAt - before;
        frame.current = requestAnimationFrame(finish);
      }
      return returned;
    };
    const observer = new MutationObserver(records => {
      const job = pending.current;
      if (!job || job.operation !== 'remeasure' || job.drawMs !== null) return;
      if (records.some(record => record.type === 'attributes' && record.attributeName === 'data-layout-state' && record.oldValue === 'measuring')) {
        job.layoutAt ??= performance.now();
        // Equal geometry intentionally produces no core onLayout callback or automatic redraw.
        frame.current = requestAnimationFrame(() => stage()?.getLayers()[0]?.draw());
      }
    });
    if (holder.current) observer.observe(holder.current, { subtree: true, attributes: true, attributeOldValue: true, attributeFilter: ['data-layout-state'] });
    const api: StressApi = { run: () => start('mount'), resize: () => start('resize'), remeasure: () => start('remeasure'), stats, overview: setWorldView };
    window.layoutStress = api;
    return () => {
      observer.disconnect();
      Konva.Layer.prototype.draw = originalDraw;
      if (window.layoutStress === api) delete window.layoutStress;
      if (pending.current) {
        window.clearTimeout(pending.current.timeout);
        pending.current.reject(new Error('Страница stress benchmark закрыта.'));
        pending.current = null;
      }
      cancelAnimationFrame(frame.current);
    };
  }, [finish, setWorldView, stage, start, stats]);

  const invoke = (operation: StressResult['operation']) => { void start(operation).catch(reason => setError(String(reason.message ?? reason))); };
  const last = results.at(-1);
  return <div className="stress-shell">
    <header className="stress-header"><a href="./">react-konva <span>/ layout</span></a><span>PERFORMANCE LAB <i /> {import.meta.env.PROD ? 'PRODUCTION BENCHMARK' : 'DEVELOPMENT / ДЛЯ ЗАМЕРОВ НУЖЕН BUILD'}</span></header>
    <main className="stress-main">
      <section className="stress-intro"><div><p className="stress-eyebrow">NATIVE CSS → DOMRECT → KONVA</p><h1>1 000 сложных нод.</h1><p>Вложенные Row / Col, текст, 6 портов, превью и две кнопки в каждой карточке.</p></div><a href="./">← Вернуться в playground</a></section>
      <div className="stress-controls"><div><strong>25 001</strong><span>layout primitives</span></div><div><strong>51 001</strong><span>Konva groups + shapes</span></div><div><strong>{config.worldWidth.toLocaleString('ru')} × 11 946</strong><span>логическая сцена / px</span></div><div className="stress-buttons"><button disabled={busy} className="stress-primary" onClick={() => invoke('mount')}>{busy ? 'Измеряем…' : config.mounted ? 'Повторить монтаж' : 'Запустить 1000 нод'}</button><button disabled={busy || !config.mounted} onClick={() => invoke('remeasure')}>Пересчитать</button><button disabled={busy || !config.mounted} onClick={() => invoke('resize')}>Resize</button></div></div>
      <section className="stress-preview" aria-label="Стресс сцена Konva"><div className="stress-preview-bar"><span><i />{busy ? 'MEASURING + RENDERING' : config.mounted ? 'ALL 1000 NODES INSTANCED' : 'READY TO MEASURE'}</span><button disabled={busy || !config.mounted} onClick={() => setWorldView(!overview)}>{overview ? 'Масштаб 1:1' : 'Показать все 1000'}</button><code>{config.width} × 760 canvas</code></div><div className="stress-canvas-scroll"><div ref={holder} data-stress-canvas className="stress-canvas-holder" style={{ width: config.width, height: 760 }}>{config.mounted ? <LayoutCanvas key={config.generation} ref={layout} width={config.width} height={760} onLayout={onLayout}><StressScene worldWidth={config.worldWidth} /></LayoutCanvas> : <div className="stress-empty"><span>1 000</span><p>Один полный монтаж. Без виртуализации.</p></div>}</div></div></section>
      {error ? <p className="stress-error" role="alert">{error}</p> : null}
      <section className="stress-results" aria-label="Результаты benchmark"><div className="stress-result-heading"><h2>Фактические замеры</h2><span>{last ? `${last.cards} карточек · ${last.groups.toLocaleString('ru')} групп · ${last.shapes.toLocaleString('ru')} фигур · HTML в документе: ${last.idleHtmlNodes}` : 'Результат появится после полного кадра canvas'}</span></div><div className="stress-metrics"><div><span>Начало → layout / callback</span><strong>{last ? last.mountToLayoutMs.toLocaleString('ru') : '—'}<small>ms</small></strong></div><div><span>Layer.draw() / scene + hit</span><strong>{last ? last.canvasDrawMs.toLocaleString('ru') : '—'}<small>ms</small></strong></div><div><span>Начало → кадр после draw</span><strong>{last ? last.totalToCanvasFrameMs.toLocaleString('ru') : '—'}<small>ms</small></strong></div></div><p className="stress-definitions">Монтаж включает создание React / HTML, CSS layout, чтение bounds и передачу сцены в Konva. Последний показатель заканчивается на requestAnimationFrame после полного draw; это граница кадра, а не измерение физического показа пикселей. Пересчёт включает принудительный redraw после измерения неизменной сцены; в обычном режиме библиотека его пропускает. Resize меняет ширину Grid и всех 1000 карточек.</p>{results.length ? <div className="stress-table-wrap"><table><thead><tr><th>Прогон</th><th>Операция</th><th>До layout</th><th>Draw</th><th>До кадра</th><th>Полнота сцены</th></tr></thead><tbody>{results.map((result, index) => <tr key={result.timestamp}><td>{String(index + 1).padStart(2, '0')}</td><td>{result.operation}{result.forcedRedraw ? ' + redraw' : ''}</td><td>{result.mountToLayoutMs} ms</td><td>{result.canvasDrawMs} ms</td><td>{result.totalToCanvasFrameMs} ms</td><td>{result.complete ? '1000 / 1000 · HTML 0' : 'Неполная'}</td></tr>)}</tbody></table></div> : null}</section>
      <footer className="stress-footer"><span>25 колонок × 40 рядов. Все группы и фигуры рисуются, включая находящиеся за viewport.</span><span>HTML остаётся в отсоединённом portal · DPR {window.devicePixelRatio}</span></footer>
    </main>
  </div>;
}
