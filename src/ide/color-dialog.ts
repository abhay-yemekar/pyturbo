import type { CellBuffer, Rect } from '../engine';
import { COLOR_GROUPS, type ColorItem } from './colors';

export interface ColorDialogState {
  group: number;
  item: number;
  focus: string;
  values: Record<string, number>;
  help?: boolean;
}

export function selectedColorItem(state: ColorDialogState): ColorItem {
  return COLOR_GROUPS[state.group].items[state.item];
}

export function colorListStart(index: number, length: number): number {
  return Math.max(0, Math.min(index - 13, length - 14));
}

export function colorDialogRects(
  cols: number,
  rows: number,
): {
  rect: Rect;
  group: Rect;
  item: Rect;
  foreground: Rect;
  background: Rect;
  buttons: Rect[];
} {
  const x = Math.floor((cols - 64) / 2);
  const y = Math.max(1, Math.floor((rows - 22) / 2));
  return {
    rect: { x, y, w: 64, h: 22 },
    group: { x: x + 3, y: y + 3, w: 19, h: 14 },
    item: { x: x + 24, y: y + 3, w: 22, h: 14 },
    foreground: { x: x + 48, y: y + 3, w: 12, h: 4 },
    background: { x: x + 48, y: y + 10, w: 12, h: 2 },
    buttons: [29, 41, 53].map((offset) => ({ x: x + offset, y: y + 19, w: 8, h: 1 })),
  };
}

/** Original Colors geometry in cells; font/raster fidelity is verified separately. */
export function drawColorDialog(
  b: CellBuffer,
  state: ColorDialogState,
  attr: (key: string, fallback: number) => number,
  shadows: boolean,
): ReturnType<typeof colorDialogRects> {
  const layout = colorDialogRects(b.cols, b.rows);
  const { x, y, w, h } = layout.rect;
  const normal = attr('dialogNormalText', 0x70);
  const border = attr('dialogActiveBorder', 0x7f);
  if (shadows) b.shadow(x, y, w, h);
  b.fill(x, y, w, h, ' ', normal);
  b.box(x, y, w, h, true, border);
  b.text(x + 28, y, ' Colors ', attr('dialogActiveTitle', 0x7f));
  b.text(x + 2, y, '[■]', border);
  b.set(x + 3, y, '■', attr('dialogIcons', 0x7a));

  const label = (xx: number, yy: number, text: string, key: string) => {
    b.text(
      xx,
      yy,
      text,
      attr(
        state.focus === key ? 'controlInactiveTitle' : 'controlActiveTitle',
        state.focus === key ? 0x7f : 0x70,
      ),
    );
    b.set(xx, yy, text[0], attr('controlFirstLetter', 0x7e));
  };
  label(x + 3, y + 2, 'Group', 'group');
  label(x + 24, y + 2, 'Item', 'item');
  const list = (rect: Rect, labels: string[], selected: number, focus: string) => {
    const start = colorListStart(selected, labels.length);
    const textWidth = rect.w - (labels.length > rect.h ? 1 : 0);
    b.fill(rect.x, rect.y, rect.w, rect.h, ' ', attr('listActive', 0x30));
    labels.slice(start, start + rect.h).forEach((text, row) => {
      const color =
        row + start === selected
          ? attr(
              state.focus === focus ? 'listSelected' : 'listDefault',
              state.focus === focus ? 0x2f : 0x3e,
            )
          : attr('listActive', 0x30);
      b.fill(rect.x, rect.y + row, textWidth, 1, ' ', color);
      b.text(rect.x + 1, rect.y + row, text.slice(0, textWidth - 1), color);
    });
    if (labels.length > rect.h) {
      const column = rect.x + rect.w - 1;
      b.fill(column, rect.y, 1, rect.h, '▒', attr('dialogScrollBar', 0x31));
      b.set(column, rect.y, '▲', attr('dialogArrows', 0x13));
      b.set(column, rect.y + rect.h - 1, '▼', attr('dialogArrows', 0x13));
      b.set(
        column,
        rect.y + 1 + Math.round((selected / (labels.length - 1)) * (rect.h - 3)),
        '■',
        attr('dialogThumbTab', 0x31),
      );
    }
  };
  list(
    layout.group,
    COLOR_GROUPS.map((entry) => entry.label),
    state.group,
    'group',
  );
  list(
    layout.item,
    COLOR_GROUPS[state.group].items.map((entry) => entry.label),
    state.item,
    'item',
  );
  const item = selectedColorItem(state);
  const current = attr(item.key, item.attr);
  for (const [rect, text, value] of [
    [layout.foreground, 'Foreground', current & 15],
    [layout.background, 'Background', current >> 4],
  ] as const) {
    b.box(rect.x - 1, rect.y - 1, rect.w + 2, rect.h + 2, false, normal);
    label(rect.x, rect.y - 1, text, text.toLowerCase());
    for (let color = 0; color < rect.h * 4; color++)
      b.text(
        rect.x + (color % 4) * 3,
        rect.y + Math.floor(color / 4),
        color === value ? '•••' : '   ',
        (color << 4) | (color === 0 ? 7 : 0),
      );
  }
  b.text(x + 48, y + 14, 'Item Color', normal);
  b.text(x + 48, y + 15, 'TEXT TEXT', current);
  b.text(x + 48, y + 16, 'TEXT TEXT', current);
  if (state.help) {
    b.text(x + 3, y + 17, 'Tab: control  Arrows: choose  Alt+G/I/F/B: focus', normal);
    b.text(x + 3, y + 18, 'OK saves; Cancel or Esc discards changes.', normal);
  }
  ['OK', 'Cancel', 'Help'].forEach((text, index) => {
    const rect = layout.buttons[index];
    const role =
      state.focus === `button-${index}` ? 'Selected' : index === 0 ? 'Default' : 'Active';
    const face = attr(`button${role}`, index === 0 ? 0x2b : 0x20);
    b.fill(rect.x, rect.y, rect.w, 1, ' ', face);
    const textX = rect.x + Math.floor((rect.w - text.length) / 2);
    b.text(textX, rect.y, text, face);
    b.set(textX, rect.y, text[0], attr(`button${role}Letter`, 0x2e));
    if (shadows) {
      b.set(rect.x + rect.w, rect.y, '▄', normal);
      b.fill(rect.x + 1, rect.y + 1, rect.w, 1, '▀', normal);
    }
  });
  return layout;
}
