# Phase 0 checklist

Updated on 30 October 2026. **Phase 0 is not complete.** This checklist tracks
the five foundation tasks and exit criteria in the
[agreed roadmap](project-plan.md#phase-0-foundations-and-spikes-1-week).
Implemented features from later phases do not close these verification gates.

| Foundation task                                                                | Status   | Evidence and remaining work                                                                                                                                                                                                                                                                       |
| ------------------------------------------------------------------------------ | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Repository, licence, CI, hooks and Pages with COOP/COEP                        | Verified | Personal repository, MIT source licence and separate font notice, required checks, previews and production are working. PR #47 passed all five required jobs, CodeQL and Pages; production returned HTTP 200 with isolation headers.                                                              |
| Licensed 9×16 atlas, canvas renderer, integer scaling and reference comparison | Partial  | Native 720×400 and integer 2×/3× rendering are tested. Original menu-bar cells and three pull-down widths were measured independently. Complete desktop/menu/status-line reference baselines remain open.                                                                                         |
| Worker Python, shared-buffer input and interrupts on a preview                 | Verified | Deployed runtime checks exercised real Python print/input, infinite-loop recovery and Stop during input/debugger waits. Full CI continues to cover these paths. The nine latest production smoke cases include real input and fresh output; they do not independently repeat every Stop scenario. |
| Native shortcut matrix in four browsers and fullscreen Keyboard Lock           | Partial  | Windows Chrome spot checks are recorded below. Remaining Chrome keys, Edge, Firefox, Safari and native fullscreen/Keyboard Lock checks remain open.                                                                                                                                               |
| Final palette tables and golden-screen format                                  | Partial  | Palette tables, all 20 observed Colors groups and text/attribute fixture format exist. The measured Color-mode selected-disabled correction shipped in PR #50. The normal status row has an independent fixture and local browser checks; complete original-screen baselines remain open.         |

The plan's exit criteria have two parts:

- **Python prints and reads input on a deployed preview: verified.** See the
  [runtime and deployment record](implementation-status.md#repository-and-hosting).
- **The menu bar, desktop and status line match the original visual target:
  open.** The owner retained the plan's 720×400, 9×16 grid after observing the
  reference emulator's 640×400, 8×16 grid. Those different fonts prevent a claim
  of literal pixel equality. Independent cell/palette measurements and full
  screen verification are still required within that agreed choice. The menu-bar
  row and normal ready-editor status row have independent cell facts; complete
  desktop/window baselines remain open.

## Latest delivered comparison

[PR #47](https://github.com/abhay-yemekar/pyturbo/pull/47) corrects the measured
Run, Compile and Debug widths and renders menu ellipses as three VGA period
cells. All **267 browser CI cases** passed in the
[final CI run](https://github.com/abhay-yemekar/pyturbo/actions/runs/40872169877)
across Chromium, Firefox and
Playwright WebKit. Nine Chromium smoke cases passed on its exact Pages preview,
then nine passed on production after merge `60da202`.

The [fidelity record](fidelity-status.md#pull-down-comparison-29-october-2026)
separates measured original facts from PyTurbo's own implementation snapshots.
These results establish the tested behavior, not complete original-IDE fidelity
or certification of physical browser shortcuts.

[PR #50](https://github.com/abhay-yemekar/pyturbo/pull/50) delivered the measured
selected-disabled Color-mode attributes and illustrated manual after owner
testing. All 270 browser CI cases and required checks passed; ten exact-preview
and ten production Chromium smoke cases passed after merge `8f6f3e0`.

The normal ready-editor status row now has a reference fixture and three passing
browser checks. CI and deployed evidence is recorded in the PR validation record. This does not close the complete
desktop or native shortcut gates.

## Native Chrome spot checks, 29 October 2026

These checks used Windows native keyboard input in a separate Chrome Incognito
window on the exact PR #47 preview, source `2f55803`. They did not use Playwright
key dispatch. The installed Chrome version was not recorded. Incognito is not
asserted to isolate globally assigned extension shortcuts, so these observations
are a partial matrix entry rather than a clean-profile compatibility result.

| Input               | Observed result                                                                |
| ------------------- | ------------------------------------------------------------------------------ |
| F1                  | PyTurbo Help opened.                                                           |
| F3, then Escape     | Open a File opened, then cancelled.                                            |
| F5                  | The editor zoomed without a browser reload.                                    |
| F6                  | The editor cycled to the front from Help.                                      |
| F10                 | The last-used Run menu opened.                                                 |
| Alt+R               | Run opened.                                                                    |
| Alt+C               | Compile did not open; the owner had identified an extension shortcut conflict. |
| Right with Run open | Compile opened, providing a menu-navigation alternative.                       |
| Ctrl+T              | Chrome opened a new browser tab.                                               |

No F11, Alt+F4, Ctrl+W/N/Tab, native clipboard/IME or fullscreen Keyboard Lock
result is claimed. Browser control stopped when it could no longer reliably
verify the active URL. Native testing paused at that point; no further UI input
was sent. Source and extension settings were not changed.

Playwright Chromium/Firefox/WebKit results remain useful engine checks. They do
not establish native shortcut capture, real Safari/macOS/iOS behavior, Android
behavior or physical hardware-keyboard usability. The owner approved continuing
implementation while real-device gates stay explicitly open.

## Work needed to close Phase 0

1. Complete private comparisons of desktop, other menu/status contexts, menu states and
   native scaling. Commit independently transcribed facts and PyTurbo baselines;
   keep original-IDE images and binaries out of the repository and shipped app.
2. Complete the [native shortcut matrix](fidelity-status.md#keyboard-capture-matrix),
   recording browser/OS versions, focus, conflicts and fullscreen/Keyboard Lock
   support. Keep unavailable-device results open.
3. Review the evidence against every Phase 0 task and exit criterion before
   closing [issue #1](https://github.com/abhay-yemekar/pyturbo/issues/1) or marking
   the phase complete. A live site and green automated checks alone are
   insufficient.

The broader [implementation status](implementation-status.md) tracks later-phase
features and launch gates. The automated 0.1.0 release PR remains an unpublished
draft; completing Phase 0 does not itself authorize publishing a release.
