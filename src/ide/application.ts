import { EditorBuffer } from '../editor/buffer';
import {
  PYTHON_TOKEN_ATTRIBUTES,
  type PythonTokenRole,
  pythonTokenRoles,
} from '../editor/highlighter';
import { CanvasRenderer, CellBuffer, type Rect, VGA_PALETTE } from '../engine';
import {
  type DebugOptions,
  PythonRuntime,
  type RuntimeError,
  type RuntimeEvent,
  type RuntimeStatus,
  type StackFrame,
} from '../runtime/bridge';
import { decodeShare, encodeShare } from '../storage/share';
import {
  defaultSettings,
  validateFilename,
  type WorkspaceFile,
  type WorkspaceSettings,
  WorkspaceStore,
} from '../storage/workspace';
import {
  type ColorDialogState,
  colorDialogRects,
  colorListStart,
  drawColorDialog,
  selectedColorItem,
} from './color-dialog';
import { COLOR_GROUPS, COLOR_NAMES, colorAttribute, windowColorGroup } from './colors';
import { hotkey, type MenuItem, menus, plain } from './menus';

type WindowKind = 'editor' | 'messages' | 'watch' | 'output' | 'help' | 'project' | 'notes';
interface IdeWindow {
  id: number;
  kind: WindowKind;
  bounds: Rect;
  editor?: EditorBuffer;
  title: string;
  restore?: Rect;
  content?: string[];
  scrollY?: number;
  selected?: number;
}
interface EditorLayout {
  text: string;
  identifierColor: string;
  tabSize: number;
  lines: string[];
  offsets: number[];
  widths: number[];
  maxWidth: number;
  roles: PythonTokenRole[];
}
interface Field {
  label: string;
  value: string;
  type?: 'text' | 'checkbox' | 'select';
  options?: string[];
}
interface DialogState {
  title: string;
  message: string[];
  fields: Field[];
  list?: string[];
  selected: number;
  buttons: string[];
  onSubmit: (values: string[], choice: number, selected: number) => void | Promise<void>;
  width: number;
  fieldIndex: number;
  kind?: 'colors';
  colors?: ColorDialogState;
  buttonRects: Rect[];
  fieldRows: number[];
  listTop: number;
  rect: Rect;
}
interface OpenMenu {
  top: number;
  items: MenuItem[];
  selected: number;
  x: number;
  y: number;
  width: number;
}
interface ConsoleLine {
  text: string;
  attr: number;
}

const STARTER =
  '# Code Python like it\'s 1992.\n# Ctrl+F9 Run   Alt+F5 User screen   F1 Help\n\nprint("Hello, world!")\n';
const HELP = [
  'PyTurbo Help',
  '',
  "Code Python like it's 1992.",
  '',
  'Ctrl+F9    Run your program',
  'Ctrl+F2    Stop / reset Python',
  'Alt+F9     Check syntax',
  'Alt+F5     View the user screen',
  'F2 Save   F3 Open   F10 Menu',
  'F5 Zoom   F6 Next window',
  'F7 Trace  F8 Step over  F4 Go to cursor',
  'Ctrl+F8 Toggle breakpoint  Ctrl+F7 Add watch',
  '',
  'Python runs locally in a WebAssembly worker.',
  'Files and settings stay in this browser.',
  'Save/download files you want to keep.',
  '',
  'Live input and debugging require COOP/COEP.',
  'Menus and touch controls provide alternatives',
  'when your browser reserves a shortcut.',
  '',
  'WordStar: Ctrl+K B/K mark; C copy; V move;',
  'Y delete; I/U indent; 0-9 set bookmarks.',
  'Ctrl+Q F find; A replace; 0-9 bookmarks.',
  '',
  'Packages: imports load built-in Pyodide packages.',
  'Use the system menu to install pure Python wheels.',
  'Native desktop libraries are unavailable.',
  '',
  'Offline: after app and Python files are cached,',
  'a repeat visit can run without a connection.',
  'New packages need a connection and compatible wheels.',
  '',
  'Independent project. Not affiliated with Borland',
  'or Embarcadero. See About for font credits.',
];

export class Application {
  private readonly canvas = document.createElement('canvas');
  private readonly stage = document.createElement('div');
  private readonly input = document.createElement('textarea');
  private readonly dialogMirror = document.createElement('div');
  private readonly mirror = document.createElement('pre');
  private readonly outputMirror = document.createElement('pre');
  private readonly live = document.createElement('div');
  private readonly statusMirror = document.createElement('div');
  private readonly tools = document.createElement('nav');
  private readonly uploadInput = document.createElement('input');
  private readonly store = new WorkspaceStore();
  private readonly runtime = new PythonRuntime((event) => this.runtimeEvent(event));
  private buffer = new CellBuffer(80, 25);
  private readonly renderer = new CanvasRenderer(this.canvas, this.buffer);
  private settings: WorkspaceSettings = structuredClone(defaultSettings);
  private files: WorkspaceFile[] = [];
  private windows: IdeWindow[] = [];
  private nextId = 1;
  private menuStack: OpenMenu[] = [];
  private dialog?: DialogState;
  private status = 'Loading Python…';
  private runtimeStatus: RuntimeStatus = 'loading';
  private pythonVersion = '';
  private output: ConsoleLine[] = [{ text: '', attr: 0x07 }];
  private consoleInput = '';
  private userScreen = false;
  private inputWaiting = false;
  private pausedAfterRun = false;
  private shell = false;
  private quit = false;
  private errors: RuntimeError[] = [];
  private errorIndex = 0;
  private cpu?: { filename: string; line: number };
  private locals: Record<string, string> = {};
  private stack: StackFrame[] = [];
  private watches: string[] = [];
  private watchValues: Record<string, string> = {};
  private breakpoints = new Map<string, Set<number>>();
  private searchQuery = '';
  private clipboard = '';
  private dirty = true;
  private cursorOn = true;
  private menuFocused = false;
  private moveMode = false;
  private drag?: {
    mode: 'move' | 'resize' | 'select' | 'scroll-y' | 'scroll-x';
    x: number;
    y: number;
    bounds: Rect;
    offset?: number;
  };
  private dialogReturnFocus?: HTMLElement;
  private mouseCell?: { x: number; y: number };
  private graphic?: HTMLCanvasElement;
  private graphicColor = 15;
  private plot?: HTMLImageElement;
  private compileRequested = false;
  private pendingRun?: DebugOptions | 'normal';
  private singleKeyInput = false;
  private composing = false;
  private consoleAttr = 0x07;
  private readonly editorLayouts = new WeakMap<EditorBuffer, EditorLayout>();

  constructor(private readonly root: HTMLElement) {
    this.stage.className = 'stage';
    this.canvas.setAttribute('role', 'img');
    this.canvas.setAttribute(
      'aria-label',
      'PyTurbo 80-column VGA desktop. Keyboard controls are available in the editor and menu navigation.',
    );
    this.input.className = 'text-input';
    this.input.setAttribute('aria-label', 'Python editor');
    this.input.setAttribute('spellcheck', 'false');
    this.input.autocapitalize = 'off';
    this.input.autocomplete = 'off';
    this.input.wrap = 'off';
    this.input.dataset.testid = 'editor';
    this.mirror.className = 'sr-only print-source';
    this.mirror.setAttribute('aria-label', 'Source code');
    this.outputMirror.className = 'sr-only';
    this.outputMirror.setAttribute('role', 'log');
    this.outputMirror.setAttribute('aria-label', 'Program output');
    this.outputMirror.setAttribute('aria-live', 'polite');
    this.outputMirror.dataset.testid = 'program-output';
    this.live.className = 'sr-only';
    this.live.setAttribute('role', 'status');
    this.live.setAttribute('aria-live', 'polite');
    this.statusMirror.className = 'sr-only';
    this.statusMirror.dataset.testid = 'runtime-status';
    this.dialogMirror.className = 'sr-only';
    this.tools.className = 'tools';
    this.tools.setAttribute('aria-label', 'IDE commands');
    for (const [label, command] of [
      ['Run', 'run'],
      ['Stop', 'stop'],
      ['Save', 'save'],
      ['Open', 'open'],
      ['Menu', 'menu'],
      ['User screen', 'user-screen'],
      ['Trace', 'trace'],
      ['Step', 'step'],
      ['DOS mode', 'dos-mode'],
    ]) {
      const button = document.createElement('button');
      button.textContent = label;
      button.className = command === 'dos-mode' ? '' : 'touch-tools';
      button.addEventListener('click', () => {
        void this.command(command);
      });
      this.tools.append(button);
    }
    const nav = document.createElement('nav');
    nav.className = 'sr-only';
    nav.setAttribute('aria-label', 'Main menu');
    const addCommands = (items: MenuItem[], parent: HTMLElement) => {
      for (const item of items) {
        if (item.label === '-') continue;
        const button = document.createElement('button');
        button.textContent = `${plain(item.label)}${item.shortcut ? ` (${item.shortcut})` : ''}`;
        button.disabled = !!item.disabled;
        if (item.command)
          button.addEventListener('click', () => {
            void this.command(item.command ?? '');
          });
        parent.append(button);
        if (item.children) addCommands(item.children, parent);
      }
    };
    for (const menu of menus) {
      const group = document.createElement('div');
      group.setAttribute('role', 'group');
      group.setAttribute('aria-label', plain(menu.label));
      addCommands(menu.items, group);
      nav.append(group);
    }
    this.uploadInput.type = 'file';
    this.uploadInput.multiple = true;
    this.uploadInput.className = 'sr-only';
    this.uploadInput.setAttribute('aria-label', 'Upload project files');
    this.uploadInput.addEventListener('change', () => {
      void this.upload().catch((error: unknown) => this.message('Upload', [String(error)]));
    });
    this.stage.append(this.canvas, this.input);
    this.root.append(
      this.stage,
      this.tools,
      this.mirror,
      this.outputMirror,
      this.live,
      this.statusMirror,
      this.dialogMirror,
      nav,
      this.uploadInput,
    );
    this.input.addEventListener('input', () => this.textInput());
    this.input.addEventListener('compositionstart', () => {
      this.composing = true;
    });
    this.input.addEventListener('compositionend', () => {
      this.composing = false;
      this.textInput();
    });
    this.input.addEventListener('select', () => {
      if (
        !this.dialog &&
        !this.userScreen &&
        this.active?.editor &&
        document.activeElement === this.input
      ) {
        const editor = this.active.editor;
        if (this.composing) return;
        const expected = editor.selection;
        const expectedDirection = editor.cursor < (editor.anchor ?? 0) ? 'backward' : 'forward';
        if (
          this.input.selectionStart === expected.from &&
          this.input.selectionEnd === expected.to &&
          (expected.from === expected.to || this.input.selectionDirection === expectedDirection)
        )
          return;
        const backwards = this.input.selectionDirection === 'backward';
        editor.anchor = backwards ? this.input.selectionEnd : this.input.selectionStart;
        editor.cursor = backwards ? this.input.selectionStart : this.input.selectionEnd;
        if (editor.anchor === editor.cursor) editor.anchor = null;
        this.dirty = true;
      }
    });
    document.addEventListener('keydown', (event) => this.keydown(event));
    this.canvas.addEventListener('pointerdown', (event) => this.pointerDown(event));
    this.canvas.addEventListener('pointermove', (event) => this.pointerMove(event));
    this.canvas.addEventListener('pointerup', () => {
      this.drag = undefined;
      this.persistDesktop();
    });
    this.canvas.addEventListener(
      'wheel',
      (event) => {
        event.preventDefault();
        if (this.dialog?.colors) {
          const point = this.point(event);
          const layout = colorDialogRects(this.buffer.cols, this.buffer.rows);
          const key = this.contains(layout.group, point.x, point.y)
            ? 'group'
            : this.contains(layout.item, point.x, point.y)
              ? 'item'
              : undefined;
          if (key)
            this.changeColorControl(key, this.dialog.colors[key] + Math.sign(event.deltaY) * 3);
        }
        if (this.active && !this.dialog && !this.userScreen)
          this.scrollWindow(this.active, Math.sign(event.deltaY) * 3);
        this.dirty = true;
      },
      { passive: false },
    );
    this.canvas.addEventListener('dblclick', () => {
      if (this.active?.kind === 'messages') this.trackError();
    });
    window.addEventListener('resize', () => this.fit());
    document.addEventListener('fullscreenchange', () => this.fit());
    window.addEventListener('beforeunload', (event) => {
      if (this.windows.some((window) => window.editor?.modified)) {
        event.preventDefault();
      }
    });
  }

  async start(): Promise<void> {
    await this.renderer.initialize();
    try {
      this.settings = await this.store.loadSettings();
      this.files = await this.store.loadFiles();
    } catch (error) {
      this.status = `Storage unavailable: ${String(error)}`;
    }
    if (location.hash) {
      try {
        const shared = decodeShare(location.hash);
        if (shared) {
          for (const [name, content] of Object.entries(shared.files))
            this.openEditor(name, content, true);
          const active = this.windows.find(
            (window) => window.editor?.filename === shared.activeFile,
          );
          if (active) this.activate(active);
          this.announce('Shared files opened in memory. Save to keep them in this browser.');
        }
      } catch (error) {
        this.message('Share link', [String(error)]);
      }
    }
    if (!this.windows.length) {
      if (this.settings.desktop.length) {
        for (const state of this.settings.desktop) {
          const file = this.files.find((file) => file.name === state.filename);
          if (file) this.openEditor(file.name, file.content, false, state);
        }
      }
      if (!this.windows.length) this.openEditor('NONAME00.PY', STARTER);
    }
    this.fit();
    this.focus();
    window.setInterval(() => {
      this.cursorOn = !this.cursorOn;
      this.dirty = true;
    }, 250);
    const frame = () => {
      if (this.dirty) {
        this.draw();
        this.dirty = false;
      }
      requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);
    await this.prepareOfflineCache();
    this.runtime.start();
  }

  private async prepareOfflineCache(): Promise<void> {
    if (!import.meta.env.PROD || !('serviceWorker' in navigator)) return;
    // Let the first Python download pass through the service worker. The IDE
    // is already painting and accepting edits while registration completes.
    await new Promise<void>((resolve) => {
      const finish = () => {
        clearTimeout(timer);
        navigator.serviceWorker.removeEventListener('controllerchange', controlled);
        resolve();
      };
      const controlled = () => {
        if (navigator.serviceWorker.controller) finish();
      };
      const timer = window.setTimeout(finish, 5000);
      navigator.serviceWorker.addEventListener('controllerchange', controlled);
      navigator.serviceWorker
        .register('/sw.js')
        .then(() => navigator.serviceWorker.ready)
        .then(controlled)
        .catch(finish);
    });
  }

