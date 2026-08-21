#!/usr/bin/env python3
"""Insert the missing `-` in a `COL-PLOT-NO` label that already has a valid block letter
and number but no separator between them (e.g. `E14` -> `E-14`), found on Jai Dev
Residency (2026-08-21): `pipeline/matching/assign.py`'s `_LABEL_PATTERN` requires a literal
dash (`^([A-Z]+-)?[0-9]+$`) and rejects `E14` outright rather than guess whether it means
block E number 14 or something else -- by design (docs/cad-layer-standard.md, D-118: the
reader never repairs or guesses).

This IS mechanical, not judgement: a letter run immediately followed by a digit run, with
nothing else in the label, has exactly one possible reading. Splitting `E14` any other way
(e.g. `E1` block, number `4`) is not a real ambiguity here since blocks are always a pure
letter run and numbers are always a pure digit run -- there is no other split point.

Only touches labels matching that exact shape. A label already containing a dash, a bare
number, or anything not cleanly letters-then-digits (e.g. the `24-A` subdivision case) is
left untouched -- if that ever produces something `assign.py` still rejects, it needs a
human decision, not a wider regex here.

Same "work on a copy" contract as the rest of tools/cad-lisp: never edits `--out`-less
in place, writes a new file and logs to `<dxf>-cv-log.txt`.

Usage:
    python fix_plot_label_dashes.py path/to/working.dxf
    python fix_plot_label_dashes.py path/to/working.dxf --out path/to/fixed.dxf
"""

from __future__ import annotations

import argparse
import re
import sys
from datetime import datetime
from pathlib import Path

import ezdxf

_NO_DASH = re.compile(r"^([A-Z]+)([0-9]+)$")


def main() -> int:
    args = _parse_args()
    doc = ezdxf.readfile(args.dxf)
    msp = doc.modelspace()

    fixes: list[tuple[str, str, str]] = []  # (handle, old, new)
    for e in msp:
        if e.dxf.layer != "COL-PLOT-NO" or e.dxftype() not in ("TEXT", "MTEXT"):
            continue
        old_plain = (e.plain_text() if e.dxftype() == "MTEXT" else e.dxf.text).strip()
        m = _NO_DASH.match(old_plain)
        if not m:
            continue
        new_plain = f"{m.group(1)}-{m.group(2)}"

        if e.dxftype() == "MTEXT":
            raw = e.text
            occurrences = raw.count(old_plain)
            if occurrences != 1:
                print(
                    f"fix_plot_label_dashes: {e.dxf.handle} ('{old_plain}') -- plain text "
                    f"appears {occurrences} time(s) in its raw MTEXT content, expected "
                    "exactly 1; skipped rather than guess which one to fix."
                )
                continue
            e.text = raw.replace(old_plain, new_plain, 1)
        else:
            e.dxf.text = new_plain

        fixes.append((e.dxf.handle, old_plain, new_plain))

    if not fixes:
        print("fix_plot_label_dashes: no COL-PLOT-NO labels need a dash inserted.")
        return 0

    out_path = args.out or args.dxf.with_name(f"{args.dxf.stem}-dashfix.dxf")
    doc.saveas(out_path)
    _log(args.dxf, fixes, out_path)

    print(f"fix_plot_label_dashes: fixed {len(fixes)} label(s):")
    for handle, old, new in fixes:
        print(f"  {handle}: {old!r} -> {new!r}")
    print(f"Wrote {out_path}")
    return 0


def _parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("dxf", type=Path, help="the working DXF to fix")
    p.add_argument("--out", type=Path, default=None, help="default: <dxf>-dashfix.dxf")
    return p.parse_args()


def _log(dxf_path: Path, fixes: list[tuple[str, str, str]], out_path: Path) -> None:
    log_path = dxf_path.with_name(f"{dxf_path.stem}-cv-log.txt")
    stamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    line = f"{stamp}  fix_plot_label_dashes: {len(fixes)} label(s) dash-inserted -> {out_path.name}\n"
    with log_path.open("a", encoding="utf-8") as f:
        f.write(line)


if __name__ == "__main__":
    sys.exit(main())
