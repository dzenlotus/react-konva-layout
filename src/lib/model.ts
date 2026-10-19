import type { ReactNode } from 'react';
import type {
  BoxProps,
  CellBounds,
  CellTextRenderProps,
  FlexProps,
  LayoutMetrics,
  LayoutElement,
  LayoutElementType,
  LayoutTextProps,
} from './types';

export interface TextStyle {
  fontRevision: number;
  fontSize: number;
  fontFamily: string;
  fontStyle: string;
  lineHeight: number;
  color: string;
  align: string;
  verticalAlign: 'top' | 'middle' | 'bottom';
  textDecoration: string;
  underlineOffset?: number;
  ellipsis: boolean;
  paddingLeft: number;
  paddingTop: number;
  paddingRight: number;
  paddingBottom: number;
  direction?: string;
  fontVariant?: string;
  letterSpacing?: string;
  wordSpacing?: string;
  whiteSpace?: string;
  wordBreak?: string;
  overflowWrap?: string;
  textTransform?: string;
}

export type PrimitiveProps = Omit<BoxProps, 'render'> &
  Omit<FlexProps, 'direction'> &
  Partial<Omit<LayoutTextProps, 'direction'>> & {
    direction?: FlexProps['direction'] | LayoutTextProps['direction'];
    render?: (bounds: CellBounds) => ReactNode;
    renderText?: (props: CellTextRenderProps) => ReactNode;
    renderWhen?: boolean;
    fallback?: ReactNode;
    renderFallback?: (bounds: CellBounds) => ReactNode;
    renderTextFallback?: (props: CellTextRenderProps) => ReactNode;
  };

export interface SceneElement {
  key: string;
  layout: LayoutElement;
  props: PrimitiveProps;
  textStyle?: TextStyle;
  children: SceneElement[];
  revision: number;
}

export interface Registration {
  key: string;
  parent: string | null;
  element: HTMLDivElement;
  type: LayoutElementType;
  props: PrimitiveProps;
  signature?: { inner?: number; outer?: number };
  domFingerprint?: number;
  domStyle?: string | null;
  templateUnsafe?: boolean;
}

export interface LayoutRegistry {
  update(record: Registration): void;
  remove(key: string): void;
}

export interface EngineSnapshot {
  scene: SceneElement[];
  tree: LayoutElement[];
  metrics: LayoutMetrics | null;
}

export type Geometry = Pick<
  LayoutElement,
  'x' | 'y' | 'width' | 'height' | 'absoluteX' | 'absoluteY'
>;

export interface BoundaryStyle {
  inherited: Array<[string, string]>;
  inheritedId: number;
  position: string;
  boxSizing: string;
  transformed: boolean;
}

export interface BoundaryContext extends BoundaryStyle {
  width: number;
}

export interface MeasurementResult {
  roots: SceneElement[];
  elements: number;
  hits: number;
  misses: number;
}
