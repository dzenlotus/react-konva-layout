import { memo, useEffect, useMemo, useRef, type RefObject } from 'react';
import Konva from 'konva';
import { Shape } from 'react-konva';
import { eventToStage, stageToLayout, type Bounds } from '../host';
import {
  DEFAULT_LOD_FILL,
  DEFAULT_LOD_STROKE,
  dispatchEvents,
  intersects,
  union,
  type Island,
} from './scene';
import { SceneIsland, type IslandRenderOptions } from './SceneIsland';

type LogicalClicks = Record<'mouse' | 'touch', { key: string; time: number } | null>;
const minimalBatchShapes = new WeakSet<Konva.Node>();

type InputType = keyof LogicalClicks;
const clickResetEvents = ['pointerdown', 'mousedown', 'touchstart', 'pointercancel', 'touchcancel'];

interface MinimalBatchProps {
  islands: Island[];
  root: Konva.Group;
  requestFocus: (island: Island) => void;
  clicks: RefObject<LogicalClicks>;
}

function batchBounds(islands: Island[]): Bounds {
  return islands.reduce(
    (bounds, { item: { layout } }) =>
      union(bounds, {
        x: layout.absoluteX,
        y: layout.absoluteY,
        width: layout.width,
        height: layout.height,
      }),
    {
      x: islands[0].item.layout.absoluteX,
      y: islands[0].item.layout.absoluteY,
      width: 0,
      height: 0,
    },
  );
}

function opaqueColor(color: string): boolean {
  return (
    /^#(?:[\da-f]{3}|[\da-f]{6})$/i.test(color) ||
    (/^[a-z]+$/i.test(color) &&
      !/^(transparent|currentcolor|inherit|initial|unset|revert)$/i.test(color))
  );
}

/** Combining paths is safe only for opaque, non-overlapping fills and strokes. */
function canSharePath(islands: Island[]): boolean {
  const props = islands[0].item.props;
  if (
    !opaqueColor(props.fill ?? DEFAULT_LOD_FILL) ||
    !opaqueColor(props.stroke ?? DEFAULT_LOD_STROKE)
  )
    return false;
  const padding = Math.max(0, props.strokeWidth ?? 1) / 2;
  const ordered = islands
    .map(({ item: { layout } }) => ({
      x: layout.absoluteX - padding,
      y: layout.absoluteY - padding,
      width: layout.width + padding * 2,
      height: layout.height + padding * 2,
    }))
    .sort((a, b) => a.x - b.x);
  const active: Bounds[] = [];
  for (const rect of ordered) {
    for (let i = active.length - 1; i >= 0; i--) {
      const previous = active[i];
      if (previous.x + previous.width < rect.x) active.splice(i, 1);
      else if (intersects(previous, rect)) return false;
    }
    active.push(rect);
  }
  return true;
}

