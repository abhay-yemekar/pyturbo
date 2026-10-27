import conioSource from '../python/conio.py?raw';
import debuggerSource from '../python/debugger.py?raw';
import graphicsSource from '../python/graphics.py?raw';
import runnerSource from '../python/runner.py?raw';
import turtleSource from '../python/turtle.py?raw';
import {
  decodeSharedText,
  PYODIDE_BASE,
  PYODIDE_VERSION,
  projectPath,
  type RuntimeEvent,
  type SharedChannels,
  type WorkerCommand,
} from './protocol';
import { parseTraceback } from './traceback';

interface PyodideAPI {
  FS: {
    mkdirTree(path: string): void;
    writeFile(path: string, source: string): void;
    unlink(path: string): void;
  };
  globals: { set(name: string, value: unknown): void };
  runPython(code: string): unknown;
  runPythonAsync(code: string): Promise<unknown>;
  loadPackagesFromImports(code: string): Promise<void>;
  loadPackage(name: string | string[]): Promise<void>;
  registerJsModule(name: string, value: Record<string, unknown>): void;
  setStdout(options: { write(buffer: Uint8Array): number }): void;
  setStderr(options: { write(buffer: Uint8Array): number }): void;
  setStdin(options: { stdin(): string | null; isatty: boolean }): void;
  setInterruptBuffer(buffer: Int32Array): void;
  checkInterrupt(): void;
}

const scope = self as unknown as {
  postMessage(event: RuntimeEvent): void;
  onmessage: ((event: MessageEvent<WorkerCommand>) => void) | null;
};
let python: PyodideAPI;
let shared: SharedChannels | undefined;
let control: Int32Array | undefined;
let fallbackInput: string[] = [];
let previousFiles = new Set<string>();
let busy = false;
let output = { stdout: '', stderr: '' };
let lastFlush = 0;
const decoders = { stdout: new TextDecoder(), stderr: new TextDecoder() };

function emit(event: RuntimeEvent): void {
  scope.postMessage(event);
}

function status(value: Extract<RuntimeEvent, { type: 'status' }>['status'], message: string): void {
  emit({ type: 'status', status: value, message });
}

function flushOutput(): void {
  for (const type of ['stdout', 'stderr'] as const) {
    if (output[type]) emit({ type, text: output[type] });
  }
  output = { stdout: '', stderr: '' };
  lastFlush = Date.now();
}

function writeOutput(type: 'stdout' | 'stderr', buffer: Uint8Array): number {
  const text = decoders[type].decode(buffer, { stream: true });
  output[type] = (output[type] + text).slice(-65536);
  if (Date.now() - lastFlush >= 16) flushOutput();
  return buffer.length;
}

function readInput(singleKey = false): string | null {
  flushOutput();
  if (!shared || !control) return fallbackInput.shift() ?? null;
  emit({ type: 'input', singleKey });
  status('input', 'Program is waiting for input');
  while (Atomics.load(control, 0) === 0) {
    Atomics.wait(control, 0, 0, 100);
    python.checkInterrupt();
  }
  python.checkInterrupt();
  if (Atomics.load(control, 0) === -1) return null;
  const length = Atomics.load(control, 1);
  const value = decodeSharedText(shared.stdin, length);
  Atomics.store(control, 0, 0);
  status('running', 'Running program');
  return value;
}

function debugPause(stateJSON: string): string {
  if (!shared || !control) throw new Error('Debugger requires SharedArrayBuffer.');
  flushOutput();
  emit(JSON.parse(stateJSON) as RuntimeEvent);
  status('paused', 'Program paused');
  while (Atomics.load(control, 2) === 0) {
    Atomics.wait(control, 2, 0, 100);
    python.checkInterrupt();
  }
  python.checkInterrupt();
  if (Atomics.load(control, 2) === -1) return JSON.stringify({ command: 'continue' });
  const length = Atomics.load(control, 3);
  const command = decodeSharedText(shared.debug, length);
  Atomics.store(control, 2, 0);
  status('running', 'Running program');
  return command;
}

async function initialize(channels?: SharedChannels): Promise<void> {
  shared = channels;
  control = channels ? new Int32Array(channels.control) : undefined;
  status('loading', 'Loading Python…');
  const moduleURL = `${PYODIDE_BASE}pyodide.mjs`;
  const { loadPyodide } = (await import(/* @vite-ignore */ moduleURL)) as {
    loadPyodide(options: { indexURL: string }): Promise<PyodideAPI>;
  };
  python = await loadPyodide({ indexURL: PYODIDE_BASE });
  python.setStdout({ write: (buffer) => writeOutput('stdout', buffer) });
  python.setStderr({ write: (buffer) => writeOutput('stderr', buffer) });
  python.setStdin({ stdin: () => readInput(), isatty: Boolean(shared) });
  if (channels) python.setInterruptBuffer(new Int32Array(channels.interrupt));
  python.registerJsModule('_pyturbo_bridge', {
    emit: (json: string) => {
      flushOutput();
      emit(JSON.parse(json) as RuntimeEvent);
    },
    debug_pause: debugPause,
    getch: () => [...(readInput(true) ?? '').replace(/\n$/, '')][0] ?? '',
    kbhit: () => Boolean(control && Atomics.load(control, 0) === 1),
  });
  python.FS.mkdirTree('/pyturbo/internal');
  python.FS.mkdirTree('/pyturbo/project');
  for (const [name, source] of Object.entries({
    _pyturbo_debugger: debuggerSource,
    _pyturbo_runner: runnerSource,
    conio: conioSource,
    graphics: graphicsSource,
    turtle: turtleSource,
  })) {
    python.FS.writeFile(`/pyturbo/internal/${name}.py`, source);
  }
  python.runPython(
    "import sys, os\nsys.path.insert(0, '/pyturbo/internal')\nsys.path.insert(0, '/pyturbo/project')\nos.chdir('/pyturbo/project')\nos.environ['MPLBACKEND'] = 'agg'\nimport _pyturbo_runner",
  );
  const version = String(python.runPython('sys.version.split()[0]'));
  emit({ type: 'ready', version, pyodideVersion: PYODIDE_VERSION, isolated: Boolean(channels) });
  status('ready', `Python ${version} ready`);
}

