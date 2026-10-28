type KeyEvent = Pick<
  KeyboardEvent,
  'key' | 'code' | 'ctrlKey' | 'altKey' | 'metaKey' | 'shiftKey' | 'isComposing'
>;

const modifierKeys = new Set([
  'Shift',
  'Control',
  'Alt',
  'Meta',
  'AltGraph',
  'CapsLock',
  'NumLock',
  'ScrollLock',
  'Fn',
  'FnLock',
]);
const systemKeys = new Set(['PrintScreen', 'F11', 'F12']);

/** Let the browser/OS handle these without changing IDE state. */
export function isSystemKey(event: KeyEvent, platform: string): boolean {
  if (modifierKeys.has(event.key) || systemKeys.has(event.key)) return true;
  if (event.key === 'Tab' && (event.altKey || event.ctrlKey || event.metaKey)) return true;
  const apple = /Mac|iPhone|iPad|iPod/i.test(platform);
  if (event.metaKey && !apple) return true;
  return (
    apple &&
    event.metaKey &&
    event.shiftKey &&
    (['Digit3', 'Digit4', 'Digit5'].includes(event.code) ||
      ['3', '4', '5', '#', '$', '%'].includes(event.key))
  );
}

export function acknowledgesOutput(event: KeyEvent): boolean {
  return (
    event.key === 'Enter' &&
    !event.isComposing &&
    !event.ctrlKey &&
    !event.altKey &&
    !event.metaKey &&
    !event.shiftKey
  );
}
