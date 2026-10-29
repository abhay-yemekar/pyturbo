import { expect, type Page, test } from '@playwright/test';

const editor = (page: Page) => page.getByRole('textbox', { name: 'Python editor', exact: true });

async function options(page: Page) {
  await page
    .getByRole('navigation', { name: 'Main menu' })
    .getByRole('button', { name: 'Editor…', exact: true })
    .press('Enter');
  return page.getByRole('dialog', { name: 'Editor', exact: true });
}

async function ink(page: Page, column = 0): Promise<number> {
  return page
    .locator('canvas')
    .first()
    .evaluate((element: HTMLCanvasElement, column) => {
      const context = element.getContext('2d');
      if (!context) throw new Error('Canvas is unavailable');
      const data = context.getImageData((column + 1) * 9, 32, 9, 16).data;
      let count = 0;
      for (let index = 0; index < data.length; index += 4)
        if (data[index] === 255 && data[index + 1] === 255 && data[index + 2] === 85) count++;
      return count;
    }, column);
}

async function expectInk(page: Page, pixels: number, column = 0): Promise<void> {
  // Avoid sampling a blinking cursor at the same phase on every retry.
  await expect.poll(() => ink(page, column), { intervals: [50, 75, 125, 175] }).toBe(pixels);
}

test.beforeEach(async ({ context, page }) => {
  await context.route('**/pyodide.mjs', (route) =>
    route.fulfill({
      contentType: 'text/javascript',
      body: 'export async function loadPyodide() { return new Promise(() => {}); }',
    }),
  );
  await page.goto('/');
  await expect(editor(page)).not.toHaveValue('');
});

test('renders four distinct cursor shapes and restores cells after blinking and movement', async ({
  page,
}, testInfo) => {
  await editor(page).fill('  ');
  await editor(page).press('Home');
  await expectInk(page, 18);
  for (const [label, pixels] of [
    ['Vertical bar (|)', 32],
    ['I-beam (I)', 40],
    ['Block (█)', 144],
    ['Underline (_)', 18],
  ] as const) {
    const dialog = await options(page);
    await dialog.getByRole('combobox', { name: 'Cursor style', exact: true }).selectOption(label);
    await dialog.getByRole('button', { name: 'OK', exact: true }).press('Enter');
    await expect(editor(page)).toHaveValue('  ');
    await expectInk(page, pixels);
    if (label === 'I-beam (I)')
      await page
        .locator('canvas')
        .first()
        .screenshot({ path: testInfo.outputPath('ibeam.png') });
    await expectInk(page, 0);
    await editor(page).press('ArrowRight');
    await expectInk(page, pixels, 1);
    expect(await ink(page)).toBe(0);
    await editor(page).press('Home');
  }
});

test('persists the chosen style, discards Cancel and keeps overwrite mode distinct', async ({
  page,
}) => {
  let dialog = await options(page);
  const style = () => dialog.getByRole('combobox', { name: 'Cursor style', exact: true });
  await expect(style()).toHaveValue('Underline (_)');
  await style().selectOption('I-beam (I)');
  await dialog.getByRole('button', { name: 'OK', exact: true }).press('Enter');
  await editor(page).fill('ab');
  await editor(page).press('End');
  await editor(page).press('Insert');
  await expectInk(page, 144, 2);
  await editor(page).press('Home');
  await editor(page).press('Z');
  await expect(editor(page)).toHaveValue('Zb');
  await editor(page).press('Insert');
  await editor(page).press('Control+a');
  await editor(page).press('Delete');
  await expect(editor(page)).toHaveValue('');
  await expectInk(page, 40);
  await editor(page).press('F2');
  await expect(page.getByRole('status')).toContainText('NONAME00.PY saved.');
  await page.reload();
  await expect(editor(page)).toHaveValue('');
  dialog = await options(page);
  await expect(style()).toHaveValue('I-beam (I)');
  await style().selectOption('Block (█)');
  await dialog.getByRole('button', { name: 'Cancel', exact: true }).press('Enter');
  await expectInk(page, 40);
  await page
    .getByRole('navigation', { name: 'Main menu' })
    .getByRole('button', { name: 'New', exact: true })
    .press('Enter');
  await editor(page).press('F5');
  await expectInk(page, 40);
});
