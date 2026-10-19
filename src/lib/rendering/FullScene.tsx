import { memo, useMemo, type ReactNode } from 'react';
import type { SceneElement } from '../model';
import { DrawElement } from './DrawElement';
import { SceneIsland, type IslandRenderOptions } from './SceneIsland';
import { isReplacedCell, type Island } from './scene';
import { PlacedRoot } from './PlacedRoot';
import type { PlacedIsland } from './placements';

interface FullSceneProps extends IslandRenderOptions {
  scene: SceneElement[];
  allIslands: Island[];
  islands: Island[];
  placed: PlacedIsland[];
  onDragState: (key: string, active: boolean) => void;
}

/** Prune invisible islands while retaining the consumer's Flex/Cell group hierarchy. */
export const FullScene = memo(function FullScene({
  scene,
  allIslands,
  islands,
  placed,
  onDragState,
  ...props
}: FullSceneProps) {
  const forest = useMemo(() => {
    const boundaries = new Set(
      allIslands.filter((island) => !island.shell).map((island) => island.item.key),
    );
    const selected = new Map(islands.map((island) => [island.key, island]));
    const placedKeys = new Set(placed.map(({ island }) => island.key));
    const visit = (item: SceneElement): ReactNode => {
      if (placedKeys.has(item.key)) return null;
      if (boundaries.has(item.key)) {
        const island = selected.get(item.key);
        return island ? <SceneIsland key={item.key} island={island} {...props} local /> : null;
      }
      const children = isReplacedCell(item) ? [] : item.children.map(visit).filter(Boolean);
      const shellVisible = selected.has(`${item.key}:shell`);
      if (!children.length && !shellVisible) return null;
      return (
        <DrawElement
          key={item.key}
          item={item}
          compact={props.config.compact}
          optimized={props.config.enabled}
          forceGroup
          ownVisible={shellVisible}
        >
          {children}
        </DrawElement>
      );
    };
    return scene.map(visit);
  }, [scene, allIslands, islands, placed, props.config, props.register]);
  const visible = new Set(islands.map((island) => island.key));
  return (
    <>
      {forest}
      {placed.map(({ island, placement }) =>
        visible.has(island.key) ? (
          <PlacedRoot
            key={island.key}
            island={island}
            placement={placement}
            onDragState={onDragState}
            {...props}
          />
        ) : null,
      )}
    </>
  );
});
