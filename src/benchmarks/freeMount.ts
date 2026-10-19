import Konva from 'konva';
import type { LayoutMetrics, LayoutElement, ViewTransform } from '../lib';
import type { SceneItemPosition } from '../examples/freeSceneModel';
import { SCENE_ITEM_COUNT } from '../examples/freeSceneModel';
import { referenceCardDetail } from '../examples/referenceCardDetail';
import type { CameraStats } from './camera';

export type SceneArrangement = 'free' | 'grid';

export interface FreeSceneStats extends CameraStats {
  arrangement: SceneArrangement;
  cards: number;
  primitives: number;
  complete: boolean;
  attachedMeasurementRoots: number;
  viewportWidth: number;
  viewportHeight: number;
  devicePixelRatio: number;
  worldBounds: { x: number; y: number; width: number; height: number };
}

export interface FreeMountResult extends FreeSceneStats {
  operation: 'mount';
  mountToLayoutMs: number;
  canvasDrawMs: number;
  mountToCompletedDrawMs: number;
  totalToCanvasFrameMs: number;
  validationMs: number;
  timestamp: string;
}

const running = new WeakSet<Konva.Stage>();
const rounded = (value: number) => Math.round(value * 100) / 100;

/** Validate geometry and the application-selected Cell contents after a real draw. */
function isCompleteDraw(
  layer: Konva.Layer,
  model: LayoutElement | undefined,
  positions: readonly SceneItemPosition[],
  view: ViewTransform,
): boolean {
  const stage = layer.getStage();
  if (
    !stage ||
    !layer.listening() ||
    !model ||
    model.children.length !== SCENE_ITEM_COUNT ||
    stage.width() !== 1400 ||
    stage.height() !== 760 ||
    Math.abs(stage.x() - view.x) > 0.001 ||
    Math.abs(stage.y() - view.y) > 0.001 ||
    Math.abs(stage.scaleX() - view.scale) > 0.001 ||
    Math.abs(stage.scaleY() - view.scale) > 0.001
  )
    return false;
  const wrappers = new Map(
    layer
      .find('.layout-root-placement')
      .map((element) => [element.getAttr('layoutRootId') as string, element]),
  );
  const geometry = new Map(model.children.map((element) => [element.id, element]));
  const detail = referenceCardDetail(view.scale);
  let required = 0;
  for (const position of positions) {
    const bounds = geometry.get(position.id);
    if (!bounds) return false;
    const x = position.x * view.scale + view.x;
    const y = position.y * view.scale + view.y;
    if (
      x >= stage.width() ||
      x + bounds.width * view.scale <= 0 ||
      y >= stage.height() ||
      y + bounds.height * view.scale <= 0
    )
      continue;
    required++;
    const wrapper = wrappers.get(position.id);
    const card =
      wrapper instanceof Konva.Group
        ? wrapper.id() === position.id
          ? wrapper
          : wrapper.findOne(`#${position.id}`)
        : undefined;
    if (!(card instanceof Konva.Group)) return false;
    const center = card.getAbsoluteTransform().point({ x: bounds.width / 2, y: bounds.height / 2 });
    if (
      Math.abs(card.width() - bounds.width) > 0.1 ||
      Math.abs(card.height() - bounds.height) > 0.1 ||
      Math.abs(center.x - (x + (bounds.width * view.scale) / 2)) > 0.1 ||
      Math.abs(center.y - (y + (bounds.height * view.scale) / 2)) > 0.1
    )
      return false;
    const preview = card.findOne(`#${position.id}-preview`);
    if (!(preview instanceof Konva.Container)) return false;
    const photo = preview.findOne('Image');
    if (detail.showPreview) {
      const image = photo instanceof Konva.Image ? photo.image() : undefined;
      if (!(image instanceof HTMLImageElement) || !image.complete || !image.naturalWidth)
        return false;
    } else if (photo || !(preview.findOne('.preview-placeholder') instanceof Konva.Rect))
      return false;
    const title = card.findOne(`#${position.id}-title`);
    if (!(title instanceof Konva.Container) || !(title.findOne('Text') instanceof Konva.Text))
      return false;
    const description = card.findOne(`#${position.id}-description-text`);
    if (
      detail.showDescription !==
      Boolean(description instanceof Konva.Container && description.findOne('Text'))
    )
      return false;
    const actions = card.findOne(`#${position.id}-actions`);
    if (
      !(actions instanceof Konva.Container) ||
      detail.showActions !== Boolean(actions.findOne(`#${position.id}-run`))
    )
      return false;
    for (const side of ['input', 'output'])
      for (let index = 0; index < 3; index++)
        if (!card.findOne(`#${position.id}-${side}-${index}`)) return false;
    const cache = card._getCanvasCache();
    if (
      card.isCached() &&
      (!cache ||
        cache.scene.getPixelRatio() + 0.001 < layer.getCanvas().getPixelRatio() * view.scale)
    )
      return false;
  }
  return required > 0;
}

