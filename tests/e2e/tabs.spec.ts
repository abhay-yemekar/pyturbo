import { readFile } from 'node:fs/promises';
import { expect, type Page, test } from '@playwright/test';

declare global {
  interface Window {
    tabClipboard: { paste?: (text: string) => void; cut?: () => void };
  }
}

const editor = (page: Page) => page.getByRole('textbox', { name: 'Python editor', exact: true });
const command = (page: Page, name: string) =>
  page
    .getByRole('navigation', { name: 'Main menu' })
    .getByRole('button', { name, exact: true })
    .press('Enter');
async function open(page: Page) {
  await page.goto('/');
  await expect(editor(page)).not.toHaveValue('');
}
async function position(page: Page, line: number, column: number) {
  await expect(editor(page)).toHaveAttribute('aria-description', `Line ${line}, column ${column}`);
}
async function clickCell(page: Page, column: number, line = 0) {
  const canvas = page.locator('canvas').first();
  const box = await canvas.boundingBox();
  if (!box) throw new Error('Canvas is missing');
  await page.mouse.click(
    box.x + (column + 1.5) * 9 * (box.width / 720),
    box.y + (line + 2.5) * 16 * (box.height / 400),
  );
}
test.beforeEach(async ({ context }) => {
  await context.route('**/pyodide.mjs', (route) =>
    route.fulfill({
      contentType: 'text/javascript',
      body: 'export async function loadPyodide(){return new Promise(()=>{});}',
    }),
  );
});

test('navigates and points inside tabs without editing source, and persists functional F/R options', async ({
  page,
}, testInfo) => {
  await open(page);
  await editor(page).fill('\tx\nabc');
  await editor(page).press('F2');
  await expect(page.getByRole('status')).toContainText('NONAME00.PY saved.');
  await editor(page).press('Control+PageUp');
  for (let i = 0; i < 3; i++) await editor(page).press('ArrowRight');
  await position(page, 1, 4);
  await expect(editor(page)).toHaveValue('\tx\nabc');
  await editor(page).press('Control+o');
  await editor(page).press('r');
  await position(page, 1, 4);
  await editor(page).press('ArrowRight');
  await position(page, 1, 5);
  await editor(page).press('Control+o');
  await editor(page).press('r');
  await clickCell(page, 2);
  await position(page, 1, 3);
  await expect(editor(page)).toHaveValue('\tx\nabc');
  await command(page, 'Editor…');
  const dialog = page.getByRole('dialog', { name: 'Editor', exact: true });
  await expect(dialog.getByLabel('Cursor through tabs', { exact: true })).toBeChecked();
  await expect(dialog.getByLabel('Optimal fill', { exact: true })).not.toBeChecked();
  await dialog.getByLabel('Tab size (1–16)', { exact: true }).fill('8');
  await dialog.getByLabel('Cursor through tabs', { exact: true }).press('Space');
  await dialog.getByLabel('Optimal fill', { exact: true }).press('Space');
  await dialog.getByLabel('Auto indent', { exact: true }).press('Space');
  await page
    .locator('canvas')
    .first()
    .screenshot({ path: testInfo.outputPath('tab-options.png') });
  await dialog.getByRole('button', { name: 'OK', exact: true }).press('Enter');
  await command(page, 'New');
  await editor(page).press('Tab');
  await expect(editor(page)).toHaveValue('        ');
  await editor(page).press('Enter');
  await expect(editor(page)).toHaveValue('\t\n');
  await editor(page).press('F2');
  await expect(page.getByRole('status')).toContainText('NONAME01.PY saved.');
  await page.reload();
  await expect(editor(page)).toHaveValue('\t\n');
  await command(page, 'Editor…');
  await expect(dialog.getByLabel('Cursor through tabs', { exact: true })).not.toBeChecked();
  await expect(dialog.getByLabel('Optimal fill', { exact: true })).toBeChecked();
  await dialog.getByRole('button', { name: 'Cancel', exact: true }).press('Enter');
  await editor(page).press('F6');
  await expect(editor(page)).toHaveValue('\tx\nabc');
});

test('copies/cuts partial tab cells and commits IME at a virtual caret while preserving export bytes', async ({
  page,
}) => {
  await open(page);
  await editor(page).fill('\tx');
  await editor(page).press('Control+PageUp');
  await editor(page).press('ArrowRight');
  await editor(page).press('Shift+ArrowRight');
  await editor(page).press('Shift+ArrowRight');
  const copy = await editor(page).evaluate((element) => {
    const data = new DataTransfer();
    const event = new ClipboardEvent('copy', {
      clipboardData: data,
      bubbles: true,
      cancelable: true,
    });
    element.dispatchEvent(event);
    return event.clipboardData?.getData('text/plain');
  });
  expect(copy).toBe('  ');
  const cut = await editor(page).evaluate((element) => {
    const data = new DataTransfer();
    const event = new ClipboardEvent('cut', {
      clipboardData: data,
      bubbles: true,
      cancelable: true,
    });
    element.dispatchEvent(event);
    return event.clipboardData?.getData('text/plain');
  });
  expect(cut).toBe('  ');
  await expect(editor(page)).toHaveValue('  x');
  await editor(page).press('Control+z');
  await expect(editor(page)).toHaveValue('\tx');
  await editor(page).press('ArrowLeft');
  await editor(page).press('ArrowRight');
  await position(page, 1, 3);
  await editor(page).evaluate((element: HTMLTextAreaElement) => {
    element.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true, data: '' }));
    element.value = '日本\tx';
    element.setSelectionRange(2, 2);
    element.dispatchEvent(
      new InputEvent('input', {
        bubbles: true,
        data: '日本',
        inputType: 'insertCompositionText',
        isComposing: true,
      }),
    );
    element.dispatchEvent(new CompositionEvent('compositionend', { bubbles: true, data: '日本' }));
  });
  await expect(editor(page)).toHaveValue('  日本\tx');
  await position(page, 1, 5);
  await editor(page).press('Control+z');
  await expect(editor(page)).toHaveValue('\tx');
  await position(page, 1, 3);
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    command(page, 'Download .py'),
  ]);
  const path = await download.path();
  if (!path) throw new Error('Download is missing');
  expect(await readFile(path, 'utf8')).toBe('\tx');
});

