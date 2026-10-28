export interface Selection {
  from: number;
  to: number;
}

export interface FindOptions {
  caseSensitive?: boolean;
  backwards?: boolean;
  wrap?: boolean;
  from?: number;
}

interface Snapshot {
  text: string;
  cursor: number;
  anchor: number | null;
  bookmarks: Array<[number, number]>;
}

const HISTORY_LIMIT = 200;
const word = /[\p{L}\p{N}_]/u;
const escapePattern = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** A UTF-16 line buffer. No DOM or Python runtime is required to edit a file. */
export class EditorBuffer {
  text: string;
  filename: string;
  cursor = 0;
  anchor: number | null = null;
  modified = false;
  scrollX = 0;
  scrollY = 0;
  insertMode = true;
  tabSize = 4;
  autoIndent = true;
  useTabCharacter = false;
  backspaceUnindents = true;
  cuaKeys = true;
  pendingCommand: string | null = null;
  blockVisible = true;
  readonly bookmarks = new Map<number, number>();
  private savedText: string;
  private undoStack: Snapshot[] = [];
  private redoStack: Snapshot[] = [];
  private prefix: 'k' | 'q' | 'o' | null = null;
  private blockStart: number | null = null;
  private blockEnd: number | null = null;
  private previousPosition = 0;
  private preferredColumn: number | null = null;
  private lastSearch = '';

  constructor(filename = 'NONAME00.PY', text = '') {
    this.filename = filename;
    this.text = text.replace(/\r\n?/g, '\n');
    this.savedText = this.text;
  }

  get lines(): string[] {
    return this.text.split('\n');
  }

  get position(): { line: number; col: number } {
    const before = this.text.slice(0, this.cursor);
    const start = before.lastIndexOf('\n') + 1;
    return { line: before.split('\n').length - 1, col: this.cursor - start };
  }

  get selection(): Selection {
    if (this.anchor !== null) {
      return { from: Math.min(this.anchor, this.cursor), to: Math.max(this.anchor, this.cursor) };
    }
    if (this.blockVisible && this.blockStart !== null && this.blockEnd !== null) {
      return {
        from: Math.min(this.blockStart, this.blockEnd),
        to: Math.max(this.blockStart, this.blockEnd),
      };
    }
    return { from: this.cursor, to: this.cursor };
  }

  get selectedText(): string {
    const { from, to } = this.selection;
    return this.text.slice(from, to);
  }

  setText(text: string, modified = false): void {
    this.text = text.replace(/\r\n?/g, '\n');
    this.cursor = Math.min(this.cursor, this.text.length);
    this.anchor = null;
    this.clearBlock();
    this.undoStack = [];
    this.redoStack = [];
    this.bookmarks.clear();
    if (!modified) this.savedText = this.text;
    this.modified = modified;
  }

  markSaved(content = this.text): void {
    this.savedText = content;
    this.modified = this.text !== this.savedText;
  }

  private snapshot(): Snapshot {
    return {
      text: this.text,
      cursor: this.cursor,
      anchor: this.anchor,
      bookmarks: [...this.bookmarks],
    };
  }

  private remember(): void {
    this.undoStack.push(this.snapshot());
    if (this.undoStack.length > HISTORY_LIMIT) this.undoStack.shift();
    this.redoStack = [];
  }

  private restore(snapshot: Snapshot): void {
    this.text = snapshot.text;
    this.cursor = snapshot.cursor;
    this.anchor = snapshot.anchor;
    this.bookmarks.clear();
    for (const [key, value] of snapshot.bookmarks) this.bookmarks.set(key, value);
    this.clearBlock();
    this.modified = this.text !== this.savedText;
    this.preferredColumn = null;
  }

  private clearBlock(): void {
    this.blockStart = null;
    this.blockEnd = null;
  }

