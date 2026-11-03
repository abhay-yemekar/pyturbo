import { describe, expect, it } from 'vitest';
import { EditorBuffer } from '../../src/editor/buffer';
import { CellBuffer } from '../../src/engine/cell-buffer';
import { Application } from '../../src/ide/application';
import { defaultSettings } from '../../src/storage/workspace';
import reference from './fixtures/editor-indicator.json';

function frame(
  line: number,
  column: number,
  modified: boolean,
  x: number,
  y: number,
  width: number,
) {
  const source = `${'\n'.repeat(line - 1)}${'x'.repeat(column - 1)}`;
  const editor = new EditorBuffer('MAIN.PY', modified ? '' : source);
  if (modified) editor.insert(source);
  editor.goto(line - 1, column - 1);
  const buffer = new CellBuffer(100, 30);
  const shell = Object.assign(Object.create(Application.prototype), {
    buffer,
    settings: structuredClone(defaultSettings),
    editorLayouts: new WeakMap(),
    breakpoints: new Map(),
    errors: [],
    errorIndex: -1,
  });
  const window = {
    id: 1,
    kind: 'editor',
    title: 'MAIN.PY',
    editor,
    bounds: { x, y, w: width, h: 10 },
  };
  shell.drawWindow(window, true);
  return { buffer, editor, row: y + 9, source };
}

describe('reference editor indicator geometry', () => {
  for (const origin of [
    { x: 0, y: 1, width: 80 },
    { x: 4, y: 3, width: 60 },
  ]) {
    it.each(reference.cases)(
      `retains $line:$column and marker state at origin ${origin.x}`,
      (sample) => {
        const { buffer, editor, row, source } = frame(
          sample.line,
          sample.column,
          sample.modified,
          origin.x,
          origin.y,
          origin.width,
        );
        expect(
          Array.from({ length: 17 }, (_, index) => buffer.get(origin.x + 1 + index, row)?.ch).join(
            '',
          ),
        ).toBe(sample.cells);
        for (let column = 1; column < 18; column++)
          expect(buffer.get(origin.x + column, row)?.attr).toBe(reference.attribute);
        expect(editor.text).toBe(source);
        expect(editor.modified).toBe(sample.modified);
      },
    );
  }
  it('keeps large coordinates inside a narrow frame and preserves the modified marker', () => {
    const { buffer, editor, row, source } = frame(1000, 1001, true, 4, 2, 24);
    expect(buffer.get(6, row)?.ch).toBe('*');
    expect(Array.from({ length: 11 }, (_, index) => buffer.get(9 + index, row)?.ch).join('')).toBe(
      ' 1000:1001 ',
    );
    expect(buffer.get(26, row)?.ch).toBe('─');
    expect(buffer.get(27, row)?.ch).toBe('┘');
    expect(buffer.get(28, row)?.ch).toBe(' ');
    expect(editor.text).toBe(source);
  });
  it('keeps the horizontal scrollbar outside the indicator on long lines', () => {
    const { buffer, row } = frame(1, 1001, true, 0, 1, 80);
    expect(buffer.get(reference.horizontalScrollColumn, row)?.ch).toBe('◄');
    expect(buffer.get(2, row)?.ch).toBe('*');
    expect(Array.from({ length: 6 }, (_, index) => buffer.get(9 + index, row)?.ch).join('')).toBe(
      '1:1001',
    );
  });
});
