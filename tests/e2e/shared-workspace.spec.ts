import { expect, type Page, test } from '@playwright/test';
import LZString from 'lz-string';

test.use({ actionTimeout: 15_000 });

test('keeps a shared file open when an overwrite is cancelled while closing or quitting', async ({
  page,
}) => {
  await shared(page);
  const before = await stored(page);
  for (const [shortcut, title] of [
    ['Alt+F3', 'Save File'],
    ['Alt+x', 'Quit'],
  ]) {
    await editor(page).focus();
    await page.keyboard.press(shortcut);
    const dialog = page.getByRole('dialog', { name: title, exact: true });
    await dialog.getByRole('button', { name: 'Save', exact: true }).press('Enter');
    const overwrite = page.getByRole('dialog', { name: 'Overwrite file?', exact: true });
    await expect(overwrite).toBeAttached();
    await page.keyboard.press('Escape');
    await expect(overwrite).not.toBeAttached();
    await expect(editor(page)).toHaveValue(sharedSource);
    expect(await stored(page)).toEqual(before);
  }
});

test('preserves a shared draft and original saved file when an accepted save fails', async ({
  page,
}) => {
  await shared(page);
  const before = await stored(page);
  await page.evaluate(() => {
    const put = IDBObjectStore.prototype.put;
    IDBObjectStore.prototype.put = function (value, key) {
      if (typeof key === 'string' && key.startsWith('file:')) {
        IDBObjectStore.prototype.put = put;
        throw new DOMException('Synthetic shared save failure', 'QuotaExceededError');
      }
      return put.call(this, value, key);
    };
  });
  await page.keyboard.press('F2');
  const overwrite = page.getByRole('dialog', { name: 'Overwrite file?', exact: true });
  await overwrite.getByRole('button', { name: 'Overwrite', exact: true }).press('Enter');
  const error = page.getByRole('dialog', { name: 'Error', exact: true });
  await expect(error).toContainText('QuotaExceededError');
  expect(await stored(page)).toEqual(before);
  await error.getByRole('button', { name: 'OK', exact: true }).press('Enter');
  await expect(editor(page)).toHaveValue(sharedSource);
  await page.keyboard.press('F2');
  await overwrite.getByRole('button', { name: 'Overwrite', exact: true }).press('Enter');
  await expect.poll(() => stored(page)).toEqual({ ...before, 'CANARY.PY': sharedSource });
});

const original = 'print("ORIGINAL SAVED FILE")\n';
const privateSource = 'value = "UNRELATED SAVED FILE"\n';
const sharedSource =
  'from helper import greeting\nimport os\nprint(greeting, os.path.exists("private.py"))\n';
const editor = (page: Page) => page.getByTestId('editor');
const command = (page: Page, name: string) =>
  page
    .getByRole('navigation', { name: 'Main menu', exact: true })
    .getByRole('button', { name, exact: true })
    .press('Enter');

async function stored(page: Page): Promise<Record<string, string>> {
  return page.evaluate(
    () =>
      new Promise<Record<string, string>>((resolve, reject) => {
        const request = indexedDB.open('pyturbo');
        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
          const db = request.result;
          const store = db.transaction('workspace', 'readonly').objectStore('workspace');
          const values: Record<string, string> = {};
          const cursor = store.openCursor();
          cursor.onerror = () => reject(cursor.error);
          cursor.onsuccess = () => {
            const row = cursor.result;
            if (!row) {
              db.close();
              resolve(values);
              return;
            }
            if (typeof row.key === 'string' && row.key.startsWith('file:'))
              values[row.value.name] = row.value.content;
            row.continue();
          };
        };
      }),
  );
}