  private replaceRange(from: number, to: number, replacement: string): void {
    from = Math.max(0, Math.min(from, this.text.length));
    to = Math.max(from, Math.min(to, this.text.length));
    replacement = replacement.replace(/\r\n?/g, '\n');
    if (this.text.slice(from, to) === replacement) {
      this.cursor = from + replacement.length;
      this.anchor = null;
      return;
    }
    this.remember();
    const delta = replacement.length - (to - from);
    for (const [key, offset] of this.bookmarks) {
      this.bookmarks.set(key, offset < from ? offset : offset > to ? offset + delta : from);
    }
    this.text = this.text.slice(0, from) + replacement + this.text.slice(to);
    this.cursor = from + replacement.length;
    this.anchor = null;
    this.clearBlock();
    this.modified = this.text !== this.savedText;
    this.preferredColumn = null;
  }

  replaceSelection(text: string): void {
    const { from, to } = this.selection;
    this.replaceRange(from, to, text);
  }

  insert(text: string): void {
    const { from, to } = this.selection;
    if (!this.insertMode && from === to && !text.includes('\n')) {
      const lineEnd = this.text.indexOf('\n', from);
      const end = lineEnd < 0 ? this.text.length : lineEnd;
      this.replaceRange(from, Math.min(end, from + text.length), text);
    } else {
      this.replaceRange(from, to, text);
    }
  }

  private previousOffset(offset: number): number {
    if (offset <= 0) return 0;
    const code = this.text.charCodeAt(offset - 1);
    const previous = this.text.charCodeAt(offset - 2);
    return (
      offset -
      (code >= 0xdc00 && code <= 0xdfff && previous >= 0xd800 && previous <= 0xdbff ? 2 : 1)
    );
  }

  private nextOffset(offset: number): number {
    if (offset >= this.text.length) return this.text.length;
    const code = this.text.charCodeAt(offset);
    const next = this.text.charCodeAt(offset + 1);
    return Math.min(
      this.text.length,
      offset + (code >= 0xd800 && code <= 0xdbff && next >= 0xdc00 && next <= 0xdfff ? 2 : 1),
    );
  }

  deleteBackward(): void {
    const { from, to } = this.selection;
    if (from !== to) this.replaceRange(from, to, '');
    else if (from > 0) {
      const { line, col } = this.position;
      const lines = this.lines;
      const before = (lines[line] ?? '').slice(0, col);
      if (this.backspaceUnindents && before && /^[ \t]+$/.test(before)) {
        const column = this.visualColumn(before);
        let target = 0;
        for (let index = line - 1; index >= 0; index--) {
          const previous = lines[index] ?? '';
          if (!previous.trim()) continue;
          const indentation = this.visualColumn(previous.match(/^[ \t]*/)?.[0] ?? '');
          if (indentation < column) {
            target = indentation;
            break;
          }
        }
        let prefix = '';
        let width = 0;
        for (const character of before) {
          const next = width + (character === '\t' ? this.tabSize - (width % this.tabSize) : 1);
          if (next > target) {
            prefix += ' '.repeat(target - width);
            break;
          }
          prefix += character;
          width = next;
          if (width === target) break;
        }
        let retained = 0;
        while (retained < prefix.length && before[retained] === prefix[retained]) retained++;
        this.replaceRange(from - col + retained, from, prefix.slice(retained));
      } else this.replaceRange(this.previousOffset(from), from, '');
    }
  }

  deleteForward(): void {
    const { from, to } = this.selection;
    if (from !== to) this.replaceRange(from, to, '');
    else if (to < this.text.length) this.replaceRange(to, this.nextOffset(to), '');
  }

  moveTo(offset: number, select = false): void {
    if (select && this.anchor === null) this.anchor = this.cursor;
    if (!select) this.anchor = null;
    this.previousPosition = this.cursor;
    this.cursor = Math.max(0, Math.min(offset, this.text.length));
    this.preferredColumn = null;
  }

