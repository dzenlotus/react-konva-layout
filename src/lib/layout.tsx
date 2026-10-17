import {
  createContext,
  forwardRef,
  useCallback,
  useContext,
  useId,
  useImperativeHandle,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from 'react'
import { createPortal } from 'react-dom'
import { Group, Layer, Rect, Stage, Text } from 'react-konva'

export type LayoutNodeType = 'flex' | 'row' | 'col' | 'grid' | 'box' | 'text'

export interface LayoutNode {
  id: string
  type: LayoutNodeType
  x: number
  y: number
  width: number
  height: number
  absoluteX: number
  absoluteY: number
  testId?: string
  children: LayoutNode[]
}

type LayoutStyles = Pick<
  CSSProperties,
  | 'width'
  | 'height'
  | 'minWidth'
  | 'maxWidth'
  | 'minHeight'
  | 'maxHeight'
  | 'gap'
  | 'padding'
  | 'alignItems'
  | 'justifyContent'
  | 'flexGrow'
  | 'flexShrink'
  | 'flexBasis'
  | 'flexWrap'
  | 'alignSelf'
  | 'gridTemplateColumns'
  | 'gridTemplateRows'
  | 'columnGap'
  | 'rowGap'
>

export interface LayoutProps extends LayoutStyles {
  id?: string
  'data-testid'?: string
  children?: ReactNode
  style?: CSSProperties
  fill?: string
  stroke?: string
  strokeWidth?: number
  cornerRadius?: number
  onClick?: () => void
}

export interface FlexProps extends LayoutProps {
  direction?: CSSProperties['flexDirection']
}

export interface BoxProps extends LayoutProps {
  render?: (size: { width: number; height: number }) => ReactNode
}

export interface LayoutTextProps extends LayoutProps {
  text: string
  fontSize?: number
  fontFamily?: string
  fontStyle?: string
  lineHeight?: number
  color?: string
  align?: 'left' | 'center' | 'right' | 'justify'
}

export interface LayoutCanvasProps {
  width: number
  height: number
  debug?: boolean
  onLayout?: (tree: LayoutNode[]) => void
  children: ReactNode
  style?: CSSProperties
  className?: string
}

export interface LayoutCanvasHandle {
  remeasure: () => void
}

interface TextStyle {
  fontRevision: number
  fontSize: number
  fontFamily: string
  fontStyle: string
  lineHeight: number
  color: string
  align: string
  paddingLeft: number
  paddingTop: number
  paddingRight: number
  paddingBottom: number
}

type PrimitiveProps = BoxProps & FlexProps & Partial<LayoutTextProps>

interface Registration {
  key: string
  parent: string | null
  element: HTMLDivElement
  type: LayoutNodeType
  props: PrimitiveProps
}

interface SceneNode {
  key: string
  layout: LayoutNode
  props: PrimitiveProps
  textStyle?: TextStyle
  children: SceneNode[]
}

interface LayoutRegistry {
  update: (registration: Registration) => void
  remove: (key: string) => void
}

const RegistryContext = createContext<LayoutRegistry | null>(null)
const ParentContext = createContext<string | null>(null)

const layoutKeys = [
  'width', 'height', 'minWidth', 'maxWidth', 'minHeight', 'maxHeight',
  'gap', 'padding', 'alignItems', 'justifyContent', 'flexGrow', 'flexShrink',
  'flexBasis', 'flexWrap', 'alignSelf', 'gridTemplateColumns',
  'gridTemplateRows', 'columnGap', 'rowGap',
] as const

const visualKeys = [
  'fill', 'stroke', 'strokeWidth', 'cornerRadius', 'render', 'onClick', 'text',
] as const

function sameScene(previous: SceneNode[], next: SceneNode[]): boolean {
  return previous.length === next.length && previous.every((item, index) => {
    const other = next[index]
    return item.layout.id === other.layout.id
      && visualKeys.every((key) => item.props[key] === other.props[key])
      && JSON.stringify(item.textStyle) === JSON.stringify(other.textStyle)
      && sameScene(item.children, other.children)
  })
}

function readTextStyle(element: HTMLDivElement, fontRevision: number): TextStyle {
  const css = getComputedStyle(element)
  const fontSize = parseFloat(css.fontSize)
  return {
    fontRevision,
    fontSize,
    fontFamily: css.fontFamily,
    fontStyle: `${css.fontStyle} ${css.fontWeight}`,
    lineHeight: parseFloat(css.lineHeight) / fontSize || 1.2,
    color: css.color,
    align: css.textAlign,
    paddingLeft: parseFloat(css.paddingLeft) || 0,
    paddingTop: parseFloat(css.paddingTop) || 0,
    paddingRight: parseFloat(css.paddingRight) || 0,
    paddingBottom: parseFloat(css.paddingBottom) || 0,
  }
}

function DrawNode({ item }: { item: SceneNode }) {
  const { layout, props, textStyle, children } = item
  const { width, height } = layout
  return (
    <Group id={layout.id} name={layout.type} x={layout.x} y={layout.y} width={width} height={height}
      onClick={props.onClick} onTap={props.onClick}>
      {(props.fill || props.stroke || props.onClick) && (
        <Rect width={width} height={height} fill={props.fill ?? 'transparent'}
          stroke={props.stroke} strokeWidth={props.strokeWidth}
          cornerRadius={props.cornerRadius} />
      )}
      {textStyle && (
        // Natural height avoids clipping the final line at fractional DOM line-box heights.
        <Text key={textStyle.fontRevision} text={props.text ?? ''}
          x={textStyle.paddingLeft} y={textStyle.paddingTop}
          width={Math.max(0, width - textStyle.paddingLeft - textStyle.paddingRight)}
          fontSize={textStyle.fontSize} fontFamily={textStyle.fontFamily}
          fontStyle={textStyle.fontStyle} lineHeight={textStyle.lineHeight}
          fill={textStyle.color} align={textStyle.align} wrap="word" />
      )}
      {props.render?.({ width, height })}
      {children.map((child) => <DrawNode key={child.key} item={child} />)}
    </Group>
  )
}

const debugCss = `
  .konva-layout-measure[data-debug="true"] .konva-layout-node {
    outline: 1px solid #00dbed;
    outline-offset: -1px;
    -webkit-text-fill-color: transparent;
  }
  .konva-layout-measure[data-debug="true"] .konva-layout-node::after {
    content: attr(data-layout-label);
    position: absolute;
    top: 2px;
    left: 3px;
    padding: 2px 4px;
    color: #00343b;
    -webkit-text-fill-color: #00343b;
    background: #78f2ff;
    font: 9px/1.2 monospace;
    white-space: nowrap;
    z-index: 1;
  }
`

/** Portal components stay mounted; their DOM is attached only for measurement/debug. */
export const LayoutCanvas = forwardRef<LayoutCanvasHandle, LayoutCanvasProps>(function LayoutCanvas({
  width, height, debug = false, onLayout, children, style, className,
}, forwardedRef) {
  const host = useRef<HTMLDivElement>(null)
  const [root] = useState(() => {
    const element = document.createElement('div')
    element.className = 'konva-layout-measure'
    element.setAttribute('aria-hidden', 'true')
    Object.assign(element.style, {
      position: 'absolute', left: '0', top: '0', opacity: '0',
      pointerEvents: 'none', zIndex: '1', fontFamily: 'Arial, sans-serif',
      fontSize: '16px', lineHeight: '1.2',
    })
    return element
  })
  const mounted = useRef(false)
  const debugRef = useRef(debug)
  const registrations = useRef(new Map<string, Registration>())
  const observer = useRef<ResizeObserver | null>(null)
  const frame = useRef(0)
  const fontRevision = useRef(0)
  const onLayoutRef = useRef(onLayout)
  const signature = useRef<string | null>(null)
  const snapshot = useRef<SceneNode[]>([])
  const [scene, setScene] = useState<SceneNode[]>([])

  useLayoutEffect(() => { onLayoutRef.current = onLayout }, [onLayout])

  const measure = useCallback(() => {
    frame.current = 0
    if (!mounted.current || !host.current?.isConnected) return
    const element = root
    element.style.opacity = debugRef.current ? '1' : '0'
    element.dataset.layoutState = debugRef.current ? 'debug' : 'measuring'
    host.current.dataset.layoutState = element.dataset.layoutState
    if (element.parentElement !== host.current) host.current.appendChild(element)
    try {
      const origin = element.getBoundingClientRect()
      const ordered = Array.from(element.querySelectorAll<HTMLDivElement>('[data-layout-key]'))
        .map((element) => registrations.current.get(element.dataset.layoutKey ?? ''))
        .filter((record): record is Registration => Boolean(record))
      // Read all bounds before updating React, so one frame has one browser layout pass.
      const bounds = new Map(ordered.map((record) => [record.key, record.element.getBoundingClientRect()]))
      const items = new Map<string, SceneNode>()
      const roots: SceneNode[] = []

      for (const record of ordered) {
        const rect = bounds.get(record.key)!
        const parentRect = (record.parent && bounds.get(record.parent)) || origin
        const item: SceneNode = {
          key: record.key,
          layout: {
            id: record.props.id ?? record.key,
            type: record.type,
            x: rect.left - parentRect.left,
            y: rect.top - parentRect.top,
            width: rect.width,
            height: rect.height,
            absoluteX: rect.left - origin.left,
            absoluteY: rect.top - origin.top,
            testId: record.props['data-testid'],
            children: [],
          },
          props: record.props,
          textStyle: record.type === 'text' ? readTextStyle(record.element, fontRevision.current) : undefined,
          children: [],
        }
        items.set(record.key, item)
        const parent = record.parent ? items.get(record.parent) : undefined
        if (parent) {
          parent.children.push(item)
          parent.layout.children.push(item.layout)
        } else roots.push(item)
      }

      const tree = roots.map((item) => item.layout)
      const nextSignature = JSON.stringify(tree)
      const layoutChanged = nextSignature !== signature.current
      if (layoutChanged || !sameScene(snapshot.current, roots)) {
        snapshot.current = roots
        setScene(roots)
      }
      if (layoutChanged) {
        signature.current = nextSignature
        onLayoutRef.current?.(tree)
      }
    } finally {
      // Detaching the portal removes all measurement HTML without resetting React state.
      if (!mounted.current || !debugRef.current) element.remove()
      element.style.opacity = debugRef.current ? '1' : '0'
      element.dataset.layoutState = debugRef.current ? 'debug' : 'idle'
      if (host.current) host.current.dataset.layoutState = element.dataset.layoutState
    }
  }, [root])

  const schedule = useCallback(() => {
    if (mounted.current && !frame.current) frame.current = requestAnimationFrame(measure)
  }, [measure])

  useImperativeHandle(forwardedRef, () => ({ remeasure: schedule }), [schedule])

  useLayoutEffect(() => {
    debugRef.current = debug
    root.style.width = `${width}px`
    root.style.height = `${height}px`
    root.dataset.debug = String(debug)
    if (!debug) root.remove()
    schedule()
  }, [debug, width, height, root, schedule])

  const registry = useMemo<LayoutRegistry>(() => ({
    update(record) {
      if (!registrations.current.has(record.key)) observer.current?.observe(record.element)
      registrations.current.set(record.key, record)
      schedule()
    },
    remove(key) {
      const record = registrations.current.get(key)
      if (record) observer.current?.unobserve(record.element)
      registrations.current.delete(key)
      schedule()
    },
  }), [schedule])

  useLayoutEffect(() => {
    mounted.current = true
    const element = root
    const resizeObserver = new ResizeObserver((entries) => {
      if (entries.some((entry) => entry.target === host.current
        || entry.contentRect.width > 0 || entry.contentRect.height > 0)) schedule()
    })
    observer.current = resizeObserver
    resizeObserver.observe(host.current!)
    resizeObserver.observe(element)
    registrations.current.forEach((record) => resizeObserver.observe(record.element))
    const mutations = new MutationObserver((records) => {
      if (records.some((record) => record.type !== 'attributes' || record.target !== element)) schedule()
    })
    mutations.observe(element, {
      subtree: true, childList: true, characterData: true,
      attributes: true, attributeFilter: ['style', 'class'],
    })
    let active = true
    const fontsChanged = () => {
      fontRevision.current += 1
      schedule()
    }
    void document.fonts.ready.then(() => { if (active) fontsChanged() })
    document.fonts.addEventListener('loadingdone', fontsChanged)
    window.addEventListener('resize', schedule)
    schedule()
    return () => {
      active = false
      mounted.current = false
      cancelAnimationFrame(frame.current)
      frame.current = 0
      resizeObserver.disconnect()
      observer.current = null
      mutations.disconnect()
      document.fonts.removeEventListener('loadingdone', fontsChanged)
      window.removeEventListener('resize', schedule)
      element.remove()
    }
  }, [root, schedule])

  return (
    <div ref={host} className={className} data-layout-state={debug ? 'debug' : 'idle'}
      style={{ ...style, position: 'relative', width, height }}>
      <Stage width={width} height={height} style={{ position: 'absolute', inset: 0 }}>
        <Layer>{scene.map((item) => <DrawNode key={item.key} item={item} />)}</Layer>
      </Stage>
      {createPortal(<>
        <style>{debugCss}</style>
        <RegistryContext.Provider value={registry}>{children}</RegistryContext.Provider>
      </>, root)}
    </div>
  )
})

function Primitive({ type, props }: { type: LayoutNodeType; props: PrimitiveProps }) {
  const registry = useContext(RegistryContext)
  const parent = useContext(ParentContext)
  const key = useId()
  const element = useRef<HTMLDivElement>(null)
  if (!registry) throw new Error(`${type} must be rendered inside LayoutCanvas`)

  useLayoutEffect(() => {
    if (element.current) registry.update({ key, parent, element: element.current, type, props })
  })
  useLayoutEffect(() => () => registry.remove(key), [registry, key])

  const layoutStyle: CSSProperties = { boxSizing: 'border-box', position: 'relative' }
  if (type === 'flex' || type === 'row' || type === 'col') {
    layoutStyle.display = 'flex'
    layoutStyle.flexDirection = props.direction ?? (type === 'col' ? 'column' : 'row')
  } else if (type === 'grid') layoutStyle.display = 'grid'
  for (const name of layoutKeys) {
    if (props[name] !== undefined) Object.assign(layoutStyle, { [name]: props[name] })
  }
  if (type === 'text') {
    Object.assign(layoutStyle, {
      fontSize: props.fontSize ?? 16,
      fontFamily: props.fontFamily ?? 'Arial, sans-serif',
      fontStyle: props.fontStyle?.includes('italic') ? 'italic' : 'normal',
      fontWeight: props.fontStyle?.includes('bold') ? 'bold' : 'normal',
      lineHeight: props.lineHeight ?? 1.2,
      color: props.color ?? '#17202a',
      textAlign: props.align ?? 'left',
      whiteSpace: 'pre-wrap',
      overflowWrap: 'break-word',
    })
  }

  return (
    <ParentContext.Provider value={key}>
      <div ref={element} id={props.id} data-testid={props['data-testid']}
        className="konva-layout-node" data-layout-key={key}
        data-layout-label={`${type}${props.id ? ` · ${props.id}` : ''}`}
        style={{ ...layoutStyle, ...props.style, pointerEvents: 'none' }}>
        {type === 'text' ? props.text : props.children}
      </div>
    </ParentContext.Provider>
  )
}

export function Flex(props: FlexProps) { return <Primitive type="flex" props={props} /> }
export function Row(props: LayoutProps) { return <Primitive type="row" props={props} /> }
export function Col(props: LayoutProps) { return <Primitive type="col" props={props} /> }
export function Grid(props: LayoutProps) { return <Primitive type="grid" props={props} /> }
export function Box(props: BoxProps) { return <Primitive type="box" props={props} /> }
export function LayoutText(props: LayoutTextProps) { return <Primitive type="text" props={props} /> }
