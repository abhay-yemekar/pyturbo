export interface ColorItem {
  key: string;
  label: string;
  attr: number;
}

export interface ColorGroup {
  key: string;
  label: string;
  items: ColorItem[];
}

function group(key: string, label: string, entries: Array<[string, number]>): ColorGroup {
  return {
    key,
    label,
    items: entries.map(([name, attr]) => ({
      key: key + name.replace(/[^a-z0-9]/gi, ''),
      label: name,
      attr,
    })),
  };
}

const menu: Array<[string, number]> = [
  ['Border', 0x70],
  ['Selection Bar', 0x20],
  ['Normal Text', 0x70],
  ['Disabled Entry', 0x78],
  ['First Letter', 0x74],
  ['Selected Letter', 0x24],
];
const cyanWindow: Array<[string, number]> = [
  ['Inactive Title', 0x31],
  ['Inactive Border', 0x31],
  ['Marked Text', 0x2b],
  ['Normal Text', 0x31],
  ['Tracking Bar', 0x3f],
  ['Error Line', 0x4e],
  ['Active Title', 0x3f],
  ['Active Border', 0x3f],
  ['Icons', 0x3a],
  ['Scroll Bar', 0x13],
  ['Thumb Tab', 0x31],
  ['Arrows', 0x31],
];

/** Group order and attribute bytes transcribed from the original IDE, 27 Oct 2026.
 * Private reference images are excluded from the repository. See docs/fidelity-status.md.
 */
export const COLOR_GROUPS: ColorGroup[] = [
  group('mainMenu', 'Main Menu', [
    ['Selection Bar', 0x20],
    ['Normal Text', 0x70],
    ['First Letter', 0x74],
    ['Selected Letter', 0x24],
  ]),
  group('pulldown', 'Pulldown Menus', menu),
  group('popup', 'Popup Menus', menu),
  group('edit', 'Edit Window', [
    ['Inactive Title', 0x17],
    ['Inactive Border', 0x17],
    ['Marked Text', 0x71],
    ['Normal Text', 0x1e],
    ['Active Title', 0x1f],
    ['Active Border', 0x1f],
    ['Icons', 0x1a],
    ['Scroll Bar', 0x13],
    ['Thumb Tab', 0x31],
    ['Arrows', 0x31],
    ['CPU Line', 0x30],
    ['Break Point Line', 0x4f],
    ['Comment', 0x13],
    ['Reserved', 0x1f],
    ['Identifier', 0x1a],
    ['Symbol', 0x1e],
    ['String', 0x14],
    ['Integer', 0x17],
    ['Float', 0x16],
    ['Octal', 0x18],
    ['Hex', 0x10],
    ['Character', 0x15],
    ['Preprocessor', 0x31],
    ['Illegal Char', 0x40],
  ]),
  group('output', 'Output Window', [
    ['Inactive Title', 0x07],
    ['Inactive Border', 0x07],
    ['Active Title', 0x0f],
    ['Active Border', 0x0f],
    ['Icons', 0x0a],
    ['Scroll Bar', 0x13],
    ['Thumb Tab', 0x31],
    ['Arrows', 0x31],
  ]),
  group('message', 'Message Window', cyanWindow),
  group(
    'watch',
    'Watch Window',
    cyanWindow.filter(([name]) => name !== 'Error Line'),
  ),
  group('modalHelp', 'Modal Help', [
    ['Inactive Title', 0x00],
    ['Inactive Border', 0x37],
    ['Keyword', 0x3e],
    ['Normal Text', 0x30],
    ['Selected Keyword', 0x1e],
    ['Example Program', 0x31],
    ['Active Title', 0x00],
    ['Active Border', 0x31],
    ['Icons', 0x31],
    ['Scroll Bar', 0x31],
    ['Thumb Tab', 0x13],
    ['Arrows', 0x13],
  ]),
  group('help', 'Help', [
    ['Inactive Title', 0x30],
    ['Inactive Border', 0x30],
    ['Keyword', 0x3e],
    ['Normal Text', 0x30],
    ['Current Keyword', 0x1e],
    ['Example Program', 0x31],
    ['Active Title', 0x3f],
    ['Active Border', 0x3f],
    ['Icons', 0x3a],
    ['Scroll Bar', 0x31],
    ['Thumb Tab', 0x13],
    ['Arrows', 0x13],
    ['Selected Keyword', 0x7e],
    ['Selected Text', 0x70],
    ['Unknown', 0x0e],
    ['Selected Example', 0x71],
  ]),
  group('status', 'Status Line', [
    ['Hot Keys', 0x74],
    ['Normal Text', 0x70],
  ]),
  group('project', 'Project Window', cyanWindow),
  group('inspector', 'Inspector Window', cyanWindow),
  group('dialog', 'Dialog Window', [
    ['Active Title', 0x7f],
    ['Active Border', 0x7f],
    ['Normal Text', 0x70],
    ['Icons', 0x7a],
    ['Scroll Bar', 0x31],
    ['Thumb Tab', 0x31],
    ['Arrows', 0x13],
  ]),
  group('control', 'Dialog Controls', [
    ['Inactive Title', 0x7f],
    ['First Letter', 0x7e],
    ['Active Title', 0x70],
    ['Title Letter', 0x7e],
    ['Active', 0x70],
    ['Active Letter', 0x7e],
    ['Selected', 0x7f],
    ['Selected Letter', 0x7e],
    ['Disabled Entry', 0x78],
  ]),
  group('dialogMessage', 'Dialog Messages', [
    ['Information', 0x13],
    ['Notification', 0x1b],
    ['Warning', 0x1e],
    ['Error', 0x1c],
  ]),
  group('button', 'Dialog Buttons', [
    ['Selected', 0x2f],
    ['Selected Letter', 0x2e],
    ['Default', 0x2b],
    ['Default Letter', 0x2e],
    ['Active', 0x20],
    ['Active Letter', 0x2e],
    ['Disabled Entry', 0x78],
  ]),
  group('input', 'Dialog Text Entry', [
    ['Normal Text', 0x1b],
    ['Volatile Text', 0x2f],
    ['Selected Text', 0x1f],
  ]),
  group('list', 'Dialog Lists', [
    ['Active', 0x30],
    ['Default', 0x3e],
    ['Selected', 0x2f],
    ['Disabled Entry', 0x38],
  ]),
  group('cluster', 'Dialog Groups', [
    ['Selected', 0x3f],
    ['Selected Letter', 0x3e],
    ['Active', 0x30],
    ['Active Letter', 0x3e],
    ['Disabled Entry', 0x38],
  ]),
  group('desktop', 'Desktop Color', [['Desktop Color', 0x71]]),
];

