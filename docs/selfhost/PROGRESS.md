# Self-hosted private instance — progress

Brief: `C:\Users\moont\Downloads\prompt (1).md` (Parts A–F). Audit: `/AUDIT.md`.
Kept apart from the root `PROGRESS.md` (427 KB, different format).

## Status
- Part B (audit): done 2026-10-08, awaiting answers to the Part C questions below.
- Part A (Ubuntu USB): template drafted (`docs/selfhost/usb/autoinstall.yaml.template`), blocked on the info below.
- Part C (2026-10-08): working in a git worktree, `../Colony Viewer selfhost`, branch `selfhost/private-instance`, from commit 57a93a6. The main working tree's uncommitted changes are untouched. Defaults chosen by user: `workerd` for link previews, skip cloud schema diff, `app_metadata.role = 'super_admin'`.
  - C1 done: `supabase db reset` (local) applied all 18 migrations; tables, 5 functions, `plots` in the `supabase_realtime` publication, and the public `colony-backdrops` bucket all present. `CONTRIBUTING.md` written. Local CLI is 2.120.0 via `npx -y supabase@2.120.0`.
  - C2–C6: code is committed on the worktree branch (plans 36, 37; commits 4610f28, 0c93f16, 84ac512, 9d2cc39): runtime `/config.js`, hardened admin portal + audit log, `deploy/selfhost/` stack, release workflow. NOT yet exercised: Dockerfiles never built, stack never started (see `deploy/selfhost/README.md`). Link-preview service (workerd) not built. Found 2026-10-19; this line was stale before.
- Parts D–F: not started.

## Information still to be known
Do not write secrets (Wi-Fi password, Tailscale key) in this file or in git.

| # | Needed | Why | Status |
|---|---|---|---|
| 1 | Mini PC brand + model | Confirm it has a Wi-Fi card | HP ProDesk 400 G2 Desktop Mini (2026-10-17). Wi-Fi card is an optional fit on this model: unconfirmed whether this unit has one |
| 2 | Home Wi-Fi name(s), 2.4 / 5 GHz | Goes in `autoinstall.yaml` netplan | `main-wifi` (changed from `Ikshu_5G` 2026-10-19; band not stated, so the 5 GHz-only assumption may no longer apply) |
| 3 | Home Wi-Fi password | Typed by user into the USB copy only | received in chat 2026-10-17; USB copy only, never in git |
| 4 | USB keyboard available? | BIOS "Restore on AC power loss" + boot menu | unknown, user to look |
| 5 | Mini PC video port; TV used as monitor | Watch the install | TV yes, port unknown |
| 6 | Tailscale auth key | Generate right before the install (7-day expiry) | not yet |
| 7 | Client domain, and whether it can go on Cloudflare DNS | Cloudflare Tunnel hostnames (Part D) | later, before Part D |
| 8 | GitHub account/org for GHCR images | Release pipeline (C6) | not asked answered |
| 9 | Client slug, for hostnames | Subdomain naming | pending |
| 10 | Mini PC RAM | Known only as "decent", SSD is 256 GB | confirm with `free -h` after install |

## Part C decisions needed
1. OG-preview service in self-host: `workerd` container or Node port?
2. Read-only schema diff against the production cloud project, or skip?
3. Super-admin marker `app_metadata.role = 'super_admin'` on the user's account only?
4. Commit or stash the uncommitted working-tree changes before branching?
5. Update `CLAUDE.md` invariant 8 (auth has shipped)?

## Decisions made
- Home router over Wi-Fi for the install (no LAN cable at home). Client's office will use ethernet.
- TV is the monitor, for watching the install and for the BIOS setting.
- Naksha.work is only a landing page and is unrelated to this app. The client's own domain is used, to be decided.

## Still needs a screen once
BIOS: "Restore on AC power loss" → Power On. Must be done before go-live. Planned at home with the TV + keyboard.

## Part A status (2026-10-17)
- ISO `ubuntu-24.04.5-live-server-amd64.iso` in `../naksha-server-setup`, SHA256 verified against Ubuntu's list.
- USB (`D:`, 29 GB, FAT32, label NAKSHA_USB) written without Rufus: ISO contents copied, `autoinstall` added to both `linux` lines in `boot/grub/grub.cfg`, filled `autoinstall.yaml` at the root (Wi-Fi + password hash; never in git).
- No Tailscale key in this copy: the `tailscale up` line was dropped. Tailscale is installed on first boot; join by hand with `sudo tailscale up --ssh --hostname=naksha-server`.
- Next: boot the HP ProDesk 400 G2 DM from the USB with monitor + keyboard; check Wi-Fi adapter; BIOS After Power Loss -> Power On.

## Part A done (2026-10-19)
- Installed from USB after two fixes: the netplan Wi-Fi block must be keyed by interface name (`wlp1s0`), not a `wl*` match (networkd rejects it), and the password hash on the USB did not match the brief's, so a new temporary password was generated (then changed by the user).
- Hardware: Core i5-6500T, 4 CPUs, 15 GiB RAM, 238.5 GB SSD (`sda`), Intel Wireless 7265 (`wlp1s0`, dual-band). Closes info items 1 and 10.
- Wi-Fi `main-wifi`, LAN IP 192.168.29.203 (DHCP, may change). Tailscale joined as `naksha-server`, 100.112.101.90, `--ssh` on.
- SSH from the laptop uses key `~/.ssh/naksha_ed25519` (installed on the server). The user's account password is weak: change it with `passwd`.
- BIOS: `After Power Loss` set to Power On (2026-10-19).
- Not yet: USB `autoinstall.yaml` still holds the Wi-Fi password: wipe or delete it from the USB.

