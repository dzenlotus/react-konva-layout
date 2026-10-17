import type Konva from 'konva';
import type { TextStyle } from '../model';
import type { LayoutNode } from '../types';

export interface TextEditorHandle {
  /** Cancel this edit session and release its DOM and listeners. */
  (): void;
  /** Refresh measured geometry and CSS without replacing the native draft. */
  update(node: LayoutNode, textStyle: TextStyle): void;
}

export interface OpenTextEditorOptions {
  target: Konva.Text;
  node: LayoutNode;
  textStyle: TextStyle;
  onCommit(value: string): void;
  onClose(saved: boolean): void;
}

const trackedAttributes = [
  'x',
  'y',
  'scaleX',
  'scaleY',
  'rotation',
  'skewX',
  'skewY',
  'offsetX',
  'offsetY',
  'width',
  'height',
  'fontSize',
  'fontFamily',
  'fontStyle',
  'fontVariant',
  'lineHeight',
  'padding',
  'align',
  'letterSpacing',
  'text',
  'wrap',
  'direction',
  'fill',
];
const isolatedEvents = [
  'pointerdown',
  'pointermove',
  'pointerup',
  'pointercancel',
  'mousedown',
  'mousemove',
  'mouseup',
  'touchstart',
  'touchmove',
  'touchend',
  'touchcancel',
  'click',
  'dblclick',
  'contextmenu',
  'wheel',
  'keydown',
  'keyup',
];
let nextEditorId = 0;

