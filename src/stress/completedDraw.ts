import Konva from 'konva';
import type { LayoutNode, ViewTransform } from '../lib';
import { COUNT, COLUMNS, GAP } from '../examples/DesignedStressScene';
import type { Mode, PendingMeasurement } from './types';

export function findCanvasText(target: Konva.Node | undefined): Konva.Text | undefined {
  if (target instanceof Konva.Text) return target;
  const text = target instanceof Konva.Container ? target.findOne('Text') : undefined;
  return text instanceof Konva.Text ? text : undefined;
}

/** A draw only completes a benchmark after the requested geometry and raster quality are present. */
export function isCompletedDraw({
  layer,
  holder,
  model,
  camera,
  config,
  job,
}: {
  layer: Konva.Layer;
  holder: HTMLDivElement;
  model: LayoutNode;
  camera: ViewTransform;
  config: { width: number; worldWidth: number; mode: Mode };
  job: PendingMeasurement;
}): boolean {
  const stage = layer.getStage();
  if (
    !stage ||
    job.layoutAt === null ||
    job.drawMs !== null ||
    !holder.contains(stage.container()) ||
    model.children.length !== COUNT ||
    stage.width() !== config.width ||
    stage.height() !== 760
  )
    return false;

  const expectedView = job.expectedView;
  if (
    expectedView &&
    ((['x', 'y', 'scale'] as const).some(
      (key) => Math.abs(camera[key] - expectedView[key]) > 0.001,
    ) ||
      Math.abs(stage.x() - expectedView.x) > 0.001 ||
      Math.abs(stage.y() - expectedView.y) > 0.001 ||
      Math.abs(stage.scaleX() - expectedView.scale) > 0.001)
  )
    return false;

  const roots = new Map(
    layer
      .find('Group')
      .filter((node) => /^stress-node-\d+-card$/.test(node.id()))
      .map((node) => [node.id(), node]),
  );
  const required =
    config.mode === 'baseline'
      ? model.children
      : model.children.filter((node) => {
          const x = node.absoluteX * camera.scale + camera.x;
          const y = node.absoluteY * camera.scale + camera.y;
          return (
            x < stage.width() &&
            x + node.width * camera.scale > 0 &&
            y < stage.height() &&
            y + node.height * camera.scale > 0
          );
        });
  const detailed = config.mode === 'baseline' || camera.scale >= 0.3;
  const requiredRatio = layer.getCanvas().getPixelRatio() * camera.scale;
  if (
    !required.length ||
    required.some((node) => {
      const drawn = roots.get(node.id);
      if (!drawn) return true;
      const photo = drawn instanceof Konva.Container ? drawn.findOne('Image') : undefined;
      const image = photo instanceof Konva.Image ? photo.image() : undefined;
      if (detailed && (!(image instanceof HTMLImageElement) || !image.complete)) return true;
      const cache = drawn._getCanvasCache();
      if (drawn.isCached() && (!cache || cache.scene.getPixelRatio() + 0.001 < requiredRatio))
        return true;
      const position = drawn.getAbsolutePosition();
      return (
        Math.abs(drawn.width() - node.width) > 0.1 ||
        Math.abs(drawn.height() - node.height) > 0.1 ||
        Math.abs(position.x - (node.absoluteX * camera.scale + camera.x)) > 0.1 ||
        Math.abs(position.y - (node.absoluteY * camera.scale + camera.y)) > 0.1
      );
    })
  )
    return false;

  const expectedWidth = (config.worldWidth - 40 - (COLUMNS - 1) * GAP) / COLUMNS;
  if (model.children.some((node) => Math.abs(node.width - expectedWidth) > 0.1)) return false;
  if (job.expectedText !== undefined) {
    const text = findCanvasText(layer.findOne('#stress-node-0000-card-description-text'));
    if (text?.text() !== job.expectedText) return false;
  }
  return true;
}
