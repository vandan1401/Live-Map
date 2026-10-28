-- Plan 40: per-colony plot statuses, declared in colony.json (docs/plans/40.md, D-053).
-- The closed three-word CHECK on plots.status / plot_history.status becomes (a) a format-only
-- CHECK on the table and (b) a membership test against the colony's OWN list, inside every
-- function that writes a status. Transition legality is unchanged: it lives in TypeScript.
--
-- DEPLOY ORDER (docs/plans/40.md §3): apply this BEFORE the app that sends p_statuses or reads
-- colonies.statuses. Old app + this migration works (new column ignored, new RPC argument
-- defaulted). New app + old database does not.

alter table colonies add column statuses jsonb;
comment on column colonies.statuses is
  'Optional per-colony plot status list (docs/plans/40.md): [{key,label,colour}], legend order,
validated by valid_colony_statuses(). NULL = the built-in default (available, booked,
registered), so every colony that exists today is unchanged.';

-- Existing rows already satisfy the format ('hold' history rows included, which the previous
-- CHECK only ever policed for NEW rows). Closed list -> format only.
alter table plots drop constraint plots_status_check;
alter table plots add constraint plots_status_format_check
  check (status ~ '^[a-z][a-z0-9_]{0,31}$');

alter table plot_history drop constraint plot_history_status_check;
alter table plot_history add constraint plot_history_status_format_check
  check (status ~ '^[a-z][a-z0-9_]{0,31}$');

comment on column plots.status is
  'A key from this colony''s status list (colonies.statuses; null = available/booked/registered).
Membership is enforced inside apply_plot_transition / bulk_set_initial_plot_data /
create_colony_from_manifest, never here -- this CHECK only guards the format. Legal transitions
are enforced in application code by applyPlotTransition() (D-013, docs/plans/40.md).';

-- Shape check for a declared list. Mirrors contract/colony.schema.json's `statuses` block plus
-- the one rule JSON Schema cannot express (unique keys). A third copy on purpose: the schema
-- guards the file, the pipeline guards the export, this guards the RPC a client can call
-- with anything.
create or replace function valid_colony_statuses(p jsonb)
returns boolean
language plpgsql
immutable
set search_path = public, pg_temp
as $$
begin
  if p is null or jsonb_typeof(p) <> 'array' then return false; end if;
  -- 8 = MAX_STATUSES (docs/plans/40.md §3): the legend is one row on a phone.
  if jsonb_array_length(p) not between 1 and 8 then return false; end if;
  if exists (select 1 from jsonb_array_elements(p) e where jsonb_typeof(e) <> 'object') then
    return false;
  end if;
  return coalesce((
    -- coalesce(.., false) per entry: bool_and ignores NULLs, so a null field (e.g. colour: null)
    -- would otherwise be silently skipped and the list accepted. Types are checked explicitly
    -- because ->> renders a JSON boolean/number as text that can match a pattern.
    select bool_and(coalesce(
      (select array_agg(k order by k) from jsonb_object_keys(e) k) = array['colour', 'key', 'label']
      and jsonb_typeof(e -> 'key') = 'string'
      and (e ->> 'key') ~ '^[a-z][a-z0-9_]{0,31}$'
      and jsonb_typeof(e -> 'colour') = 'string'
      and (e ->> 'colour') ~ '^#[0-9a-f]{6}$'
      and jsonb_typeof(e -> 'label') = 'string'
      and (e ->> 'label') ~ '\S'
      and char_length(e ->> 'label') <= 32,
      false
    )) from jsonb_array_elements(p) e
  ), false)
  and (select count(distinct e ->> 'key') = count(*) from jsonb_array_elements(p) e)
  and exists (select 1 from jsonb_array_elements(p) e where e ->> 'key' = 'available');
end;
$$;

-- A colony's status keys: its declared list, or the built-in three when none is declared (or
-- the colony does not exist -- callers check existence separately). security definer so the
-- security-definer writers above can read colonies regardless of the caller's RLS; internal
-- only, so no client role may execute it.
create or replace function colony_status_keys(p_colony_id text)
returns text[]
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce(
    (select array_agg(e ->> 'key')
       from colonies c, jsonb_array_elements(c.statuses) e
       where c.id = p_colony_id and c.statuses is not null),
    array['available', 'booked', 'registered']
  );
$$;

