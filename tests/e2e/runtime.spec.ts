import { expect, type Page, test } from '@playwright/test';

async function ready(page: Page): Promise<void> {
  await page.goto('/');
  await expect(page.getByTestId('runtime-status')).toContainText(/Python .* ready/, {
    timeout: 120_000,
  });
}

async function run(page: Page, source: string): Promise<void> {
  await page.getByRole('textbox', { name: 'Python editor', exact: true }).fill(source);
  await page.keyboard.press('Control+F9');
}

test('runs real Python and returns to the editor after completion', async ({ page }) => {
  await ready(page);
  await run(page, 'for i in range(3):\n    print(f"line {i}")\n');
  await expect(page.getByRole('log', { name: 'Program output' })).toContainText('line 2');
  await expect(page.getByTestId('runtime-status')).toContainText('Program finished');
  await expect(page.getByRole('textbox', { name: 'Python editor', exact: true })).toHaveValue(
    'for i in range(3):\n    print(f"line {i}")\n',
  );
});

async function enablePauseAfterRun(page: Page): Promise<void> {
  await page.keyboard.press('Alt+o');
  await page.keyboard.press('e');
  await page.keyboard.press('p');
  const preferences = page.getByRole('dialog', { name: 'Preferences', exact: true });
  const pause = preferences.getByLabel('Pause after run', { exact: true });
  if (!(await pause.isChecked())) await pause.press('Space');
  await preferences.getByRole('button', { name: 'OK', exact: true }).press('Enter');
}

async function bottomRowColor(page: Page): Promise<number[]> {
  return page
    .locator('canvas')
    .first()
    .evaluate((element: HTMLCanvasElement) => {
      const context = element.getContext('2d');
      if (!context) throw new Error('Console canvas is unavailable');
      return Array.from(context.getImageData(0, element.height - 1, 1, 1).data);
    });
}

test('clears previous output and keeps pause instructions separate across consecutive runs', async ({
  page,
}, testInfo) => {
  await ready(page);
  await enablePauseAfterRun(page);
  const source = 'for i in range(1,10):\n    print(i, "")\n';
  const output = page.getByRole('log', { name: 'Program output' });
  const expected = Array.from({ length: 9 }, (_, index) => `${index + 1} \n`).join('');
  await run(page, source);
  await expect.poll(() => output.textContent()).toBe(expected);
  await expect(page.getByTestId('runtime-status')).toContainText('Program finished');
  await expect(page.getByRole('status')).toContainText('Press Enter to return to the editor');
  await expect.poll(() => bottomRowColor(page)).toEqual([170, 170, 170, 255]);
  await page.keyboard.press('Enter');
  await expect(page.getByRole('textbox', { name: 'Python editor', exact: true })).toHaveValue(
    source,
  );
  await run(page, `${source}print("second run")`);
  const latest = `${expected}second run\n`;
  await expect.poll(() => output.textContent()).toBe(latest);
  await expect(page.getByTestId('runtime-status')).toContainText('Program finished');
  await expect.poll(() => bottomRowColor(page)).toEqual([170, 170, 170, 255]);
  await page
    .locator('canvas')
    .first()
    .screenshot({ path: testInfo.outputPath('pause-footer.png') });
  await page.keyboard.press('Enter');
  await page.keyboard.press('Alt+F5');
  await expect.poll(() => bottomRowColor(page)).toEqual([0, 0, 0, 255]);
  expect(await output.textContent()).toBe(latest);
});

test('preserves exact output without a trailing newline when pausing', async ({ page }) => {
  await ready(page);
  await enablePauseAfterRun(page);
  const source = 'print("Hello", end="")';
  const output = page.getByRole('log', { name: 'Program output' });
  await run(page, source);
  await expect.poll(() => output.textContent()).toBe('Hello');
  await expect(page.getByTestId('runtime-status')).toContainText('Program finished');
  await expect.poll(() => bottomRowColor(page)).toEqual([170, 170, 170, 255]);
  await page.keyboard.press('x');
  await expect(page.getByRole('textbox', { name: 'Program input', exact: true })).toHaveAttribute(
    'readonly',
    '',
  );
  await expect.poll(() => output.textContent()).toBe('Hello');
  await page.keyboard.press('Escape');
  await expect(page.getByRole('textbox', { name: 'Program input', exact: true })).toBeAttached();
  const consoleBounds = await page.locator('canvas').first().boundingBox();
  if (!consoleBounds) throw new Error('Console is not visible');
  await page.mouse.click(consoleBounds.x + 30, consoleBounds.y + 30);
  await expect(page.getByRole('textbox', { name: 'Program input', exact: true })).toBeAttached();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('textbox', { name: 'Python editor', exact: true })).toHaveValue(
    source,
  );
  await run(page, 'print("World", end="")');
  await expect.poll(() => output.textContent()).toBe('World');
  await expect(page.getByTestId('runtime-status')).toContainText('Program finished');
});

