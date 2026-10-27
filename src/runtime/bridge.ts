import {
  DEBUG_CAPACITY,
  type DebugCommand,
  type DebugOptions,
  encodeMailbox,
  INPUT_CAPACITY,
  type RuntimeEvent,
  type SharedChannels,
  type WorkerCommand,
} from './protocol';

export * from './protocol';

/** Browser-side control; blocking waits only occur in the worker. */
export class PythonRuntime {
  private worker?: Worker;
  private shared?: SharedChannels;
  private control?: Int32Array;
  private ready = false;
  private busy = false;
  private pending?: WorkerCommand;
  private output: { type: 'stdout' | 'stderr'; text: string }[] = [];
  private outputSize = 0;
  private outputFrame = 0;
  private stopTimer?: ReturnType<typeof setTimeout>;

  constructor(private readonly onEvent: (event: RuntimeEvent) => void) {}

  get isolated(): boolean {
    return typeof SharedArrayBuffer !== 'undefined' && globalThis.crossOriginIsolated;
  }

  get running(): boolean {
    return this.busy;
  }

  start(): void {
    if (this.worker) return;
    this.ready = false;
    this.onEvent({ type: 'status', status: 'loading', message: 'Loading Python…' });
    if (this.isolated) {
      this.shared = {
        control: new SharedArrayBuffer(16),
        stdin: new SharedArrayBuffer(INPUT_CAPACITY),
        debug: new SharedArrayBuffer(DEBUG_CAPACITY),
        interrupt: new SharedArrayBuffer(4),
      };
      this.control = new Int32Array(this.shared.control);
    }
    this.worker = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' });
    this.worker.onmessage = (message: MessageEvent<RuntimeEvent>) => {
      const event = message.data;
      if (event.type === 'stdout' || event.type === 'stderr') {
        this.queueOutput(event);
        return;
      }
      this.flushOutput();
      if (event.type === 'ready') {
        this.ready = true;
        const pending = this.pending;
        this.pending = undefined;
        if (pending) this.send(pending);
      }
      if (event.type === 'complete' || event.type === 'compiled' || event.type === 'repl') {
        this.busy = false;
        clearTimeout(this.stopTimer);
      }
      if (event.type === 'status' && event.status === 'error') this.busy = false;
      this.onEvent(event);
    };
    this.worker.onerror = (error) => {
      this.busy = false;
      this.onEvent({
        type: 'status',
        status: 'error',
        message: error.message || 'Python worker failed to load.',
      });
    };
    this.worker.postMessage({ type: 'init', shared: this.shared } satisfies WorkerCommand);
  }

  run(
    files: Record<string, string>,
    filename: string,
    args: string[] = [],
    debug?: DebugOptions,
    stdin?: string,
  ): void {
    if (debug && !this.isolated) {
      this.onEvent({
        type: 'status',
        status: 'error',
        message:
          'The debugger requires cross-origin isolation. Use the deployed site or local server with COOP/COEP headers.',
      });
      return;
    }
    if (this.busy) return;
    this.clearShared();
    this.busy = true;
    this.send({ type: 'run', files, filename, args, debug, stdin });
  }

  compile(files: Record<string, string>, filename: string, all = false): void {
    if (this.busy) return;
    this.busy = true;
    this.clearShared();
    this.send({ type: 'compile', files, filename, all });
  }

  input(value: string): void {
    if (!this.shared || !this.control) return;
    const bytes = new TextEncoder().encode(`${value}\n`);
    if (bytes.length > INPUT_CAPACITY) {
      this.onEvent({
        type: 'status',
        status: 'input',
        message: 'Input line is too long (maximum 64 KiB).',
      });
      return;
    }
    new Uint8Array(this.shared.stdin).set(bytes);
    Atomics.store(this.control, 1, bytes.length);
    Atomics.store(this.control, 0, 1);
    Atomics.notify(this.control, 0);
  }

  stop(): void {
    if (!this.busy) return;
    if (this.shared && this.control) {
      Atomics.store(new Int32Array(this.shared.interrupt), 0, 2);
      Atomics.store(this.control, 0, -1);
      Atomics.store(this.control, 2, -1);
      Atomics.notify(this.control, 0);
      Atomics.notify(this.control, 2);
      // User code can catch KeyboardInterrupt; retain a way to stop that code.
      this.stopTimer = setTimeout(() => {
        if (this.busy) this.reset();
      }, 1500);
    } else {
      this.reset();
    }
  }

  reset(): void {
    clearTimeout(this.stopTimer);
    this.worker?.terminate();
    this.worker = undefined;
    this.ready = false;
    this.busy = false;
    this.pending = undefined;
    this.shared = undefined;
    this.control = undefined;
    this.flushOutput();
    this.onEvent({ type: 'complete', ok: false });
    this.start();
  }

  install(packages: string[]): void {
    if (this.busy || packages.length === 0) return;
    this.busy = true;
    this.send({ type: 'install', packages });
  }

  repl(source: string): void {
    if (this.busy) return;
    this.clearShared();
    this.busy = true;
    this.send({ type: 'repl', source });
  }

  debugCommand(command: DebugCommand, payload: Record<string, unknown> = {}): void {
    if (!this.shared || !this.control) return;
    if (Atomics.load(this.control, 2) !== 0) return;
    try {
      const bytes = encodeMailbox({ command, ...payload }, DEBUG_CAPACITY);
      new Uint8Array(this.shared.debug).set(bytes);
      Atomics.store(this.control, 3, bytes.length);
      Atomics.store(this.control, 2, 1);
      Atomics.notify(this.control, 2);
    } catch (error) {
      this.onEvent({ type: 'status', status: 'paused', message: String(error) });
    }
  }

  private clearShared(): void {
    if (this.control) this.control.fill(0);
    if (this.shared) new Int32Array(this.shared.interrupt).fill(0);
  }

  private send(command: WorkerCommand): void {
    this.start();
    if (!this.ready) {
      this.pending = command;
      return;
    }
    this.worker?.postMessage(command);
  }

  private queueOutput(event: { type: 'stdout' | 'stderr'; text: string }): void {
    this.output.push(event);
    this.outputSize += event.text.length;
    while (this.outputSize > 131072 && this.output.length > 1) {
      this.outputSize -= this.output.shift()?.text.length ?? 0;
    }
    if (!this.outputFrame) this.outputFrame = requestAnimationFrame(() => this.flushOutput());
  }

  private flushOutput(): void {
    cancelAnimationFrame(this.outputFrame);
    this.outputFrame = 0;
    for (const event of this.output) this.onEvent(event);
    this.output = [];
    this.outputSize = 0;
  }
}
