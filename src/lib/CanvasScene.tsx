import {
  Children, cloneElement, forwardRef, isValidElement, memo, useCallback,
  useEffect, useImperativeHandle, useLayoutEffect, useMemo, useRef, useState,
  type ReactElement, type ReactNode,
} from 'react'
import Konva from 'konva'
import { Group, Layer, Rect, Shape, Stage, Text } from 'react-konva'
import EditableTextOverlay from './EditableTextOverlay'
import type {
  CanvasSceneProps, PerformanceOptions, PrimitiveProps, RenderMetrics,
  SceneHandle, SceneNode, ViewTransform,
} from './types'

interface Bounds { x: number; y: number; width: number; height: number }
interface Events {
  click: Array<() => void>; doubleClick: Array<() => void>; doubleTap: Array<() => void>
}
interface Island {
  key: string; item: SceneNode; shell: boolean; bounds: Bounds; ancestors: Events;
  listening: boolean; complex: boolean
}
interface Settings {
  enabled: boolean; compact: boolean; cull: boolean; overscan: number;
  cache: boolean; budget: number; cacheRatio: number; lodScale: number; pixelRatio?: number
}
interface Editing { item: SceneNode; target: Konva.Text; islandKey: string }
interface CacheEntry { group: Konva.Group; reserved: number }
type BeginEdit = (item: SceneNode, target: Konva.Text, islandKey: string) => void
const initialView: ViewTransform = { x: 0, y: 0, scale: 1 }
const emptyEvents: Events = { click: [], doubleClick: [], doubleTap: [] }
const information = new WeakMap<SceneNode, { bounds: Bounds; roots: boolean; count: number }>()
const descriptorCache = new WeakMap<SceneNode, Island>()
const shells = new WeakMap<SceneNode, SceneNode>()

function settings(options?: PerformanceOptions): Settings {
  const enabled = options?.enabled !== false
  return {
    enabled, compact: enabled && options?.compact !== false,
    cull: enabled && options?.cull !== false, overscan: Math.max(0, options?.overscan ?? 144),
    cache: enabled && options?.cache !== false,
    budget: Math.max(0, options?.cacheBudgetMB ?? 32) * 1024 * 1024,
    cacheRatio: Math.min(2, Math.max(0.25, options?.cachePixelRatio ?? 1)),
    lodScale: enabled ? options?.lodScale ?? 0.3 : 0,
    pixelRatio: options?.pixelRatio ?? (enabled ? 1 : undefined),
  }
}

function union(a: Bounds, b: Bounds): Bounds {
  const x = Math.min(a.x, b.x), y = Math.min(a.y, b.y)
  return { x, y, width: Math.max(a.x + a.width, b.x + b.width) - x,
    height: Math.max(a.y + a.height, b.y + b.height) - y }
}

/** Layout bounds are read once per immutable revision, never from the Konva tree during pan. */
function info(item: SceneNode): { bounds: Bounds; roots: boolean; count: number } {
  const previous = information.get(item)
  if (previous) return previous
  const { absoluteX: x, absoluteY: y, width, height } = item.layout
  let bounds: Bounds = { x, y, width, height }, roots = Boolean(item.props.layoutRoot), count = 1
  for (const child of item.children) {
    const childInfo = info(child)
    bounds = union(bounds, childInfo.bounds)
    roots ||= childInfo.roots
    count += childInfo.count
  }
  const result = { bounds, roots, count }
  information.set(item, result)
  return result
}

function equalEvents(a: Events, b: Events): boolean {
  return (['click', 'doubleClick', 'doubleTap'] as const).every(key =>
    a[key].length === b[key].length && a[key].every((callback, i) => callback === b[key][i]))
}

function inheritedEvents(props: PrimitiveProps, ancestors: Events): Events {
  return {
    click: props.onClick ? [props.onClick, ...ancestors.click] : ancestors.click,
    doubleClick: props.onDblClick ? [props.onDblClick, ...ancestors.doubleClick] : ancestors.doubleClick,
    doubleTap: props.onDblTap ? [props.onDblTap, ...ancestors.doubleTap] : ancestors.doubleTap,
  }
}

function hasVisual(props: PrimitiveProps, item: SceneNode): boolean {
  return Boolean(props.fill || props.stroke || props.render || item.textStyle ||
    props.onClick || props.onDblClick || props.onDblTap)
}

