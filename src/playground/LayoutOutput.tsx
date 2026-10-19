import { useEffect, useRef, useState } from 'react';
import type { LayoutElement } from '../lib';
import { Glyph } from './Glyph';

function TreeRows({
  elements,
  selected,
  onSelect,
  depth = 0,
}: {
  elements: LayoutElement[];
  selected: string;
  onSelect: (id: string) => void;
  depth?: number;
}) {
  return (
    <>
      {elements.map((element) => (
        <div key={element.id}>
          <button
            className={`tree-row ${selected === element.id ? 'selected' : ''}`}
            style={{ paddingLeft: 14 + depth * 15 }}
            onClick={() => onSelect(element.id)}
          >
            <span className="tree-branch">{element.children.length ? '⌄' : '·'}</span>
            <span className={`type-icon type-${element.type}`}>
              {element.type.slice(0, 1).toUpperCase()}
            </span>
            <span>{element.id}</span>
            <span className="tree-size">
              {Math.round(element.width)} × {Math.round(element.height)}
            </span>
          </button>
          <TreeRows
            elements={element.children}
            selected={selected}
            onSelect={onSelect}
            depth={depth + 1}
          />
        </div>
      ))}
    </>
  );
}

export function LayoutOutput({
  tree,
  current,
  code,
  elementCount,
  onSelect,
}: {
  tree: LayoutElement[];
  current?: LayoutElement;
  code: string;
  elementCount: number;
  onSelect: (id: string) => void;
}) {
  const [tab, setTab] = useState<'tree' | 'jsx'>('tree');
  const [copied, setCopied] = useState(false);
  const copyTimeout = useRef(0);
  useEffect(() => () => clearTimeout(copyTimeout.current), []);
  async function copy() {
    try {
      await navigator.clipboard.writeText(tab === 'tree' ? JSON.stringify(tree, null, 2) : code);
      setCopied(true);
      clearTimeout(copyTimeout.current);
      copyTimeout.current = window.setTimeout(() => setCopied(false), 1500);
    } catch {
      setCopied(false);
    }
  }

  return (
    <section className="output-panel" aria-label="Результат измерения">
      <div className="output-main">
        <div className="output-toolbar">
          <div className="output-tabs">
            <button className={tab === 'tree' ? 'active' : ''} onClick={() => setTab('tree')}>
              <Glyph name="layout" size={14} />
              Layout tree <span>{elementCount}</span>
            </button>
            <button className={tab === 'jsx' ? 'active' : ''} onClick={() => setTab('jsx')}>
              <Glyph name="code" size={16} />
              JSX
            </button>
          </div>
          <button className="copy-button" onClick={copy}>
            <Glyph name="copy" size={14} />
            {copied ? 'Скопировано' : tab === 'tree' ? 'Copy JSON' : 'Copy JSX'}
          </button>
        </div>
        {tab === 'tree' ? (
          <div className="tree-scroll">
            <TreeRows elements={tree} selected={current?.id ?? ''} onSelect={onSelect} />
          </div>
        ) : (
          <pre className="code-output">
            <code>{code}</code>
          </pre>
        )}
      </div>
      <div className="element-details">
        <span className="eyebrow">MEASURED BOUNDS</span>
        <h3>{current?.id ?? 'Измеряем…'}</h3>
        <div className="bounds-grid">
          {(['x', 'y', 'width', 'height'] as const).map((key) => (
            <div key={key}>
              <span>{key}</span>
              <strong>
                {current ? Math.round(current[key] * 100) / 100 : '—'}
                <small>px</small>
              </strong>
            </div>
          ))}
        </div>
        <div className="detail-line">
          <span>absolute</span>
          <code>
            {current ? `${Math.round(current.absoluteX)}, ${Math.round(current.absoluteY)}` : '—'}
          </code>
        </div>
        <div className="detail-line testid-detail">
          <span>testid</span>
          <code>{current?.testId ?? '—'}</code>
        </div>
        <p className="detail-hint">
          Выберите элемент в дереве или нажмите на изображение, кнопку или плитку на canvas.
        </p>
      </div>
    </section>
  );
}
