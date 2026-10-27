import AxeBuilder from '@axe-core/playwright';
import { expect, type Page, test } from '@playwright/test';

async function shellReady(page: Page): Promise<void> {
  // These tests deliberately exercise the shell before Python finishes loading.
  // Real runtime execution is covered separately by runtime.spec.ts.
  await page.route('**/pyodide.mjs', (route) =>
    route.fulfill({
      contentType: 'text/javascript',
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Cross-Origin-Resource-Policy': 'cross-origin',
      },
      body: 'export async function loadPyodide() { return new Promise(() => {}); }',
    }),
  );
  await page.goto('/');
  await expect(page.getByTestId('editor')).toHaveValue(/Code Python like/);
  await expect(page.getByTestId('runtime-status')).toContainText('loading');
}

test('uses the native VGA grid and integer scaling with a 16-colour canvas', async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 800, height: 500 });
  await shellReady(page);
  const canvas = page.getByRole('img', { name: /VGA desktop/ });
  await expect(canvas).toHaveAttribute('width', '720');
  await expect(canvas).toHaveAttribute('height', '400');
  await expect.poll(async () => (await canvas.boundingBox())?.width).toBe(720);
  const colours = await canvas.evaluate((element) => {
    const drawing = element as HTMLCanvasElement;
    const context = drawing.getContext('2d');
    if (!context) throw new Error('Canvas 2D is unavailable');
    const pixels = context.getImageData(0, 0, drawing.width, drawing.height).data;
    const set = new Set<string>();
    for (let i = 0; i < pixels.length; i += 4)
      set.add(`${pixels[i]},${pixels[i + 1]},${pixels[i + 2]}`);
    return [...set];
  });
  expect(colours).toContain('0,0,170');
  expect(colours.length).toBeLessThanOrEqual(16);
  const screenshotPath = testInfo.outputPath('native-720x400-shell.png');
  await canvas.screenshot({ path: screenshotPath });
  await testInfo.attach('native-720x400-shell-unapproved-reference', {
    path: screenshotPath,
    contentType: 'image/png',
  });
  for (const [width, height, scale] of [
    [1600, 900, 2],
    [2400, 1300, 3],
  ]) {
    await page.setViewportSize({ width, height });
    await expect.poll(async () => (await canvas.boundingBox())?.width).toBe(720 * scale);
    await expect.poll(async () => (await canvas.boundingBox())?.height).toBe(400 * scale);
  }
});

test('opens the real File menu and creates an editor while Python is loading', async ({ page }) => {
  await shellReady(page);
  await page.keyboard.press('F10');
  await page.keyboard.press('n');
  await expect(page.getByTestId('editor')).toHaveValue('');
  const main = page.getByRole('navigation', { name: 'Main menu', exact: true });
  await expect(main.getByRole('group')).toHaveCount(11);
  await expect(main.getByRole('button', { name: 'Link', exact: true })).toBeDisabled();
});

test('opens and dismisses About with Turbo menu hotkeys', async ({ page }) => {
  await shellReady(page);
  const source = await page.getByTestId('editor').inputValue();
  await page.keyboard.press('Alt+h');
  await page.keyboard.press('a');
  const dialog = page.getByRole('dialog', { name: 'About' });
  await expect(dialog).toBeAttached();
  await expect(dialog).toContainText('VileR');
  await page.keyboard.press('Enter');
  await expect(dialog).not.toBeAttached();
  await expect(page.getByTestId('editor')).toHaveValue(source);
});

test('keeps keyboard focus inside an open modal dialog', async ({ page }) => {
  await shellReady(page);
  await page.keyboard.press('F3');
  const dialog = page.getByRole('dialog', { name: 'Open a File' });
  const first = dialog.getByRole('textbox', { name: 'Name', exact: true });
  await expect(first).toBeFocused();
  await page.keyboard.press('Shift+Tab');
  await expect(dialog.getByRole('button', { name: 'Cancel', exact: true })).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(first).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('editor')).toBeFocused();
});

