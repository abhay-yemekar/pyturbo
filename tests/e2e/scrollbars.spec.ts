import { readFileSync } from 'node:fs';
import { expect, type Page, test } from '@playwright/test';
import { CP437_GLYPHS } from '../../src/engine/renderer/glyph-atlas';

const reference = JSON.parse(
  readFileSync(new URL('../unit/fixtures/editor-scrollbars.json', import.meta.url), 'utf8'),
) as typeof import('../unit/fixtures/editor-scrollbars.json');

const atlas = JSON.parse(
  readFileSync(
    new URL('../../public/fonts/Px437_IBM_VGA_9x16.atlas.json', import.meta.url),
    'utf8',
  ),
) as { glyphs: number[][] };
const editor = (page: Page) => page.getByRole('textbox', { name: 'Python editor', exact: true });
test.use({ serviceWorkers: 'block' });
test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 800, height: 500 });
  await page.route('**/pyodide.mjs', (route) =>
    route.fulfill({
      contentType: 'text/javascript',
      body: 'export async function loadPyodide(){ return new Promise(() => {}); }',
    }),
  );
  await page.goto('/');
  await expect(editor(page)).not.toHaveValue('');
  await page.keyboard.press('F5');
});

async function point(page: Page, column: number, row: number) {
  const bounds = await page.locator('canvas').first().boundingBox();
  if (!bounds) throw new Error('VGA canvas is unavailable');
  return {
    x: bounds.x + ((column + 0.5) * bounds.width) / 80,
    y: bounds.y + ((row + 0.5) * bounds.height) / 25,
  };
}
async function click(page: Page, column: number, row: number) {
  const position = await point(page, column, row);
  await page.mouse.click(position.x, position.y);
}
async function bars(page: Page, thumbColumn: number, thumbRow: number) {
  const cells = [];
  for (let column = 18; column <= 77; column++) {
    const glyph =
      column === 18 ? 'left' : column === 77 ? 'right' : column === thumbColumn ? 'thumb' : 'track';
    cells.push({
      x: column,
      y: 23,
      glyph,
      attr: reference.attributes[glyph === 'left' || glyph === 'right' ? 'arrows' : glyph],
    });
  }
  for (let row = 2; row <= 22; row++) {
    const glyph = row === 2 ? 'up' : row === 22 ? 'down' : row === thumbRow ? 'thumb' : 'track';
    cells.push({
      x: 79,
      y: row,
      glyph,
      attr: reference.attributes[glyph === 'up' || glyph === 'down' ? 'arrows' : glyph],
    });
  }
  const expected = cells.map((cell) => ({
    ...cell,
    mask: atlas.glyphs[
      CP437_GLYPHS.indexOf(reference.glyphs[cell.glyph as keyof typeof reference.glyphs])
    ],
  }));
  await expect
    .poll(() =>
      page
        .locator('canvas')
        .first()
        .evaluate((element: HTMLCanvasElement, expected) => {
          const context = element.getContext('2d');
          if (!context) throw new Error('Canvas 2D is unavailable');
          for (const cell of expected) {
            const pixels = context.getImageData(cell.x * 9, cell.y * 16, 9, 16).data;
            for (let row = 0; row < 16; row++)
              for (let column = 0; column < 9; column++) {
                const foreground = !!(cell.mask[row] & (1 << column));
                const color =
                  foreground === (cell.attr === 0x13) ? [0, 170, 170, 255] : [0, 0, 170, 255];
                const offset = (row * 9 + column) * 4;
                if (color.some((value, index) => value !== pixels[offset + index]))
                  return { cell: { x: cell.x, y: cell.y }, row, column };
              }
          }
          return null;
        }, expected),
    )
    .toBeNull();
}

test('matches empty and short editor controls without changing source or caret while scrolling', async ({
  page,
}, testInfo) => {
  await editor(page).press('Control+a');
  await page.keyboard.press('Delete');
  await expect(editor(page)).toHaveValue('');
  await expect(page.getByLabel('Source code', { exact: true })).toHaveText('');
  await bars(page, 19, 3);
  await click(page, 79, 22);
  await bars(page, 19, 3);
  for (let step = 0; step < 10; step++) await click(page, 77, 23);
  await bars(page, 20, 3);
  await click(page, 50, 23);
  await bars(page, 32, 3);
  const start = await point(page, 32, 23),
    end = await point(page, 76, 23);
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(end.x, end.y, { steps: 12 });
  await page.mouse.up();
  await bars(page, 76, 3);
  await expect(editor(page)).toHaveValue('');
  await expect(editor(page)).toHaveAttribute('aria-description', 'Line 1, column 1');
  expect(await editor(page).evaluate((input: HTMLTextAreaElement) => input.selectionStart)).toBe(0);
  await page.keyboard.type('print("Hello")');
  await expect(editor(page)).toHaveValue('print("Hello")');
  await bars(page, 19, 3);
  await page
    .locator('canvas')
    .first()
    .screenshot({ path: testInfo.outputPath('editor-scrollbars.png') });
  await editor(page).fill('short');
  await page.keyboard.press('Home');
  await click(page, 50, 23);
  await bars(page, 30, 3);
  await click(page, 1, 2);
  await expect(editor(page)).toHaveAttribute('aria-description', 'Line 1, column 6');
  await page.keyboard.type('!');
  await expect(editor(page)).toHaveValue('short!');
});

test('matches editor vertical page and thumb movement while retaining the native caret', async ({
  page,
}) => {
  const source = Array.from({ length: 37 }, (_, index) => `line${index + 1}`).join('\n');
  await editor(page).fill(source);
  await page.keyboard.press('Control+PageUp');
  await bars(page, 19, 3);
  await click(page, 79, 15);
  await bars(page, 19, 13);
  const start = await point(page, 79, 13),
    end = await point(page, 79, 21);
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(end.x, end.y, { steps: 8 });
  await page.mouse.up();
  await bars(page, 19, 21);
  await click(page, 79, 10);
  await bars(page, 19, 11);
  await expect(editor(page)).toHaveValue(source);
  await expect(editor(page)).toHaveAttribute('aria-description', 'Line 1, column 1');
  expect(await editor(page).evaluate((input: HTMLTextAreaElement) => input.selectionStart)).toBe(0);
  await page.keyboard.type('#');
  await expect(editor(page)).toHaveValue(`#${source}`);
  await bars(page, 19, 3);
});

test('keeps the insertion caret visible after the last character of a long Python line', async ({
  page,
}) => {
  const source = 'x'.repeat(1000);
  await editor(page).fill(source);
  await page.keyboard.press('End');
  await expect(editor(page)).toHaveAttribute('aria-description', 'Line 1, column 1001');
  await bars(page, 76, 3);
  const cursor = () =>
    page
      .locator('canvas')
      .first()
      .evaluate((element: HTMLCanvasElement) => {
        const context = element.getContext('2d');
        if (!context) throw new Error('Canvas 2D is unavailable');
        return Array.from(context.getImageData(78 * 9, 2 * 16 + 15, 1, 1).data);
      });
  await expect.poll(cursor).toEqual([255, 255, 85, 255]);
  await page.keyboard.type('Z');
  await expect(editor(page)).toHaveValue(`${source}Z`);
  await expect.poll(cursor).toEqual([255, 255, 85, 255]);
  await page.keyboard.press('Control+z');
  await expect(editor(page)).toHaveValue(source);
  await expect.poll(cursor).toEqual([255, 255, 85, 255]);
});
