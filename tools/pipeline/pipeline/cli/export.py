"""`make export COLONY=<id> DXF=<path>` -- the real pipeline entry (M13, D-118). Thin shell:
argument parsing and printing only. All geometry, matching, derivation, and file-format
handling live a layer down in pipeline.export.run.orchestrate_export.
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

from pipeline.derive import DeriveError
from pipeline.export import ExportError
from pipeline.export.run import orchestrate_export
from pipeline.extract.dxf import DxfConformanceError
from pipeline.geom import GeomError
from pipeline.matching import MatchingError

_COLONIES_DIR = Path(__file__).resolve().parents[2] / "colonies"
_OUT_DIR = Path(__file__).resolve().parents[2] / "out"


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Export a colony DXF to SVG + manifest (M13).")
    parser.add_argument("--colony", required=True)
    parser.add_argument("--dxf", required=True, type=Path)
    parser.add_argument("--out", type=Path, default=None)
    parser.add_argument("--allow-id-change", action="store_true")
    args = parser.parse_args(argv)

    out_dir = (args.out or _OUT_DIR) / args.colony

    try:
        orchestrate_export(
            args.colony, args.dxf, _COLONIES_DIR, out_dir, args.allow_id_change
        )
    except (DxfConformanceError, GeomError, MatchingError, DeriveError, ExportError) as exc:
        print(f"error: {exc}", file=sys.stderr)
        return 1

    print(f"wrote {out_dir / 'colony.svg'}")
    print(f"wrote {out_dir / 'colony.json'}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
