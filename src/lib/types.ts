import type { CSSProperties, ReactNode, Context } from 'react';
import type Konva from 'konva';
import type { KonvaNodeEvents } from 'react-konva';

export type LayoutElementType =
  'flex' | 'row' | 'col' | 'grid' | 'box' | 'text' | 'cell' | 'cell-text';

export interface LayoutElement {
  id: string;
  type: LayoutElementType;
  x: number;
  y: number;
  width: number;
  height: number;
  absoluteX: number;
  absoluteY: number;
  testId?: string;
  children: LayoutElement[];
}

export interface ViewTransform {
  x: number;
  y: number;
  scale: number;
}

export interface PerformanceOptions {
  enabled?: boolean;
  compact?: boolean;
  cull?: boolean;
  overscan?: number;
  cache?: boolean;
  cacheBudgetMB?: number;
  /** Automatic host density by default; a positive number fixes the cache density. */
  cachePixelRatio?: number | 'auto';
}

export interface LayoutMetrics {
  scope: 'full' | 'local' | 'visual';
  measuredElements: number;
  measuredRoots: string[];
  durationMs: number;
  templateHits: number;
  templateMisses: number;
  revision: number;
}

export interface RenderMetrics {
  visibleRoots: number;
  totalRoots: number;
  cachedRoots: number;
  cacheBytes: number;
  lod: boolean;
  groups: number;
  shapes: number;
  lodLevel?: 'full' | 'cell';
  /** Visible cells whose normal contents were explicitly replaced or hidden. */
  lodCells?: number;
}

type LayoutStyles = Pick<
  CSSProperties,
  | 'width'
  | 'height'
  | 'minWidth'
  | 'maxWidth'
  | 'minHeight'
  | 'maxHeight'
  | 'gap'
  | 'padding'
  | 'alignItems'
  | 'justifyContent'
  | 'flexGrow'
  | 'flexShrink'
  | 'flexBasis'
  | 'flexWrap'
  | 'alignSelf'
  | 'gridTemplateColumns'
  | 'gridTemplateRows'
  | 'columnGap'
  | 'rowGap'
>;

export interface LayoutProps extends LayoutStyles {
  id?: string;
  'data-testid'?: string;
  children?: ReactNode;
  style?: CSSProperties;
  fill?: string;
  stroke?: string;
  strokeWidth?: number;
  cornerRadius?: number;
  onClick?: () => void;
  onDblClick?: () => void;
  onDblTap?: () => void;
  listening?: boolean;
  /** Measurement boundary. Nest to isolate updates; flow size changes measure the nearest enclosing boundary. */
  layoutRoot?: boolean;
  /** Template namespace. Contents and geometry constraints form the cache key. */
  layoutTemplate?: string;
  cache?: boolean;
}

export interface FlexProps extends LayoutProps {
  direction?: CSSProperties['flexDirection'];
}

export interface BoxProps extends LayoutProps {
  render?: (size: { width: number; height: number }) => ReactNode;
}

export interface CellBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface CellProps extends Omit<LayoutProps, 'children'> {
  children?: ReactNode | ((bounds: CellBounds) => ReactNode);
  /** Changes only canvas contents; measurement and group bounds stay intact. */
  renderWhen?: boolean;
  fallback?: ReactNode | ((bounds: CellBounds) => ReactNode);
}

export interface LayoutTextProps extends LayoutProps {
  text: string;
  fontSize?: number;
  fontFamily?: string;
  /** Konva syntax, for example `italic 600`; fontWeight may also be set separately. */
  fontStyle?: string;
  fontWeight?: CSSProperties['fontWeight'];
  fontVariant?: 'normal' | 'small-caps';
  lineHeight?: number;
  letterSpacing?: number;
  color?: string;
  align?: 'left' | 'center' | 'right' | 'justify';
  verticalAlign?: 'top' | 'middle' | 'bottom';
  textDecoration?: string;
  /** Requires a Konva version that supports Text.underlineOffset. */
  underlineOffset?: number;
  wrap?: 'word' | 'char' | 'none';
  ellipsis?: boolean;
  /** RTL drawing requires a Konva version with Text.direction support. */
  direction?: 'ltr' | 'rtl' | 'inherit';
}

export interface CellTextRenderProps extends CellBounds {
  text: string;
  fontFamily: string;
  fontSize: number;
  fontStyle: string;
  lineHeight: number;
  fill: string;
  align: 'left' | 'center' | 'right' | 'justify';
  verticalAlign: 'top' | 'middle' | 'bottom';
  textDecoration: string;
  underlineOffset?: number;
  wrap: 'word' | 'char' | 'none';
  ellipsis: boolean;
  /** Cell padding is already included in x/y and removed from width/height. */
  padding: 0;
  direction?: string;
  fontVariant: string;
  letterSpacing: number;
}

export interface CellTextProps extends Omit<LayoutTextProps, 'children'> {
  children: (props: CellTextRenderProps) => ReactNode;
  /** Changes only canvas contents; the original text always determines layout. */
  renderWhen?: boolean;
  fallback?: ReactNode | ((props: CellTextRenderProps) => ReactNode);
}

export interface LayoutContextValue {
  invalidate(id?: string): void;
  getLayout(id: string): LayoutElement | undefined;
  getMetrics(): LayoutMetrics | null;
}

/** Canvas placement of an explicit, independent layoutRoot; array order is back to front. */
export interface LayoutPlacement extends Pick<
  KonvaNodeEvents,
  'onClick' | 'onTap' | 'onMouseDown' | 'onTouchStart' | 'onDragStart' | 'onDragMove' | 'onDragEnd'
> {
  id: string;
  /** Coordinates relative to Layout's Konva group, independent of measured HTML positions. */
  x: number;
  y: number;
  draggable?: boolean;
  dragBoundFunc?: Konva.NodeConfig['dragBoundFunc'];
}

export interface LayoutComponentProps {
  width?: number;
  height?: number;
  x?: number;
  y?: number;
  id?: string;
  debug?: boolean;
  performance?: PerformanceOptions;
  placements?: readonly LayoutPlacement[];
  /** React 16: contexts to forward from the Konva tree into the detached measurement tree. */
  contexts?: readonly Context<any>[];
  children: ReactNode;
  onLayout?: (tree: LayoutElement[]) => void;
  onMeasure?: (metrics: LayoutMetrics) => void;
  onRenderStats?: (metrics: RenderMetrics) => void;
}

export interface LayoutHandle extends LayoutContextValue {
  getGroup(): Konva.Group | null;
  getStage(): Konva.Stage | null;
  remeasure(id?: string): void;
}