test('allows Enter to activate the accessible main-menu buttons without editing source', async ({
  page,
}) => {
  await shellReady(page);
  const source = await page.getByTestId('editor').inputValue();
  const about = page
    .getByRole('navigation', { name: 'Main menu', exact: true })
    .getByRole('button', { name: 'About…', exact: true });
  await about.focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('dialog', { name: 'About' })).toBeAttached();
  await expect(page.getByTestId('editor')).toHaveValue(source);
});

test('preserves wheel scrolling across cursor blinks', async ({ page }) => {
  await page.setViewportSize({ width: 1000, height: 700 });
  await shellReady(page);
  const editor = page.getByTestId('editor');
  const lines = Array.from({ length: 100 }, (_, i) => `line_${String(i).padStart(3, '0')}`);
  await editor.fill(lines.join('\n'));
  await editor.press('Control+q');
  await editor.press('r');
  await expect
    .poll(() => editor.evaluate((element) => (element as HTMLTextAreaElement).selectionStart))
    .toBe(0);
  const canvas = page.getByRole('img', { name: /VGA desktop/ });
  const rect = await canvas.boundingBox();
  if (!rect) throw new Error('Canvas is missing');
  await page.mouse.move(rect.x + 90, rect.y + 100);
  await page.mouse.wheel(0, 100);
  // A full on/off blink cycle used to reset scroll to the caret.
  await page.waitForTimeout(600);
  await page.mouse.click(rect.x + 9 + 2, rect.y + 32 + 2);
  await expect
    .poll(() => editor.evaluate((element) => (element as HTMLTextAreaElement).selectionStart))
    .toBe(lines.slice(0, 3).join('\n').length + 1);
});

test('exposes phone shortcut alternatives and an accessible shell', async ({ page }) => {
  await page.setViewportSize({ width: 844, height: 390 });
  await shellReady(page);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
  expect(results.violations).toEqual([]);
  await page.setViewportSize({ width: 740, height: 390 });
  const commands = page.getByRole('navigation', { name: 'IDE commands', exact: true });
  for (const label of ['Run', 'Stop', 'Save', 'Menu', 'User screen', 'Trace', 'Step', 'DOS mode']) {
    await expect(commands.getByRole('button', { name: label, exact: true })).toBeVisible();
  }
  await commands.getByRole('button', { name: 'Menu', exact: true }).click();
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('editor')).toBeFocused();
});

test('places an ASCII character after a non-BMP character in the next VGA cell', async ({
  page,
}) => {
  await shellReady(page);
  await page.getByTestId('editor').fill('s = "🐍X"');
  const canvas = page.getByRole('img', { name: /VGA desktop/ });
  const cell = (column: number) =>
    canvas.evaluate((element, x) => {
      const context = (element as HTMLCanvasElement).getContext('2d');
      if (!context) throw new Error('Canvas 2D is unavailable');
      const pixels = context.getImageData(x * 9, 2 * 16, 9, 16).data;
      return Array.from({ length: 144 }, (_, index) =>
        pixels[index * 4] === 170 && pixels[index * 4 + 1] === 0 && pixels[index * 4 + 2] === 0
          ? 1
          : 0,
      );
    }, column);
  const xMask = await cell(7);
  const atlasResponse = await page.request.get('/fonts/Px437_IBM_VGA_9x16.atlas.json');
  const atlas = (await atlasResponse.json()) as { glyphs: number[][] };
  expect(xMask).toEqual(
    atlas.glyphs[0x58].flatMap((row) => Array.from({ length: 9 }, (_, x) => (row >> x) & 1)),
  );
  // The final quote is a different bitmap; UTF-16 splitting formerly put X here.
  expect(await cell(8)).not.toEqual(xMask);
  await page.getByTestId('editor').press('End');
  const rect = await canvas.boundingBox();
  if (!rect) throw new Error('Canvas is missing');
  const scale = rect.width / 720;
  await page.mouse.click(rect.x + (7 * 9 + 2) * scale, rect.y + (2 * 16 + 2) * scale);
  await expect
    .poll(() =>
      page
        .getByTestId('editor')
        .evaluate((element) => (element as HTMLTextAreaElement).selectionStart),
    )
    .toBe(7);
});

