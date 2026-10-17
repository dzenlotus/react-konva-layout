import {
  Children,
  cloneElement,
  isValidElement,
  memo,
  useCallback,
  useLayoutEffect,
  useMemo,
  useRef,
  type ReactElement,
  type ReactNode,
  type Ref,
} from 'react';
import type Konva from 'konva';
import { Group, Rect, Text } from 'react-konva';
import type { SceneNode } from '../model';
import type { CellTextRenderProps } from '../types';
import { effectiveWrap } from './text';
import { emptyEvents, type Events, type Island, type Settings } from './scene';

export type BeginEdit = (item: SceneNode, target: Konva.Text, islandKey: string) => void;

/** Host shapes without handlers do not need a hit graph. Opaque custom components retain their behavior. */
function decorativeCustom(content: ReactNode, interactive = false): ReactNode {
  return Children.map(content, (child) => {
    if (!isValidElement(child)) return child;
    const element = child as ReactElement<Record<string, unknown>>;
    const props = element.props;
    const hasHandler = Object.keys(props).some(
      (key) => /^on[A-Z]/.test(key) && typeof props[key] === 'function',
    );
    const active = interactive || hasHandler;
    // Fragments are transparent; function components can contain their own handlers and stay untouched.
    if (typeof element.type === 'function' || typeof element.type === 'object') return child;
    const additions: Record<string, unknown> = {};
    if (
      typeof element.type === 'string' &&
      element.type !== 'Group' &&
      props.listening === undefined &&
      !active
    ) {
      additions.listening = false;
    }
    if (props.children !== undefined)
      additions.children = decorativeCustom(props.children as ReactNode, active);
    return cloneElement(element, additions);
  });
}

interface DrawProps {
  item: SceneNode;
  compact: boolean;
  optimized: boolean;
  islandKey: string;
  beginEdit: BeginEdit;
  x?: number;
  y?: number;
  forceGroup?: boolean;
  groupRef?: (group: Konva.Group | null) => void;
  ancestors?: Events;
  listening?: boolean;
  inheritedInteraction?: boolean;
  children?: ReactNode;
  ownVisible?: boolean;
}

