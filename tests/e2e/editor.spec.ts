import { readFileSync } from 'node:fs';
import { expect, type Locator, type Page, test } from '@playwright/test';
import LZString from 'lz-string';

const atlas = JSON.parse(
  readFileSync(
    new URL('../../public/fonts/Px437_IBM_VGA_9x16.atlas.json', import.meta.url),
    'utf8',
  ),
) as { glyphs: number[][] };

// Deliberately keep runtime boot pending. These tests exercise the editor before
// Python is ready; runtime.spec.ts separately exercises the real interpreter.
test.beforeEach(async ({ context }) => {
  await context.route('**/pyodide.mjs', (route) =>
    route.fulfill({
      contentType: 'text/javascript',
      body: 'export async function loadPyodide() { return new Promise(() => {}); }',
    }),
  );
});

async function open(page: Page): Promise<Locator> {
  await page.goto('/');
  const editor = page.getByRole('textbox', { name: 'Python editor', exact: true });
  await expect(editor).toBeAttached();
  await expect(editor).not.toHaveValue('');
  return editor;
}

async function command(page: Page, name: string): Promise<void> {
  await page
    .getByRole('navigation', { name: 'Main menu' })
    .getByRole('button', { name, exact: true })
    .press('Enter');
}

test('edits, undoes, redoes and overwrites while Python is still loading', async ({ page }) => {
  const editor = await open(page);
  await editor.fill('value = 1');
  await editor.press('End');
  await page.keyboard.type('23');
  await expect(editor).toHaveValue('value = 123');
  await editor.press('Control+z');
  await expect(editor).toHaveValue('value = 12');
  await editor.press('Control+Shift+z');
  await expect(editor).toHaveValue('value = 123');
  await editor.press('Home');
  await editor.press('Insert');
  await page.keyboard.type('X');
  await expect(editor).toHaveValue('Xalue = 123');
  await expect(page.getByTestId('runtime-status')).toContainText('loading');
});

test('keeps backward selections across redraws and replaces the selected text', async ({
  page,
}) => {
  const editor = await open(page);
  await editor.fill('abcdef');
  await editor.press('End');
  await editor.press('Shift+ArrowLeft');
  await editor.press('Shift+ArrowLeft');
  // Cover multiple blink redraws, which previously mirrored the selection back
  // into the buffer with its direction reversed.
  await page.waitForTimeout(600);
  expect(
    await editor.evaluate((input: HTMLTextAreaElement) => ({
      from: input.selectionStart,
      to: input.selectionEnd,
      direction: input.selectionDirection,
    })),
  ).toEqual({ from: 4, to: 6, direction: 'backward' });
  await page.keyboard.type('Q');
  await expect(editor).toHaveValue('abcdQ');
  await editor.press('Control+z');
  await expect(editor).toHaveValue('abcdef');
});

test('commits synthetic IME composition as a single undoable edit', async ({ page }) => {
  const editor = await open(page);
  await editor.fill('start ');
  await editor.press('End');
  await editor.dispatchEvent('compositionstart', { data: '' });
  await editor.evaluate((input: HTMLTextAreaElement) => {
    for (const text of ['に', '日本']) {
      input.value = `start ${text}`;
      input.setSelectionRange(input.value.length, input.value.length);
      input.dispatchEvent(
        new InputEvent('input', {
          bubbles: true,
          data: text,
          inputType: 'insertCompositionText',
          isComposing: true,
        }),
      );
    }
  });
  await page.waitForTimeout(300);
  await expect(editor).toHaveValue('start 日本');
  expect(await page.getByLabel('Source code').textContent()).toBe('start ');
  await editor.dispatchEvent('compositionend', { data: '日本' });
  await expect(editor).toHaveValue('start 日本');
  await editor.press('Control+z');
  await expect(editor).toHaveValue('start ');
  await editor.press('Control+Shift+z');
  await expect(editor).toHaveValue('start 日本');
});

