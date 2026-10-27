import LZString from 'lz-string';
import { validateFilename } from './workspace';

export interface SharedWorkspace {
  files: Record<string, string>;
  activeFile: string;
}

export const MAX_SHARE_FRAGMENT = 16_000;
export const MAX_SHARE_SOURCE = 256_000;
const PREFIX = '#pyturbo=';
const MAX_SHARE_JSON = MAX_SHARE_SOURCE * 6 + 8_000;

/** Decode the lz-string URI bitstream while bounding output before allocation. */
function decompressBounded(encoded: string): string {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+-$';
  let character = 0;
  let mask = 32;
  const readBits = (count: number): number => {
    let value = 0;
    for (let bit = 0; bit < count; bit++) {
      if (character >= encoded.length) throw new Error('Truncated share data.');
      const code = alphabet.indexOf(encoded[character] ?? '');
      if (code < 0) throw new Error('Invalid share data.');
      if (code & mask) value += 2 ** bit;
      mask >>= 1;
      if (!mask) {
        mask = 32;
        character++;
      }
    }
    return value;
  };
  const initial = readBits(2);
  if (initial === 2) return '';
  if (initial > 2) throw new Error('Invalid share dictionary.');
  let previous = String.fromCharCode(readBits(initial === 0 ? 8 : 16));
  const dictionary: Array<string | undefined> = [undefined, undefined, undefined, previous];
  const result = [previous];
  let length = previous.length;
  let width = 3;
  let untilWiden = 4;
  for (;;) {
    let code = readBits(width);
    if (code === 2) return result.join('');
    if (code < 2) {
      dictionary.push(String.fromCharCode(readBits(code === 0 ? 8 : 16)));
      code = dictionary.length - 1;
      untilWiden--;
    }
    if (!untilWiden) {
      untilWiden = 2 ** width;
      width++;
    }
    const entry =
      dictionary[code] ?? (code === dictionary.length ? previous + previous.charAt(0) : null);
    if (entry === null) throw new Error('Invalid share dictionary.');
    length += entry.length;
    if (length > MAX_SHARE_JSON) throw new Error('This shared project is too large.');
    result.push(entry);
    dictionary.push(previous + entry.charAt(0));
    previous = entry;
    untilWiden--;
    if (!untilWiden) {
      untilWiden = 2 ** width;
      width++;
    }
  }
}

function validateSharedWorkspace(value: unknown): SharedWorkspace {
  if (!value || typeof value !== 'object')
    throw new Error('This share link contains no workspace.');
  const shared = value as Partial<SharedWorkspace> & { version?: number };
  if (
    shared.version !== 1 ||
    typeof shared.activeFile !== 'string' ||
    !shared.files ||
    typeof shared.files !== 'object' ||
    Array.isArray(shared.files)
  ) {
    throw new Error('This share link has an unsupported format.');
  }
  const files = Object.create(null) as Record<string, string>;
  const entries = Object.entries(shared.files);
  if (!entries.length || entries.length > 100)
    throw new Error('This share link must contain between 1 and 100 files.');
  let length = 0;
  for (const [name, content] of entries) {
    validateFilename(name);
    if (typeof content !== 'string') throw new Error('This share link contains an invalid file.');
    length += name.length + content.length;
    if (length > MAX_SHARE_SOURCE)
      throw new Error('This shared project is too large. Download the files instead.');
    files[name] = content;
  }
  if (!Object.hasOwn(files, shared.activeFile))
    throw new Error('The active file is missing from this share link.');
  return { files, activeFile: shared.activeFile };
}

/** Returns a URL fragment. Source code is never sent to a sharing service. */
export function encodeShare(files: Record<string, string>, activeFile: string): string {
  const shared = validateSharedWorkspace({ version: 1, files, activeFile });
  const fragment =
    PREFIX + LZString.compressToEncodedURIComponent(JSON.stringify({ version: 1, ...shared }));
  if (fragment.length > MAX_SHARE_FRAGMENT)
    throw new Error(
      'This project is too large for a reliable share link. Download the files instead.',
    );
  return fragment;
}

export function decodeShare(fragment: string): SharedWorkspace | null {
  if (!fragment || fragment === '#') return null;
  if (!fragment.startsWith(PREFIX)) return null;
  if (
    fragment.length > MAX_SHARE_FRAGMENT ||
    !/^[A-Za-z0-9+\-$]*$/.test(fragment.slice(PREFIX.length))
  ) {
    throw new Error('This share link is invalid or too large.');
  }
  let source: string;
  try {
    source = decompressBounded(fragment.slice(PREFIX.length));
  } catch {
    throw new Error('This share link could not be decompressed.');
  }
  if (!source) throw new Error('This share link is empty or too large.');
  let value: unknown;
  try {
    value = JSON.parse(source);
  } catch {
    throw new Error('This share link contains invalid project data.');
  }
  return validateSharedWorkspace(value);
}
