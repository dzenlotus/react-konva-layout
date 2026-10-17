import { DemoCanvas } from './examples/DemoCanvas';
import type { PerformanceOptions } from './lib';
import { DesignedStressScene, EXPECTED_PRIMITIVES } from './examples/DesignedStressScene';
import { useStressBenchmark } from './stress/useStressBenchmark';
import { StressResults } from './stress/StressResults';
import type { Mode } from './stress/types';
import './stress.css';

export type { StressStats, StressResult } from './stress/types';

const OPTIMIZED: PerformanceOptions = {
  enabled: true,
  compact: true,
  cull: true,
  cache: true,
  cacheBudgetMB: 32,
  cachePixelRatio: 'auto',
  lodScale: 0.3,
  overscan: 100,
};
const BASELINE: PerformanceOptions = { enabled: false };

export default function StressApp() {
  const {
    previewImage,
    cameraResults,
    config,
    selectedMode,
    setSelectedMode,
    busy,
    results,
    error,
    overview,
    view,
    lastMeasure,
    holder,
    layout,
    onLayout,
    onMeasure,
    onRenderStats,
    setView,
    invoke,
    zoomCentered,
    setWorldView,
    runCamera,
  } = useStressBenchmark();
  return (
    <div className="stress-shell">
      <header className="stress-header">
        <a href="./">
          react-konva <span>/ layout</span>
        </a>
        <span>
          PERFORMANCE LAB <i /> {import.meta.env.PROD ? 'PRODUCTION' : 'DEVELOPMENT'} / CAMERA +
          LOCAL LAYOUT
        </span>
      </header>
      <main className="stress-main">
        <section className="stress-intro">
          <div>
            <p className="stress-eyebrow">BROWSER LAYOUT → VISIBLE CANVAS → LOCAL EDIT</p>
            <h1>1 000 нод с новым дизайном.</h1>
            <p>
              Колесо — zoom к курсору. Фон — pan. Двойной клик или тап по description —
              редактирование.
            </p>
          </div>
          <a href="./">← Playground</a>
        </section>
        <div className="stress-controls">
          <div>
            <strong>{EXPECTED_PRIMITIVES.toLocaleString('ru-RU')}</strong>
            <span>элементов в layout tree</span>
          </div>
          <div>
            <strong>{Math.round(view.scale * 100)}%</strong>
            <span>zoom / камера без HTML layout</span>
          </div>
          <div className="stress-buttons">
            <select
              aria-label="Режим производительности"
              value={selectedMode}
              disabled={busy}
              onChange={(e) => setSelectedMode(e.target.value as Mode)}
            >
              <option value="optimized">Optimized</option>
              <option value="baseline">Baseline / все объекты</option>
            </select>
            <button disabled={busy} className="stress-primary" onClick={() => invoke('mount')}>
              {busy ? 'Измеряем…' : 'Новый монтаж'}
            </button>
            <button disabled={busy || !config.mounted} onClick={() => invoke('remeasure')}>
              Layout
            </button>
            <button disabled={busy || !config.mounted} onClick={() => invoke('resize')}>
              Resize
            </button>
            <button disabled={busy || !config.mounted} onClick={() => invoke('edit')}>
              Edit description
            </button>
          </div>
        </div>
        <section className="stress-preview" aria-label="Стресс сцена Konva">
          <div className="stress-preview-bar">
            <span>
              <i />
              {busy ? 'MEASURING' : config.mounted ? config.mode.toUpperCase() : 'READY'}
            </span>
            <div className="stress-camera-buttons">
              <button disabled={busy || !config.mounted} onClick={() => zoomCentered(1.25)}>
                +
              </button>
              <button disabled={busy || !config.mounted} onClick={() => zoomCentered(1 / 1.25)}>
                −
              </button>
              <button disabled={busy || !config.mounted} onClick={() => setWorldView(!overview)}>
                {overview ? '1:1' : 'Все 1000 / LOD'}
              </button>
              <button disabled={busy || !config.mounted} onClick={() => setWorldView(false)}>
                Сброс камеры
              </button>
            </div>
            <code>{config.width} × 760</code>
          </div>
          <div className="stress-canvas-scroll">
            <div
              ref={holder}
              data-stress-canvas
              className="stress-canvas-holder"
              style={{ width: config.width, height: 760 }}
            >
              {config.mounted && previewImage ? (
                <DemoCanvas
                  key={config.generation}
                  ref={layout}
                  width={config.width}
                  height={760}
                  panZoom={!busy}
                  performance={config.mode === 'optimized' ? OPTIMIZED : BASELINE}
                  onLayout={onLayout}
                  onMeasure={onMeasure}
                  onRenderStats={onRenderStats}
                  onViewChange={setView}
                >
                  <DesignedStressScene worldWidth={config.worldWidth} previewImage={previewImage} />
                </DemoCanvas>
              ) : (
                <div className="stress-empty">
                  <span>1 000</span>
                  <p>Выберите режим и запустите сцену.</p>
                </div>
              )}
            </div>
          </div>
        </section>
        {error ? (
          <p className="stress-error" role="alert">
            {error}
          </p>
        ) : null}
        <StressResults
          results={results}
          cameraResults={cameraResults}
          lastMeasure={lastMeasure}
          busy={busy}
          mounted={config.mounted}
          runCamera={runCamera}
        />
        <footer className="stress-footer">
          <span>
            Ноды расположены независимо; Flex внутри рассчитывает браузер. Размер описания может
            менять высоту только своей ноды.
          </span>
          <span>Кеш ≤32 MB · DPR устройства · одна общая декодированная фотография</span>
        </footer>
      </main>
    </div>
  );
}
