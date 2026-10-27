export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Cell {
  ch: string;
  attr: number;
}

/** Text-mode screen memory. Coordinates are cells, attributes are VGA bytes. */
export class CellBuffer {
  readonly chars: string[];
  readonly attrs: Uint8Array;

  constructor(
    readonly cols: number,
    readonly rows: number,
  ) {
    if (!Number.isInteger(cols) || !Number.isInteger(rows) || cols < 1 || rows < 1) {
      throw new RangeError('Cell buffer dimensions must be positive integers');
    }
    this.chars = Array<string>(cols * rows).fill(' ');
    this.attrs = new Uint8Array(cols * rows);
  }

  private contains(x: number, y: number): boolean {
    return (
      Number.isInteger(x) &&
      Number.isInteger(y) &&
      x >= 0 &&
      y >= 0 &&
      x < this.cols &&
      y < this.rows
    );
  }

  get(x: number, y: number): Cell | undefined {
    if (!this.contains(x, y)) return undefined;
    const index = y * this.cols + x;
    return { ch: this.chars[index] ?? ' ', attr: this.attrs[index] ?? 0 };
  }

  set(x: number, y: number, ch: string, attr: number): void {
    if (!this.contains(x, y)) return;
    const index = y * this.cols + x;
    this.chars[index] = Array.from(ch)[0] ?? ' ';
    this.attrs[index] = attr;
  }

  fill(x: number, y: number, w: number, h: number, ch: string, attr: number): void {
    const left = Math.max(0, Math.trunc(x));
    const top = Math.max(0, Math.trunc(y));
    const right = Math.min(this.cols, Math.trunc(x + w));
    const bottom = Math.min(this.rows, Math.trunc(y + h));
    for (let row = top; row < bottom; row++) {
      for (let col = left; col < right; col++) this.set(col, row, ch, attr);
    }
  }

  text(x: number, y: number, text: string, attr: number): void {
    let col = x;
    let row = y;
    for (const ch of text) {
      if (ch === '\n') {
        col = x;
        row++;
      } else if (ch !== '\r') {
        this.set(col++, row, ch, attr);
      }
    }
  }

  box(x: number, y: number, w: number, h: number, double: boolean, attr: number): void {
    if (w < 2 || h < 2) return;
    const [tl, tr, bl, br, horizontal, vertical] = double
      ? ['╔', '╗', '╚', '╝', '═', '║']
      : ['┌', '┐', '└', '┘', '─', '│'];
    this.fill(x + 1, y, w - 2, 1, horizontal ?? '─', attr);
    this.fill(x + 1, y + h - 1, w - 2, 1, horizontal ?? '─', attr);
    this.fill(x, y + 1, 1, h - 2, vertical ?? '│', attr);
    this.fill(x + w - 1, y + 1, 1, h - 2, vertical ?? '│', attr);
    this.set(x, y, tl ?? '┌', attr);
    this.set(x + w - 1, y, tr ?? '┐', attr);
    this.set(x, y + h - 1, bl ?? '└', attr);
    this.set(x + w - 1, y + h - 1, br ?? '┘', attr);
  }

  /** Borland shadow: retain underlying characters, recolour to dark grey on black. */
  shadow(x: number, y: number, w: number, h: number): void {
    const width = this.rows > 25 ? 1 : 2;
    const recolour = (left: number, top: number, cols: number, rows: number) => {
      for (let row = Math.max(0, top); row < Math.min(this.rows, top + rows); row++) {
        for (let col = Math.max(0, left); col < Math.min(this.cols, left + cols); col++) {
          this.attrs[row * this.cols + col] = 0x08;
        }
      }
    };
    recolour(x + w, y + 1, width, h);
    recolour(x + width, y + h, w - width, 1);
  }

  toText(): string {
    return Array.from({ length: this.rows }, (_, row) =>
      this.chars.slice(row * this.cols, (row + 1) * this.cols).join(''),
    ).join('\n');
  }
}
