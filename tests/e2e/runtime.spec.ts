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
  await run(page, source);
  await expect(async () => {
    const output = await page.getByRole('log', { name: 'Program output' }).textContent();
    expect(output?.match(/fresh namespace/g)).toHaveLength(2);
  }).toPass();
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
