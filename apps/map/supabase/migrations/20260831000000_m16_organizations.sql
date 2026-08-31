-- M16 — organizations: multi-tenant data model, phase 1 of 3 (docs/plans/21.md).
-- Adds org-scoped isolation on top of M8's authenticated-only RLS
-- (20260815020000_m8_auth_rls_lockdown.sql). Existing colonies/plots/plot_history/
-- accounts are backfilled into one org ("org #1") in this same migration — there is
-- exactly one tenant today. Phase 2 (a public per-colony read-only link) and phase 3
-- (an admin portal for creating orgs/adding people) are separate, later plans.

-- ---------------------------------------------------------------------------
-- organizations
-- ---------------------------------------------------------------------------

create table organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz not null default now()
);

alter table organizations enable row level security;

create policy "organizations_authenticated_select" on organizations
  for select using (
    auth.role() = 'authenticated'
    and id = nullif(auth.jwt() -> 'app_metadata' ->> 'org_id', '')::uuid
  );

comment on policy "organizations_authenticated_select" on organizations is
  'docs/plans/21.md phase 1: a user may read only their own organization row. No client
role has insert/update/delete on this table in this phase — creating an org is phase 3''s
admin-portal job, done via service_role only, the same class of gap scripts/create-user.ts
already fills for user accounts.';

grant select on organizations to anon, authenticated;

