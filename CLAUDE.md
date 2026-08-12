# colony

One repo, two halves, one contract between them.

- `apps/map/` — live plot-status map for a family real-estate business. React PWA. 5–6
  users, all equal admins. Replaces a daily WhatsApp PDF.
- `tools/pipeline/` — local Python tool turning a site plan PDF into the SVG + manifest the
  app consumes. Runs offline, zero cost per colony.
- `contract/` — the interface. Changing it means changing both halves in one commit.

## Commands

<!-- Root Makefile targets are created in M1. Before M1 they do not exist. -->

- Verify (fast): `make verify` — both halves
- One half: `make verify-map` · `make verify-pipe`
- Full gate: `make gate` — typecheck, lint, full tests, production build, contract check
- `pnpm dev` (apps/map) may be run, including in the background, to serve the app for
  manual checks — Claude has no browser or device to test with, so a human still has to
  open the URL and look.
- Never run: `make serve` (I run that — see `.claude/hooks/guard.sh`), `wrangler pages
  deploy`, anything deleting an overrides file
- `supabase db reset` may be run by Claude (user's explicit instruction, 2026-08-12) —
  confirmed no remote project is linked (`supabase projects list` has no access token,
  no `.supabase` link folder), so it only ever touches the local Docker Postgres this
  project's `config.toml` defines. Re-confirm the no-link check before relying on this
  if the project ever gets linked to a real Supabase project.

Makefile targets are found by name — never grep for a script. Skill preambles call
`.claude/preamble.sh <sub>`; Claude Code rejects compound shell in `!` blocks, so extend
that script rather than inlining a pipe.

## Invariants

1. **`contract/` is the interface.** Emitted SVGs carry `class`, `id`, `data-*` and nothing
   else — no `fill`, no `stroke`, no `style`. Manifests validate against
   `contract/colony.schema.json` on both sides. Break it and the app renders an empty map
   with no error anywhere.
2. **No colony is a deliverable until a human verified it.** Manifests carry
   `"verified": true|false`; the app refuses `false`. No code path sets it true (D-108).
3. **Money is integer paise** at every layer — column, wire, state. Names end `_paise`.
   Rupees exist only in the render formatter (D-010).
4. **Plot status changes through exactly one function**, `applyPlotTransition()`. Stale
   writes fail loudly with the winner's name, never last-write-wins (D-006).
5. **`plot_history` is append-only**, enforced in the database. It is the evidence that
   settles a commission dispute among five family members.
6. **Overrides survive reruns.** Hand corrections are keyed by rounded centroid and
   reapplied every run. Losing one is silent and surfaces weeks later (D-107).
7. **No source file over 250 lines.** Enforced by `.claude/hooks/filesize.sh`.
8. **No auth until M8.** RLS is permissive; the anon key grants full read and write. Do not
   deploy to a public URL before M8. The guard hook blocks it (D-011).

## Risk tiers

| Path | Tier |
|---|---|
| `contract/**` | 1 — both halves depend on it |
| `apps/map/supabase/migrations/**`, `apps/map/src/lib/{plot-status,sync,auth}/**`, `apps/map/src/pwa/**`, `apps/map/public/sw.js` | 1 |
| `tools/pipeline/pipeline/{geom,matching,overrides,export}/**`, `tools/pipeline/verify/{index.html,tracer.js}` | 1 |
| `apps/map/src/{features,lib/colony,lib/db}/**`, `tools/pipeline/pipeline/{io,extract,derive}/**` | 2 |
| `apps/map/src/{components,styles}/**`, `tools/pipeline/pipeline/cli/**`, config | 3 |

Tier 1 needs `/plan` then `/review`. Domain detail is in `.claude/rules/`, loaded on path.

## Working style

- Read `PROGRESS.md` first. Use `NAVIGATION.md` rather than exploring blind.
- Note, don't fix. Gaps outside the plan go to `PROGRESS.md` → `## Deferred`.
- Verify by running the command, never by reading code back.
- `fixtures/shree-vatika-2/` is one shared demo colony: the app renders it, the pipeline's
  golden test must reproduce it. One copy, deliberately — two would drift.

## Reporting

```
Works now:      <one line>
Changed:        <one line per file>
Reusable:       <new shared functions, or "none">
Verified:       <exact commands run + real output, or the literal words "not run">
Decided alone:  <anything chosen without asking, or "nothing">
Next:           <the single next action>
```

## Compact instructions

Preserve: the eight invariants, `## Current` from `PROGRESS.md`, the active plan path, and
any decision still marked `provisional`. Path-scoped rules are **not** re-injected after
compaction — re-read the relevant one before resuming Tier 1 work.
