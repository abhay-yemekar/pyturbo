# PyTurbo VGA font

`Px437_IBM_VGA_9x16.ttf` is an unmodified font by **VileR** from The Ultimate
Oldschool PC Font Pack v2.2 (2020-11-21).

- Original project: <https://int10h.org/oldschool-pc-fonts/>
- Author documentation and licensing: <https://int10h.org/oldschool-pc-fonts/readme/>
- Licence: **Creative Commons Attribution-ShareAlike 4.0 International**, included
  in `LICENSE.txt`. This font is separate from PyTurbo's MIT-licensed code.
- Source download: the official archive returned HTTP 403 during setup, so these
  unmodified files were retrieved from the public `susam/pcface` redistribution,
  pinned to commit `8629ba46b73f58ac88cacbe8e77c6e9975dd221c`:
  <https://github.com/susam/pcface/tree/8629ba46b73f58ac88cacbe8e77c6e9975dd221c/src/font/oldschool>
- Font SHA-256:
  `6e28fafe0d5d85a4697eeb34c3a408c96cda863a7350ef5d05df76878c030184`

`Px437_IBM_VGA_9x16.atlas.json` contains a prebuilt, platform-independent 9×16
bitmap atlas derived from the font's exact axis-aligned outlines. Pixel centres
are evaluated with the nonzero winding rule, avoiding browser antialiasing and
hinting. CP437 positions C0h–DFh explicitly repeat pixel column eight into column
nine. This derived atlas retains the font's CC BY-SA 4.0 licence and credits.

To reproduce the atlas, run `python src/engine/renderer/build_atlas.py` from the
repository root with Python and fontTools available. This is an authoring-only
tool; visitors need neither. The JSON includes the source font's SHA-256.

The renderer loads the local font and atlas before painting. It copies masks
with integer pixel coordinates and smoothing disabled. Full screens still
require comparison against the original IDE; pixel fidelity is not yet
certified. Characters outside CP437 use the browser's fallback font in a single
cell and have no VGA fidelity guarantee.
