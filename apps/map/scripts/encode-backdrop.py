#!/usr/bin/env python3
"""Re-encode a generated map-backdrop PNG to the JPEG the app actually ships.

Promoted to a named script 2026-09-09 (/wrap) after the exact same PIL invocation
(convert to RGB, save JPEG quality=85) was run by hand twice for Bharatkshetra --
once when docs/plans/28.md first shipped the backdrop, once when the owner swapped in
a new AI-generated image. PROGRESS.md's Backlog section expects this same step again
for a future colony or a future Bharatkshetra texture redo.

Usage: python scripts/encode-backdrop.py <source.png> <colonyId>
Writes src/assets/backdrops/<colonyId>.jpg (quality 85, matching every backdrop
already shipped -- update apps/map/src/config/mapBackdrop.json's transform/
imageWidth/imageHeight and mapBackdrops.ts's BACKDROPS map separately; this script
only does the image re-encode, not the wiring.
"""

import os
import sys

from PIL import Image

QUALITY = 85


def main() -> int:
    if len(sys.argv) != 3:
        print(f"usage: {sys.argv[0]} <source.png> <colonyId>", file=sys.stderr)
        return 1

    src, colony_id = sys.argv[1], sys.argv[2]
    if not os.path.isfile(src):
        print(f"error: source file not found: {src}", file=sys.stderr)
        return 1

    dest_dir = os.path.join(os.path.dirname(__file__), "..", "src", "assets", "backdrops")
    dest = os.path.join(dest_dir, f"{colony_id}.jpg")

    im = Image.open(src).convert("RGB")
    im.save(dest, "JPEG", quality=QUALITY)

    src_bytes = os.path.getsize(src)
    dest_bytes = os.path.getsize(dest)
    print(f"{src} ({im.size[0]}x{im.size[1]}, {src_bytes:,} bytes) -> {dest} ({dest_bytes:,} bytes, q{QUALITY})")
    print(f"imageWidth={im.size[0]} imageHeight={im.size[1]} -- update mapBackdrop.json with these")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
