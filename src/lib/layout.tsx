import {
  createContext, forwardRef, useCallback, useContext, useId, useImperativeHandle,
  useLayoutEffect, useMemo, useRef, useState, type CSSProperties,
} from 'react'
import { createPortal } from 'react-dom'
import CanvasScene from './CanvasScene'
import type {
  BoxProps, FlexProps, LayoutCanvasHandle, LayoutCanvasProps, LayoutContextValue,
  LayoutMetrics, LayoutNode, LayoutNodeType, LayoutProps, LayoutTextProps,
  PrimitiveProps, SceneHandle, SceneNode, TextStyle,
} from './types'
export type * from './types'

interface Registration {
  key: string; parent: string | null; element: HTMLDivElement
  type: LayoutNodeType; props: PrimitiveProps; signature?: { inner?: number; outer?: number }; domFingerprint?: number; domStyle?: string | null; templateUnsafe?: boolean
}
interface LayoutRegistry {
  update(record: Registration): void
  remove(key: string): void
}
interface Geometry {
  x: number; y: number; width: number; height: number; absoluteX: number; absoluteY: number
}
interface BoundaryContext {
  inherited: Array<[string, string]>; inheritedId: number; position: string; width: number; boxSizing: string; transformed: boolean
}
interface TemplateEntry {
  geometry: Geometry[]; styles: Array<TextStyle | undefined>
}
const RegistryContext = createContext<LayoutRegistry | null>(null)
const ParentContext = createContext<string | null>(null)
const LayoutContext = createContext<LayoutContextValue | null>(null)

export function useLayout(): LayoutContextValue {
  const context = useContext(LayoutContext)
  if (!context) throw new Error('useLayout must be used inside LayoutCanvas')
  return context
}

const layoutKeys = [
  'width', 'height', 'minWidth', 'maxWidth', 'minHeight', 'maxHeight', 'gap',
  'padding', 'alignItems', 'justifyContent', 'flexGrow', 'flexShrink', 'flexBasis',
  'flexWrap', 'alignSelf', 'gridTemplateColumns', 'gridTemplateRows', 'columnGap', 'rowGap',
] as const
const typographyKeys = ['fontSize', 'fontFamily', 'fontStyle', 'lineHeight', 'align', 'wrap', 'color'] as const
const visualKeys = [
  'fill', 'stroke', 'strokeWidth', 'cornerRadius', 'render', 'onClick', 'onDblClick',
  'onDblTap', 'listening', 'text', 'wrap', 'editable', 'onTextChange', 'onEditStart',
  'onEditEnd', 'layoutRoot', 'layoutTemplate', 'lodLabel', 'cache', 'id', 'data-testid',
] as const
const geometryKeys = ['x', 'y', 'width', 'height', 'absoluteX', 'absoluteY'] as const
const textStyleKeys = [
  'fontRevision', 'fontSize', 'fontFamily', 'fontStyle', 'lineHeight', 'color', 'align',
  'paddingLeft', 'paddingTop', 'paddingRight', 'paddingBottom',
] as const
const inheritedProperties = [
  'font-family', 'font-size', 'font-style', 'font-weight', 'font-stretch', 'font-variant',
  'line-height', 'letter-spacing', 'word-spacing', 'color', 'text-align', 'text-indent',
  'text-transform', 'white-space', 'word-break', 'overflow-wrap', 'direction',
  'writing-mode', 'text-rendering', 'font-feature-settings', 'font-kerning',
]
const outerPositionKeys = new Set(['left', 'top', 'right', 'bottom', 'inset', 'translate'])
const textStylesLimit = 512
const templateLimit = 128

