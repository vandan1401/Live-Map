---
paths:
  - "contract/**/*"
  - "apps/map/supabase/migrations/**/*"
  - "apps/map/src/lib/plot-status/**/*.ts"
  - "apps/map/src/lib/sync/**/*.ts"
  - "apps/map/src/lib/auth/**/*.ts"
  - "apps/map/src/pwa/**/*.ts"
  - "apps/map/public/sw.js"
  - "tools/pipeline/pipeline/geom/**/*.py"
  - "tools/pipeline/pipeline/matching/**/*.py"
  - "tools/pipeline/pipeline/export/**/*.py"
  - "apps/map/src/features/colony-upload/**/*.tsx"
  - "apps/map/src/features/colony-upload/**/*.ts"
  - "docs/cad-layer-standard.md"
---

# Tier 1 — money, state, identity, the contract

## apps/map

You are in the part of this codebase where a bug costs the family real money or produces
an argument between them. Full loop: `/plan` before `/build`, `/review` before `/wrap`.

### Money

Every monetary value is an **integer count of paise**, at every layer: the Postgres column
(`bigint`), the TypeScript type, the JSON on the wire, and application state. Column and
field names end in `_paise` so a float slipping in is visible at the call site. Rupees
exist in exactly one place — the render formatter — and nowhere else.

`0.1 + 0.2` is not `0.3`. A rate stored as a float and multiplied by an area is wrong by
an amount too small to notice and too large to ignore once it reaches a receipt.

### State transitions

`plots.status` is written by exactly one function: `applyPlotTransition()` in
`apps/map/src/lib/plot-status/`. Not by a component, not by a hook, not by a route handler, not by
a "quick fix" in a feature module. If you find yourself needing a second write path, that
is a finding to report, not a thing to build.

The legal transitions come from D-013. **Every rejected illegal transition has its own
test.** Not a representative sample — every one. The table is small; the cost of writing
them all is an hour, and the cost of missing one is a plot that silently un-sells itself.

### Concurrency

Uniqueness and concurrency are enforced by the **database**, never by application code.
A `SELECT` followed by an `INSERT` is not a uniqueness check; it is a race with a
comfortable-looking shape.

- `(colony_id, svg_id)` is unique via a constraint.
- Status writes send the `version` the client last read; a mismatch fails.
- A failed write returns the **name** of whoever won, because "someone else changed this"
  gives the user nothing to do and "Rajesh changed this" ends the confusion immediately.

Proving concurrency means running an actual concurrent test. The existence of a unique
index proves nothing about your write path — the index will happily reject a write your
code never checked the result of.

### Append-only history

`plot_history` accepts INSERT and nothing else, enforced in the database. This table is the
evidence that settles a commission dispute among five family members. A history that can
be edited is not evidence.

The status update and its history row are one transaction. Both or neither.

### Cache and freshness

Data rendered without a visible age is the failure mode that kills adoption — they will
go back to WhatsApp, where at least the timestamp is honest. `apps/map/src/lib/sync/` owns that
guarantee. On reconnect, refetch rather than assuming no events were missed while
disconnected; a missed realtime event is invisible and permanent.

### Auth (from M8)

The user id on a write comes from the server-side session. Never from a client-supplied
field. A client-supplied user id turns attribution into a claim, and the whole point of
`plot_history` is that it is not a claim.

Until M8 ships, RLS is permissive and this app must not be on a public URL (D-011).

### Write checklist

Before finishing any task in these paths, walk `spec/00-rules.md`'s five failure modes by
name — partial writes, idempotency, concurrency, orphans, dead computation — and say what
each one means for this specific change.

## tools/pipeline

You are in the part of this tool where a bug puts the wrong owner's name on a plot in the
app, or silently discards work a human already did. Full loop: `/plan` before `/build`,
`/review` before `/wrap`.

### Matching is identity

A plot ID assigned to the wrong polygon is not a rendering glitch — it means the app shows
plot A-14's owner, broker, and price on plot A-15. Nobody catches it by looking at the map,
because the map looks fine.

The assignment ladder in `spec/04` is ordered on purpose. **Never add a rung that guesses.**
If containment fails and nearest-centroid is out of threshold, the answer is "flagged", not
"probably this one". A flagged plot costs five seconds in the verify page; a wrong one costs
a phone call to a buyer.

Every match records **how** it was made in `confidence`. That field drives the red/amber/
green colouring that the human relies on. A match recorded as `contained` when it was really
`nearest` defeats the entire verification step.

### The contract is shared

`spec/00-rules.md` pins the SVG class vocabulary, the id format, and the manifest schema.
`colony-map` depends on it. Changing any of it breaks the other repo silently — the app will
render an empty map or drop plots, and nothing will error.

Specifically, in emitted SVGs:

- No `fill`, no `stroke`, no `style`. Ever. Verified by grep in the QA gate.
- `<use>` carries explicit `width` and `height`. Without them it defaults to 100% of the
  viewport and every tree covers the whole map. This already happened once.
- Ids are `plot-{BLOCK}-{number}`, block uppercase, number zero-padded to two digits — or
  `plot-{number}` for a blockless plot (`block: ""` in the manifest, docs/plans/15.md).

### Y is flipped

CAD counts Y upward; SVG counts Y downward. Every transform flips it. A mirrored plan looks
plausible — the plots are all there, the roads all connect — which is why this needs its own
test rather than a visual glance.

### The DXF is the source of truth

There is no override store (D-118, superseding D-107). A correction is made in the drawing
and re-ingested, so it survives every rerun by construction.

- **Never add a stage that edits geometry or identity after ingest.** It would hold a
  correction the next run silently discards — invariant 6, arrived at from a new direction.
- The reader is **strict**: refuse non-conforming input naming the offending layer and
  entity handle. Never repair, never guess, never fall back. Tolerance here rebuilds the
  untestable rescue logic D-101 rejected, which is the whole reason this path is cheap.
- Ambiguity is a hard error, not a confidence score. Two labels in one plot, a label in no
  plot, a number outside `number_range` — all fail loudly and name the entity.
- Mechanical transforms (block resolution, zero-padding) stay in code; judgement (which ring
  is a plot, is it closed, is this the as-sold revision) stays in AutoCAD. D-118 has the
  full statement of that line.

### Export is the last gate

The QA checks in `tools/pipeline/pipeline/export/qa.py` are blocking, not advisory. A warning that lets a
broken colony through is worse than no check, because it teaches the human to ignore output.

`"verified": false` on every export, with no exception and no flag to override it. Nothing
in `tools/pipeline` may write `true` — the verify page has no button for it since D-025, and
adding one back is a review finding. The single writer is the app's upload confirmation,
shown in front of the rendered map, because a flag inside an uploaded file is a claim rather
than evidence that a human looked.

### Purity in `tools/pipeline/pipeline/geom/`

No `fitz`, no `cv2`, no `PIL`, no file handles. Tests first. This layer is depended on by
everything and is the cheapest place in the repo to be certain.

### Write checklist

Before finishing, walk `spec/00-rules.md`'s five failure modes by name — partial writes,
idempotency, silent re-identification, orphans, dead computation — and say what each means here.

---

Path-scoped rules are **not** re-injected after compaction. If this session was
compacted and you are still in Tier 1, re-read this file before continuing.
