---
name: db-up
description: Ensure Docker Desktop and the local Supabase stack are running. Invoke before checking the app if plot status isn't showing.
model: sonnet
effort: low
allowed-tools: Bash(make *) Bash(mingw32-make *) Bash(docker *)
---

## Why this exists

The map app reads plot status from the local Supabase stack (`apps/map/.env` points it at
`http://127.0.0.1:55321`). That stack needs Docker running underneath it. If Docker
Desktop isn't open, or `supabase start` was never run this boot, the app loads with no
data and plots render with no status — silently, no error banner. This skill is the fix:
run it, then check the app.

This is on-demand only — it does not run automatically at session start. Invoke it
yourself (or ask me to) before you go look at the app.

## Your task

1. Run `make db-up`. This target (in the root `Makefile`):
   - Checks `docker info`; if Docker isn't responding, launches Docker Desktop and polls
     for up to ~120s.
   - Once Docker is up, runs `db-start`, which calls `supabase start` for `apps/map`.

   If the shell reports `make: command not found`, this machine's `make` isn't on PATH
   under that name — retry with `mingw32-make db-up` instead (confirmed present at
   `C:\MinGW\bin\mingw32-make.exe` on 2026-08-13). Mention this to the user once; it's a
   PATH gap on this machine, not a project bug, and it affects every other `make *`
   command too (`make verify`, `make gate`, ...) — worth a permanent fix, but that's a
   separate ask.

2. Read the output:
   - A JSON blob with `API_URL`, `ANON_KEY`, etc. means the stack is up. Confirm
     `API_URL` is `http://127.0.0.1:55321` and `ANON_KEY` matches
     `apps/map/.env`'s `VITE_SUPABASE_ANON_KEY` — if either differs, say so, the app
     won't connect even though the stack reports healthy.
   - `Docker did not come up within 120s` means Docker Desktop needs manual attention
     (first-run license prompt, pending update, WSL2 backend issue) — a background
     process can't click through those. Tell the user to open Docker Desktop by hand and
     retry.

3. Report one line: stack up or not, and if not, the exact blocker.

Do not run `supabase db reset`, `supabase link`, or anything under `db push` — those are
out of scope for this skill (see CLAUDE.md's Commands section on the remote-link
precondition).