export const DrawNode = memo(function DrawNode({
  item,
  compact,
  optimized,
  islandKey,
  beginEdit,
  x = item.layout.x,
  y = item.layout.y,
  forceGroup = false,
  groupRef,
  ancestors = emptyEvents,
  listening = true,
  inheritedInteraction = false,
  children,
  ownVisible = true,
}: DrawProps) {
  const { layout, props, textStyle } = item;
  const text = useRef<Konva.Text | null>(null);
  useLayoutEffect(() => {
    // Refresh Konva's line measurement when a webfont loads without replacing an active editor's target.
    if (textStyle?.fontRevision) text.current?.fire('fontFamilyChange');
  }, [textStyle?.fontRevision]);
  const { width, height } = layout;
  const interactive = Boolean(props.onClick || props.onDblClick || props.onDblTap);
  const bubbling =
    inheritedInteraction ||
    interactive ||
    ancestors.click.length > 0 ||
    ancestors.doubleClick.length > 0 ||
    ancestors.doubleTap.length > 0;
  const active = listening && props.listening !== false;
  const grouped =
    forceGroup ||
    !compact ||
    props.layoutRoot ||
    props.render ||
    props.renderText ||
    interactive ||
    layout.type === 'flex' ||
    layout.type === 'cell' ||
    layout.type === 'cell-text';
  const px = grouped ? 0 : x,
    py = grouped ? 0 : y;
  const custom = useMemo(() => {
    if (!ownVisible) return null;
    const content =
      props.renderText && textStyle
        ? props.renderText({
            x: textStyle.paddingLeft,
            y: textStyle.paddingTop,
            width: Math.max(0, width - textStyle.paddingLeft - textStyle.paddingRight),
            height: Math.max(0, height - textStyle.paddingTop - textStyle.paddingBottom),
            text: props.text ?? '',
            fontSize: textStyle.fontSize,
            fontFamily: textStyle.fontFamily,
            fontStyle: textStyle.fontStyle,
            lineHeight: textStyle.lineHeight,
            fill: textStyle.color,
            align: textStyle.align as CellTextRenderProps['align'],
            wrap: effectiveWrap(textStyle),
            direction: textStyle.direction,
            fontVariant: textStyle.fontVariant,
            letterSpacing: parseFloat(textStyle.letterSpacing ?? '0') || 0,
          })
        : props.render?.({ x: 0, y: 0, width, height });
    const decorative = optimized ? decorativeCustom(content, bubbling) : content;
    if (layout.type !== 'cell-text') return decorative;
    let bound = false;
    const bindText = (nodes: ReactNode): ReactNode =>
      Children.map(nodes, (child) => {
        if (!isValidElement(child)) return child;
        const element = child as ReactElement<Record<string, unknown>>;
        if (element.type === Text && !bound) {
          bound = true;
          const existingRef = element.props.ref as Ref<Konva.Text> | undefined;
          const edit = () => {
            if (active && props.editable && text.current) beginEdit(item, text.current, islandKey);
          };
          return cloneElement(element, {
            ref: (node: Konva.Text | null) => {
              text.current = node;
              if (typeof existingRef === 'function') {
                const cleanup = existingRef(node);
                if (cleanup)
                  return () => {
                    text.current = null;
                    cleanup();
                  };
              } else if (existingRef) existingRef.current = node;
            },
            ...(props.editable
              ? {
                  listening: element.props.listening ?? active,
                  onDblClick: (event: Konva.KonvaEventObject<MouseEvent>) => {
                    (
                      element.props.onDblClick as
                        ((event: Konva.KonvaEventObject<MouseEvent>) => void) | undefined
                    )?.(event);
                    edit();
                  },
                  onDblTap: (event: Konva.KonvaEventObject<TouchEvent>) => {
                    (
                      element.props.onDblTap as
                        ((event: Konva.KonvaEventObject<TouchEvent>) => void) | undefined
                    )?.(event);
                    edit();
                  },
                }
              : {}),
          });
        }
        if (typeof element.type === 'function' || typeof element.type === 'object') return child;
        return element.props.children === undefined
          ? child
          : cloneElement(element, {
              children: bindText(element.props.children as ReactNode),
            });
      });
    return bindText(decorative);
  }, [
    props.render,
    props.renderText,
    props.editable,
    props.text,
    props.wrap,
    width,
    height,
    textStyle,
    optimized,
    bubbling,
    ownVisible,
    layout.type,
    active,
    beginEdit,
    item,
    islandKey,
  ]);
  const fire = (own: (() => void) | undefined, callbacks: Array<() => void>) => {
    own?.();
    callbacks.forEach((callback) => callback());
  };
  const content = (
    <>
      {ownVisible && (props.fill || props.stroke || (!optimized && props.onClick)) && (
        <Rect
          x={px}
          y={py}
          width={width}
          height={height}
          fill={props.fill ?? 'transparent'}
          stroke={props.stroke}
          strokeWidth={props.strokeWidth}
          cornerRadius={props.cornerRadius}
          listening={active && (props.listening ?? !optimized)}
        />
      )}
      {ownVisible && ((optimized && interactive) || props.editable) && (
        <Rect
          x={px}
          y={py}
          width={width}
          height={height}
          fill="transparent"
          listening={active}
          name={props.editable ? 'layout-text-hit' : undefined}
          onDblClick={
            props.editable
              ? () => {
                  if (active && text.current) beginEdit(item, text.current, islandKey);
                }
              : undefined
          }
          onDblTap={
            props.editable
              ? () => {
                  if (active && text.current) beginEdit(item, text.current, islandKey);
                }
              : undefined
          }
        />
      )}
      {ownVisible && textStyle && layout.type !== 'cell-text' && (
        <Text
          ref={text}
          key="layout-text"
          id={grouped ? undefined : layout.id}
          name="text"
          text={props.text ?? ''}
          x={px + textStyle.paddingLeft}
          y={py + textStyle.paddingTop}
          width={Math.max(0, width - textStyle.paddingLeft - textStyle.paddingRight)}
          fontSize={textStyle.fontSize}
          fontFamily={textStyle.fontFamily}
          fontStyle={textStyle.fontStyle}
          lineHeight={textStyle.lineHeight}
          fill={textStyle.color}
          direction={textStyle.direction}
          fontVariant={textStyle.fontVariant}
          letterSpacing={parseFloat(textStyle.letterSpacing ?? '0') || 0}
          align={textStyle.align}
          wrap={effectiveWrap(textStyle)}
          listening={!props.editable && active && (props.listening ?? !optimized)}
          onDblClick={
            props.editable
              ? (event) => {
                  if (active) beginEdit(item, event.target as Konva.Text, islandKey);
                }
              : undefined
          }
          onDblTap={
            props.editable
              ? (event) => {
                  if (active) beginEdit(item, event.target as Konva.Text, islandKey);
                }
              : undefined
          }
        />
      )}
      {custom}
      {children ??
        item.children.map((child) => (
          <DrawNode
            key={child.key}
            item={child}
            compact={compact}
            optimized={optimized}
            islandKey={islandKey}
            beginEdit={beginEdit}
            x={px + child.layout.x}
            y={py + child.layout.y}
            listening={active}
            inheritedInteraction={bubbling}
          />
        ))}
    </>
  );
  return grouped ? (
    <Group
      ref={groupRef}
      id={layout.id}
      name={layout.type}
      x={x}
      y={y}
      width={width}
      height={height}
      listening={active}
      onClick={() => fire(props.onClick, ancestors.click)}
      onTap={() => fire(props.onClick, ancestors.click)}
      onDblClick={() => fire(props.onDblClick, ancestors.doubleClick)}
      onDblTap={() => fire(props.onDblTap, ancestors.doubleTap)}
    >
      {content}
    </Group>
  ) : (
    content
  );
});