function compileIslands(scene: SceneNode[]): Island[] {
  const result: Island[] = []
  const add = (item: SceneNode, ancestors: Events, listening: boolean, shell = false) => {
    const cached = descriptorCache.get(item)
    if (cached && cached.shell === shell && cached.listening === listening && equalEvents(cached.ancestors, ancestors)) {
      result.push(cached)
      return
    }
    const data = info(item)
    const island: Island = { key: `${item.key}${shell ? ':shell' : ''}`, item, ancestors, listening,
      shell, bounds: data.bounds, complex: !shell && data.count >= 8 }
    descriptorCache.set(item, island)
    result.push(island)
  }
  const visit = (item: SceneNode, ancestors: Events, listening: boolean) => {
    const active = listening && item.props.listening !== false
    if (item.props.layoutRoot || !item.children.some(child => info(child).roots)) {
      add(item, ancestors, active)
      return
    }
    if (hasVisual(item.props, item)) {
      let shell = shells.get(item)
      if (!shell) {
        shell = { ...item, children: [] }
        shells.set(item, shell)
      }
      add(shell, ancestors, active, true)
    }
    const events = inheritedEvents(item.props, ancestors)
    item.children.forEach(child => visit(child, events, active))
  }
  scene.forEach(item => visit(item, emptyEvents, true))
  return result
}

function intersects(a: Bounds, b: Bounds): boolean {
  return a.x <= b.x + b.width && a.x + a.width >= b.x &&
    a.y <= b.y + b.height && a.y + a.height >= b.y
}

/** Host shapes without handlers do not need a hit graph. Opaque custom components retain their behavior. */
function decorativeCustom(content: ReactNode, interactive = false): ReactNode {
  return Children.map(content, child => {
    if (!isValidElement(child)) return child
    const element = child as ReactElement<Record<string, unknown>>
    const props = element.props
    const hasHandler = Object.keys(props).some(key => /^on[A-Z]/.test(key) && typeof props[key] === 'function')
    const active = interactive || hasHandler
    // Fragments are transparent; function components can contain their own handlers and stay untouched.
    if (typeof element.type === 'function' || typeof element.type === 'object') return child
    const additions: Record<string, unknown> = {}
    if (typeof element.type === 'string' && element.type !== 'Group' && props.listening === undefined && !active) {
      additions.listening = false
    }
    if (props.children !== undefined) additions.children = decorativeCustom(props.children as ReactNode, active)
    return cloneElement(element, additions)
  })
}

interface DrawProps {
  item: SceneNode; compact: boolean; optimized: boolean; islandKey: string;
  beginEdit: BeginEdit; x?: number; y?: number; forceGroup?: boolean;
  groupRef?: (group: Konva.Group | null) => void; ancestors?: Events; listening?: boolean;
  inheritedInteraction?: boolean
}

const DrawNode = memo(function DrawNode({ item, compact, optimized, islandKey, beginEdit,
  x = item.layout.x, y = item.layout.y, forceGroup = false, groupRef, ancestors = emptyEvents,
  listening = true, inheritedInteraction = false,
}: DrawProps) {
  const { layout, props, textStyle } = item
  const text = useRef<Konva.Text | null>(null)
  useLayoutEffect(() => {
    // Refresh Konva's line measurement when a webfont loads without replacing an active editor's target.
    if (textStyle?.fontRevision) text.current?.fire('fontFamilyChange')
  }, [textStyle?.fontRevision])
  const { width, height } = layout
  const interactive = Boolean(props.onClick || props.onDblClick || props.onDblTap)
  const bubbling = inheritedInteraction || interactive || ancestors.click.length > 0 ||
    ancestors.doubleClick.length > 0 || ancestors.doubleTap.length > 0
  const active = listening && props.listening !== false
  const grouped = forceGroup || !compact || props.layoutRoot || props.render || interactive
  const px = grouped ? 0 : x, py = grouped ? 0 : y
  const custom = useMemo(() => {
    const content = props.render?.({ width, height })
    return optimized ? decorativeCustom(content, bubbling) : content
  }, [props.render, width, height, optimized, bubbling])
  const fire = (own: (() => void) | undefined, callbacks: Array<() => void>) => {
    own?.()
    callbacks.forEach(callback => callback())
  }
  const content = <>
    {(props.fill || props.stroke || (!optimized && props.onClick)) && <Rect
      x={px} y={py} width={width} height={height} fill={props.fill ?? 'transparent'}
      stroke={props.stroke} strokeWidth={props.strokeWidth} cornerRadius={props.cornerRadius}
      listening={active && (props.listening ?? !optimized)} />}
    {((optimized && interactive) || props.editable) && <Rect x={px} y={py} width={width} height={height}
      fill="transparent" listening={active} name={props.editable ? 'layout-text-hit' : undefined}
      onDblClick={props.editable ? () => {
        if (active && text.current) beginEdit(item, text.current, islandKey)
      } : undefined}
      onDblTap={props.editable ? () => {
        if (active && text.current) beginEdit(item, text.current, islandKey)
      } : undefined} />}
    {textStyle && <Text ref={text} key="layout-text" id={grouped ? undefined : layout.id} name="text"
      text={props.text ?? ''} x={px + textStyle.paddingLeft} y={py + textStyle.paddingTop}
      width={Math.max(0, width - textStyle.paddingLeft - textStyle.paddingRight)}
      fontSize={textStyle.fontSize} fontFamily={textStyle.fontFamily} fontStyle={textStyle.fontStyle}
      lineHeight={textStyle.lineHeight} fill={textStyle.color}
      align={textStyle.align} wrap={props.wrap ?? 'word'}
      listening={!props.editable && active && (props.listening ?? !optimized)}
      onDblClick={props.editable ? event => {
        if (active) beginEdit(item, event.target as Konva.Text, islandKey)
      } : undefined}
      onDblTap={props.editable ? event => {
        if (active) beginEdit(item, event.target as Konva.Text, islandKey)
      } : undefined} />}
    {custom}
    {item.children.map(child => <DrawNode key={child.key} item={child} compact={compact}
      optimized={optimized} islandKey={islandKey} beginEdit={beginEdit}
      x={px + child.layout.x} y={py + child.layout.y} listening={active}
      inheritedInteraction={bubbling} />)}
  </>
  return grouped ? <Group ref={groupRef} id={layout.id} name={layout.type} x={x} y={y}
    width={width} height={height} listening={active}
    onClick={() => fire(props.onClick, ancestors.click)} onTap={() => fire(props.onClick, ancestors.click)}
    onDblClick={() => fire(props.onDblClick, ancestors.doubleClick)}
    onDblTap={() => fire(props.onDblTap, ancestors.doubleTap)}>{content}</Group> : content
})

