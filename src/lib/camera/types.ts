import type Konva from 'konva';
import type { Bounds } from '../host';
import type { ViewTransform } from '../types';

export type CameraTarget = Konva.Stage | Konva.Layer | Konva.Group;
export interface CameraPoint {
  x: number;
  y: number;
}

export interface PanZoomOptions {
  /** Existing camera container. Its own transform is translation and uniform scale. */
  target: { readonly current: CameraTarget | null };
  initialView?: Partial<ViewTransform>;
  minScale?: number;
  maxScale?: number;
  wheelSpeed?: number;
  enabled?: boolean;
  /** At most once per animation frame; does not cause hook renders. */
  onChange?: (view: ViewTransform) => void;
}

export interface CameraController {
  readonly view: { readonly current: Readonly<ViewTransform> };
  getView(): ViewTransform;
  setView(view: Partial<ViewTransform>): void;
  /** Point is in Stage logical pixels; defaults to the viewport center. */
  zoomTo(scale: number, point?: CameraPoint): void;
  zoomBy(factor: number, point?: CameraPoint): void;
  /** Delta is in Stage logical pixels, including for a transformed parent. */
  panBy(delta: CameraPoint): void;
  reset(): void;
  /** Bounds are in camera-local layout coordinates; padding is in Stage logical pixels. */
  fitBounds(bounds: Bounds, padding?: number): void;
}

export interface LayoutDragOptions {
  /** Shared camera, including its initial position and zoom. */
  camera: CameraController;
  /** World bounds, independent of camera position and zoom. A getter supports changing layouts. */
  bounds?: Bounds | null | (() => Bounds | null | undefined);
  /** Allowed empty viewport margin, in Stage logical pixels. */
  padding?: number;
  /** Restricts drag/panBy deltas; zoom anchors and bounds correction still use both axes. */
  axis?: 'both' | 'x' | 'y';
  panOn?: 'background' | 'anywhere';
  /** Disables one-pointer panning; bounds still constrain the shared camera. */
  enabled?: boolean;
}

export type { Bounds as CameraBounds } from '../host';
