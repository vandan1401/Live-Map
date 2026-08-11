# D-115 — DXF front end deferred and conditional on evidence

**Status:** accepted

## Decision

No DXF reader is built now. If one is ever built, it plugs in as an alternative producer of
the M2 intermediate structure and touches nothing downstream. The decision to build is gated
on evidence from the triage report, not on expectation.

## Reasoning

The developer is large and probably has clean DWG files. But size predicts *having* the
files and having someone who owns them — it predicts layer hygiene less well, because a firm
with fifteen projects typically has plans drawn by different architects across years. Quality
varies between colonies rather than being uniformly good. Larger drawings also carry more
junk: revision clouds, marketing overlays, phase boundaries, sales annotations.

More importantly, exporting DWG to a vector PDF preserves everything a DXF reader would have
extracted — exact geometry and real text labels — so the CAD files are not wasted even
without a DXF path. They become the best-quality PDF source available (D-102).

The gate: run the triage report on two or three real colonies. If a majority need DXF, build
it. Otherwise this stays unbuilt, and probably should.

## Two risks worth naming regardless

**Revisions.** A large firm has Rev A through Rev G with plot lines genuinely moved between
them — a garden becomes four plots, a road shifts. Building from a superseded layout is a
quiet failure: everything looks fine and the map contradicts the registry. Always ask for the
**as-sold / final sanctioned** layout, not the latest working drawing (D-116).

**Layer discipline at the source.** The highest-leverage action in this whole project is not
code — it is a one-page layer standard sent to their CAD person, or better, the
three-PDF layer-separated export described in `README.md`. A firm this size has someone who
can do it, and it removes the messiest part of the pipeline for three minutes of their time.

## Blast radius

None, being unbuilt. Additive if built.