  private get active(): IdeWindow | undefined {
    return this.windows.at(-1);
  }
  private get editor(): EditorBuffer | undefined {
    return this.active?.editor;
  }
  private focus(): void {
    if (this.dialog) {
      if (!this.dialogMirror.contains(document.activeElement))
        this.dialogMirror
          .querySelector<HTMLElement>('input, select, button')
          ?.focus({ preventScroll: true });
      return;
    }
    this.input.focus({ preventScroll: true });
  }
  private announce(text: string): void {
    this.live.textContent = text;
    this.status = text;
    this.dirty = true;
  }

  private fit(): void {
    const mobile = matchMedia('(pointer: coarse), (max-width: 760px)').matches;
    const height = Math.max(160, window.innerHeight - (mobile ? this.tools.offsetHeight + 10 : 0));
    const cols =
      this.settings.screenMode === 'fill' ? Math.max(40, Math.floor(window.innerWidth / 9)) : 80;
    const rows =
      this.settings.screenMode === 'fill'
        ? Math.max(15, Math.floor(height / 16))
        : this.settings.rows;
    if (cols !== this.buffer.cols || rows !== this.buffer.rows) {
      this.buffer = new CellBuffer(cols, rows);
      this.renderer.setBuffer(this.buffer);
      for (const window of this.windows) this.clamp(window);
    }
    const available = Math.min(window.innerWidth / (cols * 9), height / (rows * 16));
    const scale = available >= 1 ? Math.max(1, Math.floor(available)) : available;
    this.canvas.style.width = `${cols * 9 * scale}px`;
    this.canvas.style.height = `${rows * 16 * scale}px`;
    this.stage.style.width = this.canvas.style.width;
    this.stage.style.height = this.canvas.style.height;
    this.dirty = true;
  }

  private clamp(window: IdeWindow): void {
    const b = window.bounds;
    b.w = Math.min(this.buffer.cols, Math.max(20, b.w));
    b.h = Math.min(this.buffer.rows - 2, Math.max(5, b.h));
    b.x = Math.max(0, Math.min(this.buffer.cols - b.w, b.x));
    b.y = Math.max(1, Math.min(this.buffer.rows - 1 - b.h, b.y));
  }

  private openEditor(filename: string, source: string, modified = false, bounds?: Rect): IdeWindow {
    const existing = this.windows.find((window) => window.editor?.filename === filename);
    if (existing) {
      this.activate(existing);
      return existing;
    }
    const editor = new EditorBuffer(filename, source);
    editor.modified = modified;
    editor.tabSize = this.settings.tabSize;
    editor.autoIndent = this.settings.autoIndent;
    editor.cuaKeys = this.settings.cuaKeys;
    const offset = this.windows.length % 6;
    const window: IdeWindow = {
      id: this.nextId++,
      kind: 'editor',
      title: filename,
      editor,
      bounds: bounds
        ? { ...bounds }
        : {
            x: offset * 2,
            y: 1 + offset,
            w: this.buffer.cols - offset * 2,
            h: this.buffer.rows - 3 - offset,
          },
    };
    this.clamp(window);
    this.windows.push(window);
    this.dirty = true;
    this.syncInput();
    return window;
  }

  private activate(window: IdeWindow): void {
    this.windows = this.windows.filter((entry) => entry !== window);
    this.windows.push(window);
    this.syncInput();
    this.dirty = true;
  }
  private syncInput(): void {
    if (this.composing) return;
    const editor = this.editor;
    const value = this.userScreen ? this.consoleInput : (editor?.text ?? '');
    if (this.input.value !== value) this.input.value = value;
    this.input.setAttribute('aria-label', this.userScreen ? 'Program input' : 'Python editor');
    if (editor && !this.userScreen) {
      const selection = editor.selection;
      const direction = editor.cursor < (editor.anchor ?? 0) ? 'backward' : 'forward';
      if (
        this.input.selectionStart !== selection.from ||
        this.input.selectionEnd !== selection.to ||
        (selection.from !== selection.to && this.input.selectionDirection !== direction)
      )
        this.input.setSelectionRange(selection.from, selection.to, direction);
    }
    this.syncMirror();
  }

  private syncMirror(): void {
    const editor = this.editor;
    const visibleText =
      editor?.text ??
      (this.active
        ? this.windowLines(this.active)
            .slice(this.active.scrollY ?? 0, (this.active.scrollY ?? 0) + this.active.bounds.h - 2)
            .join('\n')
        : '');
    this.mirror.setAttribute(
      'aria-label',
      editor || !this.active ? 'Source code' : `${this.active.title} content`,
    );
    if (this.mirror.textContent !== visibleText) this.mirror.textContent = visibleText;
  }

  private textInput(): void {
    if (this.dialog || this.composing) return;
    if (this.userScreen) {
      this.consoleInput = this.input.value.replaceAll('\n', '');
      this.dirty = true;
      return;
    }
    const editor = this.editor;
    if (!editor) return;
    const next = this.input.value.replace(/\r\n?/g, '\n');
    const old = editor.text;
    let start = 0;
    while (start < old.length && start < next.length && old[start] === next[start]) start++;
    let end = old.length;
    let nextEnd = next.length;
    while (end > start && nextEnd > start && old[end - 1] === next[nextEnd - 1]) {
      end--;
      nextEnd--;
    }
    editor.moveTo(start);
    editor.anchor = end > start ? end : null;
    if (end === start && !editor.insertMode) editor.insert(next.slice(start, nextEnd));
    else editor.replaceSelection(next.slice(start, nextEnd));
    editor.moveTo(this.input.selectionEnd);
    this.dirty = true;
    this.keepCursorVisible();
    this.syncInput();
  }

  private attr(role: string, fallback: number): number {
    const colors = this.dialog?.colors?.values ?? this.settings.colors;
    if (
      (role === 'identifier' || role === 'editIdentifier') &&
      this.settings.identifierColor === 'yellow' &&
      colors.editIdentifier === undefined &&
      colors.identifier === undefined
    )
      return 0x1e;
    return colorAttribute(colors, role, fallback);
  }
  private hotText(x: number, y: number, label: string, attr: number, hotAttr: number): void {
    let hot = false;
    for (const ch of label) {
      if (ch === '~') {
        hot = !hot;
        continue;
      }
      this.buffer.set(x++, y, ch, hot ? hotAttr : attr);
    }
  }

  private draw(): void {
    const b = this.buffer;
    let cursor: { x: number; y: number; block: boolean } | undefined;
    if (this.quit) {
      b.fill(0, 0, b.cols, b.rows, ' ', 0x07);
      b.text(0, 0, 'C:\\PYTURBO>exit', 0x07);
      b.text(0, 2, 'PyTurbo closed. Press any key to restart.', 0x07);
    } else if (this.userScreen) {
      b.fill(0, 0, b.cols, b.rows, ' ', 0x07);
      const display = this.output.slice(-b.rows);
      let inputX = 0;
      if (this.inputWaiting || this.shell) {
        const last = display.pop() ?? { text: '', attr: 0x07 };
        const characters = Array.from(last.text + this.consoleInput);
        for (let start = 0; start < characters.length; start += b.cols)
          display.push({ text: characters.slice(start, start + b.cols).join(''), attr: last.attr });
        inputX = characters.length % b.cols;
        if (!inputX) display.push({ text: '', attr: 0x07 });
      }
      const visible = display.slice(-b.rows);
      visible.forEach((line, y) => {
        b.text(0, y, Array.from(line.text).slice(0, b.cols).join(''), line.attr);
      });
      if (this.cursorOn && (this.inputWaiting || this.shell))
        cursor = { x: inputX, y: Math.max(0, visible.length - 1), block: false };
    } else {
      b.fill(0, 1, b.cols, b.rows - 2, '░', this.attr('desktop', 0x71));
      for (const window of this.windows) this.drawWindow(window, window === this.active);
      b.fill(0, 0, b.cols, 1, ' ', this.attr('menu', 0x70));
      menus.forEach((menu, index) => {
        const selected =
          this.menuStack[0]?.top === index ||
          (this.menuFocused && this.menuStack.length === 0 && this.menuIndex === index);
        const x = this.menuX(index);
        const width = plain(menu.label).length + 2;
        const attr = this.attr(selected ? 'selectedMenu' : 'menu', selected ? 0x20 : 0x70);
        if (selected) b.fill(x, 0, width, 1, ' ', attr);
        this.hotText(
          x + 1,
          0,
          menu.label,
          attr,
          this.attr(
            selected ? 'mainMenuSelectedLetter' : 'mainMenuFirstLetter',
            selected ? 0x24 : 0x74,
          ),
        );
      });
      b.fill(0, b.rows - 1, b.cols, 1, ' ', this.attr('status', 0x70));
      let status = '~F1~ Help  ~F2~ Save  ~F3~ Open  ~Alt-F9~ Compile  ~F9~ Make  ~F10~ Menu';
      const selected = this.menuStack.at(-1);
      if (this.dialog?.colors)
        status = `~F1~ Help │ ${this.dialog.colors.focus === 'group' ? 'Chooses general color group to modify' : this.dialog.colors.focus === 'item' ? 'Chooses color item to modify' : 'Tab changes controls; arrow keys choose colors'}`;
      else if (this.dialog)
        status = `~F1~ Help │ ${this.dialog.fields[this.dialog.fieldIndex]?.label ?? 'Select a button'}`;
      else if (selected)
        status = `~F1~ Help │ ${selected.items[selected.selected]?.hint || plain(selected.items[selected.selected]?.label ?? '')}`;
      else if (this.runtimeStatus === 'loading' || this.runtimeStatus === 'installing')
        status = `~F1~ Help │ ${this.status}`;
      else if (this.active?.kind === 'messages')
        status = '~F1~ Help  ~Space~ View source  ~←┘~ Edit source  ~F10~ Menu';
      else if (this.cpu || this.active?.kind === 'watch')
        status = '~F1~ Help  ~F7~ Trace  ~F8~ Step  ~←┘~ Edit  ~Ins~ Add  ~Del~ Delete  ~F10~ Menu';
      this.hotText(
        1,
        b.rows - 1,
        status,
        this.attr('status', 0x70),
        this.attr('statusHotKeys', 0x74),
      );
      if (this.moveMode)
        b.text(
          1,
          b.rows - 1,
          'Move: arrows   Size: Shift+arrows   Enter/Esc: done',
          this.attr('status', 0x70),
        );
      for (const menu of this.menuStack) this.drawMenu(menu);
      if (this.dialog) this.drawDialog(this.dialog);
      if (
        !this.dialog &&
        !this.menuStack.length &&
        !this.menuFocused &&
        this.editor &&
        this.active &&
        this.cursorOn
      ) {
        const editor = this.editor;
        const layout = this.editorLayout(editor);
        const p = this.editorPosition(editor, layout);
        const r = this.active.bounds;
        const line = layout.lines[p.line] ?? '';
        const visualCol = this.visualColumn(line, p.col);
        cursor = {
          x: r.x + 1 + visualCol - editor.scrollX,
          y: r.y + 1 + p.line - editor.scrollY,
          block: !editor.insertMode,
        };
        if (
          cursor.x <= r.x ||
          cursor.y <= r.y ||
          cursor.x >= r.x + r.w - 1 ||
          cursor.y >= r.y + r.h - 1
        )
          cursor = undefined;
      }
    }
    if (this.settings.textMouse && this.mouseCell && document.fullscreenElement) {
      const cell = b.get(this.mouseCell.x, this.mouseCell.y);
      if (cell)
        b.set(
          this.mouseCell.x,
          this.mouseCell.y,
          cell.ch,
          ((cell.attr & 15) << 4) | (cell.attr >> 4),
        );
    }
    if (this.settings.videoMode !== 'color')
      for (let i = 0; i < b.attrs.length; i++) {
        const attr = b.attrs[i];
        if (this.settings.videoMode === 'high-contrast')
          b.attrs[i] = attr >> 4 === 1 ? 0x0f : (attr & 0xf0) | 0x0f;
        else {
          const fg = attr & 15;
          const bg = attr >> 4;
          b.attrs[i] = (bg >= 7 ? 0x70 : 0) | (fg >= 7 || fg === 14 ? 15 : 7);
        }
      }
    this.renderer.render(cursor);
    // Painting must not reset a native selection between select-all and input.
    // Text and caret changes synchronize the textarea in their event handlers.
    this.syncMirror();
    this.statusMirror.textContent = `${this.runtimeStatus}: ${this.status}`;
    if (this.plot) this.plot.hidden = !this.userScreen;
    if (this.graphic) this.graphic.hidden = !this.userScreen;
  }

  private visualColumn(line: string, col: number): number {
    let x = 0;
    let offset = 0;
    for (const char of line) {
      if (offset + char.length > col) break;
      x += char === '\t' ? this.settings.tabSize - (x % this.settings.tabSize) : 1;
      offset += char.length;
    }
    return x;
  }
  private editorLayout(editor: EditorBuffer): EditorLayout {
    const cached = this.editorLayouts.get(editor);
    if (
      cached &&
      cached.text === editor.text &&
      cached.tabSize === this.settings.tabSize &&
      cached.identifierColor === this.settings.identifierColor
    )
      return cached;
    const lines = editor.text.split('\n');
    const offsets: number[] = [];
    let offset = 0;
    for (const line of lines) {
      offsets.push(offset);
      offset += line.length + 1;
    }
    const widths = lines.map((line) => this.visualColumn(line, line.length));
    const layout = {
      text: editor.text,
      lines,
      offsets,
      widths,
      maxWidth: widths.reduce((maximum, width) => Math.max(maximum, width), 0),
      roles: cached?.text === editor.text ? cached.roles : pythonTokenRoles(editor.text),
      tabSize: this.settings.tabSize,
      identifierColor: this.settings.identifierColor,
    };
    this.editorLayouts.set(editor, layout);
    return layout;
  }
  private editorPosition(
    editor: EditorBuffer,
    layout = this.editorLayout(editor),
  ): { line: number; col: number } {
    let low = 0;
    let high = layout.offsets.length - 1;
    while (low < high) {
      const middle = Math.ceil((low + high) / 2);
      if (layout.offsets[middle] <= editor.cursor) low = middle;
      else high = middle - 1;
    }
    return { line: low, col: editor.cursor - layout.offsets[low] };
  }
  private shadow(x: number, y: number, w: number, h: number): void {
    if (this.settings.videoMode !== 'monochrome') this.buffer.shadow(x, y, w, h);
  }
  private keepCursorVisible(): void {
    const editor = this.editor;
    const bounds = this.active?.bounds;
    if (!editor || !bounds) return;
    const layout = this.editorLayout(editor);
    const p = this.editorPosition(editor, layout);
    const x = this.visualColumn(layout.lines[p.line] ?? '', p.col);
    if (p.line < editor.scrollY) editor.scrollY = p.line;
    if (p.line >= editor.scrollY + bounds.h - 2) editor.scrollY = p.line - bounds.h + 3;
    if (x < editor.scrollX) editor.scrollX = x;
    if (x >= editor.scrollX + bounds.w - 2) editor.scrollX = x - bounds.w + 3;
  }