interface IslandProps {
  island: Island; config: Settings; lod: boolean; minimal: boolean; editing: boolean; beginEdit: BeginEdit;
  zoomTo: (island: Island) => void;
  register: (island: Island, group: Konva.Group, cache: boolean) => () => void;
}

const SceneIsland = memo(function SceneIsland({ island, config, lod, minimal, editing, beginEdit, zoomTo, register }: IslandProps) {
  const group = useRef<Konva.Group | null>(null)
  const { item } = island
  const lowDetail = lod && !island.shell && !editing
  useLayoutEffect(() => {
    if (group.current) return register(island, group.current, !lowDetail && !editing)
  }, [island, config.compact, config.cache, config.budget, config.cacheRatio, lowDetail, editing, register])
  const setGroup = useCallback((node: Konva.Group | null) => { group.current = node }, [])
  if (lowDetail) {
    const { width, height, absoluteX, absoluteY, id } = item.layout
    const caption = item.props.lodLabel ?? item.layout.testId ?? id
    const doubleClick = () => {
      item.props.onDblClick?.()
      island.ancestors.doubleClick.forEach(callback => callback())
      zoomTo(island)
    }
    return <Group ref={setGroup} id={id} name="layout-lod" x={absoluteX} y={absoluteY}
      width={width} height={height} listening={island.listening}
      onClick={() => { item.props.onClick?.(); island.ancestors.click.forEach(callback => callback()) }}
      onTap={() => { item.props.onClick?.(); island.ancestors.click.forEach(callback => callback()) }}
      onDblClick={doubleClick} onDblTap={() => {
        item.props.onDblTap?.()
        island.ancestors.doubleTap.forEach(callback => callback())
        zoomTo(island)
      }}>
      <Rect width={width} height={height} fill={item.props.fill ?? '#e4eadd'}
        stroke={minimal ? undefined : item.props.stroke ?? '#a8b69b'} strokeWidth={item.props.strokeWidth ?? 1}
        cornerRadius={minimal ? 0 : item.props.cornerRadius ?? 6} />
      {!minimal && <Text text={caption} x={12} y={12} width={Math.max(0, width - 24)} fontSize={22}
        fill="#34452c" listening={false} />}
    </Group>
  }
  return <DrawNode item={item} compact={config.compact} optimized={config.enabled}
    islandKey={island.key} beginEdit={beginEdit} x={item.layout.absoluteX} y={item.layout.absoluteY}
    forceGroup={!island.shell} groupRef={setGroup} ancestors={island.ancestors} listening={island.listening} />
})

type LogicalClicks = Record<'mouse' | 'touch', { key: string; time: number } | null>
const minimalBatchShapes = new WeakSet<Konva.Node>()

