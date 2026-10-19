import type Konva from 'konva';
import type { CellTextRenderProps, LayoutElement } from '../../lib';
import { createEditorElements, resizeEditor, syncEditorStyles } from './dom';

export interface TextEditorHandle {
  /** Cancel this edit session and release its DOM and listeners. */
  (): void;
  /** Refresh measured geometry and CSS without replacing the native draft. */
  update(element: LayoutElement, bounds: CellTextRenderProps): void;
}

export interface OpenTextEditorOptions {
  target: Konva.Text;
  element: LayoutElement;
  bounds: CellTextRenderProps;
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
  element: initialNode,
  bounds: initialBounds,
  onCommit,
  onClose,
}: OpenTextEditorOptions): TextEditorHandle {
  const stage = target.getStage();
  const ownerWindow = stage?.content.ownerDocument.defaultView;
  if (!stage || !ownerWindow) {
    onClose(false);
    return Object.assign(() => {}, { update() {} });
  }

  const view: Window = ownerWindow;
  const listeners = new AbortController();
  const { signal } = listeners;
  const { root, textarea } = createEditorElements(stage.content.ownerDocument, target.text());
  textarea.dataset.layoutCellId = initialNode.id;
  stage.content.appendChild(root);

  const originalValue = textarea.value;
  const originalVisibility = target.visible();
  const namespace = `layoutTextEditor${++nextEditorId}`;
  const changeEvents = trackedAttributes
    .map((attribute) => `${attribute}Change.${namespace}`)
    .join(' ');
  const destroyEvent = `destroy.${namespace}`;
  let element = initialNode;
  let bounds = initialBounds;
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
  const fitHeight = () => resizeEditor(textarea, target, element, bounds);
  const update = () => {
    if (finished) return;
    if (target.getStage() !== stage) {
      finish(false);
      return;
    }
    bindNodes();
    syncEditorStyles(textarea, target, stage, view, element, bounds);
    fitHeight();
  };
  function scheduleUpdate() {
    if (finished || frame !== null) return;
    frame = view.requestAnimationFrame(() => {
      frame = null;
      update();
    });
  }
  const resizeObserver = new ResizeObserver(scheduleUpdate);
  function finish(saved: boolean) {
    if (finished) return;
    finished = true;
    if (frame !== null) view.cancelAnimationFrame(frame);
    if (focusFrame !== null) view.cancelAnimationFrame(focusFrame);
    if (blurTimer !== null) view.clearTimeout(blurTimer);
    observedNodes.forEach((item) => item.off(`.${namespace}`));
    resizeObserver.disconnect();
    listeners.abort();
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
    if (blurTimer !== null) view.clearTimeout(blurTimer);
    // Let the browser flush its final composition/input before reading the value.
    blurTimer = view.setTimeout(() => {
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

  isolatedEvents.forEach((event) => textarea.addEventListener(event, stopPropagation, { signal }));
  textarea.addEventListener('input', fitHeight, { signal });
  textarea.addEventListener('keydown', keyDown, { signal });
  textarea.addEventListener('blur', blur, { signal });
  textarea.addEventListener('compositionstart', compositionStart, { signal });
  textarea.addEventListener('compositionend', compositionEnd, { signal });
  resizeObserver.observe(stage.content);
  resizeObserver.observe(stage.container());
  view.addEventListener('resize', scheduleUpdate, { signal });
  view.addEventListener('scroll', scheduleUpdate, { capture: true, passive: true, signal });
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
    update(nextNode: LayoutElement, nextBounds: CellTextRenderProps) {
      element = nextNode;
      textarea.dataset.layoutCellId = nextNode.id;
      bounds = nextBounds;
      update();
    },
  });
}
