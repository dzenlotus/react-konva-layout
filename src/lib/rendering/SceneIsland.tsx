import { memo, useCallback, useLayoutEffect, useRef } from 'react';
import type Konva from 'konva';
import { DrawNode } from './DrawNode';
import { emptyEvents, hasEvents, type Island, type Settings } from './scene';

export interface IslandRenderOptions {
  config: Settings;
  register: (island: Island, group: Konva.Group, cache: boolean) => () => void;
}

export interface IslandProps extends IslandRenderOptions {
  island: Island;
  local?: boolean;
  origin?: boolean;
}

export const SceneIsland = memo(function SceneIsland({
  island,
  config,
  register,
  local = false,
  origin = false,
}: IslandProps) {
  const group = useRef<Konva.Group | null>(null);
  const { item } = island;
  const ancestors = local ? emptyEvents : island.ancestors;
  useLayoutEffect(() => {
    if (group.current) return register(island, group.current, true);
  }, [island, config.compact, config.cache, config.budget, config.cacheRatio, register]);
  const setGroup = useCallback((node: Konva.Group | null) => {
    group.current = node;
  }, []);
  return (
    <DrawNode
      item={item}
      compact={config.compact}
      optimized={config.enabled}
      x={origin ? 0 : local ? item.layout.x : item.layout.absoluteX}
      y={origin ? 0 : local ? item.layout.y : item.layout.absoluteY}
      forceGroup={!island.shell}
      groupRef={setGroup}
      ancestors={ancestors}
      listening={island.listening}
      inheritedInteraction={local && hasEvents(island.ancestors)}
    />
  );
});
