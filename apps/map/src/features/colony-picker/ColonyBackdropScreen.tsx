import { useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { ColonyRow } from "../../lib/db/types.ts";
import {
  uploadColonyBackdropImage,
  updateColonyBackdropTransform,
  isJpegBuffer,
} from "../../lib/colony/colonyBackdrop.ts";

interface Props {
  client: SupabaseClient;
  colony: ColonyRow;
  onClose: () => void;
}

// Same "paint immediately, decode async" primitive admin-portal/static/backdropEditor.js's
// readImageDimensions already used — ported to TypeScript since this runs inside React, not
// a plain script (docs/plans/30.md).
function readImageDimensions(file: File): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve({ width: img.naturalWidth, height: img.naturalHeight });
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Could not read image dimensions."));
    };
    img.src = url;
  });
}

// docs/plans/30.md: reachable from ColonyPicker.tsx (any signed-in org member, D-007 — no
// role gating), calling lib/colony/colonyBackdrop.ts's two functions directly with the
// authenticated app client, relying on that migration's Storage/colonies RLS. Reuses
// colony-upload.css's overlay classes — same full-screen-panel shape as
// ColonyUploadScreen.tsx, no new CSS.
export function ColonyBackdropScreen({ client, colony, onClose }: Props) {
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<{ message: string; isError: boolean } | null>(null);

  // Held as strings, parsed once on submit (handleSaveAlignment) — not per keystroke.
  // A controlled <input type="number"> parsed on every onChange (a first cut of this
  // screen did this) turns a momentarily-empty field into Number("") === 0 immediately,
  // silently committing 0 to state, and makes typing a leading "-" into a pre-filled field
  // impossible (it round-trips through "" -> 0 first) — a real /review finding, 2026-09-12:
  // "a cleared field saving as 0 is a silent wrong write" on a screen whose only job is
  // entering these numbers correctly. admin-portal/static/backdropEditor.js's plain
  // uncontrolled inputs never had this problem for the same reason (value read once, at
  // submit) — this mirrors that.
  const [x, setX] = useState(String(colony.backdrop_transform_x));
  const [y, setY] = useState(String(colony.backdrop_transform_y));
  const [scale, setScale] = useState(String(colony.backdrop_transform_scale));
  const [rotateDeg, setRotateDeg] = useState(String(colony.backdrop_transform_rotate_deg));
  const [darkenAlpha, setDarkenAlpha] = useState(String(colony.backdrop_darken_alpha));
  const [enabledOnAdmin, setEnabledOnAdmin] = useState(colony.backdrop_enabled_on_admin);
  const [enabledOnPublic, setEnabledOnPublic] = useState(colony.backdrop_enabled_on_public);
  const [attribution, setAttribution] = useState(colony.backdrop_attribution);

  const handleUpload = async () => {
    if (!file) return;
    setBusy(true);
    setStatus(null);
    try {
      const head = new Uint8Array(await file.slice(0, 3).arrayBuffer());
      if (!isJpegBuffer(head)) {
        setStatus({ message: "That file is not a JPEG.", isError: true });
        return;
      }
      const { width, height } = await readImageDimensions(file);
      const bytes = new Uint8Array(await file.arrayBuffer());
      await uploadColonyBackdropImage(client, colony.id, { bytes, imageWidth: width, imageHeight: height });
      setStatus({ message: "Backdrop image uploaded.", isError: false });
    } catch (error) {
      setStatus({ message: error instanceof Error ? error.message : "Upload failed.", isError: true });
    } finally {
      setBusy(false);
    }
  };

  const handleSaveAlignment = async () => {
    setBusy(true);
    setStatus(null);
    try {
      await updateColonyBackdropTransform(client, colony.id, {
        x: Number(x),
        y: Number(y),
        scale: Number(scale),
        rotateDeg: Number(rotateDeg),
        darkenAlpha: Number(darkenAlpha),
        enabledOnAdmin,
        enabledOnPublic,
        attribution,
      });
      setStatus({ message: "Alignment saved.", isError: false });
    } catch (error) {
      setStatus({ message: error instanceof Error ? error.message : "Save failed.", isError: true });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="colony-upload-overlay">
      <div className="colony-upload-panel">
        <button type="button" className="colony-upload-close" aria-label="Close" onClick={onClose}>
          ×
        </button>
        <h2 className="colony-upload-title">Backdrop — {colony.name}</h2>
        <p className="colony-upload-hint">
          A synthetic aerial photo shown under this colony's plots. Optional — most colonies
          have none.
        </p>

        <label className="colony-upload-field">
          Backdrop image (JPEG)
          <input
            type="file"
            accept="image/jpeg"
            aria-label="Choose backdrop image"
            onChange={(event) => setFile(event.target.files?.[0] ?? null)}
          />
        </label>
        <button
          type="button"
          className="colony-upload-continue"
          disabled={!file || busy}
          onClick={() => void handleUpload()}
        >
          Upload image
        </button>

        <label className="colony-upload-field">
          x
          <input type="number" step="any" value={x} onChange={(event) => setX(event.target.value)} />
        </label>
        <label className="colony-upload-field">
          y
          <input type="number" step="any" value={y} onChange={(event) => setY(event.target.value)} />
        </label>
        <label className="colony-upload-field">
          scale
          <input type="number" step="any" value={scale} onChange={(event) => setScale(event.target.value)} />
        </label>
        <label className="colony-upload-field">
          rotate (deg)
          <input
            type="number"
            step="any"
            value={rotateDeg}
            onChange={(event) => setRotateDeg(event.target.value)}
          />
        </label>
        <label className="colony-upload-field">
          darken alpha
          <input
            type="number"
            step="any"
            min={0}
            max={1}
            value={darkenAlpha}
            onChange={(event) => setDarkenAlpha(event.target.value)}
          />
        </label>
        <label className="colony-upload-confirm-check">
          <input
            type="checkbox"
            checked={enabledOnAdmin}
            onChange={(event) => setEnabledOnAdmin(event.target.checked)}
          />
          Enabled on admin map
        </label>
        <label className="colony-upload-confirm-check">
          <input
            type="checkbox"
            checked={enabledOnPublic}
            onChange={(event) => setEnabledOnPublic(event.target.checked)}
          />
          Enabled on public link
        </label>
        <label className="colony-upload-field">
          Attribution
          <input type="text" value={attribution} onChange={(event) => setAttribution(event.target.value)} />
        </label>
        <button type="button" className="colony-upload-confirm" disabled={busy} onClick={() => void handleSaveAlignment()}>
          Save alignment
        </button>

        {status && (
          <p className={status.isError ? "colony-upload-error" : "colony-upload-summary"}>{status.message}</p>
        )}
      </div>
    </div>
  );
}
