# Private (self-hosted) instance: install and operations runbook

One client, one mini PC, only their data. Same code as the SaaS; only configuration differs.

**Status:** written, not yet exercised on a real server. Everything here is checked for syntax
(`docker compose config`, `bash -n`) but the Dockerfiles have not been built and the stack has
not been started. Part D/E/F of the rollout (see `docs/selfhost/PROGRESS.md`) is what proves it.
Parts that are unproven say so.

## What runs where

| Piece | Reachable from | How |
|---|---|---|
| Web app (`app`, nginx) | Internet | Cloudflare Tunnel, `<APP_HOST>` |
| Supabase API (`api-gw`/Kong: `/auth/v1 /rest/v1 /realtime/v1 /storage/v1`) | Internet, those four paths only | Cloudflare Tunnel, `<API_HOST>` |
| Super-admin portal (`admin`, port 3001) | Tailnet only | host loopback + `tailscale serve` |
| Studio (dashboard through Kong, port 8000) | Tailnet only | host loopback + `tailscale serve`, basic-auth |
| Postgres, postgres-meta, Realtime, Storage, Auth, PostgREST | Docker network only | nothing published |
| SSH | Tailnet only | Tailscale SSH |

Every published port is bound to `127.0.0.1`. There is no port forwarding and no static IP.
The tunnel is an outbound connection; nothing connects in from the internet except through it.

Link previews (WhatsApp unfurl of a shared colony link) are produced on the SaaS by a
Cloudflare Worker. **The self-hosted equivalent is not built yet** (needs the Worker work
committed and reviewed first); until then a shared link works but shows no rich preview.

## Files

```
docker-compose.yml, docker-compose.kong.yml, docker-compose.pg15.yml   official Supabase, unmodified (UPSTREAM.md)
docker-compose.selfhost.yml     our layer: loopback ports, disabled services, app, admin, migrator, cloudflared
.env.example                    every setting; gen-secrets.sh writes the real .env
volumes/                        vendored official init scripts and Kong config
docker/                         Dockerfiles (app, admin, migrator), nginx.conf, entrypoints
cloudflared/config.yml.example  the tunnel's ingress (the whole public surface)
scripts/                        gen-secrets, install, update, backup, restore
```

## Install

Prerequisites: Ubuntu Server 24.04 on the mini PC, reachable over Tailscale (`ssh naksha-server`),
a Cloudflare account that manages the client's domain, an external drive for backups, a
GitHub read-only token for the images (below).

### 1. Docker
Install Docker Engine and the compose plugin from Docker's official apt repository
(docs.docker.com/engine/install/ubuntu), then `sudo systemctl enable --now docker`. The
install script does the enable step again; Docker starts on boot, and every container has
`restart: unless-stopped`, so everything returns by itself after a power cut.

### 2. Get this directory onto the server (no source code)
The server needs only `deploy/selfhost/`, not the repository. Copy it with `scp -r` from a
checkout at the release tag, to `/opt/naksha`. Images come from ghcr.io; the server never
holds source or GitHub write credentials.

### 3. Read-only registry token
GitHub → Settings → Developer settings → Personal access tokens: a token with **only**
`read:packages`. `install.sh` asks for it and stores it in Docker's credential file.

### 4. Cloudflare Tunnel
```
cloudflared tunnel login
cloudflared tunnel create naksha-<client>
cloudflared tunnel route dns naksha-<client> <APP_HOST>
cloudflared tunnel route dns naksha-<client> <API_HOST>
```
Copy `cloudflared/config.yml.example` to `cloudflared/config.yml`, fill in the tunnel id and
hostnames, and put the `<TUNNEL_ID>.json` credentials beside it. Both hostnames must be
**single-level** subdomains (`client.example.com`, `client-api.example.com`): Cloudflare's free
certificate does not cover `api.client.example.com`.

### 5. Run the installer
```
cd /opt/naksha && sudo scripts/install.sh \
  --app-host <APP_HOST> --api-host <API_HOST> --ghcr-owner <github-owner> --version v1.0.0
```
This generates a **fresh** `.env` (never Supabase's sample secrets), creates
`/srv/naksha/db` and `/srv/naksha/storage` on the SSD, pulls the images, starts the stack,
and installs the 02:00 backup cron job. The migrator runs automatically on `up`.
Read the generated Studio password with `sudo grep DASHBOARD_PASSWORD .env`; never paste it
into chat or a ticket.

### 6. Tailscale access to the admin portal and Studio
```
sudo tailscale serve --bg --tcp 3001 tcp://127.0.0.1:3001     # super-admin portal
sudo tailscale serve --bg --tcp 8000 tcp://127.0.0.1:8000     # Studio (Kong) - basic-auth
```
Then from a tailnet device: `http://naksha-server:3001` (portal), `http://naksha-server:8000`
(Studio). *These two commands are unverified against your Tailscale version; check
`tailscale serve --help` and the Tailscale ACL (only your devices may reach this machine).*

### 7. First super admin
The portal refuses everyone until a user holds the role, and creating the very first user
needs the repo's scripts (`pnpm create-user <username> <password> "<Name>" <org_id>`, then
`pnpm grant-super-admin <username>`) run from a checkout on **your laptop**, pointed at the
instance over the tailnet: `SUPABASE_URL=http://naksha-server:8000`, plus the instance's
`SERVICE_ROLE_KEY` (read it on the server; never paste it into chat). The organisation row must
exist first (Studio → SQL, or `pnpm import:seed`). The role is granted only by
`grant-super-admin`; no portal route can grant it. *The exact first-run sequence is untested.*

## Daily operation

- **Update** (manual, over Tailscale): `sudo scripts/update.sh v1.1.0`. Order: pre-flight →
  backup (aborts if it fails) → pull → migrate → restart → health check → on failure, containers
  roll back to the previous tag. It logs to `logs/update.log`. There is no auto-update.
- **Backups:** `scripts/backup.sh` nightly at 02:00 to `BACKUP_DIR` (the external drive, which
  must be mounted or the job refuses). Keeps 14 daily and 8 weekly sets (settable in `.env`).
  Each set is `db.dump` (pg_dump custom format) + `storage.tar.gz`.
- **Logs:** `docker compose logs -f <service>`; `logs/*.log` for updates and backups.
- **Status:** `docker compose ps`.

## A migration broke something

Rolling the containers back does **not** undo migrations. Migrations are forward-only and
transactional per file, so a failed one leaves the database at the last good migration. If a
bad migration did apply and the data is wrong:

1. Stop the app containers: `docker compose stop app admin cloudflared`.
2. Restore the backup `update.sh` printed (it is the newest set under `BACKUP_DIR/daily`):
   `scripts/restore.sh /mnt/naksha-backup/daily/<timestamp>`.
3. Pin the previous version in `.env` (`RELEASE_VERSION=`) and `docker compose up -d`.

`restore.sh` is **not yet proven on a second machine**; the Part F backup-restore test does that.

## Hardening checklist (verified in Part F)

- [ ] `nmap`/`curl` from outside: only the two Cloudflare hostnames answer; `<API_HOST>/` and
      `<API_HOST>/pg/…` return 404; Studio, portal and Postgres are unreachable.
- [ ] Public signup is off (`DISABLE_SIGNUP=true`).
- [ ] The service-role key is in no browser bundle (the app image has no access to it).
- [ ] After a power cut everything returns without help (needs the BIOS "After Power Loss"
      setting).
- [ ] The tunnel and Tailscale reconnect on their own after an internet drop.