  offsetAt(line: number, col = 0): number {
    const lines = this.lines;
    line = Math.max(0, Math.min(line, lines.length - 1));
    let offset = 0;
    for (let i = 0; i < line; i++) offset += (lines[i]?.length ?? 0) + 1;
    return offset + Math.max(0, Math.min(col, lines[line]?.length ?? 0));
  }

  goto(line: number, col = 0, select = false): void {
    this.moveTo(this.offsetAt(line, col), select);
  }

  move(dx: number, dy: number, select = false): void {
    if (dy) {
      const { line, col } = this.position;
      const desired = this.preferredColumn ?? col;
      this.goto(line + dy, desired, select);
      this.preferredColumn = desired;
      return;
    }
    if (!select && this.anchor !== null && this.anchor !== this.cursor) {
      const selection = this.selection;
      this.moveTo(dx < 0 ? selection.from : selection.to);
      return;
    }
    let offset = this.cursor;
    for (let i = 0; i < Math.abs(dx); i++)
      offset = dx < 0 ? this.previousOffset(offset) : this.nextOffset(offset);
    this.moveTo(offset, select);
  }

  moveWord(direction: number, select = false): void {
    let offset = this.cursor;
    if (direction < 0) {
      while (offset > 0 && !word.test(this.text[offset - 1] ?? '')) offset--;
      while (offset > 0 && word.test(this.text[offset - 1] ?? '')) offset--;
    } else {
      while (offset < this.text.length && word.test(this.text[offset] ?? '')) offset++;
      while (offset < this.text.length && !word.test(this.text[offset] ?? '')) offset++;
    }
    this.moveTo(offset, select);
  }

  home(select = false, file = false): void {
    this.moveTo(file ? 0 : this.lineStart(this.cursor), select);
  }

  end(select = false, file = false): void {
    const newline = this.text.indexOf('\n', this.cursor);
    this.moveTo(file || newline < 0 ? this.text.length : newline, select);
  }

  page(rows: number, select = false): void {
    const previousLine = this.position.line;
    this.move(0, rows, select);
    this.scrollY = Math.max(0, this.scrollY + this.position.line - previousLine);
  }

  selectAll(): void {
    this.anchor = 0;
    this.cursor = this.text.length;
    this.clearBlock();
  }

  undo(): boolean {
    const snapshot = this.undoStack.pop();
    if (!snapshot) return false;
    this.redoStack.push(this.snapshot());
    this.restore(snapshot);
    return true;
  }

  redo(): boolean {
    const snapshot = this.redoStack.pop();
    if (!snapshot) return false;
    this.undoStack.push(this.snapshot());
    this.restore(snapshot);
    return true;
  }

  find(query: string, options: FindOptions = {}): Selection | null {
    if (!query) return null;
    this.lastSearch = query;
    const matches = [
      ...this.text.matchAll(new RegExp(escapePattern(query), options.caseSensitive ? 'g' : 'gi')),
    ];
    const start = Math.max(0, Math.min(options.from ?? this.cursor, this.text.length));
    let found = options.backwards
      ? (matches.filter((match) => match.index < start).at(-1)?.index ?? -1)
      : (matches.find((match) => match.index >= start)?.index ?? -1);
    if (found < 0 && options.wrap !== false)
      found = (options.backwards ? matches.at(-1) : matches[0])?.index ?? -1;
    if (found < 0) return null;
    this.clearBlock();
    this.anchor = found;
    this.previousPosition = this.cursor;
    this.cursor = found + query.length;
    return { from: found, to: this.cursor };
  }

  replace(query: string, replacement: string, all = false, caseSensitive = false): number {
    if (!query) return 0;
    if (!all) {
      const selection = this.selection;
      const value = this.text.slice(selection.from, selection.to);
      const matches = new RegExp(`^${escapePattern(query)}$`, caseSensitive ? '' : 'i').test(value);
      if (!matches && !this.find(query, { caseSensitive })) return 0;
      this.replaceSelection(replacement);
      return 1;
    }
    let count = 0;
    const result = this.text.replace(
      new RegExp(escapePattern(query), caseSensitive ? 'g' : 'gi'),
      () => {
        count++;
        return replacement;
      },
    );
    if (count) this.replaceRange(0, this.text.length, result);
    return count;
  }

