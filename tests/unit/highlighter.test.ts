import { describe, expect, it } from 'vitest';
import { pythonAttributes, pythonTokenRoles } from '../../src/editor/highlighter';

describe('semantic Python colour roles', () => {
  it('keeps punctuation separate from normal whitespace despite matching defaults', () => {
    const source = 'value = 1 + 2';
    const roles = pythonTokenRoles(source);
    expect(roles[source.indexOf(' ')]).toBe('normal');
    expect(roles[source.indexOf('=')]).toBe('symbol');
    expect(roles[source.indexOf('+')]).toBe('symbol');
    expect(pythonAttributes(source)[source.indexOf('=')]).toBe(0x1e);
  });

  it('retains UTF-16 offsets for a non-BMP string and following operator', () => {
    const source = '"🐍" + value';
    const roles = pythonTokenRoles(source);
    expect(roles.slice(0, 4)).toEqual(['string', 'string', 'string', 'string']);
    expect(roles[source.indexOf('+')]).toBe('symbol');
    expect(roles[source.indexOf('value')]).toBe('identifier');
  });

  it('retains import and illegal-token precedence over ordinary token roles', () => {
    const source = 'import math # module\n$';
    const roles = pythonTokenRoles(source);
    expect(roles.slice(0, source.indexOf('\n')).every((role) => role === 'preprocessor')).toBe(
      true,
    );
    expect(roles.at(-1)).toBe('illegal');
    expect(pythonAttributes('name', 0x1e)).toEqual([0x1e, 0x1e, 0x1e, 0x1e]);
  });
});
