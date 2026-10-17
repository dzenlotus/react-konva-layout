import { memo, useCallback, useLayoutEffect, useRef } from 'react';
import type Konva from 'konva';
import { Group, Rect, Text } from 'react-konva';
import { DrawNode } from './DrawNode';
import {
  DEFAULT_LOD_FILL,
  DEFAULT_LOD_STROKE,
  dispatchEvents,
  emptyEvents,
  hasEvents,
  type Island,
  type Settings,
} from './scene';

export interface IslandRenderOptions {
  config: Settings;
  requestFocus: (island: Island) => void;
  register: (island: Island, group: Konva.Group, cache: boolean) => () => void;
}

export interface IslandProps extends IslandRenderOptions {
  island: Island;
  lod: boolean;
  minimal: boolean;
  local?: boolean;
}

export const SceneIsland = memo(function SceneIsland({
  island,
  config,
  lod,
  minimal,
  requestFocus,
  register,
  local = false,
}: IslandProps) {
  const group = useRef<Konva.Group | null>(null);
  const { item } = island;
  const ancestors = local ? emptyEvents : island.ancestors;
  const lowDetail = lod && !island.shell;
  useLayoutEffect(() => {
    if (group.current) return register(island, group.current, !lowDetail);
  }, [island, config.compact, config.cache, config.budget, config.cacheRatio, lowDetail, register]);
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
      dispatchEvents(item.props.onDblClick, ancestors.doubleClick);
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
          dispatchEvents(item.props.onClick, ancestors.click);
        }}
        onTap={() => {
          dispatchEvents(item.props.onClick, ancestors.click);
        }}
        onDblClick={doubleClick}
        onDblTap={() => {
          dispatchEvents(item.props.onDblTap, ancestors.doubleTap);
          requestFocus(island);
        }}
      >
        <Rect
          width={width}
          height={height}
          fill={item.props.fill ?? DEFAULT_LOD_FILL}
          stroke={minimal ? undefined : (item.props.stroke ?? DEFAULT_LOD_STROKE)}
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
      x={local ? item.layout.x : item.layout.absoluteX}
      y={local ? item.layout.y : item.layout.absoluteY}
      forceGroup={!island.shell}
      groupRef={setGroup}
      ancestors={ancestors}
      listening={island.listening}
      inheritedInteraction={local && hasEvents(island.ancestors)}
    />
  );
});
