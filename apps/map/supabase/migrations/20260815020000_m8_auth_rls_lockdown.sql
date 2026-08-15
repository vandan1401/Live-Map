-- M8 — auth (username/password via synthetic email, D-019) + RLS lockdown
-- (docs/plans/09.md, spec/08-map-auth.md). Replaces the M2 permissive policies and
-- swaps apply_plot_transition()'s client-supplied p_actor for server-derived attribution
-- (D-020, supersedes D-016).

-- ---------------------------------------------------------------------------
-- apply_plot_transition() — drop the 6-arg (p_actor) signature, recreate as 5-arg.
-- ---------------------------------------------------------------------------

drop function apply_plot_transition(uuid, integer, text, text, text, text);

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
  -- Fail loudly rather than ever falling back to a placeholder string (tier-1.md; a past
  -- /review already caught exactly this mistake once — getStoredActor() ?? "unknown" in
  -- the M3 log). No client role can even reach this point without a session (see the
  -- execute grant below), but the guard stays as a second, independent line of defence.
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;

  -- Server-derived, never client-supplied (D-020) — mirrored client-side by
  -- lib/auth/session.ts's getDisplayName() so the name a user sees for their own write
  -- never disagrees with what actually landed here. app_metadata, NOT user_metadata:
  -- user_metadata is writable by the user themselves via PUT /auth/v1/user with nothing
  -- but their own session — reading it here would let any signed-in family member
  -- self-attribute writes to any name they like, exactly the "claim, not attribution"
  -- failure D-020 exists to close. app_metadata is service-role-only to write
  -- (scripts/create-user.ts sets it at account creation; no client code can touch it).
  v_actor := coalesce(auth.jwt() -> 'app_metadata' ->> 'display_name', auth.jwt() ->> 'email');

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
        updated_by = v_actor,
        updated_at = now(),
        -- owner_name is sticky (D-018) — never cleared, only overwritten by a fresh
        -- booking that supplies one (docs/plans/08.md).
        owner_name = coalesce(p_owner_name, owner_name)
    where id = p_plot_id
    returning * into v_current;

  -- Same function body as the update above — one Postgres transaction. If this insert
  -- fails, the update above rolls back with it.
  insert into plot_history (plot_id, status, changed_by, note)
    values (p_plot_id, p_new_status, v_actor, p_note);

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
another claim) — a forged request body has nothing to tamper.';

-- Postgres grants EXECUTE to PUBLIC on every new function by default — anon would keep
-- reaching this function (and only be turned away by the auth.uid() guard above) unless
-- that implicit grant is revoked first. Belt and suspenders: both the grant and the
-- runtime guard independently refuse an unauthenticated caller.
revoke execute on function apply_plot_transition(uuid, integer, text, text, text)
  from public;
grant execute on function apply_plot_transition(uuid, integer, text, text, text)
  to authenticated;

-- ---------------------------------------------------------------------------
-- RLS — replace the M2 permissive policies (D-011: "tighten at M8").
-- ---------------------------------------------------------------------------

drop policy "colonies_permissive_all" on colonies;
drop policy "plots_permissive_all" on plots;
drop policy "plot_history_permissive_all" on plot_history;

create policy "colonies_authenticated_select" on colonies
  for select using (auth.role() = 'authenticated');
create policy "plots_authenticated_select" on plots
  for select using (auth.role() = 'authenticated');
create policy "plot_history_authenticated_select" on plot_history
  for select using (auth.role() = 'authenticated');

comment on policy "colonies_authenticated_select" on colonies is
  'M8 (docs/plans/09.md): select-only, authenticated-only. anon keeps its select grant
(below) so an anon query returns zero rows via this policy, not a permission error
(spec/08 criterion 2''s literal wording).';
comment on policy "plots_authenticated_select" on plots is
  'M8 (docs/plans/09.md): select-only, authenticated-only. All writes go through
apply_plot_transition() (security definer), which bypasses RLS by design — see that
function''s comment. Do not add an insert/update policy or grant here; that would open a
second write path (invariant 4).';
comment on policy "plot_history_authenticated_select" on plot_history is
  'M8 (docs/plans/09.md): select-only. Inserts go through apply_plot_transition() only
(security definer) — plot_history carries no direct insert grant for any client role.
UPDATE/DELETE stay rejected for every role by the M2 triggers regardless of RLS.';

-- No client role gets insert/update on colonies/plots, or insert on plot_history,
-- anymore — apply_plot_transition() (security definer) is the sole write path,
-- enforced here at the grant layer, not just by convention (invariant 4). select stays
-- granted to both roles; the policies above are what actually filter anon to zero rows.
-- truncate is revoked too — it bypasses row-level triggers entirely (Postgres never
-- fires BEFORE/AFTER triggers for TRUNCATE), so plot_history's append-only guarantee
-- (M2's triggers) had no real grant-layer backing against it despite this migration's
-- own original claim otherwise; it was a leftover default grant, never explicitly given.
revoke insert, update, truncate on colonies, plots from anon, authenticated;
revoke insert, truncate on plot_history from anon, authenticated;

-- service_role never had a table grant here at all (M2 only granted anon/authenticated)
-- — it has BYPASSRLS (Supabase's own role setup), but BYPASSRLS skips policies, not the
-- underlying GRANT check, so admin scripts (scripts/import-seed.ts, scripts/
-- create-user.ts) using this key still need one. Narrow to what each admin script
-- actually does: import-seed.ts inserts into all three; nothing ever updates or deletes
-- plot_history (M2's own stated intent — "plot_history gets no update/delete grant at
-- all" — a broader grant here would have quietly reversed that).
grant select, insert, update on colonies, plots to service_role;
grant select, insert on plot_history to service_role;
