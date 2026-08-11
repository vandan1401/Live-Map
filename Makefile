# Root dispatcher. Targets are the interface — found by name, never by searching.
# Real implementations land in M1; these are the names the skills and CLAUDE.md rely on.

.PHONY: verify verify-map verify-pipe gate contract inspect serve

verify: verify-map verify-pipe

verify-map:
	cd apps/map && pnpm typecheck && pnpm test

verify-pipe:
	cd tools/pipeline && ruff check . && mypy pipeline && pytest -q

contract:  ## validate every fixture manifest against contract/colony.schema.json
	cd tools/pipeline && pytest tests/test_contract.py -q

gate: contract
	cd apps/map && pnpm typecheck && pnpm lint && pnpm test -- --run && pnpm build
	cd tools/pipeline && ruff check . && mypy pipeline && pytest -q
	$(MAKE) -C tools/pipeline golden

inspect:   ## make inspect PDF=fixtures/demo-plan.pdf
	cd tools/pipeline && python -m pipeline.cli.inspect ../../$(PDF)

serve:     ## I run this, not Claude — see .claude/hooks/guard.sh
	cd tools/pipeline/verify && python3 -m http.server 8080
