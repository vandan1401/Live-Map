-- M4 — the single write path for plots.status. Additive only; does not touch the M2
-- migration. See docs/plans/02.md for the full contract.

create or replace function apply_plot_transition(
  p_plot_id uuid,
  p_expected_version integer,
  p_new_status text,
  p_actor text,
  p_note text default null
)
returns plots
language plpgsql
as $$
declare
  v_current plots;
begin
  -- Row lock: if a concurrent call is mid-transaction on this same plot, this blocks
  -- until it commits/rolls back, then re-reads the true committed row — never the stale
  -- snapshot this caller might otherwise have raced against (spec/00-rules.md).
  select * into v_current from plots where id = p_plot_id for update;

  if not found then
    raise exception 'plot not found: %', p_plot_id using errcode = 'P0002';
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
        updated_by = p_actor,
        updated_at = now()
    where id = p_plot_id
    returning * into v_current;

  -- Same function body as the update above — one Postgres transaction. If this insert
  -- fails, the update above rolls back with it. That's the actual atomicity mechanism
  -- (see docs/plans/02.md's forced-failure acceptance test), not just "looks atomic."
  insert into plot_history (plot_id, status, changed_by, note)
    values (p_plot_id, p_new_status, p_actor, p_note);

  return v_current;
end;
$$;

comment on function apply_plot_transition is
  'The only path that writes plots.status (D-006, D-013, spec/04). TypeScript callers go
through apps/map/src/lib/plot-status/applyPlotTransition.ts, never this RPC directly.';

grant execute on function apply_plot_transition(uuid, integer, text, text, text)
  to anon, authenticated;

-- Exists only so the atomicity test can force plot_history's INSERT to fail *after*
-- apply_plot_transition()'s plots UPDATE has already run, without corrupting real data —
-- a null actor fails on the plots UPDATE itself (updated_by is not null), never reaching
-- the history insert at all. An over-length note fails only the second statement.
alter table plot_history
  add constraint plot_history_note_length check (note is null or length(note) <= 500);