/** The Stage owns the viewport and camera; this editor only follows its Text. */
export function openTextEditor({
  target,
  node: initialNode,
  textStyle: initialStyle,
  onCommit,
  onClose,
}: OpenTextEditorOptions): TextEditorHandle {
  const stage = target.getStage();
  const view = stage?.content.ownerDocument.defaultView;
  if (!stage || !view) {
    onClose(false);
    return Object.assign(() => {}, { update() {} });
  }

  const document = stage.content.ownerDocument;
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
  textarea.value = target.text();
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
  stage.content.appendChild(root);

  const originalValue = textarea.value;
  const originalVisibility = target.visible();
  const namespace = `layoutTextEditor${++nextEditorId}`;
  const changeEvents = trackedAttributes
    .map((attribute) => `${attribute}Change.${namespace}`)
    .join(' ');
  const destroyEvent = `destroy.${namespace}`;
  let node = initialNode;
  let textStyle = initialStyle;
  let observedNodes: Konva.Node[] = [];
  let finished = false;
  let destroyed = false;
  let composing = false;
  let blurred = false;
  let frame: number | null = null;
  let focusFrame: number | null = null;
  let blurTimer: number | null = null;

  const stopPropagation = (event: Event) => event.stopPropagation();
  const cancelDestroyed = () => {
    destroyed = true;
    finish(false);
  };
  const bindNodes = () => {
    const next = [target, ...target.getAncestors()];
    if (
      next.length === observedNodes.length &&
      next.every((item, index) => item === observedNodes[index])
    )
      return;
    observedNodes.forEach((item) => item.off(`.${namespace}`));
    observedNodes = next;
    observedNodes.forEach((item) => {
      item.on(changeEvents, scheduleUpdate);
      item.on(destroyEvent, cancelDestroyed);
    });
  };
  const fitHeight = () => {
    const minimum = Math.max(
      1,
      node.height,
      target.height() + textStyle.paddingTop + textStyle.paddingBottom,
    );
    textarea.style.height = '0px';
    textarea.style.height = `${Math.max(minimum, textarea.scrollHeight)}px`;
  };
  const update = () => {
    if (finished) return;
    if (target.getStage() !== stage) {
      finish(false);
      return;
    }
    bindNodes();
    const css = view.getComputedStyle(stage.content);
    // CSS transforms on the Stage's DOM ancestors are inherited by the editor.
    // Only a CSS viewport size different from the logical Stage needs conversion.
    const scaleX = (parseFloat(css.width) || stage.width()) / (stage.width() || 1);
    const scaleY = (parseFloat(css.height) || stage.height()) / (stage.height() || 1);
    const [a, b, c, d, e, f] = target.getAbsoluteTransform().getMatrix();
    const { paddingLeft, paddingTop, paddingRight, paddingBottom } = textStyle;
    const nativePadding = target.padding();
    const fontStyle = target.fontStyle();
    const fill = target.fill();
    const wrap = target.wrap();
    Object.assign(textarea.style, {
      // Text starts at the content inset; the editor covers the entire measured box.
      transform: `matrix(${a * scaleX}, ${b * scaleY}, ${c * scaleX}, ${d * scaleY}, ${(e - a * paddingLeft - c * paddingTop) * scaleX}, ${(f - b * paddingLeft - d * paddingTop) * scaleY})`,
      width: `${Math.max(1, target.width() + paddingLeft + paddingRight)}px`,
      fontFamily: target.fontFamily(),
      fontSize: `${target.fontSize()}px`,
      fontStyle: /\b(italic|oblique)\b/.exec(fontStyle)?.[1] ?? 'normal',
      fontWeight: /\b(bold|bolder|lighter|[1-9]\d{0,2}|1000)\b/.exec(fontStyle)?.[1] ?? 'normal',
      fontVariant: target.fontVariant(),
      lineHeight: String(target.lineHeight()),
      letterSpacing: `${target.letterSpacing()}px`,
      wordSpacing: textStyle.wordSpacing ?? 'normal',
      // Konva padding is inside the Text bounds; HTML padding surrounds those bounds.
      padding: `${paddingTop + nativePadding}px ${paddingRight + nativePadding}px ${paddingBottom + nativePadding}px ${paddingLeft + nativePadding}px`,
      textAlign: target.align(),
      color: typeof fill === 'string' ? fill : textStyle.color,
      direction:
        target.direction() === 'inherit' ? (textStyle.direction ?? 'inherit') : target.direction(),
      whiteSpace: wrap === 'none' ? 'pre' : (textStyle.whiteSpace ?? 'pre-wrap'),
      overflowWrap: wrap === 'char' ? 'anywhere' : (textStyle.overflowWrap ?? 'break-word'),
      wordBreak: wrap === 'char' ? 'break-all' : (textStyle.wordBreak ?? 'normal'),
      textTransform: textStyle.textTransform ?? 'none',
    });
    textarea.wrap = wrap === 'none' ? 'off' : 'soft';
    fitHeight();
  };
  function scheduleUpdate() {
    if (finished || frame !== null) return;
    frame = view!.requestAnimationFrame(() => {
      frame = null;
      update();
    });
  }
  const resizeObserver = new ResizeObserver(scheduleUpdate);
  function finish(saved: boolean) {
    if (finished) return;
    finished = true;
    if (frame !== null) view!.cancelAnimationFrame(frame);
    if (focusFrame !== null) view!.cancelAnimationFrame(focusFrame);
    if (blurTimer !== null) view!.clearTimeout(blurTimer);
    observedNodes.forEach((item) => item.off(`.${namespace}`));
    resizeObserver.disconnect();
    view!.removeEventListener('resize', scheduleUpdate);
    view!.removeEventListener('scroll', scheduleUpdate, true);
    isolatedEvents.forEach((event) => textarea.removeEventListener(event, stopPropagation));
    textarea.removeEventListener('input', fitHeight);
    textarea.removeEventListener('keydown', keyDown);
    textarea.removeEventListener('blur', blur);
    textarea.removeEventListener('compositionstart', compositionStart);
    textarea.removeEventListener('compositionend', compositionEnd);
    root.remove();
    if (!destroyed) {
      target.visible(originalVisibility);
      target.getLayer()?.batchDraw();
    }
    try {
      if (saved && textarea.value !== originalValue) onCommit(textarea.value);
    } finally {
      onClose(saved);
    }
  }
  function keyDown(event: KeyboardEvent) {
    if (composing || event.isComposing || event.keyCode === 229) return;
    if (event.key === 'Escape') {
      event.preventDefault();
      finish(false);
    } else if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
      event.preventDefault();
      finish(true);
    }
  }
  function scheduleBlurCommit() {
    if (blurTimer !== null) view!.clearTimeout(blurTimer);
    // Let the browser flush its final composition/input before reading the value.
    blurTimer = view!.setTimeout(() => {
      blurTimer = null;
      if (!composing) finish(true);
    }, 0);
  }
  function blur() {
    blurred = true;
    scheduleBlurCommit();
  }
  function compositionStart() {
    composing = true;
  }
  function compositionEnd() {
    composing = false;
    if (blurred) scheduleBlurCommit();
  }

  isolatedEvents.forEach((event) => textarea.addEventListener(event, stopPropagation));
  textarea.addEventListener('input', fitHeight);
  textarea.addEventListener('keydown', keyDown);
  textarea.addEventListener('blur', blur);
  textarea.addEventListener('compositionstart', compositionStart);
  textarea.addEventListener('compositionend', compositionEnd);
  resizeObserver.observe(stage.content);
  resizeObserver.observe(stage.container());
  view.addEventListener('resize', scheduleUpdate);
  view.addEventListener('scroll', scheduleUpdate, { capture: true, passive: true });
  update();
  target.hide();
  target.getLayer()?.batchDraw();
  focusFrame = view.requestAnimationFrame(() => {
    focusFrame = null;
    if (!finished) {
      textarea.focus({ preventScroll: true });
      textarea.select();
    }
  });

  return Object.assign(() => finish(false), {
    update(nextNode: LayoutNode, nextStyle: TextStyle) {
      node = nextNode;
      textStyle = nextStyle;
      update();
    },
  });
}
