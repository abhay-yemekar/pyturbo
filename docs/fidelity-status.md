# Fidelity and Phase 0 verification

The implementation follows the agreed PyTurbo plan. The original Turbo C++ IDE
has **not** yet been compared pixel for pixel with this implementation. Passing
unit tests establish the contracts below; they do not certify overall visual
fidelity or complete Phase 0.

## Verified at the engine milestone

- `CellBuffer` stores Unicode glyphs and VGA attribute bytes in an explicit cell
  grid. Native canvas dimensions are 9×16 pixels per cell, giving 720×400 for
  80×25. Writes clip to the grid instead of spilling into adjacent rows.
- Unit tests cover frame geometry, clipping, source-character retention under
  `0x08` shadows, narrower shadows in 43/50-line mode, hardware palette indexes,
  all CP437 positions, and dispatch to the topmost eligible view. Nine engine
  unit tests passed locally on 26 October 2026.
- The 256-glyph atlas is generated directly from the licensed font outlines.
  Tests assert the one-pixel gap between double vertical bars and the ninth
  column rule for C0h–DFh. The full block occupies all 9×16 pixels.
- A local headless Chrome font probe measured 9px advance and a 16px full-block
  height at the native 16px size. It also exposed antialiasing that closed the
  gap in double vertical frames when alpha was thresholded at 128. CP437 now
  uses the deterministic prebuilt atlas, avoiding that browser rasterizer issue.
- The local font, full licence, pinned retrieval source, SHA-256 and atlas
  reproduction instructions are in `public/fonts/README.md`. Font and derived
  atlas remain CC BY-SA 4.0; application code remains MIT.

## Implemented foundations requiring integration validation

- Dirty-cell canvas repaint, previous-cursor restoration, underline/block
  cursors and palette-colour pixel output.
- View, Group, Window and Dialog rendering primitives, plus basic Label,
  Button, InputLine and ListBox drawing. These are building blocks; full control
  editing, focus navigation and Turbo dialog interaction require integration.
- The default application/editor palettes are transcribed from the plan. The
  plan's IDE-specific Output/Message/Watch/Help defaults and selected-disabled
  menu colour remain subject to reference verification.
- COOP/COEP headers are configured in Vite development/preview and Pages
  `_headers`. The Pages preview response headers, CDN loading, live input,
  Stop and debugger checks pass; evidence is in `implementation-status.md`.
  Production and broader browser/device checks remain separate gates.

## Rendering corrections and automated shell checks, 27 October 2026

- Manual source scrolling now persists across cursor blinks. Caret visibility
  is adjusted by editing/navigation actions rather than by every repaint.
- Source layout, line offsets and semantic highlighting are cached until the
  source or relevant options change; repaint visits only visible source lines.
  This removes repeated whole-file parsing during idle cursor blinking. The
  plan's measured 60fps and load-time budgets still require profiling.
- Non-BMP characters occupy one rendered cell while editor offsets remain
  UTF-16. A browser regression checks the exact VGA bitmap immediately after an
  emoji and verifies pointer placement at the correct UTF-16 offset.
- Horizontal and vertical scrollbars now render a track/thumb from content
  extent. Help, Watch and Project rendering consumes per-window scroll and
  selection state. Monochrome suppresses window/menu/dialog/button shadows.
- Semantic token roles distinguish symbols from normal text even though both
  factory defaults are yellow. Changing a declared colour role now affects its
  rendered text, menu, status line, window or dialog instead of being lost in
  reverse lookup of an attribute byte.
- The initial eight shell cases passed in Chromium, Firefox and Playwright
  WebKit (**24 checks**): native 720×400 canvas and 16-colour output, integer
  2×/3× scaling, File/New before Python is ready, About hotkeys, modal focus,
  accessible-button Enter activation, wheel scrolling, phone alternatives and
  a structural axe scan. The UI tests deliberately hold Python loading;
  runtime execution is tested separately. Passing axe does not establish
  screen-reader or complete keyboard usability.
- Additional Chromium checks passed for exact non-BMP cell placement,
  independent symbol/menu customization through Colors, and suppression of
  dialog shadows in monochrome. Their final cross-browser results belong in
  the final validation record.
- Actual 80×25 File-menu and Open-dialog text/attribute fixtures are stored in
  `tests/unit/fixtures/golden/`. They are captured implementation contracts,
  clearly marked as unapproved for original-IDE fidelity. Native shell PNGs
  from Playwright are also evidence of current output, not approved references.

The Colors dialog still uses a flat list of the implemented roles. It does not
yet reproduce the original group hierarchy or every independently configurable
Turbo control palette. The original monochrome focus-marker behavior, complete
control focus/pressed states and narrow-screen dialog geometry still need
reference and usability verification.

## Reference comparison still required

Capture original IDE screens privately; the plan excludes Borland screenshots
from the repository and shipped assets. Compare the following at native size,
then verify integer 2× and 3× rendering:

- Main desktop, menu bar, status line, active/inactive editor frames.
- Every pull-down menu and submenu, including disabled selections and shadows.
- Open, About, Colors and Compiling dialogs and each control focus state.
- Message/Watch/Output windows, source tracking and debugger execution bars.
- 25/43/50-line modes, fit modes, modified indicator and all scrollbar states.

Current golden unit assertions include small geometry fixtures and captured
80×25 shell cell contracts. They are not owner-approved full-screen baselines
transcribed from the original IDE.

## Keyboard capture matrix

The matrix is pending actual browser/OS testing. Calling `preventDefault()` in
the application does not establish that a browser or OS reserved key was
captured. Playwright WebKit also does not establish behaviour on real Safari or
iOS. Menus and visible controls must remain usable for unavailable shortcuts.

| Key group                                  | Chrome/Windows                   | Edge/Windows                     | Firefox/Windows       | Safari/macOS          | Safari/iOS                    |
| ------------------------------------------ | -------------------------------- | -------------------------------- | --------------------- | --------------------- | ----------------------------- |
| F1/F3/F5/F6/F10/F11                        | Pending                          | Pending                          | Pending               | Pending               | No physical F-keys by default |
| Alt+letter menus, Alt+F1/F3/F4/F5/F7/F8/F9 | Pending                          | Pending                          | Pending               | Pending               | Pending hardware keyboard     |
| Ctrl+F1–F9, Ctrl+W/T/N/Tab                 | Pending                          | Pending                          | Pending               | Pending               | Pending hardware keyboard     |
| Ctrl+K/Q WordStar sequences                | Pending                          | Pending                          | Pending               | Pending               | Pending hardware keyboard     |
| Clipboard and IME                          | Pending                          | Pending                          | Pending               | Pending               | Pending                       |
| Fullscreen Keyboard Lock                   | Pending support/permission check | Pending support/permission check | Pending support check | Pending support check | Pending support check         |

Real Android Chrome, phone landscape layout, touch controls, screen readers,
performance budgets and offline runtime/package behaviour remain separate
verification tasks. Characters outside CP437 currently use a single-cell
browser-font fallback, which has no VGA fidelity guarantee.
