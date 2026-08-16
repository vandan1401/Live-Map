# D-118 — CAD-first: a normalised DXF is the only built input

**Status:** accepted
**Supersedes:** D-101, D-102, D-107, D-111, D-115

## Decision

The pipeline reads **DXF only**. For every colony, the owner opens the original DWG in
AutoCAD, normalises it to the layer standard in `docs/cad-layer-standard.md`, and exports
DXF. Where no DWG exists, the owner attaches the plan image in AutoCAD and traces it there.

The reader is **strict**: a DXF that does not conform is refused with a message naming the
offending layer and entity handle. It never repairs, guesses, or falls back.

No PDF parsing, no rasterisation, no OCR, no browser tracing tools, and no override store
are built.

## Reasoning

### The premise D-101 rested on has changed

D-101 chose PDF-first on two load-bearing arguments, and both assumed the CAD operator is
somebody else:

- **Availability** — "getting a DWG means going back to whichever architect drew each
  colony." The owner has the original DWGs for the 10–12 colonies in scope. Where one is
  missing, they trace it in AutoCAD over an attached image, which is strictly better than
  any tracing tool this repo could ship.
- **The DXF long tail** — "exploded line segments with junk layer names take hours, and you
  cannot tell which you have until you open it." True, and it remains true. What changes is
  *who pays that cost and in what medium*. D-101 assumed it had to be paid in rescue code:
  fiddly, untestable, and specific to whoever drew that file. It is now paid by hand, in
  AutoCAD, by someone fluent in it. `PEDIT → Join` on an exploded outline is seconds. The
  equivalent Python is the single largest and least testable chunk of M10–M12.

The reader stays small permanently **because it never sees a messy file.** Normalisation
moved upstream of the code, into a tool built for exactly that job.

### What belongs in AutoCAD, and what does not

The line is **judgement versus mechanical transform**, and it is worth stating because every
future "should the owner just do this by hand?" question resolves against it.

*Judgement* moves upstream into AutoCAD: which ring is a plot, whether an outline is really
closed, whether this is the as-sold revision, which polygon is the clubhouse. These need a
person who can read a site plan, they are why the reader can stay small, and no amount of
code substitutes for them.

*Mechanical, lossless, verifiable transforms* stay in code, even though the owner could
technically do them in AutoCAD. Renumbering 300 plots from `7` to `A-07` by hand is the
clearest case: it is pure tedium, it introduces the mis-typed-number failure that M13's gate
then has to catch, and it must be redone from scratch every time a plan is re-cut. The
drawings carry bare numbers (`1`, `2`, … `11`) with the occasional explicit prefix; block
resolution and zero-padding are M12's job, driven by `blocks` and `number_width` in the
colony config.

Getting this line wrong in the permissive direction rebuilds the rescue logic D-101
rejected. Getting it wrong in the strict direction bills the owner for work a loop does
better.

### The human in the loop is the business model, not a cost

The strongest argument against CAD-first was that it makes onboarding depend on one person.
The owner bills ₹10–30 per plot per colony for that work. Operator-dependence is the
product. The former M16's target — "a 300-plot colony in under 15 minutes with no CAD file" —
was solving a problem this project does not have.

### D-115 named this outcome and set the gate

D-115 said the highest-leverage action in the project "is not code — it is a one-page layer
standard sent to their CAD person," and gated a DXF path on evidence. The evidence arrived
from an unanticipated direction: the owner **is** the CAD person, so the layer standard is
free and enforceable rather than a request to a third party. D-101's own blast-radius note
already provided the seam — a DXF reader "plugs in as an alternative producer of the
intermediate structure and touches nothing downstream."

### What it costs and what it saves

| Milestone | Under D-118 |
|---|---|
| M10 ingest (was "vector extract") | Replaced by a small DXF reader. Layers carry classification, so it is a read, not an inference |
| M11 geometry core | `snap`/`polygonize`/`dedupe` deleted — a closed polyline is already a ring. Replaced by **validation**: closed, non-self-intersecting, non-overlapping |
| M12 identity (was "matching") | Confidence ladder deleted. One containment loop; anything ambiguous is a hard error, not an amber flag. Also owns block resolution and zero-padding |
| M13 derive + export (**merged** from the old M13 and M14) | Both **unchanged** in substance, and the QA gate is worth more — see risks. They are one pass and one artifact, so they are now one spec |
| M14 verify page (was M15) | Read-only review plus "Mark verified". No editing UI |
| ~~M16 tracing tools~~ | **Cut**, spec deleted. A worse CAD in a browser, for an operator holding a better one. Its two-point scale calibration (D-111) goes with it |
| ~~M17 overrides + raster~~ | **Cut**, spec deleted. See the two sections below |

