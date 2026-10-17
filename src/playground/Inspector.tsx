import { Glyph } from './Glyph';
import type { PlaygroundSettings, Scene } from './settings';

function Label({ children, tag }: { children: string; tag?: string }) {
  return (
    <div className="field-label">
      <span>{children}</span>
      {tag ? <code>{tag}</code> : null}
    </div>
  );
}

export function Inspector({
  scene,
  settings,
  onChange,
  reset,
}: {
  scene: Scene;
  settings: PlaygroundSettings;
  onChange: (changes: Partial<PlaygroundSettings>) => void;
  reset: () => void;
}) {
  const { width, gap, maxWidth, direction, align, justify, columns, count, debug } = settings;
  return (
    <aside className="inspector" aria-label="Параметры layout">
      <div className="inspector-heading">
        <div>
          <span className="eyebrow">PLAYGROUND</span>
          <h2>Параметры layout</h2>
        </div>
        <button
          className="icon-button"
          title="Сбросить параметры"
          aria-label="Сбросить параметры"
          onClick={reset}
        >
          <Glyph name="reset" size={17} />
        </button>
      </div>
      <div className="control-section">
        <Label tag="width">Ширина canvas</Label>
        <div className="range-value">
          <strong>{width}</strong>
          <span>px</span>
        </div>
        <input
          aria-label="Ширина canvas"
          type="range"
          min="320"
          max="960"
          step="10"
          value={width}
          onChange={(e) => onChange({ width: +e.target.value })}
        />
        <div className="range-limits">
          <span>320</span>
          <span>960</span>
        </div>
        <div className="field-spacer">
          <Label tag="gap">Расстояние</Label>
          <div className="inline-range">
            <input
              aria-label="Расстояние gap"
              type="range"
              min="0"
              max="32"
              step="2"
              value={gap}
              onChange={(e) => onChange({ gap: +e.target.value })}
            />
            <output>
              {gap}
              <span>px</span>
            </output>
          </div>
        </div>
        {scene === 'node' ? (
          <div className="field-spacer">
            <Label tag="maxWidth">Максимальная ширина ноды</Label>
            <div className="inline-range">
              <input
                aria-label="Максимальная ширина ноды"
                type="range"
                min="220"
                max="460"
                step="10"
                value={maxWidth}
                onChange={(e) => onChange({ maxWidth: +e.target.value })}
              />
              <output>
                {maxWidth}
                <span>px</span>
              </output>
            </div>
          </div>
        ) : null}
        {scene === 'flex' ? (
          <>
            <div className="field-spacer">
              <Label tag="direction">Направление</Label>
              <div className="segmented">
                {(['row', 'column'] as const).map((d) => (
                  <button
                    key={d}
                    className={direction === d ? 'active' : ''}
                    onClick={() => onChange({ direction: d })}
                  >
                    {d === 'row' ? '↔ Row' : '↕ Col'}
                  </button>
                ))}
              </div>
            </div>
            <div className="select-pair">
              <label>
                <span>alignItems</span>
                <select value={align} onChange={(e) => onChange({ align: e.target.value })}>
                  <option value="flex-start">start</option>
                  <option value="center">center</option>
                  <option value="flex-end">end</option>
                  <option value="stretch">stretch</option>
                </select>
              </label>
              <label>
                <span>justifyContent</span>
                <select value={justify} onChange={(e) => onChange({ justify: e.target.value })}>
                  <option value="flex-start">start</option>
                  <option value="center">center</option>
                  <option value="flex-end">end</option>
                  <option value="space-between">space-between</option>
                </select>
              </label>
            </div>
          </>
        ) : null}
        {scene === 'grid' ? (
          <div className="field-spacer">
            <Label tag="columns">Колонки Grid</Label>
            <div className="segmented">
              {[2, 3, 4].map((n) => (
                <button
                  key={n}
                  className={columns === n ? 'active' : ''}
                  onClick={() => onChange({ columns: n })}
                >
                  {n}
                </button>
              ))}
            </div>
          </div>
        ) : null}
        {scene !== 'node' ? (
          <div className="field-spacer">
            <Label tag="children">Элементы</Label>
            <div className="stepper">
              <button
                aria-label="Удалить элемент"
                disabled={count <= 1}
                onClick={() => onChange({ count: count - 1 })}
              >
                −
              </button>
              <output>{count}</output>
              <button
                aria-label="Добавить элемент"
                disabled={count >= 9}
                onClick={() => onChange({ count: count + 1 })}
              >
                +
              </button>
            </div>
          </div>
        ) : null}
      </div>
      <div className="overlay-control">
        <div>
          <strong>Показать layout</strong>
          <p>Границы HTML поверх canvas</p>
        </div>
        <button
          className={`switch ${debug ? 'on' : ''}`}
          role="switch"
          aria-checked={debug}
          aria-label="Показать layout"
          onClick={() => onChange({ debug: !debug })}
        >
          <span />
        </button>
      </div>
      <div className="testid-note">
        <code>DOM detached</code>
        <p>
          После замера HTML-дерево удаляется из документа. Testid доступны при измерении и в debug.
        </p>
      </div>
    </aside>
  );
}
