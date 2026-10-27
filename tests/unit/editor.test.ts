import { describe, expect, it } from 'vitest';
import { EditorBuffer } from '../../src/editor/buffer';
import { pythonAttributes } from '../../src/editor/highlighter';
import navigationReference from './fixtures/editor-navigation.json';

function key(
  buffer: EditorBuffer,
  key: string,
  ctrlKey = false,
  shiftKey = false,
  viewportRows = 20,
): boolean {
  return buffer.handleKey(
    { key, ctrlKey, shiftKey, altKey: false, metaKey: false, isComposing: false } as KeyboardEvent,
    viewportRows,
  );
}

describe('EditorBuffer', () => {
  it('normalizes imported newlines and keeps a trailing empty line editable', () => {
    const buffer = new EditorBuffer('MAIN.PY', 'one\r\ntwo\r');
    expect(buffer.lines).toEqual(['one', 'two', '']);
    buffer.goto(2);
    buffer.insert('three');
    expect(buffer.position).toEqual({ line: 2, col: 5 });
    expect(buffer.text).toBe('one\ntwo\nthree');
  });

  it('tracks saved content through undo and redo without losing older edits', () => {
    const buffer = new EditorBuffer();
    buffer.insert('a');
    buffer.markSaved();
    buffer.insert('b');
    expect(buffer.modified).toBe(true);
    buffer.undo();
    expect(buffer.text).toBe('a');
    expect(buffer.modified).toBe(false);
    buffer.undo();
    expect(buffer.modified).toBe(true);
    buffer.redo();
    expect(buffer.modified).toBe(false);
  });

  it('moves vertically through short lines while preserving the desired column', () => {
    const buffer = new EditorBuffer('MAIN.PY', 'abcdef\nx\nabcdef');
    buffer.goto(0, 5);
    buffer.move(0, 1);
    expect(buffer.position).toEqual({ line: 1, col: 1 });
    buffer.move(0, 1);
    expect(buffer.position).toEqual({ line: 2, col: 5 });
    buffer.move(-1, 0);
    buffer.move(0, -1);
    buffer.move(0, -1);
    expect(buffer.position.col).toBe(4);
  });

  it.each(navigationReference.cases)(
    'matches reference paging in a $visibleRows-row editor body',
    ({ visibleRows, pageLine, bottomLine }) => {
      const buffer = new EditorBuffer('MAIN.PY', Array(55).fill('abcdef').join('\n'));
      buffer.goto(0, 2);
      key(buffer, 'PageDown', false, false, visibleRows);
      expect(buffer.position).toEqual({ line: pageLine, col: 2 });
      expect(buffer.scrollY).toBe(pageLine);
      key(buffer, 'End', true, false, visibleRows);
      expect(buffer.position).toEqual({ line: bottomLine, col: 2 });
      key(buffer, 'Home', true, false, visibleRows);
      expect(buffer.position).toEqual({ line: pageLine, col: 2 });
      key(buffer, 'q', true, false, visibleRows);
      key(buffer, 'x', false, false, visibleRows);
      expect(buffer.position).toEqual({ line: bottomLine, col: 2 });
      key(buffer, 'q', true, false, visibleRows);
      key(buffer, 'e', false, false, visibleRows);
      expect(buffer.position).toEqual({ line: pageLine, col: 2 });
      key(buffer, 'PageUp', false, false, visibleRows);
      expect(buffer.position).toEqual({ line: 0, col: 2 });
      expect(buffer.scrollY).toBe(0);
      buffer.cuaKeys = false;
      key(buffer, 'c', true, false, visibleRows);
      expect(buffer.position).toEqual({ line: pageLine, col: 2 });
      expect(buffer.scrollY).toBe(pageLine);
      key(buffer, 'r', true, false, visibleRows);
      expect(buffer.position).toEqual({ line: 0, col: 2 });
      expect(buffer.scrollY).toBe(0);
    },
  );

  it('preserves page selection direction and preferred columns through short lines', () => {
    const lines = Array(80).fill('abcdef');
    lines[13] = 'x';
    const buffer = new EditorBuffer('MAIN.PY', lines.join('\n'));
    buffer.goto(0, 5);
    const start = buffer.cursor;
    key(buffer, 'PageDown', false, true, 14);
    expect(buffer.position).toEqual({ line: 13, col: 1 });
    key(buffer, 'PageDown', false, true, 14);
    expect(buffer.position).toEqual({ line: 26, col: 5 });
    expect(buffer.anchor).toBe(start);
    key(buffer, 'PageUp', false, true, 14);
    key(buffer, 'PageUp', false, true, 14);
    expect(buffer.position).toEqual({ line: 0, col: 5 });
    buffer.goto(50, 3);
    buffer.scrollY = 40;
    const backwardsAnchor = buffer.cursor;
    key(buffer, 'Home', true, true, 14);
    expect(buffer.position).toEqual({ line: 40, col: 3 });
    expect(buffer.anchor).toBe(backwardsAnchor);
    expect(buffer.cursor).toBeLessThan(buffer.anchor ?? 0);
  });

  it.each([1, 39, 46])('uses a %i-row viewport and clamps commands at file edges', (rows) => {
    const buffer = new EditorBuffer('MAIN.PY', Array(100).fill('abcdef').join('\n'));
    key(buffer, 'PageDown', false, false, rows);
    expect(buffer.position.line).toBe(Math.max(1, rows - 1));
    buffer.scrollY = 90;
    key(buffer, 'End', true, false, rows);
    expect(buffer.position.line).toBe(Math.min(99, 90 + rows - 1));
    key(buffer, 'PageDown', true, false, rows);
    expect(buffer.cursor).toBe(buffer.text.length);
    key(buffer, 'PageUp', true, false, rows);
    expect(buffer.cursor).toBe(0);
    key(buffer, 'PageUp', false, false, rows);
    expect(buffer.scrollY).toBeGreaterThanOrEqual(0);
  });

  it('extends selections and replaces them as one undoable change', () => {
    const buffer = new EditorBuffer('MAIN.PY', 'abc');
    buffer.move(1, 0, true);
    buffer.move(1, 0, true);
    expect(buffer.selectedText).toBe('ab');
    buffer.insert('Q');
    expect(buffer.text).toBe('Qc');
    buffer.undo();
    expect(buffer.text).toBe('abc');
    expect(buffer.selectedText).toBe('ab');
  });

  it('moves over and deletes a complete surrogate pair', () => {
    const buffer = new EditorBuffer('MAIN.PY', 'a😀b');
    buffer.move(2, 0);
    expect(buffer.cursor).toBe(3);
    buffer.deleteBackward();
    expect(buffer.text).toBe('ab');
    expect(buffer.cursor).toBe(1);
  });

  it('auto-indents Python blocks and unindents selected lines', () => {
    const buffer = new EditorBuffer('MAIN.PY', 'if True:');
    buffer.end();
    key(buffer, 'Enter');
    buffer.insert('print(1)');
    expect(buffer.text).toBe('if True:\n    print(1)');
    buffer.goto(1);
    buffer.end(true);
    key(buffer, 'Tab', false, true);
    expect(buffer.text).toBe('if True:\nprint(1)');
  });

  it('toggles true tabs and uses visual stops after imported tabs and Unicode', () => {
    const buffer = new EditorBuffer('MAIN.PY', '\t😀');
    buffer.end();
    key(buffer, 'Tab');
    expect(buffer.text).toBe('\t😀   ');
    key(buffer, 'o', true);
    key(buffer, 't');
    expect(buffer.useTabCharacter).toBe(true);
    expect(buffer.pendingCommand).toBe('editor-options-changed');
    key(buffer, 'Tab');
    expect(buffer.text).toBe('\t😀   \t');
    buffer.undo();
    expect(buffer.text).toBe('\t😀   ');
    buffer.setText('a\nb');
    buffer.selectAll();
    key(buffer, 'Tab');
    expect(buffer.text).toBe('\ta\n\tb');
    key(buffer, 'Tab', false, true);
    expect(buffer.text).toBe('a\nb');
  });

  it('backspaces to the previous smaller indentation rather than a fixed tab stop', () => {
    const buffer = new EditorBuffer('MAIN.PY', '   a\n       b\n\n       ');
    buffer.end(false, true);
    const indentStart = buffer.cursor - 7;
    buffer.bookmarks.set(1, indentStart + 2);
    key(buffer, 'Backspace');
    expect(buffer.text).toBe('   a\n       b\n\n   ');
    expect(buffer.bookmarks.get(1)).toBe(indentStart + 2);
    buffer.undo();
    expect(buffer.text).toBe('   a\n       b\n\n       ');
    key(buffer, 'o', true);
    key(buffer, 'u');
    expect(buffer.backspaceUnindents).toBe(false);
    key(buffer, 'Backspace');
    expect(buffer.text).toBe('   a\n       b\n\n      ');
  });

  it('unindents across tab cells without changing the rest of the line', () => {
    const buffer = new EditorBuffer('MAIN.PY', '   a\n\tvalue');
    buffer.goto(1, 1);
    key(buffer, 'Backspace');
    expect(buffer.text).toBe('   a\n   value');
    expect(buffer.position).toEqual({ line: 1, col: 3 });
    buffer.undo();
    expect(buffer.text).toBe('   a\n\tvalue');
    buffer.setText('  x');
    buffer.goto(0, 2);
    key(buffer, 'Backspace');
    expect(buffer.text).toBe('x');
    key(buffer, 'Backspace');
    expect(buffer.text).toBe('x');
  });

  it('uses ordinary deletion outside indentation and deletes selected whitespace exactly', () => {
    const buffer = new EditorBuffer('MAIN.PY', '  a \n       ');
    buffer.goto(0, 4);
    key(buffer, 'Backspace');
    expect(buffer.text).toBe('  a\n       ');
    buffer.goto(1, 5);
    buffer.move(-1, 0, true);
    key(buffer, 'Backspace');
    expect(buffer.text).toBe('  a\n      ');
    buffer.goto(1, 0);
    key(buffer, 'Backspace');
    expect(buffer.text).toBe('  a      ');
  });

  it('uses overwrite mode without consuming a newline', () => {
    const buffer = new EditorBuffer('MAIN.PY', 'abc\ndef');
    buffer.goto(0, 2);
    key(buffer, 'Insert');
    buffer.insert('XYZ');
    expect(buffer.text).toBe('abXYZ\ndef');
  });

  it('keeps the cursor at the same source character when unindenting a line', () => {
    const buffer = new EditorBuffer('MAIN.PY', '    print(1)');
    buffer.goto(0, 6);
    key(buffer, 'Tab', false, true);
    expect(buffer.text).toBe('print(1)');
    expect(buffer.position.col).toBe(2);
  });

  it('supports WordStar fixed blocks, copy, bookmarks, and UI command prefixes', () => {
    const buffer = new EditorBuffer('MAIN.PY', 'abc DEF');
    key(buffer, 'k', true);
    key(buffer, 'b');
    buffer.moveTo(3);
    key(buffer, 'k', true);
    key(buffer, 'k');
    buffer.moveTo(7);
    key(buffer, 'k', true);
    key(buffer, 'c');
    expect(buffer.text).toBe('abc DEFabc');
    key(buffer, 'k', true);
    key(buffer, '2');
    buffer.home();
    key(buffer, 'q', true);
    key(buffer, '2');
    expect(buffer.cursor).toBe(10);
    key(buffer, 'q', true);
    key(buffer, 'f');
    expect(buffer.pendingCommand).toBe('find');
    key(buffer, 'k', true);
    key(buffer, 's');
    expect(buffer.pendingCommand).toBe('save');
  });

  it('updates bookmarks during edits and restores their positions on undo', () => {
    const buffer = new EditorBuffer('MAIN.PY', 'abcdef');
    buffer.moveTo(4);
    key(buffer, 'k', true);
    key(buffer, '1');
    buffer.home();
    buffer.insert('XX');
    expect(buffer.bookmarks.get(1)).toBe(6);
    buffer.undo();
    expect(buffer.bookmarks.get(1)).toBe(4);
  });

  it('finds literal text, wraps backwards, and replaces all in one undo step', () => {
    const buffer = new EditorBuffer('MAIN.PY', 'A.b a.b İ test');
    expect(buffer.find('a.b')).toEqual({ from: 0, to: 3 });
    expect(buffer.find('a.b')).toEqual({ from: 4, to: 7 });
    buffer.home(true, true);
    buffer.anchor = null;
    expect(buffer.find('a.b', { backwards: true })).toEqual({ from: 4, to: 7 });
    expect(buffer.replace('a.b', '$&', true)).toBe(2);
    expect(buffer.text).toBe('$& $& İ test');
    buffer.undo();
    expect(buffer.text).toBe('A.b a.b İ test');
  });

  it('keeps Home at the start of a file beginning with an empty line', () => {
    const buffer = new EditorBuffer('MAIN.PY', '\nx');
    key(buffer, 'Home');
    expect(buffer.cursor).toBe(0);
    key(buffer, 'y', true);
    expect(buffer.text).toBe('x');
  });
});

