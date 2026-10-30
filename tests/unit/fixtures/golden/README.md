# Shell implementation cell contracts

The text fixtures were captured from PyTurbo's actual File-menu and Open-dialog
drawing methods on 27 October 2026 and inspected as text/attribute grids. They
preserve the current implementation against unintended changes.

Those two text fixtures are **not** transcriptions of the original Turbo C++ IDE and are **not**
owner-approved fidelity references. The original-IDE comparison remains open.

Each text file contains a provenance line followed by 25 pairs of rows: 80 Unicode
cell characters, then their 80 hexadecimal VGA attribute bytes. Shadows retain
the underlying desktop characters and change their attributes to `08`.

Review intentional changes before updating with:

```powershell
pnpm exec vitest run tests/unit/shell-golden.test.ts --update
```

Do not replace these with Borland screenshots or claim that a passing fixture
establishes exact Turbo C++ geometry, palette defaults, or interaction behavior.

`menu-bar.cells.json` is separate: its single row was independently transcribed
from the original File-selected menu bar on 27 October 2026. Pixel probes verify
the caption columns and foreground/background colors. Blank-cell foreground
uses the menu palette. This is a text/attribute contract, not an owner-approved
full-screen bitmap baseline; the reference 8×16 and agreed 9×16 fonts differ.
Review this reference against the source rather than regenerating it from the
implementation.

`menu-disabled.colors.json` contains independently measured Color-mode menu
attributes from the original Turbo C++ 3.0 on 30 October 2026. Selection Bar and
Disabled Entry were customized separately; enabled Arguments and unselected
disabled entries confirmed that the changes took effect. Selected disabled Run
and Program reset retained `08` in all three recorded cases. The private loader
omitted the broken web text-input wrapper and loaded the unchanged original DOS
bundle; its SHA-256 is recorded in the fixture. This is a palette-state contract,
not a full-screen or other-video-mode baseline. Do not regenerate its facts from
PyTurbo's output.
