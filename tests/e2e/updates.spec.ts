import { expect, type Page, test } from '@playwright/test';

interface UpdateHarness {
  posts: number;
  failSave: boolean;
  holdActivation: boolean;
  holdFileSave: boolean;
  releaseFileSave?: () => void;
  publish(): void;
  activate(): void;
}

declare global {
  interface Window {
    updateHarness: UpdateHarness;
  }
}

const editor = (page: Page) => page.getByRole('textbox', { name: 'Python editor', exact: true });
const notice = (page: Page) => page.getByRole('region', { name: 'Application update' });
const update = (page: Page) => page.getByRole('button', { name: 'Save and reload', exact: true });
const command = (page: Page, name: string) =>
  page
    .getByRole('navigation', { name: 'Main menu' })
    .getByRole('button', { name, exact: true })
    .press('Enter');

async function prepare(
  page: Page,
  options: {
    waiting?: boolean;
    firstInstall?: boolean;
    failActivation?: boolean;
    realPython?: boolean;
  } = {},
): Promise<void> {
  await page.addInitScript((options) => {
    const container = new EventTarget() as ServiceWorkerContainer;
    let controller: ServiceWorker | null = options.firstInstall ? null : ({} as ServiceWorker);
    const completed = sessionStorage.getItem('update-test-completed') === 'yes';
    const worker = Object.assign(new EventTarget(), {
      state: 'installed',
      postMessage(message: { type: string }) {
        if (message.type !== 'SKIP_WAITING') throw new Error('Unexpected worker message');
        state.posts++;
        if (options.failActivation) throw new Error('Activation failed');
        if (!state.holdActivation) queueMicrotask(() => state.activate());
      },
    });
    const registration = Object.assign(new EventTarget(), {
      waiting: options.waiting === false || completed ? null : worker,
      installing: null as typeof worker | null,
      update: async () => registration,
    });
    const state: UpdateHarness = {
      posts: 0,
      failSave: false,
      holdActivation: false,
      holdFileSave: false,
      publish() {
        registration.installing = worker;
        worker.state = 'installing';
        registration.dispatchEvent(new Event('updatefound'));
        registration.waiting = worker;
        worker.state = 'installed';
        worker.dispatchEvent(new Event('statechange'));
      },
      activate() {
        worker.state = 'activated';
        controller = worker as unknown as ServiceWorker;
        registration.waiting = null;
        sessionStorage.setItem('update-test-completed', 'yes');
        container.dispatchEvent(new Event('controllerchange'));
      },
    };
    Object.defineProperties(container, {
      controller: { get: () => controller },
      ready: { value: Promise.resolve(registration) },
      register: { value: async () => registration },
    });
    Object.defineProperty(navigator, 'serviceWorker', { value: container, configurable: true });
    window.updateHarness = state;
    const put = IDBObjectStore.prototype.put;
    const complete = Object.getOwnPropertyDescriptor(IDBTransaction.prototype, 'oncomplete');
    IDBObjectStore.prototype.put = function (value, key) {
      if (state.failSave && typeof key === 'string' && key.startsWith('file:'))
        throw new DOMException('Save rejected', 'QuotaExceededError');
      if (state.holdFileSave && typeof key === 'string' && key.startsWith('file:')) {
        const transaction = this.transaction;
        Object.defineProperty(transaction, 'oncomplete', {
          configurable: true,
          set(handler: ((this: IDBTransaction, event: Event) => void) | null) {
            complete?.set?.call(
              transaction,
              handler &&
                ((event: Event) => {
                  state.releaseFileSave = () => {
                    state.holdFileSave = false;
                    handler.call(transaction, event);
                  };
                }),
            );
          },
        });
      }
      return put.call(this, value, key);
    };
  }, options);
  if (!options.realPython)
    await page.route('**/pyodide.mjs', (route) =>
      route.fulfill({
        contentType: 'text/javascript',
        body: 'export async function loadPyodide() { return new Promise(() => {}); }',
      }),
    );
  await page.goto('/');
  await expect(editor(page)).not.toHaveValue('');
}

test('saves every open file and preferences before an explicitly chosen update reload', async ({
  page,
}) => {
  await prepare(page);
  await editor(page).fill('print("first saved")');
  await command(page, 'New');
  await editor(page).fill('print("second saved")');
  await command(page, 'Preferences…');
  const preferences = page.getByRole('dialog', { name: 'Preferences', exact: true });
  await preferences.getByLabel('Pause after run', { exact: true }).press('Space');
  await preferences.getByRole('button', { name: 'OK', exact: true }).press('Enter');
  await expect(update(page)).toBeEnabled();
  await Promise.all([page.waitForEvent('load'), update(page).click()]);
  await expect(editor(page)).toHaveValue('print("second saved")');
  await expect(notice(page)).toBeHidden();
  await page.keyboard.press('F6');
  await expect(editor(page)).toHaveValue('print("first saved")');
  await command(page, 'Preferences…');
  await expect(page.getByLabel('Pause after run', { exact: true })).toBeChecked();
});

test('keeps unsaved source open and permits retry when saving an update fails', async ({
  page,
}) => {
  await prepare(page);
  const source = 'print("do not lose this")';
  await editor(page).fill(source);
  await page.evaluate(() => {
    window.updateHarness.failSave = true;
  });
  await update(page).click();
  await expect(notice(page)).toContainText('QuotaExceededError');
  await expect(editor(page)).toHaveValue(source);
  expect(await page.evaluate(() => window.updateHarness.posts)).toBe(0);
  await page.evaluate(() => {
    window.updateHarness.failSave = false;
  });
  await Promise.all([page.waitForEvent('load'), update(page).click()]);
  await expect(editor(page)).toHaveValue(source);
});

