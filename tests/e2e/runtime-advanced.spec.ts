import { expect, type Locator, type Page, test } from '@playwright/test';

const output = (page: Page): Locator => page.getByRole('log', { name: 'Program output' });
const status = (page: Page): Locator => page.getByTestId('runtime-status');
const editor = (page: Page): Locator =>
  page.getByRole('textbox', { name: 'Python editor', exact: true });

async function ready(page: Page): Promise<void> {
  await page.goto('/');
  await expect(status(page)).toContainText(/Python .* ready/, { timeout: 60_000 });
}

async function run(page: Page, source?: string): Promise<void> {
  if (source !== undefined) await editor(page).fill(source);
  await page.keyboard.press('Control+F9');
}

async function accept(page: Page, title: string, button = 'OK'): Promise<void> {
  await page
    .getByRole('dialog', { name: title, exact: true })
    .getByRole('button', { name: button, exact: true })
    .press('Enter');
}

async function activateFile(page: Page, filename: string): Promise<void> {
  await page.keyboard.press('Alt+0');
  const dialog = page.getByRole('dialog', { name: 'Window List', exact: true });
  const files = dialog.getByRole('listbox');
  await expect(files).toBeAttached();
  const names = await files.locator('option').allTextContents();
  const label = names.find((name) => name.endsWith(` ${filename}`));
  expect(label, `Window for ${filename}`).toBeDefined();
  await files.selectOption({ label: label ?? '' });
  await accept(page, 'Window List');
  await expect(editor(page)).toBeAttached();
}

async function packageManager(page: Page): Promise<void> {
  // Always begin from File: F10 restores the last selected top-level menu.
  await page.keyboard.press('Alt+f');
  await page.keyboard.press('ArrowLeft');
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Enter');
  await expect(page.getByRole('dialog', { name: 'Package Manager', exact: true })).toBeAttached();
}

test('refreshes changed project modules and removes deleted modules between warm runs', async ({
  page,
}) => {
  await ready(page);
  await page.getByLabel('Upload project files', { exact: true }).setInputFiles([
    {
      name: 'main.py',
      mimeType: 'text/x-python',
      buffer: Buffer.from('import helper\nprint("helper value", helper.VALUE)\n'),
    },
    { name: 'helper.py', mimeType: 'text/x-python', buffer: Buffer.from('VALUE = 11\n') },
  ]);
  await activateFile(page, 'main.py');
  await run(page);
  await expect(output(page)).toContainText('helper value 11');
  await expect(status(page)).toContainText('Program finished');

  await activateFile(page, 'helper.py');
  await editor(page).fill('VALUE = 22\n');
  await activateFile(page, 'main.py');
  await run(page);
  await expect(output(page)).toContainText('helper value 22');
  await expect(status(page)).toContainText('Program finished');

  await activateFile(page, 'helper.py');
  await page.keyboard.press('Alt+p');
  await page.keyboard.press('d');
  await accept(page, 'Delete Project Item', 'Delete');
  // IndexedDB deletion finishes asynchronously; wait for its editor to close
  // before taking another project snapshot for the next run.
  await expect(editor(page)).not.toHaveValue('VALUE = 22\n');
  await activateFile(page, 'main.py');
  await run(page);
  await expect(output(page)).toContainText("ModuleNotFoundError: No module named 'helper'");
});

test('passes configured program arguments to sys.argv', async ({ page }) => {
  await ready(page);
  await page.keyboard.press('Alt+r');
  await page.keyboard.press('a');
  await page
    .getByRole('dialog', { name: 'Arguments', exact: true })
    .getByLabel('Program arguments', { exact: true })
    .fill('alpha|two words|3');
  await accept(page, 'Arguments');
  await run(page, 'import sys, json\nprint("argv", json.dumps(sys.argv))\n');
  await expect(output(page)).toContainText('["NONAME00.PY", "alpha", "two words", "3"]');
});

test('loads NumPy and renders a Matplotlib plot under the production CSP', async ({ page }) => {
  test.setTimeout(150_000);
  await ready(page);
  await run(
    page,
    'import numpy as np\nimport matplotlib.pyplot as plt\nprint("numpy total", np.arange(4).sum())\nplt.plot([1, 2, 3], [1, 4, 9])\nplt.title("PyTurbo plot")\n',
  );
  await expect(output(page)).toContainText('numpy total 6', { timeout: 90_000 });
  const plot = page.getByRole('img', {
    name: 'Python matplotlib plot',
    exact: true,
    includeHidden: true,
  });
  await expect(plot).toBeAttached({ timeout: 60_000 });
  await expect(status(page)).toContainText('Program finished', { timeout: 60_000 });
  await page.keyboard.press('Alt+F5');
  await expect(plot).toBeVisible();
  await expect
    .poll(() => plot.evaluate((image: HTMLImageElement) => image.naturalWidth))
    .toBeGreaterThan(0);
});

test('installs a pinned pure Python wheel through micropip and recovers from package failure', async ({
  page,
}) => {
  test.setTimeout(150_000);
  await ready(page);
  await packageManager(page);
  await page
    .getByRole('dialog', { name: 'Package Manager', exact: true })
    .getByRole('textbox')
    .fill('pyfiglet==1.0.4');
  await accept(page, 'Package Manager');
  await expect(status(page)).toContainText('Packages installed', { timeout: 90_000 });
  await run(page, 'import pyfiglet\nprint("wheel loaded", bool(pyfiglet.figlet_format("OK")))\n');
  await expect(output(page)).toContainText('wheel loaded True');
  await expect(status(page)).toContainText('Program finished');

  await packageManager(page);
  await page
    .getByRole('dialog', { name: 'Package Manager', exact: true })
    .getByRole('textbox')
    .fill('pyturbo-deliberately-missing-package-2389==0.0.0');
  await accept(page, 'Package Manager');
  await expect(status(page)).toContainText('error:', { timeout: 60_000 });
  await activateFile(page, 'NONAME00.PY');
  await run(page, 'print("runtime recovered from package failure")\n');
  await expect(output(page)).toContainText('runtime recovered from package failure');
});

