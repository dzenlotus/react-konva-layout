import { useId, useLayoutEffect, useRef, useState, type SyntheticEvent } from 'react'
import { createPortal } from 'react-dom'
import type Konva from 'konva'

export interface EditableTextOverlayProps {
  target: Konva.Text
  value: string
  onCommit: (value: string) => void
  onCancel: () => void
}

const trackedAttributes = [
  'x', 'y', 'scaleX', 'scaleY', 'rotation', 'skewX', 'skewY', 'offsetX', 'offsetY',
  'width', 'height', 'fontSize', 'fontFamily', 'fontStyle', 'fontVariant', 'lineHeight',
  'padding', 'align', 'letterSpacing', 'text', 'wrap', 'direction', 'fill',
]

const stopPropagation = (event: SyntheticEvent) => event.stopPropagation()

function fitHeight(textarea: HTMLTextAreaElement, target: Konva.Text) {
  textarea.style.height = '0px'
  textarea.style.height = `${Math.max(target.height(), textarea.scrollHeight)}px`
}

export default function EditableTextOverlay({
  target, value, onCommit, onCancel,
}: EditableTextOverlayProps) {
  const [draft, setDraft] = useState(value)
  const wrapperRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const finishedRef = useRef(false)
  const composingRef = useRef(false)
  const blurTimerRef = useRef<number | null>(null)
  const updateRef = useRef<(() => void) | null>(null)
  const callbacksRef = useRef({ onCommit, onCancel })
  const namespace = `textEditor${useId().replace(/[^a-zA-Z0-9]/g, '')}`
  const stage = target.getStage()
  const host = stage?.container().parentElement

  useLayoutEffect(() => {
    callbacksRef.current = { onCommit, onCancel }
  })

  function finish(cancel: boolean) {
    if (finishedRef.current) return
    finishedRef.current = true
    if (cancel) callbacksRef.current.onCancel()
    else callbacksRef.current.onCommit(textareaRef.current?.value ?? draft)
  }

  useLayoutEffect(() => {
    const wrapper = wrapperRef.current
    const textarea = textareaRef.current
    const view = host?.ownerDocument.defaultView
    if (!stage || !host || !wrapper || !textarea || !view) return

    finishedRef.current = false
    composingRef.current = false
    setDraft(value)
    textarea.value = value
    let frame: number | null = null

    const update = () => {
      const contentBounds = stage.content.getBoundingClientRect()
      const wrapperBounds = wrapper.getBoundingClientRect()
      const wrapperStyle = view.getComputedStyle(wrapper)
      const wrapperScaleX = wrapperBounds.width / (parseFloat(wrapperStyle.width) || 1)
      const wrapperScaleY = wrapperBounds.height / (parseFloat(wrapperStyle.height) || 1)
      const scaleX = contentBounds.width / (stage.width() || 1) / (wrapperScaleX || 1)
      const scaleY = contentBounds.height / (stage.height() || 1) / (wrapperScaleY || 1)
      const [a, b, c, d, e, f] = target.getAbsoluteTransform().getMatrix()
      const x = (contentBounds.left - wrapperBounds.left) / (wrapperScaleX || 1)
      const y = (contentBounds.top - wrapperBounds.top) / (wrapperScaleY || 1)
      const fontStyle = target.fontStyle()
      const fill = target.fill()

      // Konva transforms use logical CSS pixels; backing-canvas pixelRatio is irrelevant here.
      Object.assign(textarea.style, {
        transform: `matrix(${a * scaleX}, ${b * scaleY}, ${c * scaleX}, ${d * scaleY}, ${x + e * scaleX}, ${y + f * scaleY})`,
        width: `${target.width()}px`,
        fontFamily: target.fontFamily(),
        fontSize: `${target.fontSize()}px`,
        fontStyle: /\b(italic|oblique)\b/.exec(fontStyle)?.[1] ?? 'normal',
        fontWeight: /\b(bold|bolder|lighter|[1-9]\d{0,2}|1000)\b/.exec(fontStyle)?.[1] ?? 'normal',
        fontVariant: target.fontVariant(),
        lineHeight: String(target.lineHeight()),
        letterSpacing: `${target.letterSpacing()}px`,
        padding: `${target.padding()}px`,
        textAlign: target.align(),
        color: typeof fill === 'string' ? fill : 'inherit',
        direction: target.direction(),
        whiteSpace: target.wrap() === 'none' ? 'pre' : 'pre-wrap',
        overflowWrap: target.wrap() === 'char' ? 'anywhere' : 'break-word',
        wordBreak: target.wrap() === 'char' ? 'break-all' : 'normal',
      })
      textarea.wrap = target.wrap() === 'none' ? 'off' : 'soft'
      fitHeight(textarea, target)
    }
    const scheduleUpdate = () => {
      if (frame === null) {
        frame = view.requestAnimationFrame(() => {
          frame = null
          update()
        })
      }
    }
    const events = trackedAttributes.map((attribute) => `${attribute}Change.${namespace}`).join(' ')
    const nodes = [target, ...target.getAncestors()]
    nodes.forEach((node) => node.on(events, scheduleUpdate))
    const observer = new ResizeObserver(scheduleUpdate)
    const observedElements = new Set([host, stage.container(), stage.content, wrapper])
    observedElements.forEach((element) => observer.observe(element))
    const mutations = new MutationObserver(scheduleUpdate)
    const styledElements = new Set([host, stage.container(), stage.content])
    styledElements.forEach((element) => {
      mutations.observe(element, { attributes: true, attributeFilter: ['class', 'style'] })
    })
    view.addEventListener('resize', scheduleUpdate)
    view.addEventListener('scroll', scheduleUpdate, { capture: true, passive: true })
    updateRef.current = update
    update()
    textarea.focus({ preventScroll: true })
    textarea.select()

    return () => {
      finishedRef.current = true
      updateRef.current = null
      nodes.forEach((node) => node.off(events, scheduleUpdate))
      observer.disconnect()
      mutations.disconnect()
      view.removeEventListener('resize', scheduleUpdate)
      view.removeEventListener('scroll', scheduleUpdate, true)
      if (frame !== null) view.cancelAnimationFrame(frame)
      if (blurTimerRef.current !== null) view.clearTimeout(blurTimerRef.current)
      blurTimerRef.current = null
    }
    // A new target starts a draft; updates to its source value must not overwrite typing.
  }, [target, stage, host, namespace])

  useLayoutEffect(() => {
    updateRef.current?.()
  }, [draft])

  if (!host) return null

  return createPortal(
    <div ref={wrapperRef} style={{ position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 10 }}>
      <textarea ref={textareaRef} data-testid="layout-text-editor" aria-label="Редактировать описание"
        value={draft} rows={1} autoFocus spellCheck
        style={{
          position: 'absolute', left: 0, top: 0, margin: 0, border: 0,
          boxSizing: 'border-box', transformOrigin: '0 0', resize: 'none', overflow: 'hidden',
          background: 'transparent', outline: '2px solid #2563eb', outlineOffset: '2px',
          borderRadius: 2, pointerEvents: 'auto', minWidth: 1, maxWidth: 'none', maxHeight: 'none',
        }}
        onChange={(event) => setDraft(event.currentTarget.value)}
        onCompositionStart={() => { composingRef.current = true }}
        onCompositionEnd={() => { composingRef.current = false }}
        onKeyDown={(event) => {
          event.stopPropagation()
          if (composingRef.current || event.nativeEvent.isComposing || event.keyCode === 229) return
          if (event.key === 'Escape') {
            event.preventDefault()
            finish(true)
          } else if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
            event.preventDefault()
            finish(false)
          }
        }}
        onKeyUp={stopPropagation}
        onBlur={() => {
          if (finishedRef.current) return
          // Let the browser flush a final composition/input before saving the native value.
          const view = host.ownerDocument.defaultView
          if (view) blurTimerRef.current = view.setTimeout(() => finish(false), 0)
        }}
        onPointerDown={stopPropagation} onPointerMove={stopPropagation} onPointerUp={stopPropagation}
        onMouseDown={stopPropagation} onMouseMove={stopPropagation} onMouseUp={stopPropagation}
        onTouchStart={stopPropagation} onTouchMove={stopPropagation} onTouchEnd={stopPropagation}
        onClick={stopPropagation} onDoubleClick={stopPropagation} onWheel={stopPropagation}
      />
    </div>, host,
  )
}