  private drawWindow(window: IdeWindow, active: boolean): void {
    const b = this.buffer;
    const r = window.bounds;
    const group = windowColorGroup(window.kind);
    const textAttr = this.attr(`${group}NormalText`, window.kind === 'output' ? 0x07 : 0x1e);
    const frameAttr = this.attr(`${group}${active ? 'Active' : 'Inactive'}Border`, 0x1f);
    const titleAttr = this.attr(`${group}${active ? 'Active' : 'Inactive'}Title`, frameAttr);
    const icons = this.attr(`${group}Icons`, 0x1a);
    this.shadow(r.x, r.y, r.w, r.h);
    b.fill(r.x, r.y, r.w, r.h, ' ', textAttr);
    b.box(r.x, r.y, r.w, r.h, active, frameAttr);
    const title = ` ${window.editor?.filename ?? window.title} `;
    b.text(
      r.x + Math.max(6, Math.floor((r.w - title.length) / 2)),
      r.y,
      title.slice(0, r.w - 15),
      titleAttr,
    );
    b.text(r.x + r.w - 7, r.y, String(window.id), titleAttr);
    if (active) {
      b.text(r.x + 2, r.y, '[■]', frameAttr);
      b.set(r.x + 3, r.y, '■', icons);
      b.text(r.x + r.w - 5, r.y, `[${window.restore ? '↕' : '↑'}]`, frameAttr);
      b.set(r.x + r.w - 4, r.y, window.restore ? '↕' : '↑', icons);
      b.text(r.x + r.w - 2, r.y + r.h - 1, '─┘', icons);
    }
    if (window.editor) {
      const editor = window.editor;
      const layout = this.editorLayout(editor);
      const lines = layout.lines;
      const maxY = Math.max(0, lines.length - (r.h - 2));
      editor.scrollY = Math.max(0, Math.min(maxY, editor.scrollY));
      const maxX = Math.max(0, layout.maxWidth - (r.w - 2));
      editor.scrollX = Math.max(0, Math.min(maxX, editor.scrollX));
      const selection = editor.selection;
      for (
        let lineNo = editor.scrollY;
        lineNo < Math.min(lines.length, editor.scrollY + r.h - 2);
        lineNo++
      ) {
        const line = lines[lineNo];
        const offset = layout.offsets[lineNo];
        const y = r.y + 1 + lineNo - editor.scrollY;
        if (y > r.y && y < r.y + r.h - 1) {
          const breakpoint = this.breakpoints.get(editor.filename)?.has(lineNo + 1);
          const cpu = this.cpu?.filename === editor.filename && this.cpu.line === lineNo + 1;
          const message = this.errors[this.errorIndex];
          const tracked = message?.filename === editor.filename && message.line === lineNo + 1;
          const bar = cpu
            ? this.attr('execution', 0x30)
            : breakpoint
              ? this.attr('breakpoint', 0x4f)
              : tracked
                ? this.attr('message', 0x31)
                : undefined;
          if (bar !== undefined) b.fill(r.x + 1, y, r.w - 2, 1, ' ', bar);
          let col = 0;
          let index = 0;
          for (const ch of line) {
            const width = ch === '\t' ? this.settings.tabSize - (col % this.settings.tabSize) : 1;
            const selected = offset + index >= selection.from && offset + index < selection.to;
            const role = layout.roles[offset + index] ?? 'normal';
            const token = this.attr(role, PYTHON_TOKEN_ATTRIBUTES[role]);
            const attr = selected ? this.attr('selection', 0x71) : (bar ?? token);
            for (let part = 0; part < width; part++) {
              const x = r.x + 1 + col + part - editor.scrollX;
              if (x > r.x && x < r.x + r.w - 1) b.set(x, y, ch === '\t' ? ' ' : ch, attr);
            }
            col += width;
            index += ch.length;
            if (col >= editor.scrollX + r.w - 2) break;
          }
        }
      }
      if (active) {
        const p = this.editorPosition(editor, layout);
        b.text(
          r.x + 2,
          r.y + r.h - 1,
          `${editor.modified ? '*' : ' '} ${p.line + 1}:${this.visualColumn(lines[p.line] ?? '', p.col) + 1} `.padEnd(
            14,
            '═',
          ),
          frameAttr,
        );
        if (r.w > 24)
          this.drawScrollBar(r.x + 18, r.y + r.h - 1, r.w - 20, editor.scrollX, maxX, false, group);
        this.drawScrollBar(r.x + r.w - 1, r.y + 1, r.h - 2, editor.scrollY, maxY, true, group);
      }
    } else {
      const lines = this.windowLines(window);
      const maxY = Math.max(0, lines.length - (r.h - 2));
      const scrollY = Math.max(
        0,
        Math.min(maxY, window.scrollY ?? (window.kind === 'output' ? maxY : 0)),
      );
      window.scrollY = scrollY;
      for (let index = 0; index < Math.min(lines.length - scrollY, r.h - 2); index++) {
        const lineIndex = index + scrollY;
        const selected =
          window.kind === 'messages'
            ? lineIndex === this.errorIndex
            : ['watch', 'project'].includes(window.kind) && lineIndex === (window.selected ?? 0);
        const marked = this.attr(`${group}MarkedText`, 0x2b);
        if (selected) b.fill(r.x + 1, r.y + 1 + index, r.w - 2, 1, ' ', marked);
        b.text(
          r.x + 1,
          r.y + 1 + index,
          Array.from(lines[lineIndex])
            .slice(0, r.w - 2)
            .join(''),
          selected ? marked : textAttr,
        );
      }
      if (active) this.drawScrollBar(r.x + r.w - 1, r.y + 1, r.h - 2, scrollY, maxY, true, group);
    }
  }

  private windowLines(window: IdeWindow): string[] {
    if (window.kind === 'messages')
      return this.errors.map(
        (entry) =>
          `${entry.severity === 'error' ? 'Error' : 'Warning'} ${entry.filename} ${entry.line}: ${entry.message}`,
      );
    if (window.kind === 'watch')
      return this.watches.length
        ? this.watches.map(
            (expression) => `${expression}: ${this.watchValues[expression] ?? '<not available>'}`,
          )
        : ['• Add a watch with Ctrl+F7'];
    if (window.kind === 'output') return this.output.map((line) => line.text);
    if (window.kind === 'project') return this.projectFiles().map((file) => file.name);
    return window.content ?? [];
  }

  private drawScrollBar(
    x: number,
    y: number,
    length: number,
    position: number,
    maximum: number,
    vertical: boolean,
    group = 'edit',
  ): void {
    const b = this.buffer;
    const page = this.attr(`${group}ScrollBar`, 0x13);
    const control = this.attr(`${group}Arrows`, 0x31);
    for (let index = 0; index < length; index++)
      b.set(x + (vertical ? 0 : index), y + (vertical ? index : 0), maximum > 0 ? '▒' : '▓', page);
    if (maximum <= 0 || length < 3) return;
    b.set(x, y, vertical ? '▲' : '◄', control);
    b.set(
      x + (vertical ? 0 : length - 1),
      y + (vertical ? length - 1 : 0),
      vertical ? '▼' : '►',
      control,
    );
    const thumb =
      1 + Math.round((Math.max(0, Math.min(maximum, position)) / maximum) * (length - 3));
    b.set(
      x + (vertical ? 0 : thumb),
      y + (vertical ? thumb : 0),
      '■',
      this.attr(`${group}ThumbTab`, 0x31),
    );
  }

  private menuIndex = 1;
  private menuX(index: number): number {
    return index >= 9
      ? Math.max(menus[index].x, this.buffer.cols - (index === 9 ? 15 : 7))
      : menus[index].x;
  }
  private openMenu(index: number): void {
    this.menuIndex = (index + menus.length) % menus.length;
    const menu = menus[this.menuIndex];
    const width = Math.max(
      ...menu.items.map((item) => plain(item.label).length + (item.shortcut?.length ?? 0) + 7),
      20,
    );
    this.menuStack = [
      {
        top: this.menuIndex,
        items: menu.items,
        selected: 0,
        x: Math.min(this.menuX(this.menuIndex), this.buffer.cols - width),
        y: 1,
        width,
      },
    ];
    this.menuFocused = true;
    this.dirty = true;
  }
  private drawMenu(menu: OpenMenu): void {
    const b = this.buffer;
    const height = menu.items.length + 2;
    const normal = this.attr('pulldownNormalText', 0x70);
    const selectedAttr = this.attr('pulldownSelectionBar', 0x20);
    const border = this.attr('pulldownBorder', 0x70);
    this.shadow(menu.x, menu.y, menu.width, height);
    b.fill(menu.x, menu.y, menu.width, height, ' ', normal);
    b.box(menu.x + 1, menu.y, menu.width - 2, height, false, border);
    menu.items.forEach((item, index) => {
      const y = menu.y + 1 + index;
      if (item.label === '-') {
        b.text(menu.x + 1, y, `├${'─'.repeat(menu.width - 4)}┤`, border);
        return;
      }
      const selected = index === menu.selected;
      const attr = item.disabled
        ? selected
          ? (selectedAttr & 0xf0) | (this.attr('pulldownDisabledEntry', 0x78) & 15)
          : this.attr('pulldownDisabledEntry', 0x78)
        : selected
          ? selectedAttr
          : normal;
      if (selected) b.fill(menu.x + 2, y, menu.width - 4, 1, ' ', attr);
      this.hotText(
        menu.x + 3,
        y,
        item.label,
        attr,
        item.disabled
          ? attr
          : this.attr(
              selected ? 'pulldownSelectedLetter' : 'pulldownFirstLetter',
              selected ? 0x24 : 0x74,
            ),
      );
      if (item.shortcut)
        b.text(menu.x + menu.width - 3 - item.shortcut.length, y, item.shortcut, attr);
      if (item.children) b.set(menu.x + menu.width - 4, y, '►', attr);
    });
  }
  private chooseMenuItem(): void {
    const menu = this.menuStack.at(-1);
    const item = menu?.items[menu.selected];
    if (!menu || !item || item.disabled || item.label === '-') return;
    if (item.children) {
      const width = Math.max(
        22,
        ...item.children.map((item) => plain(item.label).length + (item.shortcut?.length ?? 0) + 7),
      );
      this.menuStack.push({
        top: menu.top,
        items: item.children,
        selected: 0,
        x: Math.min(menu.x + menu.width - 2, this.buffer.cols - width),
        y: Math.min(menu.y + menu.selected + 1, this.buffer.rows - item.children.length - 3),
        width,
      });
      this.dirty = true;
      return;
    }
    this.menuStack = [];
    this.menuFocused = false;
    if (item.command) void this.command(item.command);
    this.focus();
    this.dirty = true;
  }

  private openDialog(
    title: string,
    message: string[],
    fields: Field[],
    onSubmit: DialogState['onSubmit'],
    options: {
      list?: string[];
      buttons?: string[];
      width?: number;
      kind?: 'colors';
      colors?: Record<string, number>;
    } = {},
  ): void {
    this.menuStack = [];
    this.menuFocused = false;
    this.dialog = {
      title,
      message,
      fields,
      onSubmit,
      list: options.list,
      selected: 0,
      buttons: options.buttons ?? ['OK', 'Cancel'],
      width: options.width ?? 58,
      fieldIndex: 0,
      kind: options.kind,
      colors:
        options.kind === 'colors'
          ? {
              group: 0,
              item: 0,
              focus: 'group',
              values: options.colors ?? { ...this.settings.colors },
            }
          : undefined,
      buttonRects: [],
      fieldRows: [],
      listTop: 0,
      rect: { x: 0, y: 0, w: 0, h: 0 },
    };
    this.syncDialogMirror();
    this.dirty = true;
  }

