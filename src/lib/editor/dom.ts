import type Konva from 'konva';
import type { TextStyle } from '../model';
import type { LayoutNode } from '../types';

/** The overlay inherits CSS transforms from the caller's Stage container. */
export function createEditorElements(document: Document, value: string) {
  const root = document.createElement('div');
  const textarea = document.createElement('textarea');
  root.dataset.layoutTextEditor = 'true';
  Object.assign(root.style, {
    position: 'absolute',
    inset: '0',
    overflow: 'hidden',
    pointerEvents: 'none',
    zIndex: '10',
  });
  textarea.dataset.testid = 'layout-text-editor';
  textarea.setAttribute('aria-label', 'Edit text');
  textarea.rows = 1;
  textarea.spellcheck = true;
  textarea.value = value;
  Object.assign(textarea.style, {
    position: 'absolute',
    left: '0',
    top: '0',
    margin: '0',
    border: '0',
    boxSizing: 'border-box',
    transformOrigin: '0 0',
    resize: 'none',
    overflow: 'hidden',
    background: 'transparent',
    outline: '2px solid #2563eb',
    outlineOffset: '2px',
    borderRadius: '2px',
    pointerEvents: 'auto',
    userSelect: 'text',
    minWidth: '1px',
    maxWidth: 'none',
    maxHeight: 'none',
  });
  root.appendChild(textarea);
  return { root, textarea };
}

export function resizeEditor(
  textarea: HTMLTextAreaElement,
  target: Konva.Text,
  node: LayoutNode,
  style: TextStyle,
): void {
  const minimum = Math.max(
    1,
    node.height,
    target.height() + style.paddingTop + style.paddingBottom,
  );
  textarea.style.height = '0px';
  textarea.style.height = `${Math.max(minimum, textarea.scrollHeight)}px`;
}

/** Match the native Text's content inset, typography and complete Konva transform. */
export function syncEditorStyles(
  textarea: HTMLTextAreaElement,
  target: Konva.Text,
  stage: Konva.Stage,
  view: Window,
  style: TextStyle,
): void {
  const css = view.getComputedStyle(stage.content);
  const scaleX = (parseFloat(css.width) || stage.width()) / (stage.width() || 1);
  const scaleY = (parseFloat(css.height) || stage.height()) / (stage.height() || 1);
  const [a, b, c, d, e, f] = target.getAbsoluteTransform().getMatrix();
  const { paddingLeft, paddingTop, paddingRight, paddingBottom } = style;
  const nativePadding = target.padding();
  const fontStyle = target.fontStyle();
  const fill = target.fill();
  const wrap = target.wrap();

  Object.assign(textarea.style, {
    transform: `matrix(${a * scaleX}, ${b * scaleY}, ${c * scaleX}, ${d * scaleY}, ${(e - a * paddingLeft - c * paddingTop) * scaleX}, ${(f - b * paddingLeft - d * paddingTop) * scaleY})`,
    width: `${Math.max(1, target.width() + paddingLeft + paddingRight)}px`,
    fontFamily: target.fontFamily(),
    fontSize: `${target.fontSize()}px`,
    fontStyle: /\b(italic|oblique)\b/.exec(fontStyle)?.[1] ?? 'normal',
    fontWeight: /\b(bold|bolder|lighter|[1-9]\d{0,2}|1000)\b/.exec(fontStyle)?.[1] ?? 'normal',
    fontVariant: target.fontVariant(),
    lineHeight: String(target.lineHeight()),
    letterSpacing: `${target.letterSpacing()}px`,
    wordSpacing: style.wordSpacing ?? 'normal',
    // Konva padding is inside Text bounds; HTML padding surrounds those bounds.
    padding: `${paddingTop + nativePadding}px ${paddingRight + nativePadding}px ${paddingBottom + nativePadding}px ${paddingLeft + nativePadding}px`,
    textAlign: target.align(),
    color: typeof fill === 'string' ? fill : style.color,
    direction:
      target.direction() === 'inherit' ? (style.direction ?? 'inherit') : target.direction(),
    whiteSpace: wrap === 'none' ? 'pre' : (style.whiteSpace ?? 'pre-wrap'),
    overflowWrap: wrap === 'char' ? 'anywhere' : (style.overflowWrap ?? 'break-word'),
    wordBreak: wrap === 'char' ? 'break-all' : (style.wordBreak ?? 'normal'),
    textTransform: style.textTransform ?? 'none',
  });
  textarea.wrap = wrap === 'none' ? 'off' : 'soft';
}
