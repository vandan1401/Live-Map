-- Bulk initial-data import (docs/plans/10.md). A second, deliberately narrow write path
-- for `plots` — the named exception in spec/00-rules.md's "Never build" table ("Google
-- Sheets or any spreadsheet as the live data store | A one-off CSV import for the initial
-- data load only"). Governs first-time status/owner/broker/rate/date data on plots that
-- already exist (from the pipeline manifest / scripts/import-seed.ts), never plot
-- creation. Invariant 4's "exactly one function writes plots.status" still holds for the
-- *operational* transition path (apply_plot_transition, used by the map and the table
-- view) — this function is not that path and never runs isLegalTransition().

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
    select * into v_plot from plots
      where colony_id = p_colony_id and svg_id = v_row.svg_id
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

    insert into plot_history (plot_id, status, changed_by, note)
      values (v_plot.id, v_row.status, 'bulk_import', 'Bulk initial import by ' || v_actor);

    v_applied := v_applied || to_jsonb(v_row.svg_id);
  end loop;

  return jsonb_build_object('applied', v_applied, 'skipped', v_skipped);
end;
$$;

comment on function bulk_set_initial_plot_data is
  'One-time initial-data write path (docs/plans/10.md) — the narrow spec/00-rules.md
exception to "no spreadsheet as the live data store". Updates existing plots rows only
(matched by colony_id + svg_id), never creates one. Deliberately does not call
isLegalTransition() — an initial data load is recording an already-true fact, not
performing a transition. Per-row eligibility (unknown svg_id / invalid status / already
has real, non-sentinel history) is recorded in the returned skipped array, never raised;
only a genuinely unexpected error aborts and rolls back the whole call.';

revoke execute on function bulk_set_initial_plot_data(text, jsonb) from public;
grant execute on function bulk_set_initial_plot_data(text, jsonb) to authenticated;
