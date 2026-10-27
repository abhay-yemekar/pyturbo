import { describe, expect, it } from 'vitest';
import { CellBuffer } from '../../src/engine';
import { Application } from '../../src/ide/application';
import { type ColorDialogState, drawColorDialog } from '../../src/ide/color-dialog';
import { COLOR_GROUPS, colorAttribute } from '../../src/ide/colors';
import { defaultSettings } from '../../src/storage/workspace';

describe('reference IDE palettes', () => {
  it('retains all twenty original groups, including the off-screen dialog groups', () => {
    expect(COLOR_GROUPS.map((group) => group.label)).toEqual([
      'Main Menu',
      'Pulldown Menus',
      'Popup Menus',
      'Edit Window',
      'Output Window',
      'Message Window',
      'Watch Window',
      'Modal Help',
      'Help',
      'Status Line',
      'Project Window',
      'Inspector Window',
      'Dialog Window',
      'Dialog Controls',
      'Dialog Messages',
      'Dialog Buttons',
      'Dialog Text Entry',
      'Dialog Lists',
      'Dialog Groups',
      'Desktop Color',
    ]);
    expect(COLOR_GROUPS[3].items).toHaveLength(24);
    const keys = COLOR_GROUPS.flatMap((group) => group.items.map((item) => item.key));
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('uses the IDE-specific defaults rather than generic blue/cyan window palettes', () => {
    const read = (role: string) => colorAttribute({}, role);
    expect(['outputInactiveTitle', 'outputActiveBorder', 'outputIcons'].map(read)).toEqual([
      0x07, 0x0f, 0x0a,
    ]);
    expect(['watchInactiveTitle', 'watchMarkedText', 'watchTrackingBar'].map(read)).toEqual([
      0x31, 0x2b, 0x3f,
    ]);
    expect(['helpNormalText', 'helpScrollBar', 'helpArrows'].map(read)).toEqual([0x30, 0x31, 0x13]);
    expect(['dialogScrollBar', 'dialogArrows', 'inputNormalText'].map(read)).toEqual([
      0x31, 0x13, 0x1b,
    ]);
  });

  it('keeps old settings readable while new title, border and window choices remain independent', () => {
    const old = { identifier: 0x1c, menu: 0x71, activeBorder: 0x4f, output: 0x0e };
    expect(colorAttribute(old, 'editIdentifier')).toBe(0x1c);
    expect(colorAttribute(old, 'mainMenuNormalText')).toBe(0x71);
    expect(colorAttribute(old, 'pulldownNormalText')).toBe(0x71);
    expect(colorAttribute(old, 'watchActiveTitle')).toBe(0x4f);
    expect(colorAttribute(old, 'outputNormalText', 0x07)).toBe(0x0e);
    const colors = {
      editActiveBorder: 0x4f,
      outputActiveTitle: 0x2e,
      editIdentifier: 0x1d,
      identifier: 0x1c,
    };
    expect(colorAttribute(colors, 'identifier')).toBe(0x1d);
    expect(colorAttribute(colors, 'editActiveTitle')).toBe(0x1f);
    expect(colorAttribute(colors, 'outputActiveBorder')).toBe(0x0f);
    expect(colorAttribute(colors, 'outputActiveTitle')).toBe(0x2e);
    expect(colorAttribute({ undefined: 0x4f }, 'notAColor', 0x07)).toBe(0x07);
  });

  it('draws Output and Help with their own frame, text, icon and scrollbar roles', () => {
    const buffer = new CellBuffer(80, 25);
    const shell = Object.assign(Object.create(Application.prototype), {
      buffer,
      settings: {
        ...structuredClone(defaultSettings),
        colors: { editActiveBorder: 0x4f, outputActiveTitle: 0x2e },
      },
      output: [{ text: 'result', attr: 0x07 }],
    });
    const window = { id: 2, kind: 'output', title: 'Output', bounds: { x: 2, y: 2, w: 40, h: 8 } };
    shell.drawWindow(window, true);
    expect(buffer.get(2, 3)?.attr).toBe(0x0f);
    expect(buffer.get(5, 2)?.attr).toBe(0x0a);
    expect(buffer.get(18, 2)?.attr).toBe(0x2e);
    expect(buffer.get(3, 3)?.attr).toBe(0x07);
    shell.drawWindow(window, false);
    expect(buffer.get(2, 3)?.attr).toBe(0x07);
    shell.drawWindow({ ...window, kind: 'help', title: 'Help', content: ['topic'] }, true);
    expect(buffer.get(3, 3)?.attr).toBe(0x30);
    expect(buffer.get(41, 3)?.attr).toBe(0x31);
  });

  it('draws the transcribed Colors group/item layout, picker marks and current sample', () => {
    const buffer = new CellBuffer(80, 25);
    const state: ColorDialogState = { group: 0, item: 0, focus: 'group', values: {} };
    const layout = drawColorDialog(
      buffer,
      state,
      (key, fallback) => colorAttribute(state.values, key, fallback),
      true,
    );
    expect(layout.rect).toEqual({ x: 8, y: 1, w: 64, h: 22 });
    expect(buffer.get(11, 3)?.ch).toBe('G');
    expect(buffer.get(32, 3)?.ch).toBe('I');
    expect(buffer.get(12, 4)?.attr).toBe(0x2f);
    expect(buffer.get(33, 4)?.attr).toBe(0x3e);
    expect(buffer.get(56, 4)).toEqual({ ch: '•', attr: 0x07 });
    expect(buffer.get(55, 3)?.ch).toBe('┌');
    expect(buffer.get(68, 3)?.ch).toBe('┐');
    expect(buffer.get(62, 11)).toEqual({ ch: '•', attr: 0x20 });
    expect(buffer.get(56, 16)?.attr).toBe(0x20);
    expect(layout.buttons).toHaveLength(3);
    state.group = 19;
    state.focus = 'item';
    drawColorDialog(buffer, state, (key, fallback) => colorAttribute({}, key, fallback), false);
    expect(buffer.get(12, 17)?.ch).toBe('D');
    expect(buffer.get(33, 4)?.attr).toBe(0x2f);
  });
});
