-- M17 — public per-colony read-only link, phase 2 of 3 (docs/plans/22.md). Adds an
-- unauthenticated, token-scoped read path alongside M16's org-scoped authenticated one
-- (20260831000000_m16_organizations.sql). Phase 3 (an admin portal to generate/revoke the
-- link from a UI) is a separate, later plan — this phase's own admin surface is
-- scripts/generate-public-link.ts plus hand-run SQL to revoke, nothing more.

-- ---------------------------------------------------------------------------
-- colonies.public_token — null means no active public link (every colony's state today).
-- unique doubles as the index get_public_colony()'s lookup needs.
-- ---------------------------------------------------------------------------

alter table colonies add column public_token uuid unique;

comment on column colonies.public_token is
  'docs/plans/22.md: null = no active public link. Set by scripts/generate-public-link.ts
(service-role only, same posture as every other admin action in this app before the phase
3 portal exists). Regenerating overwrites it with a new value, invalidating the old one;
revoking sets it back to null via hand-run SQL. Never a client-writable column.';

-- ---------------------------------------------------------------------------
-- get_public_colony(p_token) — the one RPC in this app that must work for a caller with
-- no session at all. No auth.uid() check, by design.
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
  -- distinguishable outcome (/review finding).
  select id, name, svg into v_colony
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
  select coalesce(jsonb_agg(jsonb_build_object('svg_id', svg_id, 'status', status)), '[]'::jsonb)
    into v_plots
    from plots
    where colony_id = v_colony.id;

  -- The column list below is explicit and hand-written on purpose — never `select *` or
  -- `to_jsonb(plots)`/`to_jsonb(colonies)` anywhere in this function. A wildcard here would
  -- silently start leaking owner_name/owner_phone/broker_name/rate_paise/
  -- booking_amount_paise/booking_date/registry_date/notes/updated_by/org_id/version/
  -- block/number/facing/is_corner/area_sqft the moment any such column is added later, with
  -- no test able to catch it until a real PII leak already happened. block/number are
  -- already visible in the SVG's own baked-in plot-label text (export/svg.py) regardless,
  -- so withholding them here loses nothing a public visitor couldn't already see.
  return jsonb_build_object(
    'found', true,
    'colony', jsonb_build_object('id', v_colony.id, 'name', v_colony.name, 'svg', v_colony.svg),
    'plots', v_plots
  );
end;
$$;

comment on function get_public_colony is
  'docs/plans/22.md: the unauthenticated, per-colony, token-scoped public read path. Never
checks auth.uid() or org_id — the token itself is the authorization boundary. Returns
svg_id + status only per plot, and id/name/svg for the colony — never any PII or money
column. TypeScript callers go through apps/map/src/lib/db/colonies.ts''s
fetchPublicColony(), never this RPC directly.';

-- Postgres grants EXECUTE to PUBLIC on a new function by default — revoke first, same
-- revoke/grant dance 20260815020000_m8_auth_rls_lockdown.sql established for
-- apply_plot_transition. Granted to anon (the actual public-link visitor) AND
-- authenticated (a signed-in org member previewing their own colony's link before sharing
-- it, even though no UI button calls this yet — phase 3's job).
revoke execute on function get_public_colony(uuid) from public;
grant execute on function get_public_colony(uuid) to anon, authenticated;

-- No RLS policy changes on colonies/plots/organizations — this function bypasses RLS by
-- design, same as apply_plot_transition/bulk_set_initial_plot_data/
-- create_colony_from_manifest. Their existing authenticated-and-own-org-only policies stay
-- exactly as M16 left them: anon's direct select against colonies/plots must still return
-- zero rows. The only way anon reads anything is through this one function with a valid
-- token.
