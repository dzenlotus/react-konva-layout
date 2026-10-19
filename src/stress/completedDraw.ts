import Konva from 'konva';
import type { LayoutElement, ViewTransform } from '../lib';
import { COUNT, COLUMNS, GAP } from '../examples/DesignedStressScene';
import { referenceCardDetail } from '../examples/referenceCardDetail';
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
  model: LayoutElement;
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
      .filter((element) => /^stress-item-\d+-card$/.test(element.id()))
      .map((element) => [element.id(), element]),
  );
  const required =
    config.mode === 'baseline'
      ? model.children
      : model.children.filter((element) => {
          const x = element.absoluteX * camera.scale + camera.x;
          const y = element.absoluteY * camera.scale + camera.y;
          return (
            x < stage.width() &&
            x + element.width * camera.scale > 0 &&
            y < stage.height() &&
            y + element.height * camera.scale > 0
          );
        });
  const detail = referenceCardDetail(camera.scale);
  const editingCells = new Set(
    Array.from(
      holder.querySelectorAll<HTMLTextAreaElement>(
        '[data-testid="layout-text-editor"][data-layout-cell-id]',
      ),
      (editor) => editor.dataset.layoutCellId,
    ),
  );
  const requiredRatio = layer.getCanvas().getPixelRatio() * camera.scale;
  if (
    !required.length ||
    required.some((element) => {
      const drawn = roots.get(element.id);
      if (!drawn) return true;
      if (!(drawn instanceof Konva.Container)) return true;
      const preview = drawn.findOne(`#${element.id}-preview`);
      const photo = preview instanceof Konva.Container ? preview.findOne('Image') : undefined;
      const image = photo instanceof Konva.Image ? photo.image() : undefined;
      if (detail.showPreview) {
        if (!(image instanceof HTMLImageElement) || !image.complete) return true;
      } else if (
        photo ||
        !(preview instanceof Konva.Container) ||
        !(preview.findOne('.preview-placeholder') instanceof Konva.Rect)
      )
        return true;
      const descriptionId = `${element.id}-description-text`;
      const description = findCanvasText(drawn.findOne(`#${descriptionId}`));
      const showDescription = detail.showDescription || editingCells.has(descriptionId);
      if (showDescription !== Boolean(description)) return true;
      const actions = drawn.findOne(`#${element.id}-actions`);
      if (
        !(actions instanceof Konva.Container) ||
        detail.showActions !== Boolean(actions.findOne(`#${element.id}-run`))
      )
        return true;
      if (!findCanvasText(drawn.findOne(`#${element.id}-title`))) return true;
      for (const side of ['input', 'output'])
        for (let index = 0; index < 3; index++)
          if (!drawn.findOne(`#${element.id}-${side}-${index}`)) return true;
      const cache = drawn._getCanvasCache();
      if (drawn.isCached() && (!cache || cache.scene.getPixelRatio() + 0.001 < requiredRatio))
        return true;
      const position = drawn.getAbsolutePosition();
      return (
        Math.abs(drawn.width() - element.width) > 0.1 ||
        Math.abs(drawn.height() - element.height) > 0.1 ||
        Math.abs(position.x - (element.absoluteX * camera.scale + camera.x)) > 0.1 ||
        Math.abs(position.y - (element.absoluteY * camera.scale + camera.y)) > 0.1
      );
    })
  )
    return false;

  const expectedWidth = (config.worldWidth - 40 - (COLUMNS - 1) * GAP) / COLUMNS;
  if (model.children.some((element) => Math.abs(element.width - expectedWidth) > 0.1)) return false;
  if (job.expectedText !== undefined) {
    const text = findCanvasText(layer.findOne('#stress-item-0000-card-description-text'));
    if (text?.text() !== job.expectedText) return false;
  }
  return true;
}
