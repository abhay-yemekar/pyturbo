# Implementation and verification status

Updated on 27 October 2026. Source coverage and
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

## Verification record

- Whole-project lint and strict TypeScript checks pass.
- All **43 unit tests** pass. V8 coverage reports 61.42% statements and 63.48%
  lines for the configured coverage scope; it does not cover the entire IDE.
- The production build and PWA generation pass. Production preview applies the
  same CSP and isolation headers as the Pages `_headers` file. Development alone
  allows Vite's injected styles and localhost WebSocket connection.
- The initial full browser run passed **120 of 123 cases**. It covers Chromium,
  Firefox and Playwright WebKit, with actual Python 3.14.2 running in a worker.
  The three failures exposed a textarea selection race and missing waits for
  asynchronous deletion and debugger stepping. After fixes, all **18 regression
  cases** pass: those three scenarios repeated twice in each engine. The full
  GitHub suite must pass on the published revision before merging.
- Cold offline reload with a new Python worker passed in all three engines.
  This verifies the cached app and base interpreter, not every optional package.
- Real NumPy/Matplotlib, a pinned pure-Python wheel, package failure recovery,
  changed/deleted modules, arguments, getch, BGI/turtle output, blocked-input Stop,
  paused-debugger Stop, shared-buffer input and fallback stdin were exercised.
- Browser editor cases exercise actual IndexedDB reload, a simulated quota
  failure, Unicode shares, traversal rejection, synthetic IME, directional
  selections, search, modal focus, Help scrolling and Watch/Project selection.
  Synthetic IME is not a substitute for an operating-system IME check.
- The production dependency audit reports no known vulnerabilities.
- Native VGA screenshots and cell fixtures describe the implementation, not
  approved original-IDE fidelity. See [fidelity-status.md](fidelity-status.md).

## Repository and hosting

The local folder is connected to the personal repository
[`abhay-yemekar/pyturbo`](https://github.com/abhay-yemekar/pyturbo). The accepted
main protection rules, five required CI checks, squash-only merges, branch
cleanup, topics, labels, phase milestones, secret scanning, push protection and
Dependabot settings are configured.

The Git-connected Cloudflare Pages project `pyturbo` reserves `pyturbo.pages.dev`.
Both production and preview environments use Node 24 and pnpm 12.15.0, with
`pnpm build` and output directory `dist`. A successful preview and production
deployment remain to be verified. The GitHub Projects board is still pending;
the current CLI authorization lacks its Projects scope. The owner approved the
repository-level Actions permission needed for release PR creation; it is enabled
while default workflow token permissions remain read-only.

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
8. Confirm the final logo/icon, complete launch assets, owner review, versioning/release work, and any
   explicitly authorized announcements or optional analytics.

The implementation spans areas from several roadmap phases. No phase is fully
complete until its exit criteria and verification gates pass. The
[source plan](project-plan.md) remains the roadmap.