  private indent(unindent = false): void {
    const selection = this.selection;
    const previousCursor = this.cursor;
    if (selection.from === selection.to && !unindent) {
      const before = (this.lines[this.position.line] ?? '').slice(0, this.position.col);
      this.insert(
        this.useTabCharacter
          ? '\t'
          : ' '.repeat(this.tabSize - (this.visualColumn(before) % this.tabSize)),
      );
      return;
    }
    const from = this.lineStart(selection.from);
    const selectedEnd =
      selection.to > selection.from && this.text[selection.to - 1] === '\n'
        ? selection.to - 1
        : selection.to;
    const lineEnd = this.text.indexOf('\n', selectedEnd);
    const to = lineEnd < 0 ? this.text.length : lineEnd;
    const lines = this.text.slice(from, to).split('\n');
    const indent = this.useTabCharacter ? '\t' : ' '.repeat(this.tabSize);
    const replacement = lines
      .map((line) =>
        unindent ? line.replace(new RegExp(`^(?: {1,${this.tabSize}}|\\t)`), '') : indent + line,
      )
      .join('\n');
    this.replaceRange(from, to, replacement);
    if (selection.from !== selection.to) this.anchor = from;
    else this.cursor = Math.max(from, previousCursor + replacement.length - (to - from));
  }

  private newline(): void {
    const line = this.lines[this.position.line] ?? '';
    const before = line.slice(0, this.position.col);
    let indentation = this.autoIndent ? (before.match(/^\s*/)?.[0] ?? '') : '';
    if (this.autoIndent && before.trimEnd().endsWith(':')) indentation += ' '.repeat(this.tabSize);
    this.insert(`\n${indentation}`);
  }

  private visualColumn(text: string): number {
    let column = 0;
    for (const character of text)
      column += character === '\t' ? this.tabSize - (column % this.tabSize) : 1;
    return column;
  }

  private deleteLine(toEnd = false): void {
    const start = toEnd ? this.cursor : this.lineStart(this.cursor);
    const newline = this.text.indexOf('\n', this.cursor);
    this.replaceRange(start, newline < 0 ? this.text.length : newline + (toEnd ? 0 : 1), '');
  }

  private lineStart(offset: number): number {
    return offset > 0 ? this.text.lastIndexOf('\n', offset - 1) + 1 : 0;
  }

  private bracket(): void {
    const pairs: Record<string, string> = {
      '(': ')',
      '[': ']',
      '{': '}',
      ')': '(',
      ']': '[',
      '}': '{',
    };
    const char = this.text[this.cursor] ?? '';
    const match = pairs[char];
    if (!match) return;
    const direction = '([{'.includes(char) ? 1 : -1;
    let depth = 1;
    for (let i = this.cursor + direction; i >= 0 && i < this.text.length; i += direction) {
      if (this.text[i] === char) depth++;
      if (this.text[i] === match && --depth === 0) {
        this.moveTo(i);
        return;
      }
    }
  }

