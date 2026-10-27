export const PYODIDE_VERSION = '314.0.7';
export const PYODIDE_BASE = `https://cdn.jsdelivr.net/pyodide/v${PYODIDE_VERSION}/full/`;
export const INPUT_CAPACITY = 65536;
export const DEBUG_CAPACITY = 65536;

export interface RuntimeError {
  filename: string;
  line: number;
  column: number;
  message: string;
  severity: 'error' | 'warning';
}

export interface StackFrame {
  filename: string;
  line: number;
  name: string;
}

export interface DebugOptions {
  breakpoints: number[];
  mode: 'continue' | 'into' | 'over' | 'cursor';
  cursor?: number;
  watches?: string[];
}

export type RuntimeStatus =
  | 'loading'
  | 'ready'
  | 'running'
  | 'input'
  | 'paused'
  | 'installing'
  | 'error';

export type DebugCommand = 'continue' | 'into' | 'over' | 'cursor' | 'evaluate' | 'watches';

export type RuntimeEvent =
  | { type: 'ready'; version: string; pyodideVersion: string; isolated: boolean }
  | { type: 'status'; status: RuntimeStatus; message: string }
  | { type: 'stdout' | 'stderr'; text: string }
  | { type: 'input'; singleKey?: boolean }
  | { type: 'complete'; ok: boolean }
  | { type: 'repl'; more: boolean }
  | { type: 'errors'; entries: RuntimeError[]; text: string }
  | {
      type: 'compiled';
      ok: boolean;
      lines: number;
      warnings: number;
      entries: RuntimeError[];
    }
  | {
      type: 'paused';
      filename: string;
      line: number;
      locals: Record<string, string>;
      stack: StackFrame[];
      watches: Record<string, string>;
    }
  | { type: 'evaluated'; expression: string; value: string }
  | { type: 'graphics'; command: string; args: unknown[] }
  | { type: 'plot'; data: string };

export interface SharedChannels {
  control: SharedArrayBuffer;
  stdin: SharedArrayBuffer;
  debug: SharedArrayBuffer;
  interrupt: SharedArrayBuffer;
}

export type WorkerCommand =
  | { type: 'init'; shared?: SharedChannels }
  | {
      type: 'run';
      files: Record<string, string>;
      filename: string;
      args: string[];
      debug?: DebugOptions;
      stdin?: string;
    }
  | {
      type: 'compile';
      files: Record<string, string>;
      filename: string;
      all: boolean;
    }
  | { type: 'install'; packages: string[] }
  | { type: 'repl'; source: string };

export function projectPath(filename: string): string {
  const normalized = filename.replaceAll('\\', '/');
  if (
    normalized.startsWith('/') ||
    normalized.split('/').some((part) => part === '..' || part === '') ||
    normalized.includes('\0') ||
    /^[A-Za-z]:/.test(normalized)
  ) {
    throw new Error("Project file names must be relative paths without '..'.");
  }
  return `/pyturbo/project/${normalized}`;
}

export function encodeMailbox(value: unknown, capacity: number): Uint8Array {
  const bytes = new TextEncoder().encode(JSON.stringify(value));
  if (bytes.length > capacity) {
    throw new Error(`Command exceeds the ${capacity}-byte mailbox capacity.`);
  }
  return bytes;
}

export function decodeSharedText(buffer: SharedArrayBuffer, length: number): string {
  if (!Number.isInteger(length) || length < 0 || length > buffer.byteLength) {
    throw new Error('Invalid shared mailbox length.');
  }
  // TextDecoder's browser BufferSource contract excludes shared views.
  return new TextDecoder().decode(new Uint8Array(buffer, 0, length).slice());
}
