import { memo, useMemo, type ReactNode } from 'react';
import type { SceneNode } from '../model';
import { DrawNode } from './DrawNode';
import { SceneIsland, type IslandRenderOptions } from './SceneIsland';
import type { Island } from './scene';

interface FullSceneProps extends IslandRenderOptions {
  scene: SceneNode[];
  allIslands: Island[];
  islands: Island[];
  editingKey?: string;
  lod: boolean;
  minimal: boolean;
}

/** Prune invisible islands while retaining the consumer's Flex/Cell group hierarchy. */
export const FullScene = memo(function FullScene({
  scene,
  allIslands,
  islands,
  editingKey,
  lod,
  minimal,
  ...props
}: FullSceneProps) {
  const forest = useMemo(() => {
    const boundaries = new Set(
      allIslands.filter((island) => !island.shell).map((island) => island.item.key),
    );
    const selected = new Map(islands.map((island) => [island.key, island]));
    const visit = (item: SceneNode): ReactNode => {
      if (boundaries.has(item.key)) {
        const island = selected.get(item.key);
        return island ? (
          <SceneIsland
            key={item.key}
            island={island}
            {...props}
            local
            lod={lod}
            minimal={minimal}
            editing={editingKey === island.key}
          />
        ) : null;
      }
      const children = item.children.map(visit).filter(Boolean);
      const shellVisible = selected.has(`${item.key}:shell`);
      if (!children.length && !shellVisible) return null;
      return (
        <DrawNode
          key={item.key}
          item={item}
          compact={props.config.compact}
          optimized={props.config.enabled}
          forceGroup
          ownVisible={shellVisible}
          islandKey={`${item.key}:shell`}
          beginEdit={props.beginEdit}
        >
          {children}
        </DrawNode>
      );
    };
    return scene.map(visit);
  }, [
    scene,
    allIslands,
    islands,
    editingKey,
    lod,
    minimal,
    props.config,
    props.beginEdit,
    props.requestFocus,
    props.register,
  ]);
  return <>{forest}</>;
});
