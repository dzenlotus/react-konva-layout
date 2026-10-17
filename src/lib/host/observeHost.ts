import type Konva from 'konva';
import { readHost } from './coordinates';

let observerId = 0;
const HOST_ATTRIBUTES = [
  'x',
  'y',
  'scaleX',
  'scaleY',
  'rotation',
  'skewX',
  'skewY',
  'offsetX',
  'offsetY',
  'width',
  'height',
  'transformsEnabled',
  'visible',
  'listening',
];

/** Subscribe to the host's transforms and size; never own or change its camera. */
export function observeHost(root: Konva.Group, onChange: () => void): () => void {
  const namespace = `layoutHost${++observerId}`;
  const events = HOST_ATTRIBUTES.map((attribute) => `${attribute}Change.${namespace}`).join(' ');
  let nodes: Konva.Node[] = [];
  let layer: Konva.Layer | null = null;
  let stage: Konva.Stage | null = null;
  let frame = 0;
  let signature = '';
  let disposed = false;
  const resize = new ResizeObserver(() => schedule());
  const changed = () => {
    if (disposed) return;
    const ancestors: Konva.Node[] = [root, ...root.getAncestors()];
    const nextLayer = root.getLayer();
    const nextStage = root.getStage();
    if (
      ancestors.length !== nodes.length ||
      ancestors.some((node, index) => node !== nodes[index])
    ) {
      nodes.forEach((node) => node.off(events, schedule));
      nodes = ancestors;
      nodes.forEach((node) => node.on(events, schedule));
    }
    if (layer !== nextLayer) {
      layer?.off(`beforeDraw.${namespace}`, schedule);
      layer = nextLayer;
      layer?.on(`beforeDraw.${namespace}`, schedule);
    }
    if (stage !== nextStage) {
      resize.disconnect();
      stage = nextStage;
      if (stage) [stage.container(), stage.content].forEach((element) => resize.observe(element));
    }
    const host = readHost(root);
    const bounds = host?.stage.content.getBoundingClientRect();
    const next = host
      ? `${host.matrix.join(',')}|${host.stage.width()},${host.stage.height()}|${bounds?.width},${bounds?.height}|${host.visible},${host.listening}|${host.pixelRatio}`
      : 'detached';
    if (next !== signature) {
      signature = next;
      onChange();
    }
  };
  function schedule() {
    if (!disposed && !frame)
      frame = requestAnimationFrame(() => {
        frame = 0;
        changed();
      });
  }
  window.addEventListener('resize', schedule);
  changed();
  return () => {
    disposed = true;
    cancelAnimationFrame(frame);
    nodes.forEach((node) => node.off(events, schedule));
    layer?.off(`beforeDraw.${namespace}`, schedule);
    resize.disconnect();
    window.removeEventListener('resize', schedule);
  };
}
