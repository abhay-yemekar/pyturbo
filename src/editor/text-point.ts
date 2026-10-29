/** A source offset plus an optional visual cell within the tab at that offset. */
export interface TextPoint {
  offset: number;
  tabOffset: number;
}

export function comparePoints(a: TextPoint, b: TextPoint): number {
  return a.offset - b.offset || a.tabOffset - b.tabOffset;
}

export function textColumn(line: string, offset: number, tabSize: number): number {
  let column = 0;
  let index = 0;
  for (const character of line) {
    if (index + character.length > offset) break;
    column += character === '\t' ? tabSize - (column % tabSize) : 1;
    index += character.length;
  }
  return column;
}

/** Non-through movement snaps to the right edge of a tab, as in the reference. */
export function pointAtColumn(
  line: string,
  column: number,
  tabSize: number,
  throughTabs: boolean,
): TextPoint {
  column = Math.max(0, Math.trunc(column));
  let visual = 0;
  let offset = 0;
  for (const character of line) {
    const width = character === '\t' ? tabSize - (visual % tabSize) : 1;
    if (column <= visual) return { offset, tabOffset: 0 };
    if (column < visual + width && throughTabs) return { offset, tabOffset: column - visual };
    offset += character.length;
    visual += width;
    if (column <= visual) return { offset, tabOffset: 0 };
  }
  return { offset, tabOffset: 0 };
}

export function tabWidthAt(text: string, offset: number, tabSize: number): number {
  const start = offset > 0 ? text.lastIndexOf('\n', offset - 1) + 1 : 0;
  return tabSize - (textColumn(text.slice(start, offset), offset - start, tabSize) % tabSize);
}

/** Whole tabs remain source characters; selected fractions of tabs are spaces. */
export function pointRangeText(
  text: string,
  from: TextPoint,
  to: TextPoint,
  tabSize: number,
): string {
  if (comparePoints(from, to) > 0) [from, to] = [to, from];
  if (from.offset === to.offset) return ' '.repeat(Math.max(0, to.tabOffset - from.tabOffset));
  const prefix = from.tabOffset
    ? ' '.repeat(tabWidthAt(text, from.offset, tabSize) - from.tabOffset)
    : '';
  return (
    prefix +
    text.slice(from.offset + (from.tabOffset ? 1 : 0), to.offset) +
    ' '.repeat(to.tabOffset)
  );
}