export interface IslandProps {
  island: Island;
  config: Settings;
  lod: boolean;
  minimal: boolean;
  editing: boolean;
  beginEdit: BeginEdit;
  requestFocus: (island: Island) => void;
  register: (island: Island, group: Konva.Group, cache: boolean) => () => void;
  local?: boolean;
}

export const SceneIsland = memo(function SceneIsland({
  island,
  config,
  lod,
  minimal,
  editing,
  beginEdit,
  requestFocus,
  register,
  local = false,
}: IslandProps) {
  const group = useRef<Konva.Group | null>(null);
  const { item } = island;
  const ancestors = local ? emptyEvents : island.ancestors;
  const lowDetail = lod && !island.shell && !editing;
  useLayoutEffect(() => {
    if (group.current) return register(island, group.current, !lowDetail && !editing);
  }, [
    island,
    config.compact,
    config.cache,
    config.budget,
    config.cacheRatio,
    lowDetail,
    editing,
    register,
  ]);
  const setGroup = useCallback((node: Konva.Group | null) => {
    group.current = node;
  }, []);
  if (lowDetail) {
    const { width, height, absoluteX, absoluteY, id } = item.layout;
    if (minimal)
      return (
        <Group
          ref={setGroup}
          id={id}
          name="layout-lod-metadata"
          x={local ? item.layout.x : absoluteX}
          y={local ? item.layout.y : absoluteY}
          width={width}
          height={height}
          visible={false}
          listening={false}
        />
      );
    const caption = item.props.lodLabel ?? item.layout.testId ?? id;
    const doubleClick = () => {
      item.props.onDblClick?.();
      ancestors.doubleClick.forEach((callback) => callback());
      requestFocus(island);
    };
    return (
      <Group
        ref={setGroup}
        id={id}
        name="layout-lod"
        x={local ? item.layout.x : absoluteX}
        y={local ? item.layout.y : absoluteY}
        width={width}
        height={height}
        listening={island.listening}
        onClick={() => {
          item.props.onClick?.();
          ancestors.click.forEach((callback) => callback());
        }}
        onTap={() => {
          item.props.onClick?.();
          ancestors.click.forEach((callback) => callback());
        }}
        onDblClick={doubleClick}
        onDblTap={() => {
          item.props.onDblTap?.();
          ancestors.doubleTap.forEach((callback) => callback());
          requestFocus(island);
        }}
      >
        <Rect
          width={width}
          height={height}
          fill={item.props.fill ?? '#e4eadd'}
          stroke={minimal ? undefined : (item.props.stroke ?? '#a8b69b')}
          strokeWidth={item.props.strokeWidth ?? 1}
          cornerRadius={minimal ? 0 : (item.props.cornerRadius ?? 6)}
        />
        {!minimal && (
          <Text
            text={caption}
            x={12}
            y={12}
            width={Math.max(0, width - 24)}
            fontSize={22}
            fill="#34452c"
            listening={false}
          />
        )}
      </Group>
    );
  }
  return (
    <DrawNode
      item={item}
      compact={config.compact}
      optimized={config.enabled}
      islandKey={island.key}
      beginEdit={beginEdit}
      x={local ? item.layout.x : item.layout.absoluteX}
      y={local ? item.layout.y : item.layout.absoluteY}
      forceGroup={!island.shell}
      groupRef={setGroup}
      ancestors={ancestors}
      listening={island.listening}
      inheritedInteraction={
        local &&
        (island.ancestors.click.length > 0 ||
          island.ancestors.doubleClick.length > 0 ||
          island.ancestors.doubleTap.length > 0)
      }
    />
  );
});
