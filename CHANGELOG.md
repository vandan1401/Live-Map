# Changelog

Versions follow semver (`vMAJOR.MINOR.PATCH`). A tag is what a private instance installs, and
only after the same change has run on the SaaS for a few days. Migrations are forward-only
(see CONTRIBUTING.md); a release notes any migration it carries.

## Unreleased

- Admin portal requires a super-admin login, audits every action (`admin_audit_log`), and can
  reset passwords and deactivate or delete members (docs/plans/36.md).
  **Migration:** `20261008000000_admin_audit_log.sql`. After applying it to a project, run
  `pnpm grant-super-admin <username>` there or the portal refuses every sign-in.
- Runtime `/config.js` lets one app build serve any deployment (docs/plans/37.md).
- Self-hosting stack under `deploy/selfhost/` and the tag-driven image release workflow.
