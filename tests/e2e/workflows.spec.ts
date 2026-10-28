import { expect, type Page, test } from '@playwright/test';

const editor = (page: Page) => page.getByRole('textbox', { name: 'Python editor', exact: true });
const output = (page: Page) => page.getByRole('log', { name: 'Program output' });

async function command(page: Page, name: string): Promise<void> {
  await page
    .getByRole('navigation', { name: 'Main menu' })
    .getByRole('button', { name, exact: true })
    .press('Enter');
}

async function mockEditor(page: Page): Promise<void> {
  await page.route('**/pyodide.mjs', (route) =>
    route.fulfill({
      contentType: 'text/javascript',
      body: 'export async function loadPyodide() { return new Promise(() => {}); }',
    }),
  );
  await page.goto('/');
  await expect(editor(page)).not.toHaveValue('');
}

async function ready(page: Page): Promise<void> {
  await page.goto('/');
  await expect(page.getByTestId('runtime-status')).toContainText(/Python .* ready/, {
    timeout: 120_000,
  });
}

async function topColor(page: Page): Promise<number[]> {
  return page
    .locator('canvas')
    .first()
    .evaluate((canvas: HTMLCanvasElement) => {
      const context = canvas.getContext('2d');
      if (!context) throw new Error('Canvas is unavailable');
      return Array.from(context.getImageData(0, 0, 1, 1).data);
    });
}

test('shows dialogs, menus and Help when invoked from the output screen', async ({ page }) => {
  await ready(page);
  await command(page, 'Preferences…');
  const preferences = page.getByRole('dialog', { name: 'Preferences', exact: true });
  await preferences.getByLabel('Pause after run', { exact: true }).press('Space');
  await preferences.getByRole('button', { name: 'OK', exact: true }).press('Enter');
  await editor(page).fill('print("workflow audit")');
  await page.keyboard.press('Control+F9');
  await expect(page.getByTestId('runtime-status')).toContainText('Program finished');
  await expect.poll(() => topColor(page)).toEqual([0, 0, 0, 255]);

  await page.keyboard.press('F3');
  const open = page.getByRole('dialog', { name: 'Open a File', exact: true });
  await expect(open).toBeAttached();
  await expect.poll(() => topColor(page)).toEqual([170, 170, 170, 255]);
  await expect(open.getByRole('textbox', { name: 'Name', exact: true })).toBeFocused();
  await page.keyboard.press('Escape');
  await page.keyboard.press('Alt+F5');
  await page.keyboard.press('F10');
  await expect.poll(() => topColor(page)).toEqual([170, 170, 170, 255]);
  await page.keyboard.press('Escape');
  await page.keyboard.press('Alt+F5');
  await page.keyboard.press('F1');
  await expect.poll(() => topColor(page)).toEqual([170, 170, 170, 255]);
  await expect(page.getByLabel('Help content', { exact: true })).toContainText('PyTurbo Help');
  expect(await output(page).textContent()).toBe('workflow audit\n');
});

test('runs the selected source while an Output or Help window is active', async ({ page }) => {
  await ready(page);
  await editor(page).fill('print("selected source")');
  await page.keyboard.press('Control+F9');
  await expect.poll(() => output(page).textContent()).toBe('selected source\n');
  await expect(page.getByTestId('runtime-status')).toContainText('Program finished');
  await editor(page).fill('print("run from Output")');
  await command(page, 'Output');
  await expect(page.getByLabel('Output content', { exact: true })).toContainText('selected source');
  await page.keyboard.press('Control+F9');
  await expect.poll(() => output(page).textContent()).toBe('run from Output\n');
  await expect(page.getByTestId('runtime-status')).toContainText('Program finished');
  await editor(page).fill('print("run from Help")');
  await page.keyboard.press('F1');
  await expect(page.getByLabel('Help content', { exact: true })).toContainText('PyTurbo Help');
  await page.keyboard.press('Control+F9');
  await expect.poll(() => output(page).textContent()).toBe('run from Help\n');
});

