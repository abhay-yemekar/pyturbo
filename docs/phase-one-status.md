# Phase 1: Turbo shell and Run

Updated on 3 November 2026. Phase 1 is the next stage in the
[agreed roadmap](project-plan.md#phase-1-turbo-shell--run-mvp-4-weeks).
Its core features are implemented; this page tracks the evidence needed to
certify the MVP. **Phase 1 is not complete.**

| Roadmap task                                                                      | Current evidence                                                                               | Remaining verification                                                             |
| --------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| Engine, windows, frames, menus, dialogs, controls and mouse                       | Renderer/unit contracts, native-grid/scaling and shell browser cases                           | Complete MVP reference screens and control states                                  |
| Eleven menus with labels, hints and disabled commands                             | Shell tests, independently measured menu-bar cells and pull-down corrections                   | Remaining caption/hint/state comparisons and native shortcut capture               |
| Typing, movement, selection, undo, syntax colors and position/modified indicators | Editor cases across three engines; owner-tested typing/output fixes; deployed indicator PR #54 | Native clipboard/IME, device checks and remaining original interaction comparisons |
| Run, User Screen, input, reset and Stop                                           | Real worker Python, shared-buffer/fallback input, completed output and interrupt tests         | Complete student workflow and native shortcut/device checks                        |
| Messages, source tracking and compile dialog                                      | Traceback parser/unit and real runtime cases; owner-tested caret fix #55                       | CI and delivery of #55; complete compile/error-to-source journey                   |
| New/Open/Save/Save As/Save All, upload/download and file dialog                   | Storage, persistence, save-race/failure and editor browser tests                               | Combined file workflow and dialog fidelity                                         |
| Share link and About                                                              | Unicode share and source-preservation cases; About keyboard checks                             | Final MVP review and full-screen baselines                                         |

## Current delivery task

Issue #55 synchronizes native text editing after Message-window navigation.
Previously, the displayed error caret could move while subsequent typing used
the previous input position. The local correction passes Space, Enter,
double-click, reopened-target and unsaved-draft cases in Chromium, Firefox and
Playwright WebKit. The owner confirmed the local fix and authorized publication
on 3 November. Full PR CI and deployment remain delivery gates; the pull request
records their results.

## Exit evidence still needed

The plan's MVP exit is a complete student journey: **write → run → handle input →
follow/fix an error → save/reopen → share**, with the Turbo-style golden screens
passing. Existing component/workflow tests establish many individual steps;
their presence alone does not certify that entire exit criterion.

Phase 0 remains open in its [foundation checklist](phase-zero-status.md).
The owner approved continuing implementation while real-device gates remain
explicitly open. Engine automation does not certify native browser/OS shortcuts,
Safari/macOS/iOS, Android or physical keyboard/IME behavior.
