-- Booked-by name (docs/plans/08.md). Adds owner_name to the one write path for
-- plots.status. The old 5-arg overload is dropped first, not left alongside the new one
-- — Postgres treats a different parameter list as a distinct function, and leaving both
-- would reopen the "exactly one write path" invariant this migration exists to preserve.

drop function apply_plot_transition(uuid, integer, text, text, text);

create or replace function apply_plot_transition(
  p_plot_id uuid,
  p_expected_version integer,
  p_new_status text,
  p_actor text,
  p_note text default null,
  p_owner_name text default null
)
returns plots
language plpgsql
as $$
declare
  v_current plots;
begin
  select * into v_current from plots where id = p_plot_id for update;

  if not found then
    raise exception 'plot not found: %', p_plot_id using errcode = 'P0002';
  end if;

  if v_current.version <> p_expected_version then
    raise exception 'version_conflict:%', v_current.updated_by;
  end if;

  update plots
    set status = p_new_status,
        version = version + 1,
        updated_by = p_actor,
        updated_at = now(),
        -- coalesce, never a bare assignment: every transition except a fresh booking
        -- omits p_owner_name, and must leave whatever name is already on the row
        -- untouched (docs/plans/08.md §3) — this is what makes Undo-into-booked restore
        -- the correct prior buyer with no new UI or plot_history column.
        owner_name = coalesce(p_owner_name, owner_name)
    where id = p_plot_id
    returning * into v_current;

  insert into plot_history (plot_id, status, changed_by, note)
    values (p_plot_id, p_new_status, p_actor, p_note);

  return v_current;
end;
$$;

comment on function apply_plot_transition is
  'The only path that writes plots.status (D-006, D-013, spec/04). TypeScript callers go
through apps/map/src/lib/plot-status/applyPlotTransition.ts, never this RPC directly.';

grant execute on function apply_plot_transition(uuid, integer, text, text, text, text)
  to anon, authenticated;