function sameStyle(left: CSSProperties | undefined, right: CSSProperties | undefined): boolean {
  if (left === right) return true
  if (!left || !right) return !left && !right
  const keys = Object.keys(left) as Array<keyof CSSProperties>
  return keys.length === Object.keys(right).length && keys.every(key => left[key] === right[key])
}
function sameGeometryProps(left: Registration, right: Registration): boolean {
  return left.type === right.type && left.parent === right.parent
    && left.props.id === right.props.id && left.props['data-testid'] === right.props['data-testid']
    && left.props.direction === right.props.direction
    && left.props.text === right.props.text
    && left.props.layoutRoot === right.props.layoutRoot
    && layoutKeys.every(key => left.props[key] === right.props[key])
    && typographyKeys.every(key => left.props[key] === right.props[key])
    && sameStyle(left.props.style, right.props.style)
}
function sameVisualProps(left: PrimitiveProps, right: PrimitiveProps): boolean {
  return left === right || visualKeys.every(key => left[key] === right[key])
}
function sameArray<T>(left: T[], right: T[]): boolean {
  return left.length === right.length && left.every((item, index) => item === right[index])
}
function sameTextStyle(left: TextStyle | undefined, right: TextStyle | undefined): boolean {
  return left === right || Boolean(left && right && textStyleKeys.every(key => left[key] === right[key]))
}
function readTextStyle(element: HTMLDivElement, fontRevision: number): TextStyle {
  const css = getComputedStyle(element)
  const fontSize = parseFloat(css.fontSize) || 16
  return {
    fontRevision, fontSize, fontFamily: css.fontFamily,
    fontStyle: `${css.fontStyle} ${css.fontWeight}`,
    lineHeight: parseFloat(css.lineHeight) / fontSize || 1.2,
    color: css.color, align: css.textAlign,
    paddingLeft: parseFloat(css.paddingLeft) || 0, paddingTop: parseFloat(css.paddingTop) || 0,
    paddingRight: parseFloat(css.paddingRight) || 0, paddingBottom: parseFloat(css.paddingBottom) || 0,
  }
}
function inheritedSnapshot(css: CSSStyleDeclaration): Array<[string, string]> {
  return inheritedProperties.map(name => [name, css.getPropertyValue(name)])
}
function token(value: unknown): string {
  const string = String(value ?? '')
  return `${typeof value}:${string.length}:${string};`
}
function styleSignature(style: CSSProperties | undefined, omitOuterPosition = false): string {
  if (!style) return ''
  return (Object.keys(style) as Array<keyof CSSProperties>).sort()
    .filter(key => !omitOuterPosition || !outerPositionKeys.has(key))
    .map(key => `${key}=${token(style[key])}`).join('')
}
function propsSignature(record: Registration, intern: (value: string) => number, omitOuterPosition = false): number {
  const props = record.props
  const field = omitOuterPosition ? 'outer' : 'inner'
  if (record.signature?.[field] !== undefined) return record.signature[field]!
  let value = `${record.type};`
  if (props.direction !== undefined) value += `direction=${token(props.direction)}`
  for (const key of layoutKeys) if (props[key] !== undefined) value += `${key}=${token(props[key])}`
  for (const key of typographyKeys) if (props[key] !== undefined) value += `${key}=${token(props[key])}`
  value += styleSignature(props.style, omitOuterPosition)
  const fixedText = record.type === 'text' && props.wrap === 'none'
    && (props.width ?? props.style?.width) !== undefined
    && (props.height ?? props.style?.height) !== undefined
  if (record.type === 'text' && !fixedText) value += token(props.text)
  const id = intern(value)
  record.signature = { ...record.signature, [field]: id }
  return id
}
function lruSet<T>(cache: Map<string, T>, key: string, value: T, limit: number): void {
  cache.delete(key)
  cache.set(key, value)
  if (cache.size > limit) cache.delete(cache.keys().next().value!)
}

const debugCss = `
.konva-layout-measure[data-debug="true"] .konva-layout-node {
  outline: 1px solid #00dbed; outline-offset: -1px; -webkit-text-fill-color: transparent;
}
.konva-layout-measure[data-debug="true"] .konva-layout-node::after {
  content: attr(data-layout-label); position: absolute; top: 2px; left: 3px;
  padding: 2px 4px; color: #00343b; -webkit-text-fill-color: #00343b;
  background: #78f2ff; font: 9px/1.2 monospace; white-space: nowrap; z-index: 1;
}`

