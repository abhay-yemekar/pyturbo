import { describe, expect, it } from 'vitest';
import { acknowledgesOutput, isSystemKey } from '../../src/ide/keyboard';

function key(key: string, extra: Partial<KeyboardEvent> = {}): KeyboardEvent {
  return {
    key,
    code: '',
    ctrlKey: false,
    altKey: false,
    metaKey: false,
    shiftKey: false,
    isComposing: false,
    ...extra,
  } as KeyboardEvent;
}

describe('browser and system keyboard handling', () => {
  it('keeps both modifier orderings of Windows+Shift+S out of the IDE', () => {
    for (const event of [
      key('Meta', { metaKey: true }),
      key('Shift', { metaKey: true, shiftKey: true }),
      key('S', { code: 'KeyS', metaKey: true, shiftKey: true }),
      key('Shift', { shiftKey: true }),
      key('Meta', { metaKey: true, shiftKey: true }),
    ]) {
      expect(isSystemKey(event, 'Win32')).toBe(true);
      expect(acknowledgesOutput(event)).toBe(false);
    }
  });
  it('preserves Apple Command editing while passing screenshot chords through', () => {
    const redo = key('z', { metaKey: true, shiftKey: true });
    expect(isSystemKey(redo, 'Win32')).toBe(true);
    expect(isSystemKey(redo, 'MacIntel')).toBe(false);
    expect(isSystemKey(redo, 'iPad')).toBe(false);
    for (const code of ['Digit3', 'Digit4', 'Digit5'])
      expect(isSystemKey(key('#', { code, metaKey: true, shiftKey: true }), 'MacIntel')).toBe(true);
    expect(isSystemKey(key('F9', { ctrlKey: true }), 'Win32')).toBe(false);
    expect(isSystemKey(key('F5', { altKey: true }), 'Win32')).toBe(false);
  });
  it('keeps PrintScreen and browser fullscreen/developer tools available', () => {
    for (const value of ['PrintScreen', 'F11', 'F12']) {
      expect(isSystemKey(key(value), 'Win32')).toBe(true);
      expect(acknowledgesOutput(key(value))).toBe(false);
    }
    expect(isSystemKey(key('Tab', { altKey: true }), 'Win32')).toBe(true);
    expect(isSystemKey(key('Tab', { ctrlKey: true }), 'Win32')).toBe(true);
    expect(isSystemKey(key('Tab', { metaKey: true }), 'MacIntel')).toBe(true);
    expect(isSystemKey(key('Tab'), 'Win32')).toBe(false);
    expect(isSystemKey(key('Tab', { shiftKey: true }), 'Win32')).toBe(false);
  });
  it('does not acknowledge output for modifier/lock keys or modified shortcuts', () => {
    for (const event of [
      key('Shift'),
      key('Control'),
      key('Alt'),
      key('AltGraph'),
      key('CapsLock'),
      key('NumLock'),
      key('ScrollLock'),
      key('Fn'),
      key('FnLock'),
      key('Tab', { altKey: true }),
      key('c', { ctrlKey: true }),
    ])
      expect(acknowledgesOutput(event)).toBe(false);
  });
  it('waits for a completed key rather than interrupting IME or dead-key input', () => {
    for (const event of [
      key('a', { isComposing: true }),
      key('Dead'),
      key('Process'),
      key('Unidentified'),
    ])
      expect(acknowledgesOutput(event)).toBe(false);
  });
  it('acknowledges completed output only with an unmodified Enter key', () => {
    expect(acknowledgesOutput(key('Enter'))).toBe(true);
    expect(acknowledgesOutput(key('Enter', { code: 'NumpadEnter' }))).toBe(true);
    for (const event of [
      key('Escape'),
      key(' '),
      key('x'),
      key('A', { shiftKey: true }),
      key('Enter', { ctrlKey: true }),
      key('Enter', { shiftKey: true }),
    ])
      expect(acknowledgesOutput(event)).toBe(false);
  });
});