async function shared(page: Page, realPython = false, isolated = true): Promise<void> {
  if (!isolated)
    await page.route('**/', async (route) => {
      const response = await route.fetch();
      const headers = response.headers();
      delete headers['cross-origin-opener-policy'];
      delete headers['cross-origin-embedder-policy'];
      await route.fulfill({ response, headers });
    });
  if (!realPython)
    await page.route('**/pyodide.mjs', (route) =>
      route.fulfill({
        contentType: 'text/javascript',
        body: 'export async function loadPyodide() { return new Promise(() => {}); }',
      }),
    );
  await page.goto('/');
  await expect(editor(page)).toBeAttached();
  await page.evaluate(
    ({ original, privateSource }) =>
      new Promise<void>((resolve, reject) => {
        const request = indexedDB.open('pyturbo');
        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
          const db = request.result;
          const tx = db.transaction('workspace', 'readwrite');
          const store = tx.objectStore('workspace');
          for (const [name, content] of Object.entries({
            'CANARY.PY': original,
            'private.py': privateSource,
          }))
            store.put({ name, content, updatedAt: Date.now() }, `file:${name}`);
          store.put(
            { desktop: [{ filename: 'private.py', x: 4, y: 3, w: 64, h: 12 }] },
            'settings',
          );
          tx.oncomplete = () => {
            db.close();
            resolve();
          };
          tx.onerror = () => reject(tx.error);
        };
      }),
    { original, privateSource },
  );
  const hash =
    '#pyturbo=' +
    LZString.compressToEncodedURIComponent(
      JSON.stringify({
        version: 1,
        files: { 'CANARY.PY': sharedSource, 'helper.py': 'greeting = "SHARED ONLY"\n' },
        activeFile: 'CANARY.PY',
      }),
    );
  await page.goto('about:blank');
  await page.goto(`/${hash}`);
  await expect(editor(page)).toHaveValue(sharedSource);
  if (realPython)
    await expect(page.getByTestId('runtime-status')).toContainText(/Python .* ready/, {
      timeout: 120_000,
    });
}

test('keeps prefilled-stdin runs temporary when cross-origin isolation is unavailable', async ({
  page,
}) => {
  await shared(page, true, false);
  expect(await page.evaluate(() => crossOriginIsolated)).toBe(false);
  const before = await stored(page);
  await editor(page).fill('from helper import greeting\nprint(input("Name: "), greeting)\n');
  await page.keyboard.press('Control+F9');
  const input = page.getByRole('dialog', { name: 'Program input', exact: true });
  await input.getByRole('textbox', { name: 'Program input', exact: true }).fill('Ada');
  await input.getByRole('button', { name: 'OK', exact: true }).press('Enter');
  await expect(page.getByRole('log', { name: 'Program output' })).toContainText('Ada SHARED ONLY');
  await expect(page.getByTestId('runtime-status')).toContainText('Program finished');
  expect(await stored(page)).toEqual(before);
});

test('runs and compiles shared files without saving or supplying unrelated saved files', async ({
  page,
}) => {
  await shared(page, true);
  const before = await stored(page);
  const savedDesktop = () =>
    page.evaluate(
      () =>
        new Promise<unknown>((resolve, reject) => {
          const request = indexedDB.open('pyturbo');
          request.onerror = () => reject(request.error);
          request.onsuccess = () => {
            const db = request.result;
            const settings = db
              .transaction('workspace', 'readonly')
              .objectStore('workspace')
              .get('settings');
            settings.onsuccess = () => {
              db.close();
              resolve(settings.result.desktop);
            };
            settings.onerror = () => reject(settings.error);
          };
        }),
    );
  const layout = [{ filename: 'private.py', x: 4, y: 3, w: 64, h: 12 }];
  expect(await savedDesktop()).toEqual(layout);
  await page.keyboard.press('Control+F9');
  await expect(page.getByTestId('runtime-status')).toContainText('Program finished');
  expect(await stored(page)).toEqual(before);
  await expect(page.getByRole('log', { name: 'Program output' })).toHaveText('SHARED ONLY False\n');
  for (const shortcut of ['Alt+F9', 'F9']) {
    await page.keyboard.press(shortcut);
    const dialog = page.getByRole('dialog', { name: 'Compiling', exact: true });
    await expect(dialog).toBeAttached();
    await expect(page.getByTestId('runtime-status')).toContainText('Syntax check complete');
    await page.keyboard.press('Escape');
    expect(await stored(page)).toEqual(before);
  }
  await expect(page.getByRole('region', { name: 'Temporary shared workspace' })).toBeVisible();
  await expect(editor(page)).toHaveValue(sharedSource);
  expect(await savedDesktop()).toEqual(layout);
});

