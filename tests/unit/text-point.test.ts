import { describe, expect, it } from 'vitest';
import { pointAtColumn, pointRangeText, textColumn } from '../../src/editor/text-point';

describe('source and visual tab positions', () => {
  it('matches the reference through-tab and non-through vertical destinations', () => {
    expect(pointAtColumn('\tx', 3, 8, true)).toEqual({ offset: 0, tabOffset: 3 });
    expect(pointAtColumn('\tx', 3, 8, false)).toEqual({ offset: 1, tabOffset: 0 });
    expect(pointAtColumn('\tx', 8, 8, true)).toEqual({ offset: 1, tabOffset: 0 });
  });

  it('uses tab stops after text and keeps UTF-16 offsets separate from rendered cells', () => {
    expect(pointAtColumn('😀\tx', 2, 4, true)).toEqual({ offset: 2, tabOffset: 1 });
    expect(textColumn('😀\tx', 3, 4)).toBe(4);
    expect(pointAtColumn('ab\t\tx', 6, 4, true)).toEqual({ offset: 3, tabOffset: 2 });
    expect(pointAtColumn('short', 40, 4, true)).toEqual({ offset: 5, tabOffset: 0 });
  });

  it('copies complete tabs verbatim and only expands partially selected boundary tabs', () => {
    const text = '\ta\t\nb';
    expect(pointRangeText(text, { offset: 0, tabOffset: 0 }, { offset: 3, tabOffset: 0 }, 8)).toBe(
      '\ta\t',
    );
    expect(pointRangeText(text, { offset: 0, tabOffset: 2 }, { offset: 0, tabOffset: 5 }, 8)).toBe(
      '   ',
    );
    expect(pointRangeText(text, { offset: 0, tabOffset: 3 }, { offset: 2, tabOffset: 2 }, 8)).toBe(
      '     a  ',
    );
    expect(pointRangeText(text, { offset: 2, tabOffset: 2 }, { offset: 0, tabOffset: 3 }, 8)).toBe(
      '     a  ',
    );
  });
});
