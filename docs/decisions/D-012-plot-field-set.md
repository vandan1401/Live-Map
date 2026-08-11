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
