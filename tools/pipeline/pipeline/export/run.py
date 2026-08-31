"""Orchestrate the whole pipeline end to end -- ingest, validate, match, derive, export, gate
(M13, spec/13-pipe-derive-export.md, docs/plans/14.md). The first thing in this repo that
calls pipeline.geom.validate_* and pipeline.matching.{assign_plot_numbers,classify_features}
from outside their own tests.
"""

from __future__ import annotations

import json
from pathlib import Path

from shapely.geometry import Polygon

from pipeline.derive.corner import is_plot_corner
from pipeline.derive.facing import resolve_facing
from pipeline.derive.roads import derive_road
from pipeline.derive.trees import scatter_trees
from pipeline.export.manifest import build_manifest
from pipeline.export.normalise import compute_transform
from pipeline.export.qa import run_qa
from pipeline.export.svg import build_svg
from pipeline.extract.dxf import ingest_dxf, load_colony_config
from pipeline.extract.types import DxfIngestResult, Ring
from pipeline.geom import validate_ring, validate_within
from pipeline.matching.assign import assign_plot_numbers
from pipeline.matching.classify import classify_features

_SITE_LAYER = "COL-SITE"
_PLOT_LAYER = "COL-PLOT"
_PLOT_LABEL_LAYER = "COL-PLOT-NO"
_GARDEN_LAYER = "COL-GARDEN"
_FEATURE_RING_LAYERS = (_GARDEN_LAYER, "COL-AMENITY", "COL-WATER")
_FEATURE_LABEL_LAYER = "COL-FEATURE-NO"


def orchestrate_export(
    colony_id: str,
    dxf_path: Path,
    colonies_dir: Path,
    out_dir: Path,
    allow_id_change: bool = False,
) -> None:
    config = load_colony_config(colony_id, colonies_dir)
    result = ingest_dxf(dxf_path, config)

    site = _site_ring(result)
    plot_rings = [r for r in result.rings if r.layer == _PLOT_LAYER]
    feature_rings = [r for r in result.rings if r.layer in _FEATURE_RING_LAYERS]
    plot_labels = [lbl for lbl in result.labels if lbl.layer == _PLOT_LABEL_LAYER]
    feature_labels = [lbl for lbl in result.labels if lbl.layer == _FEATURE_LABEL_LAYER]

    for ring in [site, *plot_rings, *feature_rings]:
        validate_ring(ring)
    validate_within(site, [*plot_rings, *feature_rings])

    match_result = assign_plot_numbers(plot_rings, plot_labels, config)
    features = classify_features(feature_rings, feature_labels)

    road = derive_road(site, [*plot_rings, *feature_rings])
    garden_rings = sorted(
        (r for r in feature_rings if r.layer == _GARDEN_LAYER), key=lambda r: r.handle
    )
    tree_areas = [("road", road), *(("garden", Polygon(r.points)) for r in garden_rings)]
    trees = scatter_trees(colony_id, tree_areas)

    facings = {
        p.svg_id: resolve_facing(p.ring, road, result.north_deg) for p in match_result.plots
    }
    corners = {p.svg_id: is_plot_corner(p.ring, road) for p in match_result.plots}

    transform = compute_transform(site)
    manifest = build_manifest(
        config,
        transform,
        match_result.plots,
        features,
        result.north_deg,
        facings,
        corners,
        result.zoom_ref,
    )
    svg = build_svg(
        transform, site, road, match_result.plots, features, trees, colony_id, feature_labels
    )

    run_qa(manifest, match_result.plots, config, svg, out_dir, allow_id_change)

    out_dir.mkdir(parents=True, exist_ok=True)
    # A COL-FEATURE-NO label is human-authored drawing text -- explicit utf-8 so a
    # non-ASCII label (Devanagari, an em dash, a rupee sign) never hits the Windows locale
    # encoding (cp1252) that Path.write_text falls back to with no encoding= (/review,
    # 2026-08-20). Without this, a mid-write UnicodeEncodeError could leave colony.svg
    # written and colony.json missing -- exactly the partial-write case invariant/failure
    # mode 1 (spec/00-rules.md) forbids.
    (out_dir / "colony.svg").write_text(svg, encoding="utf-8")
    (out_dir / "colony.json").write_text(json.dumps(manifest, indent=2), encoding="utf-8")


def _site_ring(result: DxfIngestResult) -> Ring:
    return next(r for r in result.rings if r.layer == _SITE_LAYER)