-- ---------------------------------------------------------------------------
-- org_id — added to every tenant-scoped table, backfilled, then locked not null.
-- Denormalized on all three (not just colonies, joined from there) so RLS on plots/
-- plot_history stays a flat column comparison, no join (docs/plans/21.md §2.A.2 —
-- matches this project's real scale, ≤20 orgs, 5-10 concurrent viewers).
-- ---------------------------------------------------------------------------

alter table colonies add column org_id uuid references organizations(id);
alter table plots add column org_id uuid references organizations(id);
alter table plot_history add column org_id uuid references organizations(id);

-- One generated id, reused by reference across every statement below — never a literal
-- pasted twice, never a second gen_random_uuid() call for the "same" org (docs/plans/21.md,
-- pinned). "Original organisation (rename me)" is a deliberate, obvious placeholder — not
-- a guess at the real business name from existing account usernames/passwords, neither of
-- which is good evidence. Renaming it is a one-line update the owner runs later.
do $$
declare
  v_org_id uuid := gen_random_uuid();
begin
  insert into organizations (id, name) values (v_org_id, 'Original organisation (rename me)');

  update colonies set org_id = v_org_id;
  update plots set org_id = v_org_id;

  -- /review finding: plot_history_no_update (20260812120000_m2_schema.sql) is a row
  -- trigger that unconditionally rejects UPDATE, regardless of role or BYPASSRLS — a
  -- plain `update plot_history` here would abort this entire migration wherever
  -- plot_history already has real rows (any populated database, including production).
  -- Locally this went undetected because supabase db reset leaves plot_history empty
  -- until a separate pnpm import:seed step runs, so the trigger never actually fired.
  alter table plot_history disable trigger plot_history_no_update;
  update plot_history set org_id = v_org_id;
  alter table plot_history enable trigger plot_history_no_update;

  -- auth.users is a plain Postgres table — no Admin API needed for a bulk one-time
  -- backfill. Every existing account (the 5 real family accounts, plus any local/test
  -- artifacts already in this database) becomes a member of org #1. coalesce first
  -- (/review finding): raw_app_meta_data is nullable, and `null || jsonb` is null, not
  -- the right-hand object — any account with a null value would silently end up with no
  -- org_id claim at all, passing this migration but reading zero rows everywhere after.
  update auth.users
    set raw_app_meta_data = coalesce(raw_app_meta_data, '{}'::jsonb)
      || jsonb_build_object('org_id', v_org_id::text);
end $$;

alter table colonies alter column org_id set not null;
alter table plots alter column org_id set not null;
alter table plot_history alter column org_id set not null;

-- ---------------------------------------------------------------------------
-- RLS — add org scoping on top of M8's authenticated-only policies.
-- ---------------------------------------------------------------------------

drop policy "colonies_authenticated_select" on colonies;
drop policy "plots_authenticated_select" on plots;
drop policy "plot_history_authenticated_select" on plot_history;

create policy "colonies_authenticated_select" on colonies
  for select using (
    auth.role() = 'authenticated'
    and org_id = nullif(auth.jwt() -> 'app_metadata' ->> 'org_id', '')::uuid
  );
create policy "plots_authenticated_select" on plots
  for select using (
    auth.role() = 'authenticated'
    and org_id = nullif(auth.jwt() -> 'app_metadata' ->> 'org_id', '')::uuid
  );
create policy "plot_history_authenticated_select" on plot_history
  for select using (
    auth.role() = 'authenticated'
    and org_id = nullif(auth.jwt() -> 'app_metadata' ->> 'org_id', '')::uuid
  );

comment on policy "colonies_authenticated_select" on colonies is
  'docs/plans/21.md phase 1: adds org scoping on top of M8''s authenticated-only check.
nullif(x, '''')::uuid before the comparison, not a bare cast — an absent/blank org_id claim
must fail the equality (zero rows), never throw a cast error (spec/08 criterion 2''s "zero
rows, not a permission error" wording, extended from the anon case to this one).';
comment on policy "plots_authenticated_select" on plots is
  'docs/plans/21.md phase 1: same org-scoping addition as colonies_authenticated_select.
All writes still go through apply_plot_transition()/bulk_set_initial_plot_data() (security
definer, bypasses RLS) — those functions independently re-check org_id themselves below,
since RLS does not apply inside a security-definer function body.';
comment on policy "plot_history_authenticated_select" on plot_history is
  'docs/plans/21.md phase 1: same org-scoping addition as colonies_authenticated_select.';

-- ---------------------------------------------------------------------------
-- apply_plot_transition() — add the org-ownership re-check a security-definer function
-- needs, since its own SELECT bypasses RLS entirely. Signature is unchanged; org_id is
-- never a parameter (D-020's "server-derived, never client-supplied" shape).
-- ---------------------------------------------------------------------------

create or replace function apply_plot_transition(
  p_plot_id uuid,
  p_expected_version integer,
  p_new_status text,
  p_note text default null,
  p_owner_name text default null
)
returns plots
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_current plots;
  v_actor text;
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;

  v_actor := coalesce(auth.jwt() -> 'app_metadata' ->> 'display_name', auth.jwt() ->> 'email');

  select * into v_current from plots where id = p_plot_id for update;

  if not found then
    raise exception 'plot not found: %', p_plot_id using errcode = 'P0002';
  end if;

  -- docs/plans/21.md phase 1: this SELECT bypasses RLS (security definer) — without this
  -- check, any authenticated user from any org could transition any plot in the database
  -- just by knowing/guessing its uuid. RLS alone only protects queries issued directly
  -- through PostgREST, not what a security-definer function body does internally.
  -- IS DISTINCT FROM, not <>: a null org claim must still trigger this (a bare <> against
  -- null evaluates to null, which "if" treats as not-true and would silently let it pass).
  if v_current.org_id is distinct from nullif(auth.jwt() -> 'app_metadata' ->> 'org_id', '')::uuid then
    raise exception 'not authorized for this organization';
  end if;

  if v_current.version <> p_expected_version then
    -- Message-prefix based, not SQLSTATE based — the exact text is ours to control and
    -- parse client-side; PostgREST's SQLSTATE passthrough for custom codes isn't
    -- something to depend on.
    raise exception 'version_conflict:%', v_current.updated_by;
  end if;

  update plots
    set status = p_new_status,
        version = version + 1,
        updated_by = v_actor,
        updated_at = now(),
        -- owner_name is sticky (D-018) — never cleared, only overwritten by a fresh
        -- booking that supplies one (docs/plans/08.md).
        owner_name = coalesce(p_owner_name, owner_name)
    where id = p_plot_id
    returning * into v_current;

  -- Same function body as the update above — one Postgres transaction. If this insert
  -- fails, the update above rolls back with it.
  insert into plot_history (plot_id, org_id, status, changed_by, note)
    values (p_plot_id, v_current.org_id, p_new_status, v_actor, p_note);

  return v_current;
end;
$$;

comment on function apply_plot_transition is
  'The only path that writes plots.status (D-006, D-013, D-020, spec/04, spec/08).
TypeScript callers go through apps/map/src/lib/plot-status/applyPlotTransition.ts, never
this RPC directly. security definer on purpose: plots/plot_history carry no direct
insert/update grant for any client role (see the grants below) — this function is the
sole route, enforced at the privilege layer, not just by convention (invariant 4).
Attribution (updated_by/changed_by) is derived from auth.jwt()''s app_metadata inside the
function body, never from a client-supplied parameter or user_metadata (the latter is
self-writable by the signed-in user via PUT /auth/v1/user, which would make it just
another claim) — a forged request body has nothing to tamper. docs/plans/21.md phase 1
adds an independent org-ownership re-check, since this function''s own row lookup bypasses
RLS (security definer) — org_id is never a parameter here either, same reasoning.';

-- ---------------------------------------------------------------------------
-- bulk_set_initial_plot_data() — add the same org-ownership re-check, folded into the
-- existing lookup so a cross-org attempt falls into the existing "unknown svg_id" skip
-- path rather than a new error shape.
-- ---------------------------------------------------------------------------

create or replace function bulk_set_initial_plot_data(
  p_colony_id text,
  p_rows jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor text;
  v_org_id uuid;
  v_row record;
  v_plot plots;
  v_applied jsonb := '[]'::jsonb;
  v_skipped jsonb := '[]'::jsonb;
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;

  -- Same server-derived attribution as apply_plot_transition() (D-020) — used only for
  -- plot_history.note here, never for eligibility (see the sentinel comment below).
  v_actor := coalesce(auth.jwt() -> 'app_metadata' ->> 'display_name', auth.jwt() ->> 'email');

  -- docs/plans/21.md phase 1: an authenticated session with no org should never be able
  -- to write anything through this function.
  v_org_id := nullif(auth.jwt() -> 'app_metadata' ->> 'org_id', '')::uuid;
  if v_org_id is null then
    raise exception 'not authorized for this organization';
  end if;

  for v_row in
    select * from jsonb_to_recordset(p_rows) as x(
      svg_id text,
      status text,
      owner_name text,
      owner_phone text,
      broker_name text,
      rate_paise bigint,
      booking_amount_paise bigint,
      booking_date date,
      registry_date date,
      notes text
    )
  loop
    -- docs/plans/21.md phase 1: org_id added to this lookup — a cross-org svg_id now
    -- falls through to the existing "unknown svg_id" skip below, the same as a genuinely
    -- unknown one. This function is security definer; without the check here, org
    -- isolation on this write path would exist only in the RLS-gated colonies/plots
    -- reads, not in this RPC itself.
    select * into v_plot from plots
      where colony_id = p_colony_id and svg_id = v_row.svg_id and org_id = v_org_id
      for update;

    if not found then
      v_skipped := v_skipped || jsonb_build_object('svg_id', v_row.svg_id, 'reason', 'unknown svg_id');
      continue;
    end if;

    if v_row.status not in ('available', 'booked', 'registered') then
      v_skipped := v_skipped || jsonb_build_object('svg_id', v_row.svg_id, 'reason', 'invalid status');
      continue;
    end if;

    -- Eligibility (docs/plans/10.md §3): a plot stays open to bulk-import correction for
    -- as long as every existing plot_history row on it was written by the pipeline seed
    -- ('import') or a prior bulk-import ('bulk_import') — never after a real operational
    -- transition, which always writes the real signed-in actor's name, never one of these
    -- two literal sentinel strings.
    if exists (
      select 1 from plot_history
        where plot_id = v_plot.id and changed_by not in ('import', 'bulk_import')
    ) then
      v_skipped := v_skipped ||
        jsonb_build_object('svg_id', v_row.svg_id, 'reason', 'plot has real activity already');
      continue;
    end if;

    update plots
      set status = v_row.status,
          owner_name = v_row.owner_name,
          owner_phone = v_row.owner_phone,
          broker_name = v_row.broker_name,
          rate_paise = v_row.rate_paise,
          booking_amount_paise = v_row.booking_amount_paise,
          booking_date = v_row.booking_date,
          registry_date = v_row.registry_date,
          notes = v_row.notes,
          version = version + 1,
          -- Sentinel, not v_actor (docs/plans/10.md §3) — this is the value the
          -- eligibility check above reads back, and formatActorName() (shared/format.ts)
          -- must render it, not a raw display name.
          updated_by = 'bulk_import',
          updated_at = now()
      where id = v_plot.id;

    insert into plot_history (plot_id, org_id, status, changed_by, note)
      values (v_plot.id, v_org_id, v_row.status, 'bulk_import', 'Bulk initial import by ' || v_actor);

    v_applied := v_applied || to_jsonb(v_row.svg_id);
  end loop;

  return jsonb_build_object('applied', v_applied, 'skipped', v_skipped);
end;
$$;

comment on function bulk_set_initial_plot_data is
  'One-time initial-data write path (docs/plans/10.md) — the narrow spec/00-rules.md
exception to "no spreadsheet as the live data store". Updates existing plots rows only
(matched by colony_id + svg_id + org_id, docs/plans/21.md phase 1), never creates one.
Deliberately does not call isLegalTransition() — an initial data load is recording an
already-true fact, not performing a transition. Per-row eligibility (unknown svg_id /
cross-org svg_id / invalid status / already has real, non-sentinel history) is recorded in
the returned skipped array, never raised; only a genuinely unexpected error aborts and
rolls back the whole call.';

-- ---------------------------------------------------------------------------
-- create_colony_from_manifest() — org_id derived server-side and set on every row it
-- creates; a replace is refused if the existing colony belongs to a different org.
-- ---------------------------------------------------------------------------

-- docs/plans/20.md's select_zoom_ref migration already dropped the old 7-argument
-- signature and replaced it with this 9-argument one (p_zoom_ref_width_px/
-- p_zoom_ref_height_px trailing) — this phase's org-ownership changes must be layered
-- onto that real, current signature, not the original M15 one, or `create or replace`
-- would create a second overload instead of replacing it (ambiguous-function-name error).
create or replace function create_colony_from_manifest(
  p_colony_id text,
  p_colony_name text,
  p_source_file text,
  p_generated date,
  p_svg text,
  p_plots jsonb,
  p_replace boolean default false,
  p_zoom_ref_width_px numeric default null,
  p_zoom_ref_height_px numeric default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_exists boolean;
  v_existing_org_id uuid;
  v_missing text[];
  v_row record;
  v_plot plots;
  v_org_id uuid;
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;

  -- docs/plans/21.md phase 1: derived once, server-side, never a p_org_id parameter —
  -- the exact D-020 shape apply_plot_transition() already established for attribution.
  v_org_id := nullif(auth.jwt() -> 'app_metadata' ->> 'org_id', '')::uuid;
  if v_org_id is null then
    raise exception 'not authorized for this organization';
  end if;

  select exists(select 1 from colonies where id = p_colony_id) into v_exists;

  if v_exists and not p_replace then
    return jsonb_build_object('ok', false, 'reason', 'colony_exists');
  end if;

  if v_exists and p_replace then
    -- docs/plans/21.md phase 1: never let a replace silently succeed against another
    -- org's colony — colonies.id is a global text key, so a client could otherwise guess
    -- or already know an id belonging to a different tenant.
    select org_id into v_existing_org_id from colonies where id = p_colony_id;
    if v_existing_org_id is distinct from v_org_id then
      return jsonb_build_object('ok', false, 'reason', 'org_mismatch');
    end if;

    -- D-118's id-stability hazard, arrived at from the app side: an svg_id that exists in
    -- the DB today but is missing from the re-uploaded manifest would leave its
    -- plot_history (invariant 5) attached to a plot nothing can ever look up again by name.
    select array_agg(p.svg_id) into v_missing
      from plots p
      where p.colony_id = p_colony_id
        and not exists (
          select 1 from jsonb_to_recordset(p_plots) as x(svg_id text)
            where x.svg_id = p.svg_id
        );

    if v_missing is not null and array_length(v_missing, 1) > 0 then
      return jsonb_build_object(
        'ok', false, 'reason', 'would_orphan_history', 'missing_svg_ids', to_jsonb(v_missing)
      );
    end if;

    update colonies
      set name = p_colony_name, source_file = p_source_file, generated = p_generated,
          svg = p_svg, select_zoom_ref_width_px = p_zoom_ref_width_px,
          select_zoom_ref_height_px = p_zoom_ref_height_px
      where id = p_colony_id;
  else
    insert into colonies (
      id, name, org_id, source_file, generated, svg, verified,
      select_zoom_ref_width_px, select_zoom_ref_height_px
    )
      values (
        p_colony_id, p_colony_name, v_org_id, p_source_file, p_generated, p_svg, true,
        p_zoom_ref_width_px, p_zoom_ref_height_px
      );
  end if;

  for v_row in
    select * from jsonb_to_recordset(p_plots) as x(
      svg_id text,
      block text,
      number text,
      area_sqft integer,
      length_ft numeric,
      breadth_ft numeric,
      facing text,
      is_corner boolean
    )
  loop
    select * into v_plot from plots
      where colony_id = p_colony_id and svg_id = v_row.svg_id
      for update;

    if found then
      -- Replace path, existing plot: geometry only. Never status, never any
      -- operational/money field, never version, never updated_by, never org_id — nothing
      -- races against these columns today (tier-2's "Derived fields" rule), and bumping
      -- version here would spuriously fail an unrelated in-flight status save. org_id
      -- cannot have changed anyway — the org_mismatch check above already refused this
      -- whole call if the colony belonged to a different org.
      update plots
        set block = v_row.block,
            number = v_row.number,
            area_sqft = v_row.area_sqft,
            length_ft = v_row.length_ft,
            breadth_ft = v_row.breadth_ft,
            facing = v_row.facing,
            is_corner = v_row.is_corner
        where id = v_plot.id;
    else
      insert into plots (
        colony_id, org_id, svg_id, block, number, area_sqft, length_ft, breadth_ft, facing,
        is_corner, status, updated_by
      ) values (
        p_colony_id, v_org_id, v_row.svg_id, v_row.block, v_row.number, v_row.area_sqft,
        v_row.length_ft, v_row.breadth_ft, v_row.facing, v_row.is_corner, 'available',
        'import'
      ) returning * into v_plot;

      -- Same sentinel scripts/import-seed.ts uses — keeps a freshly uploaded colony's
      -- plots inside bulk_set_initial_plot_data's correction window (D-023) and excluded
      -- from fetchRecentHistoryForPlots's "recent changes" with zero new filter code.
      insert into plot_history (plot_id, org_id, status, changed_by, note)
        values (v_plot.id, v_org_id, 'available', 'import', 'Colony upload');
    end if;
  end loop;

  return jsonb_build_object('ok', true, 'colony_id', p_colony_id);
end;
$$;

comment on function create_colony_from_manifest is
  'In-app colony onboarding (docs/plans/11.md, D-025). Always sets verified = true on the
colonies row it creates/touches — the upload screen''s disabled-until-ticked confirmation
is what makes calling this function at all equivalent to a human having confirmed
(invariant 2); there is no p_verified parameter and none should be added. A replace
(p_replace = true, colony id already exists) is refused outright if it would orphan any
existing plot''s history, or if the existing colony belongs to a different organization
than the caller''s own (docs/plans/21.md phase 1, reason "org_mismatch") — and otherwise
only ever updates the seven geometry columns on an existing plot row — never status, money
fields, version, updated_by, or org_id. org_id on a freshly created colony/plot is derived
server-side from the caller''s session (auth.jwt()''s app_metadata), never a client
parameter — the same D-020 shape as attribution.';

-- create_colony_from_manifest's, bulk_set_initial_plot_data's, and
-- apply_plot_transition's EXECUTE grants are unchanged by this migration — none of their
-- signatures changed (create_colony_from_manifest keeps the 9-argument shape
-- docs/plans/20.md's select_zoom_ref migration already established), so the grant
-- statements already in earlier migrations still apply to the same
-- (text, text, text, date, text, jsonb, boolean, numeric, numeric) / (text, jsonb) /
-- (uuid, integer, text, text, text) argument lists.
