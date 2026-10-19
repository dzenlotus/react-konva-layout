import type { CSSProperties } from 'react';
import type { BoundaryContext, BoundaryStyle, Geometry, Registration, TextStyle } from '../model';
import { layoutKeys, typographyKeys } from './comparison';

export interface TemplateEntry {
  geometry: Geometry[];
  styles: Array<TextStyle | undefined>;
  boundaries: Array<BoundaryContext | undefined>;
}

const inheritedProperties = [
  'font-family',
  'font-size',
  'font-style',
  'font-weight',
  'font-stretch',
  'font-variant',
  'line-height',
  'letter-spacing',
  'word-spacing',
  'color',
  'text-align',
  'text-indent',
  'text-transform',
  'white-space',
  'word-break',
  'overflow-wrap',
  'direction',
  'writing-mode',
  'text-rendering',
  'font-feature-settings',
  'font-kerning',
  'text-decoration-line',
  'text-underline-offset',
];
const outerPositionKeys = new Set(['left', 'top', 'right', 'bottom', 'inset', 'translate']);
const geometryPropKeys = [...layoutKeys, ...typographyKeys];
const SIGNATURE_LIMIT = 8192;
const TEXT_STYLE_LIMIT = 512;
const BOUNDARY_STYLE_LIMIT = 128;
const TEMPLATE_LIMIT = 128;

export function token(value: unknown): string {
  const string = String(value ?? '');
  return `${typeof value}:${string.length}:${string};`;
}

export function styleSignature(
  style: CSSProperties | undefined,
  omitOuterPosition = false,
): string {
  if (!style) return '';
  return (Object.keys(style) as Array<keyof CSSProperties>)
    .sort()
    .filter((key) => !omitOuterPosition || !outerPositionKeys.has(key))
    .map((key) => `${key}=${token(style[key])}`)
    .join('');
}