test('keeps completed output visible through screenshot shortcuts, modifiers and focus changes', async ({
  page,
}) => {
  await ready(page);
  await enablePauseAfterRun(page);
  const source = 'print("Screenshot this output")';
  const output = page.getByRole('log', { name: 'Program output' });
  await run(page, source);
  await expect(page.getByTestId('runtime-status')).toContainText('Program finished');
  const systemKeys: Array<
    Pick<KeyboardEventInit, 'key' | 'code' | 'metaKey' | 'shiftKey' | 'ctrlKey' | 'altKey'>
  > = [
    { key: 'Meta', code: 'MetaLeft', metaKey: true },
    { key: 'Shift', code: 'ShiftLeft', metaKey: true, shiftKey: true },
    { key: 'S', code: 'KeyS', metaKey: true, shiftKey: true },
    { key: 'Shift', code: 'ShiftLeft', shiftKey: true },
    { key: 'Meta', code: 'MetaLeft', metaKey: true, shiftKey: true },
    { key: 'S', code: 'KeyS', metaKey: true, shiftKey: true },
    { key: 'Control', ctrlKey: true },
    { key: 'Alt', altKey: true },
    { key: 'AltGraph', ctrlKey: true, altKey: true },
    { key: 'CapsLock' },
    { key: 'PrintScreen', code: 'PrintScreen' },
    { key: 'F11', code: 'F11' },
    { key: 'F12', code: 'F12' },
    { key: 'Tab', code: 'Tab', altKey: true },
    { key: 'c', code: 'KeyC', ctrlKey: true },
  ];
  for (const paused of [true, false]) {
    for (const init of systemKeys) {
      // Exercise app dispatch without invoking an OS screenshot or switching apps.
      const prevented = await page.evaluate((init) => {
        const event = new KeyboardEvent('keydown', { ...init, bubbles: true, cancelable: true });
        (document.activeElement ?? document).dispatchEvent(event);
        return event.defaultPrevented;
      }, init);
      expect(prevented, `${init.key} should remain available to the browser/OS`).toBe(false);
      await expect(
        page.getByRole('textbox', { name: 'Program input', exact: true }),
      ).toBeAttached();
      expect(await output.textContent()).toBe('Screenshot this output\n');
    }
    await page.evaluate(() => {
      window.dispatchEvent(new Event('blur'));
      window.dispatchEvent(new Event('focus'));
    });
    await expect(page.getByRole('textbox', { name: 'Program input', exact: true })).toBeAttached();
    await expect
      .poll(() => bottomRowColor(page))
      .toEqual(paused ? [170, 170, 170, 255] : [0, 0, 0, 255]);
    await page.keyboard.press('Enter');
    await expect(page.getByRole('textbox', { name: 'Python editor', exact: true })).toHaveValue(
      source,
    );
    if (paused) await page.keyboard.press('Alt+F5');
  }
});

test('supports repeated live input with UTF-8 through shared buffers', async ({ page }) => {
  await ready(page);
  await run(page, 'for i in range(2):\n    name = input("Name: ")\n    print("Hello", name)\n');
  const input = page.getByRole('textbox', { name: 'Program input', exact: true });
  await expect(page.getByTestId('runtime-status')).toContainText('waiting for input');
  await input.fill('Zoë');
  await input.press('Enter');
  await expect(page.getByRole('log', { name: 'Program output' })).toContainText('Hello Zoë');
  await expect(page.getByTestId('runtime-status')).toContainText('waiting for input');
  await input.fill('Ada');
  await input.press('Enter');
  await expect(page.getByRole('log', { name: 'Program output' })).toContainText('Hello Ada');
  await expect(page.getByTestId('runtime-status')).toContainText('Program finished');
});