  private syncDialogMirror(): void {
    const previous = document.activeElement;
    const previousForm = this.dialogMirror.querySelector('form');
    const sameDialog = previousForm?.getAttribute('aria-label') === this.dialog?.title;
    const previousKey =
      sameDialog && previous instanceof HTMLElement && this.dialogMirror.contains(previous)
        ? previous.dataset.focusKey
        : undefined;
    const previousSelection =
      previousKey && previous instanceof HTMLInputElement && previous.type === 'text'
        ? { from: previous.selectionStart, to: previous.selectionEnd }
        : undefined;
    if (!this.dialogReturnFocus)
      this.dialogReturnFocus =
        previous instanceof HTMLElement &&
        previous !== document.body &&
        this.root.contains(previous) &&
        !this.dialogMirror.contains(previous)
          ? previous
          : this.input;
    this.dialogMirror.replaceChildren();
    const dialog = this.dialog;
    if (!dialog) return;
    this.setModalState(true);
    const form = document.createElement('form');
    form.setAttribute('role', 'dialog');
    form.setAttribute('aria-modal', 'true');
    form.setAttribute('aria-label', dialog.title);
    const heading = document.createElement('h2');
    heading.textContent = dialog.title;
    form.append(heading);
    for (const message of dialog.message) {
      const p = document.createElement('p');
      p.textContent = message;
      form.append(p);
    }
    dialog.fields.forEach((field, index) => {
      const label = document.createElement('label');
      label.textContent = field.label;
      const control =
        field.type === 'select'
          ? document.createElement('select')
          : document.createElement('input');
      control.dataset.focusKey = `field-${index}`;
      if (control instanceof HTMLSelectElement)
        for (const value of field.options ?? []) {
          const option = document.createElement('option');
          option.value = value;
          option.textContent = value;
          control.append(option);
        }
      if (control instanceof HTMLInputElement && field.type === 'checkbox') {
        control.type = 'checkbox';
        control.checked = field.value === 'true';
      } else control.value = field.value;
      control.addEventListener('input', () => {
        field.value =
          control instanceof HTMLInputElement && control.type === 'checkbox'
            ? String(control.checked)
            : control.value;
        this.dirty = true;
      });
      control.addEventListener('focus', () => {
        dialog.fieldIndex = index;
        this.dirty = true;
      });
      label.append(control);
      form.append(label);
    });
    if (dialog.colors) this.colorControls(form, dialog.colors);
    if (dialog.list) {
      const label = document.createElement('label');
      label.textContent = 'Files';
      const list = document.createElement('select');
      list.dataset.focusKey = 'list';
      list.size = Math.min(6, Math.max(2, dialog.list.length));
      dialog.list.forEach((entry, index) => {
        const option = document.createElement('option');
        option.textContent = entry;
        option.value = String(index);
        list.append(option);
      });
      list.selectedIndex = dialog.selected;
      list.addEventListener('change', () => {
        dialog.selected = list.selectedIndex;
        this.dirty = true;
      });
      label.append(list);
      form.append(label);
    }
    dialog.buttons.forEach((label, choice) => {
      const button = document.createElement('button');
      button.dataset.focusKey = `button-${choice}`;
      button.type = 'button';
      button.textContent = label;
      button.addEventListener('focus', () => {
        if (dialog.colors) dialog.colors.focus = `button-${choice}`;
        this.dirty = true;
      });
      button.addEventListener('click', () => this.submitDialog(choice));
      form.append(button);
    });
    form.addEventListener('submit', (event) => {
      event.preventDefault();
      this.submitDialog(0);
    });
    this.dialogMirror.append(form);
    const first =
      (previousKey ? form.querySelector<HTMLElement>(`[data-focus-key="${previousKey}"]`) : null) ??
      form.querySelector<HTMLElement>('input, select, button');
    first?.focus({ preventScroll: true });
    if (first instanceof HTMLInputElement && first.type === 'text') {
      if (previousSelection) first.setSelectionRange(previousSelection.from, previousSelection.to);
      else first.select();
    }
  }

  private setModalState(active: boolean): void {
    this.input.inert = active;
    for (const child of this.root.children)
      if (
        child instanceof HTMLElement &&
        child !== this.dialogMirror &&
        child !== this.stage &&
        child !== this.live
      )
        child.inert = active;
  }

  private colorControls(form: HTMLFormElement, state: ColorDialogState): void {
    const item = selectedColorItem(state);
    const current = this.attr(item.key, item.attr);
    const choices: Array<[string, string[], number, number]> = [
      ['Group', COLOR_GROUPS.map((group) => group.label), state.group, 14],
      ['Item', COLOR_GROUPS[state.group].items.map((entry) => entry.label), state.item, 14],
      ['Foreground', COLOR_NAMES, current & 15, 1],
      ['Background', COLOR_NAMES.slice(0, 8), current >> 4, 1],
    ];
    for (const [name, entries, selected, size] of choices) {
      const label = document.createElement('label');
      label.textContent = name;
      const control = document.createElement('select');
      control.setAttribute('aria-label', name);
      const key = name.toLowerCase();
      control.dataset.focusKey = key;
      control.size = size;
      entries.forEach((name, index) => {
        const option = document.createElement('option');
        option.textContent = name;
        option.value = String(index);
        control.append(option);
      });
      control.value = String(selected);
      control.addEventListener('focus', () => {
        state.focus = key;
        this.dirty = true;
      });
      control.addEventListener('change', () => this.changeColorControl(key, Number(control.value)));
      label.append(control);
      form.append(label);
    }
  }

  private changeColorControl(key: string, value: number): void {
    const state = this.dialog?.colors;
    if (!state || !Number.isInteger(value)) return;
    if (key === 'group') {
      state.group = Math.max(0, Math.min(COLOR_GROUPS.length - 1, value));
      state.item = 0;
    } else if (key === 'item') {
      state.item = Math.max(0, Math.min(COLOR_GROUPS[state.group].items.length - 1, value));
    } else {
      const item = selectedColorItem(state);
      const attr = this.attr(item.key, item.attr);
      if (key === 'foreground' && value >= 0 && value < 16)
        state.values[item.key] = (attr & 0xf0) | value;
      if (key === 'background' && value >= 0 && value < 8)
        state.values[item.key] = (value << 4) | (attr & 15);
    }
    this.syncDialogMirror();
    this.dirty = true;
  }

  private colorKey(event: KeyboardEvent): void {
    const state = this.dialog?.colors;
    if (!state) return;
    const key = event.key;
    if (event.altKey) {
      const button = ({ o: 0, c: 1, h: 2 } as Record<string, number>)[key.toLowerCase()];
      if (button !== undefined) {
        event.preventDefault();
        this.submitDialog(button);
        return;
      }
      const focus = (
        { g: 'group', i: 'item', f: 'foreground', b: 'background' } as Record<string, string>
      )[key.toLowerCase()];
      if (focus) {
        event.preventDefault();
        this.dialogMirror.querySelector<HTMLElement>(`[data-focus-key="${focus}"]`)?.focus();
      }
      return;
    }
    if (key === 'F1') {
      event.preventDefault();
      this.submitDialog(2);
      return;
    }
    if (key === 'Enter' && !(event.target instanceof HTMLButtonElement)) {
      event.preventDefault();
      this.submitDialog(0);
      return;
    }
    const focus = state.focus;
    if (!['group', 'item', 'foreground', 'background'].includes(focus)) return;
    const grid = focus === 'foreground' || focus === 'background';
    const item = selectedColorItem(state);
    const attr = this.attr(item.key, item.attr);
    const current =
      focus === 'group'
        ? state.group
        : focus === 'item'
          ? state.item
          : focus === 'foreground'
            ? attr & 15
            : attr >> 4;
    const length =
      focus === 'group'
        ? COLOR_GROUPS.length
        : focus === 'item'
          ? COLOR_GROUPS[state.group].items.length
          : focus === 'foreground'
            ? 16
            : 8;
    const delta = (
      {
        ArrowUp: grid ? -4 : -1,
        ArrowDown: grid ? 4 : 1,
        ArrowLeft: -1,
        ArrowRight: 1,
        PageUp: -14,
        PageDown: 14,
      } as Record<string, number>
    )[key];
    if (delta !== undefined || key === 'Home' || key === 'End') {
      event.preventDefault();
      this.changeColorControl(
        focus,
        key === 'Home'
          ? 0
          : key === 'End'
            ? length - 1
            : Math.max(0, Math.min(length - 1, current + (delta ?? 0))),
      );
    }
  }

  private colorPointer(x: number, y: number): void {
    const state = this.dialog?.colors;
    if (!state) return;
    const layout = colorDialogRects(this.buffer.cols, this.buffer.rows);
    for (const key of ['group', 'item', 'foreground', 'background'] as const) {
      const rect = layout[key];
      if (!this.contains(rect, x, y)) continue;
      let value: number;
      if (key === 'group' || key === 'item') {
        const length =
          key === 'group' ? COLOR_GROUPS.length : COLOR_GROUPS[state.group].items.length;
        const current = key === 'group' ? state.group : state.item;
        value =
          x === rect.x + rect.w - 1 && length > rect.h
            ? y === rect.y
              ? current - 1
              : y === rect.y + rect.h - 1
                ? current + 1
                : Math.round(((y - rect.y) / (rect.h - 1)) * (length - 1))
            : Math.min(length - 1, colorListStart(current, length) + y - rect.y);
      } else value = (y - rect.y) * 4 + Math.floor((x - rect.x) / 3);
      this.changeColorControl(key, value);
      this.dialogMirror.querySelector<HTMLElement>(`[data-focus-key="${key}"]`)?.focus();
      return;
    }
  }

  private dismissDialog(): void {
    this.dialog = undefined;
    this.dialogMirror.replaceChildren();
    this.setModalState(false);
    this.dirty = true;
  }

  private restoreDialogFocus(): void {
    if (this.dialog) {
      this.focus();
      return;
    }
    const target = this.dialogReturnFocus?.isConnected ? this.dialogReturnFocus : this.input;
    this.dialogReturnFocus = undefined;
    target.focus({ preventScroll: true });
  }

  private submitDialog(choice: number): void {
    const dialog = this.dialog;
    if (!dialog || choice < 0 || choice >= dialog.buttons.length) return;
    if (dialog.colors && choice === 2) {
      this.announce(
        'Choose Group and Item, then Foreground and Background. Tab changes controls; arrow keys choose colors. OK saves; Cancel discards.',
      );
      return;
    }
    let previousEditor = this.editor;
    let previousCursor = previousEditor?.cursor;
    let previousText = previousEditor?.text;
    const followChangedEditor = () => {
      const editor = this.editor;
      if (
        editor &&
        (editor !== previousEditor ||
          editor.cursor !== previousCursor ||
          editor.text !== previousText)
      ) {
        this.keepCursorVisible();
        this.syncInput();
        this.dirty = true;
      }
      previousEditor = editor;
      previousCursor = editor?.cursor;
      previousText = editor?.text;
    };
    this.dismissDialog();
    if (!['Cancel', 'Close'].includes(dialog.buttons[choice])) {
      try {
        const completion = dialog.onSubmit(
          dialog.fields.map((field) => field.value),
          choice,
          dialog.selected,
        );
        followChangedEditor();
        Promise.resolve(completion)
          .then(followChangedEditor)
          .catch((error: unknown) => this.message('Error', [String(error)]));
      } catch (error) {
        this.message('Error', [String(error)]);
      }
    }
    this.restoreDialogFocus();
  }

  private message(title: string, lines: string[]): void {
    this.openDialog(title, this.wrap(lines.join('\n'), 52), [], () => {}, { buttons: ['OK'] });
  }
  private wrap(text: string, width: number): string[] {
    const output: string[] = [];
    for (const source of text.split('\n')) {
      let line = source;
      while (line.length > width) {
        let cut = line.lastIndexOf(' ', width);
        if (cut < width / 2) cut = width;
        output.push(line.slice(0, cut));
        line = line.slice(cut).trimStart();
      }
      output.push(line);
    }
    return output;
  }

  private drawDialog(dialog: DialogState): void {
    if (dialog.kind === 'colors') {
      this.drawColors(dialog);
      return;
    }
    const b = this.buffer;
    const normal = this.attr('dialogNormalText', 0x70);
    const frame = this.attr('dialogActiveBorder', 0x7f);
    const width = Math.min(dialog.width, b.cols - 4);
    const listHeight = dialog.list ? Math.min(7, Math.max(2, dialog.list.length)) + 1 : 0;
    const height = Math.min(
      b.rows - 2,
      6 + dialog.message.length + dialog.fields.length * 2 + listHeight,
    );
    const x = Math.floor((b.cols - width) / 2);
    const y = Math.max(1, Math.floor((b.rows - height) / 2));
    dialog.rect = { x, y, w: width, h: height };
    this.shadow(x, y, width, height);
    b.fill(x, y, width, height, ' ', normal);
    b.box(x, y, width, height, true, frame);
    b.text(
      x + Math.floor((width - dialog.title.length - 2) / 2),
      y,
      ` ${dialog.title} `,
      this.attr('dialogActiveTitle', 0x7f),
    );
    b.text(x + 2, y, '[■]', frame);
    b.set(x + 3, y, '■', this.attr('dialogIcons', 0x7a));
    let row = y + 2;
    for (const line of dialog.message)
      if (row < y + height - 3) b.text(x + 3, row++, line.slice(0, width - 6), normal);
    dialog.fieldRows = [];
    dialog.fields.forEach((field, index) => {
      if (row >= y + height - 3) return;
      dialog.fieldRows[index] = row;
      b.text(
        x + 3,
        row,
        field.label.slice(0, width - 6),
        this.attr(
          index === dialog.fieldIndex ? 'controlInactiveTitle' : 'controlActiveTitle',
          index === dialog.fieldIndex ? 0x7f : 0x70,
        ),
      );
      b.set(x + 3, row, field.label[0] ?? ' ', this.attr('controlFirstLetter', 0x7e));
      row++;
      if (field.type === 'checkbox')
        b.text(
          x + 3,
          row,
          ` [${field.value === 'true' ? 'X' : ' '}] `,
          this.attr(
            index === dialog.fieldIndex ? 'clusterSelected' : 'clusterActive',
            index === dialog.fieldIndex ? 0x3f : 0x30,
          ),
        );
      else if (field.type === 'select') {
        b.fill(x + 3, row, width - 6, 1, ' ', this.attr('listActive', 0x30));
        b.text(
          x + 4,
          row,
          `${field.value}  ▼`.slice(0, width - 8),
          this.attr(
            index === dialog.fieldIndex ? 'listSelected' : 'listActive',
            index === dialog.fieldIndex ? 0x2f : 0x30,
          ),
        );
      } else {
        const fieldAttr = this.attr(
          index === dialog.fieldIndex ? 'inputSelectedText' : 'inputNormalText',
          index === dialog.fieldIndex ? 0x1f : 0x1b,
        );
        b.fill(x + 3, row, width - 6, 1, ' ', fieldAttr);
        b.text(x + 3, row, field.value.slice(-(width - 7)), fieldAttr);
        b.text(x + width - 5, row, '▐↓▌', 0x72);
      }
      row++;
    });
    dialog.listTop = row;
    if (dialog.list)
      for (let index = 0; index < Math.min(listHeight - 1, dialog.list.length); index++) {
        const start = Math.max(
          0,
          Math.min(dialog.selected - listHeight + 2, dialog.list.length - listHeight + 1),
        );
        const listIndex = start + index;
        const selected = listIndex === dialog.selected;
        const attr = this.attr(selected ? 'listSelected' : 'listActive', selected ? 0x2f : 0x30);
        b.fill(x + 3, row, width - 6, 1, ' ', attr);
        b.text(x + 4, row++, (dialog.list[listIndex] ?? '').slice(0, width - 8), attr);
      }
    dialog.buttonRects = [];
    let buttonX =
      x +
      Math.floor((width - dialog.buttons.reduce((sum, button) => sum + button.length + 6, 0)) / 2);
    dialog.buttons.forEach((button, index) => {
      const w = button.length + 4;
      dialog.buttonRects.push({ x: buttonX, y: y + height - 3, w, h: 1 });
      const focused =
        typeof document !== 'undefined' &&
        this.dialogMirror?.querySelector(`[data-focus-key="button-${index}"]`) ===
          document.activeElement;
      const role = focused ? 'Selected' : index === 0 ? 'Default' : 'Active';
      b.fill(buttonX, y + height - 3, w, 1, ' ', this.attr('buttonActive', 0x20));
      b.text(
        buttonX + 2,
        y + height - 3,
        button,
        this.attr(`button${role}`, index === 0 ? 0x2b : 0x20),
      );
      if (this.settings.videoMode !== 'monochrome') {
        b.set(buttonX + w, y + height - 3, '▄', normal);
        b.text(buttonX + 1, y + height - 2, '▀'.repeat(w), normal);
      }
      buttonX += w + 2;
    });
  }

