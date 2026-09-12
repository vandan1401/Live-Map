-- Public colony link, add backdrop fields (docs/plans/29.md). Narrow follow-on to M20
-- (20260901010000_m20_public_link_zoom_ref.sql): adds the 10 backdrop_* columns
-- (20260912000000_colony_backdrop_storage.sql) to get_public_colony()'s two explicit column
-- lists. Same signature, same grants — a pure return-shape change, same posture as M19/M20.
--
-- backdrop_enabled_on_admin is deliberately NOT added — withhold-by-omission is this RPC's
-- whole security model (see its own comment below), and an admin-only flag reaching an
-- anonymous caller would be a real, if low-severity, information leak about the colony's
-- owner-side configuration.

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
  select id, name, svg, select_zoom_ref_width_px, select_zoom_ref_height_px,
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
id/name/svg/select_zoom_ref_width_px/select_zoom_ref_height_px/backdrop_* (never
backdrop_enabled_on_admin) for the colony — never any PII or money column (owner_name,
owner_phone, broker_name, rate_paise, booking_amount_paise, booking_date, registry_date,
notes, updated_by). TypeScript callers go through apps/map/src/lib/db/colonies.ts''s
fetchPublicColony(), never this RPC directly.';
