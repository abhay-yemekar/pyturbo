"""Rebuild the CC BY-SA 4.0 VGA atlas from VileR's unmodified font.

Requires Python and fontTools; these are authoring tools, not app dependencies.
Run from any directory: python src/engine/renderer/build_atlas.py
No platform font rasterizer is involved: pixel centres are tested against the
font's axis-aligned outlines using the nonzero winding rule.
"""

import hashlib
import json
from pathlib import Path

from fontTools.ttLib import TTFont


ROOT = Path(__file__).resolve().parents[3]
FONT = ROOT / "public/fonts/Px437_IBM_VGA_9x16.ttf"
OUTPUT = FONT.with_suffix(".atlas.json")
CONTROL = " ☺☻♥♦♣♠•◘○◙♂♀♪♫☼►◄↕‼¶§▬↨↑↓→←∟↔▲▼"
GLYPHS = CONTROL + "".join(chr(i) for i in range(32, 127)) + "⌂" + bytes(range(128, 256)).decode("cp437")


def winding(x, y, contours):
    result = 0
    for contour in contours:
        for (x1, y1), (x2, y2) in zip(contour, contour[1:] + contour[:1]):
            cross = (x2 - x1) * (y - y1) - (x - x1) * (y2 - y1)
            if y1 <= y < y2 and cross > 0:
                result += 1
            elif y2 <= y < y1 and cross < 0:
                result -= 1
    return result != 0


def build():
    font = TTFont(FONT)
    units = font["head"].unitsPerEm // 16
    assert units * 16 == font["head"].unitsPerEm
    baseline = font["hhea"].ascent
    cmap = font.getBestCmap()
    glyphs = []
    for code, character in enumerate(GLYPHS):
        glyph = font["glyf"][cmap[ord(character)]]
        coordinates, endpoints, flags = glyph.getCoordinates(font["glyf"])
        assert all(flag & 1 for flag in flags), "Expected straight pixel-outline contours"
        assert all(x % units == 0 and y % units == 0 for x, y in coordinates)
        contours = []
        start = 0
        for end in endpoints:
            contours.append(list(coordinates[start:end + 1]))
            start = end + 1
        rows = []
        for y in range(16):
            row = 0
            for x in range(9):
                if winding((x + 0.5) * units, baseline - (y + 0.5) * units, contours):
                    row |= 1 << x
            if 0xC0 <= code <= 0xDF:
                row = (row & 0xFF) | (((row >> 7) & 1) << 8)
            rows.append(row)
        glyphs.append(rows)
    assert len(glyphs) == 256
    assert glyphs[0xDB] == [511] * 16
    assert glyphs[0xBA] == [108] * 16  # Two distinct vertical bars, never a solid stripe.
    payload = {
        "width": 9,
        "height": 16,
        "license": "CC-BY-SA-4.0",
        "author": "VileR",
        "source": "https://int10h.org/oldschool-pc-fonts/",
        "fontSha256": hashlib.sha256(FONT.read_bytes()).hexdigest(),
        "glyphs": glyphs,
    }
    OUTPUT.write_text(json.dumps(payload, separators=(",", ":")) + "\n", encoding="utf-8")
    print(f"Wrote {OUTPUT}: 256 glyphs, 9x16, deterministic outline rasterization")


if __name__ == "__main__":
    build()