  private blockCommand(key: string): void {
    const { from, to } = this.selection;
    if (/^\d$/.test(key)) {
      this.bookmarks.set(Number(key), this.cursor);
      return;
    }
    switch (key) {
      case 'b':
        this.blockStart = this.cursor;
        this.blockEnd = null;
        this.anchor = null;
        this.blockVisible = true;
        break;
      case 'k':
        this.blockEnd = this.cursor;
        this.anchor = null;
        this.blockVisible = true;
        break;
      case 'h':
        this.blockVisible = !this.blockVisible;
        break;
      case 't': {
        let from = this.cursor;
        if (!word.test(this.text[from] ?? '') && from > 0 && word.test(this.text[from - 1] ?? ''))
          from--;
        let to = from;
        while (from > 0 && word.test(this.text[from - 1] ?? '')) from--;
        while (to < this.text.length && word.test(this.text[to] ?? '')) to++;
        this.anchor = from;
        this.cursor = to;
        break;
      }
      case 'l':
        this.home();
        this.anchor = this.cursor;
        this.end(true);
        break;
      case 'y':
        this.replaceSelection('');
        break;
      case 'i':
        this.indent();
        break;
      case 'u':
        this.indent(true);
        break;
      case 'c': {
        const value = this.text.slice(from, to);
        this.clearBlock();
        this.anchor = null;
        this.replaceRange(this.cursor, this.cursor, value);
        break;
      }
      case 'v': {
        if (from === to || (this.cursor >= from && this.cursor <= to)) break;
        const value = this.text.slice(from, to);
        const target = this.cursor > to ? this.cursor - (to - from) : this.cursor;
        this.remember();
        const cut = this.text.slice(0, from) + this.text.slice(to);
        this.text = cut.slice(0, target) + value + cut.slice(target);
        this.cursor = target + value.length;
        this.anchor = null;
        this.clearBlock();
        this.modified = this.text !== this.savedText;
        break;
      }
      case 's':
        this.pendingCommand = 'save';
        break;
      case 'd':
        this.pendingCommand = 'menu';
        break;
      case 'r':
        this.pendingCommand = 'read-block';
        break;
      case 'w':
        this.pendingCommand = 'write-block';
        break;
      case 'p':
        this.pendingCommand = 'print';
        break;
    }
  }

  private quickCommand(key: string, viewportRows: number): void {
    if (/^\d$/.test(key)) {
      const bookmark = this.bookmarks.get(Number(key));
      if (bookmark !== undefined) this.moveTo(bookmark);
      return;
    }
    switch (key) {
      case 'f':
        this.pendingCommand = 'find';
        break;
      case 'a':
        this.pendingCommand = 'replace';
        break;
      case 'y':
        this.deleteLine(true);
        break;
      case 's':
        this.home();
        break;
      case 'd':
        this.end();
        break;
      case 'r':
        this.home(false, true);
        break;
      case 'c':
        this.end(false, true);
        break;
      case 'e':
        this.goto(this.scrollY, this.position.col);
        break;
      case 'x':
        this.goto(this.scrollY + viewportRows - 1, this.position.col);
        break;
      case 'p':
        this.moveTo(this.previousPosition);
        break;
      case 'b':
        if (this.blockStart !== null) this.moveTo(this.blockStart);
        break;
      case 'k':
        if (this.blockEnd !== null) this.moveTo(this.blockEnd);
        break;
      case '[':
      case ']':
        this.bracket();
        break;
    }
  }

