# Applies apps/map/supabase/migrations to a target database and exits. Build context is the repo root.
FROM postgres:15-alpine
RUN apk add --no-cache bash
COPY apps/map/supabase/migrations /migrations
COPY deploy/selfhost/docker/migrate.sh /usr/local/bin/migrate.sh
RUN chmod +x /usr/local/bin/migrate.sh
ENTRYPOINT ["/usr/local/bin/migrate.sh"]
