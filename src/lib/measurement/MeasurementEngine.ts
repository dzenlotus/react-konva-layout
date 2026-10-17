import type { EngineSnapshot, LayoutRegistry, Registration, SceneNode } from '../model';
import type { LayoutContextValue, LayoutMetrics, LayoutNode, PerformanceOptions } from '../types';
import { CssPolicy } from './CssPolicy';
import { MeasurementCache } from './MeasurementCache';
import { MeasurementObservers } from './MeasurementObservers';
import { MeasurementPass } from './MeasurementPass';
import { SceneStore } from './SceneStore';
import { sameGeometryProps, sameVisualProps } from './comparison';

interface EngineConfiguration {
  width: number;
  height: number;
  debug?: boolean;
  performance?: PerformanceOptions;
  onLayout?: (tree: LayoutNode[]) => void;
  onMeasure?: (metrics: LayoutMetrics) => void;
}

interface MeasurementUpdate {
  scene: SceneNode[];
  metrics: Omit<LayoutMetrics, 'durationMs' | 'revision'>;
}

export const measurementCss = `
.konva-layout-text:empty::before { content: "\\200b"; }
.konva-layout-measure[data-debug="true"] .konva-layout-node {
  outline: 1px solid #00dbed; outline-offset: -1px; -webkit-text-fill-color: transparent;
}
.konva-layout-measure[data-debug="true"] .konva-layout-node::after {
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
  getLayout = (id: string): LayoutNode | undefined => this.store.byId.get(id);
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
      // A boundary's own constraints depend on its parent layout context.
      if (previous?.props.layoutRoot) this.schedule();
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
    let record = key ? this.registrations.get(key) : undefined;
    while (record && !record.props.layoutRoot) {
      record = record.parent ? this.registrations.get(record.parent) : undefined;
    }
    if (record) this.dirty.add(record.key);
    else this.fullDirty = true;
    this.enqueue();
  };

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
      measuredNodes: 0,
      measuredRoots: [],
      templateHits: 0,
      templateMisses: 0,
    };
    const debug = Boolean(this.configuration.debug);
    if (!needsFullPass && dirtyRoots.length) {
      metrics.scope = 'local';
      const replacements = new Map<string, SceneNode>();
      for (const key of this.independentRoots(dirtyRoots)) {
        const record = this.registrations.get(key);
        if (!record) {
          needsFullPass = true;
          break;
        }
        const result = this.pass.local(record, host, debug, true);
        if (!result) {
          needsFullPass = true;
          break;
        }
        metrics.measuredNodes += result.nodes;
        metrics.templateHits += result.hits;
        metrics.templateMisses += result.misses;
        metrics.measuredRoots.push(record.props.id ?? key);
        if (result.fallback) {
          needsFullPass = true;
          break;
        }
        replacements.set(key, result.roots[0]);
      }
      if (!needsFullPass)
        scene = this.store.replaceSubtrees(scene, replacements, this.registrations);
    }
    if (needsFullPass) {
      const result = this.pass.full(host, debug, this.configuration.performance?.enabled !== false);
      metrics.scope = 'full';
      scene = result.roots;
      metrics.measuredNodes += result.nodes;
      metrics.templateHits += result.hits;
      metrics.templateMisses += result.misses;
      metrics.measuredRoots = [
        ...new Set([...metrics.measuredRoots, ...result.roots.map((item) => item.layout.id)]),
      ];
    }
    return { scene, metrics };
  }

  private updateVisuals(scene: SceneNode[], keys: string[]): SceneNode[] {
    const replacements = new Map<string, SceneNode>();
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