test('does not paste into a changed target or delete later edits while clipboard access is pending', async ({
  page,
}) => {
  await page.addInitScript(() => {
    window.tabClipboard = {};
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: {
        readText: () =>
          new Promise<string>((resolve) => {
            window.tabClipboard.paste = resolve;
          }),
        writeText: () =>
          new Promise<void>((resolve) => {
            window.tabClipboard.cut = resolve;
          }),
      },
    });
  });
  await open(page);
  await editor(page).fill('\tx');
  await editor(page).press('Control+PageUp');
  await editor(page).press('ArrowRight');
  await command(page, 'Paste (Shift+Ins)');
  await expect.poll(() => page.evaluate(() => Boolean(window.tabClipboard.paste))).toBe(true);
  await editor(page).press('ArrowRight');
  await page.evaluate(() => window.tabClipboard.paste?.('Z'));
  await expect(page.getByRole('status')).toContainText('Paste cancelled');
  await expect(editor(page)).toHaveValue('\tx');
  await command(page, 'Paste (Shift+Ins)');
  await page.evaluate(() => window.tabClipboard.paste?.('Z'));
  await expect(editor(page)).toHaveValue('  Z\tx');
  await editor(page).press('Control+z');
  await editor(page).press('Shift+ArrowLeft');
  await command(page, 'Cut (Shift+Del)');
  await expect.poll(() => page.evaluate(() => Boolean(window.tabClipboard.cut))).toBe(true);
  await expect(editor(page)).toHaveValue('   x');
  await editor(page).press('a');
  await expect(editor(page)).toHaveValue(' a  x');
  await page.evaluate(() => window.tabClipboard.cut?.());
  await expect(editor(page)).toHaveValue(' a  x');
  await editor(page).press('Control+a');
  await editor(page).press('a');
  await editor(page).press('Home');
  await editor(page).press('Insert');
  await editor(page).press('a');
  await expect(editor(page)).toHaveValue('a');
  await position(page, 1, 2);
  await editor(page).press('Insert');
});

test('Optimal Fill leaves active-line spaces alone and groups completed-line packing with undo', async ({
  page,
}) => {
  await open(page);
  await command(page, 'Editor…');
  const dialog = page.getByRole('dialog', { name: 'Editor', exact: true });
  await dialog.getByLabel('Tab size (1–16)', { exact: true }).fill('8');
  await dialog.getByLabel('Optimal fill', { exact: true }).press('Space');
  await dialog.getByLabel('Auto indent', { exact: true }).press('Space');
  await dialog.getByRole('button', { name: 'OK', exact: true }).press('Enter');
  await editor(page).press('Control+a');
  await editor(page).press('Delete');
  await editor(page).pressSequentially('        x');
  await expect(editor(page)).toHaveValue('        x');
  await editor(page).press('Home');
  await editor(page).press('ArrowRight');
  await expect(editor(page)).toHaveValue('        x');
  await editor(page).press('End');
  await editor(page).press('Enter');
  await expect(editor(page)).toHaveValue('\tx\n');
  await position(page, 2, 1);
  await editor(page).press('Control+z');
  await expect(editor(page)).toHaveValue('        x');
  await editor(page).press('Control+Shift+z');
  await expect(editor(page)).toHaveValue('\tx\n');
});

test('keeps a virtual caret visible while scrolling through a wide tab in a narrow editor', async ({
  page,
}) => {
  await open(page);
  await command(page, 'Editor…');
  const dialog = page.getByRole('dialog', { name: 'Editor', exact: true });
  await dialog.getByLabel('Tab size (1–16)', { exact: true }).fill('16');
  await dialog.getByRole('button', { name: 'OK', exact: true }).press('Enter');
  await editor(page).fill('              \t\tx');
  await editor(page).press('Control+F5');
  for (let i = 0; i < 60; i++) await editor(page).press('Shift+ArrowLeft');
  await editor(page).press('Enter');
  await editor(page).press('Control+PageUp');
  for (let i = 0; i < 21; i++) await editor(page).press('ArrowRight');
  await position(page, 1, 22);
  await expect(editor(page)).toHaveValue('              \t\tx');
  await expect
    .poll(
      () =>
        page
          .locator('canvas')
          .first()
          .evaluate((canvas: HTMLCanvasElement) => {
            const pixels = canvas.getContext('2d')?.getImageData(18 * 9, 32, 9, 16).data;
            if (!pixels) throw new Error('Canvas is unavailable');
            let count = 0;
            for (let i = 0; i < pixels.length; i += 4)
              if (pixels[i] === 255 && pixels[i + 1] === 255 && pixels[i + 2] === 85) count++;
            return count;
          }),
      { intervals: [50, 75, 125, 175] },
    )
    .toBe(18);
});
