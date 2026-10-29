import {
  comparePoints,
  pointAtColumn,
  pointRangeText,
  type TextPoint,
  tabWidthAt,
  textColumn,
} from './text-point';

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
  cursorTab: number;
  anchorTab: number;
  bookmarks: Array<[number, number]>;
  bookmarkTabs: Array<[number, number]>;
  editedLine: number | null;
}

const HISTORY_LIMIT = 200;
const word = /[\p{L}\p{N}_]/u;
const escapePattern = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** A UTF-16 line buffer. No DOM or Python runtime is required to edit a file. */
export class EditorBuffer {
  text: string;
  filename: string;
  private cursorOffset = 0;
  private cursorTab = 0;
  private anchorOffset: number | null = null;
  private anchorTab = 0;
  modified = false;
  scrollX = 0;
  scrollY = 0;
  insertMode = true;
  tabSize = 4;
  autoIndent = true;
  useTabCharacter = false;
  backspaceUnindents = true;
  cursorThroughTabs = true;
  optimalFill = false;
  cuaKeys = true;
  pendingCommand: string | null = null;
  blockVisible = true;
  readonly bookmarks = new Map<number, number>();
  private readonly bookmarkTabs = new Map<number, number>();
  private savedText: string;
  private undoStack: Snapshot[] = [];
  private redoStack: Snapshot[] = [];
  private prefix: 'k' | 'q' | 'o' | null = null;
  private blockStart: number | null = null;
  private blockEnd: number | null = null;
  private blockStartTab = 0;
  private blockEndTab = 0;
  private editedLine: number | null = null;
  private previousPosition = 0;
  private previousTab = 0;
  private preferredColumn: number | null = null;
  private lastSearch = '';

  constructor(filename = 'NONAME00.PY', text = '') {
    this.filename = filename;
    this.text = text.replace(/\r\n?/g, '\n');
    this.savedText = this.text;
  }

  get cursor(): number {
    return this.cursorOffset;
  }
  set cursor(offset: number) {
    this.cursorOffset = offset;
    this.cursorTab = 0;
  }
  get anchor(): number | null {
    return this.anchorOffset;
  }
  set anchor(offset: number | null) {
    this.anchorOffset = offset;
    this.anchorTab = 0;
  }

  private point(offset: number, tabOffset = 0): TextPoint {
    offset = Math.max(0, Math.min(Math.trunc(offset), this.text.length));
    return {
      offset,
      tabOffset:
        this.text[offset] === '\t'
          ? Math.max(0, Math.min(tabOffset, tabWidthAt(this.text, offset, this.tabSize) - 1))
          : 0,
    };
  }

  get cursorPoint(): TextPoint {
    return this.point(this.cursor, this.cursorTab);
  }
  get tabOffset(): number {
    return this.cursorPoint.tabOffset;
  }
  get visualPosition(): { line: number; col: number } {
    const { line, col } = this.position;
    return { line, col: textColumn(this.lines[line] ?? '', col, this.tabSize) + this.tabOffset };
  }
  get selectionDirection(): 'backward' | 'forward' {
    return this.anchor !== null &&
      comparePoints(this.cursorPoint, this.point(this.anchor, this.anchorTab)) < 0
      ? 'backward'
      : 'forward';
  }
  get virtualSelection(): boolean {
    return this.tabOffset > 0 || this.anchorTab > 0;
  }

  private get selectionPoints(): { from: TextPoint; to: TextPoint } {
    if (this.anchor !== null) {
      const a = this.point(this.anchor, this.anchorTab);
      const b = this.cursorPoint;
      return comparePoints(a, b) <= 0 ? { from: a, to: b } : { from: b, to: a };
    }
    if (this.blockVisible && this.blockStart !== null && this.blockEnd !== null) {
      const a = this.point(this.blockStart, this.blockStartTab);
      const b = this.point(this.blockEnd, this.blockEndTab);
      return comparePoints(a, b) <= 0 ? { from: a, to: b } : { from: b, to: a };
    }
    return { from: this.cursorPoint, to: this.cursorPoint };
  }

