import type { SceneNode, PrimitiveProps } from '../model';
import type { PerformanceOptions } from '../types';
import type { Bounds } from '../host';

export const DEFAULT_LOD_FILL = '#e4eadd';
export const DEFAULT_LOD_STROKE = '#a8b69b';

export interface Events {
  click: Array<() => void>;
  doubleClick: Array<() => void>;
  doubleTap: Array<() => void>;
}
export interface Island {
  key: string;
  item: SceneNode;
  shell: boolean;
  bounds: Bounds;
  ancestors: Events;
  listening: boolean;
  complex: boolean;
}
export interface Settings {
  enabled: boolean;
  compact: boolean;
  cull: boolean;
  overscan: number;
  cache: boolean;
  budget: number;
  cacheRatio: number;
  lodScale: number;
}
export const emptyEvents: Events = { click: [], doubleClick: [], doubleTap: [] };

export function hasEvents(events: Events): boolean {
  return events.click.length > 0 || events.doubleClick.length > 0 || events.doubleTap.length > 0;
}

/** Logical ancestors were flattened during scene compilation; preserve their bubbling order. */
export function dispatchEvents(own: (() => void) | undefined, ancestors: Array<() => void>): void {
  own?.();
  ancestors.forEach((callback) => callback());
}
const information = new WeakMap<SceneNode, { bounds: Bounds; roots: boolean; count: number }>();
const descriptorCache = new WeakMap<SceneNode, Island>();
const shells = new WeakMap<SceneNode, SceneNode>();

export function settings(options?: PerformanceOptions, automaticRatio = 1): Settings {
  const enabled = options?.enabled !== false;
  const requestedRatio = options?.cachePixelRatio;
  const ratio =
    typeof requestedRatio === 'number' && Number.isFinite(requestedRatio) && requestedRatio > 0
      ? requestedRatio
      : automaticRatio;
  return {
    enabled,
    compact: enabled && options?.compact !== false,
    cull: enabled && options?.cull !== false,
    overscan: Math.max(0, options?.overscan ?? 144),
    cache: enabled && options?.cache !== false,
    budget: Math.max(0, options?.cacheBudgetMB ?? 32) * 1024 * 1024,
    cacheRatio: Number.isFinite(ratio) && ratio > 0 ? Math.max(0.25, ratio) : 1,
    lodScale: enabled ? (options?.lodScale ?? 0.3) : 0,
  };
}

export function union(a: Bounds, b: Bounds): Bounds {
  const x = Math.min(a.x, b.x),
    y = Math.min(a.y, b.y);
  return {
    x,
    y,
    width: Math.max(a.x + a.width, b.x + b.width) - x,
    height: Math.max(a.y + a.height, b.y + b.height) - y,
  };
}

/** Layout bounds are read once per immutable revision, never from the Konva tree during pan. */
function info(item: SceneNode): { bounds: Bounds; roots: boolean; count: number } {
  const previous = information.get(item);
  if (previous) return previous;
  const { absoluteX: x, absoluteY: y, width, height } = item.layout;
  let bounds: Bounds = { x, y, width, height },
    roots = Boolean(item.props.layoutRoot),
    count = 1;
  for (const child of item.children) {
    const childInfo = info(child);
    bounds = union(bounds, childInfo.bounds);
    roots ||= childInfo.roots;
    count += childInfo.count;
  }
  const result = { bounds, roots, count };
  information.set(item, result);
  return result;
}

function equalEvents(a: Events, b: Events): boolean {
  return (['click', 'doubleClick', 'doubleTap'] as const).every(
    (key) =>
      a[key].length === b[key].length && a[key].every((callback, i) => callback === b[key][i]),
  );
}

function inheritedEvents(props: PrimitiveProps, ancestors: Events): Events {
  return {
    click: props.onClick ? [props.onClick, ...ancestors.click] : ancestors.click,
    doubleClick: props.onDblClick
      ? [props.onDblClick, ...ancestors.doubleClick]
      : ancestors.doubleClick,
    doubleTap: props.onDblTap ? [props.onDblTap, ...ancestors.doubleTap] : ancestors.doubleTap,
  };
}

function hasVisual(props: PrimitiveProps, item: SceneNode): boolean {
  return Boolean(
    props.fill ||
    props.stroke ||
    props.render ||
    item.textStyle ||
    props.onClick ||
    props.onDblClick ||
    props.onDblTap,
  );
}

export function compileIslands(scene: SceneNode[]): Island[] {
  const result: Island[] = [];
  const add = (item: SceneNode, ancestors: Events, listening: boolean, shell = false) => {
    const cached = descriptorCache.get(item);
    if (
      cached &&
      cached.shell === shell &&
      cached.listening === listening &&
      equalEvents(cached.ancestors, ancestors)
    ) {
      result.push(cached);
      return;
    }
    const data = info(item);
    const island: Island = {
      key: `${item.key}${shell ? ':shell' : ''}`,
      item,
      ancestors,
      listening,
      shell,
      bounds: data.bounds,
      complex: !shell && data.count >= 8,
    };
    descriptorCache.set(item, island);
    result.push(island);
  };
  const visit = (item: SceneNode, ancestors: Events, listening: boolean) => {
    const active = listening && item.props.listening !== false;
    if (item.props.layoutRoot || !item.children.some((child) => info(child).roots)) {
      add(item, ancestors, active);
      return;
    }
    if (hasVisual(item.props, item)) {
      let shell = shells.get(item);
      if (!shell) {
        shell = { ...item, children: [] };
        shells.set(item, shell);
      }
      add(shell, ancestors, active, true);
    }
    const events = inheritedEvents(item.props, ancestors);
    item.children.forEach((child) => visit(child, events, active));
  };
  scene.forEach((item) => visit(item, emptyEvents, true));
  return result;
}

export function intersects(a: Bounds, b: Bounds): boolean {
  return (
    a.x <= b.x + b.width && a.x + a.width >= b.x && a.y <= b.y + b.height && a.y + a.height >= b.y
  );
}
