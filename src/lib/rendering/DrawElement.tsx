import { memo, useLayoutEffect, useRef, type ReactNode } from 'react';
import type Konva from 'konva';
import { Group, Rect, Shape, Text } from 'react-konva';
import type { SceneElement } from '../model';
import type { LayoutPlacement } from '../types';
import { textAttributes } from './text';
import { dispatchEvents, emptyEvents, hasEvents, isReplacedCell, type Events } from './scene';
import { useCustomContent } from './customContent';

interface DrawProps {
  item: SceneElement;
  compact: boolean;
  optimized: boolean;
  x?: number;
  y?: number;
  forceGroup?: boolean;
  groupRef?: (group: Konva.Group | null) => void;
  ancestors?: Events;
  listening?: boolean;
  inheritedInteraction?: boolean;
  children?: ReactNode;
  ownVisible?: boolean;
  placement?: LayoutPlacement;
  hitRegion?: boolean;
}

// A Shape without sceneFunc emits no scene drawing commands, but still fills the hit graph.
const drawPlacementHit: NonNullable<Konva.ShapeConfig['hitFunc']> = (context, shape) => {
  context.beginPath();
  context.rect(0, 0, shape.width(), shape.height());
  context.closePath();
  context.fillStrokeShape(shape);
};

export const DrawElement = memo(function DrawElement({
  item,
  compact,
  optimized,
  x = item.layout.x,
  y = item.layout.y,
  forceGroup = false,
  groupRef,
  ancestors = emptyEvents,
  listening = true,
  inheritedInteraction = false,
  children,
  ownVisible = true,
  placement,
  hitRegion = false,
}: DrawProps) {
  const { layout, props, textStyle } = item;
  const text = useRef<Konva.Text | null>(null);
  useLayoutEffect(() => {
    // Refresh Konva's line measurement when a webfont loads without replacing the consumer's Text.
    if (textStyle?.fontRevision) text.current?.fire('fontFamilyChange');
  }, [textStyle?.fontRevision]);
  const { width, height } = layout;
  const replaced = isReplacedCell(item);
  const normalVisible = ownVisible && !replaced;
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
    ownVisible,
  });
  const content = (
    <>
      {hitRegion && (
        <Shape
          name="layout-placement-hit"
          width={width}
          height={height}
          fill="#000"
          hitFunc={drawPlacementHit}
          listening={active}
        />
      )}
      {normalVisible && (props.fill || props.stroke || (!optimized && props.onClick)) && (
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
      {normalVisible && optimized && interactive && (
        <Rect
          x={contentX}
          y={contentY}
          width={width}
          height={height}
          fill="transparent"
          listening={active}
        />
      )}
      {normalVisible && textStyle && layout.type !== 'cell-text' && (
        <Text
          ref={text}
          key="layout-text"
          id={grouped ? undefined : layout.id}
          name="text"
          {...textAttributes(props.text ?? '', textStyle)}
          x={contentX + textStyle.paddingLeft}
          y={contentY + textStyle.paddingTop}
          width={Math.max(0, width - textStyle.paddingLeft - textStyle.paddingRight)}
          height={Math.max(0, height - textStyle.paddingTop - textStyle.paddingBottom)}
          listening={active && (props.listening ?? !optimized)}
        />
      )}
      {custom}
      {!replaced &&
        (children ??
          item.children.map((child) => (
            <DrawElement
              key={child.key}
              item={child}
              compact={compact}
              optimized={optimized}
              x={contentX + child.layout.x}
              y={contentY + child.layout.y}
              listening={active}
              inheritedInteraction={bubbling}
            />
          )))}
    </>
  );
  return grouped ? (
    <Group
      ref={groupRef}
      id={layout.id}
      name={placement ? `${layout.type} layout-root-placement` : layout.type}
      layoutRootId={placement?.id}
      x={x}
      y={y}
      width={width}
      height={height}
      listening={active}
      draggable={placement?.draggable}
      dragBoundFunc={placement?.dragBoundFunc}
      onMouseDown={placement?.onMouseDown}
      onTouchStart={placement?.onTouchStart}
      onDragStart={placement?.onDragStart}
      onDragMove={placement?.onDragMove}
      onDragEnd={placement?.onDragEnd}
      onClick={(event) => {
        dispatchEvents(props.onClick, ancestors.click);
        placement?.onClick?.(event);
      }}
      onTap={(event) => {
        dispatchEvents(props.onClick, ancestors.click);
        placement?.onTap?.(event);
      }}
      onDblClick={() => dispatchEvents(props.onDblClick, ancestors.doubleClick)}
      onDblTap={() => dispatchEvents(props.onDblTap, ancestors.doubleTap)}
    >
      {content}
    </Group>
  ) : (
    content
  );
});
