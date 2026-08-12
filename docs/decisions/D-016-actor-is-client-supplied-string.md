# D-016 — Actor identity is a client-supplied free-text string until M8

**Status:** provisional — superseded by real auth at M8

## Decision

`applyPlotTransition()` takes `actor: string` — whatever the person using the device
typed into a one-time "who's using this device?" prompt, persisted to `localStorage` on
that device (the prompt/localStorage UI itself is a Tier 2 follow-up, not built as part
of M4's Tier 1 core — see `docs/plans/02.md` §4). No fixed roster, no lookup, no
validation beyond what the UI layer chooses to do (non-empty, trimmed).

## Reasoning

M4 needs to ship before M8 (auth) does — the family needs write access before a magic-link
flow is built and tested. There is no server session to pull a user id from in the
meantime, so any attribution before M8 is necessarily a claim, not a verified identity.
The M2 import already established this precedent with a hardcoded `updated_by: 'import'`
literal; D-016 generalizes it to "a string the human typed," which is the smallest thing
that gets a real name onto `plot_history` instead of a placeholder.

This is explicitly a stopgap. `spec/08-map-auth.md` already states the target end-state:
"Every write carries the authenticated user id from the session, server-side. Never from a
client-supplied field — that is the difference between attribution and a claim." D-016
accepts being on the wrong side of that line for the window between M4 and M8, because the
alternative — no writes at all until M8 — blocks the family from using the app for its one
job.

## Rejected alternatives

- **A fixed roster/dropdown of real names** — would need the family's actual 5-6 names,
  which aren't in this repo yet (D-012/D-013's real vocabulary is still unconfirmed
  against their PDF). A free-text field works today without that dependency, and a
  dropdown adds nothing a text field doesn't already give five trusted family members.
- **Defer all writes until M8 ships** — rejected; the family needs status writes before
  auth is scheduled, and a stopgap with a visible name beats no writes at all.

## Blast radius

Low to reverse. `actor` is already an opaque string at every layer (`plots.updated_by`,
`plot_history.changed_by` are both `text`, not a foreign key) — M8 swapping the source of
that string from a `localStorage` value to a server-derived session id changes nothing
about the schema or `applyPlotTransition()`'s signature.