revoke execute on function valid_colony_statuses(jsonb) from public, anon, authenticated;
revoke execute on function colony_status_keys(text) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- apply_plot_transition() -- unchanged except the membership guard.
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

  -- docs/plans/40.md: a colony declares its own status list (colonies.statuses; null = the
  -- built-in three). Membership is guarded here, before either write below, so a status the
  -- colony does not list can never reach plots or plot_history. Transition LEGALITY stays in
  -- TypeScript (isLegalTransition) exactly as before — this only checks the word is valid
  -- for this colony, the job the old closed CHECK constraint did for every colony at once.
  if not (p_new_status = any (colony_status_keys(v_current.colony_id))) then
    raise exception 'unknown_status:%', p_new_status;
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
-- bulk_set_initial_plot_data() -- membership test instead of the hardcoded triple.
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
  v_status_keys text[];
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

  -- docs/plans/40.md: the colony's own status list, not a hardcoded triple.
  v_status_keys := colony_status_keys(p_colony_id);

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

    if v_row.status is null or not (v_row.status = any (v_status_keys)) then
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
-- create_colony_from_manifest() -- gains p_statuses. A new parameter list is a new function:
-- the old 9-argument overload is dropped (two overloads would make PostgREST's named-argument
-- resolution ambiguous), and its grants are re-applied to the new signature. D-033: after this
-- migration, reload PostgREST's schema cache and prove it with a live RPC call.
-- ---------------------------------------------------------------------------

drop function if exists create_colony_from_manifest(
  text, text, text, date, text, jsonb, boolean, numeric, numeric
);