export const COLOR_DEFAULTS: Record<string, number> = Object.fromEntries(
  COLOR_GROUPS.flatMap((entry) => entry.items.map((item) => [item.key, item.attr])),
);

/** Read earlier saved settings without coupling newly edited window palettes. */
const EDITOR_ALIASES: Record<string, string> = {
  normal: 'NormalText',
  selection: 'MarkedText',
  comment: 'Comment',
  reserved: 'Reserved',
  identifier: 'Identifier',
  symbol: 'Symbol',
  string: 'String',
  integer: 'Integer',
  float: 'Float',
  octal: 'Octal',
  hex: 'Hex',
  character: 'Character',
  preprocessor: 'Preprocessor',
  illegal: 'IllegalChar',
  execution: 'CPULine',
  breakpoint: 'BreakPointLine',
  activeBorder: 'ActiveBorder',
  inactiveBorder: 'InactiveBorder',
  icons: 'Icons',
  scrollbar: 'ScrollBar',
  thumb: 'ThumbTab',
};
const ALIASES: Record<string, string> = {
  ...Object.fromEntries(
    Object.entries(EDITOR_ALIASES).map(([key, suffix]) => [key, `edit${suffix}`]),
  ),
  menu: 'mainMenuNormalText',
  selectedMenu: 'mainMenuSelectionBar',
  status: 'statusNormalText',
  desktop: 'desktopDesktopColor',
  message: 'messageNormalText',
  watch: 'watchNormalText',
  help: 'helpNormalText',
  dialog: 'dialogNormalText',
};
const LEGACY: Record<string, string> = Object.fromEntries(
  Object.entries(ALIASES).map(([old, key]) => [key, old]),
);
for (const prefix of ['edit', 'output', 'message', 'watch', 'help', 'project', 'inspector']) {
  for (const [suffix, old] of Object.entries({
    ActiveTitle: 'activeBorder',
    ActiveBorder: 'activeBorder',
    InactiveTitle: 'inactiveBorder',
    InactiveBorder: 'inactiveBorder',
    Icons: 'icons',
    ScrollBar: 'scrollbar',
    ThumbTab: 'thumb',
    Arrows: 'thumb',
  }))
    LEGACY[prefix + suffix] = old;
}
LEGACY.pulldownNormalText = 'menu';
LEGACY.pulldownBorder = 'menu';
LEGACY.pulldownSelectionBar = 'selectedMenu';
LEGACY.dialogActiveTitle = 'dialog';
LEGACY.dialogActiveBorder = 'dialog';
LEGACY.dialogIcons = 'icons';
LEGACY.outputNormalText = 'output';

export function colorAttribute(
  colors: Record<string, number>,
  role: string,
  fallback = 0x70,
): number {
  const key = ALIASES[role] ?? role;
  const legacy = LEGACY[key];
  return colors[key] ?? (legacy ? colors[legacy] : undefined) ?? COLOR_DEFAULTS[key] ?? fallback;
}

export function windowColorGroup(kind: string): string {
  return kind === 'messages'
    ? 'message'
    : ['watch', 'output', 'help', 'project'].includes(kind)
      ? kind
      : 'edit';
}

export const COLOR_NAMES = [
  'Black',
  'Blue',
  'Green',
  'Cyan',
  'Red',
  'Magenta',
  'Brown',
  'Light grey',
  'Dark grey',
  'Light blue',
  'Light green',
  'Light cyan',
  'Light red',
  'Light magenta',
  'Yellow',
  'White',
];
