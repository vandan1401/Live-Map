"""`ColonyConfig.default_block` resolution (docs/plans/15.md) -- split out of test_dxf.py to
keep that file under CLAUDE.md invariant 7's 250-line cap.
"""

from __future__ import annotations

import json
from pathlib import Path

import pytest

from pipeline.extract.dxf import DxfConformanceError, load_colony_config

_MINIMAL_CONFIG_JSON: dict[str, object] = {
    "id": "test-colony",
    "name": "Test Colony",
    "units": "ft",
    "expected_plots": 1,
    "blocks": ["A"],
    "number_width": 2,
    "number_range": [1, 60],
    "north_deg": None,
    "source": {"file": "test.dwg", "revision": "n/a", "plan_date": "2026-01-01", "method": "dxf"},
}


def test_load_colony_config_default_block_defaults_to_first_block(tmp_path: Path) -> None:
    # No "default_block" key in the JSON keeps today's behavior -- blocks[0] is the default
    # for a bare plot number.
    (tmp_path / "test-colony.json").write_text(json.dumps(_MINIMAL_CONFIG_JSON))
    config = load_colony_config("test-colony", tmp_path)
    assert config.default_block == "A"


def test_load_colony_config_default_block_null_means_blockless(tmp_path: Path) -> None:
    data = {**_MINIMAL_CONFIG_JSON, "default_block": None}
    (tmp_path / "test-colony.json").write_text(json.dumps(data))
    config = load_colony_config("test-colony", tmp_path)
    assert config.default_block is None


def test_load_colony_config_default_block_not_in_blocks_is_an_error(tmp_path: Path) -> None:
    # default_block naming a letter outside blocks would otherwise invent an unvalidated
    # block for every bare number -- the same guarantee blocks already gives explicit
    # prefixes (docs/cad-layer-standard.md).
    data = {**_MINIMAL_CONFIG_JSON, "default_block": "B"}
    (tmp_path / "test-colony.json").write_text(json.dumps(data))
    with pytest.raises(DxfConformanceError, match="B"):
        load_colony_config("test-colony", tmp_path)
