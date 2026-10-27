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

test('keeps tab and unindent toggles synchronized across editors and reloads', async ({ page }) => {
  const editor = await open(page);
  await editor.fill('   a\n       b\n       ');
  await editor.press('End');
  await editor.press('Backspace');
  await expect(editor).toHaveValue('   a\n       b\n   ');
  await editor.press('Control+z');
  await expect(editor).toHaveValue('   a\n       b\n       ');
  await editor.press('Control+o');
  await editor.press('u');
  await editor.press('Backspace');
  await expect(editor).toHaveValue('   a\n       b\n      ');
  await editor.press('Control+o');
  await editor.press('t');
  await editor.press('Control+o');
  await editor.press('i');
  await editor.press('F2');
  await expect(page.getByRole('status')).toContainText('NONAME00.PY saved.');

  await command(page, 'New');
  await editor.press('Tab');
  await editor.press('Enter');
  await expect(editor).toHaveValue('\t\n');
  await editor.press('F2');
  await expect(page.getByRole('status')).toContainText('NONAME01.PY saved.');
  await page.reload();
  await expect(editor).toHaveValue('\t\n');
  await command(page, 'Editor…');
  const options = page.getByRole('dialog', { name: 'Editor', exact: true });
  await expect(options.getByLabel('Use tab character', { exact: true })).toBeChecked();
  await expect(options.getByLabel('Backspace unindents', { exact: true })).not.toBeChecked();
  await expect(options.getByLabel('Auto indent', { exact: true })).not.toBeChecked();
  await expect(options.getByLabel('Tab size (1–16)', { exact: true })).toHaveValue('4');
  await options.getByRole('button', { name: 'Cancel', exact: true }).press('Enter');
  await editor.press('F6');
  await expect(editor).toHaveValue('   a\n       b\n      ');
  await editor.press('Control+a');
  await editor.press('Delete');
  await expect(editor).toHaveValue('');
  await editor.press('Tab');
  await expect(editor).toHaveValue('\t');
});

test('uses visual tab stops after imported tabs and keeps space-only insertion by default', async ({
  page,
}) => {
  const editor = await open(page);
  await editor.fill('\t😀');
  await editor.press('End');
  await editor.press('Tab');
  await expect(editor).toHaveValue('\t😀   ');
  await command(page, 'Editor…');
  const options = page.getByRole('dialog', { name: 'Editor', exact: true });
  await expect(options.getByLabel('Use tab character', { exact: true })).not.toBeChecked();
  await expect(options.getByLabel('Backspace unindents', { exact: true })).toBeChecked();
  await options.getByLabel('Use tab character', { exact: true }).press('Space');
  await options.getByRole('button', { name: 'OK', exact: true }).press('Enter');
  await editor.press('Tab');
  await expect(editor).toHaveValue('\t😀   \t');
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

test('keeps edits made during an in-flight save modified and protected by the close warning', async ({
  page,
}) => {
  await page.addInitScript(() => {
    const state = window as unknown as { releaseFileSave?: () => void };
    const original = IDBObjectStore.prototype.put;
    const complete = Object.getOwnPropertyDescriptor(IDBTransaction.prototype, 'oncomplete');
    IDBObjectStore.prototype.put = function (
      value: unknown,
      key?: IDBValidKey,
    ): IDBRequest<IDBValidKey> {
      if (typeof key === 'string' && key.startsWith('file:')) {
        const transaction = this.transaction;
        Object.defineProperty(transaction, 'oncomplete', {
          configurable: true,
          set(handler: ((this: IDBTransaction, event: Event) => void) | null) {
            complete?.set?.call(
              transaction,
              handler &&
                ((event: Event) => {
                  state.releaseFileSave = () => handler.call(transaction, event);
                }),
            );
          },
        });
      }
      return original.call(this, value, key);
    };
  });
  const editor = await open(page);
  const persisted = 'print("captured by the save")';
  const latest = 'print("new edits while saving")';
  await editor.fill(persisted);
  await editor.press('F2');
  await page.waitForFunction(() => 'releaseFileSave' in window);
  await editor.fill(latest);
  await page.evaluate(() =>
    (window as unknown as { releaseFileSave: () => void }).releaseFileSave(),
  );
  await expect(page.getByRole('status')).toContainText(
    'NONAME00.PY saved; newer edits are unsaved.',
  );
  const stored = await page.evaluate(
    () =>
      new Promise<unknown>((resolve, reject) => {
        const request = indexedDB.open('pyturbo');
        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
          const database = request.result;
          const record = database
            .transaction('workspace')
            .objectStore('workspace')
            .get('file:NONAME00.PY');
          record.onerror = () => reject(record.error);
          record.onsuccess = () => {
            resolve(record.result);
            database.close();
          };
        };
      }),
  );
  expect(stored).toMatchObject({ content: persisted });
  await expect(editor).toHaveValue(latest);
  await editor.press('Alt+F3');
  const guard = page.getByRole('dialog', { name: 'Save File', exact: true });
  await expect(guard).toContainText('Save changes to NONAME00.PY?');
  await guard.getByRole('button', { name: 'Cancel', exact: true }).press('Enter');
  await expect(editor).toHaveValue(latest);
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
  ).toBe(60);
});

