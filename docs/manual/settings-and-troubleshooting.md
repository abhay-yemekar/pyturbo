# 5. Settings and troubleshooting

[← Menus and shortcuts](menus-and-shortcuts.md) · [Manual contents](README.md) ·
[Next: Examples →](examples.md)

## Screen and colors

Open **Options → Environment → Preferences…**.

| Setting                    | Meaning                                                                 |
| -------------------------- | ----------------------------------------------------------------------- |
| Screen fit: exact          | The default 80-column VGA-style layout with margins where needed        |
| Screen fit: fill           | Use the available screen area for the desktop                           |
| Lines                      | Choose 25, 43, or 50 rows                                               |
| Video mode                 | Color, LCD, monochrome, or high contrast; monochrome suppresses shadows |
| Pause after run            | Leave completed output visible until Enter; factory default is off      |
| Classic yellow identifiers | Use yellow rather than the default light-green names                    |
| Red stderr                 | Distinguish error output with the error color                           |

**Options → Environment → Colors…** changes individual IDE color roles. Select
a Group and Item, choose foreground/background swatches, and inspect the preview.
OK saves the draft; Cancel or Escape discards it.

![PyTurbo’s Colors dialog](../images/colors.png)

## Editor preferences

Open **Options → Environment → Editor…**.

| Setting             | Factory behavior                                                                   |
| ------------------- | ---------------------------------------------------------------------------------- |
| Tab size            | Four columns; accepts values from 1 through 16                                     |
| Auto indent         | On; carries indentation to a new line                                              |
| Use tab character   | Off; Tab inserts spaces by default                                                 |
| Backspace unindents | On; in leading whitespace, return toward a smaller indentation                     |
| CUA keys            | On; enable familiar Ctrl+A/C/X/V/Z actions                                         |
| Cursor style        | Underline (`_`); also offers Vertical bar (`\|`), I-beam (`I`) and Block (`█`)     |
| Cursor through tabs | On; arrows can stop inside a hard tab without changing the file                    |
| Optimal fill        | Off; when enabled, compact edited leading whitespace into tabs on leaving the line |

The cursor style changes the insertion caret in every editor window and is saved
in this browser workspace. Overwrite mode still uses a block cursor; **Insert**
switches back to insertion mode and your chosen style. Program input and the
Python shell retain their underline cursor. Cancel or Escape discards a draft
choice in the Editor dialog.

