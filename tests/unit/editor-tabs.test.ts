import { describe, expect, it } from 'vitest';
import { EditorBuffer } from '../../src/editor/buffer';

function buffer(text = '\tx'): EditorBuffer {
  const result = new EditorBuffer('TABS.PY', text);
  result.tabSize = 8;
  result.backspaceUnindents = false;
  result.autoIndent = false;
  return result;
}

describe('virtual tab editing', () => {
  it('navigates all tab cells without modifying the source or saved state', () => {
    const editor = buffer();
    for (let column = 1; column <= 8; column++) {
      editor.move(1, 0);
      expect(editor.visualPosition).toEqual({ line: 0, col: column });
      expect(editor.text).toBe('\tx');
      expect(editor.modified).toBe(false);
    }
    editor.move(-1, 0);
    expect(editor.tabOffset).toBe(7);
    expect(editor.cursor).toBe(0);
    editor.cursorThroughTabs = false;
    expect(editor.visualPosition.col).toBe(7);
    editor.move(-1, 0);
    expect(editor.visualPosition.col).toBe(0);
    editor.move(1, 0);
    expect(editor.visualPosition.col).toBe(8);
  });

  it('matches reference vertical movement with through tabs on and off', () => {
    const editor = buffer('\tx\nabc\nabcdefgh');
    editor.goto(1, 3);
    editor.move(0, -1);
    expect(editor.visualPosition).toEqual({ line: 0, col: 3 });
    editor.cursorThroughTabs = false;
    editor.move(0, 1);
    editor.move(0, -1);
    expect(editor.visualPosition).toEqual({ line: 0, col: 8 });
    editor.move(0, 2);
    expect(editor.visualPosition).toEqual({ line: 2, col: 3 });
  });

  it.each([3, 7])('retains a real tab remainder when inserting at visual column %i', (column) => {
    const editor = buffer();
    editor.gotoVisual(0, column);
    editor.insert('a');
    expect(editor.text).toBe(`${' '.repeat(column)}a\tx`);
    expect(editor.visualPosition.col).toBe(column + 1);
    editor.undo();
    expect(editor.text).toBe('\tx');
    expect(editor.visualPosition.col).toBe(column);
    editor.redo();
    expect(editor.visualPosition.col).toBe(column + 1);
  });

  it('uses the observed Backspace/Delete tab rules and preserves newline remainders', () => {
    let editor = buffer();
    editor.gotoVisual(0, 3);
    editor.deleteBackward();
    expect(editor.text).toBe('  x');
    editor = buffer();
    editor.gotoVisual(0, 3);
    editor.deleteForward();
    expect(editor.text).toBe('   x');
    editor = buffer();
    editor.gotoVisual(0, 8);
    editor.deleteBackward();
    expect(editor.text).toBe('       x');
    editor = buffer();
    editor.cursorThroughTabs = false;
    editor.gotoVisual(0, 8);
    editor.deleteBackward();
    expect(editor.text).toBe('x');
    editor = buffer();
    editor.gotoVisual(0, 3);
    editor.insert('\n');
    expect(editor.text).toBe('   \n\tx');
  });

  it('keeps partial selections visual, supports backward replacement and restores them on undo', () => {
    const editor = buffer();
    editor.gotoVisual(0, 5);
    editor.move(-2, 0, true);
    expect(editor.selectionDirection).toBe('backward');
    expect(editor.selectedText).toBe('  ');
    expect(editor.selection).toEqual({ from: 0, to: 1 });
    expect([2, 3, 4, 5].map((cell) => editor.selectedCell(0, cell))).toEqual([
      false,
      true,
      true,
      false,
    ]);
    editor.insert('a');
    expect(editor.text).toBe('   a   x');
    editor.undo();
    expect(editor.visualPosition.col).toBe(3);
    expect(editor.selectedText).toBe('  ');
    expect(editor.selectionDirection).toBe('backward');
  });

  it('reconciles native typing and composition at virtual carets without corrupting source', () => {
    const editor = buffer();
    editor.gotoVisual(0, 3);
    editor.applyNativeInput('日本\tx', 2);
    expect(editor.text).toBe('   日本\tx');
    expect(editor.visualPosition.col).toBe(5);
    editor.undo();
    expect(editor.visualPosition.col).toBe(3);
    editor.move(2, 0, true);
    editor.applyNativeInput('Zx', 1);
    expect(editor.text).toBe('   Z   x');
  });

  it('keeps overwrite, bookmarks and word boundaries distinct from visual navigation', () => {
    const editor = buffer();
    editor.gotoVisual(0, 3);
    for (const key of ['k', '1']) editor.handleKey({ key, ctrlKey: key === 'k' } as KeyboardEvent);
    editor.end();
    for (const key of ['q', '1']) editor.handleKey({ key, ctrlKey: key === 'q' } as KeyboardEvent);
    expect(editor.visualPosition.col).toBe(3);
    editor.insertMode = false;
    editor.insert('a');
    expect(editor.text).toBe('   a    x');
    expect(editor.visualPosition.col).toBe(4);
    editor.undo();
    editor.moveWord(1);
    expect(editor.cursor).toBe(1);
  });

  it('keeps Left at file start from moving forward into its first tab', () => {
    const editor = buffer();
    editor.move(-1, 0);
    expect(editor.visualPosition.col).toBe(0);
  });

  it('remaps virtual bookmarks in retained tab cells and restores them through undo', () => {
    const editor = buffer();
    const mark = (number: string) => {
      for (const key of ['k', number])
        editor.handleKey({ key, ctrlKey: key === 'k' } as KeyboardEvent);
    };
    const jump = (number: string) => {
      for (const key of ['q', number])
        editor.handleKey({ key, ctrlKey: key === 'q' } as KeyboardEvent);
    };
    editor.gotoVisual(0, 3);
    mark('1');
    editor.gotoVisual(0, 5);
    mark('2');
    editor.gotoVisual(0, 3);
    editor.insert('a');
    jump('1');
    expect(editor.visualPosition.col).toBe(3);
    jump('2');
    expect(editor.visualPosition.col).toBe(6);
    editor.undo();
    jump('2');
    expect(editor.visualPosition.col).toBe(5);
  });

  it('uses the intended native caret when overwriting an identical character', () => {
    const editor = buffer('a');
    editor.insertMode = false;
    editor.applyNativeInput('aa', 1);
    expect(editor.text).toBe('a');
    expect(editor.cursor).toBe(1);
    expect(editor.modified).toBe(false);
    editor.setText('a');
    editor.cursor = 0;
    editor.applyNativeInput('aa', 2);
    expect(editor.text).toBe('aa');
    expect(editor.cursor).toBe(2);
  });
});

