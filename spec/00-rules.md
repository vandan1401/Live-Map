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
| Vision or LLM models for polygon geometry | Reading plot **numbers** via local OCR, and parsing their existing status PDF into rows. Never coordinates. |
| Cloud OCR (Google Vision, AWS Textract) | None. Local only (D-113). |
| SAM, GPU inference, any torch/tensorflow dependency | None. Blocked by the guard hook. |
| Survey-grade or to-scale geometry claims | Every export carries "Indicative layout — not to scale". |
| Writing directly into the `colony-map` repo | None. Export to `out/`, the human moves it. |
| A DXF front end | Only after `inspect` shows a majority of real colonies need it (D-115). |
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
| Registered | Sale deed executed. Reversible to `available` under D-013 (amended). | Recorded in the app |
| On hold | Deliberately withheld from sale by the family | Awaiting paperwork |
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
| Override | A hand-made correction, keyed and durable | A config setting |
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
3. **Override loss** — a rerun after a code change reapplies every existing override. Silent
   loss is the failure that makes the tool untrustworthy; the human only notices when a plot
   they fixed is wrong again.
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
  `fixtures/demo-plan.pdf` must reproduce the 45 plot ids and centroids in
  `fixtures/shree-vatika-2/colony.json` — the same file the app renders.
- **Override durability** is proved by writing one, rerunning, and asserting it survived.
- **RLS policies and grants** are proved by querying as an anon client, never by reading the
  migration file.
- **The service worker** is proved from a built, served bundle with the network offline. A
  passing unit test proves nothing about caching.
- **Realtime** is proved with two clients, one writing and one observing.