test('applies independent symbol and menu colours from the Colors dialog', async ({ page }) => {
  await shellReady(page);
  await page.getByTestId('editor').fill('a + b');
  await page.keyboard.press('Alt+o');
  await page.keyboard.press('e');
  await page.keyboard.press('c');
  const colors = page.getByRole('dialog', { name: 'Colors', exact: true });
  await expect(colors).toBeAttached();
  await colors.getByLabel('Group', { exact: true }).selectOption({ label: 'Edit Window' });
  await colors.getByLabel('Item', { exact: true }).selectOption({ label: 'Symbol' });
  await colors.getByLabel('Foreground', { exact: true }).selectOption({ label: 'White' });
  await colors.getByLabel('Group', { exact: true }).selectOption({ label: 'Main Menu' });
  await colors.getByLabel('Item', { exact: true }).selectOption({ label: 'Normal Text' });
  await colors.getByLabel('Foreground', { exact: true }).selectOption({ label: 'Blue' });
  await colors.getByRole('button', { name: 'OK', exact: true }).press('Enter');
  await expect(page.getByRole('dialog')).not.toBeAttached();
  const canvas = page.getByRole('img', { name: /VGA desktop/ });
  const hasColour = (x: number, y: number, expected: number[]) =>
    canvas.evaluate(
      (element, args) => {
        const context = (element as HTMLCanvasElement).getContext('2d');
        if (!context) throw new Error('Canvas 2D is unavailable');
        const [column, row, red, green, blue] = args;
        const pixels = context.getImageData(column * 9, row * 16, 9, 16).data;
        return Array.from({ length: 144 }, (_, pixel) => pixel).some(
          (pixel) =>
            pixels[pixel * 4] === red &&
            pixels[pixel * 4 + 1] === green &&
            pixels[pixel * 4 + 2] === blue,
        );
      },
      [x, y, ...expected],
    );
  await expect.poll(() => hasColour(3, 2, [255, 255, 255])).toBe(true);
  await expect.poll(() => hasColour(5, 0, [0, 0, 170])).toBe(true);
});

test('suppresses dialog shadows in monochrome mode', async ({ page }) => {
  await shellReady(page);
  await page
    .getByTestId('editor')
    .fill(Array.from({ length: 21 }, () => '#'.repeat(78)).join('\n'));
  await page.keyboard.press('Control+q');
  await page.keyboard.press('r');
  await page.keyboard.press('Alt+o');
  await page.keyboard.press('e');
  await page.keyboard.press('p');
  const preferences = page.getByRole('dialog', { name: 'Preferences' });
  await preferences
    .getByRole('combobox', { name: 'Video mode', exact: true })
    .selectOption('monochrome');
  await preferences.getByRole('button', { name: 'OK', exact: true }).press('Enter');
  await expect(preferences).not.toBeAttached();
  await page.keyboard.press('Alt+h');
  await page.keyboard.press('a');
  await expect(page.getByRole('dialog', { name: 'About', exact: true })).toBeAttached();
  const canvas = page.getByRole('img', { name: /VGA desktop/ });
  await expect
    .poll(() =>
      canvas.evaluate((element) => {
        const context = (element as HTMLCanvasElement).getContext('2d');
        if (!context) throw new Error('Canvas 2D is unavailable');
        const formerShadow = context.getImageData(69 * 9, 5 * 16, 9, 16).data;
        const adjacent = context.getImageData(71 * 9, 5 * 16, 9, 16).data;
        return formerShadow.every((byte, index) => byte === adjacent[index]);
      }),
    )
    .toBe(true);
});

