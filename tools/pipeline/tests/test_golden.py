"""The golden test: export must reproduce fixtures/shree-vatika-2/ exactly.

Skipped until `pipeline/export/` exists (M13) — CLAUDE.md's `make gate` calls this
target unconditionally via `tools/pipeline`'s `golden` Makefile target, so a real (if
skipped) test must exist for `-k golden` to collect something rather than fail with
"no tests ran".
"""

import pytest


@pytest.mark.skip(reason="pipeline/export/ not built yet — M13")
def test_golden_export_reproduces_shree_vatika_2() -> None:
    raise NotImplementedError
