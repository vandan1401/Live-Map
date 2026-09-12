-- docs/plans/30.md: let an ordinary signed-in org member set their own org's colony
-- backdrop from inside the app (ColonyBackdropScreen.tsx), not only the admin portal's
-- service-role key. Reuses the exact colony-backdrops bucket and colonies.backdrop_*
-- columns docs/plans/29.md already shipped -- this migration only opens narrow write access
-- to them for the `authenticated` role. The admin portal's own write path (service role,
-- bypasses RLS/grants entirely) is unaffected and stays in place.

-- ---------------------------------------------------------------------------
-- Storage: an authenticated org member may upload/replace their own org's colony backdrop.
-- THREE policies, not two -- confirmed against the real local stack, not assumed from
-- docs: supabase-js's upsert:true compiles to a single `INSERT ... ON CONFLICT (name,
-- bucket_id) DO UPDATE ...` statement (checked directly in supabase_storage_colony-map's
-- own request logs), regardless of whether a conflicting row actually exists yet. Postgres
-- requires a role attempting an ON CONFLICT DO UPDATE to also have RLS SELECT visibility on
-- the table -- it needs to look up whether a conflicting row exists at all, and with RLS
-- enabled and zero SELECT policy for `authenticated`, that internal lookup sees nothing and
-- the whole statement fails closed with "new row violates row-level security policy" even
-- when the INSERT and UPDATE policies themselves are individually satisfied (verified by
-- temporarily setting both to `using (true)`/`with check (true)` and reproducing the same
-- failure -- the missing SELECT policy was the only fix that worked). This is true even on
-- a fresh insert with no actual conflict.
-- ---------------------------------------------------------------------------

-- storage.objects.name is qualified explicitly everywhere below -- colonies ALSO has a
-- `name` column (the colony's display name), and inside the `exists (select ... from
-- colonies c ...)` subquery an unqualified `name` resolves to the SUBQUERY's own scope
-- (colonies.name), not the outer storage.objects row being inserted/updated, per standard
-- SQL scoping (inner scope wins). A first draft of this migration left it unqualified: the
-- policy still parsed and ran with no error, it just silently compared a colony's own
-- display name against its id instead of the file path -- always false, so every write
-- (including a legitimate same-org one) was rejected. Caught by testing the success case
-- for real, not by reading the SQL back.
-- A SELECT policy takes only USING, never WITH CHECK (that clause only exists for
-- INSERT/UPDATE, which write new rows) -- this is the policy the ON CONFLICT DO UPDATE
-- mechanism above needs to even attempt its internal conflict lookup.
create policy "org members see their own colony's backdrop object"
on storage.objects for select
to authenticated
using (
  bucket_id = 'colony-backdrops'
  and exists (
    select 1 from colonies c
    where c.id = substring(storage.objects.name from '^(.*)\.jpg$')
      and c.org_id = nullif(auth.jwt() -> 'app_metadata' ->> 'org_id', '')::uuid
  )
);

create policy "org members upload their own colony's backdrop"
on storage.objects for insert
to authenticated
with check (
  bucket_id = 'colony-backdrops'
  and exists (
    select 1 from colonies c
    where c.id = substring(storage.objects.name from '^(.*)\.jpg$')
      and c.org_id = nullif(auth.jwt() -> 'app_metadata' ->> 'org_id', '')::uuid
  )
);

create policy "org members replace their own colony's backdrop"
on storage.objects for update
to authenticated
using (
  bucket_id = 'colony-backdrops'
  and exists (
    select 1 from colonies c
    where c.id = substring(storage.objects.name from '^(.*)\.jpg$')
      and c.org_id = nullif(auth.jwt() -> 'app_metadata' ->> 'org_id', '')::uuid
  )
)
with check (
  bucket_id = 'colony-backdrops'
  and exists (
    select 1 from colonies c
    where c.id = substring(storage.objects.name from '^(.*)\.jpg$')
      and c.org_id = nullif(auth.jwt() -> 'app_metadata' ->> 'org_id', '')::uuid
  )
);

-- ---------------------------------------------------------------------------
-- colonies: a COLUMN-level grant, not a table-wide one. M8
-- (20260815020000_m8_auth_rls_lockdown.sql) revoked insert/update/truncate on colonies from
-- authenticated entirely -- that revoke is untouched. This grant adds back UPDATE on
-- exactly the 11 backdrop_* columns; authenticated still cannot touch verified, svg, name,
-- status, or anything else on this row via a raw table update (Postgres checks column-level
-- ACLs independently of the table-level revoke). The RLS policy below is still required on
-- top -- the grant alone says nothing about which ROWS, only which columns.
-- ---------------------------------------------------------------------------

grant update (
  backdrop_storage_path, backdrop_image_width, backdrop_image_height,
  backdrop_transform_x, backdrop_transform_y, backdrop_transform_scale,
  backdrop_transform_rotate_deg, backdrop_darken_alpha,
  backdrop_enabled_on_admin, backdrop_enabled_on_public, backdrop_attribution
) on colonies to authenticated;

create policy "colonies_authenticated_update_backdrop" on colonies
  for update using (
    auth.role() = 'authenticated'
    and org_id = nullif(auth.jwt() -> 'app_metadata' ->> 'org_id', '')::uuid
  )
  with check (
    auth.role() = 'authenticated'
    and org_id = nullif(auth.jwt() -> 'app_metadata' ->> 'org_id', '')::uuid
  );

comment on policy "colonies_authenticated_update_backdrop" on colonies is
  'docs/plans/30.md: paired with a column-level grant (see this migration''s own comment
above) -- this policy alone would let an authenticated org member UPDATE any column on their
own org''s colony row if they somehow also had column privilege on it; the column-level
grant is what keeps this to exactly the 11 backdrop_* fields. Same org-scoping expression as
colonies_authenticated_select.';