  private drawColors(dialog: DialogState): void {
    if (!dialog.colors) return;
    const layout = drawColorDialog(
      this.buffer,
      dialog.colors,
      (key, fallback) => this.attr(key, fallback),
      this.settings.videoMode !== 'monochrome',
    );
    dialog.rect = layout.rect;
    dialog.buttonRects = layout.buttons;
  }

  private async command(command: string): Promise<void> {
    try {
      await this.execute(command);
    } catch (error) {
      this.message('Error', [String(error)]);
    }
    this.dirty = true;
    this.syncInput();
  }

  private async execute(command: string): Promise<void> {
    const editor = this.editor;
    const previousCursor = editor?.cursor;
    const previousText = editor?.text;
    switch (command) {
      case 'repaint':
        this.renderer.setBuffer(this.buffer);
        break;
      case 'menu':
        this.openMenu(this.menuIndex);
        break;
      case 'new': {
        let number = 0;
        let filename: string;
        do {
          filename = `NONAME${String(number++).padStart(2, '0')}.PY`;
        } while (
          this.windows.some((window) => window.editor?.filename === filename) ||
          this.files.some((file) => file.name === filename)
        );
        this.openEditor(filename, '');
        this.focus();
        break;
      }
      case 'open':
        this.openFileDialog();
        break;
      case 'save':
        if (editor) await this.saveEditor(editor);
        break;
      case 'save-all':
        await this.saveAll();
        break;
      case 'save-as':
        if (editor)
          this.openDialog(
            'Save File As',
            [],
            [{ label: 'Name', value: editor.filename }],
            async ([name]) => {
              validateFilename(name);
              const exists = this.files.some(
                (file) => file.name === name && name !== editor.filename,
              );
              const save = async () => {
                editor.filename = name;
                await this.saveEditor(editor);
              };
              if (exists)
                this.openDialog(
                  'Overwrite file?',
                  [`${name} already exists.`],
                  [],
                  async (_values, choice) => {
                    if (choice === 0) await save();
                  },
                  { buttons: ['Overwrite', 'Cancel'] },
                );
              else await save();
            },
          );
        break;
      case 'download':
        if (editor) this.download(editor.filename, editor.text, 'text/x-python');
        break;
      case 'upload':
        this.uploadInput.click();
        break;
      case 'share': {
        const files = this.projectFiles();
        const fragment = encodeShare(
          this.fileMap(),
          editor?.filename ?? files[0]?.name ?? 'main.py',
        );
        const url = `${location.origin}${location.pathname}${fragment}`;
        this.openDialog(
          'Share link',
          ['The program is stored in the URL fragment.', 'Anyone with the link can read its code.'],
          [{ label: 'Link', value: url }],
          async () => {
            try {
              await navigator.clipboard.writeText(url);
              this.announce('Share link copied.');
            } catch {
              this.announce('Select and copy the link.');
            }
          },
          { buttons: ['Copy', 'Close'], width: 68 },
        );
        break;
      }
      case 'directory':
        this.message('Directories', [
          'Project files use relative paths, such as lib/math.py.',
          'The browser workspace is /pyturbo/project.',
          'Use Save as to create a file in a subdirectory.',
        ]);
        break;
      case 'print':
        window.print();
        break;
      case 'quit':
        if (this.windows.some((window) => window.editor?.modified))
          this.openDialog(
            'Quit',
            ['Save changes before quitting?'],
            [],
            async (_values, choice) => {
              if (choice === 0) await this.saveAll();
              this.quit = true;
            },
            { buttons: ['Save', 'Discard', 'Cancel'] },
          );
        else this.quit = true;
        break;
      case 'undo':
        editor?.undo();
        break;
      case 'redo':
        editor?.redo();
        break;
      case 'copy':
        if (editor) {
          this.clipboard = editor.selectedText;
          if (this.clipboard) await navigator.clipboard.writeText(this.clipboard).catch(() => {});
        }
        break;
      case 'cut':
        if (editor?.selectedText) {
          this.clipboard = editor.selectedText;
          await navigator.clipboard.writeText(this.clipboard).catch(() => {});
          editor.replaceSelection('');
        }
        break;
      case 'paste':
        if (editor) {
          let text = this.clipboard;
          try {
            text = await navigator.clipboard.readText();
          } catch {
            if (!text) this.announce('Use Ctrl+V to paste from the system clipboard.');
          }
          if (text) editor.insert(text);
        }
        break;
      case 'clear':
        if (editor) editor.replaceSelection('');
        break;
      case 'example':
        editor?.insert(STARTER);
        break;
      case 'clipboard':
        this.message('Clipboard', this.wrap(this.clipboard || '(empty)', 52));
        break;
      case 'find':
        this.openDialog(
          'Find',
          [],
          [{ label: 'Text to find', value: this.searchQuery }],
          ([query]) => {
            this.searchQuery = query;
            if (!editor?.find(query)) this.announce('Search string not found.');
          },
        );
        break;
      case 'replace':
        this.openDialog(
          'Replace',
          [],
          [
            { label: 'Text to find', value: this.searchQuery },
            { label: 'New text', value: '' },
            { label: 'Replace all', value: 'false', type: 'checkbox' },
          ],
          ([query, replacement, all]) => {
            this.searchQuery = query;
            const count = editor?.replace(query, replacement, all === 'true') ?? 0;
            this.announce(`${count} replacement(s).`);
          },
        );
        break;
      case 'search-again':
        if (this.searchQuery) {
          if (!editor?.find(this.searchQuery)) this.announce('Search string not found.');
        } else await this.execute('find');
        break;
      case 'goto':
        this.openDialog(
          'Go to Line Number',
          [],
          [{ label: 'Line number', value: String((editor?.position.line ?? 0) + 1) }],
          ([line]) => {
            const number = Number(line);
            if (!Number.isInteger(number) || number < 1)
              throw new Error('Enter a positive line number.');
            editor?.goto(number - 1);
          },
        );
        break;
      case 'function': {
        const functions =
          editor?.lines.flatMap((line, index) =>
            /^\s*(?:async\s+)?(?:def|class)\s+/.test(line) ? [`${index + 1}: ${line.trim()}`] : [],
          ) ?? [];
        this.openDialog(
          'Locate Function',
          [],
          [],
          (_values, _choice, selected) => {
            const line = Number(functions[selected]?.split(':')[0]);
            if (line) editor?.goto(line - 1);
          },
          { list: functions.length ? functions : ['No functions or classes'] },
        );
        break;
      }
      case 'previous-error':
        this.errorIndex =
          (this.errorIndex - 1 + this.errors.length) % Math.max(1, this.errors.length);
        this.trackError();
        break;
      case 'next-error':
        this.errorIndex = (this.errorIndex + 1) % Math.max(1, this.errors.length);
        this.trackError();
        break;
      case 'run':
        if (this.runtimeStatus === 'paused') {
          this.runtime.debugCommand('continue', {
            breakpoints: [...(this.breakpoints.get(this.cpu?.filename ?? '') ?? [])],
          });
          this.cpu = undefined;
          this.userScreen = true;
        } else await this.run();
        break;
      case 'trace':
        if (this.runtimeStatus === 'paused') {
          this.runtime.debugCommand('into');
          this.cpu = undefined;
        } else await this.run({ mode: 'into', breakpoints: [] });
        break;
      case 'step':
        if (this.runtimeStatus === 'paused') {
          this.runtime.debugCommand('over');
          this.cpu = undefined;
        } else await this.run({ mode: 'into', breakpoints: [] });
        break;
      case 'go-cursor':
        if (this.runtimeStatus === 'paused') {
          this.runtime.debugCommand('cursor', { cursor: (editor?.position.line ?? 0) + 1 });
          this.cpu = undefined;
        } else
          await this.run({
            mode: 'cursor',
            cursor: (editor?.position.line ?? 0) + 1,
            breakpoints: [],
          });
        break;
      case 'stop':
        this.runtime.stop();
        break;
      case 'reset':
        this.runtime.reset();
        this.cpu = undefined;
        this.userScreen = false;
        this.shell = false;
        break;
      case 'compile':
      case 'make':
        if (editor) {
          this.compileRequested = true;
          this.runtime.compile(this.fileMap(), editor.filename, command === 'make');
          this.announce('Compiling…');
        }
        break;
      case 'arguments':
        this.openDialog(
          'Arguments',
          ['One argument per line; use | to separate them.'],
          [{ label: 'Program arguments', value: this.settings.arguments.join('|') }],
          async ([args]) => {
            this.settings.arguments = args ? args.split('|') : [];
            await this.saveSettings();
          },
        );
        break;
      case 'information':
        this.message('Information', [
          `PyTurbo 0.1.0`,
          `Python ${this.pythonVersion || 'loading'} · Pyodide 314.0.7`,
          `Cross-origin isolated: ${this.runtime.isolated ? 'yes' : 'no'}`,
          `Open files: ${this.windows.filter((window) => window.editor).length}`,
          `Runtime status: ${this.runtimeStatus}`,
          'Packages load on import or through Package manager.',
        ]);
        break;
      case 'remove-messages':
        this.errors = [];
        this.windows = this.windows.filter((window) => window.kind !== 'messages');
        break;
      case 'breakpoint':
        if (editor) {
          const points = this.breakpoints.get(editor.filename) ?? new Set<number>();
          const line = editor.position.line + 1;
          if (points.has(line)) points.delete(line);
          else points.add(line);
          this.breakpoints.set(editor.filename, points);
        }
        break;
      case 'breakpoints': {
        const entries = [...this.breakpoints].flatMap(([name, points]) =>
          [...points].map((line) => `${name}:${line}`),
        );
        this.openDialog(
          'Breakpoints',
          ['Select a breakpoint to remove.'],
          [],
          (_values, _choice, selected) => {
            const entry = entries[selected];
            if (entry) {
              const colon = entry.lastIndexOf(':');
              this.breakpoints.get(entry.slice(0, colon))?.delete(Number(entry.slice(colon + 1)));
            }
          },
          { list: entries.length ? entries : ['No breakpoints'], buttons: ['Remove', 'Cancel'] },
        );
        break;
      }
      case 'add-watch':
        this.openDialog('Add Watch', [], [{ label: 'Expression', value: '' }], ([expression]) => {
          if (expression.trim()) this.watches.push(expression.trim());
          this.refreshWatches();
          this.showWindow('watch');
          const window = this.windows.find((window) => window.kind === 'watch');
          if (window) this.selectWindowRow(window, Math.max(0, this.watches.length - 1));
        });
        break;
      case 'edit-watch': {
        const index = this.windows.find((window) => window.kind === 'watch')?.selected ?? 0;
        this.openDialog(
          'Edit Watch',
          [],
          [{ label: 'Expression', value: this.watches[index] ?? '' }],
          ([expression]) => {
            if (expression.trim()) this.watches[index] = expression.trim();
            this.refreshWatches();
          },
        );
        break;
      }
      case 'delete-watch': {
        const window = this.windows.find((window) => window.kind === 'watch');
        const index = window?.selected ?? 0;
        this.watches.splice(index, 1);
        if (window)
          this.selectWindowRow(window, Math.min(index, Math.max(0, this.watches.length - 1)));
        this.refreshWatches();
        break;
      }
      case 'remove-watches':
        this.watches = [];
        for (const window of this.windows)
          if (window.kind === 'watch') {
            window.selected = 0;
            window.scrollY = 0;
          }
        this.refreshWatches();
        break;
      case 'evaluate':
        this.evaluateDialog(false);
        break;
      case 'inspect':
        this.evaluateDialog(true);
        break;
      case 'stack':
        this.message(
          'Call Stack',
          this.stack.length
            ? this.stack.map((frame) => `${frame.name}  ${frame.filename}:${frame.line}`)
            : ['Start debugging to inspect the call stack.'],
        );
        break;
      case 'debug-options':
        this.message('Debugger', [
          'F7 Trace into · F8 Step over · F4 Go to cursor',
          'Ctrl+F8 Toggle breakpoint · Ctrl+F7 Add watch',
          'Debugging requires cross-origin isolation.',
        ]);
        break;
      case 'packages':
        this.openDialog(
          'Package Manager',
          ['Install a pure Python wheel from PyPI.', 'Built-in Pyodide packages load on import.'],
          [{ label: 'Packages (separated by spaces)', value: '' }],
          ([packages]) => {
            this.runtime.install(packages.split(/\s+/).filter(Boolean));
          },
        );
        break;
      case 'shell':
        this.userScreen = true;
        this.shell = true;
        this.consoleInput = '';
        this.appendOutput(`\nPython ${this.pythonVersion} · PyTurbo shell\n>>> `);
        this.focus();
        break;
      case 'python-docs':
        window.open('https://docs.python.org/3.14/', '_blank', 'noopener,noreferrer');
        break;
      case 'preferences':
        this.preferencesDialog();
        break;
      case 'editor-options':
        this.editorOptions();
        break;
      case 'colors': {
        const values = { ...this.settings.colors };
        this.openDialog(
          'Colors',
          [],
          [],
          async () => {
            this.settings.colors = values;
            await this.saveSettings();
          },
          { buttons: ['OK', 'Cancel', 'Help'], kind: 'colors', colors: values },
        );
        break;
      }
      case 'mouse-options':
        this.openDialog(
          'Mouse',
          [],
          [
            {
              label: 'Text-mode pointer in DOS mode',
              value: String(this.settings.textMouse),
              type: 'checkbox',
            },
          ],
          async ([value]) => {
            this.settings.textMouse = value === 'true';
            await this.saveSettings();
          },
        );
        break;
      case 'desktop-options':
        this.message('Desktop', [
          'Window positions are saved with your settings.',
          'Use Tile, Cascade, Zoom, or Size/Move to arrange them.',
        ]);
        break;
      case 'startup-options':
        this.message('Startup', [
          'The saved desktop is restored on the next visit.',
          'Unsaved new files remain in memory until Save.',
        ]);
        break;
      case 'save-settings':
        await this.saveSettings();
        this.announce('Settings saved.');
        break;
      case 'zoom':
        if (this.active) {
          const window = this.active;
          if (window.restore) {
            window.bounds = window.restore;
            window.restore = undefined;
          } else {
            window.restore = { ...window.bounds };
            window.bounds = { x: 0, y: 1, w: this.buffer.cols, h: this.buffer.rows - 2 };
          }
        }
        break;
      case 'size':
        this.moveMode = !this.moveMode;
        break;
      case 'next':
        if (this.windows.length > 1) {
          const first = this.windows.shift();
          if (first) this.windows.push(first);
        }
        break;
      case 'tile': {
        const count = this.windows.length;
        const cols = Math.ceil(Math.sqrt(count));
        const rows = Math.ceil(count / Math.max(1, cols));
        this.windows.forEach((window, index) => {
          window.bounds = {
            x: Math.floor(((index % cols) * this.buffer.cols) / cols),
            y: 1 + Math.floor((Math.floor(index / cols) * (this.buffer.rows - 2)) / rows),
            w: Math.floor(this.buffer.cols / cols),
            h: Math.floor((this.buffer.rows - 2) / rows),
          };
          this.clamp(window);
          window.restore = undefined;
        });
        break;
      }
      case 'cascade':
        this.windows.forEach((window, index) => {
          const offset = index % 8;
          window.bounds = {
            x: offset * 2,
            y: 1 + offset,
            w: this.buffer.cols - 16,
            h: this.buffer.rows - 10,
          };
          this.clamp(window);
          window.restore = undefined;
        });
        break;
      case 'close':
        await this.closeWindow();
        break;
      case 'close-all':
        this.closeAll();
        break;
      case 'messages':
        this.showWindow('messages');
        break;
      case 'watch':
        this.showWindow('watch');
        break;
      case 'output':
        this.showWindow('output');
        break;
      case 'project':
        this.showWindow('project');
        break;
      case 'notes': {
        const notes = this.files.find((file) => file.name === 'project-notes.txt');
        this.openEditor('project-notes.txt', notes?.content ?? '');
        break;
      }
      case 'windows': {
        const windows = [...this.windows];
        this.openDialog(
          'Window List',
          [],
          [],
          (_values, _choice, selected) => {
            const window = windows[selected];
            if (window) this.activate(window);
          },
          {
            list: windows.map(
              (window) => `${window.id} ${window.editor?.filename ?? window.title}`,
            ),
          },
        );
        break;
      }
      case 'user-screen':
        this.userScreen = !this.userScreen;
        this.focus();
        break;
      case 'project-open':
        this.openFileDialog(true);
        break;
      case 'project-close':
        this.closeAll();
        break;
      case 'project-delete':
        if (editor)
          this.openDialog(
            'Delete Project Item',
            [
              `Remove ${editor.filename} from browser storage?`,
              'Download a copy first if you need to keep it.',
            ],
            [],
            async () => {
              await this.store.deleteFile(editor.filename);
              this.files = this.files.filter((file) => file.name !== editor.filename);
              this.windows = this.windows.filter((window) => window.editor !== editor);
            },
            { buttons: ['Delete', 'Cancel'] },
          );
        break;
      case 'imports':
        this.message(
          'Include Files',
          this.projectFiles()
            .flatMap((file) =>
              file.content
                .split('\n')
                .filter((line) => /^\s*(?:from\s+\S+\s+import|import\s+)/.test(line))
                .map((line) => `${file.name}: ${line.trim()}`),
            )
            .slice(0, 14),
        );
        break;
      case 'help':
      case 'help-index':
        this.showWindow('help', HELP);
        break;
      case 'help-on-help':
        this.message('Help on Help', [
          'F1 opens Help. F10 opens the menus.',
          'Use the mouse to move/resize windows.',
          'Alt+F3 closes the active window.',
          'Browser shortcuts may require DOS mode.',
        ]);
        break;
      case 'topic-help': {
        const word =
          editor?.lines[editor.position.line]
            ?.slice(0, editor.position.col)
            .match(/[A-Za-z_]\w*$/)?.[0] ?? '';
        window.open(
          `https://docs.python.org/3.14/search.html?q=${encodeURIComponent(word)}`,
          '_blank',
          'noopener,noreferrer',
        );
        break;
      }
      case 'about':
        this.message('About', [
          'PyTurbo',
          'Version 0.1.0',
          "Code Python like it's 1992.",
          '',
          'MIT · github.com/abhay-yemekar/pyturbo',
          'Font © VileR, int10h.org · CC BY-SA 4.0',
          '',
          'PyTurbo is an independent project, not affiliated',
          'with Borland or Embarcadero. Turbo C++ is a',
          'trademark of its owner.',
        ]);
        break;
      case 'dos-mode':
        await this.dosMode();
        break;
      default:
        this.announce('This command is not implemented in this version.');
    }
    if (
      this.editor &&
      (this.editor !== editor ||
        this.editor.cursor !== previousCursor ||
        this.editor.text !== previousText)
    )
      this.keepCursorVisible();
    this.focus();
  }