test('runs the originally requested file if another editor is selected during compilation', async ({
  page,
}) => {
  await page.addInitScript(() => {
    const state = window as unknown as {
      holdCompilation?: boolean;
      releaseCompilation?: () => void;
    };
    const descriptor = Object.getOwnPropertyDescriptor(Worker.prototype, 'onmessage');
    Object.defineProperty(Worker.prototype, 'onmessage', {
      configurable: true,
      get: descriptor?.get,
      set(this: Worker, handler: ((this: Worker, event: MessageEvent) => void) | null) {
        descriptor?.set?.call(
          this,
          handler &&
            ((event: MessageEvent) => {
              if (event.data?.type === 'compiled' && state.holdCompilation) {
                state.releaseCompilation = () => {
                  state.holdCompilation = false;
                  handler.call(this, event);
                };
              } else handler.call(this, event);
            }),
        );
      },
    });
  });
  await ready(page);
  await editor(page).fill('print("requested target")');
  await page.evaluate(() => {
    (window as unknown as { holdCompilation: boolean }).holdCompilation = true;
  });
  await page.keyboard.press('Control+F9');
  await page.waitForFunction(() => 'releaseCompilation' in window);
  await command(page, 'New');
  const other = 'print("different editor")';
  await editor(page).fill(other);
  await page.evaluate(() =>
    (window as unknown as { releaseCompilation: () => void }).releaseCompilation(),
  );
  await expect.poll(() => output(page).textContent()).toBe('requested target\n');
  await expect(page.getByTestId('runtime-status')).toContainText('Program finished');
  await expect(editor(page)).toHaveValue(other);
});

test('preserves the original filename, source and close warning when Save As fails', async ({
  page,
}) => {
  await page.addInitScript(() => {
    const original = IDBObjectStore.prototype.put;
    IDBObjectStore.prototype.put = function (
      value: unknown,
      key?: IDBValidKey,
    ): IDBRequest<IDBValidKey> {
      if (key === 'file:renamed.py')
        throw new DOMException('Audit quota failure', 'QuotaExceededError');
      return original.call(this, value, key);
    };
  });
  await mockEditor(page);
  await editor(page).fill('print("saved")');
  await page.keyboard.press('F2');
  await expect(page.getByRole('status')).toContainText('NONAME00.PY saved.');
  const latest = 'print("new unsaved source")';
  await editor(page).fill(latest);
  await command(page, 'Save as…');
  let saveAs = page.getByRole('dialog', { name: 'Save File As', exact: true });
  await saveAs.getByLabel('Name', { exact: true }).fill('renamed.py');
  await saveAs.getByRole('button', { name: 'OK', exact: true }).press('Enter');
  const error = page.getByRole('dialog', { name: 'Error', exact: true });
  await expect(error).toContainText('QuotaExceededError');
  await error.getByRole('button', { name: 'OK', exact: true }).press('Enter');
  await command(page, 'Save as…');
  saveAs = page.getByRole('dialog', { name: 'Save File As', exact: true });
  await expect(saveAs.getByLabel('Name', { exact: true })).toHaveValue('NONAME00.PY');
  await saveAs.getByRole('button', { name: 'Cancel', exact: true }).press('Enter');
  await expect(editor(page)).toHaveValue(latest);
  await page.keyboard.press('Alt+F3');
  await expect(page.getByRole('dialog', { name: 'Save File', exact: true })).toContainText(
    'Save changes to NONAME00.PY?',
  );
});

