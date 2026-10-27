import type { RuntimeError } from './protocol';

export function parseTraceback(text: string, fallback = 'main.py'): RuntimeError[] {
  const frames: { filename: string; line: number; column: number }[] = [];
  const lines = text.split(/\r?\n/);
  let message = 'Python error';
  for (let index = 0; index < lines.length; index++) {
    const line = lines[index] ?? '';
    const frame = /^\s*File ["'](.+)["'], line (\d+)/.exec(line);
    if (frame) {
      const filename = (frame[1] ?? fallback).replace(/^\/pyturbo\/project\//, '');
      if (!filename.startsWith('<') && !filename.includes('/pyturbo/internal/')) {
        const caret = lines[index + 2] ?? '';
        frames.push({
          filename,
          line: Number(frame[2]),
          column: caret.includes('^') ? Math.max(1, caret.indexOf('^') - 3) : 1,
        });
      }
    }
    if (/^[\w.]+(?:Error|Exception|Interrupt|Exit|Warning)(?::|$)/.test(line)) {
      message = line.trim();
    }
  }
  if (message === 'Python error') {
    message = lines.findLast((line) => line.trim())?.trim() ?? message;
  }
  const frame = frames.at(-1) ?? { filename: fallback, line: 1, column: 1 };
  return [{ ...frame, message, severity: 'error' }];
}

export function borlandMessage(entry: RuntimeError): string {
  return `${entry.severity === 'warning' ? 'Warning' : 'Error'} ${entry.filename.toUpperCase()} ${entry.line}: ${entry.message}`;
}
