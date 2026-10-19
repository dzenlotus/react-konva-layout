import type { Geometry, MeasurementResult, Registration, SceneElement, TextStyle } from '../model';
import { CssPolicy } from './CssPolicy';
import { MeasurementCache, styleSignature, token } from './MeasurementCache';
import { SceneStore } from './SceneStore';
import { typographyKeys } from './comparison';

interface ReadOptions {
  container: HTMLElement;
  registrations: Map<string, Registration>;
  store: SceneStore;
  cache: MeasurementCache;
  policy: CssPolicy;
  enabled: boolean;
  scale: { x: number; y: number };
  boundary?: Registration;
}

/** A pass has its own traversal state; only the bounded caches survive it. */
export class MeasurementReader {
  private readonly ordered: Registration[];
  private readonly children = new Map<string | null, Registration[]>();
  private readonly geometries = new Map<string, Geometry>();
  private readonly styles = new Map<string, TextStyle | undefined>();
  private readonly contextKeys = new Map<string, number>();
  private readonly origin: DOMRect;
  private elements = 0;
  private hits = 0;
  private misses = 0;

  constructor(private readonly options: ReadOptions) {
    const { container, registrations, boundary, policy, cache } = options;
    this.ordered = Array.from(container.querySelectorAll<HTMLDivElement>('[data-layout-key]'))
      .map((element) => registrations.get(element.dataset.layoutKey ?? ''))
      .filter((record): record is Registration => Boolean(record));
    if (boundary && this.ordered[0]?.key !== boundary.key) this.ordered.unshift(boundary);
    policy.refresh(cache.cssRevision);
    const included = new Set(this.ordered.map((record) => record.key));
    for (const record of this.ordered) {
      if (policy.needsTemplateIdentity(record.element)) record.templateUnsafe = true;
      const parent = record.parent && included.has(record.parent) ? record.parent : null;
      const siblings = this.children.get(parent) ?? [];
      siblings.push(record);
      this.children.set(parent, siblings);
    }
    this.origin = container.getBoundingClientRect();
  }

  read(): MeasurementResult {
    for (const record of this.children.get(null) ?? []) this.walk(record);
    const built = new Map<string, SceneElement>();
    for (let index = this.ordered.length - 1; index >= 0; index -= 1) {
      const record = this.ordered[index];
      built.set(
        record.key,
        this.options.store.reconcile(
          record,
          this.geometries.get(record.key)!,
          this.styles.get(record.key),
          (this.children.get(record.key) ?? []).map((child) => built.get(child.key)!),
        ),
      );
    }
    return {
      roots: (this.children.get(null) ?? []).map((record) => built.get(record.key)!),
      elements: this.elements,
      hits: this.hits,
      misses: this.misses,
    };
  }

  private readGeometry(record: Registration): Geometry {
    const { container, boundary, store, scale } = this.options;
    const previous = boundary ? store.byKey.get(boundary.key) : undefined;
    const rect =
      record.element === container ? this.origin : record.element.getBoundingClientRect();
    this.elements += 1;
    const parent = record.parent ? this.geometries.get(record.parent) : undefined;
    const absoluteX = (rect.left - this.origin.left) / scale.x + (previous?.layout.absoluteX ?? 0);
    const absoluteY = (rect.top - this.origin.top) / scale.y + (previous?.layout.absoluteY ?? 0);
    const geometry: Geometry = {
      absoluteX,
      absoluteY,
      width: rect.width / scale.x,
      height: rect.height / scale.y,
      x: parent ? absoluteX - parent.absoluteX : (rect.left - this.origin.left) / scale.x,
      y: parent ? absoluteY - parent.absoluteY : (rect.top - this.origin.top) / scale.y,
    };
    if (record === boundary && previous) {
      geometry.x = previous.layout.x;
      geometry.y = previous.layout.y;
      geometry.absoluteX = previous.layout.absoluteX;
      geometry.absoluteY = previous.layout.absoluteY;
    }
    this.geometries.set(record.key, geometry);
    return geometry;
  }

  private wrapperSignature(record: Registration): number {
    const { registrations, container, cache } = this.options;
    const registeredParent = record.parent ? registrations.get(record.parent)?.element : container;
    let ancestor = record.element.parentElement;
    let value = '';
    while (ancestor && ancestor !== registeredParent && ancestor !== container) {
      value += `${ancestor.tagName}:${ancestor.className}:${ancestor.getAttribute('style') ?? ''};`;
      ancestor = ancestor.parentElement;
    }
    return value ? cache.intern(value) : 0;
  }

