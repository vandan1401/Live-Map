"""`make inspect PDF=...` — print the triage report and name the tier.

Ten seconds, no guessing: vector (M2 path), raster (M9 path), or mixed (page-by-page
handling needed). The fix for a bad tier is re-exporting the source file, not writing code.
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
    "vector": "vector (M2 path)",
    "raster": "raster (M9 path)",
    "mixed": "mixed (needs page-by-page handling)",
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
