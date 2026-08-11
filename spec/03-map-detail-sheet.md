# M3 — Plot detail bottom sheet

**Tier 2.** Read-only.

## Goal

Tapping a plot springs a bottom sheet over the lower ~40% of the screen with the map still
visible above it, draggable to full height. Shows every field from D-012, plus the
attribution line — "Booked — updated by Vikas, 2:40pm today" — which is the single line
that resolves most of the confusion the PDF causes today.

## Build

- Framer Motion for the sheet physics. Drag to expand, drag down to dismiss, tap the map
  to dismiss.
- Selected plot gets `.is-selected` — stroke and slight scale, never a fill change, since
  fill carries status.
- Money renders from paise. Formatting is the only place rupees exist.
- `plot_history` renders inside the sheet as a compact list, newest first.
- Sheet is read-only. Every field is display; there is no Save button until M4.

## Acceptance criteria

| # | Criterion | Command |
|---|---|---|
| 1 | Sheet opens on tap and shows the correct plot's data | Manual, three different plots |
| 2 | Money displays correctly from paise, no floating-point artifacts | Unit test on the formatter |
| 3 | Attribution line shows the right user and a relative time | Manual against seed data |
| 4 | Map remains visible and interactive above the sheet | Manual on an iPhone |
| 5 | Full gate passes | `make gate` |

## Non-goals

Editing, status changes, realtime. All M4 and M5.