test('does not activate an update over edits made while saving is pending', async ({ page }) => {
  await prepare(page);
  await editor(page).fill('source at the start of saving');
  await page.evaluate(() => {
    window.updateHarness.holdFileSave = true;
  });
  await update(page).click();
  await expect
    .poll(() => page.evaluate(() => Boolean(window.updateHarness.releaseFileSave)))
    .toBe(true);
  await editor(page).fill('new edits while the save completes');
  await page.evaluate(() => window.updateHarness.releaseFileSave?.());
  await expect(notice(page)).toContainText('Your workspace changed');
  await expect(editor(page)).toHaveValue('new edits while the save completes');
  expect(await page.evaluate(() => window.updateHarness.posts)).toBe(0);
  await Promise.all([page.waitForEvent('load'), update(page).click()]);
  await expect(editor(page)).toHaveValue('new edits while the save completes');
});

test('does not reload over newer edits while activation is pending', async ({ page }) => {
  await prepare(page);
  await editor(page).fill('before update');
  await page.evaluate(() => {
    window.updateHarness.holdActivation = true;
  });
  await update(page).click();
  await expect.poll(() => page.evaluate(() => window.updateHarness.posts)).toBe(1);
  await editor(page).fill('newer source during activation');
  await page.evaluate(() => window.updateHarness.activate());
  await expect(notice(page)).toContainText('Your workspace changed');
  await expect(editor(page)).toHaveValue('newer source during activation');
  await Promise.all([page.waitForEvent('load'), update(page).click()]);
  await expect(editor(page)).toHaveValue('newer source during activation');
});

test('does not reload over preference changes while activation is pending', async ({ page }) => {
  await prepare(page);
  await page.evaluate(() => {
    window.updateHarness.holdActivation = true;
  });
  await update(page).click();
  await expect.poll(() => page.evaluate(() => window.updateHarness.posts)).toBe(1);
  await command(page, 'Preferences…');
  const preferences = page.getByRole('dialog', { name: 'Preferences', exact: true });
  await preferences.getByLabel('Pause after run', { exact: true }).press('Space');
  await preferences.getByRole('button', { name: 'OK', exact: true }).press('Enter');
  await page.evaluate(() => window.updateHarness.activate());
  await expect(notice(page)).toContainText('Your workspace changed');
  await Promise.all([page.waitForEvent('load'), update(page).click()]);
  await command(page, 'Preferences…');
  await expect(page.getByLabel('Pause after run', { exact: true })).toBeChecked();
});

test('does not reload because another client activates an update', async ({ page }) => {
  await prepare(page);
  await editor(page).fill('unsaved local source');
  await page.evaluate(() => window.updateHarness.activate());
  await expect(editor(page)).toHaveValue('unsaved local source');
  await expect(notice(page)).toBeVisible();
  expect(await page.evaluate(() => window.updateHarness.posts)).toBe(0);
});

test('does not offer an update for the first installation', async ({ page }) => {
  await prepare(page, { firstInstall: true });
  await page.evaluate(() => window.updateHarness.publish());
  await expect(notice(page)).toBeHidden();
});

test('preserves modal focus and fits the canvas when a new update is discovered', async ({
  page,
}) => {
  await page.setViewportSize({ width: 700, height: 500 });
  await prepare(page, { waiting: false });
  await page.keyboard.press('F3');
  const name = page
    .getByRole('dialog', { name: 'Open a File', exact: true })
    .getByLabel('Name', { exact: true });
  await page.evaluate(() => window.updateHarness.publish());
  await expect(notice(page)).toBeVisible();
  await expect(name).toBeFocused();
  await expect(update(page)).toBeDisabled();
  await page.keyboard.press('Escape');
  await expect(update(page)).toBeEnabled();
  const canvas = await page.locator('canvas').first().boundingBox();
  const prompt = await notice(page).boundingBox();
  expect(canvas).not.toBeNull();
  expect(prompt).not.toBeNull();
  expect((prompt?.y ?? 0) + (prompt?.height ?? 0)).toBeLessThanOrEqual(canvas?.y ?? 0);
  expect((canvas?.y ?? 0) + (canvas?.height ?? 0)).toBeLessThanOrEqual(500);
});

test('retains the editor when the waiting update cannot activate', async ({ page }) => {
  await prepare(page, { failActivation: true });
  await editor(page).fill('source survives activation failure');
  await update(page).click();
  await expect(notice(page)).toContainText('Activation failed');
  await expect(editor(page)).toHaveValue('source survives activation failure');
  await expect(update(page)).toBeEnabled();
});

test('waits for a running input program, debugger and shell before offering reload', async ({
  page,
}) => {
  await prepare(page, { realPython: true });
  const status = page.getByTestId('runtime-status');
  await expect(status).toContainText(/Python .* ready/, { timeout: 120_000 });
  await editor(page).fill('input("Your answer: ")');
  await editor(page).press('Control+F9');
  await expect(status).toContainText('waiting for input');
  await expect(update(page)).toBeDisabled();
  await page.getByRole('textbox', { name: 'Program input', exact: true }).press('Enter');
  await expect(status).toContainText('Program finished');
  await expect(update(page)).toBeEnabled();
  await editor(page).fill('value = 1\nprint(value)\n');
  await editor(page).press('F7');
  await expect(status).toContainText('paused:');
  await expect(update(page)).toBeDisabled();
  await page.keyboard.press('Control+F2');
  await expect(update(page)).toBeEnabled();
  await expect(status).toContainText(/Python .* ready/, { timeout: 120_000 });
  await command(page, 'Python shell (REPL)');
  const input = page.getByRole('textbox', { name: 'Program input', exact: true });
  await expect(input).toBeAttached();
  await expect(update(page)).toBeDisabled();
  await input.press('Escape');
  await expect(update(page)).toBeEnabled();
});