describe('Optimal Fill', () => {
  it('keeps the approved off default and leaves untouched imported indentation unchanged', () => {
    const editor = buffer('        x\ny');
    expect(editor.optimalFill).toBe(false);
    editor.optimalFill = true;
    editor.move(0, 1);
    editor.move(0, -1);
    expect(editor.text).toBe('        x\ny');
    expect(editor.modified).toBe(false);
  });

  it('packs an edited prefix only on leaving its line and retains visual columns', () => {
    const editor = buffer('');
    editor.optimalFill = true;
    editor.insert('        x');
    expect(editor.text).toBe('        x');
    editor.home();
    editor.move(1, 0);
    expect(editor.text).toBe('        x');
    editor.end();
    editor.insert('\n');
    expect(editor.text).toBe('\tx\n');
    expect(editor.position).toEqual({ line: 1, col: 0 });
    editor.cursorThroughTabs = false;
    editor.home(false, true);
    editor.move(1, 0);
    expect(editor.visualPosition.col).toBe(8);
    editor.undo();
    expect(editor.text).toBe('        x');
    editor.redo();
    expect(editor.text).toBe('\tx\n');
  });

  it('preserves bookmarks and backward selections when navigation compacts indentation', () => {
    const editor = buffer('');
    editor.optimalFill = true;
    editor.insert('        x\ny');
    // This first line was already completed by the paste. Edit a new space prefix.
    editor.setText('        x\ny');
    editor.goto(0, 3);
    editor.insert(' ');
    for (const key of ['k', '2']) editor.handleKey({ key, ctrlKey: key === 'k' } as KeyboardEvent);
    editor.move(0, 1, true);
    expect(editor.text).toBe('\t x\ny');
    expect(editor.anchor).toBe(0);
    expect(editor.selectedText).toBe('     x\ny');
    editor.move(0, -1);
    for (const key of ['q', '2']) editor.handleKey({ key, ctrlKey: key === 'q' } as KeyboardEvent);
    expect(editor.visualPosition.col).toBe(4);
    editor.undo();
    expect(editor.text).toBe('         x\ny');
  });

  it('packs completed pasted lines, keeps interior whitespace and current indentation intact', () => {
    const editor = buffer('');
    editor.optimalFill = true;
    editor.insert('        a        b\n                c\n        ');
    expect(editor.text).toBe('\ta        b\n\t\tc\n        ');
    expect(editor.visualPosition).toEqual({ line: 2, col: 8 });
    editor.undo();
    expect(editor.text).toBe('');
  });

  it('keeps space-only Tab independent and makes F/R toggle commands functional', () => {
    const editor = buffer('');
    for (const key of ['o', 'f']) editor.handleKey({ key, ctrlKey: key === 'o' } as KeyboardEvent);
    expect(editor.optimalFill).toBe(true);
    expect(editor.useTabCharacter).toBe(false);
    editor.handleKey({ key: 'Tab' } as KeyboardEvent);
    expect(editor.text).toBe('        ');
    editor.insert('\n');
    expect(editor.text).toBe('\t\n');
    for (const key of ['o', 'r']) editor.handleKey({ key, ctrlKey: key === 'o' } as KeyboardEvent);
    expect(editor.cursorThroughTabs).toBe(false);
  });

  it('does not reindent unaffected imported lines during replace-all and keeps it one undo step', () => {
    const source = '        untouched\n        target\n        tail';
    const editor = buffer(source);
    editor.optimalFill = true;
    expect(editor.replace('target', 'changed', true)).toBe(1);
    expect(editor.text).toBe('        untouched\n\tchanged\n        tail');
    editor.undo();
    expect(editor.text).toBe(source);
    editor.redo();
    expect(editor.text).toBe('        untouched\n\tchanged\n        tail');
  });

  it('remaps a search selection after leaving and compacting the edited line', () => {
    const editor = buffer('        x\nfind me');
    editor.optimalFill = true;
    editor.goto(0, 9);
    editor.insert('y');
    expect(editor.find('find')).not.toBeNull();
    expect(editor.text).toBe('\txy\nfind me');
    expect(editor.selectedText).toBe('find');
    editor.undo();
    expect(editor.text).toBe('        xy\nfind me');
  });
});
