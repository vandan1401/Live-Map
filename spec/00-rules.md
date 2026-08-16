# Rules

The output contract lives in `contract/SPEC.md` and `contract/colony.schema.json`. That is
the interface between the two halves; both validate against it and a one-sided change fails
a test. Read it before touching either half's boundary code.

This file covers what must never be built, the words that matter, and how work is proved.

## Never build — apps/map

Each entry is out of scope. Where a narrow exception exists it is named; where it says
"none", there is no version of this that is in scope.

| Never build | Narrow approved exception |
|---|---|
| Satellite or aerial imagery overlay | None. Ruled out explicitly by the owner. |
| Native iOS/Android app, App Store, TestFlight, Capacitor wrapper | None. PWA only (D-001). |
| Per-user roles, granular permissions, broker-scoped visibility | None. All users are equal admins (D-007). |
| Public buyer-facing or broker-facing view | None in v1. |
| Payments, EMI schedules, commission calculation, invoicing | Storing `booking_amount_paise` as a plain number is fine. Computing anything from it is not. |
| Google Sheets or any spreadsheet as the live data store | A one-off CSV import for the initial data load only. |
| Cloudflare Access | None. Superseded by D-003. |
| Vision or LLM models for polygon geometry | None in this repo. Belongs to the pipeline project. |
| Per-colony custom CSS or themes | None. One theme, CSS variables, every colony. |
| Multi-tenancy, other developers as customers | None. One family business. |
| Notifications, chat, comments, activity feed | `plot_history` is a data record, not a feed. Rendering it inside the plot detail sheet is in scope; a global feed is not. |
| Offline write queue | None while D-008 stands. Writes require connectivity and say so. |
| Photo or document upload per plot | None in v1 (D-015). |
| Survey-grade or to-scale geometry claims | The map always carries "Indicative layout — not to scale". |

## Never build — tools/pipeline

| Never build | Narrow approved exception |
|---|---|
| Vision or LLM models for polygon geometry | None. Plot numbers are real text in the DXF (D-118); no OCR is built. Parsing their existing status PDF into rows stays permitted. Never coordinates. |
| Cloud OCR (Google Vision, AWS Textract) | None. Local only (D-113). |
| SAM, GPU inference, any torch/tensorflow dependency | None. Blocked by the guard hook. |
| Survey-grade or to-scale geometry claims | Every export carries "Indicative layout — not to scale". |
| Writing directly into the `colony-map` repo | None. Export to `out/`; a human uploads the two files in the app (D-025). |
| A PDF or raster geometry path | None while D-118 stands. DXF is the only built input; a plan with no DWG is traced in AutoCAD, not detected. |
| Browser tracing or geometry-editing tools | None. The operator has AutoCAD (D-118). |
| An override store outside the DXF | None. The DXF is the source of truth; anything corrected elsewhere is lost on the next run (D-118, superseding D-107). |
| A DXF reader that repairs, guesses, or falls back | None. Non-conforming input is refused with the offending entity handle. Tolerance here reintroduces exactly the rescue logic D-101 rejected. |
| Automatic export without human verification | None (D-108). |
| A build step for the verify page | None. It must open from `file://` with no tooling. |
| Per-colony hardcoded constants | Anything colony-specific goes in that colony's config file, never in code. |

## Vocabulary — the business

The wrong word here produces a UI that lies about who owns what.

| Term | Means | Does NOT mean |
|---|---|---|
| Plot | One saleable land parcel with an ID | Any polygon in the SVG |
| Feature | Road, garden, amenity, water body — static, not saleable | A product feature |
| Booked | Buyer committed, money taken, registry not done | Reserved, held, or enquired |
| Registered | Sale deed executed. Reversible to `available` under D-013 (amended). Displayed as "Registry done". | Recorded in the app |
| Owner | The buyer named on the plot record | The developer |
| Broker | Whoever brought the buyer — determines commission | Any family member |
| Colony | One layout: an SVG plus a manifest plus its plot rows | A Supabase project |

## Vocabulary — the pipeline

| Term | Means | Does NOT mean |
|---|---|---|
| Plot | A saleable parcel with a number | Any closed polygon |
| Feature | Static map content — road, garden, amenity | A product feature |
| Match | A label assigned to a polygon | A polygon that was detected |
| Verified | A human confirmed this plot | The QA gate passed |
| Normalise | Preparing a DWG in AutoCAD to the layer standard | Anything the pipeline does to input |
| Confidence | How the match was made, not a probability | A model score |

## Failure-mode checklist

Any task that writes state or output walks the relevant list by name, in its plan and again
in `/check`.

### apps/map — writing plot state

1. **Partial writes** — a status change updates `plots` and appends `plot_history`. Both or
   neither. A status without its history row is unattributable, which defeats the table.
2. **Idempotency** — a double-tap on Save must not append two history rows. The version
   check should make the second write fail, and that path needs a test.
3. **Concurrency** — two clients writing the same plot. One must fail with a named conflict.
   Proved by an actual concurrent test, not by the existence of a constraint.
4. **Orphans** — a plot row whose `svg_id` matches no path renders nowhere and is invisible.
   Validate the join at import, not at render.
5. **Dead computation** — `facing` and `is_corner` come from the manifest. Nothing recomputes
   them.

### tools/pipeline — writing output

1. **Partial writes** — an export writes SVG and manifest. Both or neither.
2. **Idempotency** — two runs on the same input produce byte-identical output. Tree scatter
   is seeded for exactly this reason. A diff between clean runs is a bug.
3. **Silent re-identification** — a rerun must not change an `svg_id` that a previous export
   emitted. It orphans the `plots` and `plot_history` rows already in the database, and the
   new export looks perfectly correct on its own. Blocking, not a warning.
4. **Orphans** — a polygon with no id, an id with no polygon, a label matched twice. All
   three are blocking QA failures, never warnings.
5. **Dead computation** — `facing`, `is_corner`, `area_sqft` computed once at export, stored.

## Verification rules

A green test suite is evidence, not proof.

- **The contract** is proved by validating against `contract/colony.schema.json` and by
  grepping emitted SVGs for `fill=`, `stroke=`, `style=` and asserting zero hits.
- **Geometry correctness** is proved by rendering and looking. The fixture generator shipped
  a bug — `<use>` with no width/height scaling every tree to the full viewport — that every
  unit test passed and only a raster render caught. Render before believing.
- **The golden fixture** is the strongest automated check available: the pipeline run on
  `fixtures/shree-vatika-2/colony.dxf` must reproduce the 26 plot ids and centroids in
  `fixtures/shree-vatika-2/colony.json` — the same file the app renders.
- **Reader strictness** is proved by feeding it a non-conforming DXF and asserting a
  non-zero exit naming the offending entity — never by reading the validation code back.
- **RLS policies and grants** are proved by querying as an anon client, never by reading the
  migration file.
- **The service worker** is proved from a built, served bundle with the network offline. A
  passing unit test proves nothing about caching.
- **Realtime** is proved with two clients, one writing and one observing.
