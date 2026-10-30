# Implementation and verification status

Updated on 30 October 2026. Source coverage and
verified behavior are different. This is not a completed v1 launch checklist.

For usage instructions, see [PyTurbo’s Manual](manual/README.md). The
[Phase 0 checklist](phase-zero-status.md) records each foundation task, its
evidence and its remaining exit checks. **Phase 0 is not complete.**

## Position against the roadmap

The agreed stack and scope remain in place. Implementation has crossed phase
boundaries to address the owner's reported bugs, requested manual and approved
update action. No phase is certified complete while its exit checks remain open.

| Plan phase                     | Delivered or implemented                                                                                                                 | Still open                                                                                   |
| ------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| 0 — Foundations                | Personal GitHub repository, CI/security settings, private task board, Pages production/previews, VGA renderer and browser Python         | Original-IDE visual baselines and real browser/OS shortcut matrix                            |
| 1 — Turbo shell and Run        | Menus, windows, editor, compile/run/input/Stop, messages, browser file storage and sharing; accepted typing/output/save fixes            | Complete visual and real-device verification                                                 |
| 2 — Feature parity             | Window management, search, packages/plots, Colors/preferences, Help, arguments and persistent editor options; deployed F/R options (#44) | Remaining parity verification                                                                |
| 3 — Debugger and nostalgia     | Trace/step/breakpoints, watches/evaluate/stack, multi-file projects and conio/graphics/turtle bridges                                    | Complete debugger/graphics interaction and compatibility checks                              |
| 4 — Polish, mobile and offline | Base offline runtime, DOS/touch controls, illustrated public manual, deployed safe updates (#41) and cursor choices (#43)                | Mobile/real-device checks, accessibility and performance budgets                             |
| 5 — Launch                     | Release automation and an unpublished draft 0.1.0 proposal                                                                               | Final release gates, branding/launch assets and explicit publication decision; no v1 release |

Safe updates, cursor styles, the F/R editor options and the measured **pull-down
menu geometry and VGA punctuation correction (#46, PR #47)** passed owner review,
PR CI and deployed checks. Current work closes the remaining Phase 0 visual and
native-browser verification gaps. Selected-disabled color customization is
delivered in #45 / PR #50. Current verification adds an independently measured
ready-editor status row while broader desktop and native shortcuts remain open. The original
plan is preserved as a dated reference; [decisions.md](decisions.md) records
approved changes such as Enter-only output return and clearing each new run.

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
- All **88 unit tests** pass on the current local revision, including reference palettes,
  editor/storage behavior and system-shortcut handling. Coverage is measured
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
undo, settings and reloads. Optimal Fill and Cursor Through Tabs were deferred
to #33; their current local status is recorded below.
Screen preferences apply their layout before waiting for IndexedDB persistence,
so an immediate Zoom command uses the newly selected screen dimensions.
PR #32 passed all 150 browser cases, all other required checks, CodeQL and Pages,
and was merged as `5181929`. Seven production Chromium editor checks pass for
settings, persistence, tab stops and viewport navigation.

Saving now records the exact persisted source as its baseline. New edits made
while IndexedDB completes remain modified, with an accurate status message and
the close/save warning intact. A deterministic browser test delays save completion
while the user edits and checks both stored content and the newer in-memory buffer.

PR #37 passed all **198 browser cases**, the remaining required checks, CodeQL,
and Pages, then merged as `c4d15d7`. Six checks on its exact Pages preview passed
for typing after pointer clicks, fresh output/separate Enter footer, system-key
dispatch, stable run targets, failed Save As, and delayed save completions. The
owner also tested and accepted the local fixes. Native Windows screenshot capture
and real-device/OS gates remain open; synthetic key events and stubbed Keyboard
Lock do not establish those results. A stopped local preview was separately
reproduced serving an earlier offline-cached build, then recovered by restarting
the server and reopening the saved workspace. Production verification of this
revision remains a separate deployment check.

PR #39 added the public illustrated manual, its Help-menu link, five original
PyTurbo screenshots and a browser regression for opening it without losing the
source editor. All **201 browser cases**, the other required jobs, CodeQL and
Pages passed before it merged as `d9c7c59`. Three Chromium checks passed on its
exact Pages preview and again on production for the manual link and completed
output behavior. Production served that merged bundle with HTTP 200 and the
required isolation headers. This establishes those checks, not full product or
real-device certification.

Issue #40 adds detection of a waiting app version without
automatically reloading. The explicit action saves open files/settings, waits
for active programs/dialogs/input, and retains the editor on save failures or
workspace changes. Lint, strict typecheck, all 67 unit tests and the production
build pass. An initial full run passed 229 of 231 browser cases. It exposed a
Colors test that navigated before its asynchronous storage commit and a Vite
preview 304 response that omitted isolation headers, blocking a WebKit worker
restart. The test now observes the commit; preview middleware applies the same
security headers before conditional static responses. All **36 focused checks**
then pass across Chromium, Firefox and Playwright WebKit, covering all update
cases, Colors persistence and conditional-response headers. The final expanded
234-case suite was not rerun locally as a whole. Its CI result must be recorded
in the PR before merge. The owner has since accepted the manual update test.

Separate real service-worker upgrade checks pass at desktop size and in a narrow
Fill layout: the cached version stays open until the action is chosen, then the
replacement loads with saved source intact. Those upgrade-only checks stub Python;
the browser suite separately exercises real Python input, debugger/reset and shell
guards. Production delivery must be verified after merge. Older installed copies
need the manual's one-time reopen steps to first acquire this update action.

PR #41 subsequently passed all **234 browser CI cases**, the other required jobs,
CodeQL and Pages, then merged as `9ba7ed9`. Thirteen Chromium scenarios passed
on its exact preview and production, including real Python, output, the manual
link and controlled update cases. Real Workbox two-version updates were checked
separately in the owner-tested local demo. PR #43 added optional cursor styles and
the illustrated manual entry; all **240 browser CI cases**, required checks,
CodeQL and Pages passed before merge `d2fa83e`. Four preview and four production
Chromium scenarios pass for cursor rendering/modes/persistence, the manual link
and real Python input. Both features are deployed on the public site.

Issue #33 implements F/R preferences and shortcuts with the
approved defaults. Virtual tab positions preserve source during navigation and
support visual selection, clipboard/IME input, pointer placement, scrolling,
undo and bookmarks. Optimal Fill packs edited leading whitespace on line change,
including completed pasted lines, while preserving untouched imported lines and
interior text. Find/replace-all remaps affected positions. Clipboard operations
cannot delete later edits or paste into a changed target while permission is
pending; repeated-character overwrite uses the intended native caret.
All 15 focused tab cases pass across the three engines. The full local run passed
254 of 255 cases; its Fill paging fixture expected a fixed height even when an
update notice reduced the text body. That fixture now blocks service workers;
separate controlled update tests check both the reduced page size and intentional
scrolling. They also reproduced a hidden bottom-row caret after the notice
appeared. Resizing now keeps a previously visible caret onscreen while preserving
a view deliberately scrolled away from it. All **54 final affected browser
checks** pass across Chromium, Firefox and Playwright WebKit. Lint, typecheck,
88 unit tests, production build and 71 manual links/anchors pass. The owner
accepted the local changes. PR #44 then passed all **261 browser CI cases** on
`0f8b622`, all other required checks, CodeQL and Pages, and merged as `0147837`.
Twelve Chromium cases pass on both its exact preview and production, including
F/R editing/settings, clipboard, virtual scrolling, cursor styles, the manual,
real Python input/output and update-notice layout. Production serves
`index-CZ6KJF4s.js` with COOP/COEP; the illustrated manual is present on GitHub.
The original local folder was safely fast-forwarded after clean-main verification.
The first CI run's six layout assertions assumed a Windows notice height; the
final checks measure available height and pass with Linux system fonts too.

PR #47 closes #46, correcting the three measured menu widths and rendering menu
ellipses as three VGA period cells. Both new Chromium cases reproduced the old differences
before the source correction. The File-menu snapshot changes only five caption
rows, with no attribute changes. All **69 affected shell/window browser checks**
pass across Chromium, Firefox and Playwright WebKit, alongside lint, strict
typecheck, 88 unit tests, build and manual links. After the owner's go-ahead,
all **267 browser CI cases**, the other required checks, CodeQL and Pages passed
on `2f55803`. Nine Chromium smoke cases passed on its exact Pages preview, then
nine passed on production after squash merge `60da202`. Production serves
`index-wmcQk0c3.js` with COOP/COEP; the public manual includes extension-shortcut
guidance and PyTurbo's Run-menu screenshot. The clean original local folder was
safely fast-forwarded to that merge. Native Chrome spot checks are documented in
the [Phase 0 checklist](phase-zero-status.md#native-chrome-spot-checks-29-october-2026).
No whole-product or full original-IDE fidelity claim follows from these checks.

PR #50 closes #45 with controlled original-IDE Color-mode measurements: selected
disabled entries retain `08`, independently of customized Selection Bar and
Disabled Entry roles. Three new reference-driven unit cases reproduced the old
differences before the correction. Lint, strict typecheck, all 91 unit tests,
configured coverage and the production build pass. The new browser scenario
passes in Chromium, Firefox and Playwright WebKit, checking default/custom roles,
disabled activation and preserved source. All 51 affected shell cases pass across
those engines, and all 90 local documentation links/anchors pass. The owner
confirmed the local highlight and disabled Enter behavior. All 270 browser CI
cases, the other required checks, CodeQL and Pages passed on `36fe018`.
Ten Chromium checks passed on the exact preview and again on production after
merge `8f6f3e0`. Production serves `index-Fe3WSatA.js` with COOP/COEP. The public
manual includes the explanation and original PyTurbo screenshot; the clean
original folder was safely fast-forwarded to the merge.

The normal ready-editor status row now has independently measured text/attribute
facts and a pixel regression using PyTurbo's approved licensed atlas. All three
focused browser cases pass locally, including menu-hint restoration and source
preservation. The PR validation record tracks the expanded 273-case CI suite and
deployed checks. This is verification
work with no application behavior or asset change; it does not close the full
desktop, other status contexts or native shortcut gates.

The owner approved a [private PyTurbo board](https://github.com/users/abhay-yemekar/projects/1).
It is configured with Backlog, Ready, In progress, In review and Done, imports
only PyTurbo issues/PRs, and uses this repository as its default. Issue #1 is in
progress and PR #2 has been merged. Private visibility was verified after reload.

The owner approved the
repository-level Actions permission needed for release PR creation; it is enabled
while default workflow token permissions remain read-only.
The first automated release proposal incorrectly selected `1.0.0`. PR #11 fixed
the initial version to `0.1.0`; PR #15 fixed generated-file lint and human-triggered
PR checks. The updated [release proposal](https://github.com/abhay-yemekar/pyturbo/pull/3)
at `efa267f` passes all five required jobs, CodeQL and Pages and remains an
unpublished draft. Its exact manifest/changelog diff was reviewed before routine
workflow approval; no owner action is currently required for those checks.
Subsequent regenerated revisions need their own checks. No v1 release has been published.

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
5. Complete the remaining visual and native shortcut [Phase 0 checks](phase-zero-status.md).
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
