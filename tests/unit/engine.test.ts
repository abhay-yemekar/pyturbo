import { describe, expect, it } from 'vitest';
import atlasData from '../../public/fonts/Px437_IBM_VGA_9x16.atlas.json';
import { CellBuffer } from '../../src/engine/cell-buffer';
import { APP_PALETTE, EDITOR_PALETTE, VGA_PALETTE } from '../../src/engine/palette';
import { CP437_GLYPHS, decodeGlyphRows } from '../../src/engine/renderer/glyph-atlas';
import { Group, View } from '../../src/engine/views';

describe('cell-buffer screen memory', () => {
  it('clips writes without spilling into neighbouring rows', () => {
    const buffer = new CellBuffer(4, 2);
    buffer.text(-1, 0, 'abcde', 0x1f);
    buffer.set(4, 0, '!', 0x70);
    buffer.fill(2, 1, 9, 4, 'x', 0x20);
    expect(buffer.toText()).toBe('bcde\n  xx');
    expect(buffer.get(4, 0)).toBeUndefined();
    expect(buffer.get(2, 1)).toEqual({ ch: 'x', attr: 0x20 });
  });

  it('matches a golden double-frame and retains the contents', () => {
    const buffer = new CellBuffer(8, 4);
    buffer.fill(0, 0, 8, 4, ' ', 0x1e);
    buffer.box(0, 0, 8, 4, true, 0x1f);
    buffer.text(2, 1, 'Hi', 0x1a);
    expect(buffer.toText()).toBe('╔══════╗\n║ Hi   ║\n║      ║\n╚══════╝');
    expect(buffer.get(2, 1)?.attr).toBe(0x1a);
    expect(buffer.get(7, 3)?.attr).toBe(0x1f);
  });

  it('recolours shadow cells while preserving the characters underneath', () => {
    const buffer = new CellBuffer(10, 8);
    buffer.fill(0, 0, 10, 8, '░', 0x71);
    buffer.shadow(1, 1, 5, 3);
    expect(buffer.get(6, 1)?.attr).toBe(0x71);
    expect(buffer.get(6, 2)).toEqual({ ch: '░', attr: 0x08 });
    expect(buffer.get(7, 4)?.attr).toBe(0x08);
    expect(buffer.get(2, 4)?.attr).toBe(0x71);
    expect(buffer.get(3, 4)?.attr).toBe(0x08);
    expect(buffer.get(8, 4)?.attr).toBe(0x71);
  });

  it('uses one-column right shadows in 43/50-line mode', () => {
    const buffer = new CellBuffer(10, 43);
    buffer.fill(0, 0, 10, 43, '░', 0x71);
    buffer.shadow(1, 1, 5, 3);
    expect(buffer.get(6, 2)?.attr).toBe(0x08);
    expect(buffer.get(7, 2)?.attr).toBe(0x71);
  });
});

describe('palette and glyph contracts', () => {
  it('keeps the hardware palette and one-based application indexes', () => {
    expect(VGA_PALETTE).toHaveLength(16);
    expect(APP_PALETTE).toHaveLength(64);
    expect(APP_PALETTE[1]).toBe(0x71);
    expect(APP_PALETTE[6]).toBe(0x28);
    expect(APP_PALETTE[41]).toBe(0x20);
    expect(EDITOR_PALETTE.identifier).toBe(0x1a);
    expect(EDITOR_PALETTE.hex).toBe(0x10);
  });

  it('maps all CP437 positions, including VGA line-graphics and control symbols', () => {
    expect(CP437_GLYPHS).toHaveLength(256);
    expect(CP437_GLYPHS[0x18]).toBe('↑');
    expect(CP437_GLYPHS[0xb0]).toBe('░');
    expect(CP437_GLYPHS[0xc0]).toBe('└');
    expect(CP437_GLYPHS[0xdf]).toBe('▀');
    expect(CP437_GLYPHS[0xfe]).toBe('■');
  });

  it('preserves the one-pixel gap in double frames without browser antialiasing', () => {
    const mask = decodeGlyphRows(atlasData.glyphs[0xba] ?? []);
    expect(Array.from(mask.slice(0, 9))).toEqual([0, 0, 1, 1, 0, 1, 1, 0, 0]);
    expect(decodeGlyphRows(atlasData.glyphs[0xdb] ?? []).every((pixel) => pixel === 1)).toBe(true);
    expect(atlasData.glyphs).toHaveLength(256);
  });

  it('extends the eighth column in all VGA line-graphics glyphs', () => {
    for (let code = 0xc0; code <= 0xdf; code++) {
      for (const row of atlasData.glyphs[code] ?? []) {
        expect((row >> 8) & 1).toBe((row >> 7) & 1);
      }
    }
  });
});

describe('view event routing', () => {
  it('dispatches a pointer event to the topmost eligible child', () => {
    const handled: string[] = [];
    class Handler extends View {
      constructor(private readonly name: string) {
        super({ x: 0, y: 0, w: 5, h: 5 });
      }
      override handle(): boolean {
        handled.push(this.name);
        return true;
      }
    }
    const group = new Group({ x: 0, y: 0, w: 10, h: 10 });
    group.add(new Handler('back'));
    const front = group.add(new Handler('front'));
    group.handle({ type: 'pointer', x: 2, y: 2, action: 'down' });
    front.visible = false;
    group.handle({ type: 'pointer', x: 2, y: 2, action: 'down' });
    expect(handled).toEqual(['front', 'back']);
  });
});
