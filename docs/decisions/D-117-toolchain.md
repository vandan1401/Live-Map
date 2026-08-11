# D-117 — Makefile, pytest, ruff, mypy, stdlib venv

**Status:** provisional — proposed and not explicitly confirmed

## Decision

- Tests: **pytest**
- Lint and format: **ruff**
- Types: **mypy**
- Task runner: **Makefile**
- Environment: stdlib `venv` and `pip install -e .`

## Reasoning

A Makefile rather than a script directory because the `/start` skill already probes for
`npm pkg get scripts` and falls through to grepping Makefile targets — so targets appear in
the session preamble automatically, at no token cost. That is a small thing that pays every
session.

ruff replaces flake8, isort, and black in one fast binary. mypy earns its place here
specifically because the geometry layer passes tuples and shapely objects between modules,
which is exactly where a silent type error hides.

Plain `venv` over `uv` or Poetry to keep setup boring. This tool has to still work in two
years, run by someone following a README, on a machine with nothing installed.

## Rejected alternatives

- **uv** — significantly faster and increasingly standard. A reasonable swap; it just adds a
  thing to install first.
- **Poetry** — heavier, and the lockfile buys little for a local tool with a handful of
  dependencies.
- **just / invoke** — nicer than Make, and neither is picked up by the `/start` preamble.

## Blast radius

Low. Confirm or correct before M1 creates `pyproject.toml`.
