import type { CellBuffer } from '../cell-buffer';
import { VGA_PALETTE } from '../palette';
import { CELL_HEIGHT, CELL_WIDTH, GlyphAtlas, type VgaAtlasData } from './glyph-atlas';

export interface TextCursor {
  x: number;
  y: number;
  block: boolean;
}

export class CanvasRenderer {
  private readonly context: CanvasRenderingContext2D;
  private atlas: GlyphAtlas | undefined;
  private previousChars: string[] = [];
  private previousAttrs = new Uint8Array(0);
  private previousCursor: number | undefined;
  private readonly image: ImageData;
  private readonly rgb = VGA_PALETTE.map((hex) => [
    Number.parseInt(hex.slice(1, 3), 16),
    Number.parseInt(hex.slice(3, 5), 16),
    Number.parseInt(hex.slice(5, 7), 16),
  ]);

  constructor(
    readonly canvas: HTMLCanvasElement,
    private buffer: CellBuffer,
  ) {
    const context = canvas.getContext('2d', { alpha: false });
    if (!context) throw new Error('Canvas 2D is unavailable');
    this.context = context;
    this.image = context.createImageData(CELL_WIDTH, CELL_HEIGHT);
    this.setBuffer(buffer);
  }

  async initialize(): Promise<void> {
    const font = new FontFace('PyTurbo VGA', 'url("/fonts/Px437_IBM_VGA_9x16.ttf")');
    const [, response] = await Promise.all([
      font.load(),
      fetch('/fonts/Px437_IBM_VGA_9x16.atlas.json'),
    ]);
    if (!response.ok) throw new Error(`VGA glyph atlas could not be loaded (${response.status})`);
    const data = (await response.json()) as VgaAtlasData;
    document.fonts.add(font);
    this.atlas = new GlyphAtlas('PyTurbo VGA', data);
    this.atlas.build();
    this.previousChars = [];
    this.render();
  }

  setBuffer(buffer: CellBuffer): void {
    this.buffer = buffer;
    this.canvas.width = buffer.cols * CELL_WIDTH;
    this.canvas.height = buffer.rows * CELL_HEIGHT;
    this.canvas.style.imageRendering = 'pixelated';
    this.context.imageSmoothingEnabled = false;
    this.previousChars = [];
    this.previousAttrs = new Uint8Array(buffer.attrs.length);
    this.previousCursor = undefined;
  }

  render(cursor?: TextCursor): void {
    if (!this.atlas) return;
    const currentCursor =
      cursor &&
      cursor.x >= 0 &&
      cursor.x < this.buffer.cols &&
      cursor.y >= 0 &&
      cursor.y < this.buffer.rows
        ? cursor.y * this.buffer.cols + cursor.x
        : undefined;
    for (let index = 0; index < this.buffer.chars.length; index++) {
      const ch = this.buffer.chars[index] ?? ' ';
      const attr = this.buffer.attrs[index] ?? 0;
      if (
        ch !== this.previousChars[index] ||
        attr !== this.previousAttrs[index] ||
        index === this.previousCursor ||
        index === currentCursor
      ) {
        this.drawCell(index, ch, attr, index === currentCursor ? cursor : undefined);
        this.previousChars[index] = ch;
        this.previousAttrs[index] = attr;
      }
    }
    this.previousCursor = currentCursor;
  }

  private drawCell(index: number, ch: string, attr: number, cursor?: TextCursor): void {
    const mask = this.atlas?.mask(ch);
    if (!mask) return;
    const foreground = this.rgb[attr & 0x0f] ?? [255, 255, 255];
    const background = this.rgb[(attr >> 4) & 0x0f] ?? [0, 0, 0];
    const data = this.image.data;
    for (let pixel = 0; pixel < mask.length; pixel++) {
      let ink = mask[pixel] === 1;
      if (cursor && (cursor.block || pixel >= CELL_WIDTH * (CELL_HEIGHT - 2))) ink = !ink;
      const colour = ink ? foreground : background;
      data[pixel * 4] = colour[0] ?? 0;
      data[pixel * 4 + 1] = colour[1] ?? 0;
      data[pixel * 4 + 2] = colour[2] ?? 0;
      data[pixel * 4 + 3] = 255;
    }
    this.context.putImageData(
      this.image,
      (index % this.buffer.cols) * CELL_WIDTH,
      Math.floor(index / this.buffer.cols) * CELL_HEIGHT,
    );
  }
}
