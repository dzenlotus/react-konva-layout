import { memo, useCallback, useEffect } from 'react';
import type Konva from 'konva';
import { Group, Rect } from 'react-konva';
import type { LayoutPlacement } from '../types';
import { SceneIsland, type IslandRenderOptions } from './SceneIsland';
import type { Island } from './scene';

export interface PlacedRootProps extends IslandRenderOptions {
  island: Island;
  placement: LayoutPlacement;
  onDragState: (key: string, active: boolean) => void;
}

/** Moving the outer group leaves the measured subtree and its bitmap cache intact. */
export const PlacedRoot = memo(function PlacedRoot({
  island,
  placement,
  onDragState,
  ...options
}: PlacedRootProps) {
  const { id, x, y, onDragStart, onDragEnd, ...groupProps } = placement;
  const start = useCallback(
    (event: Konva.KonvaEventObject<DragEvent>) => {
      if (event.target === event.currentTarget) onDragState(island.key, true);
      onDragStart?.(event);
    },
    [island.key, onDragState, onDragStart],
  );
  const end = useCallback(
    (event: Konva.KonvaEventObject<DragEvent>) => {
      onDragEnd?.(event);
      if (event.target === event.currentTarget) onDragState(island.key, false);
    },
    [island.key, onDragState, onDragEnd],
  );
  useEffect(() => () => onDragState(island.key, false), [island.key, onDragState]);
  const interactive = Boolean(
    placement.draggable ||
    placement.onClick ||
    placement.onTap ||
    placement.onMouseDown ||
    placement.onTouchStart ||
    placement.onDragStart ||
    placement.onDragMove ||
    placement.onDragEnd,
  );
  return (
    <Group
      {...groupProps}
      name="layout-root-placement"
      layoutRootId={id}
      x={x}
      y={y}
      onDragStart={start}
      onDragEnd={end}
      listening={island.listening}
    >
      {interactive && (
        <Rect
          width={island.item.layout.width}
          height={island.item.layout.height}
          fill="transparent"
          listening={island.listening}
        />
      )}
      <SceneIsland island={island} {...options} origin />
    </Group>
  );
});
