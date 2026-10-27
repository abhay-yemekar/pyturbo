import { createStore, del, entries, get, set, setMany } from 'idb-keyval';

export interface WorkspaceFile {
  name: string;
  content: string;
  updatedAt: number;
}

export type ScreenMode = 'exact' | 'fill';
export type VideoMode = 'color' | 'lcd' | 'monochrome' | 'high-contrast';

export interface WorkspaceSettings {
  screenMode: ScreenMode;
  rows: 25 | 43 | 50;
  identifierColor: 'green' | 'yellow';
  pauseAfterRun: boolean;
  videoMode: VideoMode;
  tabSize: number;
  autoIndent: boolean;
  cuaKeys: boolean;
  textMouse: boolean;
  stderrColor: boolean;
  arguments: string[];
  colors: Record<string, number>;
  desktop: Array<{ filename: string; x: number; y: number; w: number; h: number }>;
}

export const defaultSettings: WorkspaceSettings = {
  screenMode: 'exact',
  rows: 25,
  identifierColor: 'green',
  pauseAfterRun: false,
  videoMode: 'color',
  tabSize: 4,
  autoIndent: true,
  cuaKeys: true,
  textMouse: false,
  stderrColor: true,
  arguments: [],
  colors: {},
  desktop: [],
};

/** Keep browser files within the project filesystem; never permit traversal. */
export function validateFilename(name: string): string {
  if (
    typeof name !== 'string' ||
    !name ||
    name.length > 240 ||
    /[\\:]/.test(name) ||
    [...name].some(
      (character) => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127,
    ) ||
    name.startsWith('/') ||
    name.endsWith('/')
  ) {
    throw new Error('Use a relative project filename without control characters or drive letters.');
  }
  if (name.split('/').some((part) => !part || part === '.' || part === '..')) {
    throw new Error('Project filenames cannot contain empty, . or .. path segments.');
  }
  return name;
}

export function validateFile(value: unknown): WorkspaceFile {
  if (!value || typeof value !== 'object') throw new Error('Invalid workspace file.');
  const file = value as Partial<WorkspaceFile>;
  if (
    typeof file.name !== 'string' ||
    typeof file.content !== 'string' ||
    typeof file.updatedAt !== 'number' ||
    !Number.isFinite(file.updatedAt)
  ) {
    throw new Error('Invalid workspace file.');
  }
  return { name: validateFilename(file.name), content: file.content, updatedAt: file.updatedAt };
}

/** Validate persisted preferences without trusting old or hand-edited database data. */
export function normalizeSettings(value: unknown): WorkspaceSettings {
  const output: WorkspaceSettings = { ...defaultSettings, arguments: [], colors: {}, desktop: [] };
  if (!value || typeof value !== 'object') return output;
  const saved = value as Partial<WorkspaceSettings>;
  if (saved.screenMode === 'exact' || saved.screenMode === 'fill')
    output.screenMode = saved.screenMode;
  if (saved.rows === 25 || saved.rows === 43 || saved.rows === 50) output.rows = saved.rows;
  if (saved.identifierColor === 'green' || saved.identifierColor === 'yellow')
    output.identifierColor = saved.identifierColor;
  if (saved.videoMode && ['color', 'lcd', 'monochrome', 'high-contrast'].includes(saved.videoMode))
    output.videoMode = saved.videoMode;
  for (const key of [
    'pauseAfterRun',
    'autoIndent',
    'cuaKeys',
    'textMouse',
    'stderrColor',
  ] as const) {
    if (typeof saved[key] === 'boolean') output[key] = saved[key];
  }
  if (
    typeof saved.tabSize === 'number' &&
    Number.isInteger(saved.tabSize) &&
    saved.tabSize >= 1 &&
    saved.tabSize <= 16
  )
    output.tabSize = saved.tabSize;
  if (
    Array.isArray(saved.arguments) &&
    saved.arguments.every((argument) => typeof argument === 'string')
  )
    output.arguments = [...saved.arguments];
  if (saved.colors && typeof saved.colors === 'object' && !Array.isArray(saved.colors)) {
    for (const [key, attr] of Object.entries(saved.colors)) {
      if (
        /^[a-zA-Z][a-zA-Z0-9]*$/.test(key) &&
        Number.isInteger(attr) &&
        attr >= 0 &&
        attr <= 255
      ) {
        Object.defineProperty(output.colors, key, {
          value: attr,
          enumerable: true,
          writable: true,
          configurable: true,
        });
      }
    }
  }
  if (Array.isArray(saved.desktop)) {
    output.desktop = saved.desktop
      .filter((window) => {
        if (!window || typeof window.filename !== 'string') return false;
        try {
          validateFilename(window.filename);
        } catch {
          return false;
        }
        return (
          [window.x, window.y, window.w, window.h].every(
            (part) => typeof part === 'number' && Number.isFinite(part),
          ) &&
          window.w >= 20 &&
          window.h >= 5
        );
      })
      .map((window) => ({ ...window }));
  }
  return output;
}

/** Storage failures are surfaced to the caller; an unsaved file stays in memory. */
export class WorkspaceStore {
  private readonly store: ReturnType<typeof createStore>;

  constructor(databaseName = 'pyturbo', storeName = 'workspace') {
    this.store = createStore(databaseName, storeName);
  }

  async loadFiles(): Promise<WorkspaceFile[]> {
    const stored = await entries<string, unknown>(this.store);
    return stored
      .filter(([key]) => typeof key === 'string' && key.startsWith('file:'))
      .map(([, value]) => validateFile(value))
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  async loadFile(name: string): Promise<WorkspaceFile | undefined> {
    const file = await get<unknown>(`file:${validateFilename(name)}`, this.store);
    return file === undefined ? undefined : validateFile(file);
  }

  async saveFile(file: WorkspaceFile): Promise<void> {
    const safe = validateFile(file);
    await set(`file:${safe.name}`, safe, this.store);
  }

  async saveFiles(files: WorkspaceFile[]): Promise<void> {
    await setMany(
      files.map((file) => {
        const safe = validateFile(file);
        return [`file:${safe.name}`, safe] as [string, WorkspaceFile];
      }),
      this.store,
    );
  }

  async deleteFile(name: string): Promise<void> {
    await del(`file:${validateFilename(name)}`, this.store);
  }

  async loadSettings(): Promise<WorkspaceSettings> {
    return normalizeSettings(await get<unknown>('settings', this.store));
  }

  async saveSettings(settings: WorkspaceSettings): Promise<void> {
    await set('settings', normalizeSettings(settings), this.store);
  }
}
