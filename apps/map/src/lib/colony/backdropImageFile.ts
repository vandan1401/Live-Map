// docs/plans/33.md: split out of colonyBackdrop.ts on purpose — these two functions use
// browser-only globals (Image, URL.createObjectURL), and colonyBackdrop.ts is also
// imported by admin-portal/backdropRoutes.ts, which runs under tsconfig.node.json's
// Node-only lib (no DOM). Keeping DOM-dependent code out of colonyBackdrop.ts is what
// keeps that shared file typecheckable from both a browser and a plain Node script.
import { detectImageFormat, type ImageFormat } from "./colonyBackdrop.ts";

// docs/plans/30.md's original ColonyBackdropScreen.tsx primitive (paint immediately, decode
// async), moved here (docs/plans/33.md) so the inline picker on ColonyUploadScreen.tsx's
// picking stage can share it instead of duplicating it.
export function readImageDimensions(file: File): Promise<{ width: number; height: number }> {
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

export interface BackdropImageFile {
  bytes: Uint8Array;
  imageWidth: number;
  imageHeight: number;
  format: ImageFormat;
}

// docs/plans/33.md + docs/plans/34.md (any image format, not JPEG-only): the "read the
// first bytes, detect the format, read full bytes, read dimensions" sequence a caller
// needs before calling uploadColonyBackdropImage — one throwing call instead of a
// {message, isError} shape to unpack, so both ColonyUploadScreen.tsx's inline picker and
// any future caller share one code path. 12 bytes is the longest magic number this
// project's detectImageFormat checks (WebP's RIFF....WEBP).
export async function readBackdropImageFile(file: File): Promise<BackdropImageFile> {
  const head = new Uint8Array(await file.slice(0, 12).arrayBuffer());
  const format = detectImageFormat(head);
  if (!format) {
    throw new Error("That file is not a recognized image format (JPEG, PNG, WebP, or GIF).");
  }
  const { width, height } = await readImageDimensions(file);
  const bytes = new Uint8Array(await file.arrayBuffer());
  return { bytes, imageWidth: width, imageHeight: height, format };
}