/** Time a fresh Layout mount on the existing application-owned Stage and Layer. */
export function measureFreeSceneMount({
  stage,
  view,
  mount,
  stats,
  getModel,
  getPositions,
  getMeasurement,
}: {
  stage: Konva.Stage;
  view: ViewTransform;
  mount: () => void;
  stats: () => FreeSceneStats;
  getModel: () => LayoutElement | undefined;
  getPositions: () => readonly SceneItemPosition[];
  getMeasurement: () => { at: number; metrics: LayoutMetrics } | null;
}): Promise<FreeMountResult> {
  if (running.has(stage)) throw new Error('A mount benchmark is already running.');
  const layer = stage.getLayers()[0];
  if (!layer || !stage.container().isConnected || document.hidden)
    throw new Error('Mount benchmark requires a mounted Stage in a visible tab.');
  running.add(stage);
  const original = layer.draw;
  const own = Object.getOwnPropertyDescriptor(layer, 'draw');
  return new Promise((resolve, reject) => {
    let settled = false;
    let frame = 0;
    let timeout = 0;
    let startedAt = 0;
    let completedDrawAt = 0;
    let canvasDrawMs = 0;
    let validationMs = 0;
    const cleanup = () => {
      settled = true;
      clearTimeout(timeout);
      cancelAnimationFrame(frame);
      document.removeEventListener('visibilitychange', onVisibility);
      if (layer.draw === measuredDraw) {
        if (own) Object.defineProperty(layer, 'draw', own);
        else delete (layer as Partial<Konva.Layer>).draw;
      }
      running.delete(stage);
    };
    const fail = (reason: unknown) => {
      if (!settled) {
        cleanup();
        reject(reason);
      }
    };
    const onVisibility = () => {
      if (document.hidden) fail(new Error('Mount benchmark tab became hidden.'));
    };
    const finish = () => {
      try {
        const frameAt = performance.now();
        const snapshot = stats();
        const measured = getMeasurement();
        if (!snapshot.complete || !measured) {
          fail(new Error('Incomplete model or measurement HTML remains attached after draw.'));
          return;
        }
        const result: FreeMountResult = {
          ...snapshot,
          operation: 'mount',
          mountToLayoutMs: rounded(measured.at - startedAt),
          canvasDrawMs: rounded(canvasDrawMs),
          mountToCompletedDrawMs: rounded(completedDrawAt - startedAt),
          totalToCanvasFrameMs: rounded(frameAt - startedAt),
          validationMs: rounded(validationMs),
          timestamp: new Date().toISOString(),
        };
        cleanup();
        resolve(result);
      } catch (reason) {
        fail(reason);
      }
    };
    const measuredDraw: Konva.Layer['draw'] = function (this: Konva.Layer) {
      const before = performance.now();
      try {
        const result = original.call(this);
        const after = performance.now();
        if (!settled && !completedDrawAt && getMeasurement()) {
          const validationStartedAt = performance.now();
          const complete = isCompleteDraw(this, getModel(), getPositions(), view);
          validationMs += performance.now() - validationStartedAt;
          if (complete) {
            completedDrawAt = after;
            canvasDrawMs = after - before;
            frame = requestAnimationFrame(finish);
          }
        }
        return result;
      } catch (reason) {
        fail(reason);
        throw reason;
      }
    };
    try {
      layer.draw = measuredDraw;
      document.addEventListener('visibilitychange', onVisibility);
      timeout = window.setTimeout(
        () => fail(new Error('Mount benchmark exceeded 60 seconds.')),
        60_000,
      );
      startedAt = performance.now();
      mount();
    } catch (reason) {
      fail(reason);
    }
  });
}