test('saves to real IndexedDB and restores the saved desktop after reload', async ({ page }) => {
  const editor = await open(page);
  const source = 'print("persisted in this browser")\n';
  await editor.fill(source);
  await editor.press('F2');
  await expect(page.getByRole('status')).toContainText('NONAME00.PY saved.');
  await page.reload();
  await expect(page.getByRole('textbox', { name: 'Python editor', exact: true })).toHaveValue(
    source,
  );
  await page.keyboard.press('F3');
  const dialog = page.getByRole('dialog', { name: 'Open a File', exact: true });
  await expect(dialog.getByLabel('Files')).toContainText('NONAME00.PY');
  await dialog.getByRole('button', { name: 'Cancel', exact: true }).press('Enter');
});

test('preserves the modified buffer when browser storage rejects a save', async ({ page }) => {
  await page.addInitScript(() => {
    const original = IDBObjectStore.prototype.put;
    IDBObjectStore.prototype.put = function (
      value: unknown,
      key?: IDBValidKey,
    ): IDBRequest<IDBValidKey> {
      if (typeof key === 'string' && key.startsWith('file:')) {
        throw new DOMException('Test storage quota exhausted', 'QuotaExceededError');
      }
      return original.call(this, value, key);
    };
  });
  const editor = await open(page);
  await editor.fill('print("keep this unsaved buffer")');
  await expect(editor).toHaveValue('print("keep this unsaved buffer")');
  await editor.press('F2');
  const error = page.getByRole('dialog', { name: 'Error', exact: true });
  await expect(error).toContainText('QuotaExceededError');
  await error.getByRole('button', { name: 'OK', exact: true }).press('Enter');
  await expect(editor).toHaveValue('print("keep this unsaved buffer")');
  await editor.press('Alt+F3');
  await expect(page.getByRole('dialog', { name: 'Save File', exact: true })).toContainText(
    'Save changes',
  );
});

