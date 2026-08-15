# Root dispatcher. Targets are the interface — found by name, never by searching.
# Real implementations land in M1; these are the names the skills and CLAUDE.md rely on.

.PHONY: verify verify-map verify-pipe gate contract inspect serve db-start db-up db-restart db-reseed

verify: verify-map verify-pipe

db-start:  ## local Supabase stack (Docker must already be running); excludes services this app doesn't need
	cd apps/map && npx -y supabase start --exclude storage-api,imgproxy,mailpit,postgres-meta,studio,edge-runtime,logflare,vector,supavisor

db-restart:  ## full stop+start — required for supabase/config.toml edits to take effect (a plain `db-start` on an already-running stack silently keeps stale container env vars; bit twice now, M5's service-exclusion flags and M8's [auth] block)
	cd apps/map && npx -y supabase stop
	$(MAKE) db-start

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

db-reseed:  ## wipe local DB, reseed the fixture colony, recreate the demo account — run after live-integration tests leak scratch colonies (documented DB-warm-up flake, PROGRESS.md)
	cd apps/map && npx -y supabase db reset
	cd apps/map && pnpm import:seed
	cd apps/map && pnpm create-user demo demo-pass-123 "Demo User"

verify-map:
	cd apps/map && pnpm typecheck && pnpm test

verify-pipe:
	$(MAKE) -C tools/pipeline verify

contract:  ## validate every fixture manifest against contract/colony.schema.json
	$(MAKE) -C tools/pipeline contract

gate: contract
	cd apps/map && pnpm typecheck && pnpm lint && pnpm test -- --run && pnpm build
	$(MAKE) -C tools/pipeline verify
	$(MAKE) -C tools/pipeline golden

inspect:   ## make inspect PDF=fixtures/demo-plan.pdf
	$(MAKE) -C tools/pipeline ingest PDF=../../$(PDF)

serve:     ## I run this, not Claude — see .claude/hooks/guard.sh
	cd tools/pipeline/verify && python3 -m http.server 8080
