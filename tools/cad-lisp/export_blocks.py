#!/usr/bin/env python3
"""Export each named block definition in a DXF to its own standalone preview DXF, so you
can open each one in AutoCAD and recognize which phase it is before deciding where to
INSERT it into the combined drawing (tools/cad-lisp/README.md). Only useful against a
combined/assembled DXF that has orphaned block definitions -- geometry that exists in
the block table but was never placed in modelspace.

Usage:
    python export_blocks.py path/to/combined.dxf
    python export_blocks.py path/to/combined.dxf --min-entities 20 --out-dir previews/
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

import ezdxf
from ezdxf.document import Drawing

MIN_ENTITIES_DEFAULT = 10  # skip tiny blocks (arrowheads, hatch patterns, title stamps)


def main() -> int:
    args = _parse_args()
    src = ezdxf.readfile(args.dxf)
    out_dir = args.out_dir or args.dxf.with_name(f"{args.dxf.stem}-block-previews")
    out_dir.mkdir(parents=True, exist_ok=True)

    written: list[tuple[str, int, Path]] = []
    for block in src.blocks:
        if block.name.startswith("*"):
            continue  # anonymous/system blocks (hatch boundaries, dimension groups, ...)
        entities = list(block)
        if len(entities) < args.min_entities:
            continue
        out_path = out_dir / f"{_safe_name(block.name)}.dxf"
        _write_preview(src, entities, out_path)
        written.append((block.name, len(entities), out_path))

    if not written:
        print(f"export_blocks: no block with >= {args.min_entities} entities found.")
        return 1

    print(f"export_blocks: wrote {len(written)} preview(s) to {out_dir}")
    for name, count, path in written:
        print(f"  {name!r}: {count} entities -> {path.name}")
    return 0


def _parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("dxf", type=Path, help="the combined/assembled DXF to scan for orphaned blocks")
    p.add_argument("--min-entities", type=int, default=MIN_ENTITIES_DEFAULT)
    p.add_argument("--out-dir", type=Path, default=None, help="default: <dxf>-block-previews/")
    return p.parse_args()


def _write_preview(src: Drawing, entities: list, out_path: Path) -> None:
    doc = ezdxf.new(dxfversion=src.dxfversion)
    doc.header["$INSUNITS"] = src.header.get("$INSUNITS", doc.header["$INSUNITS"])
    doc.header["$MEASUREMENT"] = src.header.get("$MEASUREMENT", doc.header["$MEASUREMENT"])
    msp = doc.modelspace()
    skipped = 0
    for entity in entities:
        try:
            msp.add_foreign_entity(entity.copy())
        except Exception:
            skipped += 1  # entity type not supported standalone (e.g. ATTDEF) -- not fatal
    doc.saveas(out_path)
    if skipped:
        print(f"  ({out_path.name}: skipped {skipped} entity(ies) that don't copy standalone)")


def _safe_name(name: str) -> str:
    return "".join(c if c.isalnum() or c in "-_ " else "_" for c in name).strip() or "block"


if __name__ == "__main__":
    sys.exit(main())
