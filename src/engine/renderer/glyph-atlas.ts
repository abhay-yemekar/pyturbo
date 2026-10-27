export const CELL_WIDTH = 9;
export const CELL_HEIGHT = 16;

/** Unicode equivalents of the hardware's 256 glyph positions. */
export const CP437_GLYPHS = Array.from(
  ' ☺☻♥♦♣♠•◘○◙♂♀♪♫☼►◄↕‼¶§▬↨↑↓→←∟↔▲▼' +
    Array.from({ length: 95 }, (_, index) => String.fromCharCode(index + 32)).join('') +
    '⌂ÇüéâäàåçêëèïîìÄÅÉæÆôöòûùÿÖÜ¢£¥₧ƒáíóúñÑªº¿⌐¬½¼¡«»' +
    '░▒▓│┤╡╢╖╕╣║╗╝╜╛┐└┴┬├─┼╞╟╚╔╩╦╠═╬╧╨╤╥╙╘╒╓╫╪┘┌█▄▌▐▀' +
    'αßΓπΣσµτΦΘΩδ∞φε∩≡±≥≤⌠⌡÷≈°∙·√ⁿ²■ ',
);

export interface VgaAtlasData {
  width: number;
  height: number;
  glyphs: number[][];
}

export function decodeGlyphRows(rows: readonly number[]): Uint8Array {
  if (
    rows.length !== CELL_HEIGHT ||
    rows.some((row) => !Number.isInteger(row) || row < 0 || row > 511)
  ) {
    throw new Error('Invalid VGA atlas glyph');
  }
  return Uint8Array.from(
    { length: CELL_WIDTH * CELL_HEIGHT },
    (_, pixel) => ((rows[Math.floor(pixel / CELL_WIDTH)] ?? 0) >> (pixel % CELL_WIDTH)) & 1,
  );
}

/** Prebuilt CP437 masks are deterministic; only non-CP437 fallback uses Canvas text. */
export class GlyphAtlas {
  private readonly masks = new Map<string, Uint8Array>();
  private readonly canvas: HTMLCanvasElement;
  private readonly context: CanvasRenderingContext2D;
  private baseline = 12;

  constructor(
    private readonly family: string,
    private readonly data: VgaAtlasData,
  ) {
    this.canvas = document.createElement('canvas');
    this.canvas.width = CELL_WIDTH;
    this.canvas.height = CELL_HEIGHT;
    const context = this.canvas.getContext('2d', { willReadFrequently: true });
    if (!context) throw new Error('Canvas 2D is unavailable');
    this.context = context;
    context.font = `${CELL_HEIGHT}px "${family}", monospace`;
    context.textBaseline = 'alphabetic';
    this.baseline = Math.round(context.measureText('█').actualBoundingBoxAscent);
  }

  build(): void {
    if (
      this.data.width !== CELL_WIDTH ||
      this.data.height !== CELL_HEIGHT ||
      this.data.glyphs.length !== 256
    ) {
      throw new Error('Invalid VGA atlas dimensions');
    }
    for (let code = 0; code < CP437_GLYPHS.length; code++) {
      const ch = CP437_GLYPHS[code];
      const rows = this.data.glyphs[code];
      if (ch !== undefined && rows) this.masks.set(ch, decodeGlyphRows(rows));
    }
  }

  mask(ch: string): Uint8Array {
    const cached = this.masks.get(ch);
    if (cached) return cached;
    const context = this.context;
    context.clearRect(0, 0, CELL_WIDTH, CELL_HEIGHT);
    context.font = `${CELL_HEIGHT}px "${this.family}", monospace`;
    context.fillStyle = '#FFFFFF';
    context.fillText(ch, 0, this.baseline);
    const rgba = context.getImageData(0, 0, CELL_WIDTH, CELL_HEIGHT).data;
    const mask = new Uint8Array(CELL_WIDTH * CELL_HEIGHT);
    for (let pixel = 0; pixel < mask.length; pixel++)
      mask[pixel] = (rgba[pixel * 4 + 3] ?? 0) >= 128 ? 1 : 0;
    this.masks.set(ch, mask);
    return mask;
  }
}
