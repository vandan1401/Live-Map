from pathlib import Path

import pymupdf
import pytest

from pipeline.io.pdf import UnreadablePdfError, triage_pdf

FIXTURES = Path(__file__).resolve().parents[3] / "fixtures"


def test_vector_fixture_reports_paths_and_text() -> None:
    pages = triage_pdf(FIXTURES / "demo-plan.pdf")

    assert len(pages) == 1
    assert pages[0].is_vector
    assert pages[0].drawing_path_count > 100
    assert pages[0].text_span_count > 40


def test_raster_fixture_reports_no_text() -> None:
    pages = triage_pdf(FIXTURES / "demo-plan-scan.jpg")

    assert len(pages) == 1
    assert not pages[0].is_vector
    assert pages[0].text_span_count == 0


def test_rotated_landscape_page_reports_correct_dimensions(tmp_path: Path) -> None:
    doc = pymupdf.open()
    doc.new_page(width=842, height=595)  # landscape A4
    doc[0].set_rotation(90)
    pdf_path = tmp_path / "rotated.pdf"
    doc.save(pdf_path)
    doc.close()

    pages = triage_pdf(pdf_path)

    assert len(pages) == 1
    assert pages[0].rotation == 90
    # PyMuPDF's page.rect already reflects the /Rotate value, so a 90-degree
    # rotation of an 842x595 mediabox reports as the visually-correct 595x842.
    x0, y0, x1, y1 = pages[0].bbox
    assert (x1 - x0, y1 - y0) == (595, 842)


def test_unreadable_file_raises_clean_error() -> None:
    # PyMuPDF happily parses Markdown as a generic document (2 "pages"), so this isn't
    # unreadable to fitz itself — it's out of scope for this tool, which only triages
    # site-plan sources (PDF/image). triage_pdf rejects it by extension before opening.
    spec_path = Path(__file__).resolve().parents[3] / "spec" / "09-pipe-triage.md"

    with pytest.raises(UnreadablePdfError):
        triage_pdf(spec_path)


def test_corrupt_pdf_extension_raises_clean_error(tmp_path: Path) -> None:
    bad_pdf = tmp_path / "not-really-a.pdf"
    bad_pdf.write_bytes(b"this is not a PDF")

    with pytest.raises(UnreadablePdfError):
        triage_pdf(bad_pdf)
