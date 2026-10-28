# 4. Menus and shortcuts

[← Running and debugging](running-and-debugging.md) · [Manual contents](README.md) ·
[Next: Settings and troubleshooting →](settings-and-troubleshooting.md)

## Use a menu or dialog

Click a top-level menu or press **F10**. Arrow keys select menus and commands;
Enter activates the selected item, and Escape closes a menu. **Alt+letter**
opens a menu using its highlighted letter, subject to browser/OS key capture.

In a dialog, Tab and Shift+Tab move between controls. Space toggles a focused
checkbox; arrow keys choose list or color items. Choose OK to accept changes
or Cancel/Escape to discard the dialog. Disabled commands are unavailable.

## Menu map

| Menu    | Useful commands                                                                                          |
| ------- | -------------------------------------------------------------------------------------------------------- |
| ≡       | Repaint desktop, Python shell, package manager, Python documentation                                     |
| File    | New, Open, Save, Save as, Save all, download/upload, share, Print, shell, Quit                           |
| Edit    | Undo/redo, clipboard operations, Clear, Copy example, Show clipboard                                     |
| Search  | Find, Replace, Search again, Go to line, previous/next error, Locate function                            |
| Run     | Run, Program reset, Go to cursor, Trace into, Step over, Arguments                                       |
| Compile | Syntax check, Make/Build all, runtime information, Remove messages                                       |
| Debug   | Inspect, Evaluate/modify, Call stack, Watches, breakpoints                                               |
| Project | Open/close saved project, Add item, Delete item, Include files                                           |
| Options | Application preferences, runtime/make commands, directories, debugger and Environment settings           |
| Window  | Size/Move, Zoom, Tile/Cascade, Next/Close, Message, Output, Watch, User screen, Project, notes, List all |
| Help    | Quick contents/index, Python topic search, this manual on GitHub, About                                  |

Some labels preserve the original IDE vocabulary. **Compile** is a Python
syntax check; **DOS shell** opens a Python REPL; directories describe the
browser’s virtual project workspace. Linker, Librarian, Register, and other
disabled legacy entries are not working compiler/CPU tools.

## Main shortcuts

| Action                                           | Shortcut                                  |
| ------------------------------------------------ | ----------------------------------------- |
| Quick Help / Help index                          | F1 / Shift+F1                             |
| Search Python documentation for the source topic | Ctrl+F1                                   |
| Menus                                            | F10                                       |
| Run / resume paused execution                    | Ctrl+F9                                   |
| Program reset                                    | Ctrl+F2                                   |
| View User Screen                                 | Alt+F5                                    |
| Return from completed User Screen                | Enter                                     |
| Check current file syntax                        | Alt+F9                                    |
| Check project / Make                             | F9                                        |
| Save / Open saved workspace file                 | F2 / F3                                   |
| Zoom / next window                               | F5 / F6                                   |
| Select an open window                            | Alt+0                                     |
| Close active window                              | Alt+F3                                    |
| Size/Move mode                                   | Ctrl+F5                                   |
| Trace into / step over / go to cursor            | F7 / F8 / F4                              |
| Toggle breakpoint / add watch                    | Ctrl+F8 / Ctrl+F7                         |
| Evaluate/modify / call stack                     | Ctrl+F4 / Ctrl+F3                         |
| Previous / next error                            | Alt+F7 / Alt+F8                           |
| Undo / redo                                      | Alt+Backspace / Shift+Alt+Backspace       |
| Copy / cut / paste                               | Ctrl+Insert / Shift+Delete / Shift+Insert |
| Find / replace                                   | Ctrl+Q, F / Ctrl+Q, A                     |
| Repeat search                                    | Ctrl+L                                    |
| Quit                                             | Alt+X                                     |

With **CUA keys** enabled, Ctrl+A selects all and Ctrl+C/X/V/Z use familiar
clipboard and undo actions. Disabling that setting restores conflicting
WordStar aliases. See [editing sequences](editing-and-files.md#wordstar-sequences)
before changing command sets.

Keyboard events received by the app and shortcuts captured by the physical
browser/OS are different. Menus and touch controls provide alternatives.
**F11** and system screenshot chords are left to the browser/OS; the **DOS mode**
button requests the app’s fullscreen mode. Real-device capture remains a
[verification limit](settings-and-troubleshooting.md#differences-and-current-limits).

**Next:** [Settings and troubleshooting →](settings-and-troubleshooting.md)
