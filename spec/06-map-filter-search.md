# M6 — Legend filter, search, share summary

**Tier 2.**

## Goal

The three things the family will use every day beyond looking at the map.

## Build

- **Legend as filter.** Tapping "Available" dims everything else to 20% opacity. This is
  the most-used control in tools like this, because the daily question is "what is left to
  sell". Multi-select, with a clear-all.
- **Search** by plot number, owner name, and broker name. The whole colony is a few
  hundred rows held in memory, so this is instant and needs no server round trip. A hit
  pans the map to the plot and opens its sheet.
- **Share summary.** Generates a clean text block — counts by status, plus recent changes
  — for pasting into their WhatsApp group. Do not fight the existing habit; they will use
  this for months and then stop needing it. Removing the option early creates friction
  that pushes them back to the PDF.
- Zoom-dependent detail: hide tree canopies and plot labels below a zoom threshold. Looks
  better and measurably improves pan performance on older phones.

## Acceptance criteria

| # | Criterion | Command |
|---|---|---|
| 1 | Filtering by each status dims the correct plots | Manual, all three statuses |
| 2 | Search finds a plot by number, owner, and broker | Unit tests on the search function |
| 3 | Share output pastes into WhatsApp legibly | Manual paste test on a phone |
| 4 | Labels and trees hide below the zoom threshold | Manual |
| 5 | Full gate passes | `make gate` |
