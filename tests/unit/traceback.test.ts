import { describe, expect, it } from 'vitest';
import { decodeSharedText, encodeMailbox, projectPath } from '../../src/runtime/protocol';
import { borlandMessage, parseTraceback } from '../../src/runtime/traceback';

describe('Python diagnostics', () => {
  it('tracks the innermost project frame rather than Pyodide internals', () => {
    const text =
      'Traceback (most recent call last):\n  File "/pyturbo/internal/_pyturbo_runner.py", line 23, in run\n  File "/pyturbo/project/main.py", line 8, in <module>\n  File "/pyturbo/project/math_helpers.py", line 3, in divide\nZeroDivisionError: division by zero';
    const entry = parseTraceback(text)[0];
    expect(entry).toMatchObject({
      filename: 'math_helpers.py',
      line: 3,
      message: 'ZeroDivisionError: division by zero',
    });
    expect(entry && borlandMessage(entry)).toBe(
      'Error MATH_HELPERS.PY 3: ZeroDivisionError: division by zero',
    );
  });

  it('keeps syntax errors and interrupted runs navigable', () => {
    expect(
      parseTraceback(
        '  File "main.py", line 2\n    if x\n        ^\nSyntaxError: expected colon',
      )[0],
    ).toMatchObject({ filename: 'main.py', line: 2, message: 'SyntaxError: expected colon' });
    expect(parseTraceback('KeyboardInterrupt', 'loop.py')[0]).toMatchObject({
      filename: 'loop.py',
      line: 1,
      message: 'KeyboardInterrupt',
    });
  });
});

describe('shared runtime protocol', () => {
  it('copies shared UTF-8 mailbox bytes before decoding in the browser', () => {
    const shared = new SharedArrayBuffer(32);
    const bytes = new TextEncoder().encode('Zoë\n');
    new Uint8Array(shared).set(bytes);
    expect(decodeSharedText(shared, bytes.length)).toBe('Zoë\n');
    expect(() => decodeSharedText(shared, 33)).toThrow('length');
  });
  it('bounds debugger payload bytes using UTF-8 rather than character count', () => {
    expect(() => encodeMailbox({ expression: 'é'.repeat(20) }, 32)).toThrow('mailbox');
    expect(new TextDecoder().decode(encodeMailbox({ command: 'into' }, 64))).toBe(
      '{"command":"into"}',
    );
  });

  it('keeps synchronized project files inside their own workspace', () => {
    expect(projectPath('helpers\\math.py')).toBe('/pyturbo/project/helpers/math.py');
    for (const path of [
      '../outside.py',
      '/etc/secret',
      'C:\\secret.py',
      'a/../b.py',
      'a//b.py',
      'a\0b',
    ]) {
      expect(() => projectPath(path)).toThrow('relative paths');
    }
  });
});