const MinimalBatch = memo(function MinimalBatch({ islands, zoomTo, clicks }: {
  islands: Island[]; zoomTo: (island: Island) => void; clicks: { current: LogicalClicks }
}) {
  const bounds = islands.reduce((bounds, island) => union(bounds, {
    x: island.item.layout.absoluteX, y: island.item.layout.absoluteY,
    width: island.item.layout.width, height: island.item.layout.height,
  }), { x: islands[0].item.layout.absoluteX, y: islands[0].item.layout.absoluteY, width: 0, height: 0 })
  const props = islands[0].item.props
  const sharedPath = useMemo(() => {
    const opaque = (color: string) => /^#(?:[\da-f]{3}|[\da-f]{6})$/i.test(color) ||
      (/^[a-z]+$/i.test(color) && !/^(transparent|currentcolor|inherit|initial|unset|revert)$/i.test(color))
    if (!opaque(props.fill ?? '#e4eadd') || !opaque(props.stroke ?? '#a8b69b')) return false
    // Overlapping strokes need the original per-root fill/stroke order even when both colors are opaque.
    const padding = Math.max(0, props.strokeWidth ?? 1) / 2
    const ordered = islands.map(({ item: { layout } }) => ({ x: layout.absoluteX - padding,
      y: layout.absoluteY - padding, width: layout.width + padding * 2, height: layout.height + padding * 2,
    })).sort((a, b) => a.x - b.x)
    const active: Bounds[] = []
    for (const rect of ordered) {
      for (let i = active.length - 1; i >= 0; i--) {
        const previous = active[i]
        if (previous.x + previous.width < rect.x) active.splice(i, 1)
        else if (intersects(previous, rect)) return false
      }
      active.push(rect)
    }
    return true
  }, [islands, props.fill, props.stroke, props.strokeWidth])
  const pick = (shape: Konva.Shape) => {
    const stage = shape.getStage(), pointer = stage?.getPointerPosition()
    if (!stage || !pointer) return
    const x = (pointer.x - stage.x()) / stage.scaleX(), y = (pointer.y - stage.y()) / stage.scaleY()
    for (let i = islands.length - 1; i >= 0; i--) {
      const island = islands[i], layout = island.item.layout
      if (island.listening && x >= layout.absoluteX && x <= layout.absoluteX + layout.width &&
        y >= layout.absoluteY && y <= layout.absoluteY + layout.height) return island
    }
  }
  const fire = (shape: Konva.Shape, input: 'mouse' | 'touch') => {
    const island = pick(shape)
    if (!island) return
    const props = island.item.props
    const previous = clicks.current[input], now = Date.now()
    const double = previous?.key === island.key && now - previous.time < Konva.dblClickWindow
    clicks.current[input] = double ? null : { key: island.key, time: now }
    props.onClick?.()
    island.ancestors.click.forEach(callback => callback())
    if (double) {
      const kind = input === 'mouse' ? 'doubleClick' : 'doubleTap'
      if (input === 'mouse') props.onDblClick?.()
      else props.onDblTap?.()
      island.ancestors[kind].forEach(callback => callback())
      zoomTo(island)
    }
  }
  return <>
    {islands.map(island => <Group key={island.key} id={island.item.layout.id} name="layout-lod-metadata"
      x={island.item.layout.absoluteX} y={island.item.layout.absoluteY}
      width={island.item.layout.width} height={island.item.layout.height} visible={false} listening={false} />)}
    <Shape ref={node => { if (node) minimalBatchShapes.add(node) }}
      name="layout-lod-batch" x={bounds.x} y={bounds.y} width={bounds.width} height={bounds.height}
      fill={props.fill ?? '#e4eadd'} stroke={props.stroke ?? '#a8b69b'} strokeWidth={props.strokeWidth ?? 1}
      listening={islands.some(island => island.listening)} perfectDrawEnabled={false}
      sceneFunc={(context, shape) => {
        if (sharedPath) context.beginPath()
        for (const island of islands) {
          const layout = island.item.layout
          if (!sharedPath) context.beginPath()
          context.rect(layout.absoluteX - bounds.x, layout.absoluteY - bounds.y, layout.width, layout.height)
          if (!sharedPath) { context.closePath(); context.fillStrokeShape(shape) }
        }
        if (sharedPath) { context.closePath(); context.fillStrokeShape(shape) }
      }}
      hitFunc={(context, shape) => {
        context.beginPath()
        for (const island of islands) if (island.listening) {
          const layout = island.item.layout
          context.rect(layout.absoluteX - bounds.x, layout.absoluteY - bounds.y, layout.width, layout.height)
        }
        context.closePath()
        context.fillStrokeShape(shape)
      }}
      onClick={event => fire(event.target as Konva.Shape, 'mouse')}
      onTap={event => fire(event.target as Konva.Shape, 'touch')} />
  </>
})

