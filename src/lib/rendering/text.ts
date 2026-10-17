import type { TextStyle } from '../model';
import type { CellTextRenderProps, LayoutTextProps } from '../types';

/** Canvas wrapping follows the same computed CSS used for browser measurement. */
export function effectiveWrap(style: TextStyle): NonNullable<LayoutTextProps['wrap']> {
  if (style.whiteSpace === 'nowrap' || style.whiteSpace === 'pre') return 'none';
  if (style.wordBreak === 'break-all' || style.overflowWrap === 'anywhere') return 'char';
  return 'word';
}

/** Both built-in Text and CellText use the same measured typography. */
export function textAttributes(text: string, style: TextStyle) {
  return {
    text,
    fontSize: style.fontSize,
    fontFamily: style.fontFamily,
    fontStyle: style.fontStyle,
    lineHeight: style.lineHeight,
    fill: style.color,
    align: style.align as CellTextRenderProps['align'],
    wrap: effectiveWrap(style),
    direction: style.direction,
    fontVariant: style.fontVariant,
    letterSpacing: parseFloat(style.letterSpacing ?? '0') || 0,
  };
}