test('creates a share link and opens its Unicode source without executing or saving', async ({
  page,
}) => {
  const editor = await open(page);
  const source = 'print("shared 日本 😀")\n';
  await editor.fill(source);
  await command(page, 'Share link…');
  const dialog = page.getByRole('dialog', { name: 'Share link', exact: true });
  const url = await dialog.getByLabel('Link', { exact: true }).inputValue();
  expect(new URL(url).hash).toMatch(/^#pyturbo=/);
  const sharedPage = await page.context().newPage();
  await sharedPage.goto(url);
  await expect(sharedPage.getByRole('textbox', { name: 'Python editor', exact: true })).toHaveValue(
    source,
  );
  await expect(sharedPage.getByRole('log', { name: 'Program output' })).toHaveText('');
  await sharedPage.keyboard.press('F3');
  const openDialog = sharedPage.getByRole('dialog', { name: 'Open a File', exact: true });
  await expect(openDialog.getByLabel('Files')).toContainText('No saved files');
  await sharedPage.close();
});

test('rejects a traversal share before opening its files', async ({ page }) => {
  const data = LZString.compressToEncodedURIComponent(
    JSON.stringify({ version: 1, activeFile: '../escape.py', files: { '../escape.py': 'pass' } }),
  );
  await page.goto(`/#pyturbo=${data}`);
  const dialog = page.getByRole('dialog', { name: 'Share link', exact: true });
  await expect(dialog).toContainText('path segments');
  await dialog.getByRole('button', { name: 'OK', exact: true }).press('Enter');
  await expect(page.getByRole('textbox', { name: 'Python editor', exact: true })).not.toHaveValue(
    'pass',
  );
});

test('runs Find and Replace through keyboard-accessible menu commands', async ({ page }) => {
  const editor = await open(page);
  await editor.fill('alpha beta alpha');
  await command(page, 'Find…');
  const find = page.getByRole('dialog', { name: 'Find', exact: true });
  await find.getByLabel('Text to find').fill('beta');
  await find.getByRole('button', { name: 'OK', exact: true }).press('Enter');
  expect(
    await editor.evaluate((input: HTMLTextAreaElement) =>
      input.value.slice(input.selectionStart, input.selectionEnd),
    ),
  ).toBe('beta');
  await command(page, 'Replace…');
  const replace = page.getByRole('dialog', { name: 'Replace', exact: true });
  await replace.getByLabel('Text to find').fill('alpha');
  await replace.getByLabel('New text').fill('omega');
  await replace.getByLabel('Replace all', { exact: true }).press('Space');
  await expect(replace.getByLabel('Replace all', { exact: true })).toBeChecked();
  await replace.getByRole('button', { name: 'OK', exact: true }).press('Enter');
  await expect(editor).toHaveValue('omega beta omega');
  await editor.press('Control+z');
  await expect(editor).toHaveValue('alpha beta alpha');
});

test('keeps modified content when close is cancelled and discards only on request', async ({
  page,
}) => {
  const editor = await open(page);
  await editor.fill('print("unsaved")');
  await editor.press('Alt+F3');
  const guard = page.getByRole('dialog', { name: 'Save File', exact: true });
  await expect(guard).toContainText('Save changes to NONAME00.PY?');
  await guard.getByRole('button', { name: 'Cancel', exact: true }).press('Enter');
  await expect(editor).toHaveValue('print("unsaved")');
  await editor.press('Alt+F3');
  await page
    .getByRole('dialog', { name: 'Save File', exact: true })
    .getByRole('button', { name: 'Discard', exact: true })
    .press('Enter');
  await expect(editor).toHaveValue('');
});

test('contains Tab focus in a modal and restores its invoking control on Escape', async ({
  page,
}) => {
  await open(page);
  await command(page, 'Find…');
  const dialog = page.getByRole('dialog', { name: 'Find', exact: true });
  const field = dialog.getByLabel('Text to find');
  await expect(field).toBeFocused();
  await page.keyboard.press('Shift+Tab');
  await expect(dialog.getByRole('button', { name: 'Cancel', exact: true })).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(field).toBeFocused();
  for (let step = 0; step < 7; step++) {
    await page.keyboard.press('Tab');
    expect(await dialog.evaluate((form) => form.contains(document.activeElement))).toBe(true);
  }
  await page.keyboard.press('Escape');
  await expect(
    page
      .getByRole('navigation', { name: 'Main menu' })
      .getByRole('button', { name: 'Find…', exact: true }),
  ).toBeFocused();
});

test('distinguishes Ctrl+Page file boundaries from viewport paging', async ({ page }) => {
  const editor = await open(page);
  const source = Array.from({ length: 80 }, (_, index) => `line_${index} = ${index}`).join('\n');
  await editor.fill(source);
  await editor.press('Control+PageUp');
  expect(await editor.evaluate((input: HTMLTextAreaElement) => input.selectionStart)).toBe(0);
  await editor.press('Control+PageDown');
  expect(await editor.evaluate((input: HTMLTextAreaElement) => input.selectionStart)).toBe(
    source.length,
  );
  await editor.press('PageUp');
  expect(
    await editor.evaluate(
      (input: HTMLTextAreaElement) =>
        input.value.slice(0, input.selectionStart).split('\n').length - 1,
    ),
  ).toBe(59);
});

test('preserves manual WordStar scrolling and follows an offscreen Find result', async ({
  page,
}) => {
  const editor = await open(page);
  const source = Array.from({ length: 40 }, (_, index) =>
    index === 35 ? 'find_me = 35' : `${String.fromCharCode(65 + (index % 26))} = ${index}`,
  ).join('\n');
  await editor.fill(source);
  await editor.press('Control+PageUp');
  const canvas = page.locator('canvas').first();
  const firstGlyph = () =>
    canvas.evaluate((element: HTMLCanvasElement) => {
      const rgba = element.getContext('2d')?.getImageData(9, 32, 9, 14).data;
      if (!rgba) throw new Error('Canvas pixels are unavailable.');
      return Array.from({ length: 14 }, (_, row) => {
        let mask = 0;
        for (let column = 0; column < 9; column++) {
          const pixel = (row * 9 + column) * 4;
          if (rgba[pixel] !== 0 || rgba[pixel + 1] !== 0 || rgba[pixel + 2] !== 170)
            mask |= 1 << column;
        }
        return mask;
      });
    });
  await expect.poll(firstGlyph).toEqual(atlas.glyphs[65]?.slice(0, 14));
  const content = await cell(page, 20, 10);
  await page.mouse.move(content.x, content.y);
  await page.mouse.wheel(0, 160);
  await expect.poll(firstGlyph).toEqual(atlas.glyphs[68]?.slice(0, 14));
  await editor.press('Control+w');
  await page.waitForTimeout(300);
  await expect.poll(firstGlyph).toEqual(atlas.glyphs[67]?.slice(0, 14));
  await command(page, 'Find…');
  const find = page.getByRole('dialog', { name: 'Find', exact: true });
  await find.getByLabel('Text to find').fill('find_me');
  await find.getByRole('button', { name: 'OK', exact: true }).press('Enter');
  await expect.poll(firstGlyph).toEqual(atlas.glyphs[81]?.slice(0, 14));
});

async function cell(page: Page, column: number, row: number): Promise<{ x: number; y: number }> {
  const bounds = await page.locator('canvas').first().boundingBox();
  if (!bounds) throw new Error('VGA canvas is not visible.');
  return {
    x: bounds.x + ((column + 0.5) * bounds.width) / 80,
    y: bounds.y + ((row + 0.5) * bounds.height) / 25,
  };
}

test('scrolls Help with keys, wheel and the scrollbar thumb', async ({ page }) => {
  const editor = await open(page);
  await editor.press('F1');
  const help = page.getByLabel('Help content', { exact: true });
  await expect(help).toContainText('PyTurbo Help');
  await page.keyboard.press('End');
  await expect(help).toContainText('Independent project.');
  await page.keyboard.press('Home');
  await expect(help).toContainText('PyTurbo Help');
  const content = await cell(page, 20, 10);
  await page.mouse.move(content.x, content.y);
  await page.mouse.wheel(0, 160);
  await expect(help).not.toContainText('PyTurbo Help');
  await page.keyboard.press('Home');
  const thumb = await cell(page, 71, 5);
  const end = await cell(page, 71, 19);
  await page.mouse.move(thumb.x, thumb.y);
  await page.mouse.down();
  await page.mouse.move(end.x, end.y, { steps: 5 });
  await page.mouse.up();
  await expect(help).toContainText('Independent project.');
});

test('edits and deletes the selected Watch row using keys and mouse', async ({ page }) => {
  const editor = await open(page);
  for (const expression of ['first_value', 'second_value']) {
    await command(page, 'Add watch… (Ctrl+F7)');
    const dialog = page.getByRole('dialog', { name: 'Add Watch', exact: true });
    await dialog.getByLabel('Expression').fill(expression);
    await dialog.getByRole('button', { name: 'OK', exact: true }).press('Enter');
  }
  await editor.press('Home');
  await editor.press('ArrowDown');
  await editor.press('Enter');
  let edit = page.getByRole('dialog', { name: 'Edit Watch', exact: true });
  await expect(edit.getByLabel('Expression')).toHaveValue('second_value');
  await edit.getByLabel('Expression').fill('changed_value');
  await edit.getByRole('button', { name: 'OK', exact: true }).press('Enter');
  await expect(page.getByLabel('Watch content', { exact: true })).toContainText('changed_value');
  const first = await cell(page, 4, 16);
  await page.mouse.click(first.x, first.y);
  await editor.press('Enter');
  edit = page.getByRole('dialog', { name: 'Edit Watch', exact: true });
  await expect(edit.getByLabel('Expression')).toHaveValue('first_value');
  await edit.getByRole('button', { name: 'Cancel', exact: true }).press('Enter');
  await editor.press('Delete');
  await expect(page.getByLabel('Watch content', { exact: true })).not.toContainText('first_value');
  await expect(page.getByLabel('Watch content', { exact: true })).toContainText('changed_value');
});

test('opens the selected Project row with keys and mouse', async ({ page }) => {
  const editor = await open(page);
  await page.getByLabel('Upload project files').setInputFiles([
    { name: 'one.py', mimeType: 'text/x-python', buffer: Buffer.from('one = 1') },
    { name: 'two.py', mimeType: 'text/x-python', buffer: Buffer.from('two = 2') },
  ]);
  await expect(editor).toHaveValue('two = 2');
  await command(page, 'Project');
  await editor.press('End');
  await editor.press('Enter');
  await expect(editor).toHaveValue('two = 2');
  await command(page, 'Project');
  const row = await cell(page, 4, 17);
  await page.mouse.click(row.x, row.y);
  await editor.press('Enter');
  await expect(editor).toHaveValue('one = 1');
});
