import { memo, useCallback, useEffect } from 'react';
import type Konva from 'konva';
import type { LayoutPlacement } from '../types';
import { SceneIsland, type IslandRenderOptions } from './SceneIsland';
import type { Island } from './scene';

export interface PlacedRootProps extends IslandRenderOptions {
  island: Island;
  placement: LayoutPlacement;
  onDragState: (key: string, active: boolean) => void;
}

/** Native movement changes the existing root group, leaving its layout and bitmap intact. */
export const PlacedRoot = memo(function PlacedRoot({
  island,
  placement,
  onDragState,
  ...options
}: PlacedRootProps) {
  const { onDragStart, onDragEnd } = placement;
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
    <SceneIsland
      island={island}
      {...options}
      placement={{ ...placement, onDragStart: start, onDragEnd: end }}
      hitRegion={interactive}
    />
  );
});