test('requires an overwrite choice for Save and Save All and keeps cancellations temporary', async ({
  page,
}) => {
  await shared(page);
  const before = await stored(page);
  await page.keyboard.press('F2');
  const overwrite = page.getByRole('dialog', { name: 'Overwrite file?', exact: true });
  await expect(overwrite).toContainText('CANARY.PY');
  await page.keyboard.press('Escape');
  await expect(overwrite).not.toBeAttached();
  expect(await stored(page)).toEqual(before);
  await command(page, 'Save all');
  await overwrite.getByRole('button', { name: 'Cancel', exact: true }).press('Enter');
  await expect(overwrite).not.toBeAttached();
  expect(await stored(page)).toEqual(before);
  await page.keyboard.press('F2');
  await overwrite.getByRole('button', { name: 'Overwrite', exact: true }).press('Enter');
  await expect.poll(() => stored(page)).toEqual({ ...before, 'CANARY.PY': sharedSource });
  await expect(editor(page)).toBeFocused();
  await expect(page.getByRole('region', { name: 'Temporary shared workspace' })).toBeVisible();
});

test('saves a shared file under a new name without changing the existing saved file', async ({
  page,
}) => {
  await shared(page);
  const before = await stored(page);
  await command(page, 'Save as…');
  const dialog = page.getByRole('dialog', { name: 'Save File As', exact: true });
  await dialog.getByRole('textbox', { name: 'Name', exact: true }).fill('private.py');
  await dialog.getByRole('button', { name: 'OK', exact: true }).press('Enter');
  const overwrite = page.getByRole('dialog', { name: 'Overwrite file?', exact: true });
  await expect(overwrite).toContainText('private.py');
  await expect(overwrite.getByRole('button', { name: 'Cancel', exact: true })).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(overwrite).not.toBeAttached();
  expect(await stored(page)).toEqual(before);
  await command(page, 'Save as…');
  await dialog.getByRole('textbox', { name: 'Name', exact: true }).fill('my-copy.py');
  await dialog.getByRole('button', { name: 'OK', exact: true }).press('Enter');
  await expect.poll(() => stored(page)).toEqual({ ...before, 'my-copy.py': sharedSource });
  await expect(editor(page)).toHaveValue(sharedSource);
});

test('removes an incoming project item without deleting a same-named saved file', async ({
  page,
}) => {
  await shared(page);
  const before = await stored(page);
  await command(page, 'Delete item');
  const dialog = page.getByRole('dialog', { name: 'Delete Project Item', exact: true });
  await expect(dialog).toContainText('temporary workspace');
  await dialog.getByRole('button', { name: 'Delete', exact: true }).press('Enter');
  expect(await stored(page)).toEqual(before);
});

test('keeps long saved filenames readable before an overwrite choice', async ({ page }) => {
  await shared(page);
  const name = `${'long-name-'.repeat(22)}original.py`;
  await page.evaluate(
    (name) =>
      new Promise<void>((resolve, reject) => {
        const request = indexedDB.open('pyturbo');
        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
          const db = request.result;
          const tx = db.transaction('workspace', 'readwrite');
          tx.objectStore('workspace').put(
            { name, content: 'ORIGINAL LONG FILE', updatedAt: Date.now() },
            `file:${name}`,
          );
          tx.oncomplete = () => {
            db.close();
            resolve();
          };
          tx.onerror = () => reject(tx.error);
        };
      }),
    name,
  );
  const before = await stored(page);
  await command(page, 'Save as…');
  const save = page.getByRole('dialog', { name: 'Save File As', exact: true });
  await save.getByRole('textbox', { name: 'Name', exact: true }).fill(name);
  await save.getByRole('button', { name: 'OK', exact: true }).press('Enter');
  const overwrite = page.getByRole('dialog', { name: 'Overwrite file?', exact: true });
  await expect(overwrite).toBeAttached();
  const lines = await overwrite.locator('p').allTextContents();
  expect(lines.join('')).toContain(name);
  expect(lines.every((line) => Array.from(line).length <= 66)).toBe(true);
  expect(lines.length).toBeLessThanOrEqual(18);
  await page.keyboard.press('Escape');
  expect(await stored(page)).toEqual(before);
});
