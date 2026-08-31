-- Per-colony, owner-drawn click-to-focus zoom reference (docs/plans/20.md). SELECT_ZOOM was
-- a single fixed Leaflet zoom applied identically to every colony; because tools/pipeline
-- normalises every colony's SVG to a fixed viewBox width regardless of its real physical
-- footprint (D-110), the same zoom produced wildly different real-world framing per colony.
-- Fix: the owner draws a COL-ZOOM-REF rectangle per colony (docs/cad-layer-standard.md); the
-- pipeline measures it into colony.json's select_zoom.{ref_width_px,ref_height_px}; these two
-- columns carry that value into the database so apps/map can compute the zoom at render time.
--
-- Nullable with no backfill, permanently -- unlike colonies.svg ("every writer supplies it,
-- nullable only at the column level"), a colony whose DXF has no COL-ZOOM-REF rectangle
-- legitimately never has these set. apps/map falls back to its own fixed default zoom when
-- either is null.

alter table colonies
  add column select_zoom_ref_width_px numeric,
  add column select_zoom_ref_height_px numeric;

comment on column colonies.select_zoom_ref_width_px is
  'SVG-viewBox-px width of the owner-drawn COL-ZOOM-REF rectangle (docs/plans/20.md). Null
when the colony''s source DXF has no such rectangle -- apps/map then falls back to a fixed
default click-to-focus zoom for that colony.';

comment on column colonies.select_zoom_ref_height_px is
  'SVG-viewBox-px height of the owner-drawn COL-ZOOM-REF rectangle. See
select_zoom_ref_width_px.';

-- create_colony_from_manifest gains two new trailing parameters. This changes the function's
-- signature, so `create or replace function` alone would create a second overload rather than
-- replacing the original -- the old 7-argument signature must be dropped explicitly first.
drop function if exists create_colony_from_manifest(text, text, text, date, text, jsonb, boolean);

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
      set name = p_colony_name, source_file = p_source_file, generated = p_generated,
          svg = p_svg, select_zoom_ref_width_px = p_zoom_ref_width_px,
          select_zoom_ref_height_px = p_zoom_ref_height_px
      where id = p_colony_id;
  else
    insert into colonies (
      id, name, source_file, generated, svg, verified,
      select_zoom_ref_width_px, select_zoom_ref_height_px
    )
      values (
        p_colony_id, p_colony_name, p_source_file, p_generated, p_svg, true,
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
existing plot row — never status, money fields, version, or updated_by. p_zoom_ref_width_px/
p_zoom_ref_height_px (docs/plans/20.md) are written verbatim, including null, to
colonies.select_zoom_ref_width_px/select_zoom_ref_height_px — a manifest with no
select_zoom simply passes null through.';

revoke execute on function create_colony_from_manifest(
  text, text, text, date, text, jsonb, boolean, numeric, numeric
) from public;
grant execute on function create_colony_from_manifest(
  text, text, text, date, text, jsonb, boolean, numeric, numeric
) to authenticated;
