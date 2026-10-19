import { useContext, useLayoutEffect, useRef, type CSSProperties, type ReactElement } from 'react';
import { useMeasurementId } from '@layout/runtime';
import { ParentContext, RegistryContext } from './context';
import { layoutKeys } from './measurement/comparison';
import type { PrimitiveProps } from './model';
import type {
  BoxProps,
  CellProps,
  CellTextProps,
  FlexProps,
  LayoutElementType,
  LayoutProps,
  LayoutTextProps,
} from './types';

type FontParts = Pick<CSSProperties, 'fontStyle' | 'fontWeight'>;
const fontPartsCache = new Map<string, FontParts>();
const fontShorthandCache = new Map<string, CSSProperties>();
const fontLonghands = [
  'fontSize',
  'fontFamily',
  'fontStyle',
  'fontWeight',
  'fontVariant',
  'fontStretch',
  'lineHeight',
] as const;
let fontParser: CSSStyleDeclaration | undefined;

/** Konva combines slant and weight in fontStyle; let the browser parse CSS font grammar. */
function fontParts(value = 'normal'): FontParts {
  const cached = fontPartsCache.get(value);
  if (cached) return cached;
  fontParser ??= document.createElement('span').style;
  fontParser.font = '';
  fontParser.font = `${value} 16px Arial`;
  const parts: FontParts = {
    fontStyle: fontParser.fontStyle || 'normal',
    fontWeight: fontParser.fontWeight || 'normal',
  };
  if (fontPartsCache.size >= 128) fontPartsCache.delete(fontPartsCache.keys().next().value!);
  fontPartsCache.set(value, parts);
  return parts;
}

/** Expand literal fonts so removing a React shorthand cannot reset unchanged font props. */
function fontShorthand(value: string): CSSProperties {
  const cached = fontShorthandCache.get(value);
  if (cached) return cached;
  fontParser ??= document.createElement('span').style;
  fontParser.font = '';
  fontParser.font = value;
  const result: CSSProperties =
    fontParser.fontSize && fontParser.fontFamily
      ? {
          fontSize: fontParser.fontSize,
          fontFamily: fontParser.fontFamily,
          fontStyle: fontParser.fontStyle,
          fontWeight: fontParser.fontWeight,
          fontVariant: fontParser.fontVariant,
          fontStretch: fontParser.fontStretch,
          lineHeight: fontParser.lineHeight,
        }
      : {};
  if (fontShorthandCache.size >= 128) {
    fontShorthandCache.delete(fontShorthandCache.keys().next().value!);
  }
  fontShorthandCache.set(value, result);
  return result;
}

/** Canvas font shorthand has no oblique-angle support; use its italic equivalent in both trees. */
function canvasCompatibleFont(style: CSSProperties): CSSProperties {
  if (typeof style.fontStyle === 'string' && style.fontStyle.startsWith('oblique')) {
    style.fontStyle = 'italic';
  }
  return style;
}