![PyTurbo's Editor preferences with cursor and tab options](../images/manual-cursor-style.png)

Ctrl+O, **I/T/U/F/R** toggles Auto indent, Use tab character, Backspace unindents,
Optimal fill and Cursor through tabs respectively. These preferences apply to
open/new editors and persist in the current workspace.

With Cursor through tabs off, movement jumps across a tab. Switching it off
while the caret is inside a tab keeps that position until the next movement.
Moving through tabs never inserts spaces or changes saved source.

Optimal fill compacts the leading whitespace of an edited line when you leave
it. Completed lines in a paste are compacted too; the current line stays editable.
It does not rewrite untouched imported lines or spaces between words. It can
create hard tabs even with Use tab character off. Keep Optimal fill off to retain
space-only indentation. The change is undoable.

## DOS mode and phones

The **DOS mode** button requests fullscreen. Where supported and permitted,
Keyboard Lock can help receive keys reserved by a browser. Support and prompts
vary. Escape or the browser’s fullscreen control leaves fullscreen; the browser
may require holding Escape when keyboard locking is active.

Use the on-screen command buttons when a keyboard has no F-keys. Landscape
orientation gives the editor more room on a phone. Physical phone and Safari
testing remain open; available controls do not establish complete device support.

## Output disappears immediately

This is the default return-to-editor behavior when a program ends. Press
**Alt+F5** or **User screen** to view its result, or enable **Pause after run**.
The [first tutorial](getting-started.md#keep-output-visible) gives the steps.

## Take a screenshot of output

With Pause after run enabled, run the program and leave the black output screen
visible. Use your operating system’s screenshot control, such as Windows+Shift+S.
Only Enter dismisses completed output; modifier keys and screenshot chords do
not count as the return key. The instruction remains outside the program text.

Automated tests check the app’s keyboard dispatch. Native screenshot overlays,
browser-reserved keys, and real devices still require manual checks. If a
shortcut is intercepted, use the OS screenshot tool’s controls. Do not start
another run until you have captured the result: a new run clears it.

## Typing or a shortcut does not work

1. Click inside the blue editor, rather than the browser address bar.
2. Check whether a dialog or menu is open. Escape cancels it and returns focus.
3. If the black User Screen shows completed output, press Enter to edit source.
   If a program is asking for input, type its answer there instead.
4. Try the corresponding menu item or touch button. Some browser/OS shortcuts
   never reach a page. DOS mode may help where Keyboard Lock is supported.
5. If typing still fails, report the browser/OS, exact key, active screen, and
   whether a fresh page shows the same behavior. Save your source first.

## An old version keeps appearing

If **Update available** appears, choose **Save and reload** when you are ready.
PyTurbo saves open files and settings before switching versions. The action
waits while a program/debugger, dialog, or Python shell is active. If a save
fails or your workspace changes during the update, the editor stays open and
you can review your work before retrying. Updates never reload the page merely
because a new version was discovered.

![An available PyTurbo update with the Save and reload action](../images/manual-update.png)

Copies installed before this update action was added need the manual steps
below once to load a version that includes it.

PyTurbo caches the app so it can reopen offline. A local preview can therefore
look usable even when its server has stopped, while still showing an earlier
build.

1. **Save all** open files. Download important source as an additional backup.
2. For local development, confirm the Vite server is running and use its exact
   printed URL. Another port is another workspace.
3. While online, reload once so the browser can check for a new app version.
4. If the older copy persists, close all tabs/windows for that same PyTurbo
   origin and reopen it. A waiting offline-cache update can activate after the
   previous app clients close. Installed app windows can also hold an old client.

Do not clear site data as the first troubleshooting step: that can remove saved
workspace files and preferences. Reloading cannot fetch a new build while the
local server is stopped or the network is unavailable.

## Files or Python are unavailable

**Missing files:** check the URL, port, browser, and profile. Workspaces do not
sync between origins. Upload a downloaded `.py` backup if necessary.

**Save error:** keep the editor open, download your source, and resolve the
browser storage problem. A successful-looking browser window is not a backup.

**Python still loading:** the first visit needs a substantial interpreter download.
Check your connection and runtime status. App files being cached does not prove
the Python runtime or every package has finished caching.

**Offline import fails:** only previously cached compatible packages can work
offline. New installs need a connection. Base-interpreter offline reload has
automated coverage; optional-package offline coverage is incomplete.

## Differences and current limits

- PyTurbo executes Python in a browser worker, rather than C/C++ DOS programs.
- The approved desktop target is 720×400 with 9×16 cells at 80×25; complete
  pixel-identical reference fidelity has not been certified.
- Completed output uses Enter-only return and each new run clears the previous
  result. These are intentional PyTurbo usability differences from the original
  retained screen and any-key return described in the planning reference.
- There is no server execution mode, automatic GitHub file sync, desktop shell,
  or general native-library support. This manual being on GitHub does not save
  your programs there.
- Some legacy menu entries are disabled or simplified. Remaining editor options,
  real Safari/iOS/Android checks, native shortcuts/clipboard/IME, accessibility
  with screen readers, performance measurements, and full fidelity remain open.

See [implementation status](../implementation-status.md),
[fidelity status](../fidelity-status.md), and [accepted decisions](../decisions.md)
for the engineering record.

For a problem report, include a minimal program, exact steps, expected and actual
results, browser/OS, the public/preview/local URL, and a screenshot if useful.
Remove private source and data before posting to the
[public issue tracker](https://github.com/abhay-yemekar/pyturbo/issues/new/choose).

**Next:** [Examples to try →](examples.md)