test('protects another open unsaved editor from a conflicting Save As name', async ({ page }) => {
  await mockEditor(page);
  await editor(page).fill('first unsaved source');
  await command(page, 'New');
  await editor(page).fill('second unsaved source');
  await command(page, 'Save as…');
  const saveAs = page.getByRole('dialog', { name: 'Save File As', exact: true });
  await saveAs.getByLabel('Name', { exact: true }).fill('NONAME00.PY');
  await saveAs.getByRole('button', { name: 'OK', exact: true }).press('Enter');
  const error = page.getByRole('dialog', { name: 'Error', exact: true });
  await expect(error).toContainText('already open');
  await error.getByRole('button', { name: 'OK', exact: true }).press('Enter');
  await expect(editor(page)).toHaveValue('second unsaved source');
  await page.keyboard.press('F6');
  await expect(editor(page)).toHaveValue('first unsaved source');
});

test('retains the newest successful save when earlier completion callbacks arrive late', async ({
  page,
}) => {
  await page.addInitScript(() => {
    const state = window as unknown as { fileSaves: Array<() => void> };
    state.fileSaves = [];
    const put = IDBObjectStore.prototype.put;
    const descriptor = Object.getOwnPropertyDescriptor(IDBTransaction.prototype, 'oncomplete');
    IDBObjectStore.prototype.put = function (
      value: unknown,
      key?: IDBValidKey,
    ): IDBRequest<IDBValidKey> {
      if (typeof key === 'string' && key.startsWith('file:')) {
        const transaction = this.transaction;
        Object.defineProperty(transaction, 'oncomplete', {
          configurable: true,
          set(handler: ((this: IDBTransaction, event: Event) => void) | null) {
            descriptor?.set?.call(
              transaction,
              handler &&
                ((event: Event) => {
                  state.fileSaves.push(() => handler.call(transaction, event));
                }),
            );
          },
        });
      }
      return put.call(this, value, key);
    };
  });
  await mockEditor(page);
  await editor(page).fill('older saved source');
  await page.keyboard.press('F2');
  await page.waitForFunction(
    () => (window as unknown as { fileSaves: unknown[] }).fileSaves.length === 1,
  );
  await editor(page).fill('newest saved source');
  await page.keyboard.press('F2');
  await page.waitForFunction(
    () => (window as unknown as { fileSaves: unknown[] }).fileSaves.length === 2,
  );
  await page.evaluate(() => (window as unknown as { fileSaves: Array<() => void> }).fileSaves[1]());
  await expect(page.getByRole('status')).toContainText('NONAME00.PY saved.');
  await page.evaluate(() => (window as unknown as { fileSaves: Array<() => void> }).fileSaves[0]());
  await page.keyboard.press('Alt+F3');
  await expect(page.getByRole('dialog', { name: 'Save File', exact: true })).not.toBeAttached();
  await page.keyboard.press('F3');
  await page
    .getByRole('dialog', { name: 'Open a File', exact: true })
    .getByRole('button', { name: 'OK', exact: true })
    .press('Enter');
  await expect(editor(page)).toHaveValue('newest saved source');
});

test('keeps typing focused after entering and leaving DOS fullscreen', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'keyboard', {
      value: { lock: async () => {} },
      configurable: true,
    });
  });
  await mockEditor(page);
  const supported = await page.evaluate(() => document.fullscreenEnabled);
  await page.getByRole('button', { name: 'DOS mode', exact: true }).click();
  if (!supported) {
    await expect(page.getByRole('dialog', { name: 'Error', exact: true })).toBeAttached();
    return;
  }
  await expect.poll(() => page.evaluate(() => Boolean(document.fullscreenElement))).toBe(true);
  await expect(editor(page)).toBeFocused();
  await page.evaluate(() => document.exitFullscreen());
  await expect.poll(() => page.evaluate(() => Boolean(document.fullscreenElement))).toBe(false);
  await expect(editor(page)).toBeFocused();
  await page.keyboard.press('Control+PageDown');
  const source = await editor(page).inputValue();
  await page.keyboard.type('# after fullscreen');
  await expect(editor(page)).toHaveValue(`${source}# after fullscreen`);
});
