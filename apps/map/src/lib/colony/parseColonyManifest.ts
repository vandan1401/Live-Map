// Client-side manifest validation for the colony-upload screen (docs/plans/11.md, D-025,
// spec/15). Pure, DOM-free — no network calls, unit-testable like parseBulkImportFile.ts.
//
// Validates against the *real* contract/colony.schema.json file (imported as raw text via
// Vite's `?raw` — no resolveJsonModule / tsconfig include change needed), never a
// hand-transcribed copy.
// Invariant 1: the contract is the interface; two independent restatements of it
// (Python's `make contract`, a hand-rolled TS check) are exactly the kind of silent drift
// invariant 1 exists to prevent.
// The schema's own $schema is 2020-12 (contract/colony.schema.json) — Ajv's default
// export only understands draft-07; the /dist/2020 entry point is what adds the 2020-12
// meta-schema.
import Ajv2020 from "ajv/dist/2020";
import colonySchemaRaw from "../../../../../contract/colony.schema.json?raw";
import { extractSvgPlotIds } from "./svgPlotIds.ts";
import type { ColonyManifest } from "../db/types.ts";

const colonySchema = JSON.parse(colonySchemaRaw) as object;
const ajv = new Ajv2020({ allErrors: true, strict: false });
const validate = ajv.compile(colonySchema);

export function validateColonyManifest(
  json: unknown,
): { ok: true; manifest: ColonyManifest } | { ok: false; errors: string[] } {
  if (validate(json)) {
    return { ok: true, manifest: json as ColonyManifest };
  }
  const errors = (validate.errors ?? []).map(
    (error) => `${error.instancePath || "(root)"} ${error.message ?? "is invalid"}`,
  );
  return { ok: false, errors };
}

// D-025: the pipeline only ever emits `false`; `true` in an uploaded file means someone
// hand-edited it. Call only after validateColonyManifest has already confirmed the shape.
export function checkManifestVerifiedFalse(manifest: ColonyManifest): boolean {
  return manifest.colony.verified === false;
}

export function checkSvgIdsAgree(
  manifest: ColonyManifest,
  svgRaw: string,
):
  | { ok: true }
  | { ok: false; inManifestNotSvg: string[]; inSvgNotManifest: string[]; duplicates: string[] } {
  const svgPlotIds = extractSvgPlotIds(svgRaw);
  const manifestPlotIds = new Set(manifest.plots.map((p) => p.svg_id));

  // A duplicated svg_id collapses into the Set below, so the create_colony_from_manifest
  // RPC's per-row upsert (select ... for update, then insert-or-update) would silently
  // treat the second occurrence as a geometry update of the row the first just inserted —
  // one plot from the manifest never gets created, with nothing telling the uploader
  // (/review finding: "N plot(s)" shown, N-1 rows actually written).
  const duplicates: string[] = [];
  const seen = new Set<string>();
  for (const p of manifest.plots) {
    if (seen.has(p.svg_id)) duplicates.push(p.svg_id);
    seen.add(p.svg_id);
  }

  const inManifestNotSvg = [...manifestPlotIds].filter((id) => !svgPlotIds.has(id));
  const inSvgNotManifest = [...svgPlotIds].filter((id) => !manifestPlotIds.has(id));

  if (inManifestNotSvg.length === 0 && inSvgNotManifest.length === 0 && duplicates.length === 0) {
    return { ok: true };
  }
  return { ok: false, inManifestNotSvg, inSvgNotManifest, duplicates };
}