## Stack first run on the mini PC (2026-10-20)
- Docker 29.9.1 installed from Docker's apt repo, enabled on boot. Source shipped with `git archive` to `~/naksha-src`; app/admin/migrator images built ON the box as `ghcr.io/local/naksha-*:test` (no GHCR yet). Test `.env` generated there with placeholder hosts `app.test.local` / `api.test.local`; data in `/srv/naksha`. Stack is RUNNING there (project `naksha`, no cloudflared).
- Verified: 11 containers healthy; migrator applied 19/19 migrations; app 200; admin 200; Kong 401 without key; signup refused (422 signup_disabled); anon read of `plots` returns [] (RLS); service-role key and JWT secret absent from the app image files; Realtime websocket upgrade 101 through Kong; only 127.0.0.1 ports 3001/8000/8080 published besides SSH/Tailscale.
- BUG FOUND AND FIXED (uncommitted in the worktree): `deploy/selfhost/docker/app-entrypoint.sh` had a malformed `sed` escape, so `/config.js` came out with EMPTY supabaseUrl/key. Fixed, plus a guard that aborts the container if the URL is empty. Re-verified live.
- Local laptop test failed for environmental reasons (Postgres on a Windows bind mount; Docker Desktop out of memory), not stack faults.
- Super-admin (2026-10-20): created on the box with the same auth-admin API call the scripts make (not via `pnpm create-user`): org `Test Org`, user `vandan` (role `super_admin`, org linked). Portal checks on 127.0.0.1:3001: no token -> 401, wrong password -> 401, right password -> 200 with token; audit log has `login|denied` and `login|ok`. Test password is throwaway (not stored here). Note: the migrations also seed an org named `Original organisation (rename me)`.
- Backup/restore test (2026-10-20, on the box, throwaway data): backup.sh OK (db 352K + storage tar, both verified readable). The ORIGINAL restore.sh (pg_restore --clean over the live db) FAILED three ways: realtime schema index drop, `--no-owner` left auth/storage tables owned by supabase_admin so auth/storage crash-looped, and restoring over Supabase's extension objects failed (graphql grants). REWRITTEN (uncommitted, worktree): restore builds a fresh stack (init scripts + migrator), moves old db/storage dirs aside, then loads DATA ONLY of public/auth/storage (`--data-only --disable-triggers`, truncate first, migration bookkeeping tables skipped), then extracts storage files; needs root and the SAME .env. Result: all 10 services healthy, marker org and marker file back, user `vandan` still logs into the portal with the old password. Not yet tried: restoring onto a SECOND machine, or a dump taken after real colony data exists; plot_history append-only trigger behaviour under restore was not specifically checked.
- Domain (2026-10-20): user owns `naksha.work`, registered at Namecheap (DNS at registrar-servers.com, NOT Cloudflare). Plan: `nimantran.naksha.work` (app) and `nimantran-api.naksha.work` (API). Cloudflare Tunnel needs the zone on Cloudflare DNS: move nameservers to Cloudflare AFTER copying every existing record of the landing page, or the page breaks. Not done.
- Cloudflare (2026-10-20): `naksha.work` added to the user's Cloudflare account (Free plan), nameservers assigned `kyree.ns.cloudflare.com` + `laylah.ns.cloudflare.com`. Imported 9 records, ALL set to DNS only: A naksha.work 216.198.79.1, CNAME www -> cname.vercel-dns.com, CNAME start -> custom-domains.* (unknown purpose, Vercel?), 5x MX eforward1-5.registrar-servers.com (Namecheap email forwarding), TXT SPF. NAMESERVERS AT NAMECHEAP CHANGED 2026-10-20 (done in the browser at the user's explicit request): Custom DNS = kyree/laylah.ns.cloudflare.com; Namecheap says up to 48h. Right after the change 8.8.8.8 still returned the old registrar-servers NS; site (naksha.work 308 -> www 200) and 5 MX records unchanged. TODO: confirm Cloudflare shows the zone Active, re-test the site and a forwarded email. Also turn DNSSEC off at Namecheap first if on. After activation: create the tunnel + DNS routes for nimantran / nimantran-api.
- NOT yet verified: Cloudflare tunnel + real hostnames, tailscale serve for 3001/8000, login through the app itself, realtime between two phones, backup/restore, update.sh, power-cut, link-preview service.

## IMPORTANT before moving the box to the client's office
- Prefer an Ethernet cable at the office: no password, DHCP block already in the netplan (`enp2s0`, optional). Tailscale should rejoin by itself (same 100.112.101.90). Not yet tested on Ethernet.
- If the office has no cable: get the office Wi-Fi name and password and add it to `/etc/netplan` on the box over SSH BEFORE it leaves the home (nobody can reach it to add it afterwards). Keep the password out of git.
- Check the office router does not block unknown devices (MAC filtering). If it does, the office IT person must allow the box's MAC.
- Test once at home: unplug power and plug it back to confirm it starts by itself and rejoins Tailscale.

## Next action
Part C2 (runtime `/config.js`), then Docker/compose on the box over Tailscale.
