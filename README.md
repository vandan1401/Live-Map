# colony

A live plot-status map for a family real-estate business, and the local tool that feeds it.

Five or six people currently share a PDF on WhatsApp every day. This replaces it with one
map everyone can see and update, installable on an iPhone home screen without the App Store.

```
tools/pipeline/   normalised DXF ->  colony.svg + colony.json     (Python, local, offline)
contract/         the interface between them — schema-validated on both sides
apps/map/         the app the family uses                          (React PWA, Supabase)
```

Open this folder in Claude Code. One project, one `.claude/`, one git history. A change that
spans both halves is one commit — which is the point.

## Start here

```
git init && git add -A && git commit -m "scaffold"
claude
/start
```

`/start` reads `PROGRESS.md` and proposes the next action, then runs it — no approval
gate. For Tier 1 work it chains `/plan` → `/build` → `/review` automatically and stops at
`/review`'s findings; Tier 2 gets `/check`, Tier 3 gets the test gate.

## The loop

```
/start          recover state, propose the next action
/plan <task>    Tier 1 only — writes a brief to docs/plans/, then invokes /build
/build <NN>     implement one plan on disk, nothing else
/check          PASS/FAIL table against acceptance criteria, fixes nothing
/review         adversarial review by a forked agent — Tier 1 only
/wrap           full gate, update state files, log, commit
```

Tier 1 needs `/plan` then `/review`. Tier 2 needs `/check`. Tier 3 needs the gate. Tiers are
in `CLAUDE.md`.

## Milestones

`spec/01`–`08` build the app, `spec/09`–`14` build the pipeline, and `spec/15` makes colony
onboarding self-serve (D-025). Two former pipeline
milestones — browser tracing tools and the overrides/raster fallback — are **cut**; D-118
is the record of what they were. The app comes first because `fixtures/shree-vatika-2/` is a complete
hand-traced 26-plot colony — so the whole app can be built and shown to the family before
the pipeline exists.

The pipeline then has a golden test: run it on `fixtures/shree-vatika-2/colony.dxf` and it
must reproduce the same 26 plot ids and centroids the app already renders.

Auth is M8, last, by request. Until it ships there is **no authentication** — RLS is
permissive and the anon key grants full read and write. Do not put the app on a public URL
before M8. The guard hook blocks `wrangler pages deploy` for that reason.

## Setup

```
cd apps/map      && pnpm install                      # after M1
cd tools/pipeline && python3 -m venv .venv && pip install -e ".[dev]"   # after M9
make verify                                           # both halves
```

`pnpm dev` and `make serve` are yours to run — the guard hook stops Claude starting either.

## Fill in first

Two provisional decisions block the M2 migration. Both need their real data:

- **D-012** — the plot field list. Get a page of their current WhatsApp status PDF; every
  column on it is a field they actually use, and anything not on it is speculation.
- **D-013** — the real status words, and whether a registered sale can ever be reversed.
  `registered` is currently terminal, and retrofitting an escape hatch after live data
  exists is genuinely painful.

Adding a column later is cheap. Renaming one after live data exists is not.

## Ask them for this

The highest-leverage thing in this project is not code — it is the state of the drawing
before it reaches the pipeline. Since D-118 that is the owner's own job: each colony's DWG is
normalised in AutoCAD to `docs/cad-layer-standard.md` and exported as DXF. The pipeline reads
DXF only and refuses anything that does not conform.

The one thing to ask **whoever holds the files** for: the **as-sold / final sanctioned**
layout, not the latest working drawing. They differ, and building from a superseded revision
is a quiet, serious failure — the map simply contradicts the sale deeds and nothing looks
wrong.

Where no DWG exists at all, attach the plan image in AutoCAD and trace it there. `make
inspect PDF=...` says which case a given file is.

## Recurring cost

A domain name, roughly ₹1,000/year. Cloudflare Pages, Supabase, and the pipeline are all
free at this scale, and the pipeline has no marginal cost per colony at all.