function syncFiles(files: Record<string, string>): void {
  const nextFiles = new Set<string>();
  for (const [name, source] of Object.entries(files)) {
    const path = projectPath(name);
    nextFiles.add(path);
    const parent = path.slice(0, path.lastIndexOf('/'));
    python.FS.mkdirTree(parent);
    python.FS.writeFile(path, source);
  }
  for (const path of previousFiles) {
    if (!nextFiles.has(path)) {
      try {
        python.FS.unlink(path);
      } catch {
        // Programs may already have deleted their own file.
      }
    }
  }
  previousFiles = nextFiles;
}

async function compile(command: Extract<WorkerCommand, { type: 'compile' }>): Promise<void> {
  syncFiles(command.files);
  python.globals.set('_pt_files', JSON.stringify(command.files));
  python.globals.set('_pt_filename', command.filename);
  python.globals.set('_pt_all', command.all);
  const result = String(
    python.runPython('_pyturbo_runner.check(_pt_files, _pt_filename, _pt_all)'),
  );
  emit(JSON.parse(result) as RuntimeEvent);
  status('ready', 'Syntax check complete');
}

async function run(command: Extract<WorkerCommand, { type: 'run' }>): Promise<void> {
  projectPath(command.filename);
  if (!(command.filename in command.files))
    throw new Error('Active file is missing from the project.');
  syncFiles(command.files);
  fallbackInput =
    command.stdin === undefined ? [] : command.stdin.replaceAll('\r\n', '\n').split('\n');
  if (command.stdin?.endsWith('\n')) fallbackInput.pop();
  status('running', 'Loading imported packages…');
  const sources = Object.entries(command.files)
    .filter(([name]) => name.toLowerCase().endsWith('.py'))
    .map(([, source]) => source)
    .join('\n');
  await python.loadPackagesFromImports(sources);
  python.globals.set('_pt_files', JSON.stringify(command.files));
  python.globals.set('_pt_filename', command.filename);
  const checked = JSON.parse(
    String(python.runPython('_pyturbo_runner.check(_pt_files, _pt_filename, False)')),
  ) as Extract<RuntimeEvent, { type: 'compiled' }>;
  if (!checked.ok) {
    emit(checked);
    emit({
      type: 'errors',
      entries: checked.entries,
      text: checked.entries.map((entry) => entry.message).join('\n'),
    });
    emit({ type: 'complete', ok: false });
    status('ready', 'Program has syntax errors');
    return;
  }
  python.globals.set('_pt_args', JSON.stringify(command.args));
  python.globals.set('_pt_debug', JSON.stringify(command.debug ?? null));
  status('running', 'Running program');
  const result = JSON.parse(
    String(await python.runPythonAsync('_pyturbo_runner.run(_pt_filename, _pt_args, _pt_debug)')),
  ) as {
    ok: boolean;
    entries?: Extract<RuntimeEvent, { type: 'errors' }>['entries'];
    text?: string;
  };
  flushOutput();
  if (!result.ok) {
    const text = result.text ?? 'Python error';
    emit({ type: 'stderr', text: `${text.trimEnd()}\n` });
    emit({
      type: 'errors',
      entries: result.entries ?? parseTraceback(text, command.filename),
      text,
    });
  }
  emit({ type: 'complete', ok: result.ok });
  status('ready', result.ok ? 'Program finished' : 'Program stopped with an error');
}

async function install(packages: string[]): Promise<void> {
  status('installing', `Installing ${packages.join(', ')}…`);
  await python.loadPackage('micropip');
  python.globals.set('_pt_packages', JSON.stringify(packages));
  await python.runPythonAsync(
    'import micropip, json\nawait micropip.install(json.loads(_pt_packages))',
  );
  flushOutput();
  emit({ type: 'complete', ok: true });
  status('ready', 'Packages installed');
}

async function repl(source: string): Promise<void> {
  fallbackInput = [];
  status('running', 'Python shell');
  python.globals.set('_pt_repl_source', source);
  const imports = String(python.runPython('_pyturbo_runner.repl_imports(_pt_repl_source)'));
  if (imports) await python.loadPackagesFromImports(imports);
  const result = JSON.parse(String(python.runPython('_pyturbo_runner.repl(_pt_repl_source)'))) as {
    more: boolean;
  };
  flushOutput();
  emit({ type: 'repl', more: result.more });
  status('ready', 'Python shell ready');
}

scope.onmessage = (event) => {
  const command = event.data;
  if (busy) return;
  busy = true;
  void (async () => {
    try {
      switch (command.type) {
        case 'init':
          await initialize(command.shared);
          break;
        case 'run':
          await run(command);
          break;
        case 'compile':
          await compile(command);
          break;
        case 'install':
          await install(command.packages);
          break;
        case 'repl':
          await repl(command.source);
          break;
      }
    } catch (error) {
      flushOutput();
      const text = error instanceof Error ? error.message : String(error);
      const filename = 'filename' in command ? command.filename : 'main.py';
      emit({ type: 'errors', entries: parseTraceback(text, filename), text });
      emit({ type: 'complete', ok: false });
      status('error', text);
    } finally {
      busy = false;
    }
  })();
};
