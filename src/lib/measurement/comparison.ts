import type { CSSProperties } from 'react';
import type { PrimitiveProps, Registration, TextStyle } from '../model';

export const layoutKeys = [
  'width',
  'height',
  'minWidth',
  'maxWidth',
  'minHeight',
  'maxHeight',
  'gap',
  'padding',
  'alignItems',
  'justifyContent',
  'flexGrow',
  'flexShrink',
  'flexBasis',
  'flexWrap',
  'alignSelf',
  'gridTemplateColumns',
  'gridTemplateRows',
  'columnGap',
  'rowGap',
] as const;

export const typographyKeys = [
  'fontSize',
  'fontFamily',
  'fontStyle',
  'direction',
  'fontWeight',
  'fontVariant',
  'lineHeight',
  'letterSpacing',
  'align',
  'verticalAlign',
  'textDecoration',
  'underlineOffset',
  'wrap',
  'ellipsis',
  'color',
] as const;

const visualKeys = [
  'fill',
  'stroke',
  'strokeWidth',
  'cornerRadius',
  'render',
  'renderText',
  'renderWhen',
  'fallback',
  'renderFallback',
  'renderTextFallback',
  'onClick',
  'onDblClick',
  'onDblTap',
  'listening',
  'text',
  'wrap',
  'layoutRoot',
  'layoutTemplate',
  'cache',
  'id',
  'data-testid',
] as const;

const textStyleKeys = [
  'fontRevision',
  'fontSize',
  'fontFamily',
  'fontStyle',
  'lineHeight',
  'color',
  'align',
  'verticalAlign',
  'textDecoration',
  'underlineOffset',
  'ellipsis',
  'paddingLeft',
  'paddingTop',
  'paddingRight',
  'paddingBottom',
  'direction',
  'fontVariant',
  'letterSpacing',
  'wordSpacing',
  'whiteSpace',
  'wordBreak',
  'overflowWrap',
  'textTransform',
] as const;

export const geometryKeys = ['x', 'y', 'width', 'height', 'absoluteX', 'absoluteY'] as const;

export function sameStyle(
  left: CSSProperties | undefined,
  right: CSSProperties | undefined,
): boolean {
  if (left === right) return true;
  if (!left || !right) return !left && !right;
  const keys = Object.keys(left) as Array<keyof CSSProperties>;
  return keys.length === Object.keys(right).length && keys.every((key) => left[key] === right[key]);
}

export function sameGeometryProps(left: Registration, right: Registration): boolean {
  return (
    left.type === right.type &&
    left.parent === right.parent &&
    left.props.id === right.props.id &&
    left.props['data-testid'] === right.props['data-testid'] &&
    left.props.direction === right.props.direction &&
    left.props.text === right.props.text &&
    left.props.layoutRoot === right.props.layoutRoot &&
    layoutKeys.every((key) => left.props[key] === right.props[key]) &&
    typographyKeys.every((key) => left.props[key] === right.props[key]) &&
    sameStyle(left.props.style, right.props.style)
  );
}

export function sameVisualProps(left: PrimitiveProps, right: PrimitiveProps): boolean {
  return left === right || visualKeys.every((key) => left[key] === right[key]);
}

export function sameArray<T>(left: T[], right: T[]): boolean {
  return left.length === right.length && left.every((item, index) => item === right[index]);
}

export function sameTextStyle(left: TextStyle | undefined, right: TextStyle | undefined): boolean {
  return (
    left === right ||
    Boolean(left && right && textStyleKeys.every((key) => left[key] === right[key]))
  );
}
