# D-202 — Blockless plot IDs are `plot-{NN}` with `"block": ""`, not an optional/omitted field

**Status:** accepted
**Date:** 2026-08-21
**Range:** Both (D-2xx) — `contract/`, `tools/pipeline`, `apps/map` all change together
(invariant 1)

## Context

The contract required every plot to carry a block letter: `svg_id` matched
`^plot-[A-Z]+-[0-9]{2,}$`, `block` matched `^[A-Z]+$`, both required fields in
`contract/colony.schema.json`. `docs/cad-layer-standard.md`'s existing convention —
`blocks[0]` is the default block every bare (unprefixed) plot number resolves to — assumed
every colony has at least one real lettered block.

Real-world trigger: the Jai Dev Residency colony (mid-normalisation in AutoCAD, not yet a
committed DXF) has bare plot numbers `1`–`6` and explicit `A-1`–`A-6` labels on the same
drawing, confirmed by the owner to be genuinely separate plots — not the same six plots
under two labels. Forcing the bare numbers under an invented placeholder block letter (e.g.
`plot-M-01`) would misrepresent the drawing; the owner wants them to render with no block at
all.

## Decision

A plot with no block is `svg_id: "plot-{NN}"`, `block: ""` — the empty string, never an
omitted or `null` field. `plots[].required` in the schema is unchanged; every plot object
always carries both `svg_id` and `block`.

`ColonyConfig` gained a new field, `default_block: str | None`, resolved by
`load_colony_config` from an optional `default_block` JSON key: absent → `blocks[0]` (today's
exact behavior, unchanged for every existing colony config); explicit `null` → blockless;
an explicit letter → that letter, but only if it's a member of `blocks` (validated, raises
`DxfConformanceError` otherwise — the same guarantee `blocks` already gives an explicit
prefix like `B-7`).

The `default_block` field on the Python dataclass has **no default value** — it is required
at every construction site, forcing all four (`load_colony_config`, and the three test
modules that construct `ColonyConfig` directly) to be explicit about what a bare number
means for that config, rather than relying on an implicit fallback baked into the dataclass
itself.

## Reasoning

**Empty string, not `null`/optional, for `block`:** keeps every existing type in both halves
unchanged. `apps/map`'s `PlotRow`/manifest TypeScript types stay `block: string` — no `| null`,
no optional-chaining introduced at any of the four display call sites
(`PlotDetailContent.tsx`, `PlotTableRow.tsx`, `searchPlots.ts`, `shareSummary.ts`), no schema
`required` list change, no Postgres migration (`plots.block text not null` already accepts
`''`). The alternative (omit `block` for a blockless plot, or make it nullable) would have
touched every one of those sites' type signatures for a change that, semantically, only
needs "no letter" to be a representable value of a string field — which `""` already is.

**`default_block` required, not defaulted, at the dataclass level:** a colony config that
doesn't say what a bare number means is exactly the kind of ambiguity `tier-1.md` ("Matching
is identity... Ambiguity is a hard error, not a confidence score") already treats as a bug,
not a case to paper over. Putting the *fallback* (absent-key → `blocks[0]`) in
`load_colony_config` instead of the dataclass keeps that distinction visible: JSON is allowed
to omit the key (backward compatible), but no Python code path can construct a `ColonyConfig`
without deciding.

**`default_block` validated against `blocks`:** added mid-build after a `/review` finding —
without it, `"blocks": ["A"], "default_block": "B"` would silently stamp every bare number
`plot-B-07` for a colony with no B block, which is structurally impossible before this change
(`config.blocks[0]` could never point outside `blocks`). `docs/cad-layer-standard.md` was
updated in the same commit to state `blocks` lists every block the colony uses, including the
one `default_block` names.

**Lexical sort consequence, accepted, not fixed:** `apps/map/src/lib/db/plots.ts`'s
`fetchPlotsByColony` orders by `svg_id` lexically for a stable table-view ordering
(`docs/plans/10.md` review finding). `"plot-07"` sorts before every `"plot-A-…"` id (ASCII
`'0'` < `'A'`), so blockless plots as a group appear before every lettered block, not
interleaved by number. Accepted as a real, visible consequence for a colony mixing both —
not solved here, since the actual display order for a mixed colony is a call for whoever
sees Jai Dev Residency's real data, not something to guess a fix for now.

## Rejected alternatives

- **Invent a placeholder block letter for bare numbers (e.g. `M` for "Main")** — rejected by
  the owner directly: bare `1`–`6` are not part of any block on the real drawing, and a
  placeholder letter would misrepresent that.
- **Make `block` optional/nullable in the schema and TypeScript types** — touches every
  consumer's type signature repo-wide for no semantic gain over `""`, which the DB column
  already accepts unchanged.
- **Let `default_block` silently fall back at the dataclass level** (a Python default value
  instead of a required field) — considered, rejected: it would hide the "what do bare
  numbers mean for this colony" decision inside a class default rather than forcing every
  config (and every construction site) to state it, re-introducing exactly the kind of
  implicit convention this change exists to make explicit.

## Blast radius

Contract-wide (`contract/colony.schema.json`, `contract/SPEC.md`), plus
`tools/pipeline/pipeline/{extract,matching}/`, plus five `apps/map` display/parse sites
(`svgPlotIds.ts`, `shared/format.ts`, and its three callers) and one derived summary view
(`ColonyUploadStageView.tsx`). No migration, no RPC change, no write-path change — read/parse/
display only. `tools/pipeline/colonies/shree-vatika-2.json` (the one existing colony config)
is unaffected by construction (§ Decision, absent-key fallback). No real colony currently
exercises the blockless path — `tools/pipeline/colonies/jai-dev-residency.json` still can't
be written until the owner produces a real DXF for it.