  /** Returns true only for an editor command. Clipboard/IME text is handled by the host. */
  handleKey(event: KeyboardEvent, viewportRows = 20): boolean {
    const visibleRows = Math.max(1, Math.trunc(viewportRows));
    const pageRows = Math.max(1, visibleRows - 1);
    const key = event.key;
    const lower = key.toLowerCase();
    const control = event.ctrlKey || event.metaKey;
    this.pendingCommand = null;
    if (this.prefix) {
      const prefix = this.prefix;
      this.prefix = null;
      if (key === 'Escape') return true;
      if (prefix === 'k') this.blockCommand(lower);
      if (prefix === 'q') this.quickCommand(lower, visibleRows);
      if (prefix === 'o') {
        const option = { i: 'autoIndent', t: 'useTabCharacter', u: 'backspaceUnindents' } as const;
        const property = option[lower as keyof typeof option];
        if (property) {
          this[property] = !this[property];
          this.pendingCommand = 'editor-options-changed';
        }
      }
      return true;
    }
    if (event.altKey && key === 'Backspace') {
      if (event.shiftKey) this.redo();
      else this.undo();
      return true;
    }
    if (event.altKey || event.isComposing) return false;
    if (control) {
      if (lower === 'k' || lower === 'q' || lower === 'o') {
        this.prefix = lower;
        return true;
      }
      if (this.cuaKeys) {
        if (lower === 'z') {
          if (event.shiftKey) this.redo();
          else this.undo();
          return true;
        }
        if (lower === 'a') {
          this.selectAll();
          return true;
        }
        if (lower === 'c' || lower === 'x' || lower === 'v') return false;
      }
      switch (key) {
        case 'ArrowLeft':
          this.moveWord(-1, event.shiftKey);
          return true;
        case 'ArrowRight':
          this.moveWord(1, event.shiftKey);
          return true;
        case 'Home':
          this.goto(this.scrollY, this.position.col, event.shiftKey);
          return true;
        case 'End':
          this.goto(this.scrollY + visibleRows - 1, this.position.col, event.shiftKey);
          return true;
        case 'PageUp':
          this.home(event.shiftKey, true);
          return true;
        case 'PageDown':
          this.end(event.shiftKey, true);
          return true;
        case 'Delete':
          this.replaceSelection('');
          return true;
      }
      switch (lower) {
        case 's':
          this.move(-1, 0);
          return true;
        case 'd':
          this.move(1, 0);
          return true;
        case 'e':
          this.move(0, -1);
          return true;
        case 'x':
          this.move(0, 1);
          return true;
        case 'f':
          this.moveWord(1);
          return true;
        case 'a':
          this.moveWord(-1);
          return true;
        case 'w':
          this.scrollY = Math.max(0, this.scrollY - 1);
          return true;
        case 'z':
          this.scrollY++;
          return true;
        case 'r':
          this.page(-pageRows);
          return true;
        case 'c':
          this.page(pageRows);
          return true;
        case 'g':
          this.deleteForward();
          return true;
        case 'h':
          this.deleteBackward();
          return true;
        case 'y':
          this.deleteLine();
          return true;
        case 't': {
          const from = this.cursor;
          this.moveWord(1);
          this.replaceRange(from, this.cursor, '');
          return true;
        }
        case 'n': {
          const start = this.lineStart(this.cursor);
          this.replaceRange(start, start, '\n');
          this.cursor = start;
          return true;
        }
        case 'v':
          this.insertMode = !this.insertMode;
          return true;
        case 'l':
          if (this.lastSearch) this.find(this.lastSearch);
          else this.pendingCommand = 'find';
          return true;
      }
      return false;
    }
    switch (key) {
      case 'ArrowLeft':
        this.move(-1, 0, event.shiftKey);
        return true;
      case 'ArrowRight':
        this.move(1, 0, event.shiftKey);
        return true;
      case 'ArrowUp':
        this.move(0, -1, event.shiftKey);
        return true;
      case 'ArrowDown':
        this.move(0, 1, event.shiftKey);
        return true;
      case 'Home':
        this.home(event.shiftKey);
        return true;
      case 'End':
        this.end(event.shiftKey);
        return true;
      case 'PageUp':
        this.page(-pageRows, event.shiftKey);
        return true;
      case 'PageDown':
        this.page(pageRows, event.shiftKey);
        return true;
      case 'Insert':
        if (event.shiftKey) return false;
        this.insertMode = !this.insertMode;
        return true;
      case 'Backspace':
        this.deleteBackward();
        return true;
      case 'Delete':
        if (event.shiftKey) return false;
        this.deleteForward();
        return true;
      case 'Tab':
        this.indent(event.shiftKey);
        return true;
      case 'Enter':
        this.newline();
        return true;
      case 'Escape':
        this.anchor = null;
        this.clearBlock();
        return true;
    }
    return false;
  }
}
