import { memo, useLayoutEffect, useRef, type ReactNode } from 'react';
import type Konva from 'konva';
import { Group, Rect, Text } from 'react-konva';
import type { SceneNode } from '../model';
import { textAttributes } from './text';
import { dispatchEvents, emptyEvents, hasEvents, type BeginEdit, type Events } from './scene';
import { useCustomContent } from './customContent';

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
  const bubbling = inheritedInteraction || interactive || hasEvents(ancestors);
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
  const contentX = grouped ? 0 : x;
  const contentY = grouped ? 0 : y;
  const custom = useCustomContent({
    item,
    textRef: text,
    optimized,
    bubbling,
    active,
    ownVisible,
    beginEdit,
    islandKey,
  });
  const content = (
    <>
      {ownVisible && (props.fill || props.stroke || (!optimized && props.onClick)) && (
        <Rect
          x={contentX}
          y={contentY}
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
          x={contentX}
          y={contentY}
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
          {...textAttributes(props.text ?? '', textStyle)}
          x={contentX + textStyle.paddingLeft}
          y={contentY + textStyle.paddingTop}
          width={Math.max(0, width - textStyle.paddingLeft - textStyle.paddingRight)}
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
            x={contentX + child.layout.x}
            y={contentY + child.layout.y}
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
      onClick={() => dispatchEvents(props.onClick, ancestors.click)}
      onTap={() => dispatchEvents(props.onClick, ancestors.click)}
      onDblClick={() => dispatchEvents(props.onDblClick, ancestors.doubleClick)}
      onDblTap={() => dispatchEvents(props.onDblTap, ancestors.doubleTap)}
    >
      {content}
    </Group>
  ) : (
    content
  );
});
