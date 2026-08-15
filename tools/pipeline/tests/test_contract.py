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
