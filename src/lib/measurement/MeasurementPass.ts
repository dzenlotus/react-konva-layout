import type { BoundaryContext, MeasurementResult, Registration, SceneNode } from '../model';
import { CssPolicy } from './CssPolicy';
import { MeasurementCache } from './MeasurementCache';
import { MeasurementReader } from './MeasurementReader';
import { SceneStore } from './SceneStore';

interface LocalResult extends MeasurementResult {
  fallback: boolean;
}

/** Temporarily connects measurement DOM, restoring the original nodes after each read. */
export class MeasurementPass {
  constructor(
    private readonly root: HTMLDivElement,
    private readonly registrations: Map<string, Registration>,
    private readonly store: SceneStore,
    private readonly cache: MeasurementCache,
    private readonly policy: CssPolicy,
    private readonly pause: () => void,
    private readonly resume: () => void,
  ) {}

  full(host: HTMLElement, debug: boolean, enabled: boolean): MeasurementResult {
    const transform = this.root.style.transform;
    this.pause();
    this.root.style.transform = '';
    this.root.style.opacity = debug ? '1' : '0';
    this.setState(debug ? 'debug' : 'measuring');
    if (this.root.parentElement !== host) host.appendChild(this.root);
    try {
      return this.read(this.root, host, enabled);
    } finally {
      this.root.style.transform = transform;
      if (!debug) this.root.remove();
      this.setState(debug ? 'debug' : 'idle');
      this.resume();
    }
  }

  local(
    record: Registration,
    host: HTMLElement,
    debug: boolean,
    enabled: boolean,
  ): LocalResult | null {
    const previous = this.store.byKey.get(record.key);
    const context = this.cache.boundaries.get(record.key);
    const explicitWidth = record.props.width ?? record.props.style?.width;
    if (
      !previous ||
      !context ||
      explicitWidth === undefined ||
      explicitWidth === 'auto' ||
      context.boxSizing !== 'border-box' ||
      context.transformed
    )
      return null;
    const css = record.props.style;
    if (
      (css?.bottom !== undefined && css.bottom !== 'auto') ||
      css?.inset !== undefined ||
      css?.insetBlock !== undefined ||
      css?.insetBlockEnd !== undefined ||
      css?.transform
    )
      return null;
    this.policy.refresh(this.cache.cssRevision);
    if (!this.policy.canMeasureLocally(record.element, this.root)) return null;

    this.pause();
    const restore = debug
      ? this.clearDebugTransform()
      : this.isolate(record, host, previous, context);
    try {
      const result = this.read(record.element, host, enabled, record);
      const next = result.roots[0];
      // Absolute boundaries may grow independently. Flow boundaries can move siblings.
      const flow = context.position !== 'absolute' && context.position !== 'fixed';
      return {
        ...result,
        fallback:
          !next ||
          (flow &&
            (next.layout.width !== previous.layout.width ||
              next.layout.height !== previous.layout.height)),
      };
    } finally {
      this.cache.boundaries.set(record.key, context);
      restore();
      this.resume();
    }
  }

  private read(
    container: HTMLElement,
    host: HTMLElement,
    enabled: boolean,
    boundary?: Registration,
  ): MeasurementResult {
    const css = getComputedStyle(host);
    const rect = host.getBoundingClientRect();
    const cssWidth = parseFloat(css.width);
    const cssHeight = parseFloat(css.height);
    const scale = {
      x: cssWidth > 0 && rect.width > 0 ? rect.width / cssWidth : 1,
      y: cssHeight > 0 && rect.height > 0 ? rect.height / cssHeight : 1,
    };
    return new MeasurementReader({
      container,
      registrations: this.registrations,
      store: this.store,
      cache: this.cache,
      policy: this.policy,
      enabled,
      scale,
      boundary,
    }).read();
  }

  private clearDebugTransform(): () => void {
    const transform = this.root.style.transform;
    this.root.style.transform = '';
    return () => {
      this.root.style.transform = transform;
    };
  }

  private isolate(
    record: Registration,
    host: HTMLElement,
    previous: SceneNode,
    context: BoundaryContext,
  ): () => void {
    const container = this.root.cloneNode(false) as HTMLDivElement;
    container.dataset.layoutScope = 'local';
    container.dataset.layoutState = 'measuring';
    container.dataset.debug = 'false';
    container.style.transform = '';
    // A detached root's stylesheets are inactive. Keep their cascade in the isolated read.
    for (const sheet of this.root.querySelectorAll('style, link[rel="stylesheet"]')) {
      if (!record.element.contains(sheet)) container.appendChild(sheet.cloneNode(true));
    }
    const ancestors: HTMLElement[] = [];
    let ancestor = record.element.parentElement;
    while (ancestor && ancestor !== this.root) {
      ancestors.unshift(ancestor);
      ancestor = ancestor.parentElement;
    }
    let parent: HTMLElement = container;
    for (const original of ancestors) {
      const clone = original.cloneNode(false) as HTMLElement;
      const scene = this.store.byKey.get(original.dataset.layoutKey ?? '');
      if (scene) {
        clone.style.width = `${scene.layout.width}px`;
        clone.style.height = `${scene.layout.height}px`;
        clone.style.boxSizing = 'border-box';
      }
      parent.appendChild(clone);
      parent = clone;
    }
    const originalParent = record.element.parentNode!;
    const nextSibling = record.element.nextSibling;
    const previousStyle = record.element.style.cssText;
    Object.assign(record.element.style, {
      width: `${previous.layout.width}px`,
      boxSizing: 'border-box',
      position: context.position === 'fixed' ? 'fixed' : 'absolute',
    });
    parent.appendChild(record.element);
    host.appendChild(container);
    return () => {
      record.element.style.cssText = previousStyle;
      originalParent.insertBefore(record.element, nextSibling);
      container.remove();
    };
  }

  private setState(state: string): void {
    this.root.dataset.layoutState = state;
  }
}
