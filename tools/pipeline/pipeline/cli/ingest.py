"""`make ingest COLONY=<id> DXF=<path>` — read a DXF and report what M10 extracted.

Ten seconds, no guessing: which layers came through, how many rings and labels landed on
each, whether north resolved — before M11/M12 exist to do anything further with them.
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

from pipeline.extract.dxf import DxfConformanceError, ingest_dxf, load_colony_config
from pipeline.extract.types import DxfIngestResult

_COLONIES_DIR = Path(__file__).resolve().parents[2] / "colonies"


def format_report(result: DxfIngestResult) -> str:
    counts: dict[str, int] = {}
    for ring in result.rings:
        counts[ring.layer] = counts.get(ring.layer, 0) + 1
    for label in result.labels:
        counts[label.layer] = counts.get(label.layer, 0) + 1

    lines = [f"{result.config.name} ({result.config.id})", f"  north_deg: {result.north_deg:.1f}"]
    for layer in sorted(counts):
        lines.append(f"  {layer}: {counts[layer]}")
    return "\n".join(lines)


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Ingest a colony DXF (M10).")
    parser.add_argument("--colony", required=True)
    parser.add_argument("--dxf", required=True, type=Path)
    args = parser.parse_args(argv)

    try:
        config = load_colony_config(args.colony, _COLONIES_DIR)
        result = ingest_dxf(args.dxf, config)
    except DxfConformanceError as exc:
        print(f"error: {exc}", file=sys.stderr)
        return 1

    print(format_report(result))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
