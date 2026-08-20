"""Every fixture manifest must validate against contract/colony.schema.json.

Both halves of the repo depend on this schema (CLAUDE.md invariant 1) — this is the
pipeline-side half of that check; `apps/map` validates the same schema on its side.
"""

import json
from pathlib import Path

import jsonschema
import pytest

REPO_ROOT = Path(__file__).resolve().parents[3]
SCHEMA_PATH = REPO_ROOT / "contract" / "colony.schema.json"
FIXTURES_DIR = REPO_ROOT / "fixtures"

MANIFESTS = sorted(FIXTURES_DIR.glob("*/colony.json"))


@pytest.fixture(scope="module")
def schema() -> dict:
    return json.loads(SCHEMA_PATH.read_text())


@pytest.mark.parametrize("manifest_path", MANIFESTS, ids=lambda p: p.parent.name)
def test_manifest_matches_schema(manifest_path: Path, schema: dict) -> None:
    manifest = json.loads(manifest_path.read_text())
    jsonschema.validate(manifest, schema)


def test_at_least_one_manifest_was_found() -> None:
    assert MANIFESTS, f"no fixture manifests found under {FIXTURES_DIR}"


def _plot(**overrides: object) -> dict:
    plot = {
        "svg_id": "plot-A-14",
        "block": "A",
        "number": "14",
        "area_sqft": 1200,
        "length_ft": 30,
        "breadth_ft": 40,
        "centroid": [10, 10],
        "facing": "north",
        "is_corner": False,
    }
    plot.update(overrides)
    return plot


# docs/plans/15.md -- a plot with no block, not exercised by fixtures/shree-vatika-2/
# (§1 of that plan: no second fixture colony for this).


def test_blockless_plot_validates(schema: dict) -> None:
    jsonschema.validate(_plot(svg_id="plot-07", block="", number="07"), schema["properties"]["plots"]["items"])


def test_malformed_blockless_id_still_rejected(schema: dict) -> None:
    plot_schema = schema["properties"]["plots"]["items"]
    for bad_svg_id in ("plot--07", "plot-A-", "plot-a-07"):
        with pytest.raises(jsonschema.ValidationError):
            jsonschema.validate(_plot(svg_id=bad_svg_id), plot_schema)
