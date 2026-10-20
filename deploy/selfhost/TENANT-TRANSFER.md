# Moving one organisation from Supabase cloud to this box

Scripts: `apps/map/scripts/tenant-export.ts` and `tenant-import.ts` (`docs/plans/38.md`). They move
**one organisation** (its colonies, plots, `plot_history`, member accounts with their password
hashes, and backdrop images). Every other organisation stays on the cloud. Nothing here writes to or
deletes from the cloud; removing the cloud copy afterwards is a separate decision.

The export folder holds owner names, phone numbers and password hashes. It must live **outside the
repository** (the script refuses otherwise). Delete it once the cutover is signed off.

## Before you start

1. In the cloud SQL Editor: `select id, name from organizations;` and note the target org's id.
2. Fill in `apps/map/.env.tenant-source` (cloud) and `apps/map/.env.tenant-target` (box). Both are
   git-ignored. For the cloud you need the database password in `DATABASE_URL`, the project URL and
   service-role key, and `DATABASE_CA_FILE`: the path of the CA certificate Supabase offers under
   Project Settings, Database, SSL. A remote database is refused without it.
3. Freeze edits for that org on the cloud (tell the family to stop editing).

## 1. Export (read-only)

```
cd apps/map
pnpm tenant:export --org <org-uuid> --source-env .env.tenant-source --out "<folder outside repo>" --verify-source
```

`--verify-source` re-reads the source before writing the manifest and refuses if any exported
content changed since the snapshot (row counts **and** content hashes). If it refuses, nothing is
importable: redo the export after the freeze is real.

## 2. Reach the box's database (it is not published)

```
ssh <user>@naksha-server "docker inspect -f '{{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}' supabase-db"
ssh -N -L 15432:<that ip>:5432 <user>@naksha-server
```

Leave the second command running. In `.env.tenant-target`: `DATABASE_URL=postgresql://supabase_admin:<POSTGRES_PASSWORD from the box .env>@127.0.0.1:15432/postgres`,
`VITE_SUPABASE_URL=https://<API host>` and the box's service-role key. Never publish port 5432.

## 3. Dry run, then the real import

```
pnpm tenant:import --in "<folder>" --target-env .env.tenant-target --dry-run
pnpm tenant:import --in "<folder>" --target-env .env.tenant-target
```

The import is one transaction and refuses a target that already holds any of the org's rows, users,
or a colony id / public link already used by another org. It compares per-table and per-colony counts
before committing and rolls everything back on any difference. A re-run after success is refused.

## 4. Check, then switch

Log in as a member at the box's app URL, open a colony, confirm a plot's history. The old public
links keep the same token; redirecting the old host to the new one is a separate cutover step.

## Not carried over

Sessions, refresh tokens and one-time tokens (confirmation, recovery, email change). Members log in
again with the same password. `admin_audit_log` stays where it was written.
