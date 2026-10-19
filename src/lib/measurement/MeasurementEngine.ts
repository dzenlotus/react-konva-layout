import type { CSSProperties } from 'react';
import type { EngineSnapshot, LayoutRegistry, Registration, SceneElement } from '../model';
import type {
  LayoutContextValue,
  LayoutMetrics,
  LayoutElement,
  PerformanceOptions,
} from '../types';
import { CssPolicy } from './CssPolicy';
import { MeasurementCache } from './MeasurementCache';
import { MeasurementObservers } from './MeasurementObservers';
import { MeasurementPass } from './MeasurementPass';
import { SceneStore } from './SceneStore';
import { layoutKeys, sameGeometryProps, sameVisualProps } from './comparison';

const textContentStyles = new Set<keyof CSSProperties>([
  'font',
  'fontSize',
  'fontFamily',
  'fontStyle',
  'fontWeight',
  'fontVariant',
  'fontSynthesis',
  'lineHeight',
  'letterSpacing',
  'wordSpacing',
  'color',
  'direction',
  'textAlign',
  'verticalAlign',
  'textDecoration',
  'textUnderlineOffset',
  'textTransform',
  'textOverflow',
  'whiteSpace',
  'wordBreak',
  'overflowWrap',
]);

/** A text boundary may measure new contents without discarding its parent constraints. */
function sameTextBoundaryConstraints(
  previous: Registration,
  next: Registration,
  measuredWidth: number | undefined,
): boolean {
  if (
    (next.type !== 'text' && next.type !== 'cell-text') ||
    previous.type !== next.type ||
    previous.element !== next.element ||
    previous.parent !== next.parent ||
    previous.props.id !== next.props.id ||
    previous.props['data-testid'] !== next.props['data-testid'] ||
    previous.props.layoutRoot !== next.props.layoutRoot ||
    !layoutKeys.every((key) => previous.props[key] === next.props[key])
  )
    return false;
  const width = next.props.style?.width ?? next.props.width;
  const widthInPixels =
    typeof width === 'number'
      ? width
      : typeof width === 'string' && /^(?:\d+\.?\d*|\.\d+)px$/i.test(width.trim())
        ? parseFloat(width)
        : NaN;
  // Isolated reads pin the previous width. Intrinsic, relative, or constrained widths
  // may change with typography and must be resolved in their parent context instead.
  if (
    !Number.isFinite(widthInPixels) ||
    widthInPixels < 0 ||
    measuredWidth === undefined ||
    Math.abs(measuredWidth - widthInPixels) > 1 / 64
  )
    return false;
  const previousStyle = previous.props.style;
  const nextStyle = next.props.style;
  const keys = new Set([
    ...Object.keys(previousStyle ?? {}),
    ...Object.keys(nextStyle ?? {}),
  ] as Array<keyof CSSProperties>);
  return [...keys].every((key) => {
    if (textContentStyles.has(key)) return true;
    const value = nextStyle?.[key];
    // Unchanged em-based margins/insets can move a boundary when its font changes.
    const fontRelative =
      typeof value === 'string' &&
      /(?:[\d.]\s*(?:r?em|ex|ch|cap|ic|r?lh)\b|var\(|calc\()/i.test(value);
    return !fontRelative && previousStyle?.[key] === value;
  });
}

interface EngineConfiguration {
  width: number;
  height: number;
  debug?: boolean;
  performance?: PerformanceOptions;
  onLayout?: (tree: LayoutElement[]) => void;
  onMeasure?: (metrics: LayoutMetrics) => void;
}

interface MeasurementUpdate {
  scene: SceneElement[];
  metrics: Omit<LayoutMetrics, 'durationMs' | 'revision'>;
}

export const measurementCss = `
.konva-layout-text:empty::before { content: "\\200b"; }
.konva-layout-measure[data-debug="true"] .konva-layout-element {
  outline: 1px solid #00dbed; outline-offset: -1px; -webkit-text-fill-color: transparent;
}
.konva-layout-measure[data-debug="true"] .konva-layout-element::after {
  content: attr(data-layout-label); position: absolute; top: 2px; left: 3px;
  padding: 2px 4px; color: #00343b; -webkit-text-fill-color: #00343b;
  background: #78f2ff; font: 9px/1.2 monospace; white-space: nowrap; z-index: 1;
}`;

/** Coordinates registrations, browser signals, and one coalesced measurement per frame. */
export class MeasurementEngine {
  readonly root: HTMLDivElement;
  readonly registry: LayoutRegistry;
  readonly context: LayoutContextValue;
  private readonly registrations = new Map<string, Registration>();
  private readonly keysById = new Map<string, string>();
  private readonly listeners = new Set<() => void>();
  private readonly cache = new MeasurementCache();
  private readonly store = new SceneStore();
  private readonly policy = new CssPolicy();
  private readonly observers: MeasurementObservers;
  private readonly pass: MeasurementPass;
  private readonly dirty = new Set<string>();
  private readonly visualDirty = new Set<string>();
  private configuration: EngineConfiguration = { width: 0, height: 0 };
  private host: HTMLElement | null = null;
  private getTransform?: () => number[];
  private fullDirty = true;
  private committed = false;
  private frame = 0;

  constructor() {
    this.root = document.createElement('div');
    this.root.className = 'konva-layout-measure';
    this.root.setAttribute('aria-hidden', 'true');
    Object.assign(this.root.style, {
      position: 'absolute',
      left: '0',
      top: '0',
      opacity: '0',
      pointerEvents: 'none',
      zIndex: '1',
      fontFamily: 'Arial, sans-serif',
      fontSize: '16px',
      lineHeight: '1.2',
      transformOrigin: '0 0',
    });
    this.registry = { update: this.update, remove: this.remove };
    this.context = {
      invalidate: this.invalidate,
      getLayout: this.getLayout,
      getMetrics: this.getMetrics,
    };
    this.observers = new MeasurementObservers(this.root, this.registrations, {
      schedule: this.schedule,
      cssChanged: this.cssChanged,
    });
    this.pass = new MeasurementPass(
      this.root,
      this.registrations,
      this.store,
      this.cache,
      this.policy,
      this.observers.pause,
      this.observers.resume,
    );
  }

  configure(configuration: EngineConfiguration): void {
    const previous = this.configuration;
    this.configuration = configuration;
    const debug = Boolean(configuration.debug);
    this.root.style.width = `${configuration.width}px`;
    this.root.style.height = `${configuration.height}px`;
    this.root.dataset.debug = String(debug);
    this.root.style.opacity = debug ? '1' : '0';
    if (!debug) this.root.remove();
    if (Boolean(previous.debug) !== debug) this.observers.setDebug(debug);
    if (
      previous.width !== configuration.width ||
      previous.height !== configuration.height ||
      Boolean(previous.debug) !== debug ||
      previous.performance?.enabled !== configuration.performance?.enabled
    ) {
      this.schedule();
    }
    this.syncDebugTransform();
  }

  start(host: HTMLElement, getTransform?: () => number[]): void {
    if (this.host === host) {
      this.getTransform = getTransform;
      this.syncDebugTransform();
      return;
    }
    this.stop();
    this.host = host;
    this.getTransform = getTransform;
    this.observers.start(host, Boolean(this.configuration.debug));
    this.syncDebugTransform();
    this.schedule();
  }

  stop(): void {
    if (this.frame) cancelAnimationFrame(this.frame);
    this.frame = 0;
    this.observers.stop();
    this.root.remove();
    this.host = null;
    this.getTransform = undefined;
  }

  dispose(): void {
    this.stop();
    this.registrations.clear();
    this.keysById.clear();
    this.listeners.clear();
    this.dirty.clear();
    this.visualDirty.clear();
    this.store.clear();
    this.cache.clear();
  }

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  getSnapshot = (): EngineSnapshot => this.store.snapshot;
  getLayout = (id: string): LayoutElement | undefined => this.store.byId.get(id);
  getMetrics = (): LayoutMetrics | null => this.store.snapshot.metrics;

  beginRender(): void {
    this.committed = false;
    if (this.frame) cancelAnimationFrame(this.frame);
    this.frame = 0;
  }

  commit(): void {
    this.committed = true;
    this.enqueue();
  }

  invalidate = (id?: string): void => {
    if (!id) this.cache.invalidateCss();
    this.schedule(id);
  };

  remeasure = (id?: string): void => {
    this.cache.invalidateCss();
    this.schedule(id);
  };

  syncDebugTransform = (): void => {
    if (!this.configuration.debug) return;
    const matrix = this.getTransform?.();
    this.root.style.transform = matrix ? `matrix(${matrix.join(',')})` : '';
  };

  update = (record: Registration): void => {
    const previous = this.registrations.get(record.key);
    const sameGeometry =
      previous && previous.element === record.element && sameGeometryProps(previous, record);
    if (previous) {
      if (sameGeometry) record.signature = previous.signature;
      record.domFingerprint = previous.domFingerprint;
      record.templateUnsafe = previous.templateUnsafe;
    }
    record.domStyle = record.element.getAttribute('style');
    this.registrations.set(record.key, record);
    if (previous?.props.id && previous.props.id !== record.props.id)
      this.keysById.delete(previous.props.id);
    if (record.props.id) this.keysById.set(record.props.id, record.key);
    if (previous && previous.element !== record.element) this.observers.remove(previous);
    this.observers.observe(record);
    if (!sameGeometry) {
      // Text content can change locally; a boundary's outer constraints need its parent.
      if (
        previous?.props.layoutRoot &&
        !sameTextBoundaryConstraints(
          previous,
          record,
          this.store.byKey.get(record.key)?.layout.width,
        )
      )
        this.schedule(record.parent ?? undefined);
      else this.schedule(record.key);
    } else if (!sameVisualProps(previous.props, record.props)) {
      this.visualDirty.add(record.key);
      this.enqueue();
    }
  };

  remove = (key: string): void => {
    const record = this.registrations.get(key);
    if (!record) return;
    this.observers.remove(record);
    this.schedule(record.parent ?? undefined);
    this.registrations.delete(key);
    if (record.props.id) this.keysById.delete(record.props.id);
    this.store.remove(key);
    this.cache.boundaries.delete(key);
  };

  private cssChanged = (fontsChanged = false): void => {
    this.cache.invalidateCss(fontsChanged);
    this.schedule();
  };

  private schedule = (id?: string): void => {
    const key = id && (this.registrations.has(id) ? id : this.keysById.get(id));
    const record = key ? this.closestBoundary(key) : undefined;
    if (record) this.dirty.add(record.key);
    else this.fullDirty = true;
    this.enqueue();
  };

  private closestBoundary(key: string): Registration | undefined {
    let record = this.registrations.get(key);
    while (record && !record.props.layoutRoot) {
      record = record.parent ? this.registrations.get(record.parent) : undefined;
    }
    return record;
  }

  private enqueue(): void {
    const dirty = this.fullDirty || this.dirty.size > 0 || this.visualDirty.size > 0;
    if (this.host && this.committed && dirty && !this.frame) {
      this.frame = requestAnimationFrame(this.flush);
    }
  }

  private flush = (): void => {
    this.frame = 0;
    if (!this.host?.isConnected || !this.committed) return;
    const started = performance.now();
    const dirtyRoots = [...this.dirty];
    const visualKeys = [...this.visualDirty];
    const needsFullPass =
      (this.configuration.performance?.enabled === false && dirtyRoots.length > 0) ||
      this.fullDirty ||
      this.store.snapshot.scene.length === 0;
    this.dirty.clear();
    this.visualDirty.clear();
    this.fullDirty = false;
    const { scene, metrics } = this.measure(dirtyRoots, needsFullPass, this.host);
    const next = this.updateVisuals(scene, visualKeys);
    const previousTree = this.store.snapshot.tree;
    const snapshot = this.store.publish(next, {
      ...metrics,
      durationMs: performance.now() - started,
    });
    for (const listener of this.listeners) listener();
    if (previousTree !== snapshot.tree) this.configuration.onLayout?.(snapshot.tree);
    if (metrics.scope !== 'visual') this.configuration.onMeasure?.(snapshot.metrics);
  };

  /** A dirty ancestor already includes its descendants in the same read. */
  private independentRoots(keys: string[]): string[] {
    const pendingKeys = new Set(keys);
    return keys.filter((key) => {
      let parent = this.registrations.get(key)?.parent;
      while (parent) {
        if (pendingKeys.has(parent)) return false;
        parent = this.registrations.get(parent)?.parent;
      }
      return true;
    });
  }

  private measure(
    dirtyRoots: string[],
    needsFullPass: boolean,
    host: HTMLElement,
  ): MeasurementUpdate {
    let scene = this.store.snapshot.scene;
    const metrics: MeasurementUpdate['metrics'] = {
      scope: 'visual',
      measuredElements: 0,
      measuredRoots: [],
      templateHits: 0,
      templateMisses: 0,
    };
    const debug = Boolean(this.configuration.debug);
    if (!needsFullPass && dirtyRoots.length) {
      metrics.scope = 'local';
      const replacements = new Map<string, SceneElement>();
      let pending = this.independentRoots(dirtyRoots);
      while (pending.length) {
        const key = pending.shift()!;
        const record = this.registrations.get(key);
        if (!record) {
          needsFullPass = true;
          break;
        }
        const result = this.pass.local(record, host, debug, true);
        if (result) {
          metrics.measuredElements += result.elements;
          metrics.templateHits += result.hits;
          metrics.templateMisses += result.misses;
          metrics.measuredRoots.push(record.props.id ?? key);
        }
        if (!result || result.fallback) {
          const parent = record.parent ? this.closestBoundary(record.parent) : undefined;
          if (!parent) {
            needsFullPass = true;
            break;
          }
          // The enclosing read includes all changed descendants, including earlier successes.
          for (const replacement of replacements.keys()) {
            if (this.isDescendant(replacement, parent.key)) replacements.delete(replacement);
          }
          pending = this.independentRoots([...new Set([parent.key, ...pending])]);
        } else {
          replacements.set(key, result.roots[0]);
        }
      }
      if (!needsFullPass)
        scene = this.store.replaceSubtrees(scene, replacements, this.registrations);
    }
    if (needsFullPass) {
      const result = this.pass.full(host, debug, this.configuration.performance?.enabled !== false);
      metrics.scope = 'full';
      scene = result.roots;
      metrics.measuredElements += result.elements;
      metrics.templateHits += result.hits;
      metrics.templateMisses += result.misses;
      metrics.measuredRoots = [
        ...new Set([...metrics.measuredRoots, ...result.roots.map((item) => item.layout.id)]),
      ];
    }
    return { scene, metrics };
  }

  private isDescendant(key: string, ancestor: string): boolean {
    let parent = this.registrations.get(key)?.parent;
    while (parent) {
      if (parent === ancestor) return true;
      parent = this.registrations.get(parent)?.parent;
    }
    return false;
  }

  private updateVisuals(scene: SceneElement[], keys: string[]): SceneElement[] {
    const replacements = new Map<string, SceneElement>();
    for (const key of keys) {
      const record = this.registrations.get(key);
      const previous = this.store.byKey.get(key);
      if (record && previous)
        replacements.set(
          key,
          this.store.reconcile(record, previous.layout, previous.textStyle, previous.children),
        );
    }
    return this.store.replaceSubtrees(scene, replacements, this.registrations);
  }
}