  private get hasSelection(): boolean {
    const { from, to } = this.selectionPoints;
    return comparePoints(from, to) !== 0;
  }

  selectedCell(offset: number, tabOffset = 0): boolean {
    return this.selectionTester()(offset, tabOffset);
  }

  selectionTester(): (offset: number, tabOffset?: number) => boolean {
    const { from, to } = this.selectionPoints;
    return (offset, tabOffset = 0) => {
      const cell = { offset, tabOffset };
      return comparePoints(cell, from) >= 0 && comparePoints(cell, to) < 0;
    };
  }

  clampVirtualPositions(): void {
    this.cursorTab = this.tabOffset;
    this.anchorTab = this.anchor === null ? 0 : this.point(this.anchor, this.anchorTab).tabOffset;
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
    const { from, to } = this.selectionPoints;
    return { from: from.offset, to: to.offset + (this.hasSelection && to.tabOffset ? 1 : 0) };
  }

  get selectedText(): string {
    const { from, to } = this.selectionPoints;
    return pointRangeText(this.text, from, to, this.tabSize);
  }

  setText(text: string, modified = false): void {
    this.text = text.replace(/\r\n?/g, '\n');
    this.cursor = Math.min(this.cursor, this.text.length);
    this.anchor = null;
    this.clearBlock();
    this.undoStack = [];
    this.redoStack = [];
    this.bookmarks.clear();
    this.bookmarkTabs.clear();
    this.editedLine = null;
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
      cursorTab: this.tabOffset,
      anchorTab: this.anchorTab,
      bookmarks: [...this.bookmarks],
      bookmarkTabs: [...this.bookmarkTabs],
      editedLine: this.editedLine,
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
    this.cursorTab = snapshot.cursorTab;
    this.anchorTab = snapshot.anchorTab;
    this.bookmarks.clear();
    for (const [key, value] of snapshot.bookmarks) this.bookmarks.set(key, value);
    this.bookmarkTabs.clear();
    for (const [key, value] of snapshot.bookmarkTabs) this.bookmarkTabs.set(key, value);
    this.editedLine = snapshot.editedLine;
    this.clearBlock();
    this.modified = this.text !== this.savedText;
    this.preferredColumn = null;
  }

  private clearBlock(): void {
    this.blockStart = null;
    this.blockEnd = null;
    this.blockStartTab = 0;
    this.blockEndTab = 0;
  }

  private compactLine(line: number, record: boolean): (point: TextPoint) => TextPoint {
    const start = this.offsetAt(line);
    const prefix = this.lines[line]?.match(/^[ \t]*/)?.[0] ?? '';
    const width = textColumn(prefix, prefix.length, this.tabSize);
    const packed = '\t'.repeat(Math.floor(width / this.tabSize)) + ' '.repeat(width % this.tabSize);
    if (packed === prefix) return (point) => point;
    const delta = packed.length - prefix.length;
    const map = (point: TextPoint): TextPoint => {
      if (point.offset < start) return point;
      if (point.offset >= start + prefix.length) return { ...point, offset: point.offset + delta };
      const column = textColumn(prefix, point.offset - start, this.tabSize) + point.tabOffset;
      const moved = pointAtColumn(packed, column, this.tabSize, true);
      return { offset: start + moved.offset, tabOffset: moved.tabOffset };
    };
    const cursor = map(this.cursorPoint);
    const anchor = this.anchor === null ? null : map(this.point(this.anchor, this.anchorTab));
    const previous = map(this.point(this.previousPosition, this.previousTab));
    const blockStart =
      this.blockStart === null ? null : map(this.point(this.blockStart, this.blockStartTab));
    const blockEnd =
      this.blockEnd === null ? null : map(this.point(this.blockEnd, this.blockEndTab));
    const bookmarks = [...this.bookmarks].map(
      ([key, offset]) => [key, map(this.point(offset, this.bookmarkTabs.get(key) ?? 0))] as const,
    );
    if (record) this.remember();
    this.text = this.text.slice(0, start) + packed + this.text.slice(start + prefix.length);
    this.cursor = cursor.offset;
    this.cursorTab = cursor.tabOffset;
    this.anchor = anchor?.offset ?? null;
    this.anchorTab = anchor?.tabOffset ?? 0;
    this.previousPosition = previous.offset;
    this.previousTab = previous.tabOffset;
    this.blockStart = blockStart?.offset ?? null;
    this.blockStartTab = blockStart?.tabOffset ?? 0;
    this.blockEnd = blockEnd?.offset ?? null;
    this.blockEndTab = blockEnd?.tabOffset ?? 0;
    for (const [key, point] of bookmarks) {
      this.bookmarks.set(key, point.offset);
      this.bookmarkTabs.set(key, point.tabOffset);
    }
    this.modified = this.text !== this.savedText;
    return map;
  }

