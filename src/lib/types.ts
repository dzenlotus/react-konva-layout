import type { CSSProperties, ReactNode } from 'react';
import type Konva from 'konva';

export type LayoutNodeType =
  'flex' | 'row' | 'col' | 'grid' | 'box' | 'text' | 'cell' | 'cell-text';

export interface LayoutNode {
  id: string;
  type: LayoutNodeType;
  x: number;
  y: number;
  width: number;
  height: number;
  absoluteX: number;
  absoluteY: number;
  testId?: string;
  children: LayoutNode[];
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
  lodScale?: number;
}

export interface LayoutMetrics {
  scope: 'full' | 'local' | 'visual';
  measuredNodes: number;
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
  lodLevel?: 'full' | 'labels' | 'minimal';
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
  /** Independent boundary; normal-flow size changes still measure the parent layout. */
  layoutRoot?: boolean;
  /** Template namespace. Contents and geometry constraints form the cache key. */
  layoutTemplate?: string;
  lodLabel?: string;
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
}

export interface LayoutTextProps extends LayoutProps {
  text: string;
  fontSize?: number;
  fontFamily?: string;
  fontStyle?: string;
  lineHeight?: number;
  color?: string;
  align?: 'left' | 'center' | 'right' | 'justify';
  wrap?: 'word' | 'char' | 'none';
  editable?: boolean;
  onTextChange?: (text: string) => void;
  onEditStart?: () => void;
  onEditEnd?: (saved: boolean) => void;
}

export interface CellTextRenderProps extends CellBounds {
  text: string;
  fontFamily: string;
  fontSize: number;
  fontStyle: string;
  lineHeight: number;
  fill: string;
  align: 'left' | 'center' | 'right' | 'justify';
  wrap: 'word' | 'char' | 'none';
  direction?: string;
  fontVariant?: string;
  letterSpacing?: number;
}

export interface CellTextProps extends Omit<LayoutTextProps, 'children'> {
  children: (props: CellTextRenderProps) => ReactNode;
}

export interface LayoutContextValue {
  invalidate(id?: string): void;
  getLayout(id: string): LayoutNode | undefined;
  getMetrics(): LayoutMetrics | null;
}

export interface LayoutComponentProps {
  width?: number;
  height?: number;
  x?: number;
  y?: number;
  id?: string;
  debug?: boolean;
  performance?: PerformanceOptions;
  children: ReactNode;
  onLayout?: (tree: LayoutNode[]) => void;
  onMeasure?: (metrics: LayoutMetrics) => void;
  onRenderStats?: (metrics: RenderMetrics) => void;
  onFocusRequest?: (node: LayoutNode) => void;
}

export interface LayoutHandle extends LayoutContextValue {
  getGroup(): Konva.Group | null;
  getStage(): Konva.Stage | null;
  remeasure(id?: string): void;
}
