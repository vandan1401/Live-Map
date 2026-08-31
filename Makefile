# Root dispatcher. Targets are the interface — found by name, never by searching.
# Real implementations land in M1; these are the names the skills and CLAUDE.md rely on.

.PHONY: verify verify-map verify-pipe gate contract inspect ingest export serve ui db-start db-up db-restart db-reseed

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

inspect:   ## triage only — what is this file? make inspect PDF=fixtures/demo-plan.pdf
	$(MAKE) -C tools/pipeline inspect PDF=../../$(PDF)

# Shell-level detection, not $(abspath) -- found broken 2026-08-21 twice, against a real
# colony's DXF (a Windows Desktop path with spaces, e.g. "JAI DEV working v2.dxf"): the
# original hardcoded ../../ only ever made sense for a fixtures/-relative DXF, and
# unquoted $(DXF) split on the space regardless. $(abspath ...) looked like the fix but
# is a Make macro, not a shell command -- it treats a space-containing value as MULTIPLE
# words and abspaths each one separately, producing garbage. The case statement below
# runs in the shell instead, where "$(DXF)" stays one quoted string throughout; only a
# genuinely relative DXF gets the ../../ prefix (repo root -> tools/pipeline).
ingest:    ## make ingest COLONY=<id> DXF=fixtures/<id>/colony.dxf — the real pipeline entry (D-118)
	@case "$(DXF)" in \
	  /*|[A-Za-z]:*) dxf="$(DXF)" ;; \
	  *) dxf="../../$(DXF)" ;; \
	esac; \
	$(MAKE) -C tools/pipeline ingest COLONY=$(COLONY) DXF="$$dxf"

export:    ## make export COLONY=<id> DXF=fixtures/<id>/colony.dxf — writes out/<id>/colony.{svg,json} (M13)
	@case "$(DXF)" in \
	  /*|[A-Za-z]:*) dxf="$(DXF)" ;; \
	  *) dxf="../../$(DXF)" ;; \
	esac; \
	$(MAKE) -C tools/pipeline export COLONY=$(COLONY) DXF="$$dxf"

serve:     ## I run this, not Claude — see .claude/hooks/guard.sh. Open http://localhost:8080/tools/pipeline/verify/
	python3 -m http.server 8080

ui:        ## I run this, not Claude — same reason as serve. The pipeline UI (DXF -> export). Open http://127.0.0.1:5001/
	$(MAKE) -C tools/pipeline ui
