# D-037 — Google Maps/Earth imagery stays out of scope for backdrop generation, even via screenshot + AI-regeneration

**Status:** accepted
**Date:** 2026-09-09
**Context:** After D-036 shipped Bharatkshetra's synthetic-OSM backdrop, the owner relayed
informal advice from a friend who works with Google's law team: "creating our own stylised
version from the satellite imagery is completely legal to use, we just can't use the exact
trademark name style for texts used by Google" — i.e. screenshot Google Maps/Earth imagery,
AI-regenerate it past recognition, and the result becomes a clean, owned asset as long as
Google's own text/branding is stripped out.

## Decision

Real Google Maps/Earth imagery — screenshotted, then AI-regenerated/restyled, with or
without Google's branding removed — stays explicitly out of scope for backdrop generation.
D-036's "real/licensed imagery of a real place stays banned outright" line already covered
this in principle; this decision records that the specific "screenshot + AI-regenerate =
clean asset" theory was checked against a primary source and rejected, not just
re-asserted.

## Reasoning

Checked against Google's own published Geo Guidelines
(`about.google/brand-resource-center/products-and-services/geo-guidelines/`), not a
summary or a secondhand claim:

- **Attribution survives reuse.** "All uses of Google Maps, Google Earth, and Street View
  content must provide attribution to Google" — "Don't remove, obscure, or crop out the
  attribution information." Stripping Google's text/branding doesn't clear this; it's a
  separate, still-binding requirement.
- **Significant alteration requires disclosure, not silence.** For Earth content
  specifically: "you're not allowed to significantly alter our imagery without providing
  clear context that it's a simulation, projection, or fictional content." Shipping an
  AI-restyled version as an undisclosed, presented-as-real backdrop is close to the thing
  this line exists to prevent.
- **There's an explicit ban on the exact technique proposed.** The guidelines prohibit
  using output, or third-party tools capturing output, from Google Earth/Earth Studio "to
  reconstruct 3D models or create similar content." Screenshot → AI-regenerate → ship as an
  owned backdrop asset is squarely "create similar content," not outside it.
- **This project already has a first-hand data point, not just a documents argument.** An
  earlier session (`map-integration-exploration` memory) tried image-to-image AI
  regeneration from a real screenshot once already, and the model leaked the source image's
  actual text label ("Gobariya Nadi") into the output despite an explicit "no text"
  instruction — the concrete, measured reason the project moved to OSM vector data + a
  from-scratch rasterized mask instead. The technique doesn't reliably strip the source
  content, technically, on top of not being cleared to use it, legally.
- **Trademark and copyright/ToS are different questions, and clearing one doesn't clear
  the other.** "We just can't use the text" addresses trademark (names/logos) only. It
  says nothing about copyright in the underlying imagery or the contractual terms accepted
  by using the service to obtain it — the two things that actually restrict this use.
- **Informal secondhand advice isn't a basis for a business decision here.** Even taken at
  face value, a hallway comment from someone at Google isn't how Google grants usage
  clearance for a third party's product — that goes through Maps Platform's actual
  licensing channel, or independent IP counsel, in writing.

## Rejected alternatives

- **Proceed on the friend's informal claim.** Rejected — contradicted by Google's own
  primary-source terms on multiple independent points (attribution, alteration-disclosure,
  explicit reconstruction ban), and not a channel Google would actually grant clearance
  through even if genuine.
- **Treat "remove the text" as sufficient scrubbing.** Rejected — conflates trademark with
  copyright/ToS; the guidelines' restrictions apply regardless of visual/text modification.

## Consequences

- D-036's synthetic-OSM-vector pipeline remains the only approved backdrop-generation path.
  The owner's own patwari-trace + OSM-layer AI generation (2026-09-09, replaces
  Bharatkshetra's shipped backdrop image, `f6f3ea3`) is consistent with this — no Google
  imagery in its provenance.
- If a future request specifically wants Google-sourced imagery, it needs actual written
  clearance from Google's licensing channel before any engineering time goes into it, not a
  rerun of this decision's reasoning.
- `## Backlog` in `PROGRESS.md` (2026-09-09) separately records a related-but-distinct idea
  — using Copernicus Sentinel-2 (genuinely open-licensed) macro land-cover as an extra AI-
  generation input — which this decision does not restrict; Sentinel-2's terms were checked
  independently and are permissive.
