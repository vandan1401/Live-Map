"""Open a source file and report, per page, whether it is vector or raster.

Answers the one question M9 exists to answer: which extraction path (vector, M2 — or
raster, M9) a given source file needs, before any extraction code runs against it.
"""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

import pymupdf


class UnreadablePdfError(Exception):
    """The file could not be opened as a PDF (or PyMuPDF-supported image)."""


_SUPPORTED_SUFFIXES = {".pdf", ".jpg", ".jpeg", ".png", ".tif", ".tiff"}


@dataclass(frozen=True)
class PageTriage:
    page_number: int
    is_vector: bool
    drawing_path_count: int
    text_span_count: int
    bbox: tuple[float, float, float, float]
    rotation: int


def triage_pdf(path: Path) -> list[PageTriage]:
    """Open `path` and classify each page as vector or raster.

    A page counts as vector if it has any drawing paths or any text spans — the two
    things a raster scan or a flattened "Print to PDF" export never has. Raises
    `UnreadablePdfError` (never a raw PyMuPDF exception) if the file can't be opened.
    """
    if path.suffix.lower() not in _SUPPORTED_SUFFIXES:
        raise UnreadablePdfError(
            f"{path} is not a PDF or image (got {path.suffix or 'no extension'}) - "
            "this tool only triages site-plan sources, not arbitrary documents."
        )

    try:
        doc = pymupdf.open(path)
    except Exception as exc:
        raise UnreadablePdfError(f"could not open {path} as a PDF: {exc}") from exc

    if doc.page_count == 0:
        doc.close()
        raise UnreadablePdfError(f"{path} has no pages")

    pages: list[PageTriage] = []
    for page_number in range(doc.page_count):
        page = doc[page_number]
        drawing_path_count = len(page.get_drawings())
        text_span_count = sum(
            len(line["spans"])
            for block in page.get_text("dict")["blocks"]
            if block.get("type") == 0
            for line in block["lines"]
        )
        rect = page.rect
        pages.append(
            PageTriage(
                page_number=page_number,
                is_vector=drawing_path_count > 0 or text_span_count > 0,
                drawing_path_count=drawing_path_count,
                text_span_count=text_span_count,
                bbox=(rect.x0, rect.y0, rect.x1, rect.y1),
                rotation=page.rotation,
            )
        )

    doc.close()
    return pages
