import type { RefObject } from "react";
import type { ColonyManifest } from "../../lib/db/types.ts";

export type Stage =
  | { kind: "picking" }
  | { kind: "parse-error"; errors: string[] }
  | { kind: "ready"; manifest: ColonyManifest; svg: string }
  | { kind: "uploading"; manifest: ColonyManifest; svg: string; replace: boolean }
  | { kind: "exists"; manifest: ColonyManifest; svg: string }
  | { kind: "orphan"; missingSvgIds: string[] }
  | { kind: "done"; colonyId: string }
  | { kind: "failed"; message: string };

interface Props {
  stage: Stage;
  jsonFile: File | null;
  svgFile: File | null;
  confirmed: boolean;
  previewRef: RefObject<HTMLDivElement | null>;
  onJsonFile: (file: File | null) => void;
  onSvgFile: (file: File | null) => void;
  onContinue: () => void;
  onRetry: () => void;
  onConfirmedChange: (value: boolean) => void;
  onUpload: (manifest: ColonyManifest, svg: string, replace: boolean) => void;
  onDone: () => void;
}

// Pure rendering per Stage — split out of ColonyUploadScreen.tsx to stay under the
// 250-line cap (invariant 7). ColonyUploadScreen.tsx owns all the state and side effects;
// this file only ever reads props.
export function ColonyUploadStageView({
  stage,
  jsonFile,
  svgFile,
  confirmed,
  previewRef,
  onJsonFile,
  onSvgFile,
  onContinue,
  onRetry,
  onConfirmedChange,
  onUpload,
  onDone,
}: Props) {
  if (stage.kind === "picking") {
    return (
      <>
        <label className="colony-upload-field">
          colony.json
          <input
            type="file"
            accept=".json"
            aria-label="Choose colony.json"
            onChange={(event) => onJsonFile(event.target.files?.[0] ?? null)}
          />
        </label>
        <label className="colony-upload-field">
          colony.svg
          <input
            type="file"
            accept=".svg"
            aria-label="Choose colony.svg"
            onChange={(event) => onSvgFile(event.target.files?.[0] ?? null)}
          />
        </label>
        <button
          type="button"
          className="colony-upload-continue"
          disabled={!jsonFile || !svgFile}
          onClick={onContinue}
        >
          Continue
        </button>
      </>
    );
  }

  if (stage.kind === "parse-error") {
    return (
      <>
        <p className="colony-upload-error">These files could not be used:</p>
        <ul className="colony-upload-error-list">
          {stage.errors.map((error) => (
            <li key={error}>{error}</li>
          ))}
        </ul>
        <button type="button" className="colony-upload-retry" onClick={onRetry}>
          Choose other files
        </button>
      </>
    );
  }

  if (stage.kind === "ready") {
    // A blockless plot (contract/SPEC.md, docs/plans/15.md) carries block: "" — drop it
    // from the set so it doesn't show as a stray blank entry between commas.
    const blocks = [...new Set(stage.manifest.plots.map((p) => p.block))]
      .filter((block) => block !== "")
      .sort();
    return (
      <>
        <p className="colony-upload-summary">
          {stage.manifest.colony.name} — {stage.manifest.plots.length} plot(s)
          {blocks.length > 0 && <>, blocks {blocks.join(", ")}</>}
        </p>
        <div ref={previewRef} className="colony-upload-preview" />
        <label className="colony-upload-confirm-check">
          <input
            type="checkbox"
            checked={confirmed}
            onChange={(event) => onConfirmedChange(event.target.checked)}
          />
          I compared this against the site plan
        </label>
        <button
          type="button"
          className="colony-upload-confirm"
          disabled={!confirmed}
          onClick={() => onUpload(stage.manifest, stage.svg, false)}
        >
          Upload
        </button>
      </>
    );
  }

  if (stage.kind === "uploading") {
    return <p className="colony-upload-summary">Uploading…</p>;
  }

  if (stage.kind === "exists") {
    return (
      <>
        <p className="colony-upload-error">
          A colony with id "{stage.manifest.colony.id}" already exists.
        </p>
        <label className="colony-upload-confirm-check">
          <input
            type="checkbox"
            checked={confirmed}
            onChange={(event) => onConfirmedChange(event.target.checked)}
          />
          Replace this colony's geometry with this file
        </label>
        <button
          type="button"
          className="colony-upload-confirm"
          disabled={!confirmed}
          onClick={() => onUpload(stage.manifest, stage.svg, true)}
        >
          Replace
        </button>
      </>
    );
  }

  if (stage.kind === "orphan") {
    return (
      <>
        <p className="colony-upload-error">
          This file is missing plot(s) that already have history: {stage.missingSvgIds.join(", ")}.
          Re-cut the DXF to include them and try again.
        </p>
        <button type="button" className="colony-upload-retry" onClick={onRetry}>
          Choose other files
        </button>
      </>
    );
  }

  if (stage.kind === "done") {
    return (
      <>
        <p className="colony-upload-summary">"{stage.colonyId}" is live.</p>
        <button type="button" className="colony-upload-confirm" onClick={onDone}>
          Done
        </button>
      </>
    );
  }

  return <p className="colony-upload-error">{stage.message}</p>;
}
