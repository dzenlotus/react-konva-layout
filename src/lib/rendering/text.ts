import type { TextStyle } from '../model';
import type { CellTextRenderProps, LayoutTextProps } from '../types';

/** Canvas wrapping follows the same computed CSS used for browser measurement. */
export function effectiveWrap(style: TextStyle): NonNullable<LayoutTextProps['wrap']> {
  if (style.whiteSpace === 'nowrap' || style.whiteSpace === 'pre') return 'none';
  if (style.wordBreak === 'break-all' || style.overflowWrap === 'anywhere') return 'char';
  return 'word';
}

/** Resolve CSS operations that Canvas Text does not apply to its input string. */
function displayText(text: string, style: TextStyle): string {
  let value = text.replace(/\r\n?/g, '\n');
  if (style.whiteSpace === 'normal' || style.whiteSpace === 'nowrap') {
    value = value.replace(/[\t\n\f ]+/g, ' ').replace(/^ | $/g, '');
  } else if (style.whiteSpace === 'pre-line') {
    value = value
      .replace(/[\t\f ]+/g, ' ')
      .replace(/ *\n */g, '\n')
      .replace(/^ +| +$/g, '');
  }
  if (style.textTransform === 'uppercase') return value.toLocaleUpperCase();
  if (style.textTransform === 'lowercase') return value.toLocaleLowerCase();
  if (style.textTransform === 'capitalize') {
    return value.replace(/(^|[^\p{L}\p{N}'’])\p{L}/gu, (part) => part.toLocaleUpperCase());
  }
  return value;
}

/** Both built-in Text and CellText use the same measured typography. */
export function textAttributes(
  text: string,
  style: TextStyle,
): Omit<CellTextRenderProps, 'x' | 'y' | 'width' | 'height'> {
  return {
    text: displayText(text, style),
    fontSize: style.fontSize,
    fontFamily: style.fontFamily,
    fontStyle: style.fontStyle,
    lineHeight: style.lineHeight,
    fill: style.color,
    align: style.align as CellTextRenderProps['align'],
    verticalAlign: style.verticalAlign,
    textDecoration: style.textDecoration,
    underlineOffset: style.underlineOffset,
    wrap: effectiveWrap(style),
    ellipsis: style.ellipsis,
    padding: 0,
    direction: style.direction,
    fontVariant: style.fontVariant ?? 'normal',
    letterSpacing: parseFloat(style.letterSpacing ?? '0') || 0,
  };
}
