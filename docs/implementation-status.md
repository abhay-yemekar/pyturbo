# Implementation and verification status

Recorded during initial implementation on 26 October 2026. Source coverage and
verified behavior are different. This is not a completed v1 launch checklist.

## Source coverage

| Area              | Implemented source                                                                                   | Remaining verification                                            |
| ----------------- | ---------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| Engine            | VGA attributes, clipping, frames/shadows, view dispatch, CP437 atlas and canvas rendering            | Original-IDE pixel comparison and approved baselines              |
| Shell             | Eleven menus, submenus, status line, windows, dialogs/controls                                       | Mouse, keyboard, focus and geometry across screens                |
| Editor            | Buffer, selection, undo, overwrite, auto-indent, WordStar blocks/bookmarks, search and syntax colors | Browser typing, clipboard/IME, mobile and long files              |
| Files             | IndexedDB wrapper, path/settings validation, upload/download/share UI                                | Actual persistence, conflicts, failures and reload workflows      |
| Python            | Pinned worker, warm interpreter/fresh globals, syntax checks, file sync, output, input and Stop      | CDN/WASM execution, repeated input, interrupts and reset recovery |
| Packages/projects | Import loading, micropip, filesystem/modules and arguments                                           | Real packages, failed installs and changed/deleted modules        |
| Debugger          | Monitoring line events, shared mailbox, steps, watches, evaluate/stack                               | Complete Python pause/step/evaluate/stop UI workflows             |
| Graphics          | conio, BGI-style graphics, turtle bridge and matplotlib plot events                                  | Real rendering, getch, plotting and lifecycle checks              |
| Preferences       | Rows/fit/colors/editor settings and saved desktop                                                    | Dialog behavior, exact groups and persistence                     |
| Polish            | Touch controls, fullscreen/Keyboard Lock, PWA cache config and accessibility mirrors                 | Devices, offline cold reload, screen readers and performance      |
| Repository        | Personal remote, issue/branch, workflows/templates                                                   | Green CI, actual rules/settings and verified Pages deployments    |

Unsupported legacy commands are disabled where no implementation exists. Other
commands may use simplified interactions rather than complete Turbo parity.

## Verified component evidence

- Engine tests passed at the engine milestone; detailed scope and font probe/atlas
  evidence are in [fidelity-status.md](fidelity-status.md).
- Editor/storage targeted tests passed **24 tests**, covering newline/cursor/
  selection behavior, undo/save state, indentation/overwrite, blocks/bookmarks,
  literal search/replace, token colors/malformed strings, storage validation/
  errors, preferences, and bounded share decoding.
- Storage tests mock the key-value layer. They do not establish browser
  IndexedDB, quota, private-mode, or persistence behavior.
- Scoped editor/storage Biome checks passed. Final whole-application checks,
  browser tests, CI, and deployed verification must run after integration.

Record final command results in the PR validation record or update this file.
Successful builds and small geometry fixtures do not certify the whole product.

## Release gates still open

1. Pass final lint, strict typecheck, unit coverage, production build, and the
   Chromium/Firefox/WebKit suite on the final source.
2. Verify Pages preview/production COOP/COEP, CSP, CDN/WASM loading, isolation,
   input, Stop and debugger behavior.
3. Privately compare original desktop, menus, dialogs, windows, scrollbars and
   modes. Commit only PyTurbo screenshots/baselines.
4. Complete real browser/OS shortcut tests, Safari/iOS and Android checks.
5. Resolve the four Ctrl+O toggles and adaptive page distances in
   [editor-and-storage.md](editor-and-storage.md).
6. Verify save failures/conflicts, IME, directional selections, clipboard,
   imported/shared projects, repeated modules, output floods and stop while
   waiting for input or debugger commands.
7. Validate graphics/packages, mobile landscape/touch, screen readers, cached
   offline runtime/packages and measured performance budgets.
8. Complete launch assets, owner review, versioning/release work, and any
   explicitly authorized announcements or optional analytics.

The implementation spans areas from several roadmap phases. No phase is fully
complete until its exit criteria and verification gates pass. The
[source plan](project-plan.md) remains the roadmap.