const MinimalScene = memo(function MinimalScene({ islands, editingKey, stage, ...props }: {
  islands: Island[]; editingKey?: string; stage: Konva.Stage | null
} & Omit<IslandProps, 'island' | 'lod' | 'minimal' | 'editing'>) {
  const clicks = useRef<LogicalClicks>({ mouse: null, touch: null })
  useEffect(() => {
    if (!stage) return
    const container = stage.container()
    const reset = (event: Event) => {
      if (event.type.endsWith('cancel')) { clicks.current = { mouse: null, touch: null }; return }
      // Public Konva conversion reads the event's client/touch coordinates and the current content rect.
      stage.setPointersPositions(event)
      const pointer = stage.getPointerPosition()
      const target = pointer && stage.getIntersection(pointer)
      if (target && minimalBatchShapes.has(target)) return
      const input = event.type.startsWith('touch') || (event instanceof PointerEvent && event.pointerType === 'touch') ? 'touch' : 'mouse'
      clicks.current[input] = null
    }
    const events = ['pointerdown', 'mousedown', 'touchstart', 'pointercancel', 'touchcancel']
    events.forEach(event => container.addEventListener(event, reset, true))
    return () => events.forEach(event => container.removeEventListener(event, reset, true))
  }, [stage])
  const pieces = useMemo(() => {
    const result: Array<Island | Island[]> = []
    let batch: Island[] = [], style = ''
    for (const island of islands) {
      if (island.shell || island.key === editingKey) {
        if (batch.length) result.push(batch)
        batch = []; style = ''
        result.push(island)
      } else {
        const p = island.item.props, next = `${p.fill ?? '#e4eadd'}|${p.stroke ?? '#a8b69b'}|${p.strokeWidth ?? 1}`
        if (batch.length && next !== style) { result.push(batch); batch = [] }
        batch.push(island); style = next
      }
    }
    if (batch.length) result.push(batch)
    return result
  }, [islands, editingKey])
  return <>{pieces.map(piece => Array.isArray(piece)
    ? <MinimalBatch key={piece[0].key} islands={piece} zoomTo={props.zoomTo} clicks={clicks} />
    : <SceneIsland key={piece.key} island={piece} {...props} lod minimal editing={piece.key === editingKey} />)}</>
})

function allocatedCacheBytes(group: Konva.Group): number {
  const cache = group._getCanvasCache()
  if (!cache) return 0
  return [cache.scene, cache.filter, cache.hit].reduce((bytes, canvas) =>
    bytes + (canvas ? canvas.width * canvas.height * 4 : 0), 0)
}