function primitiveStyle(type: LayoutElementType, props: PrimitiveProps): CSSProperties {
  const style: CSSProperties = { boxSizing: 'border-box', position: 'relative' };
  if (type === 'flex' || type === 'row' || type === 'col') {
    style.display = 'flex';
    style.flexDirection =
      (props.direction as FlexProps['direction']) ?? (type === 'col' ? 'column' : 'row');
  } else if (type === 'grid') {
    style.display = 'grid';
  }
  for (const name of layoutKeys) {
    if (props[name] !== undefined) Object.assign(style, { [name]: props[name] });
  }
  if (type === 'text' || type === 'cell-text') {
    const nativeDefaults = type === 'cell-text';
    const verticalAlign = props.style?.verticalAlign ?? props.verticalAlign;
    const font = fontParts(props.fontStyle);
    Object.assign(style, {
      display: 'flex',
      flexDirection: 'column',
      justifyContent:
        props.justifyContent ??
        (verticalAlign === 'middle'
          ? 'center'
          : verticalAlign === 'bottom'
            ? 'flex-end'
            : 'flex-start'),
      fontSize: props.fontSize ?? (nativeDefaults ? 12 : 16),
      fontFamily: props.fontFamily ?? (nativeDefaults ? 'Arial' : 'Arial, sans-serif'),
      fontStyle: font.fontStyle,
      fontWeight: props.fontWeight ?? font.fontWeight,
      fontVariant: props.fontVariant ?? 'normal',
      lineHeight: props.lineHeight ?? (nativeDefaults ? 1 : 1.2),
      letterSpacing: props.letterSpacing ?? 0,
      color: props.color ?? (nativeDefaults ? '#000000' : '#17202a'),
      textAlign: props.align ?? 'left',
      direction: props.direction ?? 'inherit',
      textDecoration: props.textDecoration ?? 'none',
      textUnderlineOffset: props.underlineOffset,
      overflow: props.ellipsis ? 'hidden' : undefined,
      textOverflow: props.ellipsis ? 'ellipsis' : 'clip',
      whiteSpace: props.wrap === 'none' ? 'pre' : 'pre-wrap',
      overflowWrap: props.wrap === 'char' ? 'anywhere' : 'break-word',
    });
  }
  const { font: shorthand, ...explicit } = props.style ?? {};
  const parsed = typeof shorthand === 'string' ? fontShorthand(shorthand) : undefined;
  // Variables, CSS-wide values and system fonts need the attached browser context.
  const unresolved =
    typeof shorthand === 'string' && !parsed?.fontSize && CSS.supports('font', shorthand);
  if (unresolved) {
    for (const name of fontLonghands) delete style[name];
  }
  const result: CSSProperties = {
    ...style,
    ...(unresolved ? { font: shorthand } : parsed),
    ...explicit,
    pointerEvents: 'none',
  };
  return type === 'text' || type === 'cell-text' ? canvasCompatibleFont(result) : result;
}

function Primitive({ type, props }: { type: LayoutElementType; props: PrimitiveProps }) {
  const registry = useContext(RegistryContext);
  const parent = useContext(ParentContext);
  const key = useMeasurementId();
  const element = useRef<HTMLDivElement>(null);
  if (!registry) throw new Error(`${type} must be rendered inside Layout`);
  const style = primitiveStyle(type, props);
  // Unresolved shorthands need a fresh element when added/removed; React otherwise clears longhands.
  const fontKey = typeof style.font === 'string' ? style.font : undefined;

  useLayoutEffect(() => {
    if (element.current) registry.update({ key, parent, element: element.current, type, props });
  });
  useLayoutEffect(() => () => registry.remove(key), [registry, key]);

  return (
    <ParentContext.Provider value={key}>
      <div
        key={type === 'text' || type === 'cell-text' ? fontKey : undefined}
        ref={element}
        id={props.id}
        data-testid={props['data-testid']}
        className={
          type === 'cell-text' ? 'konva-layout-element konva-layout-text' : 'konva-layout-element'
        }
        data-layout-key={key}
        data-layout-root={props.layoutRoot ? 'true' : undefined}
        data-layout-label={`${type}${props.id ? ` · ${props.id}` : ''}`}
        style={style}
      >
        {type === 'text' || type === 'cell-text' ? props.text : props.children}
      </div>
    </ParentContext.Provider>
  );
}

export function Flex(props: FlexProps): ReactElement {
  return <Primitive type="flex" props={props} />;
}
export function Row(props: LayoutProps): ReactElement {
  return <Primitive type="row" props={props} />;
}
export function Col(props: LayoutProps): ReactElement {
  return <Primitive type="col" props={props} />;
}
export function Grid(props: LayoutProps): ReactElement {
  return <Primitive type="grid" props={props} />;
}
export function Box(props: BoxProps): ReactElement {
  return <Primitive type="box" props={props} />;
}
export function LayoutText(props: LayoutTextProps): ReactElement {
  return <Primitive type="text" props={props} />;
}
export function Cell({ children, fallback, ...props }: CellProps): ReactElement {
  const content =
    typeof children === 'function'
      ? { render: children as NonNullable<PrimitiveProps['render']> }
      : { children };
  const replacement =
    typeof fallback === 'function'
      ? { renderFallback: fallback as NonNullable<PrimitiveProps['renderFallback']> }
      : { fallback };
  return <Primitive type="cell" props={{ ...props, ...content, ...replacement }} />;
}
export function CellText({ children, fallback, ...props }: CellTextProps): ReactElement {
  const replacement =
    typeof fallback === 'function'
      ? { renderTextFallback: fallback as NonNullable<PrimitiveProps['renderTextFallback']> }
      : { fallback };
  return <Primitive type="cell-text" props={{ ...props, renderText: children, ...replacement }} />;
}