  private inheritedKey(record: Registration): number {
    const { cache } = this.options;
    const parent = record.parent ? (this.contextKeys.get(record.parent) ?? 0) : 0;
    let typography = '';
    for (const name of typographyKeys) {
      if (record.props[name] !== undefined) typography += `${name}=${token(record.props[name])}`;
    }
    const own = cache.intern(
      `${record.element.className}|${record.type}|${styleSignature(record.props.style, true)}|${typography}`,
    );
    const key = cache.intern(`context:${parent}:${this.wrapperSignature(record)}:${own}`);
    this.contextKeys.set(record.key, key);
    return key;
  }

  private collectSubtree(record: Registration, result: Registration[] = []): Registration[] {
    result.push(record);
    for (const child of this.children.get(record.key) ?? []) this.collectSubtree(child, result);
    return result;
  }

  private unregisteredContent(node: Node): string {
    if (node.nodeType === Node.TEXT_NODE) return token(node.textContent);
    if (!(node instanceof Element) || node.hasAttribute('data-layout-key')) return '';
    let value = node.tagName;
    for (const attribute of Array.from(node.attributes))
      value += `${attribute.name}=${token(attribute.value)}`;
    for (let child = node.firstChild; child; child = child.nextSibling)
      value += this.unregisteredContent(child);
    return value;
  }

  private domFingerprint(record: Registration): number {
    if (record.type === 'text' || record.type === 'cell-text') return 0;
    if (record.domFingerprint !== undefined) return record.domFingerprint;
    const children = this.children.get(record.key) ?? [];
    const element = record.element;
    if (
      element.childNodes.length === children.length &&
      element.childElementCount === children.length &&
      children.every((child) => child.element.parentElement === element)
    ) {
      record.domFingerprint = 0;
      return 0;
    }
    let value = '';
    for (let child = element.firstChild; child; child = child.nextSibling)
      value += this.unregisteredContent(child);
    record.domFingerprint = value ? this.options.cache.intern(value) : 0;
    return record.domFingerprint;
  }

  private templateSignature(
    records: Registration[],
    contextKey: number,
    geometry: Geometry,
  ): string {
    const { cache } = this.options;
    const positions = new Map(records.map((record, index) => [record.key, index]));
    const parts = records.map((record, index) =>
      [
        positions.get(record.parent ?? '') ?? -1,
        cache.propsSignature(record, index === 0),
        this.domFingerprint(record),
        this.wrapperSignature(record),
        token(record.element.className),
        record.templateUnsafe ? token(record.key) : '',
      ].join(','),
    );
    return `${token(records[0].props.layoutTemplate)}:${cache.fontRevision}:${cache.cssRevision}:${geometry.width}:${geometry.height}:${contextKey};${parts.join('|')}`;
  }

  private walk(record: Registration, skipTemplate = false): void {
    const { cache, enabled } = this.options;
    const geometry = this.readGeometry(record);
    let contextKey = this.inheritedKey(record);
    if (record.props.layoutRoot) {
      const style = cache.boundaryStyle(record, geometry, contextKey, enabled);
      contextKey = cache.intern(`resolved:${contextKey}:${style.inheritedId}`);
      this.contextKeys.set(record.key, contextKey);
    }
    const subtree =
      enabled && record.props.layoutRoot && record.props.layoutTemplate && !skipTemplate
        ? this.collectSubtree(record)
        : undefined;
    const key = subtree ? this.templateSignature(subtree, contextKey, geometry) : undefined;
    const cached = key ? cache.getTemplate(key) : undefined;
    if (cached && subtree && cached.geometry.length === subtree.length) {
      this.hits += 1;
      for (let index = 0; index < subtree.length; index += 1) {
        const item = subtree[index];
        const relative = cached.geometry[index];
        this.geometries.set(
          item.key,
          index === 0
            ? geometry
            : {
                ...relative,
                absoluteX: geometry.absoluteX + relative.absoluteX,
                absoluteY: geometry.absoluteY + relative.absoluteY,
              },
        );
        this.styles.set(item.key, cached.styles[index]);
        const context = cached.boundaries[index];
        if (index > 0 && context && item.props.layoutRoot) cache.boundaries.set(item.key, context);
      }
      return;
    }
    if (subtree) this.misses += 1;
    this.styles.set(record.key, cache.textStyle(record, contextKey, enabled));
    for (const child of this.children.get(record.key) ?? [])
      this.walk(child, skipTemplate || Boolean(subtree));
    if (subtree && key) {
      cache.setTemplate(key, {
        geometry: subtree.map((item) => {
          const value = this.geometries.get(item.key)!;
          return {
            ...value,
            absoluteX: value.absoluteX - geometry.absoluteX,
            absoluteY: value.absoluteY - geometry.absoluteY,
          };
        }),
        styles: subtree.map((item) => this.styles.get(item.key)),
        boundaries: subtree.map((item) =>
          item.props.layoutRoot ? cache.boundaries.get(item.key) : undefined,
        ),
      });
    }
  }
}
