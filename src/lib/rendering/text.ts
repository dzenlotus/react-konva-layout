import type { TextStyle } from '../model';
import type { LayoutTextProps } from '../types';

/** Canvas wrapping follows the same computed CSS used for browser measurement. */
export function effectiveWrap(style: TextStyle): NonNullable<LayoutTextProps['wrap']> {
  if (style.whiteSpace === 'nowrap' || style.whiteSpace === 'pre') return 'none';
  if (style.wordBreak === 'break-all' || style.overflowWrap === 'anywhere') return 'char';
  return 'word';
}
