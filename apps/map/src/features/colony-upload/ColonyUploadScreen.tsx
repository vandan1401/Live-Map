import { useEffect, useRef, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  checkManifestVerifiedFalse,
  checkSvgIdsAgree,
  validateColonyManifest,
} from "../../lib/colony/parseColonyManifest.ts";
import { createColonyFromManifest } from "../../lib/colony/createColonyFromManifest.ts";
import { renderColonyPreview } from "../../components/map/renderColonyPreview.ts";
import type { ColonyManifest } from "../../lib/db/types.ts";
import { ColonyUploadStageView, type Stage } from "./ColonyUploadStageView.tsx";

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

  const upload = (manifest: ColonyManifest, svg: string, replace: boolean) => {
    setStage({ kind: "uploading", manifest, svg, replace });
    createColonyFromManifest(client, manifest, svg, replace)
      .then((result) => {
        if (result.ok) {
          setStage({ kind: "done", colonyId: result.colonyId });
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
          onDone={onClose}
        />
      </div>
    </div>
  );
}