function hasFixedSize(value: unknown): boolean {
  if (typeof value === 'number') return Number.isFinite(value) && value >= 0;
  return (
    typeof value === 'string' &&
    CSS.supports('width', value) &&
    !/\b(auto|min-content|max-content|fit-content|inherit|initial|unset|revert)\b|var\(/.test(value)
  );
}

function storeBounded<Key, Value>(
  cache: Map<Key, Value>,
  key: Key,
  value: Value,
  limit: number,
): void {
  cache.delete(key);
  cache.set(key, value);
  if (cache.size > limit) cache.delete(cache.keys().next().value!);
}

function readTextStyle(record: Registration, fontRevision: number): TextStyle {
  const css = getComputedStyle(record.element);
  const measuredFontSize = parseFloat(css.fontSize);
  const fontSize = Number.isFinite(measuredFontSize) ? measuredFontSize : 16;
  const lineHeight = parseFloat(css.lineHeight);
  const underlineOffset = parseFloat(css.textUnderlineOffset);
  const decoration = css.textDecorationLine
    .split(/\s+/)
    .filter((value) => value === 'underline' || value === 'line-through')
    .join(' ');
  return {
    fontRevision,
    fontSize,
    fontFamily: css.fontFamily,
    fontStyle: `${css.fontStyle.startsWith('oblique') ? 'italic' : css.fontStyle} ${css.fontWeight}`,
    lineHeight: Number.isFinite(lineHeight) && fontSize > 0 ? lineHeight / fontSize : 1.2,
    color: css.color,
    align:
      css.textAlign === 'start'
        ? css.direction === 'rtl'
          ? 'right'
          : 'left'
        : css.textAlign === 'end'
          ? css.direction === 'rtl'
            ? 'left'
            : 'right'
          : css.textAlign,
    verticalAlign:
      css.justifyContent === 'center'
        ? 'middle'
        : css.justifyContent === 'end' || css.justifyContent === 'flex-end'
          ? 'bottom'
          : 'top',
    textDecoration: decoration,
    underlineOffset: Number.isFinite(underlineOffset)
      ? css.textUnderlineOffset.endsWith('%')
        ? (underlineOffset * fontSize) / 100
        : underlineOffset
      : undefined,
    ellipsis: css.textOverflow === 'ellipsis',
    paddingLeft: parseFloat(css.paddingLeft) || 0,
    paddingTop: parseFloat(css.paddingTop) || 0,
    paddingRight: parseFloat(css.paddingRight) || 0,
    paddingBottom: parseFloat(css.paddingBottom) || 0,
    direction: css.direction,
    fontVariant: css.fontVariant === 'small-caps' ? 'small-caps' : 'normal',
    letterSpacing: css.letterSpacing,
    wordSpacing: css.wordSpacing,
    whiteSpace: css.whiteSpace,
    wordBreak: css.wordBreak,
    overflowWrap: css.overflowWrap,
    textTransform: css.textTransform,
  };
}

/** Bounded caches for values that survive a measurement pass. No scene objects live here. */
export class MeasurementCache {
  fontRevision = 0;
  cssRevision = 0;
  readonly boundaries = new Map<string, BoundaryContext>();
  private readonly boundaryStyles = new Map<string, BoundaryStyle>();
  private readonly textStyles = new Map<string, TextStyle>();
  private readonly templates = new Map<string, TemplateEntry>();
  private readonly signatures = new Map<string, number>();
  private nextSignatureId = 1;

  intern = (value: string): number => {
    const previous = this.signatures.get(value);
    if (previous !== undefined) return previous;
    const id = this.nextSignatureId++;
    storeBounded(this.signatures, value, id, SIGNATURE_LIMIT);
    return id;
  };

  invalidateCss(fontsChanged = false): void {
    this.cssRevision += 1;
    if (fontsChanged) this.fontRevision += 1;
    this.templates.clear();
    this.boundaryStyles.clear();
    this.textStyles.clear();
  }

  clear(): void {
    this.invalidateCss();
    this.boundaries.clear();
    this.signatures.clear();
  }

  propsSignature(record: Registration, omitOuterPosition = false): number {
    const field = omitOuterPosition ? 'outer' : 'inner';
    const previous = record.signature?.[field];
    if (previous !== undefined) return previous;
    let value = `${record.type};layoutRoot=${Boolean(record.props.layoutRoot)};`;
    if (record.props.direction !== undefined) value += `direction=${token(record.props.direction)}`;
    for (const key of geometryPropKeys) {
      if (record.props[key] !== undefined) value += `${key}=${token(record.props[key])}`;
    }
    value += styleSignature(record.props.style, omitOuterPosition);
    const text = record.type === 'text' || record.type === 'cell-text';
    const fixedText =
      text &&
      record.props.wrap === 'none' &&
      hasFixedSize(record.props.width ?? record.props.style?.width) &&
      hasFixedSize(record.props.height ?? record.props.style?.height);
    if (text && !fixedText) value += token(record.props.text);
    const id = this.intern(value);
    record.signature = { ...record.signature, [field]: id };
    return id;
  }

  textStyle(record: Registration, contextKey: number, enabled: boolean): TextStyle | undefined {
    if (record.type !== 'text' && record.type !== 'cell-text') return undefined;
    const key = `${this.fontRevision}:${this.cssRevision}:${record.key}:${contextKey}`;
    const previous = enabled ? this.textStyles.get(key) : undefined;
    if (previous) return previous;
    const value = readTextStyle(record, this.fontRevision);
    storeBounded(this.textStyles, key, value, TEXT_STYLE_LIMIT);
    return value;
  }

  boundaryStyle(
    record: Registration,
    geometry: Geometry,
    contextKey: number,
    enabled: boolean,
  ): BoundaryStyle {
    const identity =
      record.props.layoutTemplate && !record.templateUnsafe
        ? token(record.props.layoutTemplate)
        : record.key;
    const key = `${this.fontRevision}:${this.cssRevision}:${identity}:${geometry.width}:${geometry.height}:${contextKey}`;
    let value = enabled ? this.boundaryStyles.get(key) : undefined;
    if (!value) {
      const css = getComputedStyle(record.element);
      const inherited: Array<[string, string]> = inheritedProperties.map((name) => [
        name,
        css.getPropertyValue(name),
      ]);
      value = {
        inherited,
        inheritedId: this.intern(
          inherited.map(([name, item]) => `${name}=${token(item)}`).join(''),
        ),
        position: css.position,
        boxSizing: css.boxSizing,
        transformed: css.transform !== 'none',
      };
      storeBounded(this.boundaryStyles, key, value, BOUNDARY_STYLE_LIMIT);
    }
    this.boundaries.set(record.key, { ...value, width: geometry.width });
    return value;
  }

  getTemplate(key: string): TemplateEntry | undefined {
    const value = this.templates.get(key);
    if (value) storeBounded(this.templates, key, value, TEMPLATE_LIMIT);
    return value;
  }

  setTemplate(key: string, value: TemplateEntry): void {
    storeBounded(this.templates, key, value, TEMPLATE_LIMIT);
  }
}
