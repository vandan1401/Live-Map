import { useEffect, useRef, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  checkManifestVerifiedFalse,
  checkSvgIdsAgree,
  validateColonyManifest,
} from "../../lib/colony/parseColonyManifest.ts";
import { createColonyFromManifest } from "../../lib/colony/createColonyFromManifest.ts";
import { applyManifestBackdrop } from "../../lib/colony/colonyBackdrop.ts";
import { fetchColonyById } from "../../lib/db/colonies.ts";
import { renderColonyPreview } from "../../components/map/renderColonyPreview.ts";
import type { ColonyManifest, ColonyRow } from "../../lib/db/types.ts";
import { ColonyUploadStageView, type Stage } from "./ColonyUploadStageView.tsx";
import { ColonyBackdropScreen } from "./ColonyBackdropScreen.tsx";

interface Props {
  client: SupabaseClient;
  onClose: () => void;
}

// D-025's verification gate, moved into this screen (spec/15). Reachable from
// ColonyPicker.tsx, modelled on BulkImportScreen.tsx's shape — a Stage union driving a
// full-screen overlay, parse client-side before any RPC call, one narrow write.
// Rendering per stage lives in ColonyUploadStageView.tsx (invariant 7's 250-line cap) —
// this file owns state and side effects only.
export function ColonyUploadScreen({ client, onClose }: Props) {
  const [stage, setStage] = useState<Stage>({ kind: "picking" });
  const [jsonFile, setJsonFile] = useState<File | null>(null);
  const [svgFile, setSvgFile] = useState<File | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const previewRef = useRef<HTMLDivElement>(null);
  // docs/plans/31.md: the freshly-created/replaced colony's own row, fetched once the
  // "backdrop" stage is reached — create_colony_from_manifest() only returns { colonyId },
  // not a full row, and ColonyBackdropScreen needs the real backdrop_* values to prefill
  // (defaults for a brand-new colony, or a replace's already-tuned ones).
  const [backdropColony, setBackdropColony] = useState<ColonyRow | null>(null);

  useEffect(() => {
    if (stage.kind !== "backdrop") {
      setBackdropColony(null);
      return;
    }
    let cancelled = false;
    const colonyId = stage.colonyId;
    fetchColonyById(client, colonyId)
      .then((row) => {
        if (cancelled) return;
        if (!row) {
          // The colony was just created/replaced by this same screen — a null result
          // right after that means something is genuinely wrong, not a normal case to
          // paper over. Route to "failed" (the normal overlay/panel, with its own close
          // button) rather than leaving the "Loading…" panel below up forever
          // (/review finding, 2026-09-12: a fetch error/null previously had no way out).
          setStage({
            kind: "failed",
            message: `Colony "${colonyId}" was created, but could not be re-loaded to set its backdrop. Check the colony list — it should still be there.`,
          });
          return;
        }
        setBackdropColony(row);
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        setStage({
          kind: "failed",
          message: error instanceof Error ? error.message : "Could not load the colony after upload.",
        });
      });
    return () => {
      cancelled = true;
    };
  }, [client, stage]);

  // D-025's verification gate. This must render through the SAME renderer as the map
  // (docs/plans/18.md): it is the only thing a human sees before `verified: true` is
  // written, so a preview drawn by a different code path is a gate that verifies an
  // artefact the map will never produce.
  useEffect(() => {
    if (stage.kind !== "ready" || !previewRef.current) return;
    const container = previewRef.current;
    container.innerHTML = "";
    return renderColonyPreview(container, stage.svg, undefined, stage.manifest.colony.id);
  }, [stage]);

  const validateAndContinue = () => {
    if (!jsonFile || !svgFile) return;
    Promise.all([jsonFile.text(), svgFile.text()])
      .then(([jsonRaw, svg]) => {
        let json: unknown;
        try {
          json = JSON.parse(jsonRaw);
        } catch {
          setStage({ kind: "parse-error", errors: [`${jsonFile.name} is not valid JSON.`] });
          return;
        }

        const schemaResult = validateColonyManifest(json);
        if (!schemaResult.ok) {
          setStage({ kind: "parse-error", errors: schemaResult.errors });
          return;
        }
        const { manifest } = schemaResult;

        if (!checkManifestVerifiedFalse(manifest)) {
          setStage({
            kind: "parse-error",
            errors: [
              `${jsonFile.name} has "verified": true — the pipeline only ever emits false; ` +
                "a true value means someone hand-edited the file.",
            ],
          });
          return;
        }

        const idsResult = checkSvgIdsAgree(manifest, svg);
        if (!idsResult.ok) {
          setStage({
            kind: "parse-error",
            errors: [
              ...idsResult.inManifestNotSvg.map((id) => `in manifest but not svg: ${id}`),
              ...idsResult.inSvgNotManifest.map((id) => `in svg but not manifest: ${id}`),
              ...idsResult.duplicates.map((id) => `duplicate svg_id in manifest: ${id}`),
            ],
          });
          return;
        }

        setConfirmed(false);
        setStage({ kind: "ready", manifest, svg });
      })
      .catch(() => {
        setStage({ kind: "parse-error", errors: ["Could not read one of the two files."] });
      });
  };

  // docs/plans/32.md, D-049: colony.json's own `backdrop` block, when present, is
  // authoritative — applied here, unconditionally, on every create and every replace,
  // before the "backdrop" stage renders. Omitting `backdrop` from the manifest must never
  // call applyManifestBackdrop's underlying write at all (its own `applied: false` early
  // return) — that is what makes "leave untouched" actually true on a routine replace.
  const upload = (manifest: ColonyManifest, svg: string, replace: boolean) => {
    setStage({ kind: "uploading", manifest, svg, replace });
    createColonyFromManifest(client, manifest, svg, replace)
      .then(async (result) => {
        if (result.ok) {
          const backdropResult = await applyManifestBackdrop(client, result.colonyId, manifest.colony.backdrop);
          const intro =
            !backdropResult.applied
              ? `Colony "${result.colonyId}" is live. Optionally set its backdrop below.`
              : backdropResult.ok
                ? `Colony "${result.colonyId}" is live. Its backdrop alignment from colony.json has been applied — attach the image below.`
                : `Colony "${result.colonyId}" is live. Could not apply colony.json's backdrop alignment (${backdropResult.message}) — set it manually below.`;
          setStage({ kind: "backdrop", colonyId: result.colonyId, intro });
        } else if (result.reason === "colony_exists") {
          // Reset — reaching this stage requires confirmed === true from the prior
          // Upload click; without this the "Replace" checkbox would arrive pre-ticked
          // and Replace would be one click away with no second act of consent
          // (/review finding, plan §3: replace must never be the default).
          setConfirmed(false);
          setStage({ kind: "exists", manifest, svg });
        } else if (result.reason === "org_mismatch") {
          // docs/plans/21.md phase 1: this colony id belongs to a different organization.
          // Not reachable in normal single-org use today — every account has exactly one
          // org, so a same-org replace never hits this. Treated as a failure, not a
          // confirmable stage, since there is nothing the user can do about it here.
          setStage({
            kind: "failed",
            message: "This colony belongs to a different organization and cannot be replaced.",
          });
        } else {
          setStage({ kind: "orphan", missingSvgIds: result.missingSvgIds });
        }
      })
      .catch((error: unknown) => {
        setStage({ kind: "failed", message: error instanceof Error ? error.message : "Upload failed." });
      });
  };

  // docs/plans/31.md: the "backdrop" stage renders ColonyBackdropScreen directly, its own
  // full overlay, instead of the shared panel below — closing it closes the whole upload
  // flow (the same `onClose` this screen already received), no separate "done" confirmation.
  if (stage.kind === "backdrop") {
    if (!backdropColony) {
      return (
        <div className="colony-upload-overlay">
          <div className="colony-upload-panel">
            <button type="button" className="colony-upload-close" aria-label="Close" onClick={onClose}>
              ×
            </button>
            <p className="colony-upload-summary">Loading…</p>
          </div>
        </div>
      );
    }
    return (
      <ColonyBackdropScreen client={client} colony={backdropColony} introMessage={stage.intro} onClose={onClose} />
    );
  }

  return (
    <div className="colony-upload-overlay">
      <div className="colony-upload-panel">
        <button type="button" className="colony-upload-close" aria-label="Close" onClick={onClose}>
          ×
        </button>
        <h2 className="colony-upload-title">Upload a colony</h2>
        <p className="colony-upload-hint">
          Choose the colony's <code>colony.json</code> and <code>colony.svg</code>, produced
          by the local pipeline.
        </p>
        <ColonyUploadStageView
          stage={stage}
          jsonFile={jsonFile}
          svgFile={svgFile}
          confirmed={confirmed}
          previewRef={previewRef}
          onJsonFile={setJsonFile}
          onSvgFile={setSvgFile}
          onContinue={validateAndContinue}
          onRetry={() => setStage({ kind: "picking" })}
          onConfirmedChange={setConfirmed}
          onUpload={upload}
        />
      </div>
    </div>
  );
}
