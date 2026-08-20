"""The QA gate: blocking, not advisory (M13, spec/13-pipe-derive-export.md). A warning that
lets a broken colony through is worse than no check -- it teaches the human to ignore
output. Several of these checks are already guaranteed by pipeline.matching's own errors;
they are re-derived here anyway, independently, against the final assembled manifest --
defense in depth, not trust in the layer below.
"""

from __future__ import annotations

import json
import re
from collections.abc import Sequence
from pathlib import Path
from typing import Any

import jsonschema

from pipeline.export import ExportError
from pipeline.extract.types import ColonyConfig
from pipeline.geom import validate_disjoint
from pipeline.matching.assign import MatchedPlot

# invariant 1 (CLAUDE.md): "Manifests validate against contract/colony.schema.json on both
# sides." Only fixture manifests were schema-tested before this (tests/test_contract.py);
# nothing validated what this module actually writes to out/ -- checked here so a schema
# drift (a renamed key, an out-of-enum facing value) is refused at the source, not
# discovered when apps/map's parseColonyManifest.ts rejects the upload (/review, 2026-08-20).
_SCHEMA_PATH = Path(__file__).resolve().parents[4] / "contract" / "colony.schema.json"

# A residential sanity band, loose enough for real plots smaller/larger than the fixture's
# own 1000-1950 sqft range, but tight enough that a units mistake -- a DWG drawn in
# millimetres but declared feet, off by roughly 304.8**2 (~93,000x) in area either
# direction -- can never land inside it by accident. Replaces D-111's two-point calibration.
PLOT_AREA_SQFT_MIN = 300
PLOT_AREA_SQFT_MAX = 6000

# contract/SPEC.md: "No fill, no stroke, no style. Ever." -- checked here, not just in a
# unit test on synthetic svg.py output, so a future svg.py regression is actually blocked
# rather than merely caught by a test someone has to remember to keep passing (/review,
# 2026-08-20). CSS declarations inside the one fallback <style> block use `fill:`, not
# `fill=`, so this pattern never matches that block's own legitimate text.
_STYLING_ATTR_PATTERN = re.compile(r"(fill|stroke|style)=")


def run_qa(
    manifest: dict[str, Any],
    plots: Sequence[MatchedPlot],
    config: ColonyConfig,
    svg: str,
    out_dir: Path,
    allow_id_change: bool,
) -> None:
    _check_matches_contract_schema(manifest)
    _check_ids_present_and_unique(manifest)
    _check_plot_count(manifest, config)
    _check_area_band(manifest)
    validate_disjoint([p.ring for p in plots])
    _check_number_width(manifest, config)
    _check_svg_has_no_styling_attributes(svg)
    _check_id_stability(manifest, out_dir, allow_id_change)


def _check_matches_contract_schema(manifest: dict[str, Any]) -> None:
    schema = json.loads(_SCHEMA_PATH.read_text())
    try:
        jsonschema.validate(manifest, schema)
    except jsonschema.ValidationError as exc:
        raise ExportError(
            f"manifest does not match contract/colony.schema.json: {exc.message}"
        ) from exc


def _all_ids(manifest: dict[str, Any]) -> list[str]:
    return [p["svg_id"] for p in manifest["plots"]] + [
        f["svg_id"] for f in manifest["features"]
    ]


def _check_ids_present_and_unique(manifest: dict[str, Any]) -> None:
    ids = _all_ids(manifest)
    if any(not svg_id for svg_id in ids):
        raise ExportError("a plot or feature has an empty svg_id")

    seen: set[str] = set()
    for svg_id in ids:
        if svg_id in seen:
            raise ExportError(f"duplicate svg_id {svg_id!r} across plots/features")
        seen.add(svg_id)


def _check_plot_count(manifest: dict[str, Any], config: ColonyConfig) -> None:
    count = len(manifest["plots"])
    if count != config.expected_plots:
        raise ExportError(
            f"plot count {count} disagrees with expected_plots {config.expected_plots}"
        )


def _check_area_band(manifest: dict[str, Any]) -> None:
    for plot in manifest["plots"]:
        area = plot["area_sqft"]
        if not (PLOT_AREA_SQFT_MIN <= area <= PLOT_AREA_SQFT_MAX):
            raise ExportError(
                f"{plot['svg_id']}: area_sqft {area} outside sane band "
                f"[{PLOT_AREA_SQFT_MIN}, {PLOT_AREA_SQFT_MAX}] -- check for a units mismatch"
            )


def _check_number_width(manifest: dict[str, Any], config: ColonyConfig) -> None:
    for plot in manifest["plots"]:
        if len(plot["number"]) > config.number_width:
            raise ExportError(
                f"{plot['svg_id']}: number {plot['number']!r} exceeds number_width "
                f"{config.number_width}"
            )


def _check_svg_has_no_styling_attributes(svg: str) -> None:
    match = _STYLING_ATTR_PATTERN.search(svg)
    if match:
        raise ExportError(
            f"emitted SVG has a styling attribute ({match.group(0)}...) -- "
            "contract/SPEC.md permits class, id, and data-* only"
        )


def _check_id_stability(
    manifest: dict[str, Any], out_dir: Path, allow_id_change: bool
) -> None:
    previous_path = out_dir / "colony.json"
    if not previous_path.exists():
        return

    previous = json.loads(previous_path.read_text())
    previous_ids = {p["svg_id"] for p in previous["plots"]} | {
        f["svg_id"] for f in previous["features"]
    }
    missing = previous_ids - set(_all_ids(manifest))
    if missing and not allow_id_change:
        raise ExportError(
            f"export would drop svg_id(s) present in the previous export: "
            f"{sorted(missing)} -- pass --allow-id-change to confirm"
        )