describe('Python syntax attributes', () => {
  it('maps keywords, identifiers, comments, number kinds, and strings', () => {
    const source = 'if ready: # hi\n    print("ok", 10, 1.5, 0o17, 0b10, 0x1f, 3j)';
    const attrs = pythonAttributes(source);
    const attr = (text: string) => attrs[source.indexOf(text)];
    expect(attrs).toHaveLength(source.length);
    expect(attr('if')).toBe(0x1f);
    expect(attr('ready')).toBe(0x1a);
    expect(attr('#')).toBe(0x13);
    expect(attr('"ok"')).toBe(0x14);
    expect(attr('10')).toBe(0x17);
    expect(attr('1.5')).toBe(0x16);
    expect(attr('0o17')).toBe(0x18);
    expect(attr('0b10')).toBe(0x18);
    expect(attr('0x1f')).toBe(0x10);
    expect(attr('3j')).toBe(0x16);
  });

  it('uses one preprocessor attribute for complete import and decorator lines', () => {
    const source = 'import math # note\n@decorate("x")\ndef f():\n    pass';
    const attrs = pythonAttributes(source);
    expect(attrs.slice(0, source.indexOf('\n')).every((attr) => attr === 0x31)).toBe(true);
    const start = source.indexOf('@');
    expect(attrs.slice(start, source.indexOf('\n', start)).every((attr) => attr === 0x31)).toBe(
      true,
    );
    expect(attrs[source.indexOf('def')]).toBe(0x1f);
  });

  it('handles multiline and prefixed strings through the parser', () => {
    const source = 'text = r"""hello\nworld"""\nvalue = f"x={1}"';
    const attrs = pythonAttributes(source);
    expect(attrs[source.indexOf('hello')]).toBe(0x14);
    expect(attrs[source.indexOf('world')]).toBe(0x14);
    expect(attrs[source.indexOf('x=')]).toBe(0x14);
    expect(pythonAttributes('name', 0x1e)).toEqual([0x1e, 0x1e, 0x1e, 0x1e]);
  });

  it('marks illegal symbols and unterminated strings with the illegal attribute', () => {
    for (const token of ['$', '?', '"unterminated', '"""unterminated']) {
      const source = `x = ${token}`;
      const attrs = pythonAttributes(source);
      expect(attrs[source.indexOf(token)]).toBe(0x40);
    }
  });
});
