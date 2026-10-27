# Shell implementation cell contracts

These fixtures were captured from PyTurbo's actual File-menu and Open-dialog
drawing methods on 27 October 2026 and inspected as text/attribute grids. They
preserve the current implementation against unintended changes.

They are **not** transcriptions of the original Turbo C++ IDE and are **not**
owner-approved fidelity references. The original-IDE comparison remains open.

Each file contains a provenance line followed by 25 pairs of rows: 80 Unicode
cell characters, then their 80 hexadecimal VGA attribute bytes. Shadows retain
the underlying desktop characters and change their attributes to `08`.

Review intentional changes before updating with:

```powershell
pnpm exec vitest run tests/unit/shell-golden.test.ts --update
```

Do not replace these with Borland screenshots or claim that a passing fixture
establishes exact Turbo C++ geometry, palette defaults, or interaction behavior.
