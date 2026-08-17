# Same target names as the root dispatcher (CLAUDE.md) so this half also runs standalone.
# ruff/mypy/pytest are not on this machine's global PATH (only python is, D-117-adjacent —
# no confirmed shared toolchain yet) — every target resolves them through .venv instead of
# assuming a shell has one activated, so `make verify` works cold.
VENV := .venv
PY := $(VENV)/Scripts/python.exe

.PHONY: verify lint typecheck test contract golden gate inspect ingest export serve

$(VENV)/pyvenv.cfg: pyproject.toml
	python -m venv $(VENV)
	$(PY) -m pip install --quiet -e ".[dev]"

verify: $(VENV)/pyvenv.cfg
	$(PY) -m ruff check .
	$(PY) -m mypy pipeline
	$(PY) -m pytest -q

lint: $(VENV)/pyvenv.cfg
	$(PY) -m ruff check .

typecheck: $(VENV)/pyvenv.cfg
	$(PY) -m mypy pipeline

test: $(VENV)/pyvenv.cfg
	$(PY) -m pytest -q

contract: $(VENV)/pyvenv.cfg  ## validate every fixture manifest against contract/colony.schema.json
	$(PY) -m pytest tests/test_contract.py -q

golden: $(VENV)/pyvenv.cfg
	$(PY) -m pytest -q -k golden

gate: verify golden

inspect: $(VENV)/pyvenv.cfg  ## triage only — what is this file? make inspect PDF=../../fixtures/demo-plan.pdf
	$(PY) -m pipeline.cli.inspect $(PDF)

ingest: $(VENV)/pyvenv.cfg  ## make ingest COLONY=<id> DXF=<path> — the real pipeline entry (D-118)
	$(PY) -m pipeline.cli.ingest --colony $(COLONY) --dxf $(DXF)

export:
	@echo "export not built yet (M13 — pipeline/export/)"; exit 1

serve:     ## I run this, not Claude — see .claude/hooks/guard.sh
	python3 -m http.server 8080 --directory verify