export default forwardRef<SceneHandle, CanvasSceneProps>(function CanvasScene({
  scene, width, height, options, panZoom = false, onViewChange, onRenderStats, onInvalidate,
}, forwardedRef) {
  const stage = useRef<Konva.Stage | null>(null)
  const layer = useRef<Konva.Layer | null>(null)
  const defaultPixelRatio = useRef<number | null>(null)
  const config = useMemo(() => settings(options), [options?.enabled, options?.compact, options?.cull,
    options?.overscan, options?.cache, options?.cacheBudgetMB, options?.cachePixelRatio,
    options?.lodScale, options?.pixelRatio])
  const islands = useMemo(() => compileIslands(scene), [scene])
  const configRef = useRef(config), islandsRef = useRef(islands)
  const view = useRef<ViewTransform>({ ...initialView })
  const cameraFrame = useRef(0), statsFrame = useRef(0)
  const mounted = useRef(true)
  const cacheEntries = useRef(new Map<string, CacheEntry>())
  const actualBounds = useRef(new WeakMap<SceneNode, Bounds>())
  const [editing, setEditing] = useState<Editing | null>(null)
  const editingRef = useRef<Editing | null>(null)
  const callbacks = useRef({ onViewChange, onRenderStats, onInvalidate })
  const size = useRef({ width, height })
  configRef.current = config
  islandsRef.current = islands
  callbacks.current = { onViewChange, onRenderStats, onInvalidate }
  size.current = { width, height }
  const [selection, setSelection] = useState<{ items: Island[]; lod: boolean; minimal: boolean }>({ items: [], lod: false, minimal: false })
  const selectionRef = useRef(selection)
  selectionRef.current = selection

  const report = useCallback(() => {
    if (!mounted.current || statsFrame.current) return
    statsFrame.current = requestAnimationFrame(() => {
      statsFrame.current = 0
      if (!mounted.current) return
      const drawing = layer.current
      if (!drawing) return
      let groups = 0, shapes = 0
      const count = (node: Konva.Node) => {
        if (node.nodeType === 'Group') groups++
        if (node.nodeType === 'Shape') shapes++
        if (node instanceof Konva.Container) node.getChildren().forEach(count)
      }
      drawing.getChildren().forEach(count)
      const { items, lod, minimal } = selectionRef.current
      const metrics: RenderMetrics = {
        visibleRoots: configRef.current.enabled ? items.filter(item => !item.shell).length : islandsRef.current.filter(item => !item.shell).length,
        totalRoots: islandsRef.current.filter(item => !item.shell).length,
        cachedRoots: cacheEntries.current.size,
        cacheBytes: [...cacheEntries.current.values()].reduce((bytes, entry) => bytes + allocatedCacheBytes(entry.group), 0),
        lod, lodLevel: lod ? minimal ? 'minimal' : 'labels' : 'full', groups, shapes,
      }
      callbacks.current.onRenderStats?.(metrics)
    })
  }, [])

  const selectVisible = useCallback(() => {
    const settings = configRef.current, transform = view.current
    // Overscan is specified in viewport pixels; the extra world gutter covers strokes and render overflow.
    const margin = settings.overscan / transform.scale + 32
    const viewport = { x: -transform.x / transform.scale - margin, y: -transform.y / transform.scale - margin,
      width: size.current.width / transform.scale + margin * 2,
      height: size.current.height / transform.scale + margin * 2 }
    const next = settings.cull ? islandsRef.current.filter(island =>
      island.key === editingRef.current?.islandKey || intersects(actualBounds.current.get(island.item) ?? island.bounds, viewport)) : islandsRef.current
    const lod = transform.scale < settings.lodScale
    const minimal = lod && transform.scale < 0.12
    const previous = selectionRef.current
    if (previous.lod !== lod || previous.minimal !== minimal || previous.items.length !== next.length || previous.items.some((item, i) => item !== next[i])) {
      const selected = { items: next, lod, minimal }
      selectionRef.current = selected
      setSelection(selected)
    }
  }, [])

  const setView = useCallback((next: Partial<ViewTransform>) => {
    const previous = view.current
    const scale = Number.isFinite(next.scale) ? Math.min(8, Math.max(0.05, next.scale!)) : previous.scale
    view.current = {
      x: Number.isFinite(next.x) ? next.x! : previous.x,
      y: Number.isFinite(next.y) ? next.y! : previous.y, scale,
    }
    if (!cameraFrame.current) cameraFrame.current = requestAnimationFrame(() => {
      cameraFrame.current = 0
      const current = view.current
      stage.current?.position({ x: current.x, y: current.y })
      stage.current?.scale({ x: current.scale, y: current.scale })
      stage.current?.batchDraw()
      selectVisible()
      callbacks.current.onViewChange?.({ ...current })
    })
  }, [selectVisible])

  useImperativeHandle(forwardedRef, () => ({
    getStage: () => stage.current, getView: () => ({ ...view.current }), setView,
  }), [setView])

  const register = useCallback((island: Island, group: Konva.Group, allowed: boolean) => {
    const settings = configRef.current
    const previous = cacheEntries.current.get(island.key)
    previous?.group.clearCache()
    cacheEntries.current.delete(island.key)
    if (allowed && settings.cache && island.item.props.cache !== false &&
      (island.complex || island.item.props.cache === true)) {
      // Only newly mounted/changed visible islands inspect drawn bounds. Camera frames only use the cached result.
      const bounds = group.getClientRect({ skipTransform: true })
      if (bounds.width > 0 && bounds.height > 0) {
        actualBounds.current.set(island.item, { ...bounds,
          x: bounds.x + island.item.layout.absoluteX, y: bounds.y + island.item.layout.absoluteY })
        const ratio = settings.cacheRatio
        const cacheWidth = Math.ceil(bounds.width + 4), cacheHeight = Math.ceil(bounds.height + 4)
        // Reserve scene + hit + filter surfaces, including a future lazily allocated hit/filter canvas.
        const reserved = 4 * (Math.ceil(cacheWidth * ratio) * Math.ceil(cacheHeight * ratio) * 2 +
          cacheWidth * cacheHeight)
        const used = [...cacheEntries.current.values()].reduce((bytes, entry) => bytes + entry.reserved, 0)
        if (reserved <= settings.budget - used) {
          group.cache({ x: Math.floor(bounds.x) - 2, y: Math.floor(bounds.y) - 2,
            width: cacheWidth, height: cacheHeight, pixelRatio: ratio, hitCanvasPixelRatio: 1 })
          if (group.isCached()) cacheEntries.current.set(island.key, { group, reserved })
        }
      }
    }
    report()
    return () => {
      group.clearCache()
      if (cacheEntries.current.get(island.key)?.group === group) cacheEntries.current.delete(island.key)
      report()
    }
  }, [report])

  const beginEdit = useCallback<BeginEdit>((item, target, islandKey) => {
    if (editingRef.current || !item.props.editable) return
    const cached = cacheEntries.current.get(islandKey)
    cached?.group.clearCache()
    cacheEntries.current.delete(islandKey)
    const next = { item, target, islandKey }
    editingRef.current = next
    target.hide()
    target.getLayer()?.batchDraw()
    setEditing(next)
    item.props.onEditStart?.()
    report()
  }, [report])

  const finishEdit = useCallback((saved: boolean, text?: string) => {
    const current = editingRef.current
    if (!current) return
    editingRef.current = null
    current.target.show()
    current.target.getLayer()?.batchDraw()
    setEditing(null)
    if (saved && text !== undefined) {
      current.item.props.onTextChange?.(text)
      callbacks.current.onInvalidate?.(current.item.layout.id)
    }
    current.item.props.onEditEnd?.(saved)
    selectVisible()
    report()
  }, [report, selectVisible])

  const zoomTo = useCallback((island: Island) => {
    const scale = Math.max(0.8, configRef.current.lodScale * 1.2)
    const bounds = island.bounds
    setView({ scale, x: size.current.width / 2 - (bounds.x + bounds.width / 2) * scale,
      y: size.current.height / 2 - (bounds.y + bounds.height / 2) * scale })
  }, [setView])

  useLayoutEffect(() => {
    selectVisible()
    report()
  }, [islands, config, width, height, selectVisible, report])

  useLayoutEffect(() => { report() }, [selection, scene, editing, report])

  useLayoutEffect(() => {
    const drawing = layer.current
    if (!drawing) return
    defaultPixelRatio.current ??= drawing.getCanvas().getPixelRatio()
    const ratio = Math.min(3, Math.max(0.5, config.pixelRatio ?? defaultPixelRatio.current))
    drawing.getCanvas().setPixelRatio(ratio)
    drawing.getHitCanvas().setPixelRatio(1)
    drawing.batchDraw()
  }, [config.pixelRatio, width, height])

  useEffect(() => {
    if (!panZoom || !stage.current) return
    const container = stage.current.container()
    const oldTouchAction = container.style.touchAction
    container.style.touchAction = 'none'
    const pointers = new Map<number, { x: number; y: number; startX: number; startY: number;
      canPan: boolean; pointerType: string }>()
    let space = false, dragging = false, lastClickBlock = 0
    let lastPinch: { x: number; y: number; distance: number } | null = null
    const point = (event: { clientX: number; clientY: number }) => {
      const rect = container.getBoundingClientRect()
      return { x: (event.clientX - rect.left) * size.current.width / rect.width,
        y: (event.clientY - rect.top) * size.current.height / rect.height }
    }
    const pinch = () => {
      const [a, b] = [...pointers.values()]
      return a && b ? { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2,
        distance: Math.hypot(a.x - b.x, a.y - b.y) } : null
    }
    const wheel = (event: WheelEvent) => {
      event.preventDefault()
      const position = point(event), current = view.current
      const delta = event.deltaY * (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? height : 1)
      const scale = Math.min(8, Math.max(0.05, current.scale * Math.exp(-delta * 0.0015)))
      setView({ scale, x: position.x - (position.x - current.x) / current.scale * scale,
        y: position.y - (position.y - current.y) / current.scale * scale })
    }
    const down = (event: PointerEvent) => {
      if (event.button !== 0 && event.button !== 1) return
      const position = point(event)
      const background = !stage.current?.getIntersection(position)
      const canPan = event.pointerType === 'touch' || event.button === 1 || space || background
      pointers.set(event.pointerId, { ...position, startX: position.x, startY: position.y,
        canPan, pointerType: event.pointerType })
      if (event.button === 1) event.preventDefault()
      if (pointers.size > 1) lastPinch = pinch()
    }
    const move = (event: PointerEvent) => {
      const previous = pointers.get(event.pointerId)
      if (!previous) return
      const position = point(event)
      pointers.set(event.pointerId, { ...previous, ...position })
      const current = view.current
      const wasDragging = dragging
      if (pointers.size > 1) {
        const next = pinch()
        if (lastPinch && next && lastPinch.distance > 0) {
          const scale = Math.min(8, Math.max(0.05, current.scale * next.distance / lastPinch.distance))
          setView({ scale, x: next.x - (lastPinch.x - current.x) / current.scale * scale,
            y: next.y - (lastPinch.y - current.y) / current.scale * scale })
          dragging = true
        }
        lastPinch = next
      } else if (previous.canPan && (dragging || Math.hypot(position.x - previous.startX, position.y - previous.startY) > 3)) {
        setView({ x: current.x + position.x - previous.x, y: current.y + position.y - previous.y })
        dragging = true
      }
      if (dragging) {
        if (!wasDragging) {
          // Cancel the original press when it becomes a camera gesture, so custom shapes cannot receive a stray tap.
          const rect = container.getBoundingClientRect()
          pointers.forEach((pointer, pointerId) => stage.current?.content.dispatchEvent(new PointerEvent('pointercancel', {
            pointerId, pointerType: pointer.pointerType,
            clientX: rect.left + pointer.x * rect.width / size.current.width,
            clientY: rect.top + pointer.y * rect.height / size.current.height,
          })))
        }
        event.preventDefault()
        container.setPointerCapture?.(event.pointerId)
        lastClickBlock = performance.now()
      }
    }
    const up = (event: PointerEvent) => {
      pointers.delete(event.pointerId)
      if (container.hasPointerCapture?.(event.pointerId)) container.releasePointerCapture(event.pointerId)
      lastPinch = pinch()
      if (!pointers.size) dragging = false
    }
    const keydown = (event: KeyboardEvent) => {
      if (event.code !== 'Space' || (event.target instanceof Element && event.target.closest('input,textarea,button,select,a,[contenteditable]'))) return
      event.preventDefault()
      space = true
      container.style.cursor = 'grab'
    }
    const keyup = (event: KeyboardEvent) => {
      if (event.code === 'Space') { space = false; container.style.cursor = '' }
    }
    const suppressDragClick = (event: Event) => {
      if (performance.now() - lastClickBlock < 150) { event.preventDefault(); event.stopPropagation() }
    }
    const context = (event: Event) => { if (dragging) event.preventDefault() }
    container.addEventListener('wheel', wheel, { passive: false })
    container.addEventListener('pointerdown', down)
    window.addEventListener('pointermove', move, { passive: false })
    window.addEventListener('pointerup', up)
    window.addEventListener('pointercancel', up)
    window.addEventListener('keydown', keydown)
    window.addEventListener('keyup', keyup)
    container.addEventListener('click', suppressDragClick, true)
    container.addEventListener('dblclick', suppressDragClick, true)
    container.addEventListener('contextmenu', context)
    return () => {
      container.style.touchAction = oldTouchAction
      container.style.cursor = ''
      container.removeEventListener('wheel', wheel)
      container.removeEventListener('pointerdown', down)
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      window.removeEventListener('pointercancel', up)
      window.removeEventListener('keydown', keydown)
      window.removeEventListener('keyup', keyup)
      container.removeEventListener('click', suppressDragClick, true)
      container.removeEventListener('dblclick', suppressDragClick, true)
      container.removeEventListener('contextmenu', context)
    }
  }, [panZoom, setView, height])

  useEffect(() => {
    mounted.current = true
    report()
    return () => {
      mounted.current = false
      cancelAnimationFrame(cameraFrame.current)
      cancelAnimationFrame(statsFrame.current)
      cameraFrame.current = 0
      statsFrame.current = 0
      cacheEntries.current.forEach(entry => entry.group.clearCache())
      cacheEntries.current.clear()
      const current = editingRef.current
      if (current) { current.target.show(); current.item.props.onEditEnd?.(false) }
    }
  }, [report])

  return <>
    <Stage width={width} height={height} ref={stage}>
      <Layer ref={layer}>
        {config.enabled ? selection.minimal ? <MinimalScene islands={selection.items} config={config}
          stage={stage.current} editingKey={editing?.islandKey} beginEdit={beginEdit} zoomTo={zoomTo} register={register} /> : selection.items.map(island => <SceneIsland key={island.key} island={island}
          config={config} lod={selection.lod} minimal={selection.minimal} editing={editing?.islandKey === island.key}
          beginEdit={beginEdit} zoomTo={zoomTo} register={register} />) : scene.map(item =>
          <DrawNode key={item.key} item={item} compact={false} optimized={false}
            islandKey={item.key} beginEdit={beginEdit} />)}
      </Layer>
    </Stage>
    {editing && <EditableTextOverlay target={editing.target} value={editing.item.props.text ?? ''}
      onCommit={text => finishEdit(true, text)} onCancel={() => finishEdit(false)} />}
  </>
})
