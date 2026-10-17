export const FREE_NODE_COUNT = 1000;
export const FREE_NODE_WIDTH = 360;
export const FREE_NODE_HEIGHT = 430;
export const INITIAL_SEED = 23;
export const INITIAL_VIEW = { x: 36, y: 28, scale: 0.68 };

export interface FreeNodePosition {
  id: string;
  x: number;
  y: number;
}

/** Identical card IDs and contents, with the historical stress scene's grid positions. */
export function createGridNodes(): FreeNodePosition[] {
  return Array.from({ length: FREE_NODE_COUNT }, (_, index) => ({
    id: `free-node-${String(index).padStart(4, '0')}`,
    x: 20 + (index % 25) * 384,
    y: 20 + Math.floor(index / 25) * 454,
  }));
}

function randomFromSeed(seed: number): () => number {
  let value = seed >>> 0;
  return () => {
    value = (Math.imul(value, 1664525) + 1013904223) >>> 0;
    return value / 4294967296;
  };
}

export function shuffled<T>(items: readonly T[], seed: number): T[] {
  const result = [...items];
  const random = randomFromSeed(seed);
  for (let index = result.length - 1; index > 0; index--) {
    const next = Math.floor(random() * (index + 1));
    [result[index], result[next]] = [result[next], result[index]];
  }
  return result;
}

/** World coordinates are application data, separate from each card's local layout. */
export function createFreeNodes(seed = INITIAL_SEED): FreeNodePosition[] {
  const random = randomFromSeed(seed);
  const foreground = [
    { x: 80, y: 90 },
    { x: 365, y: 35 },
    { x: 770, y: 145 },
    { x: 200, y: 490 },
    { x: 660, y: 575 },
    { x: 1125, y: 500 },
    { x: -325, y: 330 },
    { x: 1250, y: 30 },
  ];
  return Array.from({ length: FREE_NODE_COUNT }, (_, index) => {
    const initial = foreground[index];
    const position = initial ?? {
      x: 1900 + ((index - foreground.length) % 25) * 445 + (random() - 0.5) * 300,
      y: -1400 + Math.floor((index - foreground.length) / 25) * 550 + (random() - 0.5) * 360,
    };
    return { id: `free-node-${String(index).padStart(4, '0')}`, ...position };
  });
}

export function scatterFreeNodes(
  nodes: readonly FreeNodePosition[],
  seed: number,
): FreeNodePosition[] {
  const positions = shuffled(createFreeNodes(seed), seed + 1);
  return nodes.map((node, index) => ({
    id: node.id,
    x: positions[index].x,
    y: positions[index].y,
  }));
}

export function fitFreeNodes(
  nodes: readonly FreeNodePosition[],
  viewport: { width: number; height: number },
  getSize: (id: string) => { width: number; height: number } | undefined = () => undefined,
) {
  const padding = 40;
  const minX = Math.min(...nodes.map((node) => node.x));
  const minY = Math.min(...nodes.map((node) => node.y));
  const extents = nodes.map((node) => {
    const size = getSize(node.id);
    return {
      x: node.x + (size?.width ?? FREE_NODE_WIDTH),
      y: node.y + (size?.height ?? FREE_NODE_HEIGHT),
    };
  });
  const maxX = Math.max(...extents.map((point) => point.x));
  const maxY = Math.max(...extents.map((point) => point.y));
  const scale = Math.min(
    (viewport.width - padding * 2) / (maxX - minX),
    (viewport.height - padding * 2) / (maxY - minY),
  );
  return {
    scale,
    x: (viewport.width - (maxX - minX) * scale) / 2 - minX * scale,
    y: (viewport.height - (maxY - minY) * scale) / 2 - minY * scale,
  };
}