  private finishEdit(fromLine: number): void {
    if (this.optimalFill)
      for (let line = fromLine; line < this.position.line; line++) this.compactLine(line, false);
    this.editedLine = this.position.line;
  }

  private replaceRange(from: number, to: number, replacement: string, record = true): void {
    from = Math.max(0, Math.min(from, this.text.length));
    to = Math.max(from, Math.min(to, this.text.length));
    replacement = replacement.replace(/\r\n?/g, '\n');
    if (this.text.slice(from, to) === replacement) {
      this.cursor = from + replacement.length;
      this.anchor = null;
      return;
    }
    if (record) this.remember();
    const delta = replacement.length - (to - from);
    for (const [key, offset] of this.bookmarks) {
      const tab = this.bookmarkTabs.get(key) ?? 0;
      if (
        tab &&
        offset === from &&
        to === from + 1 &&
        this.text[from] === '\t' &&
        /^ *$/.test(replacement)
      ) {
        this.bookmarks.set(key, from + Math.min(tab, replacement.length));
        this.bookmarkTabs.delete(key);
      } else {
        this.bookmarks.set(
          key,
          offset < from ? offset : offset >= to && offset !== from ? offset + delta : from,
        );
        if (offset >= from && offset < to) this.bookmarkTabs.delete(key);
      }
    }
    this.text = this.text.slice(0, from) + replacement + this.text.slice(to);
    this.cursor = from + replacement.length;
    this.anchor = null;
    this.clearBlock();
    this.modified = this.text !== this.savedText;
    this.preferredColumn = null;
    this.editedLine = this.position.line;
  }

  replaceSelection(text: string): void {
    const { from, to } = this.selectionPoints;
    this.replacePoints(from, to, text);
  }

  private replacePoints(from: TextPoint, to: TextPoint, text: string, record = true): void {
    const fromLine = this.text.slice(0, from.offset).split('\n').length - 1;
    const marks = [...this.bookmarks]
      .map(([key, offset]) => [key, this.point(offset, this.bookmarkTabs.get(key) ?? 0)] as const)
      .filter(
        ([, point]) =>
          point.tabOffset && (point.offset === from.offset || point.offset === to.offset),
      );
    const normalized = text.replace(/\r\n?/g, '\n');
    const collapsed = comparePoints(from, to) === 0;
    const prefixLength = from.tabOffset;
    const caret = from.offset + prefixLength + normalized.length;
    const restoreMarks = () => {
      for (const [key, old] of marks) {
        let point: TextPoint;
        if (old.offset === from.offset && old.tabOffset <= from.tabOffset)
          point = { offset: from.offset + old.tabOffset, tabOffset: 0 };
        else if (collapsed) {
          const start = this.lineStart(caret);
          const line = this.text.slice(0, caret).split('\n').length - 1;
          const column = textColumn(this.text.slice(start, caret), caret - start, this.tabSize);
          point = this.pointOnLine(line, column + old.tabOffset - from.tabOffset, true);
        } else if (old.offset === to.offset && old.tabOffset >= to.tabOffset)
          point = { offset: caret + old.tabOffset - to.tabOffset, tabOffset: 0 };
        else point = { offset: from.offset + prefixLength, tabOffset: 0 };
        this.bookmarks.set(key, point.offset);
        this.bookmarkTabs.set(key, point.tabOffset);
      }
    };
    if (collapsed) {
      if (!text) return;
      this.replaceRange(from.offset, from.offset, ' '.repeat(from.tabOffset) + text, record);
      restoreMarks();
      this.finishEdit(fromLine);
      return;
    }
    const prefix = ' '.repeat(from.tabOffset);
    const suffix = to.tabOffset
      ? ' '.repeat(tabWidthAt(this.text, to.offset, this.tabSize) - to.tabOffset)
      : '';
    this.replaceRange(
      from.offset,
      to.offset + (to.tabOffset ? 1 : 0),
      prefix + text + suffix,
      record,
    );
    this.cursor = from.offset + prefix.length + text.replace(/\r\n?/g, '\n').length;
    restoreMarks();
    this.finishEdit(fromLine);
  }