create or replace function create_colony_from_manifest(
  p_colony_id text,
  p_colony_name text,
  p_source_file text,
  p_generated date,
  p_svg text,
  p_plots jsonb,
  p_replace boolean default false,
  p_zoom_ref_width_px numeric default null,
  p_zoom_ref_height_px numeric default null,
  p_statuses jsonb default null
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
  v_dropped_status text;
  v_dropped_count bigint;
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;

  v_org_id := nullif(auth.jwt() -> 'app_metadata' ->> 'org_id', '')::uuid;
  if v_org_id is null then
    raise exception 'not authorized for this organization';
  end if;

  -- docs/plans/40.md: the status list is validated here too, not only by the schema and the
  -- pipeline -- this RPC is callable by any signed-in client with any jsonb. Nothing has
  -- been written yet at this point, so refusing costs nothing.
  if p_statuses is not null and not valid_colony_statuses(p_statuses) then
    return jsonb_build_object('ok', false, 'reason', 'invalid_statuses');
  end if;

  select exists(select 1 from colonies where id = p_colony_id) into v_exists;

  if v_exists and not p_replace then
    return jsonb_build_object('ok', false, 'reason', 'colony_exists');
  end if;

  if v_exists and p_replace then
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

    -- docs/plans/40.md: a re-upload may not drop a status some plot still holds -- that plot
    -- would be left carrying a word its colony no longer lists, invisible in the legend and
    -- unchangeable (apply_plot_transition would refuse every move out of it). Refused whole,
    -- naming the worst offender, never remapped silently. Runs before any write below, in
    -- the same transaction, so a refusal leaves the colony exactly as it was.
    if p_statuses is not null then
      -- Lock the colony's plots first. apply_plot_transition locks a plot then reads this colony's
      -- list; without this, one already in flight can commit a plot into a key this replace is about
      -- to drop (the check below reads uncommitted-to state). In-flight transitions finish before
      -- the check; later ones wait for this replace to commit and then see the NEW list.
      perform 1 from plots where colony_id = p_colony_id for update;

      select p.status, count(*) into v_dropped_status, v_dropped_count
        from plots p
        where p.colony_id = p_colony_id
          and not (p.status = any (array(select e ->> 'key' from jsonb_array_elements(p_statuses) e)))
        group by p.status
        order by count(*) desc, p.status
        limit 1;
      if v_dropped_status is not null then
        return jsonb_build_object(
          'ok', false, 'reason', 'status_in_use',
          'status', v_dropped_status, 'plot_count', v_dropped_count
        );
      end if;
    end if;

    -- Never touch public_token here. Line 153's one-time backfill already gives every
    -- pre-Plan-35 colony a token, so by the time this migration has run once, the only way
    -- a colony reaches this branch with a null public_token is a deliberate
    -- revokePublicLink() call — and a re-upload/replace must not silently un-revoke that
    -- (/review finding: an earlier draft of this migration used
    -- coalesce(public_token, gen_random_uuid()) here, which did exactly that).
    -- Geometry only — never status, money fields, version, updated_by, or org_id (org_id
    -- cannot have changed anyway: the org_mismatch check above already refused this call if
    -- the colony belonged to a different org).
    update colonies
      set name = p_colony_name, source_file = p_source_file, generated = p_generated,
          svg = p_svg, select_zoom_ref_width_px = p_zoom_ref_width_px,
          select_zoom_ref_height_px = p_zoom_ref_height_px,
          -- null (key omitted from the manifest) leaves the stored list untouched; a value
          -- replaces it (already validated, and proven not to strand a plot, above).
          statuses = coalesce(p_statuses, statuses)
      where id = p_colony_id;
  else
    -- Plan 35: every newly created colony gets a public_token immediately — no second
    -- call, no client-supplied value, same server-only derivation pattern as v_org_id,
    -- which is itself derived here (docs/plans/21.md phase 1), never a p_org_id parameter,
    -- the exact D-020 shape apply_plot_transition() already established for attribution.
    insert into colonies (
      id, name, org_id, source_file, generated, svg, verified,
      select_zoom_ref_width_px, select_zoom_ref_height_px, public_token, statuses
    )
      values (
        p_colony_id, p_colony_name, v_org_id, p_source_file, p_generated, p_svg, true,
        p_zoom_ref_width_px, p_zoom_ref_height_px, gen_random_uuid(), p_statuses
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
      -- Replace path, existing plot: geometry only — see the comment on the colonies
      -- update above; the same rule applies here (never status/money/version/updated_by).
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

      insert into plot_history (plot_id, org_id, status, changed_by, note)
        values (v_plot.id, v_org_id, 'available', 'import', 'Colony upload');
    end if;
  end loop;

  return jsonb_build_object('ok', true, 'colony_id', p_colony_id);
end;
$$;

comment on function create_colony_from_manifest(text, text, text, date, text, jsonb, boolean, numeric, numeric, jsonb) is
  'In-app colony onboarding (docs/plans/11.md, D-025). Always sets verified = true on the
colonies row it creates/touches — the upload screen''s disabled-until-ticked confirmation
is what makes calling this function at all equivalent to a human having confirmed
(invariant 2); there is no p_verified parameter and none should be added. A replace
refuses across orgs (org_mismatch) and refuses to drop plot_history (would_orphan_history).
org_id is derived server-side from the caller''s session (D-020''s shape), never a
p_org_id parameter. A replace only ever updates geometry columns on an existing plot row —
never status, money fields, version, updated_by, or org_id.
Plan 35: a newly created colony gets a public_token immediately (gen_random_uuid()); a
replace never touches an existing public_token, so a colony a human deliberately revoked
(revokePublicLink(), lib/colony/publicColony.ts) stays revoked across re-uploads — there is
no p_public_token parameter and none should be added, rotation/revocation stays
regeneratePublicLink()/revokePublicLink()''s job.
docs/plans/40.md: p_statuses is this colony''s declared status list (colony.json''s optional
statuses block). Validated by valid_colony_statuses() (reason invalid_statuses); on a replace,
a list that drops a key some plot still holds is refused (reason status_in_use, with the
status and plot_count) and null leaves the stored list untouched.';

revoke execute on function create_colony_from_manifest(
  text, text, text, date, text, jsonb, boolean, numeric, numeric, jsonb
) from public;
grant execute on function create_colony_from_manifest(
  text, text, text, date, text, jsonb, boolean, numeric, numeric, jsonb
) to authenticated;

-- ---------------------------------------------------------------------------
-- get_public_colony() -- same signature and grants; the public view needs the colony's
-- colours and labels. A pure return-shape change, same posture as M19/M20/plan 29.
-- ---------------------------------------------------------------------------

create or replace function get_public_colony(p_token uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_colony record;
  v_plots jsonb;
begin
  -- docs/plans/22.md: verified = true is checked here independently — this RPC bypasses
  -- RLS (security definer) and calls neither fetchVerifiedColonies' nor loadPlotStatuses'
  -- own verified check (D-108). A wrong token, a revoked/regenerated token, and a real
  -- token whose colony isn't verified yet are all indistinguishable from here on purpose
  -- (see the comment below) — never split into a separate "found but not verified" branch.
  -- svg is not null: colonies.svg is nullable at the column level (docs/plans/11.md
  -- §2.1, a pre-plan-11 colony never backfilled one) — PublicColonyResult's `svg` is a
  -- required string, and a null here would break the render with no error boundary to
  -- catch it. Treated as "not found" like every other unusable case, not a third,
  -- distinguishable outcome (/review finding, docs/plans/22.md).
  select id, name, svg, statuses, select_zoom_ref_width_px, select_zoom_ref_height_px,
    backdrop_storage_path, backdrop_image_width, backdrop_image_height,
    backdrop_transform_x, backdrop_transform_y, backdrop_transform_scale,
    backdrop_transform_rotate_deg, backdrop_darken_alpha, backdrop_enabled_on_public,
    backdrop_attribution into v_colony
    from colonies
    where public_token = p_token and verified = true and svg is not null;

  if not found then
    -- Same "zero rows / zero result, not a permission error" idiom as this app's other
    -- RPCs (create_colony_from_manifest's ok:false shapes, spec/08 criterion 2) — a return
    -- value, never a raised exception. Deliberately the ONLY failure signal: a
    -- distinguishable "wrong token" vs. "right token, not verified yet" vs. "revoked"
    -- response would let a caller confirm a guessed uuid belongs to a real colony without
    -- ever seeing its data — a real information leak, however minor.
    return jsonb_build_object('found', false);
  end if;

  -- docs/plans/21.md's "every security-definer RPC re-checks org ownership" rule is
  -- deliberately NOT applied here — this RPC's whole purpose is to serve a caller who
  -- belongs to no organization at all. The token IS the authorization boundary in the
  -- same role org_id plays for every other RPC. Do not "fix" this into an org check — that
  -- would make every public link unreachable.

  -- docs/plans/25.md: block/number/area_sqft/length_ft/breadth_ft added alongside the
  -- existing svg_id/status — still an explicit, hand-written column list, never
  -- select */to_jsonb(plots). Never add a column here without updating this comment and
  -- the forbidden-column-name test in publicColony.test.ts.
  select coalesce(
    jsonb_agg(jsonb_build_object(
      'svg_id', svg_id,
      'status', status,
      'block', block,
      'number', number,
      'area_sqft', area_sqft,
      'length_ft', length_ft,
      'breadth_ft', breadth_ft
    )),
    '[]'::jsonb
  )
    into v_plots
    from plots
    where colony_id = v_colony.id;

  return jsonb_build_object(
    'found', true,
    'colony', jsonb_build_object(
      'id', v_colony.id,
      'name', v_colony.name,
      'svg', v_colony.svg,
      'statuses', v_colony.statuses,
      'select_zoom_ref_width_px', v_colony.select_zoom_ref_width_px,
      'select_zoom_ref_height_px', v_colony.select_zoom_ref_height_px,
      'backdrop_storage_path', v_colony.backdrop_storage_path,
      'backdrop_image_width', v_colony.backdrop_image_width,
      'backdrop_image_height', v_colony.backdrop_image_height,
      'backdrop_transform_x', v_colony.backdrop_transform_x,
      'backdrop_transform_y', v_colony.backdrop_transform_y,
      'backdrop_transform_scale', v_colony.backdrop_transform_scale,
      'backdrop_transform_rotate_deg', v_colony.backdrop_transform_rotate_deg,
      'backdrop_darken_alpha', v_colony.backdrop_darken_alpha,
      'backdrop_enabled_on_public', v_colony.backdrop_enabled_on_public,
      'backdrop_attribution', v_colony.backdrop_attribution
    ),
    'plots', v_plots
  );
end;
$$;

comment on function get_public_colony is
  'docs/plans/22.md + docs/plans/25.md + docs/plans/26.md + docs/plans/29.md: the
unauthenticated, per-colony, token-scoped public read path. Never checks auth.uid() or
org_id — the token itself is the authorization boundary. Returns
svg_id/status/block/number/area_sqft/length_ft/breadth_ft per plot, and
id/name/svg/statuses/select_zoom_ref_width_px/select_zoom_ref_height_px/backdrop_* (never
backdrop_enabled_on_admin) for the colony — never any PII or money column (owner_name,
owner_phone, broker_name, rate_paise, booking_amount_paise, booking_date, registry_date,
notes, updated_by). TypeScript callers go through apps/map/src/lib/db/colonies.ts''s
fetchPublicColony(), never this RPC directly.';

notify pgrst, 'reload schema';
