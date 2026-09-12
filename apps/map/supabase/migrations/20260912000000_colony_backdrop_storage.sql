-- Colony backdrop, uploadable (PROGRESS.md Backlog item 6, docs/plans/29.md). Replaces the
-- Vite-static-import + checked-in-JSON backdrop mechanism (docs/plans/28.md, D-036) with a
-- Supabase Storage raster plus these columns as its alignment metadata — both writable via
-- the admin portal, no redeploy required for either.

-- ---------------------------------------------------------------------------
-- colony-backdrops bucket — public so an anonymous public-link visitor's browser can load
-- the raster directly (Supabase serves a public bucket's objects via its own CDN-style
-- endpoint, bypassing RLS entirely for GET). Writes go through the admin-portal's
-- service-role client, which bypasses Storage RLS too — no storage.objects policy is added
-- here, it would be dead code (docs/plans/29.md §3).
-- ---------------------------------------------------------------------------

insert into storage.buckets (id, name, public)
  values ('colony-backdrops', 'colony-backdrops', true)
  on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- colonies.backdrop_* — one row's worth of alignment metadata per colony, denormalized onto
-- colonies exactly like public_token (M17) so the existing org-scoped, select-only RLS
-- (D-030) covers reads for free and every existing colony-row fetch (fetchColonyById/
-- fetchVerifiedColonies/fetchColoniesByOrg, all `select("*")`) picks these up with no new
-- query. backdrop_storage_path/backdrop_image_width/backdrop_image_height stay nullable —
-- null is "no backdrop uploaded yet", the state of every colony today. Every other column
-- gets a real default so a first image upload (which only ever sets the three image
-- columns — see lib/colony/colonyBackdrop.ts) lands on a fully-valid, disabled-by-default
-- row with no null-handling needed downstream.
-- ---------------------------------------------------------------------------

alter table colonies
  add column backdrop_storage_path text,
  add column backdrop_image_width integer,
  add column backdrop_image_height integer,
  add column backdrop_transform_x double precision not null default 0,
  add column backdrop_transform_y double precision not null default 0,
  add column backdrop_transform_scale double precision not null default 1,
  add column backdrop_transform_rotate_deg double precision not null default 0,
  add column backdrop_darken_alpha double precision not null default 0,
  add column backdrop_enabled_on_admin boolean not null default false,
  add column backdrop_enabled_on_public boolean not null default false,
  add column backdrop_attribution text not null default '';

comment on column colonies.backdrop_storage_path is
  'docs/plans/29.md: object path inside the colony-backdrops Storage bucket, e.g.
"<colony_id>.jpg". Null = no backdrop uploaded yet. Never a client-writable column — set
only by lib/colony/colonyBackdrop.ts''s uploadColonyBackdropImage, called from the admin
portal, service-role only.';