test('getch consumes one key immediately and BGI/turtle canvases follow their lifecycle', async ({
  page,
}) => {
  await ready(page);
  await run(
    page,
    'import conio\nconio.clrscr()\nprint("press one key")\nkey = conio.getch()\nprint("received", key)\n',
  );
  await expect(status(page)).toContainText('waiting for input');
  await page.keyboard.press('z');
  await expect(output(page)).toContainText('received z');
  await expect(status(page)).toContainText('Program finished');

  await run(
    page,
    'import graphics as g\ng.initgraph()\ng.setcolor(g.GREEN)\ng.bar(10, 10, 30, 30)\ninput("BGI ready: ")\ng.closegraph()\n',
  );
  const canvas = page.getByRole('img', {
    name: 'Python graphics output',
    exact: true,
    includeHidden: true,
  });
  await expect(canvas).toBeVisible();
  await expect(status(page)).toContainText('waiting for input');
  expect(
    await canvas.evaluate((node: HTMLCanvasElement) =>
      Array.from(node.getContext('2d')?.getImageData(20, 20, 1, 1).data ?? []).slice(0, 3),
    ),
  ).toEqual([0, 170, 0]);
  await page.getByRole('textbox', { name: 'Program input', exact: true }).press('Enter');
  await expect(canvas).not.toBeAttached();
  await expect(status(page)).toContainText('Program finished');

  await run(page, 'from turtle import *\npencolor("red")\nforward(50)\ninput("Turtle ready: ")\n');
  await expect(canvas).toBeVisible();
  await expect(status(page)).toContainText('waiting for input');
  expect(
    await canvas.evaluate(
      (node: HTMLCanvasElement) => node.getContext('2d')?.getImageData(340, 240, 1, 1).data[0] ?? 0,
    ),
  ).toBeGreaterThan(0);
  await page.getByRole('textbox', { name: 'Program input', exact: true }).press('Enter');
  await expect(status(page)).toContainText('Program finished');
});

test('Stop wakes both a blocked input call and a paused debugger', async ({ page }) => {
  await page.setViewportSize({ width: 700, height: 500 });
  await ready(page);
  await run(page, 'input("Waiting for Stop: ")\n');
  await expect(status(page)).toContainText('waiting for input');
  await page.getByRole('button', { name: 'Stop', exact: true }).click();
  await expect(output(page)).toContainText('KeyboardInterrupt');
  await expect(status(page)).toContainText('Program stopped with an error');

  await activateFile(page, 'NONAME00.PY');
  await editor(page).fill('value = 1\nprint(value)\n');
  await page.keyboard.press('F7');
  await expect(status(page)).toContainText('paused:');
  await page.getByRole('button', { name: 'Stop', exact: true }).click();
  await expect(status(page)).toContainText('Program stopped with an error');
  await activateFile(page, 'NONAME00.PY');
  await run(page, 'print("running after blocked waits")\n');
  await expect(output(page)).toContainText('running after blocked waits');
});

test('uses prefilled stdin when cross-origin isolation is unavailable', async ({
  page,
  context,
}) => {
  await context.route('**/*', async (route) => {
    if (route.request().resourceType() !== 'document') return route.continue();
    const response = await route.fetch();
    const headers = response.headers();
    delete headers['cross-origin-opener-policy'];
    delete headers['cross-origin-embedder-policy'];
    await route.fulfill({ response, headers });
  });
  await ready(page);
  expect(await page.evaluate(() => crossOriginIsolated)).toBe(false);
  await run(
    page,
    'name = input("Name: ")\nnumber = int(input("Number: "))\nprint(name, number * 2)\n',
  );
  const dialog = page.getByRole('dialog', { name: 'Program input', exact: true });
  await dialog.getByRole('textbox', { name: 'Program input', exact: true }).fill('Ada|21');
  await accept(page, 'Program input');
  await expect(output(page)).toContainText('Ada 42');
  await expect(status(page)).toContainText('Program finished');
});

test('cold reloads the cached app and Python worker while offline', async ({
  page,
  context,
  browserName,
}) => {
  test.setTimeout(150_000);
  await ready(page);
  await expect
    .poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller)), {
      timeout: 30_000,
    })
    .toBe(true);
  await expect
    .poll(
      () =>
        page.evaluate(async () => {
          const cache = await caches.open('pyodide-314.0.7');
          return (await cache.keys()).map((request) => request.url);
        }),
      { timeout: 30_000 },
    )
    .toEqual(
      expect.arrayContaining([
        expect.stringContaining('/pyodide.mjs'),
        expect.stringContaining('/pyodide.asm.wasm'),
        expect.stringContaining('/python_stdlib.zip'),
      ]),
    );
  await run(page, 'print("saved before offline reload")\n');
  await expect(status(page)).toContainText('Program finished');
  if (browserName === 'chromium') {
    const cdp = await context.newCDPSession(page);
    await cdp.send('Network.clearBrowserCache');
    await cdp.detach();
  }
  await context.setOffline(true);
  await page.reload();
  await expect(status(page)).toContainText(/Python .* ready/, { timeout: 60_000 });
  await run(page, 'print("fresh worker ran offline")\n');
  await expect(output(page)).toContainText('fresh worker ran offline');
});
