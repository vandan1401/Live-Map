# Vendored from the official Supabase self-hosting stack

Source: https://github.com/supabase/supabase/tree/master/docker
Commit: `8c10701cb518586a6df30f5a12900eef77e03398` (2026-10-09)

These files are copied **unmodified** so a future upstream update is a plain diff:

- `docker-compose.yml`, `docker-compose.kong.yml` (Kong instead of the default Envoy gateway),
  `docker-compose.pg15.yml` (Postgres 15: the major version this project's migrations are
  tested against locally)
- `volumes/api/kong.yml`, `volumes/api/kong-entrypoint.sh`, `volumes/db/*.sql`

Everything specific to us lives in `docker-compose.selfhost.yml`, `.env.example` and
`scripts/`. Never edit a vendored file; override it in `docker-compose.selfhost.yml`.
To update: re-download the same paths from upstream, `diff`, re-run `docker compose config`,
and test on a spare machine before releasing.
