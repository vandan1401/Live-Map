# Root dispatcher. Targets are the interface — found by name, never by searching.
# Real implementations land in M1; these are the names the skills and CLAUDE.md rely on.

.PHONY: verify verify-map verify-pipe gate contract inspect serve db-start db-up

verify: verify-map verify-pipe

db-start:  ## local Supabase stack (Docker must already be running); excludes services this app doesn't need
	cd apps/map && npx -y supabase start --exclude storage-api,imgproxy,mailpit,postgres-meta,studio,edge-runtime,logflare,vector,supavisor

db-up:  ## start Docker Desktop if it isn't running, wait for it, then db-start. Used by /db-up skill
	@docker info >/dev/null 2>&1 || { \
	  echo "Docker Desktop not running — launching it..."; \
	  "/c/Program Files/Docker/Docker/Docker Desktop.exe" >/dev/null 2>&1 & \
	  for i in $$(seq 1 40); do \
	    docker info >/dev/null 2>&1 && break; \
	    printf "."; sleep 3; \
	  done; \
	  echo ""; \
	}
	@docker info >/dev/null 2>&1 || { echo "Docker did not come up within 120s — open Docker Desktop manually and retry."; exit 1; }
	$(MAKE) db-start

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
