import type { EngineSnapshot, Geometry, Registration, SceneNode, TextStyle } from '../model';
import type { LayoutMetrics, LayoutNode } from '../types';
import { geometryKeys, sameArray, sameTextStyle, sameVisualProps } from './comparison';

/** Reconciles measured values without replacing unchanged layout or scene references. */
export class SceneStore {
  readonly byKey = new Map<string, SceneNode>();
  readonly byId = new Map<string, LayoutNode>();
  snapshot: EngineSnapshot = { scene: [], tree: [], metrics: null };
  private revision = 0;

  reconcile(
    record: Registration,
    geometry: Geometry,
    textStyle: TextStyle | undefined,
    children: SceneNode[],
  ): SceneNode {
    const previous = this.byKey.get(record.key);
    const childLayouts = children.map((child) => child.layout);
    const sameLayout =
      previous &&
      previous.layout.id === (record.props.id ?? record.key) &&
      previous.layout.type === record.type &&
      previous.layout.testId === record.props['data-testid'] &&
      geometryKeys.every((key) => previous.layout[key] === geometry[key]) &&
      sameArray(previous.layout.children, childLayouts);
    const layout: LayoutNode = sameLayout
      ? previous.layout
      : {
          ...geometry,
          id: record.props.id ?? record.key,
          type: record.type,
          testId: record.props['data-testid'],
          children: childLayouts,
        };
    if (
      previous &&
      layout === previous.layout &&
      sameTextStyle(previous.textStyle, textStyle) &&
      sameVisualProps(previous.props, record.props) &&
      sameArray(previous.children, children)
    )
      return previous;
    const item: SceneNode = {
      key: record.key,
      layout,
      props:
        previous && sameVisualProps(previous.props, record.props) ? previous.props : record.props,
      textStyle:
        previous && sameTextStyle(previous.textStyle, textStyle) ? previous.textStyle : textStyle,
      children,
      revision: this.revision + 1,
    };
    this.byKey.set(record.key, item);
    if (previous && previous.layout.id !== layout.id) this.byId.delete(previous.layout.id);
    this.byId.set(layout.id, layout);
    return item;
  }

  replaceSubtrees(
    scene: SceneNode[],
    replacements: Map<string, SceneNode>,
    registrations: Map<string, Registration>,
  ): SceneNode[] {
    const affected = new Set<string>();
    for (const key of replacements.keys()) {
      let parent = registrations.get(key)?.parent;
      while (parent) {
        affected.add(parent);
        parent = registrations.get(parent)?.parent;
      }
    }
    const patch = (previous: SceneNode): SceneNode => {
      const base = replacements.get(previous.key) ?? previous;
      if (!affected.has(previous.key)) return base;
      const record = registrations.get(previous.key);
      return record
        ? this.reconcile(record, base.layout, base.textStyle, base.children.map(patch))
        : base;
    };
    return scene.map(patch);
  }

  publish(scene: SceneNode[], measured: Omit<LayoutMetrics, 'revision'>): EngineSnapshot {
    const previous = this.snapshot;
    const stableScene = sameArray(previous.scene, scene) ? previous.scene : scene;
    const tree = stableScene.map((item) => item.layout);
    this.snapshot = {
      scene: stableScene,
      tree: sameArray(previous.tree, tree) ? previous.tree : tree,
      metrics: { ...measured, revision: ++this.revision },
    };
    return this.snapshot;
  }

  remove(key: string): void {
    const previous = this.byKey.get(key);
    if (previous) this.byId.delete(previous.layout.id);
    this.byKey.delete(key);
  }

  clear(): void {
    this.byKey.clear();
    this.byId.clear();
    this.snapshot = { scene: [], tree: [], metrics: null };
  }
}