  insert(text: string): void {
    if (!this.insertMode && !this.hasSelection && !text.includes('\n')) {
      const { line, col } = this.visualPosition;
      let end = col;
      for (const character of text)
        end += character === '\t' ? this.tabSize - (end % this.tabSize) : 1;
      const target = this.pointOnLine(line, end, true);
      this.replacePoints(this.cursorPoint, target, text);
    } else this.replaceSelection(text);
  }

  /** Reconcile native input without losing a caret or selection inside a tab. */
  applyNativeInput(next: string, selectionEnd: number): void {
    next = next.replace(/\r\n?/g, '\n');
    const old = this.text;
    const range = this.selection;
    const prefix = old.slice(0, range.from);
    const suffix = old.slice(range.to);
    if (
      next.length >= prefix.length + suffix.length &&
      next.startsWith(prefix) &&
      next.endsWith(suffix)
    ) {
      const inserted = next.slice(prefix.length, next.length - suffix.length);
      if (selectionEnd === range.from + inserted.length) {
        this.insert(inserted);
        return;
      }
    }
    let start = 0;
    while (start < old.length && start < next.length && old[start] === next[start]) start++;
    let end = old.length;
    let nextEnd = next.length;
    while (end > start && nextEnd > start && old[end - 1] === next[nextEnd - 1]) {
      end--;
      nextEnd--;
    }
    this.cursor = start;
    this.anchor = end > start ? end : null;
    this.insert(next.slice(start, nextEnd));
    if (selectionEnd !== nextEnd)
      this.cursor = Math.max(0, Math.min(selectionEnd, this.text.length));
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
    const { from } = this.selection;
    if (this.hasSelection) this.replaceSelection('');
    else if (from > 0 || this.tabOffset > 0) {
      const { line, col } = this.position;
      const lines = this.lines;
      const sourceBefore = (lines[line] ?? '').slice(0, col);
      const before = sourceBefore + ' '.repeat(this.tabOffset);
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
        while (retained < prefix.length && sourceBefore[retained] === prefix[retained]) retained++;
        this.replaceRange(
          from - col + retained,
          from + (this.tabOffset ? 1 : 0),
          prefix.slice(retained),
        );
      } else if (this.tabOffset) {
        this.replaceRange(from, from + 1, ' '.repeat(this.tabOffset - 1));
      } else {
        const previous = this.previousOffset(from);
        this.replaceRange(
          previous,
          from,
          this.cursorThroughTabs && this.text[previous] === '\t'
            ? ' '.repeat(tabWidthAt(this.text, previous, this.tabSize) - 1)
            : '',
        );
      }
    }
  }

  deleteForward(): void {
    const { from, to } = this.selection;
    if (this.hasSelection) this.replaceSelection('');
    else if (this.tabOffset) this.replaceRange(from, from + 1, ' '.repeat(this.tabOffset));
    else if (to < this.text.length) this.replaceRange(to, this.nextOffset(to), '');
  }

  moveTo(offset: number, select = false): void {
    this.movePoint(this.point(offset), select);
  }

  private movePoint(point: TextPoint, select = false): void {
    if (select && this.anchor === null) {
      this.anchor = this.cursor;
      this.anchorTab = this.tabOffset;
    }
    if (!select) this.anchor = null;
    this.previousPosition = this.cursor;
    this.previousTab = this.tabOffset;
    if (this.text.slice(0, point.offset).split('\n').length - 1 !== this.position.line) {
      if (this.optimalFill && this.editedLine !== null)
        point = this.compactLine(this.editedLine, true)(point);
      this.editedLine = null;
    }
    point = this.point(point.offset, point.tabOffset);
    this.cursor = point.offset;
    this.cursorTab = point.tabOffset;
    this.preferredColumn = null;
  }

  private pointOnLine(
    line: number,
    column: number,
    throughTabs = this.cursorThroughTabs,
  ): TextPoint {
    const lines = this.lines;
    line = Math.max(0, Math.min(line, lines.length - 1));
    const point = pointAtColumn(lines[line] ?? '', column, this.tabSize, throughTabs);
    return { offset: this.offsetAt(line) + point.offset, tabOffset: point.tabOffset };
  }

  gotoVisual(line: number, column: number, select = false): void {
    this.movePoint(this.pointOnLine(line, column), select);
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
      const { line, col } = this.visualPosition;
      const desired = this.preferredColumn ?? col;
      this.gotoVisual(line + dy, desired, select);
      this.preferredColumn = desired;
      return;
    }
    if (!select && this.anchor !== null && this.hasSelection) {
      const selection = this.selectionPoints;
      this.movePoint(dx < 0 ? selection.from : selection.to);
      return;
    }
    let point = this.cursorPoint;
    for (let i = 0; i < Math.abs(dx); i++) {
      if (dx < 0) {
        if (point.tabOffset)
          point = { ...point, tabOffset: this.cursorThroughTabs ? point.tabOffset - 1 : 0 };
        else {
          if (point.offset === 0) continue;
          const previous = this.previousOffset(point.offset);
          point = {
            offset: previous,
            tabOffset:
              this.cursorThroughTabs && this.text[previous] === '\t'
                ? tabWidthAt(this.text, previous, this.tabSize) - 1
                : 0,
          };
        }
      } else if (
        this.cursorThroughTabs &&
        this.text[point.offset] === '\t' &&
        point.tabOffset + 1 < tabWidthAt(this.text, point.offset, this.tabSize)
      ) {
        point = { ...point, tabOffset: point.tabOffset + 1 };
      } else point = { offset: this.nextOffset(point.offset), tabOffset: 0 };
    }
    this.movePoint(point, select);
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
    this.movePoint(this.point(this.text.length), true);
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
    this.movePoint(this.point(found + query.length), true);
    return this.selection;
  }

  replace(query: string, replacement: string, all = false, caseSensitive = false): number {
    if (!query) return 0;
    if (!all) {
      const value = this.selectedText;
      const matches = new RegExp(`^${escapePattern(query)}$`, caseSensitive ? '' : 'i').test(value);
      if (!matches && !this.find(query, { caseSensitive })) return 0;
      this.replaceSelection(replacement);
      return 1;
    }
    const original = this.text;
    const offsets: number[] = [];
    replacement = replacement.replace(/\r\n?/g, '\n');
    const result = original.replace(
      new RegExp(escapePattern(query), caseSensitive ? 'g' : 'gi'),
      (_match, offset: number) => {
        offsets.push(offset);
        return replacement;
      },
    );
    if (!offsets.length) return 0;
    if (result === original) {
      this.end(false, true);
      this.clearBlock();
      return offsets.length;
    }
    const map = (point: TextPoint): TextPoint => {
      let shift = 0;
      for (const offset of offsets) {
        if (point.offset < offset) break;
        if (point.offset < offset + query.length) return { offset: offset + shift, tabOffset: 0 };
        shift += replacement.length - query.length;
      }
      return { ...point, offset: point.offset + shift };
    };
    const bookmarks = [...this.bookmarks].map(
      ([key, offset]) => [key, map(this.point(offset, this.bookmarkTabs.get(key) ?? 0))] as const,
    );
    const previous = map(this.point(this.previousPosition, this.previousTab));
    const pending =
      this.editedLine === null ? null : map(this.point(this.offsetAt(this.editedLine)));
    const changed = new Set<number>();
    const added = replacement.split('\n').length - 1;
    const removed = query.split('\n').length - 1;
    let line = 0,
      scan = 0,
      lineShift = 0;
    for (const offset of offsets) {
      line += original.slice(scan, offset).split('\n').length - 1;
      scan = offset;
      for (let row = line + lineShift; row <= line + lineShift + added; row++) changed.add(row);
      lineShift += added - removed;
    }
    this.remember();
    this.text = result;
    this.cursor = result.length;
    this.anchor = null;
    this.clearBlock();
    this.previousPosition = previous.offset;
    this.previousTab = previous.tabOffset;
    for (const [key, point] of bookmarks) {
      this.bookmarks.set(key, point.offset);
      this.bookmarkTabs.set(key, point.tabOffset);
    }
    if (pending) changed.add(this.text.slice(0, pending.offset).split('\n').length - 1);
    const last = this.position.line;
    if (this.optimalFill)
      for (const row of [...changed].sort((a, b) => a - b))
        if (row < last) this.compactLine(row, false);
    this.editedLine = changed.has(last) ? last : null;
    this.modified = this.text !== this.savedText;
    this.preferredColumn = null;
    return offsets.length;
  }

  private indent(unindent = false): void {
    const selection = this.selection;
    const previousCursor = this.cursor;
    if (selection.from === selection.to && !unindent) {
      const before =
        (this.lines[this.position.line] ?? '').slice(0, this.position.col) +
        ' '.repeat(this.tabOffset);
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
    this.finishEdit(this.text.slice(0, from).split('\n').length - 1);
  }

  private newline(): void {
    const line = this.lines[this.position.line] ?? '';
    const before = line.slice(0, this.position.col) + ' '.repeat(this.tabOffset);
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
      this.bookmarkTabs.set(Number(key), this.tabOffset);
      return;
    }
    switch (key) {
      case 'b':
        this.blockStart = this.cursor;
        this.blockStartTab = 0;
        this.blockEnd = null;
        this.anchor = null;
        this.blockVisible = true;
        break;
      case 'k':
        this.blockEnd = this.cursor;
        this.blockEndTab = 0;
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
        this.replacePoints(this.cursorPoint, this.cursorPoint, value);
        break;
      }
      case 'v': {
        if (from === to || (this.cursor >= from && this.cursor <= to)) break;
        const value = this.text.slice(from, to);
        const target = {
          offset: this.cursor > to ? this.cursor - (to - from) : this.cursor,
          tabOffset: this.tabOffset,
        };
        this.remember();
        this.replaceRange(from, to, '', false);
        const point = this.point(target.offset, target.tabOffset);
        this.replacePoints(point, point, value, false);
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
      if (bookmark !== undefined)
        this.movePoint(this.point(bookmark, this.bookmarkTabs.get(Number(key)) ?? 0));
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
        this.gotoVisual(this.scrollY, this.visualPosition.col);
        break;
      case 'x':
        this.gotoVisual(this.scrollY + viewportRows - 1, this.visualPosition.col);
        break;
      case 'p':
        this.movePoint(this.point(this.previousPosition, this.previousTab));
        break;
      case 'b':
        if (this.blockStart !== null)
          this.movePoint(this.point(this.blockStart, this.blockStartTab));
        break;
      case 'k':
        if (this.blockEnd !== null) this.movePoint(this.point(this.blockEnd, this.blockEndTab));
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
        const option = {
          i: 'autoIndent',
          t: 'useTabCharacter',
          u: 'backspaceUnindents',
          r: 'cursorThroughTabs',
          f: 'optimalFill',
        } as const;
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
          this.gotoVisual(this.scrollY, this.visualPosition.col, event.shiftKey);
          return true;
        case 'End':
          this.gotoVisual(this.scrollY + visibleRows - 1, this.visualPosition.col, event.shiftKey);
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
