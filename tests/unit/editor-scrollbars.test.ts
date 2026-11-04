import { describe, expect, it } from 'vitest';
import { EditorBuffer } from '../../src/editor/buffer';
import { CellBuffer } from '../../src/engine/cell-buffer';
import { Application } from '../../src/ide/application';
import { defaultSettings } from '../../src/storage/workspace';
import reference from './fixtures/editor-scrollbars.json';

function frame(source: string, scrollX = 0, scrollY = 0, active = true) {
  const editor = new EditorBuffer('MAIN.PY', source);
  editor.scrollX = scrollX;
  editor.scrollY = scrollY;
  const buffer = new CellBuffer(80, 25);
  const shell = Object.assign(Object.create(Application.prototype), {
    buffer,
    settings: structuredClone(defaultSettings),
    editorLayouts: new WeakMap(),
    breakpoints: new Map(),
    errors: [],
    errorIndex: -1,
    output: [],
  });
  const window = {
    id: 1,
    kind: 'editor',
    title: 'MAIN.PY',
    editor,
    bounds: { x: 0, y: 1, w: 80, h: 23 },
  };
  shell.drawWindow(window, active);
  return { buffer, editor, shell, window };
}

describe('reference editor scrollbars', () => {
  it.each(reference.horizontal.cases)(
    'retains empty-editor horizontal offset $offset and thumb at column $thumbColumn',
    ({ offset, thumbColumn }) => {
      const { buffer, editor } = frame('', offset);
      expect(editor.scrollX).toBe(offset);
      for (
        let column = reference.horizontal.firstColumn;
        column <= reference.horizontal.lastColumn;
        column++
      ) {
        const glyph =
          column === reference.horizontal.firstColumn
            ? 'left'
            : column === reference.horizontal.lastColumn
              ? 'right'
              : column === thumbColumn
                ? 'thumb'
                : 'track';
        expect(buffer.get(column, 23)).toEqual({
          ch: reference.glyphs[glyph],
          attr: reference.attributes[glyph === 'left' || glyph === 'right' ? 'arrows' : glyph],
        });
      }
      expect(editor.text).toBe('');
      expect(editor.cursor).toBe(0);
      expect(editor.modified).toBe(false);
    },
  );

  it.each(reference.vertical.cases)(
    'retains vertical controls for $lines lines at offset $offset',
    ({ lines, offset, thumbRow }) => {
      const source = Array.from({ length: lines }, (_, index) => `line${index + 1}`).join('\n');
      const { buffer, editor } = frame(source, 0, offset);
      for (let row = reference.vertical.firstRow; row <= reference.vertical.lastRow; row++) {
        const glyph =
          row === reference.vertical.firstRow
            ? 'up'
            : row === reference.vertical.lastRow
              ? 'down'
              : row === thumbRow
                ? 'thumb'
                : 'track';
        expect(buffer.get(reference.vertical.column, row)).toEqual({
          ch: reference.glyphs[glyph],
          attr: reference.attributes[glyph === 'up' || glyph === 'down' ? 'arrows' : glyph],
        });
      }
      expect(editor.scrollY).toBe(offset);
      expect(editor.text).toBe(source);
      expect(editor.cursor).toBe(0);
      expect(editor.modified).toBe(false);
    },
  );

  it('preserves scrolling to the end of Python lines longer than the original virtual range', () => {
    const source = 'x'.repeat(1000);
    const { buffer, editor } = frame(source, 1000 - 78);
    expect(editor.scrollX).toBe(922);
    expect(buffer.get(76, 23)?.ch).toBe(reference.glyphs.thumb);
    expect(editor.text).toBe(source);
  });

  it('allows the insertion caret after the final character of a long Python line', () => {
    const source = 'x'.repeat(1000);
    const { editor } = frame(source, 923);
    expect(editor.scrollX).toBe(923);
    expect(editor.text).toBe(source);
  });

  it('leaves inactive editor frames free of active scrollbar controls', () => {
    const { buffer } = frame('', 0, 0, false);
    expect(buffer.get(18, 23)?.ch).toBe('─');
    expect(buffer.get(79, 2)?.ch).toBe('│');
  });

  it.each(['output', 'help'])('retains the existing idle %s scrollbar policy', (kind) => {
    const { shell, buffer, window } = frame('');
    shell.drawWindow({ ...window, kind, editor: undefined, content: [] }, true);
    expect(buffer.get(79, 2)?.ch).toBe('▓');
    expect(buffer.get(79, 3)?.ch).toBe('▓');
  });
});
