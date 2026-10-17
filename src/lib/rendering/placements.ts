import type { LayoutPlacement } from '../types';
import type { Island } from './scene';

export interface PlacedIsland {
  island: Island;
  placement: LayoutPlacement;
}

/** Resolve only explicit independent roots; malformed or duplicate entries never duplicate groups. */
export function resolvePlacements(
  islands: Island[],
  placements: readonly LayoutPlacement[] = [],
): PlacedIsland[] {
  const roots = new Map(
    islands
      .filter((island) => !island.shell && island.item.props.layoutRoot)
      .map((island) => [island.item.layout.id, island]),
  );
  const ordered = new Map<string, PlacedIsland>();
  for (const placement of placements) {
    const island = roots.get(placement.id);
    if (!island || !Number.isFinite(placement.x) || !Number.isFinite(placement.y)) continue;
    ordered.delete(placement.id);
    ordered.set(placement.id, { island, placement });
  }
  return [...ordered.values()];
}
