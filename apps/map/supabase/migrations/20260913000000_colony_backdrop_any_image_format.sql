-- docs/plans/34.md: the backdrop upload now accepts any image format (JPEG/PNG/WebP/GIF),
-- not JPEG-only -- uploadColonyBackdropImage stores at "<colonyId>.<ext>", not always
-- "<colonyId>.jpg". 20260912020000_colony_backdrop_authenticated_write.sql's three
-- storage.objects policies hardcoded '\.jpg$' when extracting the colony id from the
-- object name for their org-match check, so ANY non-.jpg upload failed the whole
-- INSERT/UPDATE outright with "new row violates row-level security policy" -- even though
-- the authenticated caller's org genuinely matched the colony (found live, 2026-09-13,
-- uploading a real backdrop through the app). Generalizes the id extraction to strip
-- whatever extension is present, not just .jpg -- colony ids are plain slugs (never
-- contain a literal '.', same assumption the original .jpg-only regex already made), so
-- stripping everything from the last '.' onward is unambiguous.
--
-- ALTER POLICY, not DROP + CREATE -- same three policies, only their using/with check
-- expressions change; names, roles, and command (select/insert/update) are untouched.

alter policy "org members see their own colony's backdrop object" on storage.objects
using (
  bucket_id = 'colony-backdrops'
  and exists (
    select 1 from colonies c
    where c.id = substring(storage.objects.name from '^(.*)\.[^.]+$')
      and c.org_id = nullif(auth.jwt() -> 'app_metadata' ->> 'org_id', '')::uuid
  )
);

alter policy "org members upload their own colony's backdrop" on storage.objects
with check (
  bucket_id = 'colony-backdrops'
  and exists (
    select 1 from colonies c
    where c.id = substring(storage.objects.name from '^(.*)\.[^.]+$')
      and c.org_id = nullif(auth.jwt() -> 'app_metadata' ->> 'org_id', '')::uuid
  )
);

alter policy "org members replace their own colony's backdrop" on storage.objects
using (
  bucket_id = 'colony-backdrops'
  and exists (
    select 1 from colonies c
    where c.id = substring(storage.objects.name from '^(.*)\.[^.]+$')
      and c.org_id = nullif(auth.jwt() -> 'app_metadata' ->> 'org_id', '')::uuid
  )
)
with check (
  bucket_id = 'colony-backdrops'
  and exists (
    select 1 from colonies c
    where c.id = substring(storage.objects.name from '^(.*)\.[^.]+$')
      and c.org_id = nullif(auth.jwt() -> 'app_metadata' ->> 'org_id', '')::uuid
  )
);
