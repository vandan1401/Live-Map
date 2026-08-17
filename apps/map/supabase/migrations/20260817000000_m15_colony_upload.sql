-- In-app colony onboarding (docs/plans/11.md, D-025, spec/15). Two parts:
--   1. colonies.svg — the SVG becomes runtime data instead of a build-time import.
--   2. create_colony_from_manifest() — a second, narrow security-definer write path,
--      shaped like bulk_set_initial_plot_data (D-023), for the upload screen's one RPC
--      call. verified is always set true by this function — see its own comment.

alter table colonies add column svg text;

comment on column colonies.svg is
  'Runtime SVG markup (D-025) — replaces the old build-time `?raw` import. Nullable at the
column level only because a schema migration cannot backfill a file that lives on disk;
every writer (create_colony_from_manifest, scripts/import-seed.ts) always supplies it.';

create or replace function create_colony_from_manifest(
  p_colony_id text,
  p_colony_name text,
  p_source_file text,
  p_generated date,
  p_svg text,
  p_plots jsonb,
  p_replace boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_exists boolean;
  v_missing text[];
  v_row record;
  v_plot plots;
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;

  select exists(select 1 from colonies where id = p_colony_id) into v_exists;

  if v_exists and not p_replace then
    return jsonb_build_object('ok', false, 'reason', 'colony_exists');
  end if;

  if v_exists and p_replace then
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
      set name = p_colony_name, source_file = p_source_file, generated = p_generated, svg = p_svg
      where id = p_colony_id;
  else
    insert into colonies (id, name, source_file, generated, svg, verified)
      values (p_colony_id, p_colony_name, p_source_file, p_generated, p_svg, true);
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
      -- operational/money field, never version, never updated_by — nothing races
      -- against these seven columns today (tier-2's "Derived fields" rule), and bumping
      -- version here would spuriously fail an unrelated in-flight status save.
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
        colony_id, svg_id, block, number, area_sqft, length_ft, breadth_ft, facing,
        is_corner, status, updated_by
      ) values (
        p_colony_id, v_row.svg_id, v_row.block, v_row.number, v_row.area_sqft,
        v_row.length_ft, v_row.breadth_ft, v_row.facing, v_row.is_corner, 'available',
        'import'
      ) returning * into v_plot;

      -- Same sentinel scripts/import-seed.ts uses — keeps a freshly uploaded colony's
      -- plots inside bulk_set_initial_plot_data's correction window (D-023) and excluded
      -- from fetchRecentHistoryForPlots's "recent changes" with zero new filter code.
      insert into plot_history (plot_id, status, changed_by, note)
        values (v_plot.id, 'available', 'import', 'Colony upload');
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
existing plot''s history, and otherwise only ever updates the seven geometry columns on an
existing plot row — never status, money fields, version, or updated_by.';

revoke execute on function create_colony_from_manifest(text, text, text, date, text, jsonb, boolean)
  from public;
grant execute on function create_colony_from_manifest(text, text, text, date, text, jsonb, boolean)
  to authenticated;