const MinimalBatch = memo(function MinimalBatch({
  islands,
  root,
  requestFocus,
  clicks,
}: MinimalBatchProps) {
  const bounds = batchBounds(islands);
  const props = islands[0].item.props;
  const sharedPath = useMemo(
    () => canSharePath(islands),
    [islands, props.fill, props.stroke, props.strokeWidth],
  );
  const pick = (event: Konva.KonvaEventObject<Event>) => {
    const stage = root.getStage();
    const pointer = stage && eventToStage(event.evt, stage);
    const position = pointer && stageToLayout(root, pointer);
    if (!position) return;
    const { x, y } = position;
    for (let i = islands.length - 1; i >= 0; i--) {
      const island = islands[i],
        layout = island.item.layout;
      if (
        island.listening &&
        x >= layout.absoluteX &&
        x <= layout.absoluteX + layout.width &&
        y >= layout.absoluteY &&
        y <= layout.absoluteY + layout.height
      )
        return island;
    }
  };
  const fire = (event: Konva.KonvaEventObject<Event>, input: InputType) => {
    const island = pick(event);
    if (!island) return;
    const props = island.item.props;
    const previous = clicks.current[input];
    const now = Date.now();
    const double = previous?.key === island.key && now - previous.time < Konva.dblClickWindow;
    clicks.current[input] = double ? null : { key: island.key, time: now };
    dispatchEvents(props.onClick, island.ancestors.click);
    if (double) {
      if (input === 'mouse') dispatchEvents(props.onDblClick, island.ancestors.doubleClick);
      else dispatchEvents(props.onDblTap, island.ancestors.doubleTap);
      requestFocus(island);
    }
  };
  return (
    <>
      <Shape
        ref={(node) => {
          if (node) minimalBatchShapes.add(node);
        }}
        name="layout-lod-batch"
        x={bounds.x}
        y={bounds.y}
        width={bounds.width}
        height={bounds.height}
        fill={props.fill ?? DEFAULT_LOD_FILL}
        stroke={props.stroke ?? DEFAULT_LOD_STROKE}
        strokeWidth={props.strokeWidth ?? 1}
        listening={islands.some((island) => island.listening)}
        perfectDrawEnabled={false}
        sceneFunc={(context, shape) => {
          if (sharedPath) context.beginPath();
          for (const island of islands) {
            const layout = island.item.layout;
            if (!sharedPath) context.beginPath();
            context.rect(
              layout.absoluteX - bounds.x,
              layout.absoluteY - bounds.y,
              layout.width,
              layout.height,
            );
            if (!sharedPath) {
              context.closePath();
              context.fillStrokeShape(shape);
            }
          }
          if (sharedPath) {
            context.closePath();
            context.fillStrokeShape(shape);
          }
        }}
        hitFunc={(context, shape) => {
          context.beginPath();
          for (const island of islands)
            if (island.listening) {
              const layout = island.item.layout;
              context.rect(
                layout.absoluteX - bounds.x,
                layout.absoluteY - bounds.y,
                layout.width,
                layout.height,
              );
            }
          context.closePath();
          context.fillStrokeShape(shape);
        }}
        onClick={(event) => fire(event, 'mouse')}
        onTap={(event) => fire(event, 'touch')}
      />
    </>
  );
});

/** Keep draw order and editable roots intact while batching adjacent compatible roots. */
function partitionBatches(islands: Island[], editingKey?: string): Array<Island | Island[]> {
  const result: Array<Island | Island[]> = [];
  let batch: Island[] = [],
    previousStyle = '';
  for (const island of islands) {
    if (island.shell || island.key === editingKey) {
      if (batch.length) result.push(batch);
      batch = [];
      previousStyle = '';
      result.push(island);
    } else {
      const props = island.item.props;
      const style = `${props.fill ?? DEFAULT_LOD_FILL}|${props.stroke ?? DEFAULT_LOD_STROKE}|${props.strokeWidth ?? 1}`;
      if (batch.length && style !== previousStyle) {
        result.push(batch);
        batch = [];
      }
      batch.push(island);
      previousStyle = style;
    }
  }
  if (batch.length) result.push(batch);
  return result;
}

interface MinimalSceneProps extends IslandRenderOptions {
  islands: Island[];
  editingKey?: string;
  root: Konva.Group;
}

export const MinimalScene = memo(function MinimalScene({
  islands,
  editingKey,
  root,
  ...props
}: MinimalSceneProps) {
  const clicks = useRef<LogicalClicks>({ mouse: null, touch: null });
  useEffect(() => {
    const stage = root.getStage();
    if (!stage) return;
    const container = stage.content;
    const reset = (event: Event) => {
      if (event.type.endsWith('cancel')) {
        clicks.current = { mouse: null, touch: null };
        return;
      }
      const pointer = eventToStage(event, stage);
      const target = pointer && stage.getIntersection(pointer);
      if (target && root.isAncestorOf(target) && minimalBatchShapes.has(target)) return;
      const input =
        event.type.startsWith('touch') || ('pointerType' in event && event.pointerType === 'touch')
          ? 'touch'
          : 'mouse';
      clicks.current[input] = null;
    };
    clickResetEvents.forEach((event) => container.addEventListener(event, reset, true));
    return () =>
      clickResetEvents.forEach((event) => container.removeEventListener(event, reset, true));
  }, [root]);
  const pieces = useMemo(() => partitionBatches(islands, editingKey), [islands, editingKey]);
  return (
    <>
      {pieces.map((piece) =>
        Array.isArray(piece) ? (
          <MinimalBatch
            key={piece[0].key}
            islands={piece}
            root={root}
            requestFocus={props.requestFocus}
            clicks={clicks}
          />
        ) : (
          <SceneIsland
            key={piece.key}
            island={piece}
            {...props}
            lod
            minimal
            editing={piece.key === editingKey}
          />
        ),
      )}
    </>
  );
});
