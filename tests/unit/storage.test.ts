import LZString from 'lz-string';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { decodeShare, encodeShare, MAX_SHARE_FRAGMENT } from '../../src/storage/share';
import {
  defaultSettings,
  normalizeSettings,
  validateFilename,
  WorkspaceStore,
} from '../../src/storage/workspace';
import bombFragment from './fixtures/share-bomb.txt?raw';

const memory = vi.hoisted(() => ({ values: new Map<string, unknown>(), fail: false }));
vi.mock('idb-keyval', () => ({
  createStore: () => 'test-store',
  get: async (key: string) => memory.values.get(key),
  set: async (key: string, value: unknown) => {
    if (memory.fail) throw new Error('QuotaExceededError');
    memory.values.set(key, value);
  },
  setMany: async (values: Array<[string, unknown]>) => {
    if (memory.fail) throw new Error('QuotaExceededError');
    for (const [key, value] of values) memory.values.set(key, value);
  },
  del: async (key: string) => {
    memory.values.delete(key);
  },
  entries: async () => [...memory.values],
}));

beforeEach(() => {
  memory.values.clear();
  memory.fail = false;
});

describe('workspace storage', () => {
  it('round trips independent files and settings', async () => {
    const store = new WorkspaceStore();
    await store.saveFiles([
      { name: 'main.py', content: 'import util', updatedAt: 1 },
      { name: 'lib/util.py', content: 'x=1', updatedAt: 2 },
    ]);
    await store.saveSettings({ ...defaultSettings, rows: 50, pauseAfterRun: true });
    expect((await store.loadFiles()).map((file) => file.name)).toEqual(['lib/util.py', 'main.py']);
    expect((await store.loadSettings()).pauseAfterRun).toBe(true);
    await store.deleteFile('main.py');
    expect(await store.loadFile('main.py')).toBeUndefined();
    expect(await store.loadFiles()).toHaveLength(1);
  });

  it('surfaces write failures instead of claiming an in-memory file is saved', async () => {
    const store = new WorkspaceStore();
    memory.fail = true;
    await expect(
      store.saveFile({ name: 'main.py', content: 'print(1)', updatedAt: 1 }),
    ).rejects.toThrow('QuotaExceededError');
    expect(await store.loadFiles()).toEqual([]);
  });

  it('rejects absolute paths, traversal, empty segments, and control characters', () => {
    for (const name of [
      '/main.py',
      '../main.py',
      'lib/../main.py',
      'C:\\main.py',
      'lib//x.py',
      'a\0.py',
      './x.py',
    ]) {
      expect(() => validateFilename(name)).toThrow();
    }
    expect(validateFilename('lib/東京.py')).toBe('lib/東京.py');
  });

  it('validates persisted preferences and returns independent default objects', () => {
    const settings = normalizeSettings({
      rows: 99,
      tabSize: -1,
      screenMode: 'bad',
      pauseAfterRun: 'true',
      colors: { normal: 0x1e, bad: -1 },
      arguments: [123],
    });
    expect(settings.rows).toBe(25);
    expect(settings.tabSize).toBe(4);
    expect(settings.pauseAfterRun).toBe(false);
    expect(settings.colors).toEqual({ normal: 0x1e });
    settings.arguments.push('hello');
    expect(normalizeSettings(undefined).arguments).toEqual([]);
  });
});

describe('share fragments', () => {
  it('round trips multiple files, Unicode, and an explicit active file', () => {
    const files = { 'main.py': 'print("你好 😀")', 'lib/mod.py': 'answer=42' };
    const fragment = encodeShare(files, 'main.py');
    expect(fragment.startsWith('#pyturbo=')).toBe(true);
    expect(decodeShare(fragment)).toEqual({ files, activeFile: 'main.py' });
    expect(decodeShare('#help')).toBeNull();
  });

  it('rejects corrupt data, traversal, missing active files, and oversized fragments', () => {
    expect(() => decodeShare('#pyturbo=bad!')).toThrow();
    const invalid =
      '#pyturbo=' +
      LZString.compressToEncodedURIComponent(
        JSON.stringify({ version: 1, activeFile: '../x.py', files: { '../x.py': 'pass' } }),
      );
    expect(() => decodeShare(invalid)).toThrow();
    expect(() => encodeShare({ 'a.py': '' }, 'b.py')).toThrow();
    expect(() => decodeShare(`#pyturbo=${'a'.repeat(MAX_SHARE_FRAGMENT)}`)).toThrow();
  });

  it('rejects decompressed projects above the source-size limit', () => {
    expect(() => encodeShare({ 'a.py': 'x'.repeat(300_000) }, 'a.py')).toThrow();
    const fragment = `#pyturbo=${bombFragment}`;
    expect(fragment.length).toBeLessThan(MAX_SHARE_FRAGMENT);
    expect(() => decodeShare(fragment)).toThrow();
  });

  it('round trips content that requires JSON escapes and handles truncated streams', () => {
    const files = { 'a.py': '\u0000'.repeat(10_000) };
    expect(decodeShare(encodeShare(files, 'a.py'))).toEqual({ files, activeFile: 'a.py' });
    expect(() => decodeShare('#pyturbo=Q')).toThrow();
  });
});