  private projectFiles(): WorkspaceFile[] {
    const files = new Map(this.files.map((file) => [file.name, file]));
    for (const window of this.windows)
      if (window.editor)
        files.set(window.editor.filename, {
          name: window.editor.filename,
          content: window.editor.text,
          updatedAt: Date.now(),
        });
    return [...files.values()];
  }
  private fileMap(): Record<string, string> {
    return Object.fromEntries(this.projectFiles().map((file) => [file.name, file.content]));
  }
  private async saveEditor(editor: EditorBuffer): Promise<void> {
    const file: WorkspaceFile = {
      name: validateFilename(editor.filename),
      content: editor.text,
      updatedAt: Date.now(),
    };
    await this.store.saveFile(file);
    this.files = [...this.files.filter((entry) => entry.name !== file.name), file];
    editor.markSaved();
    this.persistDesktop();
    this.announce(`${file.name} saved.`);
  }
  private async saveAll(): Promise<void> {
    for (const window of this.windows) if (window.editor) await this.saveEditor(window.editor);
  }
  private persistDesktop(): void {
    this.settings.desktop = this.windows.flatMap((window) =>
      window.editor ? [{ filename: window.editor.filename, ...window.bounds }] : [],
    );
    void this.store
      .saveSettings(this.settings)
      .catch((error: unknown) => this.announce(`Settings could not be saved: ${String(error)}`));
  }
  private async saveSettings(): Promise<void> {
    this.persistDesktop();
    await this.store.saveSettings(this.settings);
  }
  private download(filename: string, content: string, type: string): void {
    const url = URL.createObjectURL(new Blob([content], { type }));
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 10_000);
  }
  private async upload(): Promise<void> {
    for (const file of this.uploadInput.files ?? []) {
      if (file.size > 5 * 1024 * 1024) throw new Error(`${file.name} is larger than 5 MiB.`);
      const content = await file.text();
      const name = validateFilename(file.name);
      const existing = this.windows.find((window) => window.editor?.filename === name);
      if (existing?.editor) {
        this.openDialog(
          'Replace Open File',
          [`${name} is already open. Replace its contents?`],
          [],
          () => {
            existing.editor?.setText(content, true);
            this.activate(existing);
          },
          { buttons: ['Replace', 'Cancel'] },
        );
      } else this.openEditor(name, content, true);
    }
    this.uploadInput.value = '';
    this.dirty = true;
  }
  private openFileDialog(project = false): void {
    const files = [...this.files];
    this.openDialog(
      project ? 'Open Project' : 'Open a File',
      ['Browser workspace · /pyturbo/project'],
      [{ label: 'Name', value: '*.py' }],
      ([name], _choice, selected) => {
        if (project) {
          for (const file of files) this.openEditor(file.name, file.content);
          this.showWindow('project');
          return;
        }
        const file =
          name === '*.py' || !name ? files[selected] : files.find((file) => file.name === name);
        if (!file) throw new Error('File not found. Use Upload to open a file from your device.');
        this.openEditor(file.name, file.content);
      },
      {
        list: files.length
          ? files.map((file) => file.name)
          : ['No saved files — use File › Upload'],
        width: 64,
      },
    );
  }
  private async closeWindow(): Promise<void> {
    const window = this.active;
    if (!window) return;
    const close = () => {
      this.windows = this.windows.filter((entry) => entry !== window);
      this.persistDesktop();
      this.syncInput();
      this.dirty = true;
    };
    if (window.editor?.modified)
      this.openDialog(
        'Save File',
        [`Save changes to ${window.editor.filename}?`],
        [],
        async (_values, choice) => {
          if (choice === 0 && window.editor) await this.saveEditor(window.editor);
          close();
        },
        { buttons: ['Save', 'Discard', 'Cancel'] },
      );
    else close();
  }
  private closeAll(): void {
    const close = () => {
      this.windows = [];
      this.persistDesktop();
      this.dirty = true;
    };
    if (this.windows.some((window) => window.editor?.modified))
      this.openDialog(
        'Close All',
        ['Save changes to all modified files?'],
        [],
        async (_values, choice) => {
          if (choice === 0) await this.saveAll();
          close();
        },
        { buttons: ['Save', 'Discard', 'Cancel'] },
      );
    else close();
  }
  private showWindow(kind: WindowKind, content?: string[]): void {
    const existing = this.windows.find((window) => window.kind === kind);
    if (existing) {
      if (content) existing.content = content;
      this.activate(existing);
      return;
    }
    const title = {
      editor: 'Editor',
      messages: 'Message',
      watch: 'Watch',
      output: 'Output',
      help: 'Help',
      project: 'Project',
      notes: 'Project notes',
    }[kind];
    const bounds =
      kind === 'help'
        ? { x: 8, y: 3, w: this.buffer.cols - 16, h: this.buffer.rows - 6 }
        : { x: 2, y: Math.max(2, this.buffer.rows - 10), w: this.buffer.cols - 4, h: 8 };
    const window = { id: this.nextId++, kind, title, content, bounds };
    this.clamp(window);
    this.windows.push(window);
    this.dirty = true;
  }
  private trackError(): void {
    const error = this.errors[this.errorIndex];
    if (!error) return;
    const file = this.projectFiles().find((file) => file.name === error.filename);
    if (!file) return;
    const window = this.openEditor(file.name, file.content);
    window.editor?.goto(error.line - 1, error.column - 1);
    this.keepCursorVisible();
    this.dirty = true;
  }
  private preferencesDialog(): void {
    this.openDialog(
      'Preferences',
      [],
      [
        {
          label: 'Screen fit',
          value: this.settings.screenMode,
          type: 'select',
          options: ['exact', 'fill'],
        },
        {
          label: 'Lines',
          value: String(this.settings.rows),
          type: 'select',
          options: ['25', '43', '50'],
        },
        {
          label: 'Video mode',
          value: this.settings.videoMode,
          type: 'select',
          options: ['color', 'lcd', 'monochrome', 'high-contrast'],
        },
        { label: 'Pause after run', value: String(this.settings.pauseAfterRun), type: 'checkbox' },
        {
          label: 'Classic yellow identifiers',
          value: String(this.settings.identifierColor === 'yellow'),
          type: 'checkbox',
        },
        { label: 'Red stderr', value: String(this.settings.stderrColor), type: 'checkbox' },
      ],
      async ([mode, rows, video, pause, yellow, stderr]) => {
        this.settings.screenMode = mode as WorkspaceSettings['screenMode'];
        this.settings.rows = Number(rows) as 25 | 43 | 50;
        this.settings.videoMode = video as WorkspaceSettings['videoMode'];
        this.settings.pauseAfterRun = pause === 'true';
        this.settings.identifierColor = yellow === 'true' ? 'yellow' : 'green';
        this.settings.stderrColor = stderr === 'true';
        await this.saveSettings();
        this.fit();
      },
    );
  }
  private editorOptions(): void {
    this.openDialog(
      'Editor',
      [],
      [
        { label: 'Tab size (1–16)', value: String(this.settings.tabSize) },
        { label: 'Auto indent', value: String(this.settings.autoIndent), type: 'checkbox' },
        {
          label: 'CUA keys (Ctrl+C/X/V/Z)',
          value: String(this.settings.cuaKeys),
          type: 'checkbox',
        },
      ],
      async ([tab, indent, cua]) => {
        const size = Number(tab);
        if (!Number.isInteger(size) || size < 1 || size > 16)
          throw new Error('Tab size must be between 1 and 16.');
        this.settings.tabSize = size;
        this.settings.autoIndent = indent === 'true';
        this.settings.cuaKeys = cua === 'true';
        for (const window of this.windows)
          if (window.editor) {
            window.editor.tabSize = size;
            window.editor.autoIndent = indent === 'true';
            window.editor.cuaKeys = cua === 'true';
          }
        await this.saveSettings();
      },
    );
  }
  private evaluateDialog(inspect: boolean): void {
    if (this.runtimeStatus !== 'paused') {
      this.message(inspect ? 'Inspect' : 'Evaluate/Modify', [
        'Pause in the debugger to evaluate an expression.',
        ...Object.entries(this.locals)
          .slice(0, 8)
          .map(([name, value]) => `${name}: ${value}`),
      ]);
      return;
    }
    this.openDialog(
      inspect ? 'Inspect' : 'Evaluate/Modify',
      [],
      [
        { label: 'Expression', value: '' },
        ...(inspect
          ? []
          : [{ label: 'Execute statement (modify)', value: 'false', type: 'checkbox' as const }]),
      ],
      ([expression, modify]) =>
        this.runtime.debugCommand('evaluate', { expression, modify: modify === 'true' }),
    );
  }
  private refreshWatches(): void {
    if (this.runtimeStatus === 'paused')
      this.runtime.debugCommand('watches', { watches: this.watches });
    this.dirty = true;
  }

  private async run(debug?: DebugOptions): Promise<void> {
    const editor = this.editor;
    if (!editor || this.runtime.running) return;
    if (!this.runtime.isolated) {
      this.openDialog(
        'Program input',
        [
          'Live input is unavailable without COOP/COEP.',
          'Enter stdin lines separated with | before Run.',
        ],
        [{ label: 'Program input', value: '' }],
        async ([input]) => {
          await this.saveAll();
          this.beginRun(debug, input.replaceAll('|', '\n'));
        },
      );
      return;
    }
    await this.saveAll();
    this.pendingRun = debug ?? 'normal';
    this.runtime.compile(this.fileMap(), editor.filename);
  }
  private beginRun(debug?: DebugOptions, stdin?: string): void {
    const editor = this.editor;
    if (!editor) return;
    const points = [...(this.breakpoints.get(editor.filename) ?? [])];
    const options = debug
      ? { ...debug, breakpoints: points, watches: this.watches }
      : points.length
        ? { mode: 'continue' as const, breakpoints: points, watches: this.watches }
        : undefined;
    this.userScreen = true;
    this.shell = false;
    this.inputWaiting = false;
    this.consoleInput = '';
    this.cpu = undefined;
    this.errors = [];
    this.pausedAfterRun = false;
    this.plot?.remove();
    this.plot = undefined;
    this.graphic?.remove();
    this.graphic = undefined;
    this.runtime.run(this.fileMap(), editor.filename, this.settings.arguments, options, stdin);
    this.syncInput();
    this.focus();
    this.dirty = true;
  }
  private runtimeEvent(event: RuntimeEvent): void {
    switch (event.type) {
      case 'ready':
        this.pythonVersion = event.version;
        this.runtimeStatus = 'ready';
        this.announce(`Python ${event.version} ready`);
        break;
      case 'status':
        this.runtimeStatus = event.status;
        this.status = event.message;
        this.statusMirror.textContent = `${event.status}: ${event.message}`;
        break;
      case 'stdout':
        this.appendOutput(event.text);
        break;
      case 'stderr':
        this.appendOutput(event.text, this.settings.stderrColor ? 0x0c : 0x07);
        break;
      case 'input':
        this.inputWaiting = true;
        this.singleKeyInput = !!event.singleKey;
        this.userScreen = true;
        this.consoleInput = '';
        this.runtimeStatus = 'input';
        this.announce(event.singleKey ? 'Program waiting for a key' : 'Program waiting for input');
        this.syncInput();
        this.focus();
        break;
      case 'complete':
        this.inputWaiting = false;
        this.cpu = undefined;
        this.singleKeyInput = false;
        this.consoleInput = '';
        if (!this.shell) {
          this.pausedAfterRun = this.settings.pauseAfterRun;
          if (this.pausedAfterRun) this.appendOutput('\nPress any key…');
          this.userScreen = this.pausedAfterRun;
        }
        this.syncInput();
        this.focus();
        break;
      case 'errors':
        this.errors = event.entries;
        this.errorIndex = 0;
        this.showWindow('messages');
        this.announce(event.entries[0]?.message ?? event.text);
        break;
      case 'compiled': {
        this.errors = event.entries;
        this.errorIndex = 0;
        if (this.pendingRun && event.ok) {
          const debug = this.pendingRun;
          this.pendingRun = undefined;
          this.beginRun(debug === 'normal' ? undefined : debug);
        } else if (this.compileRequested || !event.ok) {
          this.pendingRun = undefined;
          this.compileRequested = false;
          if (event.entries.length) this.showWindow('messages');
          this.openDialog(
            'Compiling',
            [
              `Main file: ${this.editor?.filename ?? ''}`,
              `Compiling: EDITOR → ${this.editor?.filename ?? ''}`,
              '',
              `Lines compiled: ${event.lines}`,
              `Warnings: ${event.warnings}    Errors: ${event.entries.filter((entry) => entry.severity === 'error').length}`,
              '',
              `${event.ok ? 'Success' : 'Errors'} : Press any key`,
            ],
            [],
            () => {
              if (!event.ok) this.trackError();
            },
            { buttons: ['OK'] },
          );
        }
        break;
      }
      case 'paused': {
        this.cpu = { filename: event.filename, line: event.line };
        this.locals = event.locals;
        this.stack = event.stack;
        this.watchValues = event.watches;
        this.runtimeStatus = 'paused';
        this.userScreen = false;
        const file = this.projectFiles().find((file) => file.name === event.filename);
        if (file) this.openEditor(file.name, file.content).editor?.goto(event.line - 1);
        this.keepCursorVisible();
        this.announce(`Paused ${event.filename}:${event.line}`);
        this.syncInput();
        this.focus();
        break;
      }
      case 'evaluated':
        this.message('Evaluate', [`${event.expression} = ${event.value}`]);
        break;
      case 'graphics':
        this.graphics(event.command, event.args);
        break;
      case 'plot':
        if (!this.plot) {
          this.plot = document.createElement('img');
          this.plot.className = 'plot';
          this.plot.alt = 'Python matplotlib plot';
          this.stage.append(this.plot);
        }
        this.plot.src = event.data;
        break;
      case 'repl':
        this.appendOutput(event.more ? '... ' : '>>> ');
        this.runtimeStatus = 'ready';
        this.focus();
        break;
    }
    this.dirty = true;
  }
  private appendOutput(text: string, attr = this.consoleAttr): void {
    for (const ch of text) {
      let current = this.output.at(-1);
      if (!current) {
        current = { text: '', attr };
        this.output.push(current);
      }
      if (ch === '\r') {
        current.text = '';
        continue;
      }
      if (ch === '\n') {
        this.output.push({ text: '', attr });
        continue;
      }
      if (current.text.length >= this.buffer.cols) {
        current = { text: '', attr };
        this.output.push(current);
      }
      current.text += ch === '\t' ? '    ' : ch;
      current.attr = attr;
    }
    if (this.output.length > 2000) this.output.splice(0, this.output.length - 2000);
    this.outputMirror.textContent = this.output.map((line) => line.text).join('\n');
    this.dirty = true;
  }
  private graphics(command: string, args: unknown[]): void {
    const values = args.map(Number);
    if (command.startsWith('console.')) {
      if (command === 'console.clear') this.output = [{ text: '', attr: this.consoleAttr }];
      if (command === 'console.color')
        this.consoleAttr = (this.consoleAttr & 0xf0) | (values[0] & 15);
      if (command === 'console.background')
        this.consoleAttr = (this.consoleAttr & 15) | ((values[0] & 15) << 4);
      if (command === 'console.cursor') {
        const row = Math.max(0, values[1] - 1);
        while (this.output.length <= row) this.output.push({ text: '', attr: this.consoleAttr });
        this.output = this.output.slice(0, row + 1);
        this.output[row].text = this.output[row].text
          .slice(0, values[0] - 1)
          .padEnd(values[0] - 1, ' ');
      }
      this.outputMirror.textContent = this.output.map((line) => line.text).join('\n');
      return;
    }
    if (command === 'close') {
      this.graphic?.remove();
      this.graphic = undefined;
      return;
    }
    if (!this.graphic) {
      this.graphic = document.createElement('canvas');
      this.graphic.className = 'graphics-canvas';
      this.graphic.width = 640;
      this.graphic.height = 480;
      this.graphic.setAttribute('role', 'img');
      this.graphic.setAttribute('aria-label', 'Python graphics output');
      this.stage.append(this.graphic);
    }
    const context = this.graphic.getContext('2d');
    if (!context) return;
    if (command === 'init' || command === 'clear') {
      context.fillStyle = VGA_PALETTE[command === 'clear' ? values[0] % 16 : 0];
      context.fillRect(0, 0, 640, 480);
      return;
    }
    this.graphicColor = values.at(-1) ?? this.graphicColor;
    context.strokeStyle = VGA_PALETTE[this.graphicColor % 16];
    context.fillStyle = context.strokeStyle;
    context.lineWidth = 1;
    if (command === 'line') {
      context.beginPath();
      context.moveTo(values[0], values[1]);
      context.lineTo(values[2], values[3]);
      context.stroke();
    }
    if (command === 'circle') {
      context.beginPath();
      context.arc(values[0], values[1], Math.abs(values[2]), 0, Math.PI * 2);
      context.stroke();
    }
    if (command === 'rectangle')
      context.strokeRect(values[0], values[1], values[2] - values[0], values[3] - values[1]);
    if (command === 'bar')
      context.fillRect(values[0], values[1], values[2] - values[0], values[3] - values[1]);
    if (command === 'pixel') context.fillRect(values[0], values[1], 1, 1);
    if (command === 'text') {
      context.font = '16px "PyTurbo VGA"';
      context.fillText(String(args[2]), values[0], values[1] + 16);
    }
  }
  private async dosMode(): Promise<void> {
    if (document.fullscreenElement) {
      await document.exitFullscreen();
      return;
    }
    await this.root.requestFullscreen();
    const keyboard = (
      navigator as Navigator & { keyboard?: { lock(keys?: string[]): Promise<void> } }
    ).keyboard;
    try {
      await keyboard?.lock();
    } catch {
      this.announce(
        'Fullscreen enabled. Keyboard Lock is unavailable; use menus for reserved shortcuts.',
      );
    }
    this.focus();
    this.fit();
  }

  private keydown(event: KeyboardEvent): void {
    if (event.isComposing || this.composing) return;
    const key = event.key;
    const lower = key.toLowerCase();
    const control = event.ctrlKey || event.metaKey;
    const handle = (command: string) => {
      event.preventDefault();
      void this.command(command);
    };
    if (this.quit) {
      event.preventDefault();
      this.quit = false;
      this.focus();
      this.dirty = true;
      return;
    }
    if (this.dialog) {
      const dialog = this.dialog;
      if (key === 'Escape') {
        event.preventDefault();
        this.dismissDialog();
        this.restoreDialogFocus();
        return;
      }
      if (key === 'Tab') {
        event.preventDefault();
        const controls = [
          ...this.dialogMirror.querySelectorAll<HTMLElement>(
            'input:not([disabled]), select:not([disabled]), button:not([disabled])',
          ),
        ];
        const index = controls.indexOf(document.activeElement as HTMLElement);
        const next =
          index < 0
            ? event.shiftKey
              ? controls.length - 1
              : 0
            : (index + (event.shiftKey ? -1 : 1) + controls.length) % controls.length;
        controls[next]?.focus({ preventScroll: true });
        return;
      }
      if (dialog.kind === 'colors') {
        this.colorKey(event);
        return;
      }
      if (key === 'F1') {
        event.preventDefault();
        this.announce('Tab moves between controls. Enter accepts. Escape cancels.');
        return;
      }
      if (dialog.title === 'Compiling' && !['Tab', 'Shift', 'Control', 'Alt'].includes(key)) {
        event.preventDefault();
        this.submitDialog(0);
      }
      if (
        key === 'Enter' &&
        !(event.target instanceof HTMLButtonElement) &&
        !(event.target instanceof HTMLSelectElement && event.target.size <= 1)
      ) {
        event.preventDefault();
        this.submitDialog(0);
      }
      return;
    }
    if (event.altKey && /^\d$/.test(key)) {
      event.preventDefault();
      if (key === '0') handle('windows');
      else {
        const window = this.windows.find((window) => window.id === Number(key));
        if (window) this.activate(window);
      }
      return;
    }
    const shortcuts: Record<string, string> = {
      F1: 'help',
      'Shift+F1': 'help-index',
      'Control+F1': 'topic-help',
      'Alt+F1': 'help',
      F2: 'save',
      F3: 'open',
      'Alt+F3': 'close',
      'Control+F2': 'reset',
      F4: 'go-cursor',
      'Alt+F4': 'inspect',
      'Control+F4': 'evaluate',
      'Control+F3': 'stack',
      F5: 'zoom',
      'Alt+F5': 'user-screen',
      'Control+F5': 'size',
      F6: 'next',
      F7: 'trace',
      F8: 'step',
      'Control+F7': 'add-watch',
      'Control+F8': 'breakpoint',
      'Alt+F7': 'previous-error',
      'Alt+F8': 'next-error',
      F9: 'make',
      'Control+F9': 'run',
      'Alt+F9': 'compile',
      F10: 'menu',
      'Alt+x': 'quit',
    };
    const chord = `${event.altKey ? 'Alt+' : control ? 'Control+' : event.shiftKey ? 'Shift+' : ''}${key.startsWith('F') ? key : lower}`;
    const shortcut = shortcuts[chord];
    if (shortcut) {
      handle(shortcut);
      return;
    }
    if (event.altKey) {
      const index = menus.findIndex((menu) => hotkey(menu.label) === lower);
      if (index >= 0) {
        event.preventDefault();
        this.openMenu(index);
        return;
      }
    }
    if (
      event.target instanceof HTMLElement &&
      event.target !== this.input &&
      event.target.closest('button, a[href], input, select, textarea, [contenteditable="true"]')
    )
      return;
    if (this.menuFocused || this.menuStack.length) {
      this.menuKey(event);
      return;
    }
    if (this.moveMode && this.active) {
      event.preventDefault();
      if (key === 'Escape' || key === 'Enter') this.moveMode = false;
      const r = this.active.bounds;
      const dx = key === 'ArrowLeft' ? -1 : key === 'ArrowRight' ? 1 : 0;
      const dy = key === 'ArrowUp' ? -1 : key === 'ArrowDown' ? 1 : 0;
      if (event.shiftKey) {
        r.w += dx;
        r.h += dy;
      } else {
        r.x += dx;
        r.y += dy;
      }
      this.clamp(this.active);
      this.dirty = true;
      return;
    }
    if (this.userScreen) {
      if (this.inputWaiting && this.singleKeyInput && (key.length === 1 || key === 'Enter')) {
        event.preventDefault();
        this.runtime.input(key === 'Enter' ? '\n' : key);
        this.inputWaiting = false;
        this.singleKeyInput = false;
        return;
      }
      if (key === 'Escape' && this.shell) {
        event.preventDefault();
        this.userScreen = false;
        this.shell = false;
        this.syncInput();
        this.dirty = true;
        return;
      }
      if (key === 'Enter' && (this.inputWaiting || this.shell)) {
        event.preventDefault();
        const value = this.consoleInput;
        this.consoleInput = '';
        this.appendOutput(`${value}\n`);
        if (this.inputWaiting) {
          this.inputWaiting = false;
          this.runtime.input(value);
        } else this.runtime.repl(value);
        this.syncInput();
        this.dirty = true;
        return;
      }
      if (!this.inputWaiting && !this.shell && !this.runtime.running) {
        event.preventDefault();
        this.userScreen = false;
        this.pausedAfterRun = false;
        this.syncInput();
        this.dirty = true;
      }
      return;
    }
    if (this.active && !this.active.editor) {
      const active = this.active;
      const lines = this.windowLines(active);
      const page = Math.max(1, active.bounds.h - 2);
      const selectable = ['watch', 'project', 'messages'].includes(active.kind);
      const selected = active.kind === 'messages' ? this.errorIndex : (active.selected ?? 0);
      const delta =
        key === 'ArrowUp'
          ? -1
          : key === 'ArrowDown'
            ? 1
            : key === 'PageUp'
              ? -page
              : key === 'PageDown'
                ? page
                : 0;
      if (delta || key === 'Home' || key === 'End') {
        event.preventDefault();
        if (selectable)
          this.selectWindowRow(
            active,
            key === 'Home' ? 0 : key === 'End' ? lines.length - 1 : selected + delta,
          );
        else
          this.scrollWindow(
            active,
            key === 'Home' ? -lines.length : key === 'End' ? lines.length : delta,
          );
        return;
      }
      if (active.kind === 'project' && key === 'Enter') {
        event.preventDefault();
        const file = this.projectFiles()[selected];
        if (file) this.openEditor(file.name, file.content);
        this.focus();
        return;
      }
    }
    if (this.active?.kind === 'messages') {
      if (key === 'Enter' || key === ' ') {
        event.preventDefault();
        this.trackError();
        return;
      }
    }
    if (this.active?.kind === 'watch' && key === 'Insert') {
      handle('add-watch');
      return;
    }
    if (this.active?.kind === 'watch' && key === 'Delete') {
      handle('delete-watch');
      return;
    }
    if (this.active?.kind === 'watch' && key === 'Enter') {
      handle('edit-watch');
      return;
    }
    if (this.editor) {
      if (control && key === 'Insert') {
        handle('copy');
        return;
      }
      if (event.shiftKey && key === 'Delete') {
        handle('cut');
        return;
      }
      if (!control && (key === 'PageUp' || key === 'PageDown')) {
        event.preventDefault();
        this.editor.page(
          (key === 'PageUp' ? -1 : 1) * ((this.active?.bounds.h ?? 21) - 2),
          event.shiftKey,
        );
        this.keepCursorVisible();
        this.syncInput();
        this.dirty = true;
        return;
      }
      const previousEditor = this.editor;
      const previousCursor = previousEditor.cursor;
      const previousText = previousEditor.text;
      if (previousEditor.handleKey(event)) {
        event.preventDefault();
        const command = this.editor.pendingCommand;
        if (command === 'write-block')
          this.download('block.py', this.editor.selectedText, 'text/x-python');
        else if (command === 'read-block')
          this.openDialog(
            'Read Block',
            [],
            [],
            (_values, _choice, selected) => {
              const file = this.files[selected];
              if (file) this.editor?.insert(file.content);
            },
            { list: this.files.map((file) => file.name) },
          );
        else if (command) void this.command(command);
        if (
          this.editor &&
          (this.editor !== previousEditor ||
            this.editor.cursor !== previousCursor ||
            this.editor.text !== previousText)
        )
          this.keepCursorVisible();
        else this.scrollWindow(this.active, 0);
        this.syncInput();
        this.dirty = true;
      }
    }
  }

  private menuKey(event: KeyboardEvent): void {
    event.preventDefault();
    const key = event.key;
    const menu = this.menuStack.at(-1);
    if (key === 'Escape') {
      if (this.menuStack.length > 1) this.menuStack.pop();
      else {
        this.menuStack = [];
        this.menuFocused = false;
        this.focus();
      }
    } else if (key === 'ArrowLeft') {
      if (this.menuStack.length > 1) this.menuStack.pop();
      else this.openMenu(this.menuIndex - 1);
    } else if (key === 'ArrowRight') {
      if (menu?.items[menu.selected]?.children) this.chooseMenuItem();
      else this.openMenu(this.menuIndex + 1);
    } else if (key === 'Enter') this.chooseMenuItem();
    else if ((key === 'ArrowDown' || key === 'ArrowUp') && menu) {
      do {
        menu.selected =
          (menu.selected + (key === 'ArrowDown' ? 1 : -1) + menu.items.length) % menu.items.length;
      } while (menu.items[menu.selected].label === '-');
    } else if (key === 'Home' && menu) menu.selected = 0;
    else if (key === 'End' && menu) menu.selected = menu.items.length - 1;
    else if (key.length === 1 && menu) {
      const index = menu.items.findIndex((item) => hotkey(item.label) === key.toLowerCase());
      if (index >= 0) {
        menu.selected = index;
        this.chooseMenuItem();
      }
    }
    this.dirty = true;
  }

  private scrollWindow(window: IdeWindow | undefined, amount: number): void {
    if (!window) return;
    const length = window.editor
      ? this.editorLayout(window.editor).lines.length
      : this.windowLines(window).length;
    const max = Math.max(0, length - (window.bounds.h - 2));
    if (window.editor)
      window.editor.scrollY = Math.max(0, Math.min(max, window.editor.scrollY + amount));
    else window.scrollY = Math.max(0, Math.min(max, (window.scrollY ?? 0) + amount));
    this.dirty = true;
  }

  private selectWindowRow(window: IdeWindow, index: number): void {
    const lines = this.windowLines(window);
    if (!lines.length) return;
    const selected = Math.max(0, Math.min(lines.length - 1, index));
    window.selected = selected;
    if (window.kind === 'messages') this.errorIndex = selected;
    const top = window.scrollY ?? 0;
    const visible = Math.max(1, window.bounds.h - 2);
    if (selected < top) window.scrollY = selected;
    if (selected >= top + visible) window.scrollY = selected - visible + 1;
    this.announce(lines[selected]);
  }

  private point(event: MouseEvent): { x: number; y: number } {
    const rect = this.canvas.getBoundingClientRect();
    return {
      x: Math.floor(((event.clientX - rect.left) / rect.width) * this.buffer.cols),
      y: Math.floor(((event.clientY - rect.top) / rect.height) * this.buffer.rows),
    };
  }
  private contains(rect: Rect, x: number, y: number): boolean {
    return x >= rect.x && x < rect.x + rect.w && y >= rect.y && y < rect.y + rect.h;
  }
  private pointerDown(event: PointerEvent): void {
    if (event.button !== 0) return;
    const { x, y } = this.point(event);
    this.canvas.setPointerCapture(event.pointerId);
    if (this.quit) {
      this.quit = false;
      this.dirty = true;
      this.focus();
      return;
    }
    if (this.userScreen) {
      this.focus();
      if (!this.inputWaiting && !this.shell && !this.runtime.running) {
        this.userScreen = false;
        this.syncInput();
        this.dirty = true;
      }
      return;
    }
    if (this.dialog) {
      const dialog = this.dialog;
      const r = dialog.rect;
      this.focus();
      if (y === r.y && x >= r.x + 2 && x <= r.x + 4) {
        this.dismissDialog();
        this.restoreDialogFocus();
        return;
      }
      const button = dialog.buttonRects.findIndex((rect) => this.contains(rect, x, y));
      if (button >= 0) {
        this.submitDialog(button);
        return;
      }
      if (dialog.kind === 'colors') {
        this.colorPointer(x, y);
      } else {
        const index = dialog.fieldRows.findIndex((row) => y === row || y === row + 1);
        if (index >= 0) {
          dialog.fieldIndex = index;
          const field = dialog.fields[index];
          if (field.type === 'checkbox') field.value = String(field.value !== 'true');
          if (field.type === 'select') {
            const options = field.options ?? [];
            field.value = options[(options.indexOf(field.value) + 1) % options.length] ?? '';
          }
          this.syncDialogMirror();
          const controls = this.dialogMirror.querySelectorAll<HTMLInputElement | HTMLSelectElement>(
            'input, select',
          );
          controls[index]?.focus();
          if (controls[index] instanceof HTMLInputElement && field.type !== 'checkbox')
            (controls[index] as HTMLInputElement).select();
        }
        if (dialog.list && y >= dialog.listTop && y < dialog.listTop + 7) {
          const height = Math.min(7, Math.max(2, dialog.list.length));
          const start = Math.max(
            0,
            Math.min(dialog.selected - height + 1, dialog.list.length - height),
          );
          dialog.selected = Math.min(dialog.list.length - 1, start + y - dialog.listTop);
          const list =
            this.dialogMirror.querySelector<HTMLSelectElement>('[data-focus-key="list"]');
          if (list) {
            list.selectedIndex = dialog.selected;
            list.focus({ preventScroll: true });
          }
        }
      }
      this.dirty = true;
      return;
    }
    if (y === 0) {
      let selected = -1;
      menus.forEach((menu, index) => {
        if (x >= this.menuX(index) && x < this.menuX(index) + plain(menu.label).length + 2)
          selected = index;
      });
      if (selected >= 0) this.openMenu(selected);
      return;
    }
    if (this.menuStack.length) {
      const menu = [...this.menuStack]
        .reverse()
        .find(
          (menu) =>
            x >= menu.x &&
            x < menu.x + menu.width &&
            y > menu.y &&
            y < menu.y + menu.items.length + 1,
        );
      if (menu) {
        this.menuStack = this.menuStack.slice(0, this.menuStack.indexOf(menu) + 1);
        menu.selected = y - menu.y - 1;
        this.chooseMenuItem();
      } else {
        this.menuStack = [];
        this.menuFocused = false;
      }
      this.dirty = true;
      return;
    }
    const window = [...this.windows].reverse().find((window) => this.contains(window.bounds, x, y));
    if (!window) {
      this.focus();
      return;
    }
    this.activate(window);
    const r = window.bounds;
    if (y === r.y) {
      if (x >= r.x + 2 && x <= r.x + 4) {
        void this.command('close');
        return;
      }
      if (x >= r.x + r.w - 5 && x <= r.x + r.w - 3) {
        void this.command('zoom');
        return;
      }
      this.drag = { mode: 'move', x, y, bounds: { ...r } };
    } else if (x === r.x + r.w - 1 && y > r.y && y < r.y + r.h - 1) {
      const length = window.editor
        ? this.editorLayout(window.editor).lines.length
        : this.windowLines(window).length;
      const max = Math.max(0, length - (r.h - 2));
      const offset = window.editor?.scrollY ?? window.scrollY ?? 0;
      if (max > 0) {
        const trackLength = r.h - 4;
        const thumb = r.y + 2 + Math.round((offset / max) * Math.max(0, trackLength - 1));
        if (y === r.y + 1 || y === r.y + r.h - 2) this.scrollWindow(window, y === r.y + 1 ? -1 : 1);
        else if (y === thumb) this.drag = { mode: 'scroll-y', x, y, bounds: { ...r }, offset };
        else this.scrollWindow(window, y < thumb ? -(r.h - 2) : r.h - 2);
      }
    } else if (
      window.editor &&
      r.w > 24 &&
      y === r.y + r.h - 1 &&
      x >= r.x + 18 &&
      x <= r.x + r.w - 3
    ) {
      const editor = window.editor;
      const max = Math.max(0, this.editorLayout(editor).maxWidth - (r.w - 2));
      if (max > 0) {
        const trackLength = r.w - 22;
        const thumb = r.x + 19 + Math.round((editor.scrollX / max) * Math.max(0, trackLength - 1));
        if (x === r.x + 18 || x === r.x + r.w - 3)
          editor.scrollX = Math.max(0, Math.min(max, editor.scrollX + (x === r.x + 18 ? -1 : 1)));
        else if (x === thumb)
          this.drag = { mode: 'scroll-x', x, y, bounds: { ...r }, offset: editor.scrollX };
        else
          editor.scrollX = Math.max(
            0,
            Math.min(max, editor.scrollX + (x < thumb ? -(r.w - 2) : r.w - 2)),
          );
      }
    } else if (x >= r.x + r.w - 2 && y === r.y + r.h - 1) {
      this.drag = { mode: 'resize', x, y, bounds: { ...r } };
    } else if (y > r.y && y < r.y + r.h - 1 && x > r.x && x < r.x + r.w - 1) {
      if (window.editor) {
        this.placeCursor(window, x, y, event.shiftKey);
        this.drag = { mode: 'select', x, y, bounds: { ...r } };
      } else if (['messages', 'watch', 'project'].includes(window.kind))
        this.selectWindowRow(window, (window.scrollY ?? 0) + y - r.y - 1);
    }
    this.focus();
    this.dirty = true;
  }
  private placeCursor(window: IdeWindow, x: number, y: number, select: boolean): void {
    const editor = window.editor;
    if (!editor) return;
    const r = window.bounds;
    const lineNo = Math.max(0, Math.min(editor.lines.length - 1, y - r.y - 1 + editor.scrollY));
    const line = editor.lines[lineNo] ?? '';
    const target = x - r.x - 1 + editor.scrollX;
    let col = 0;
    while (col < line.length && this.visualColumn(line, col) < target)
      col += (line.codePointAt(col) ?? 0) > 0xffff ? 2 : 1;
    editor.moveTo(editor.offsetAt(lineNo, col), select);
    this.keepCursorVisible();
    this.syncInput();
  }
  private pointerMove(event: PointerEvent): void {
    const { x, y } = this.point(event);
    this.mouseCell = { x, y };
    const menu = this.menuStack.at(-1);
    if (
      menu &&
      x >= menu.x + 2 &&
      x < menu.x + menu.width - 2 &&
      y > menu.y &&
      y <= menu.y + menu.items.length
    ) {
      const index = y - menu.y - 1;
      if (menu.items[index]?.label !== '-') menu.selected = index;
      this.dirty = true;
    }
    if (this.drag && this.active) {
      const r = this.active.bounds;
      const d = this.drag;
      if (d.mode === 'move') {
        r.x = d.bounds.x + x - d.x;
        r.y = d.bounds.y + y - d.y;
        this.clamp(this.active);
      }
      if (d.mode === 'resize') {
        r.w = d.bounds.w + x - d.x;
        r.h = d.bounds.h + y - d.y;
        this.clamp(this.active);
      }
      if (d.mode === 'select') this.placeCursor(this.active, x, y, true);
      if (d.mode === 'scroll-y') {
        const length = this.active.editor
          ? this.editorLayout(this.active.editor).lines.length
          : this.windowLines(this.active).length;
        const max = Math.max(0, length - (r.h - 2));
        const next = Math.max(
          0,
          Math.min(max, Math.round((d.offset ?? 0) + ((y - d.y) * max) / Math.max(1, r.h - 5))),
        );
        if (this.active.editor) this.active.editor.scrollY = next;
        else this.active.scrollY = next;
      }
      if (d.mode === 'scroll-x' && this.active.editor) {
        const max = Math.max(0, this.editorLayout(this.active.editor).maxWidth - (r.w - 2));
        this.active.editor.scrollX = Math.max(
          0,
          Math.min(max, Math.round((d.offset ?? 0) + ((x - d.x) * max) / Math.max(1, r.w - 23))),
        );
      }
      this.dirty = true;
    }
    if (this.settings.textMouse) this.dirty = true;
  }
}