async function cursorPosition(editor: Locator): Promise<{ line: number; col: number }> {
  return editor.evaluate((input: HTMLTextAreaElement) => {
    const offset =
      input.selectionDirection === 'backward' ? input.selectionStart : input.selectionEnd;
    const before = input.value.slice(0, offset);
    return { line: before.split('\n').length - 1, col: offset - before.lastIndexOf('\n') - 1 };
  });
}

test('keeps page overlap and viewport shortcuts aligned after resizing, including legacy aliases', async ({
  page,
}) => {
  const editor = await open(page);
  await editor.fill(Array(100).fill('abcdef').join('\n'));
  await editor.press('Control+PageUp');
  await editor.press('ArrowRight');
  await editor.press('ArrowRight');
  await editor.press('PageDown');
  expect(await cursorPosition(editor)).toEqual({ line: 19, col: 2 });
  await editor.press('Control+Home');
  expect(await cursorPosition(editor)).toEqual({ line: 19, col: 2 });
  await editor.press('Control+End');
  expect(await cursorPosition(editor)).toEqual({ line: 38, col: 2 });

  await editor.press('Control+PageUp');
  await editor.press('Control+F5');
  for (let index = 0; index < 7; index++) await editor.press('Shift+ArrowUp');
  await editor.press('Enter');
  await editor.press('ArrowRight');
  await editor.press('ArrowRight');
  await editor.press('PageDown');
  expect(await cursorPosition(editor)).toEqual({ line: 12, col: 2 });
  await editor.press('Control+End');
  expect(await cursorPosition(editor)).toEqual({ line: 24, col: 2 });
  await editor.press('Control+q');
  await editor.press('e');
  expect(await cursorPosition(editor)).toEqual({ line: 12, col: 2 });
  await editor.press('Control+q');
  await editor.press('x');
  expect(await cursorPosition(editor)).toEqual({ line: 24, col: 2 });

  await command(page, 'Editor…');
  const options = page.getByRole('dialog', { name: 'Editor', exact: true });
  await options.getByLabel('CUA keys (Ctrl+C/X/V/Z)', { exact: true }).press('Space');
  await expect(options.getByLabel('CUA keys (Ctrl+C/X/V/Z)', { exact: true })).not.toBeChecked();
  await options.getByRole('button', { name: 'OK', exact: true }).press('Enter');
  await editor.press('Control+PageUp');
  await editor.press('Control+c');
  expect(await cursorPosition(editor)).toEqual({ line: 12, col: 0 });
  await editor.press('Control+r');
  expect(await cursorPosition(editor)).toEqual({ line: 0, col: 0 });

  // A page may show blank rows below EOF; it must not pack the last page and
  // move the caret away from the screen row it held before paging.
  await editor.fill(Array(15).fill('abcdef').join('\n'));
  await editor.press('Control+PageUp');
  await editor.press('PageDown');
  await editor.press('Control+Home');
  expect(await cursorPosition(editor)).toEqual({ line: 12, col: 0 });
});

for (const layout of [
  { name: '43 lines', rows: '43', mode: 'exact', visibleRows: 39 },
  { name: '50 lines', rows: '50', mode: 'exact', visibleRows: 46 },
  { name: 'Fill', rows: '25', mode: 'fill', visibleRows: 46 },
]) {
  test(`uses the zoomed viewport for paging and selections in ${layout.name}`, async ({ page }) => {
    await page.setViewportSize({ width: 1080, height: 800 });
    const editor = await open(page);
    await editor.fill(Array(140).fill('abcdef').join('\n'));
    await command(page, 'Preferences…');
    const preferences = page.getByRole('dialog', { name: 'Preferences', exact: true });
    await preferences
      .getByRole('combobox', { name: 'Lines', exact: true })
      .selectOption(layout.rows);
    await preferences
      .getByRole('combobox', { name: 'Screen fit', exact: true })
      .selectOption(layout.mode);
    await preferences.getByRole('button', { name: 'OK', exact: true }).press('Enter');
    await editor.press('F5');
    await editor.press('Control+PageUp');
    await editor.press('Shift+PageDown');
    expect(await cursorPosition(editor)).toEqual({ line: layout.visibleRows - 1, col: 0 });
    expect(await editor.evaluate((input: HTMLTextAreaElement) => input.selectionStart)).toBe(0);
    await editor.press('Control+Home');
    expect(await cursorPosition(editor)).toEqual({ line: layout.visibleRows - 1, col: 0 });
    await editor.press('Control+End');
    expect(await cursorPosition(editor)).toEqual({ line: (layout.visibleRows - 1) * 2, col: 0 });
    await editor.press('Control+PageDown');
    expect(await cursorPosition(editor)).toEqual({ line: 139, col: 6 });
  });
}

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
