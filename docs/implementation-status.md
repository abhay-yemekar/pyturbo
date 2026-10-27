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
- All **50 unit tests** pass locally, including the new reference palettes,
  legacy color preferences and independent window roles. Coverage is measured
  separately for the configured scope; it does not cover the entire IDE.
- The production build and PWA generation pass. Production preview applies the
  same CSP and isolation headers as the Pages `_headers` file. Development alone
  allows Vite's injected styles and localhost WebSocket connection.
- The initial full browser run passed **120 of 123 cases**. It covers Chromium,
  Firefox and Playwright WebKit, with actual Python 3.14.2 running in a worker.
  The three failures exposed a textarea selection race and missing waits for
  asynchronous deletion and debugger stepping. After fixes, all **18 regression
  cases** pass: those three scenarios repeated twice in each engine. GitHub CI
  then passed **all 123 browser cases** on `58c0510`, plus all five required jobs
  and CodeQL. Required checks must also pass after subsequent revisions.
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
`pnpm build` and output directory `dist`. The
[first preview](https://1f41908c.pyturbo.pages.dev) deployed successfully. HTTP 200,
COOP `same-origin`, COEP `require-corp`, and the production CSP were verified.
All five deployed Chromium runtime smoke tests pass, covering real Python,
UTF-8 input, infinite-loop recovery, debugger evaluation/resume and Stop while
blocked in input/debugging. The first cold test took about 72 seconds, including
CDN asset downloads measured near 50 seconds; subsequent scenarios took 6–14
seconds. Performance targets remain unverified. Runtime tests now allow two
minutes for initial network loading; the CI browser job has a 30-minute ceiling.
PR #2 was squash-merged as `5d014f6`. The initial production deployment at
[pyturbo.pages.dev](https://pyturbo.pages.dev) returns HTTP 200 with the required
COOP/COEP headers and the same application bundle as the verified preview.
All five Chromium runtime smoke checks also pass on the production origin
(49.6 seconds total): Python execution, UTF-8 input, infinite-loop recovery,
debugger evaluation/resume and Stop during input/debugger waits.

PR #26 replaced repeated Ubuntu browser-library downloads with the official,
version-matched Playwright image pinned by digest. It runs as the image's
non-root browser user, retaining Node 24, pnpm 12.15.0, all three test engines,
required checks, token permissions and the 30-minute ceiling. All 123 browser
cases passed in the corrected CI setup. PR #19's artifact action update then
passed all checks and was merged with an explicit attribution-free message.

PR #24 passed all **129 browser cases**, the other required jobs, CodeQL and
Pages on its final combined revision and was merged as `54e0df4`. Production
serves the new palette bundle with HTTP 200 and isolation headers. All **eight
production Chromium smoke cases** pass (37.9 seconds): the five runtime checks
above plus independent Colors choices, cancellation/persistence and keyboard/
pointer interaction. PR #28's menu-row correction passed all **132 browser cases**,
the other required jobs, CodeQL and Pages, and was merged as `24d2e27`. Five
production UI cases pass for caption placement, Colors and native canvas scaling.

Editor viewport navigation now uses the current text-body height for page keys,
legacy aliases and viewport-boundary shortcuts. Private original-IDE probes verify
one-row page overlap, matching viewport scrolling and preserved source columns in
14-row and 7-row editor bodies. Tests also cover resized windows, 43/50-line and
Fill layouts, selections and file edges. PR #30 passed all **144 browser cases**,
the other required checks, CodeQL and Pages and was merged as `5ae78c0`. All five
production Chromium navigation cases pass on that deployed bundle.

Ctrl+O T/U and matching Editor options now control literal-tab insertion and
Backspace Unindents. The owner's confirmed defaults retain space-only Tab with
four-space stops and enable Backspace Unindents. These toggles and Ctrl+O I update
validated persistent settings across open/new editors. Unit and browser regressions
cover 3/7-space indentation, imported hard tabs, non-BMP columns, selection deletion,
undo, settings and reloads. Optimal Fill and Cursor Through Tabs remain open;
their approved defaults are recorded separately from implementation status.

The owner approved a [private PyTurbo board](https://github.com/users/abhay-yemekar/projects/1).
It is configured with Backlog, Ready, In progress, In review and Done, imports
only PyTurbo issues/PRs, and uses this repository as its default. Issue #1 is in
progress and PR #2 has been merged. Private visibility was verified after reload.

The owner approved the
repository-level Actions permission needed for release PR creation; it is enabled
while default workflow token permissions remain read-only.
The first automated release proposal incorrectly selected `1.0.0`. PR #11 fixed
the initial version to `0.1.0`; PR #15 fixed generated-file lint and human-triggered
PR checks. The updated proposal passes all five required jobs, CodeQL and Pages
and remains an unpublished draft. No v1 release has been published.

Record final command results in the PR validation record or update this file.
Successful builds and small geometry fixtures do not certify the whole product.

## Release gates still open

1. Pass final lint, strict typecheck, unit coverage, production build, and the
   Chromium/Firefox/WebKit suite on the final source.
2. Repeat the verified Pages preview checks on production after its deployment.
3. Privately compare original desktop, menus, dialogs, windows, scrollbars and
   modes. Commit only PyTurbo screenshots/baselines.
4. Complete real browser/OS shortcut tests, Safari/iOS and Android checks. The
   owner approved continuing implementation while these checks remain open.
5. Implement the remaining Ctrl+O F/R options in
   [editor-and-storage.md](editor-and-storage.md).
6. Verify save failures/conflicts, IME, directional selections, clipboard,
   imported/shared projects, repeated modules, output floods and stop while
   waiting for input or debugger commands.
7. Validate graphics/packages, mobile landscape/touch, screen readers, cached
   offline runtime/packages and measured performance budgets.
8. Confirm the final logo/icon, complete launch assets, owner review,
   versioning/release work, and any explicitly authorized announcements or
   optional analytics.

The implementation spans areas from several roadmap phases. No phase is fully
complete until its exit criteria and verification gates pass. The
[source plan](project-plan.md) remains the roadmap.
