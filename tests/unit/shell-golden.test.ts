import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { CellBuffer } from '../../src/engine/cell-buffer';
import { Application } from '../../src/ide/application';
import type { MenuItem } from '../../src/ide/menus';
import { defaultSettings } from '../../src/storage/workspace';

interface MenuSnapshot {
  top: number;
  items: MenuItem[];
  selected: number;
  x: number;
  y: number;
  width: number;
}

function screen(cols = 80): {
  buffer: CellBuffer;
  shell: {
    menuStack: MenuSnapshot[];
    openMenu(index: number): void;
    drawMenu(menu: MenuSnapshot): void;
    drawMenuBar(): void;
    drawDialog(dialog: unknown): void;
  };
} {
  const buffer = new CellBuffer(cols, 25);
  buffer.fill(0, 0, cols, 25, '░', 0x71);
  // Exercise the real drawing methods without starting storage, workers or a DOM.
  const shell = Object.assign(Object.create(Application.prototype), {
    buffer,
    settings: structuredClone(defaultSettings),
    menuStack: [],
    menuFocused: false,
    menuIndex: 1,
  });
  return { buffer, shell };
}

function cells(buffer: CellBuffer): string {
  const rows: string[] = [
    'PyTurbo implementation contract: 80x25 cells; NOT an original-IDE reference or approved fidelity baseline.',
  ];
  for (let y = 0; y < buffer.rows; y++) {
    rows.push(buffer.chars.slice(y * buffer.cols, (y + 1) * buffer.cols).join(''));
    rows.push(
      Array.from(buffer.attrs.slice(y * buffer.cols, (y + 1) * buffer.cols), (attr) =>
        attr.toString(16).padStart(2, '0'),
      ).join(' '),
    );
  }
  return `${rows.join('\n')}\n`;
}

describe('actual shell cell contracts', () => {
  it('matches the independently transcribed original File-selected menu bar', () => {
    const reference = JSON.parse(
      readFileSync(new URL('./fixtures/golden/menu-bar.cells.json', import.meta.url), 'utf8'),
    ) as { text: string; attributes: number[] };
    const { buffer, shell } = screen();
    shell.openMenu(1);
    shell.drawMenuBar();
    expect(buffer.chars.slice(0, 80).join('')).toBe(reference.text);
    expect([...buffer.attrs.slice(0, 80)]).toEqual(reference.attributes);
    // A caption's left margin does not move its popup frame or item text.
    shell.drawMenu(shell.menuStack[0]);
    expect(shell.menuStack[0].x).toBe(3);
    expect(buffer.get(4, 1)?.ch).toBe('┌');
    expect(buffer.get(6, 2)?.ch).toBe('N');
  });

  it('retains the right-aligned Window and Help captions in a wider grid', () => {
    const { buffer, shell } = screen(100);
    shell.drawMenuBar();
    expect(buffer.get(2, 0)).toEqual({ ch: '≡', attr: 0x74 });
    expect(buffer.get(5, 0)).toEqual({ ch: 'F', attr: 0x74 });
    expect(buffer.get(86, 0)).toEqual({ ch: 'W', attr: 0x74 });
    expect(buffer.get(94, 0)).toEqual({ ch: 'H', attr: 0x74 });
  });

  it('retains the File menu character grid and attribute bytes', async () => {
    const { buffer, shell } = screen();
    shell.openMenu(1);
    shell.drawMenu(shell.menuStack[0]);
    await expect(cells(buffer)).toMatchFileSnapshot('./fixtures/golden/file-menu.cells.txt');
  });

  it('retains dialog fields, selected file, buttons and underlying shadow glyphs', async () => {
    const { buffer, shell } = screen();
    shell.drawDialog({
      title: 'Open a File',
      message: ['Browser workspace · /pyturbo/project'],
      fields: [{ label: 'Name', value: '*.py' }],
      list: ['main.py', 'lib/math.py'],
      selected: 1,
      buttons: ['OK', 'Cancel'],
      width: 64,
      fieldIndex: 0,
      onSubmit: () => {},
      buttonRects: [],
      fieldRows: [],
      listTop: 0,
      rect: { x: 0, y: 0, w: 0, h: 0 },
    });
    await expect(cells(buffer)).toMatchFileSnapshot('./fixtures/golden/open-dialog.cells.txt');
  });
});
