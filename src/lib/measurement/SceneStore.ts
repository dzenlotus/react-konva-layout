import type { EngineSnapshot, Geometry, Registration, SceneElement, TextStyle } from '../model';
import type { LayoutMetrics, LayoutElement } from '../types';
import { geometryKeys, sameArray, sameTextStyle, sameVisualProps } from './comparison';

/** Reconciles measured values without replacing unchanged layout or scene references. */
export class SceneStore {
  readonly byKey = new Map<string, SceneElement>();
  readonly byId = new Map<string, LayoutElement>();
  snapshot: EngineSnapshot = { scene: [], tree: [], metrics: null };
  private revision = 0;

  reconcile(
    record: Registration,
    geometry: Geometry,
    textStyle: TextStyle | undefined,
    children: SceneElement[],
  ): SceneElement {
    const previous = this.byKey.get(record.key);
    const visualPropsUnchanged = previous && sameVisualProps(previous.props, record.props);
    const textStyleUnchanged = previous && sameTextStyle(previous.textStyle, textStyle);
    const childLayouts = children.map((child) => child.layout);
    const sameLayout =
      previous &&
      previous.layout.id === (record.props.id ?? record.key) &&
      previous.layout.type === record.type &&
      previous.layout.testId === record.props['data-testid'] &&
      geometryKeys.every((key) => previous.layout[key] === geometry[key]) &&
      sameArray(previous.layout.children, childLayouts);
    const layout: LayoutElement = sameLayout
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
      textStyleUnchanged &&
      visualPropsUnchanged &&
      sameArray(previous.children, children)
    )
      return previous;
    const item: SceneElement = {
      key: record.key,
      layout,
      props: visualPropsUnchanged ? previous.props : record.props,
      textStyle: textStyleUnchanged ? previous.textStyle : textStyle,
      children,
      revision: this.revision + 1,
    };
    this.byKey.set(record.key, item);
    if (previous && previous.layout.id !== layout.id) this.byId.delete(previous.layout.id);
    this.byId.set(layout.id, layout);
    return item;
  }

  replaceSubtrees(
    scene: SceneElement[],
    replacements: Map<string, SceneElement>,
    registrations: Map<string, Registration>,
  ): SceneElement[] {
    if (replacements.size === 0) return scene;
    const affected = new Set<string>();
    for (const key of replacements.keys()) {
      let parent = registrations.get(key)?.parent;
      while (parent) {
        affected.add(parent);
        parent = registrations.get(parent)?.parent;
      }
    }
    const patch = (previous: SceneElement): SceneElement => {
      const base = replacements.get(previous.key) ?? previous;
      if (!affected.has(previous.key)) return base;
      const record = registrations.get(previous.key);
      return record
        ? this.reconcile(record, base.layout, base.textStyle, base.children.map(patch))
        : base;
    };
    return scene.map(patch);
  }

  publish(
    scene: SceneElement[],
    measured: Omit<LayoutMetrics, 'revision'>,
  ): EngineSnapshot & { metrics: LayoutMetrics } {
    const previous = this.snapshot;
    const stableScene = sameArray(previous.scene, scene) ? previous.scene : scene;
    const tree = stableScene.map((item) => item.layout);
    const snapshot = {
      scene: stableScene,
      tree: sameArray(previous.tree, tree) ? previous.tree : tree,
      metrics: { ...measured, revision: ++this.revision },
    };
    this.snapshot = snapshot;
    return snapshot;
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