test('discards cancelled Colors previews and persists accepted choices after reload', async ({
  page,
}) => {
  await shellReady(page);
  const openColors = async () => {
    await page.keyboard.press('Alt+o');
    await page.keyboard.press('e');
    await page.keyboard.press('c');
    const dialog = page.getByRole('dialog', { name: 'Colors', exact: true });
    await expect(dialog).toBeAttached();
    await dialog.getByLabel('Group', { exact: true }).selectOption({ label: 'Edit Window' });
    await dialog.getByLabel('Item', { exact: true }).selectOption({ label: 'Identifier' });
    return dialog;
  };
  let dialog = await openColors();
  await expect(dialog.getByLabel('Foreground', { exact: true })).toHaveValue('10');
  await dialog.getByLabel('Foreground', { exact: true }).selectOption({ label: 'Light red' });
  await dialog.getByRole('button', { name: 'Cancel', exact: true }).press('Enter');
  dialog = await openColors();
  await expect(dialog.getByLabel('Foreground', { exact: true })).toHaveValue('10');
  await dialog.getByLabel('Foreground', { exact: true }).selectOption({ label: 'White' });
  await page.keyboard.press('Escape');
  dialog = await openColors();
  await expect(dialog.getByLabel('Foreground', { exact: true })).toHaveValue('10');
  await dialog.getByLabel('Foreground', { exact: true }).selectOption({ label: 'Light red' });
  await dialog.getByRole('button', { name: 'OK', exact: true }).press('Enter');
  await page.reload();
  await expect(page.getByTestId('editor')).toHaveValue(/Code Python like/);
  dialog = await openColors();
  await expect(dialog.getByLabel('Foreground', { exact: true })).toHaveValue('12');
  await page.keyboard.press('Escape');
});

test('navigates Colors groups, long item lists and grids by keyboard and pointer', async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 800, height: 500 });
  await shellReady(page);
  await page.keyboard.press('Alt+o');
  await page.keyboard.press('e');
  await page.keyboard.press('c');
  const dialog = page.getByRole('dialog', { name: 'Colors', exact: true });
  const group = dialog.getByLabel('Group', { exact: true });
  const item = dialog.getByLabel('Item', { exact: true });
  await expect(group.locator('option')).toHaveCount(20);
  await expect(group).toBeFocused();
  await page.keyboard.press('End');
  await expect(group).toHaveValue('19');
  await expect(item.locator('option')).toHaveText(['Desktop Color']);
  await page.keyboard.press('Home');
  for (let index = 0; index < 3; index++) await page.keyboard.press('ArrowDown');
  await expect(item.locator('option')).toHaveCount(24);
  await page.keyboard.press('Tab');
  await expect(item).toBeFocused();
  await page.keyboard.press('End');
  await expect(item).toHaveValue('23');
  await page.keyboard.press('ArrowUp');
  await expect(item).toHaveValue('22');
  await page.keyboard.press('Alt+f');
  await page.keyboard.press('ArrowDown');
  await expect(dialog.getByLabel('Foreground', { exact: true })).toHaveValue('5');
  await page.keyboard.press('Alt+b');
  await page.keyboard.press('ArrowUp');
  await expect(dialog.getByLabel('Background', { exact: true })).toHaveValue('0');
  const canvas = page.getByRole('img', { name: /VGA desktop/ });
  const rect = await canvas.boundingBox();
  if (!rect) throw new Error('Canvas is missing');
  const clickCell = (x: number, y: number) =>
    page.mouse.click(rect.x + x * 9 + 2, rect.y + y * 16 + 2);
  await clickCell(56, 6); // Foreground row 3, first swatch: dark grey.
  await expect(dialog.getByLabel('Foreground', { exact: true })).toHaveValue('8');
  await clickCell(62, 12); // Background row 2, third swatch: brown.
  await expect(dialog.getByLabel('Background', { exact: true })).toHaveValue('6');
  await page.keyboard.press('F1');
  await expect(dialog).toBeAttached();
  const path = testInfo.outputPath('colors-720x400.png');
  await canvas.screenshot({ path });
  await testInfo.attach('PyTurbo Colors control geometry; font fidelity separate', {
    path,
    contentType: 'image/png',
  });
  await page.keyboard.press('Alt+c');
  await expect(dialog).not.toBeAttached();
  await expect(page.getByTestId('editor')).toBeFocused();
});
