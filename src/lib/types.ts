import type { CSSProperties, ReactNode } from 'react';
import type Konva from 'konva';

export type LayoutNodeType = 'flex' | 'row' | 'col' | 'grid' | 'box' | 'text';
export interface LayoutNode {
  id: string; type: LayoutNodeType; x: number; y: number; width: number; height: number;
  absoluteX: number; absoluteY: number; testId?: string; children: LayoutNode[];
}
export interface ViewTransform { x: number; y: number; scale: number }
export interface PerformanceOptions {
  enabled?: boolean; compact?: boolean; cull?: boolean; overscan?: number;
  cache?: boolean; cacheBudgetMB?: number; cachePixelRatio?: number;
  lodScale?: number; pixelRatio?: number;
}
export interface LayoutMetrics {
  scope: 'full' | 'local' | 'visual'; measuredNodes: number; measuredRoots: string[];
  durationMs: number; templateHits: number; templateMisses: number; revision: number;
}
export interface RenderMetrics {
  visibleRoots: number; totalRoots: number; cachedRoots: number; cacheBytes: number;
  lod: boolean; groups: number; shapes: number;
  lodLevel?: 'full' | 'labels' | 'minimal';
}
type LayoutStyles = Pick<CSSProperties,
  'width' | 'height' | 'minWidth' | 'maxWidth' | 'minHeight' | 'maxHeight' |
  'gap' | 'padding' | 'alignItems' | 'justifyContent' | 'flexGrow' | 'flexShrink' |
  'flexBasis' | 'flexWrap' | 'alignSelf' | 'gridTemplateColumns' | 'gridTemplateRows' |
  'columnGap' | 'rowGap'>;
export interface LayoutProps extends LayoutStyles {
  id?: string; 'data-testid'?: string; children?: ReactNode; style?: CSSProperties;
  fill?: string; stroke?: string; strokeWidth?: number; cornerRadius?: number;
  onClick?: () => void; onDblClick?: () => void; onDblTap?: () => void;
  listening?: boolean;
  /** Independent card/node boundary; unchanged outer size permits local measurement. */
  layoutRoot?: boolean;
  /** Opt-in layout template namespace. Geometry-affecting props/content are part of its signature. */
  layoutTemplate?: string;
  /** Human-readable low-detail caption when zoomed out. */
  lodLabel?: string;
  cache?: boolean;
}
export interface FlexProps extends LayoutProps { direction?: CSSProperties['flexDirection'] }
export interface BoxProps extends LayoutProps { render?: (size: {width: number; height: number}) => ReactNode }
export interface LayoutTextProps extends LayoutProps {
  text: string; fontSize?: number; fontFamily?: string; fontStyle?: string; lineHeight?: number;
  color?: string; align?: 'left' | 'center' | 'right' | 'justify'; wrap?: 'word' | 'char' | 'none';
  editable?: boolean; onTextChange?: (text: string) => void;
  onEditStart?: () => void; onEditEnd?: (saved: boolean) => void;
}
export interface TextStyle {
  fontRevision: number; fontSize: number; fontFamily: string; fontStyle: string; lineHeight: number;
  color: string; align: string; paddingLeft: number; paddingTop: number; paddingRight: number; paddingBottom: number;
}
export type PrimitiveProps = BoxProps & FlexProps & Partial<LayoutTextProps>;
export interface SceneNode {
  key: string; layout: LayoutNode; props: PrimitiveProps; textStyle?: TextStyle;
  children: SceneNode[]; revision: number;
}
export interface SceneHandle {
  getStage(): Konva.Stage | null; getView(): ViewTransform; setView(view: Partial<ViewTransform>): void;
}
export interface LayoutCanvasHandle extends SceneHandle {
  remeasure(id?: string): void; invalidate(id?: string): void;
  getLayout(id: string): LayoutNode | undefined; getMetrics(): LayoutMetrics | null;
}
export interface LayoutCanvasProps {
  width: number; height: number; debug?: boolean; onLayout?: (tree: LayoutNode[]) => void;
  onMeasure?: (metrics: LayoutMetrics) => void; onRenderStats?: (metrics: RenderMetrics) => void;
  performance?: PerformanceOptions; panZoom?: boolean; onViewChange?: (view: ViewTransform) => void;
  children: ReactNode; style?: CSSProperties; className?: string;
}
export interface CanvasSceneProps {
  scene: SceneNode[]; width: number; height: number; options?: PerformanceOptions;
  panZoom?: boolean; onViewChange?: (view: ViewTransform) => void;
  onRenderStats?: (metrics: RenderMetrics) => void; onInvalidate?: (id?: string) => void;
}
export interface LayoutContextValue {
  invalidate(id?: string): void; getLayout(id: string): LayoutNode | undefined;
  getMetrics(): LayoutMetrics | null;
}
