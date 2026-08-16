# D-101 — PDF-first pipeline, not DXF-first

**Status:** superseded by D-118 - the owner is the CAD operator, so the availability and
layer-hygiene arguments below no longer hold.

## Decision

The pipeline reads PDFs. A DXF front end is conditional and probably never (D-115).

## Reasoning

DXF is technically nicer — real vector data with named layers. The deciding factor is not
which is nicer but what will actually be handed over, and how much effort survives when the
input varies.

Three arguments:

**Availability.** The family circulates PDFs today. Getting a DWG means going back to
whichever architect drew each colony; for older projects the file may be on a dead laptop
or with a draftsman who stopped working with them years ago. DXF-first means every colony
without a CAD file blocks the pipeline. PDF-first means nothing ever blocks it.

**The DXF long tail.** Clean layered files take five minutes; exploded line segments with
junk layer names take hours — and you cannot tell which you have until you open it. That
rescue logic is fiddly, hard to test, and specific to whoever drew that file.

**Effort convergence.** The verify page and the manual tracing tools are needed regardless
of input format, and they are the bulk of the build. PDF-first reuses 100% of them.
DXF-first needs all of that *plus* a CAD parsing layer.

## Rejected alternatives

- **DXF-first with PDF bolted on** — would produce two parallel pipelines that drift.
- **DXF only** — blocks on file availability and fails entirely on a photographed plan.

## Blast radius

Low to reverse. A DXF reader plugs in as an alternative producer of the M2 intermediate
structure and touches nothing downstream.