The pipeline is six milestones now, contiguous: `spec/09` triage, `10` ingest, `11` geometry,
`12` identity, `13` derive + export, `14` verify. This decision record is the only remaining
account of what the former M16 and M17 were and why they are not being built.

### Overrides (supersedes D-107)

D-107 exists because rerunning a *detector* moves geometry underneath hand corrections.
There is no detector. A correction is made in the DXF, which is the source of truth, and it
survives every rerun by construction — the failure D-107 guards against cannot occur.

Invariant 6 in `CLAUDE.md` ("Overrides survive reruns") therefore needed restating so it
stays true. **Applied 2026-08-17** with the owner's approval:

> 6. **Corrections survive reruns.** The DXF is the single source of truth for geometry and
>    identity; a correction is made there and survives by construction. No pipeline stage may
>    hold a correction a rerun would silently discard.

The intent is unchanged — no hand correction is ever silently lost — only the mechanism.

### Scale (supersedes D-111)

D-111 rejected reading CAD units because `$INSUNITS` "is frequently not set correctly." That
objection stands against reading units *blindly*. Here the owner draws or verifies the
drawing in feet and states `px_per_ft` in the colony config, and the export gate checks it
against a plot whose real dimensions they already know. Asserted and checked, not inferred.
Two-point calibration is unbuilt; nothing needs it.

### Raster and OCR (supersedes D-102, leaves D-103 standing)

D-102's ranking (vector primary, raster fallback) no longer describes anything being built.
The raster path is unbuilt because a plan with no DWG gets traced in AutoCAD instead.
**D-103 stays accepted** — it forbids vision/LLM models for geometry, and that guardrail
must not lapse just because the path it governed is dormant. If a raster-only input ever
appears, the shape of the fix was: render at 300 DPI or better, `grayscale → adaptive
threshold → morphological close → findContours(RETR_CCOMP) → approxPolyDP → filter by area`,
local OCR feeding the same identity step — expect 85–95% on a clean scan. It would plug in as
an alternative producer of M10's intermediate structure and touch nothing downstream.

**Reviving it means reviving override durability with it.** OCR output is detector output,
and detector output reintroduces exactly the "corrections lost on rerun" failure D-107
described. Do not build one without the other.

## Rejected alternatives

- **Keep the PDF path alongside DXF** — two parallel pipelines that drift. This is D-101's
  own argument against "DXF-first with PDF bolted on," still valid, now pointing the other
  way.
- **Build M16 anyway as a fallback** — a browser tracing tool exists to serve an operator
  without CAD. There is no such operator here, and an unused Tier 1 module rots.
- **Read messy DXFs tolerantly** — reintroduces the untestable rescue logic that made D-101
  reject DXF-first in the first place. Strictness is the whole trade.

## Risks

- **Single-operator dependency.** Accepted deliberately; it is the revenue model. The
  mitigation is that `docs/cad-layer-standard.md` is a procedure someone else could follow,
  not knowledge held in one head.
- **Revision risk, carried over from D-115 unchanged.** A firm has Rev A through Rev G with
  plot lines genuinely moved between them. Always normalise the **as-sold / final sanctioned**
  layout, never the latest working drawing (D-116).
- **Human error replaces detector error, and it is quieter.** A detector's mistakes cluster
  and look wrong; a mis-typed plot number in AutoCAD looks perfectly correct. This *raises*
  the value of M13's blocking QA gate and M14's human check — neither is relaxed because the
  input got cleaner.

## Blast radius

**None on `apps/map`.** The contract is untouched; `contract/colony.schema.json` already
admits `"method": "dxf"` in `source.method`.

**High on `tools/pipeline`**, which is almost entirely unbuilt — M9 triage is the only
milestone shipped, and it survives as the tool that tells you what a file you were handed
actually is.
