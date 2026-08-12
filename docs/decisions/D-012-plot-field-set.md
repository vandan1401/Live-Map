# D-012 — Plot field set

**Status:** provisional — **confirm before M2 writes the migration**

## Decision

Fields derived from what the owner stated directly ("who owns the plot, who was the broker,
status of plot") plus what geometry gives for free:

| Field | Type | Source |
|---|---|---|
| `svg_id` | text | manifest — joins to the SVG |
| `block`, `number` | text | manifest |
| `area_sqft` | integer | derived from geometry |
| `facing` | enum, 8 compass points | derived from the nearest road edge |
| `is_corner` | boolean | derived — touches road on two non-parallel sides |
| `status` | enum | see D-013 |
| `owner_name`, `owner_phone` | text, nullable | entered |
| `broker_name` | text, nullable | entered |
| `rate_paise`, `booking_amount_paise` | bigint, nullable | entered (D-010) |
| `booking_date`, `registry_date` | date, nullable | entered |
| `notes` | text, nullable | entered |
| `version` | integer | concurrency (D-006) |
| `updated_by`, `updated_at` | attribution (D-007) |

## Reasoning

`facing` and `is_corner` are included specifically because both carry a price premium in
Indian plot sales and both come free from the geometry. Deriving them once saves the family
typing two fields several hundred times per colony and removes a transcription error class.

## Why this is provisional

The authoritative field list is the column set on the family's existing WhatsApp status PDF —
every column on it is a field they actually use, and anything not on it is speculation. That
document was requested during planning and not yet supplied.

Adding a column later is cheap. Renaming or retyping one after live data exists is not. So
this must be confirmed **before** the M2 migration, not after.

## Rejected alternatives

- **Wait for the PDF before scaffolding** — would have blocked all of M1, which needs no
  schema.
- **A generic JSONB attributes bag** — flexible, but unqueryable, untypable, and it makes
  every field optional forever.

## Amended 2026-08-14 — displayed field set narrowed to dimensions + conditional owner

The owner gave a direct, explicit answer for what the plot detail sheet should show:
**length, breadth, and the owner's name — only while the plot is `booked`** (not
`registered`, confirmed when asked; the attribution line and `plot_history` list stay,
also confirmed — those answer "who changed this and when," a different question from
"what does this plot look like").

Two new columns, `length_ft`/`breadth_ft` (`numeric not null`), are added to the table
above — they didn't exist before, geometry doesn't derive them the way it derives
`area_sqft`/`facing`/`is_corner`, so they're entered like `owner_name` etc. (in practice,
added by hand to the one hand-authored demo fixture manifest — the real pipeline that
would derive or import them doesn't exist yet, pre-M9).

This is a **display** change only. `owner_phone`, `broker_name`, `rate_paise`,
`booking_amount_paise`, `booking_date`, `registry_date`, `notes` are still all real
columns in `plots` — nothing was dropped from the schema, and `spec/00-rules.md` already
permits storing `booking_amount_paise` as a plain number. The authoritative-PDF question
this decision was originally waiting on is still open; this amendment answers a narrower,
more urgent question (what does the *sheet* show today) without resolving the wider one.

