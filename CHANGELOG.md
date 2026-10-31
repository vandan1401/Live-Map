# Changelog

Versions follow semver (`vMAJOR.MINOR.PATCH`). A tag is what a private instance installs, and
only after the same change has run on the SaaS for a few days. Migrations are forward-only
(see CONTRIBUTING.md); a release notes any migration it carries.

## Unreleased

- (nothing yet)

## v1.0.3 — 2026-10-31

- **The buyer survives Registry done and Sold to investors** (docs/plans/41.md, D-054). The plot detail
  sheet shows the Owner on every status except Available, and search finds a plot by its owner on the
  same rule. A custom status such as Sold to investors now moves directly to and from Booked and
  Registry done (not only via Available), without asking for a buyer name, so the owner the plot was
  booked for stays. Known cost: a booking that was cancelled can show its old owner again if the plot is
  then marked Sold to investors (the name is never cleared, D-018).
  **No migration.** Safe to auto-apply.
- **Fix:** `scripts/update.sh`'s health check probed `/rest/v1/`, which newer PostgREST refuses for the anon
  key (403), so every update aborted at pre-flight on a healthy stack. It now probes
  `/rest/v1/plots?limit=0`. The `deploy/selfhost/scripts/*.sh` files are stored executable in git.

## v1.0.2 — 2026-10-28

- **Per-colony plot statuses** (docs/plans/40.md, D-053). A colony can declare its own status list in
  `colony.json` (`statuses`: key, label, colour; up to 8; must include `available`), e.g. "Sold to
  investors". Absent = the built-in Available / Booked / Registry done, unchanged. The pipeline carries
  it through from `tools/pipeline/colonies/<id>.json`. Re-uploading a colony whose new list drops a
  status some plot still holds is refused.
  **Migration:** `20261027000000_colony_statuses.sql` (adds `colonies.statuses`; replaces the closed
  status CHECK with a format check plus a per-colony membership guard; adds a `p_statuses` argument to
  `create_colony_from_manifest`, dropping the old overload). **Apply it BEFORE deploying the app** —
  the new app sends the argument and reads the column; the old app keeps working on the new schema.
  After applying, reload PostgREST's schema cache and make one live RPC call (D-033).
  **Also:** do not upload a `colony.json` that has a `statuses` block until every device has reloaded onto
  the new app — a still-open old bundle throws when someone taps a plot in a custom status.

## v1.0.1 — 2026-10-27

The first tagged release. Before it, the mini PC ("the box") was built from commits by hand
(docs/selfhost/PROGRESS.md), so which version it runs is recorded only in `RELEASE_VERSION`
in the box's own `deploy/selfhost/.env` and in its `logs/update.log`.

- **Fix:** colonies with more than 1000 plots lost the status of every plot past the first
  1000 (PostgREST's `max_rows` cap), so those plots drew in bare plot-base colour beside
  tinted neighbours. `fetchPlotStatuses`, `fetchPlotsByColony` and `fetchCornerPlotIds` now
  page through the result. Also corrects search, the plot table, share-summary counts and
  bulk import for such colonies. No migration.
- Self-service "Change password" for signed-in members (docs/plans/39.md).
- Tenant export/import to move one organisation between Supabase deployments
  (docs/plans/38.md).
- Admin portal requires a super-admin login, audits every action (`admin_audit_log`), and can
  reset passwords and deactivate or delete members (docs/plans/36.md).
  **Migration:** `20261008000000_admin_audit_log.sql`. After applying it to a project, run
  `pnpm grant-super-admin <username>` there or the portal refuses every sign-in.
- Runtime `/config.js` lets one app build serve any deployment (docs/plans/37.md).
- Self-hosting stack under `deploy/selfhost/` and the tag-driven image release workflow.
