# Phase 1: Turbo shell and Run

Updated on 4 November 2026. Phase 1 is the next stage in the
[agreed roadmap](project-plan.md#phase-1-turbo-shell--run-mvp-4-weeks).
Its core features are implemented; this page tracks the evidence needed to
certify the MVP. **Phase 1 is not complete.**

| Roadmap task                                                                      | Current evidence                                                                                | Remaining verification                                                             |
| --------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| Engine, windows, frames, menus, dialogs, controls and mouse                       | Renderer/unit contracts, native-grid/scaling and shell cases; owner-tested scrollbar #53        | CI/delivery of #53; complete MVP reference screens and control states              |
| Eleven menus with labels, hints and disabled commands                             | Shell tests, independently measured menu-bar cells and pull-down corrections                    | Remaining caption/hint/state comparisons and native shortcut capture               |
| Typing, movement, selection, undo, syntax colors and position/modified indicators | Editor cases across three engines; owner-tested typing/output fixes; deployed indicator PR #54  | Native clipboard/IME, device checks and remaining original interaction comparisons |
| Run, User Screen, input, reset and Stop                                           | Real worker/input/interrupt tests; combined live-input student journey on preview/production    | Native shortcut/device checks and complete golden screens                          |
| Messages, source tracking and compile dialog                                      | Real-Python parser/runtime cases; caret fix #55 delivered in PR #56; combined error/fix journey | Remaining compile dialog and golden comparisons                                    |
| New/Open/Save/Save As/Save All, upload/download and file dialog                   | Storage/save-race/failure tests; combined save, close/reopen and share journey                  | Remaining dialog fidelity and native upload/download review                        |
| Share link and About                                                              | Unicode/source-preservation cases; isolated share recipient ran the corrected input program     | Final MVP review and full-screen baselines                                         |

## Delivered workflow and current task

Issue #55 synchronizes native text editing after Message-window navigation.
Previously, the displayed error caret could move while subsequent typing used
the previous input position. The local correction passes Space, Enter,
double-click, reopened-target and unsaved-draft cases in Chromium, Firefox and
Playwright WebKit. The owner confirmed the local fix and authorized publication
on 3 November. [PR #56](https://github.com/abhay-yemekar/pyturbo/pull/56) passed all
291 browser CI cases and required checks, then merged as `5861c11`. Five affected
Chromium cases passed on both its exact preview and production.

The complete student journey below also passed on preview and production in
Chromium, Firefox and Playwright WebKit with real Python, two live inputs and a
separate share-recipient context. Current local #53 work corrects independently
measured editor scrollbar controls. The owner confirmed the correction and
authorized publication on 4 November; CI and deployment remain delivery gates.

## Exit evidence still needed

The plan's MVP exit is a complete student journey: **write → run → handle input →
follow/fix an error → save/reopen → share**, with the Turbo-style golden screens
passing. The combined journey now has deployed engine evidence, including
keyboard correction of a real error and running the shared program. Complete
golden screens and remaining native/device checks still prevent certification
of the phase.

Phase 0 remains open in its [foundation checklist](phase-zero-status.md).
The owner approved continuing implementation while real-device gates remain
explicitly open. Engine automation does not certify native browser/OS shortcuts,
Safari/macOS/iOS, Android or physical keyboard/IME behavior.
