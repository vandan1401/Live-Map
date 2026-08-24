# D-029 — CSV bulk-import format simplified to plot + owner name, matched by label, lenient on bad rows

**Status:** accepted

## Decision

`lib/colony/parseBulkImportFile.ts`'s CSV contract (docs/plans/10.md) changes from a fixed,
order-sensitive 10-column header — `svg_id,status,owner_name,owner_phone,broker_name,
rate_paise,booking_amount_paise,booking_date,registry_date,notes`, any row error rejecting
the whole file — to two columns: **plot**, then **owner name**. Every other column in the
file, however many there are, is never read. `status` is not a column at all: it is derived
— a real owner name means `booked`, a blank cell or the literal token `NMC` (any case) means
`available`. The plot column is matched against the colony's real plots by displayed label
(`formatPlotLabel` — e.g. `A-01` or the blockless `07`), case-insensitively and tolerant of
stray whitespace around the hyphen, not the raw `svg_id`. A row whose plot doesn't match any
real plot, or repeats an earlier row's plot, is **skipped and reported** — the rest of the
file still imports, unlike the old format's all-or-nothing rejection.

`bulk_set_initial_plot_data` (the RPC, D-023) and its eligibility window are unchanged —
this is a parsing/UX change only, still producing the same `BulkImportRow` shape the RPC
already accepted.

## Reasoning

Owner ask, 2026-08-24: their real working spreadsheet has many columns (phone, notes, rate,
whatever else has accumulated over time) and they want to export it as-is — "if there is
csv which contains more entries just trim that and only consider plot and owner... rest
available or not is automatically extracted." The old format's design point (docs/plans/10.md
§2.2) was deliberately strict — no column mapping, exact header match, reject-on-any-error —
because it was built for a *first-time, full-fidelity* initial data load (rate, phone,
broker, dates all mattering at once) where a silently-wrong row is worse than a loud
rejection. That is a different job from "I have a rough sheet of who's booked what, get it
into the app fast." Rather than force one shape to serve both, this session picked the
lenient, minimal-field shape — full-fidelity re-entry by hand, one plot at a time, remains
possible through the table view (`features/plot-table/`) for anyone who needs rate/phone/
broker/dates recorded.

Matching by displayed label rather than raw `svg_id` follows directly from the format's own
premise: a family member's sheet has never seen a `svg_id` like `plot-A-01`, only the
number/label printed on the site plan and shown on the map, so requiring the internal id
would just move the friction from "extra columns" to "wrong plot identifier."

## Rejected alternatives

- **Add this as a second mode alongside the strict format, offered by choice on the same
  screen** — the natural "both jobs, one screen" answer, and what was proposed first;
  rejected by explicit owner choice in favor of a clean replacement, since the strict
  format's actual daily job (quick status updates from a working sheet) is exactly what
  this format now serves, and the table view already covers deliberate one-plot-at-a-time
  full-fidelity entry.
- **Require the raw `svg_id` in the plot column, unchanged from before** — rejected: it
  would still force column-editing on a real sheet before upload, which is the friction
  this change exists to remove.
- **Reject the whole file on the first unmatched/duplicate plot, same as before** —
  rejected: the owner's own framing ("just trim it," "rest is automatically extracted") is
  explicitly a tolerant, keep-going philosophy, not a data-integrity-first one; skipping and
  reporting matches how `bulk_set_initial_plot_data` itself already treats an unknown
  `svg_id` (a `skipped` entry, not a thrown error), so this just extends the same posture
  one layer earlier, at parse time.

## Blast radius

Small. Confined to `lib/colony/parseBulkImportFile.ts` and
`features/bulk-import/BulkImportScreen.tsx` — no migration, no RPC, no schema change. The
write path this feeds (`bulk_set_initial_plot_data`) is unchanged and still only ever
touches a plot still inside its sentinel eligibility window (D-023), so a bad match at parse
time is a skip, not a write.
