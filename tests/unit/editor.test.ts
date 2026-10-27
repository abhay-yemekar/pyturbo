import { describe, expect, it } from 'vitest';
import { EditorBuffer } from '../../src/editor/buffer';
import { pythonAttributes } from '../../src/editor/highlighter';

function key(buffer: EditorBuffer, key: string, ctrlKey = false, shiftKey = false): boolean {
  return buffer.handleKey({
    key,
    ctrlKey,
    shiftKey,
    altKey: false,
    metaKey: false,
    isComposing: false,
  } as KeyboardEvent);
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
