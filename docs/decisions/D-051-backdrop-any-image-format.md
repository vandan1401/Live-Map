# D-051: Backdrop upload accepts any image format via magic-number detection, not JPEG-only

**Status:** accepted
**Date:** 2026-09-13

## Decision

`colonyBackdrop.ts::isJpegBuffer` is replaced by `detectImageFormat(bytes): {ext,
contentType} | null`, recognizing JPEG, PNG, WebP, and GIF (87a/89a) by magic number only
— never file extension or the browser's `File.type`, both trivially wrong or spoofable.
`uploadColonyBackdropImage` stores the object at `<colonyId>.<ext>` (was always
`<colonyId>.jpg`) with the matching `contentType`, and removes the colony's previous
Storage object first if a re-upload changes format (a `.jpg` → `.png` re-upload would
otherwise orphan the old `.jpg` forever). Both the in-app picker (`accept="image/*"`) and
the admin portal's own upload form accept any image format the same way.

The Storage RLS policies from `20260912020000_colony_backdrop_authenticated_write.sql`
extracted the colony id from the object name via `substring(name from '^(.*)\.jpg$')` —
hardcoded to the old JPEG-only convention. `20260913000000_colony_backdrop_any_image_format
.sql` generalizes this to `substring(name from '^(.*)\.[^.]+$')` (strip whatever extension
is present), applied via `ALTER POLICY` to the same three policies.

## Why

Owner, mid-session, testing D-050's new inline picker: "one more thing .png is not
allowed please allow every image format." The original JPEG-only convention traced back
to the `bake_static.html`/`stitch.html` prototype pipeline, which only ever produced
JPEGs — a real constraint of that specific tool, not a requirement of the backdrop
feature itself. A backdrop hand-supplied through the upload screen (rather than produced
by that pipeline) has no such guarantee, and there's no real reason to reject a perfectly
good PNG or WebP.

The RLS-policy bug this exposed — found by the owner hitting it live, not caught by this
session's own test-writing — was a direct, foreseeable consequence of generalizing the
storage path without checking whether anything else keyed off the `.jpg` assumption. It
is fixed in the same decision rather than deferred, since shipping "any image format" in
the application code while leaving the database layer JPEG-only would have looked done
but silently failed for every format except JPEG.

## Rejected alternatives

- **Transcode every upload to JPEG server-side, keeping the fixed `.jpg` path and RLS
  policies untouched.** Avoids touching the RLS policies at all, but adds a real
  dependency (an image-processing library) for a problem that a one-line regex change
  solves for free, and silently discards whatever format/quality tradeoff the operator
  actually picked.
- **Trust the browser's `File.type` or the filename's extension instead of sniffing magic
  bytes.** Both are trivially wrong (a renamed file, a mislabeled MIME type) — the
  project's own existing convention (the old `isJpegBuffer`) was already magic-number-only
  for exactly this reason; extending it kept that principle rather than abandoning it.
- **Leave the old object in Storage on a format-changing re-upload, accepting the
  orphan.** Storage cost is real but small per colony; still rejected on principle — this
  project already treats orphans as a named failure mode to avoid (`spec/00-rules.md`),
  and the fix (read the old path, remove it after the new upload lands) was cheap.
