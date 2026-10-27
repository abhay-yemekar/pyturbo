export interface MenuItem {
  label: string;
  command?: string;
  shortcut?: string;
  hint?: string;
  disabled?: boolean;
  children?: MenuItem[];
}
export interface Menu {
  label: string;
  x: number;
  items: MenuItem[];
}
const item = (
  label: string,
  command: string,
  shortcut = '',
  hint = '',
  disabled = false,
): MenuItem => ({ label, command, shortcut, hint, disabled });
const separator: MenuItem = { label: '-' };
const unavailable = (label: string): MenuItem =>
  item(label, '', '', 'Not implemented in this version', true);

export const menus: Menu[] = [
  {
    label: '~≡~',
    x: 0,
    items: [
      item('Repaint desktop', 'repaint'),
      separator,
      item('Python shell (REPL)', 'shell'),
      item('Package manager (pip)…', 'packages'),
      item('Python docs', 'python-docs'),
    ],
  },
  {
    label: '~F~ile',
    x: 3,
    items: [
      item('~N~ew', 'new', '', 'Create a new file in a new Edit window'),
      item('~O~pen…', 'open', 'F3'),
      item('~S~ave', 'save', 'F2'),
      item('Save ~a~s…', 'save-as'),
      item('Save a~l~l', 'save-all'),
      item('Download .py', 'download'),
      item('Upload…', 'upload'),
      item('Share link…', 'share'),
      separator,
      item('Change ~d~ir…', 'directory'),
      item('~P~rint', 'print'),
      item('DOS s~h~ell', 'shell'),
      separator,
      item('~Q~uit', 'quit', 'Alt+X'),
    ],
  },
  {
    label: '~E~dit',
    x: 9,
    items: [
      item('~U~ndo', 'undo', 'Alt+BkSp'),
      item('~R~edo', 'redo', 'Shift+Alt+BkSp'),
      separator,
      item('Cu~t~', 'cut', 'Shift+Del'),
      item('~C~opy', 'copy', 'Ctrl+Ins'),
      item('~P~aste', 'paste', 'Shift+Ins'),
      item('C~l~ear', 'clear', 'Ctrl+Del'),
      item('Copy ~e~xample', 'example'),
      separator,
      item('~S~how clipboard', 'clipboard'),
    ],
  },
  {
    label: '~S~earch',
    x: 15,
    items: [
      item('~F~ind…', 'find', '', 'Search for text'),
      item('~R~eplace…', 'replace'),
      item('~S~earch again', 'search-again', 'Ctrl+L'),
      separator,
      item('~G~o to line number…', 'goto'),
      item('~P~revious error', 'previous-error', 'Alt+F7'),
      item('~N~ext error', 'next-error', 'Alt+F8'),
      item('~L~ocate function…', 'function'),
    ],
  },
  {
    label: '~R~un',
    x: 23,
    items: [
      item('~R~un', 'run', 'Ctrl+F9', 'Make and run the current program'),
      item('~P~rogram reset', 'reset', 'Ctrl+F2'),
      item('~G~o to cursor', 'go-cursor', 'F4'),
      item('~T~race into', 'trace', 'F7'),
      item('~S~tep over', 'step', 'F8'),
      item('~A~rguments…', 'arguments'),
    ],
  },
  {
    label: '~C~ompile',
    x: 28,
    items: [
      item('~C~ompile', 'compile', 'Alt+F9'),
      item('~M~ake', 'make', 'F9'),
      item('~L~ink', '', '', '', true),
      item('~B~uild all', 'make'),
      separator,
      item('~I~nformation…', 'information'),
      item('~R~emove messages', 'remove-messages'),
    ],
  },
  {
    label: '~D~ebug',
    x: 37,
    items: [
      item('~I~nspect…', 'inspect', 'Alt+F4'),
      item('~E~valuate/modify…', 'evaluate', 'Ctrl+F4'),
      item('~C~all stack…', 'stack', 'Ctrl+F3'),
      {
        label: '~W~atches',
        children: [
          item('~A~dd watch…', 'add-watch', 'Ctrl+F7'),
          item('~D~elete watch', 'delete-watch'),
          item('~E~dit watch…', 'edit-watch'),
          item('~R~emove all watches', 'remove-watches'),
        ],
      },
      item('~T~oggle breakpoint', 'breakpoint', 'Ctrl+F8'),
      item('~B~reakpoints…', 'breakpoints'),
    ],
  },
  {
    label: '~P~roject',
    x: 44,
    items: [
      item('~O~pen project…', 'project-open'),
      item('~C~lose project', 'project-close'),
      separator,
      item('~A~dd item…', 'upload'),
      item('~D~elete item', 'project-delete'),
      unavailable('Local options…'),
      item('~I~nclude files…', 'imports'),
    ],
  },
  {
    label: '~O~ptions',
    x: 53,
    items: [
      item('~A~pplication…', 'preferences'),
      {
        label: '~C~ompiler',
        children: [item('Syntax checking', 'compile'), item('Runtime information…', 'information')],
      },
      unavailable('Transfer…'),
      item('~M~ake…', 'make'),
      { label: '~L~inker', disabled: true },
      unavailable('Librarian…'),
      item('~D~ebugger…', 'debug-options'),
      item('D~i~rectories…', 'directory'),
      separator,
      {
        label: '~E~nvironment',
        children: [
          item('~P~references…', 'preferences'),
          item('~E~ditor…', 'editor-options'),
          item('~M~ouse…', 'mouse-options'),
          item('~D~esktop…', 'desktop-options'),
          item('~S~tartup…', 'startup-options'),
          item('~C~olors…', 'colors'),
        ],
      },
      item('~S~ave…', 'save-settings'),
    ],
  },
  {
    label: '~W~indow',
    x: 65,
    items: [
      item('~S~ize/Move', 'size', 'Ctrl+F5'),
      item('~Z~oom', 'zoom', 'F5'),
      item('~T~ile', 'tile'),
      item('C~a~scade', 'cascade'),
      item('~N~ext', 'next', 'F6'),
      item('~C~lose', 'close', 'Alt+F3'),
      item('Close all', 'close-all'),
      separator,
      item('~M~essage', 'messages'),
      item('~O~utput', 'output'),
      item('~W~atch', 'watch'),
      item('~U~ser screen', 'user-screen', 'Alt+F5'),
      item('~R~egister', '', '', '', true),
      item('~P~roject', 'project'),
      item('Project notes', 'notes'),
      separator,
      item('~L~ist all…', 'windows', 'Alt+0'),
    ],
  },
  {
    label: '~H~elp',
    x: 73,
    items: [
      item('~C~ontents', 'help', 'F1'),
      item('~I~ndex', 'help-index', 'Shift+F1'),
      item('~T~opic search', 'topic-help', 'Ctrl+F1'),
      item('~P~revious topic', 'help', 'Alt+F1'),
      item('Help on ~h~elp', 'help-on-help'),
      separator,
      item('~A~bout…', 'about'),
    ],
  },
];

export function plain(label: string): string {
  return label.replaceAll('~', '');
}
export function hotkey(label: string): string {
  return /~(.)~/.exec(label)?.[1]?.toLowerCase() ?? '';
}
