"""`make inspect PDF=...` — print the triage report and name the tier.

Ten seconds, no guessing: what did someone actually hand me? Since D-118 the pipeline
ingests DXF only, so no tier here leads to an automatic path — this answers whether a
file is worth opening in AutoCAD as a tracing backdrop or is already a real drawing.
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

from pipeline.io.pdf import PageTriage, UnreadablePdfError, triage_pdf


def classify_document(pages: list[PageTriage]) -> str:
    vector_pages = sum(1 for page in pages if page.is_vector)
    if vector_pages == len(pages):
        return "vector"
    if vector_pages == 0:
        return "raster"
    return "mixed"


_TIER_LABEL = {
    "vector": "vector - exact geometry, ask whoever sent it for the DWG",
    "raster": "raster - a picture. Trace it in AutoCAD over an attached image",
    "mixed": "mixed - pages differ, check each one",
}


def format_report(path: Path, pages: list[PageTriage], tier: str) -> str:
    lines = [f"{path}", f"  tier: {_TIER_LABEL[tier]}"]
    for page in pages:
        kind = "vector" if page.is_vector else "raster"
        lines.append(
            f"  page {page.page_number}: {kind} - "
            f"{page.drawing_path_count} paths, {page.text_span_count} text spans, "
            f"bbox {page.bbox}, rotation {page.rotation}"
        )
    return "\n".join(lines)


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Triage a site-plan source file.")
    parser.add_argument("path", type=Path)
    args = parser.parse_args(argv)

    try:
        pages = triage_pdf(args.path)
    except UnreadablePdfError as exc:
        print(f"error: {exc}", file=sys.stderr)
        return 1

    tier = classify_document(pages)
    print(format_report(args.path, pages, tier))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
