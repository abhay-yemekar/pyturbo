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

function screen(): {
  buffer: CellBuffer;
  shell: {
    menuStack: MenuSnapshot[];
    openMenu(index: number): void;
    drawMenu(menu: MenuSnapshot): void;
    drawDialog(dialog: unknown): void;
  };
} {
  const buffer = new CellBuffer(80, 25);
  buffer.fill(0, 0, 80, 25, '░', 0x71);
  // Exercise the real drawing methods without starting storage, workers or a DOM.
  const shell = Object.assign(Object.create(Application.prototype), {
    buffer,
    settings: structuredClone(defaultSettings),
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
