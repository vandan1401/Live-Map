---
name: review-non-ts-call-sites
description: Recurring defect — "TypeScript caught every call site" is only true for TypeScript call sites; the Makefile, package.json scripts, hooks and docs invoke the same CLIs and are invisible to tsc.
metadata:
  type: feedback
---

When a diff makes a CLI argument or function parameter **required**, do not accept
"TypeScript caught every affected call site" as coverage. `tsc` sees `.ts`/`.tsx` only.

**Why:** 2026-08-31 (plan 21/M16) added a required 4th arg to `scripts/create-user.ts` and a
required 3rd positional arg to `scripts/import-seed.ts`, updated ~14 TS files, and stated
"TypeScript caught every affected call site" — but `Makefile`'s `db-reseed` target still runs
`pnpm import:seed` and `pnpm create-user demo demo-pass-123 "Demo User"` with no org id. That
target is the documented recovery command for leaked scratch rows, it wipes the DB in its
first line, and it now fails on lines 2 and 3, leaving the developer with an empty database.
The session had already hit this and worked around it by hand instead of fixing the target.

**How to apply:** for any signature/CLI-contract change, grep outside the type system —
`Makefile`, `package.json` scripts, `.claude/hooks/*.sh`, `.claude/settings.local.json`,
`docs/**`, `README` — for the command name, not just the function name. Related:
[[review-optimistic-defaults]] (the inverse failure: adding a default to silence the same
sweep), [[review-docs-vs-enforcement-drift]].
