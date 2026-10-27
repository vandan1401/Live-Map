# Changelog

Versions follow semver (`vMAJOR.MINOR.PATCH`). A tag is what a private instance installs, and
only after the same change has run on the SaaS for a few days. Migrations are forward-only
(see CONTRIBUTING.md); a release notes any migration it carries.

## Unreleased

- (nothing yet)

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