test('stops an infinite loop and can run again', async ({ page }) => {
  await ready(page);
  await run(page, 'while True:\n    pass\n');
  await expect(page.getByTestId('runtime-status')).toContainText('Running program');
  await page.keyboard.press('Control+F2');
  await expect(page.getByRole('textbox', { name: 'Python editor', exact: true })).toBeAttached();
  await expect(page.getByTestId('runtime-status')).toContainText(/ready|stopped|finished/, {
    timeout: 60_000,
  });
  await run(page, 'print("running after stop")\n');
  await expect(page.getByRole('log', { name: 'Program output' })).toContainText(
    'running after stop',
  );
});

test('uses fresh main globals on consecutive runs', async ({ page }) => {
  await ready(page);
  const source = 'print(globals().get("previous_run", "fresh namespace"))\nprevious_run = 42\n';
  await run(page, source);
  await expect(page.getByTestId('runtime-status')).toContainText('Program finished');
  await run(page, `print("second run")\n${source}`);
  await expect(page.getByRole('log', { name: 'Program output' })).toHaveText(
    'second run\nfresh namespace\n',
  );
});

test('shows a traceback from the actual project filename and line', async ({ page }) => {
  await ready(page);
  await run(page, 'value = 0\nprint(10 / value)\n');
  await expect(page.getByRole('log', { name: 'Program output' })).toContainText(
    'ZeroDivisionError: division by zero',
  );
  await expect(page.getByRole('log', { name: 'Program output' })).toContainText('line 2');
});

test('keeps the editor responsive during a print flood', async ({ page }) => {
  await ready(page);
  await run(page, 'for i in range(10000):\n    print(i)\nprint("flood completed")\n');
  await expect(page.getByRole('log', { name: 'Program output' })).toContainText('flood completed');
  await expect(page.getByTestId('runtime-status')).toContainText('Program finished');
  await page.getByRole('textbox', { name: 'Python editor', exact: true }).press('F10');
  await expect(page.getByTestId('runtime-status')).not.toContainText('error:');
});

test('traces, evaluates a local, and resumes from the Turbo debugger', async ({ page }) => {
  await ready(page);
  await page
    .getByRole('textbox', { name: 'Python editor', exact: true })
    .fill('x = 4\nx += 3\nprint("debug result", x)\n');
  await page.keyboard.press('F7');
  await expect(page.getByTestId('runtime-status')).toContainText('paused:');
  await page.keyboard.press('F7');
  await expect(page.getByTestId('runtime-status')).toContainText('Paused NONAME00.PY:2');
  await page.keyboard.press('Control+F4');
  const evaluate = page.getByRole('dialog', { name: 'Evaluate/Modify', exact: true });
  await expect(evaluate).toBeAttached();
  await evaluate.getByRole('textbox', { name: 'Expression', exact: true }).fill('x');
  await evaluate.getByRole('textbox', { name: 'Expression', exact: true }).press('Enter');
  await expect(page.getByRole('dialog', { name: 'Evaluate', exact: true })).toContainText('x = 4');
  await page.keyboard.press('Enter');
  await page.keyboard.press('Control+F9');
  await expect(page.getByRole('log', { name: 'Program output' })).toContainText('debug result 7');
  await expect(page.getByTestId('runtime-status')).toContainText('Program finished');
});

test('opens the Turbo Python shell and retains REPL names', async ({ page }) => {
  await ready(page);
  await page.keyboard.press('F10');
  await page.keyboard.press('ArrowLeft');
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Enter');
  const input = page.getByRole('textbox', { name: 'Program input', exact: true });
  await expect(input).toBeAttached();
  await input.fill('answer = 6');
  await input.press('Enter');
  await expect(page.getByTestId('runtime-status')).toContainText('Python shell ready');
  await input.fill('answer * 7');
  await input.press('Enter');
  await expect(page.getByRole('log', { name: 'Program output' })).toContainText('42');
  await input.press('Escape');
  await expect(page.getByRole('textbox', { name: 'Python editor', exact: true })).toBeAttached();
});
