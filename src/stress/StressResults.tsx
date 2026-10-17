import type { LayoutMetrics } from '../lib';
import type { CameraKind, CameraResult } from '../benchmarks/camera';
import type { StressResult } from './types';

export function StressResults({
  results,
  cameraResults,
  lastMeasure,
  busy,
  mounted,
  runCamera,
}: {
  results: StressResult[];
  cameraResults: CameraResult[];
  lastMeasure: LayoutMetrics | null;
  busy: boolean;
  mounted: boolean;
  runCamera: (kind: CameraKind) => void;
}) {
  const last = results.at(-1);
  return (
    <section className="stress-results">
      <div className="stress-result-heading">
        <h2>Фактические замеры</h2>
        <span>
          {last
            ? 'Последний замер: ' +
              last.cards +
              ' в модели · ' +
              last.renderedCards +
              ' смонтировано · ' +
              last.groups +
              ' групп · ' +
              last.shapes +
              ' фигур · HTML ' +
              last.idleHtmlNodes
            : 'Таймер заканчивается после полного Layer.draw + следующий RAF'}
        </span>
      </div>
      <div className="stress-metrics">
        <div>
          <span>Начало → layout</span>
          <strong>
            {last?.mountToLayoutMs ?? '—'}
            <small>ms</small>
          </strong>
        </div>
        <div>
          <span>Draw / scene + hit</span>
          <strong>
            {last?.canvasDrawMs ?? '—'}
            <small>ms</small>
          </strong>
        </div>
        <div>
          <span>Начало → кадр</span>
          <strong>
            {last?.totalToCanvasFrameMs ?? '—'}
            <small>ms</small>
          </strong>
        </div>
      </div>
      <p className="stress-definitions">
        Последний layout: {lastMeasure?.scope ?? '—'} · прочитано {lastMeasure?.measuredNodes ?? 0}{' '}
        элементов · корни: {lastMeasure?.measuredRoots.join(', ') || '—'} · template hits{' '}
        {lastMeasure?.templateHits ?? 0}.{' '}
        {lastMeasure ? Math.round(lastMeasure.durationMs * 100) / 100 + ' ms' : ''}
        <br />
        Модель хранит все 1000 карточек. Optimized монтирует видимые с запасом, использует кеш и
        LOD. Измерительный HTML отсутствует в документе в покое. HTML редактора существует только во
        время ввода; Cmd/Ctrl+Enter — сохранить, Escape — отменить.
      </p>
      <p className="stress-definitions">
        Фото и шрифты готовы до запуска таймера первого монтажа. FPS измеряется по 5-секундной
        траектории после 1 секунды прогрева; Layer.draw считается отдельно от RAF.
      </p>
      <div className="stress-buttons">
        {(['pan', 'zoom', 'overview'] as CameraKind[]).map((kind) => (
          <button key={kind} disabled={busy || !mounted} onClick={() => runCamera(kind)}>
            FPS {kind}
          </button>
        ))}
      </div>
      {cameraResults.length > 0 && (
        <div className="stress-table-wrap">
          <table>
            <thead>
              <tr>
                <th>Камера</th>
                <th>RAF FPS</th>
                <th>Кадры с draw / s</th>
                <th>P95 кадра</th>
                <th>Кадры &gt;20 ms</th>
                <th>HTML / layout</th>
                <th>Кеш пик MB</th>
              </tr>
            </thead>
            <tbody>
              {cameraResults.map((result, index) => (
                <tr key={index}>
                  <td>{result.kind}</td>
                  <td>{result.fps.toFixed(1)}</td>
                  <td>{result.renderedFps.toFixed(1)}</td>
                  <td>{result.p95Ms.toFixed(1)} ms</td>
                  <td>{result.overBudgetPercent.toFixed(1)}%</td>
                  <td>
                    {result.maxHtmlNodes} / {result.layoutPasses}
                  </td>
                  <td>{(result.maxCacheBytes / 1024 / 1024).toFixed(1)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {results.length ? (
        <div className="stress-table-wrap">
          <table>
            <thead>
              <tr>
                <th>Прогон</th>
                <th>Режим / операция</th>
                <th>До layout</th>
                <th>Draw</th>
                <th>До кадра</th>
                <th>Измерено / область</th>
                <th>Konva объекты</th>
              </tr>
            </thead>
            <tbody>
              {results.map((result, index) => (
                <tr key={result.timestamp}>
                  <td>{index + 1}</td>
                  <td>
                    {result.mode} / {result.operation}
                  </td>
                  <td>{result.mountToLayoutMs} ms</td>
                  <td>{result.canvasDrawMs} ms</td>
                  <td>{result.totalToCanvasFrameMs} ms</td>
                  <td>
                    {result.measurement
                      ? result.measurement.measuredNodes + ' / ' + result.measurement.scope
                      : '0 / camera'}
                  </td>
                  <td>
                    {result.groups + result.shapes} · HTML {result.idleHtmlNodes}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </section>
  );
}