/** The mounted portal is detached between reads; component state stays alive. */
export const LayoutCanvas = forwardRef<LayoutCanvasHandle, LayoutCanvasProps>(function LayoutCanvas({
  width, height, debug = false, onLayout, onMeasure, onRenderStats, performance: options,
  panZoom, onViewChange, children, style, className,
}, forwardedRef) {
  const host = useRef<HTMLDivElement>(null)
  const sceneHandle = useRef<SceneHandle>(null)
  const [root] = useState(() => {
    const element = document.createElement('div')
    element.className = 'konva-layout-measure'
    element.setAttribute('aria-hidden', 'true')
    Object.assign(element.style, {
      position: 'absolute', left: '0', top: '0', opacity: '0', pointerEvents: 'none',
      zIndex: '1', fontFamily: 'Arial, sans-serif', fontSize: '16px', lineHeight: '1.2',
    })
    return element
  })
  const mounted = useRef(false)
  const debugRef = useRef(debug)
  const optionsRef = useRef(options)
  optionsRef.current = options
  const registrations = useRef(new Map<string, Registration>())
  const sceneByKey = useRef(new Map<string, SceneNode>())
  const layoutById = useRef(new Map<string, LayoutNode>())
  const keyById = useRef(new Map<string, string>())
  const boundaryContexts = useRef(new Map<string, BoundaryContext>())
  const boundaryStyles = useRef(new Map<string, Omit<BoundaryContext, 'width'>>())
  const textStyles = useRef(new Map<string, TextStyle>())
  const templates = useRef(new Map<string, TemplateEntry>())
  const signatureIds = useRef(new Map<string, number>())
  const nextSignatureId = useRef(1)
  const intern = useCallback((value: string): number => {
    const previous = signatureIds.current.get(value)
    if (previous !== undefined) return previous
    const id = nextSignatureId.current++
    lruSet(signatureIds.current, value, id, 8192)
    return id
  }, [])
  const observer = useRef<ResizeObserver | null>(null)
  const mutationObserver = useRef<MutationObserver | null>(null)
  const frame = useRef(0)
  const fontRevision = useRef(0)
  const cssRevision = useRef(0)
  const revision = useRef(0)
  const metrics = useRef<LayoutMetrics | null>(null)
  const callbacks = useRef({ onLayout, onMeasure, onViewChange })
  callbacks.current = { onLayout, onMeasure, onViewChange }
  const snapshot = useRef<SceneNode[]>([])
  const [scene, setScene] = useState<SceneNode[]>([])
  const dirty = useRef(new Set<string>())
  const visualDirty = useRef(new Set<string>())
  const fullDirty = useRef(true)
  const flushRef = useRef<() => void>(() => {})
  const observingMutations = useRef(false)
  const resizeSizes = useRef(new WeakMap<Element, { width: number; height: number }>())
  const unsafeCss = useRef<{ revision: number; selectors: string[]; opaque: boolean }>({ revision: -1, selectors: [], opaque: false })

  const nearestBoundary = useCallback((key: string): string | undefined => {
    let record = registrations.current.get(key)
    while (record) {
      if (record.props.layoutRoot) return record.key
      record = record.parent ? registrations.current.get(record.parent) : undefined
    }
    return undefined
  }, [])
  const enqueue = useCallback(() => {
    if (mounted.current && !frame.current) frame.current = requestAnimationFrame(() => flushRef.current())
  }, [])
  const schedule = useCallback((id?: string) => {
    if (!id) fullDirty.current = true
    else {
      const key = registrations.current.has(id) ? id : keyById.current.get(id)
      const boundary = key ? nearestBoundary(key) : undefined
      if (boundary) dirty.current.add(boundary)
      else fullDirty.current = true
    }
    enqueue()
  }, [enqueue, nearestBoundary])
  const observePortal = useCallback(() => {
    mutationObserver.current?.observe(root, {
      subtree: true, childList: true, characterData: true, attributes: true,
      attributeFilter: ['style', 'class', 'id', 'data-testid'],
    })
    observingMutations.current = true
  }, [root])
  const pausePortal = useCallback(() => {
    mutationObserver.current?.disconnect()
    observingMutations.current = false
  }, [])

  const publish = useCallback((next: SceneNode[], measured: LayoutMetrics) => {
    const previous = snapshot.current
    const changed = !sameArray(previous, next)
    if (changed) {
      snapshot.current = next
      setScene(next)
      if (!sameArray(previous.map(item => item.layout), next.map(item => item.layout))) {
        callbacks.current.onLayout?.(next.map(item => item.layout))
      }
    }
    revision.current += 1
    metrics.current = { ...measured, revision: revision.current }
    callbacks.current.onMeasure?.(metrics.current)
  }, [])

  const reconcile = useCallback((record: Registration, geometry: Geometry,
    textStyle: TextStyle | undefined, children: SceneNode[]): SceneNode => {
    const previous = sceneByKey.current.get(record.key)
    let layout: LayoutNode
    const sameLayout = previous && previous.layout.id === (record.props.id ?? record.key)
      && previous.layout.type === record.type && previous.layout.testId === record.props['data-testid']
      && geometryKeys.every(key => previous.layout[key] === geometry[key])
      && sameArray(previous.layout.children, children.map(child => child.layout))
    if (sameLayout) layout = previous.layout
    else layout = {
      ...geometry, id: record.props.id ?? record.key, type: record.type,
      testId: record.props['data-testid'], children: children.map(child => child.layout),
    }
    if (previous && layout === previous.layout && sameTextStyle(previous.textStyle, textStyle)
      && sameVisualProps(previous.props, record.props) && sameArray(previous.children, children)) return previous
    const item: SceneNode = {
      key: record.key, layout, props: previous && sameVisualProps(previous.props, record.props) ? previous.props : record.props,
      textStyle: previous && sameTextStyle(previous.textStyle, textStyle) ? previous.textStyle : textStyle,
      children, revision: revision.current + 1,
    }
    sceneByKey.current.set(record.key, item)
    if (previous && previous.layout.id !== layout.id) layoutById.current.delete(previous.layout.id)
    layoutById.current.set(layout.id, layout)
    return item
  }, [])

  const replaceSubtrees = useCallback((replacements: Map<string, SceneNode>): SceneNode[] => {
    // Only dirty ancestor paths are rebuilt; unrelated card references survive.
    const affected = new Set<string>()
    for (const key of replacements.keys()) {
      let parent = registrations.current.get(key)?.parent
      while (parent) {
        affected.add(parent)
        parent = registrations.current.get(parent)?.parent
      }
    }
    const patch = (previous: SceneNode): SceneNode => {
      const base = replacements.get(previous.key) ?? previous
      if (!affected.has(previous.key)) return base
      const record = registrations.current.get(previous.key)
      if (!record) return base
      return reconcile(record, base.layout, base.textStyle, base.children.map(patch))
    }
    return snapshot.current.map(patch)
  }, [reconcile])

  const read = useCallback((container: HTMLElement, localBoundary?: Registration) => {
    const measured = { nodes: 0, hits: 0, misses: 0 }
    const ordered = Array.from(container.querySelectorAll<HTMLDivElement>('[data-layout-key]'))
      .map(element => registrations.current.get(element.dataset.layoutKey ?? ''))
      .filter((record): record is Registration => Boolean(record))
    if (localBoundary && ordered[0]?.key !== localBoundary.key) ordered.unshift(localBoundary)
    const recordsByParent = new Map<string | null, Registration[]>()
    const included = new Set(ordered.map(record => record.key))
    for (const record of ordered) {
      const parent = record.parent && included.has(record.parent) ? record.parent : null
      const list = recordsByParent.get(parent) ?? []
      list.push(record)
      recordsByParent.set(parent, list)
    }
    const origin = container.getBoundingClientRect()
    const previousBoundary = localBoundary ? sceneByKey.current.get(localBoundary.key) : undefined
    const baseX = previousBoundary?.layout.absoluteX ?? 0
    const baseY = previousBoundary?.layout.absoluteY ?? 0
    const geometries = new Map<string, Geometry>()
    const styles = new Map<string, TextStyle | undefined>()
    const contextKeys = new Map<string, number>()
    const readGeometry = (record: Registration): Geometry => {
      const rect = record.element === container ? origin : record.element.getBoundingClientRect()
      measured.nodes += 1
      const parent = record.parent ? geometries.get(record.parent) : undefined
      const absoluteX = rect.left - origin.left + baseX
      const absoluteY = rect.top - origin.top + baseY
      const geometry: Geometry = {
        absoluteX, absoluteY, width: rect.width, height: rect.height,
        x: parent ? absoluteX - parent.absoluteX : rect.left - origin.left,
        y: parent ? absoluteY - parent.absoluteY : rect.top - origin.top,
      }
      if (record === localBoundary && previousBoundary) {
        geometry.x = previousBoundary.layout.x
        geometry.y = previousBoundary.layout.y
        geometry.absoluteX = previousBoundary.layout.absoluteX
        geometry.absoluteY = previousBoundary.layout.absoluteY
      }
      geometries.set(record.key, geometry)
      return geometry
    }
    const wrapperSignature = (record: Registration): number => {
      const registeredParent = record.parent ? registrations.current.get(record.parent)?.element : container
      let ancestor = record.element.parentElement
      if (ancestor === registeredParent || ancestor === container) return 0
      let value = ''
      while (ancestor && ancestor !== registeredParent && ancestor !== container) {
        value += `${ancestor.tagName}:${ancestor.className}:${ancestor.getAttribute('style') ?? ''};`
        ancestor = ancestor.parentElement
      }
      return intern(value)
    }
    const inheritedKey = (record: Registration): number => {
      const parentKey = record.parent ? contextKeys.get(record.parent) ?? 0 : 0
      let ownTypography = ''
      for (const name of typographyKeys) if (record.props[name] !== undefined) ownTypography += `${name}=${token(record.props[name])}`
      const own = intern(`${record.element.className}|${record.type}|${styleSignature(record.props.style, true)}|${ownTypography}`)
      const key = intern(`context:${parentKey}:${wrapperSignature(record)}:${own}`)
      contextKeys.set(record.key, key)
      return key
    }
    const readStyle = (record: Registration, contextKey: number): TextStyle | undefined => {
      if (record.type !== 'text') return undefined
      const key = `${fontRevision.current}:${cssRevision.current}:${record.key}:${contextKey}`
      let textStyle = optionsRef.current?.enabled === false ? undefined : textStyles.current.get(key)
      if (!textStyle) {
        textStyle = readTextStyle(record.element, fontRevision.current)
        lruSet(textStyles.current, key, textStyle, textStylesLimit)
      }
      return textStyle
    }
    const descendants = (record: Registration): Registration[] => {
      const result = [record]
      for (const child of recordsByParent.get(record.key) ?? []) result.push(...descendants(child))
      return result
    }
    const unregistered = (node: Node): string => {
      if (node.nodeType === Node.TEXT_NODE) return token(node.textContent)
      if (!(node instanceof Element) || node.hasAttribute('data-layout-key')) return ''
      let result = node.tagName
      for (const attribute of Array.from(node.attributes)) result += `${attribute.name}=${token(attribute.value)}`
      for (let child = node.firstChild; child; child = child.nextSibling) result += unregistered(child)
      return result
    }
    const domFingerprint = (record: Registration): number => {
      if (record.type === 'text') return 0
      if (record.domFingerprint !== undefined) return record.domFingerprint
      const children = recordsByParent.get(record.key) ?? []
      const element = record.element
      if (element.childNodes.length === children.length && element.childElementCount === children.length
        && children.every(child => child.element.parentElement === element)) {
        record.domFingerprint = 0
        return 0
      }
      let value = ''
      for (let child = element.firstChild; child; child = child.nextSibling) value += unregistered(child)
      record.domFingerprint = value ? intern(value) : 0
      return record.domFingerprint
    }
    const templateSignature = (records: Registration[], contextKey: number, geometry: Geometry): string => {
      const position = new Map(records.map((record, index) => [record.key, index]))
      const parts = new Array<string>(records.length)
      for (let index = 0; index < records.length; index += 1) {
        const record = records[index]
        parts[index] = `${position.get(record.parent ?? '') ?? -1},${propsSignature(record, intern, index === 0)},${domFingerprint(record)},${wrapperSignature(record)}${record.templateUnsafe ? ':' + record.key : ''}`
      }
      return `${token(records[0].props.layoutTemplate)}:${fontRevision.current}:${cssRevision.current}:${geometry.width}:${geometry.height}:${contextKey};${parts.join('|')}`
    }
    const walk = (record: Registration, skipTemplate = false): void => {
      const geometry = readGeometry(record)
      let contextKey = inheritedKey(record)
      if (record.props.layoutRoot) {
        const identity = record.props.layoutTemplate && !record.templateUnsafe ? token(record.props.layoutTemplate) : record.key
        const styleKey = `${fontRevision.current}:${cssRevision.current}:${identity}:${geometry.width}:${geometry.height}:${contextKey}`
        let boundaryStyle = optionsRef.current?.enabled === false ? undefined : boundaryStyles.current.get(styleKey)
        if (!boundaryStyle) {
          const css = getComputedStyle(record.element)
          const inherited = inheritedSnapshot(css)
          boundaryStyle = { inherited, inheritedId: intern(inherited.map(([name, value]) => `${name}=${token(value)}`).join('')), position: css.position, boxSizing: css.boxSizing, transformed: css.transform !== 'none' }
          lruSet(boundaryStyles.current, styleKey, boundaryStyle, templateLimit)
        }
        boundaryContexts.current.set(record.key, { ...boundaryStyle, width: geometry.width })
        contextKey = intern(`resolved:${contextKey}:${boundaryStyle.inheritedId}`)
        contextKeys.set(record.key, contextKey)
      }
      const subtree = optionsRef.current?.enabled !== false && record.props.layoutRoot && record.props.layoutTemplate && !skipTemplate ? descendants(record) : undefined
      const key = subtree ? templateSignature(subtree, contextKey, geometry) : undefined
      const cached = key ? templates.current.get(key) : undefined
      if (cached && subtree && cached.geometry.length === subtree.length) {
        measured.hits += 1
        lruSet(templates.current, key!, cached, templateLimit)
        for (let index = 0; index < subtree.length; index += 1) {
          const item = subtree[index]
          const relative = cached.geometry[index]
          geometries.set(item.key, index === 0 ? geometry : {
            ...relative, absoluteX: geometry.absoluteX + relative.absoluteX,
            absoluteY: geometry.absoluteY + relative.absoluteY,
          })
          styles.set(item.key, cached.styles[index])
        }
        return
      }
      if (subtree) measured.misses += 1
      styles.set(record.key, readStyle(record, contextKey))
      for (const child of recordsByParent.get(record.key) ?? []) walk(child, skipTemplate || Boolean(subtree))
      if (subtree && key) lruSet(templates.current, key, {
        geometry: subtree.map(item => {
          const itemGeometry = geometries.get(item.key)!
          return { ...itemGeometry, absoluteX: itemGeometry.absoluteX - geometry.absoluteX, absoluteY: itemGeometry.absoluteY - geometry.absoluteY }
        }),
        styles: subtree.map(item => styles.get(item.key)),
      }, templateLimit)
    }
    for (const record of recordsByParent.get(null) ?? []) walk(record)
    const built = new Map<string, SceneNode>()
    for (let index = ordered.length - 1; index >= 0; index -= 1) {
      const record = ordered[index]
      built.set(record.key, reconcile(record, geometries.get(record.key)!, styles.get(record.key),
        (recordsByParent.get(record.key) ?? []).map(child => built.get(child.key)!)))
    }
    return { roots: (recordsByParent.get(null) ?? []).map(record => built.get(record.key)!), ...measured }
  }, [intern, reconcile])

  const measureFull = useCallback(() => {
    const viewTransform = root.style.transform
    root.style.opacity = debugRef.current ? '1' : '0'
    root.dataset.layoutState = debugRef.current ? 'debug' : 'measuring'
    if (host.current) host.current.dataset.layoutState = root.dataset.layoutState
    pausePortal()
    root.style.transform = ''
    if (root.parentElement !== host.current) host.current?.appendChild(root)
    try { return read(root) }
    finally {
      root.style.transform = viewTransform
      if (!debugRef.current) root.remove()
      root.dataset.layoutState = debugRef.current ? 'debug' : 'idle'
      if (host.current) host.current.dataset.layoutState = root.dataset.layoutState
      observePortal()
    }
  }, [observePortal, pausePortal, read, root])

  const measureLocal = useCallback((record: Registration) => {
    const previous = sceneByKey.current.get(record.key)
    const context = boundaryContexts.current.get(record.key)
    const explicitWidth = record.props.width ?? record.props.style?.width
    // Intrinsic-width flex/grid items can redistribute siblings after a text edit.
    if (!previous || !context || explicitWidth === undefined || explicitWidth === 'auto'
      || context.boxSizing !== 'border-box' || context.transformed) return null
    const css = record.props.style
    if ((css?.bottom !== undefined && css.bottom !== 'auto') || css?.inset !== undefined
      || css?.insetBlock !== undefined || css?.insetBlockEnd !== undefined || css?.transform) return null
    if (unsafeCss.current.revision !== cssRevision.current) {
      const selectors: string[] = []
      let opaque = false
      const collect = (rules: CSSRuleList) => {
        for (const rule of Array.from(rules)) {
          if (rule instanceof CSSStyleRule) {
            const structural = /:(?:nth(?:-last)?|first|last|only)-(?:child|of-type)|[+~]|:has\(/.test(rule.selectorText)
            const anchored = ['bottom', 'inset', 'inset-block', 'inset-block-end'].some(name => {
              const value = rule.style.getPropertyValue(name)
              return value && value !== 'auto'
            })
            if (structural || anchored) selectors.push(...rule.selectorText.split(','))
            if ('cssRules' in rule) collect((rule as CSSStyleRule & { cssRules: CSSRuleList }).cssRules)
          } else if (rule instanceof CSSImportRule) {
            try { if (rule.styleSheet) collect(rule.styleSheet.cssRules); else opaque = true } catch { opaque = true }
          } else if ('cssRules' in rule) collect((rule as CSSGroupingRule).cssRules)
        }
      }
      for (const sheet of Array.from(document.styleSheets)) {
        try { collect(sheet.cssRules) } catch { opaque = true }
      }
      unsafeCss.current = { revision: cssRevision.current, selectors, opaque }
    }
    if (unsafeCss.current.opaque) return null
    const candidates: Element[] = [record.element, ...record.element.querySelectorAll('*')]
    let ancestorCandidate = record.element.parentElement
    while (ancestorCandidate && ancestorCandidate !== root) { candidates.push(ancestorCandidate); ancestorCandidate = ancestorCandidate.parentElement }
    for (const selector of unsafeCss.current.selectors) {
      // A shallow clone changes sibling selectors. Fall back if its final subject can occur here.
      const subject = selector.replace(/:[\w-]+\([^)]*\)/g, '').replace(/:(?:nth(?:-last)?|first|last|only)-[\w-]+/g, '')
        .trim().split(/[\s>+~]+/).at(-1) || '*'
      try { if (candidates.some(element => element.matches(subject))) return null } catch { return null }
    }
    if (debugRef.current) {
      pausePortal()
      const viewTransform = root.style.transform
      root.style.transform = ''
      try {
        const result = read(record.element, record)
        const next = result.roots[0]
        return { ...result, fallback: !next || (context.position !== 'absolute' && context.position !== 'fixed'
          && (next.layout.width !== previous.layout.width || next.layout.height !== previous.layout.height)) }
      } finally { root.style.transform = viewTransform; observePortal() }
    }
    pausePortal()
    const container = root.cloneNode(false) as HTMLDivElement
    container.dataset.layoutScope = 'local'
    container.dataset.layoutState = 'measuring'
    container.dataset.debug = 'false'
    container.style.transform = ''
    const ancestors: HTMLElement[] = []
    let ancestor = record.element.parentElement
    while (ancestor && ancestor !== root) { ancestors.unshift(ancestor); ancestor = ancestor.parentElement }
    let parent: HTMLElement = container
    for (const original of ancestors) {
      const clone = original.cloneNode(false) as HTMLElement
      // Ancestors preserve selector/inheritance context, while one card supplies the content.
      const ancestorScene = sceneByKey.current.get(original.dataset.layoutKey ?? '')
      if (ancestorScene) {
        clone.style.width = `${ancestorScene.layout.width}px`
        clone.style.height = `${ancestorScene.layout.height}px`
        clone.style.boxSizing = 'border-box'
      }
      parent.appendChild(clone)
      parent = clone
    }
    const originalParent = record.element.parentNode!
    const nextSibling = record.element.nextSibling
    const previousStyle = record.element.style.cssText
    Object.assign(record.element.style, {
      width: `${previous.layout.width}px`, boxSizing: 'border-box', position: context.position === 'fixed' ? 'fixed' : 'absolute',
    })
    parent.appendChild(record.element)
    host.current?.appendChild(container)
    try {
      // The container may contain positional ancestor shells. Use the card as the origin.
      const result = read(record.element, record)
      const next = result.roots[0]
      return { ...result, fallback: !next || (context.position !== 'absolute' && context.position !== 'fixed'
        && (next.layout.width !== previous.layout.width || next.layout.height !== previous.layout.height)) }
    } finally {
      boundaryContexts.current.set(record.key, context)
      record.element.style.cssText = previousStyle
      originalParent.insertBefore(record.element, nextSibling)
      container.remove()
      observePortal()
    }
  }, [observePortal, pausePortal, read, root])

  const flush = useCallback(() => {
    frame.current = 0
    if (!mounted.current || !host.current?.isConnected) return
    const started = performance.now()
    const pending = [...dirty.current]
    const visual = [...visualDirty.current]
    const needsFull = optionsRef.current?.enabled === false || fullDirty.current || snapshot.current.length === 0
    dirty.current.clear()
    visualDirty.current.clear()
    fullDirty.current = false
    let next = snapshot.current
    let scope: LayoutMetrics['scope'] = 'visual'
    let measuredNodes = 0
    let templateHits = 0
    let templateMisses = 0
    let measuredRoots: string[] = []
    let fallback = needsFull
    if (!fallback && pending.length) {
      scope = 'local'
      const selected = pending.filter(key => {
        let parent = registrations.current.get(key)?.parent
        while (parent) {
          if (dirty.current.has(parent) || pending.includes(parent)) return false
          parent = registrations.current.get(parent)?.parent
        }
        return true
      })
      const replacements = new Map<string, SceneNode>()
      for (const key of selected) {
        const record = registrations.current.get(key)
        const result = record ? measureLocal(record) : null
        if (!result) { fallback = true; break }
        measuredNodes += result.nodes
        templateHits += result.hits
        templateMisses += result.misses
        measuredRoots.push(record!.props.id ?? key)
        if (result.fallback) { fallback = true; break }
        replacements.set(key, result.roots[0])
      }
      if (!fallback) next = replaceSubtrees(replacements)
    }
    if (fallback) {
      const result = measureFull()
      scope = 'full'
      next = result.roots
      measuredNodes += result.nodes
      templateHits += result.hits
      templateMisses += result.misses
      measuredRoots = [...new Set([...measuredRoots, ...result.roots.map(item => item.layout.id)])]
    }
    if (visual.length) {
      const replacements = new Map<string, SceneNode>()
      for (const key of visual) {
        const record = registrations.current.get(key)
        const previous = sceneByKey.current.get(key)
        if (record && previous) replacements.set(key,
          reconcile(record, previous.layout, previous.textStyle, previous.children))
      }
      if (replacements.size) {
        // Local/full geometry has already been reconciled; patch its current tree.
        const previousSnapshot = snapshot.current
        snapshot.current = next
        next = replaceSubtrees(replacements)
        snapshot.current = previousSnapshot
      }
    }
    publish(next, {
      scope, measuredNodes, measuredRoots, durationMs: performance.now() - started,
      templateHits, templateMisses, revision: revision.current + 1,
    })
  }, [measureFull, measureLocal, publish, reconcile, replaceSubtrees])
  flushRef.current = flush

  const registry = useMemo<LayoutRegistry>(() => ({
    update(record) {
      const previous = registrations.current.get(record.key)
      if (previous) {
        if (sameGeometryProps(previous, record)) record.signature = previous.signature
        record.domFingerprint = previous.domFingerprint
      }
      record.domStyle = record.element.getAttribute('style')
      record.templateUnsafe = previous?.templateUnsafe
      registrations.current.set(record.key, record)
      if (previous?.props.id && previous.props.id !== record.props.id) keyById.current.delete(previous.props.id)
      if (record.props.id) keyById.current.set(record.props.id, record.key)
      if (debugRef.current && record.props.layoutRoot) observer.current?.observe(record.element)
      if (!previous || !sameGeometryProps(previous, record)) {
        // Changing a boundary's own constraints requires its parent layout context.
        if (previous && previous.props.layoutRoot && !sameGeometryProps(previous, record)) {
          fullDirty.current = true
          enqueue()
        } else schedule(record.key)
      } else if (!sameVisualProps(previous.props, record.props)) {
        visualDirty.current.add(record.key)
        enqueue()
      }
    },
    remove(key) {
      const record = registrations.current.get(key)
      if (record) {
        observer.current?.unobserve(record.element)
        schedule(record.parent ?? undefined)
      }
      registrations.current.delete(key)
      if (record?.props.id) keyById.current.delete(record.props.id)
      const previous = sceneByKey.current.get(key)
      if (previous) layoutById.current.delete(previous.layout.id)
      sceneByKey.current.delete(key)
      boundaryContexts.current.delete(key)
    },
  }), [enqueue, schedule])

  const invalidate = useCallback((id?: string) => {
    if (!id) {
      cssRevision.current += 1
      templates.current.clear()
      boundaryStyles.current.clear()
      textStyles.current.clear()
    }
    schedule(id)
  }, [schedule])
  const viewChanged = useCallback((view: { x: number; y: number; scale: number }) => {
    root.style.transformOrigin = '0 0'
    root.style.transform = `translate(${view.x}px, ${view.y}px) scale(${view.scale})`
    callbacks.current.onViewChange?.(view)
  }, [root])
  const context = useMemo<LayoutContextValue>(() => ({
    invalidate,
    getLayout: id => layoutById.current.get(id),
    getMetrics: () => metrics.current,
  }), [invalidate])
  useImperativeHandle(forwardedRef, () => ({
    ...context, remeasure: invalidate,
    getStage: () => sceneHandle.current?.getStage() ?? null,
    getView: () => sceneHandle.current?.getView() ?? { x: 0, y: 0, scale: 1 },
    setView: view => sceneHandle.current?.setView(view),
  }), [context, invalidate])

  const previousCanvasSize = useRef({ width, height })
  useLayoutEffect(() => {
    const expected = host.current && resizeSizes.current.get(host.current)
    if (expected && host.current) resizeSizes.current.set(host.current, {
      width: expected.width + width - previousCanvasSize.current.width,
      height: expected.height + height - previousCanvasSize.current.height,
    })
    previousCanvasSize.current = { width, height }
    debugRef.current = debug
    root.style.width = `${width}px`
    root.style.height = `${height}px`
    root.dataset.debug = String(debug)
    if (!debug) root.remove()
    for (const record of registrations.current.values()) {
      if (record.props.layoutRoot) {
        if (debug) observer.current?.observe(record.element)
        else observer.current?.unobserve(record.element)
      }
    }
    schedule()
  }, [debug, width, height, root, schedule])
  const previousHostStyle = useRef({ style, className })
  useLayoutEffect(() => {
    if (previousHostStyle.current.className !== className || !sameStyle(previousHostStyle.current.style, style)) {
      cssRevision.current += 1
      textStyles.current.clear()
      boundaryStyles.current.clear()
      templates.current.clear()
      schedule()
    }
    previousHostStyle.current = { style, className }
  }, [className, schedule, style])

  useLayoutEffect(() => {
    mounted.current = true
    const resizeObserver = new ResizeObserver(entries => {
      let hostChanged = false
      for (const entry of entries) {
        if (!entry.target.isConnected || (!entry.contentRect.width && !entry.contentRect.height)) continue
        const previous = resizeSizes.current.get(entry.target)
        const next = { width: entry.contentRect.width, height: entry.contentRect.height }
        resizeSizes.current.set(entry.target, next)
        if (!previous || (previous.width === next.width && previous.height === next.height)) continue
        if (entry.target === host.current) hostChanged = true
        else if (debugRef.current) schedule((entry.target as HTMLElement).dataset.layoutKey)
      }
      if (hostChanged) schedule()
    })
    observer.current = resizeObserver
    resizeObserver.observe(host.current!)
    resizeObserver.observe(root)
    if (debugRef.current) for (const record of registrations.current.values()) {
      if (record.props.layoutRoot) resizeObserver.observe(record.element)
    }
    const mutations = new MutationObserver(records => {
      if (!observingMutations.current) return
      if (records.some(record => (record.type === 'attributes' && record.target !== root)
        || (record.target instanceof Element ? record.target : record.target.parentElement)?.closest('style'))) {
        cssRevision.current += 1
        templates.current.clear()
        boundaryStyles.current.clear()
        textStyles.current.clear()
      }
      for (const mutation of records) {
        if (mutation.target === root && mutation.type === 'attributes') continue
        const element = mutation.target instanceof Element ? mutation.target : mutation.target.parentElement
        const primitive = element?.closest<HTMLElement>('[data-layout-key]')
        if (mutation.type === 'attributes' && element === primitive) {
          const record = registrations.current.get(primitive?.dataset.layoutKey ?? '')
          if (record && (mutation.attributeName === 'class' || record.domStyle !== element?.getAttribute('style'))) record.templateUnsafe = true
        }
        if (primitive?.dataset.layoutKey) {
          const record = registrations.current.get(primitive.dataset.layoutKey)
          if (record) record.domFingerprint = undefined
          schedule(primitive.dataset.layoutKey)
        }
        else schedule()
      }
    })
    mutationObserver.current = mutations
    observePortal()
    const globalCssChanged = () => {
      cssRevision.current += 1
      templates.current.clear()
      boundaryStyles.current.clear()
      textStyles.current.clear()
      schedule()
    }
    const stylesObserver = new MutationObserver(globalCssChanged)
    stylesObserver.observe(document.head, { subtree: true, childList: true, characterData: true, attributes: true })
    let active = true
    const fontsChanged = () => {
      fontRevision.current += 1
      cssRevision.current += 1
      textStyles.current.clear()
      boundaryStyles.current.clear()
      templates.current.clear()
      schedule()
    }
    const fontsWereLoading = document.fonts.status === 'loading'
    void document.fonts.ready.then(() => { if (active && fontsWereLoading) fontsChanged() })
    document.fonts.addEventListener('loadingdone', fontsChanged)
    const stylesheetLoaded = (event: Event) => {
      if (event.target instanceof HTMLLinkElement && event.target.rel === 'stylesheet') globalCssChanged()
    }
    window.addEventListener('resize', globalCssChanged)
    document.addEventListener('load', stylesheetLoaded, true)
    schedule()
    return () => {
      active = false
      mounted.current = false
      cancelAnimationFrame(frame.current)
      frame.current = 0
      resizeObserver.disconnect()
      observer.current = null
      pausePortal()
      mutationObserver.current = null
      stylesObserver.disconnect()
      document.fonts.removeEventListener('loadingdone', fontsChanged)
      window.removeEventListener('resize', globalCssChanged)
      document.removeEventListener('load', stylesheetLoaded, true)
      root.remove()
    }
  }, [observePortal, pausePortal, root, schedule])

  return <LayoutContext.Provider value={context}>
    <div ref={host} className={className} data-layout-state={debug ? 'debug' : 'idle'}
      style={{ ...style, position: 'relative', width, height }}>
      <CanvasScene ref={sceneHandle} scene={scene} width={width} height={height} options={options}
        panZoom={panZoom} onViewChange={viewChanged} onRenderStats={onRenderStats} onInvalidate={schedule} />
      {createPortal(<><style>{debugCss}</style><RegistryContext.Provider value={registry}>{children}</RegistryContext.Provider></>, root)}
    </div>
  </LayoutContext.Provider>
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
  for (const name of layoutKeys) if (props[name] !== undefined) Object.assign(layoutStyle, { [name]: props[name] })
  if (type === 'text') Object.assign(layoutStyle, {
    fontSize: props.fontSize ?? 16, fontFamily: props.fontFamily ?? 'Arial, sans-serif',
    fontStyle: props.fontStyle?.includes('italic') ? 'italic' : 'normal',
    fontWeight: props.fontStyle?.includes('bold') ? 'bold' : 'normal',
    lineHeight: props.lineHeight ?? 1.2, color: props.color ?? '#17202a', textAlign: props.align ?? 'left',
    whiteSpace: props.wrap === 'none' ? 'pre' : 'pre-wrap',
    overflowWrap: props.wrap === 'char' ? 'anywhere' : 'break-word',
  })
  return <ParentContext.Provider value={key}>
    <div ref={element} id={props.id} data-testid={props['data-testid']}
      className="konva-layout-node" data-layout-key={key}
      data-layout-root={props.layoutRoot ? 'true' : undefined}
      data-layout-label={`${type}${props.id ? ` · ${props.id}` : ''}`}
      style={{ ...layoutStyle, ...props.style, pointerEvents: 'none' }}>
      {type === 'text' ? props.text : props.children}
    </div>
  </ParentContext.Provider>
}
export function Flex(props: FlexProps) { return <Primitive type="flex" props={props} /> }
export function Row(props: LayoutProps) { return <Primitive type="row" props={props} /> }
export function Col(props: LayoutProps) { return <Primitive type="col" props={props} /> }
export function Grid(props: LayoutProps) { return <Primitive type="grid" props={props} /> }
export function Box(props: BoxProps) { return <Primitive type="box" props={props} /> }
export function LayoutText(props: LayoutTextProps) { return <Primitive type="text" props={props} /> }
