// docs/plans/29.md: the two colony-backdrop admin-portal routes, split out of server.ts
// (invariant 7, 250-line cap). Returns false for any pathname/method it doesn't own, so
// server.ts's handleApi falls through to its own 404 for everything else.
import type { IncomingMessage, ServerResponse } from "node:http";
import type { SupabaseClient } from "@supabase/supabase-js";
import { uploadColonyBackdropImage, updateColonyBackdropTransform, isJpegBuffer } from "../src/lib/colony/colonyBackdrop.ts";
import { HttpError, sendJson, readJsonBody, requireString, requireStringAllowEmpty, requireNumber, requireBoolean } from "./httpHelpers.ts";

// docs/plans/29.md: 15MB is >25x the real shipped bharatkshetra.jpg (535KB) — generous
// headroom for a bigger colony's aerial photo, small enough that a wrong-file mistake fails
// fast instead of hanging this local, single-threaded process on a huge body.
const MAX_BACKDROP_UPLOAD_BYTES = 15_000_000;

// Rejects on the request's own Content-Length header, BEFORE readJsonBody streams the
// whole body into memory and Buffer.from() base64-decodes it — checking only the decoded
// byte length (as the first cut of this route did) still fully buffers and decodes an
// oversized body first, which is exactly the hang this guard exists to prevent (/review
// finding, 2026-09-12). *1.4 covers base64's ~1.33x inflation plus the small JSON-wrapper
// overhead (field names, quoting) around the imageBase64 string.
function rejectIfTooLarge(req: IncomingMessage): void {
  const contentLength = Number(req.headers["content-length"] ?? 0);
  if (contentLength > MAX_BACKDROP_UPLOAD_BYTES * 1.4) {
    throw new HttpError(400, `Request body exceeds the ${MAX_BACKDROP_UPLOAD_BYTES}-byte image limit.`);
  }
}

export async function handleBackdropRoute(
  req: IncomingMessage,
  res: ServerResponse,
  pathname: string,
  method: string,
  client: SupabaseClient,
): Promise<boolean> {
  const backdropImageMatch = /^\/api\/colonies\/([^/]+)\/backdrop-image$/.exec(pathname);
  if (backdropImageMatch && method === "POST") {
    rejectIfTooLarge(req);
    const body = await readJsonBody(req);
    const imageBase64 = requireString(body, "imageBase64");
    const imageWidth = requireNumber(body, "imageWidth");
    const imageHeight = requireNumber(body, "imageHeight");
    const bytes = Buffer.from(imageBase64, "base64");
    if (!isJpegBuffer(bytes)) {
      throw new HttpError(400, "Uploaded file is not a JPEG.");
    }
    if (bytes.length > MAX_BACKDROP_UPLOAD_BYTES) {
      throw new HttpError(400, `Uploaded file exceeds the ${MAX_BACKDROP_UPLOAD_BYTES}-byte limit.`);
    }
    await uploadColonyBackdropImage(client, backdropImageMatch[1], { bytes, imageWidth, imageHeight });
    sendJson(res, 200, { ok: true });
    return true;
  }

  const backdropMatch = /^\/api\/colonies\/([^/]+)\/backdrop$/.exec(pathname);
  if (backdropMatch && method === "PATCH") {
    const body = await readJsonBody(req);
    await updateColonyBackdropTransform(client, backdropMatch[1], {
      x: requireNumber(body, "x"),
      y: requireNumber(body, "y"),
      scale: requireNumber(body, "scale"),
      rotateDeg: requireNumber(body, "rotateDeg"),
      darkenAlpha: requireNumber(body, "darkenAlpha"),
      enabledOnAdmin: requireBoolean(body, "enabledOnAdmin"),
      enabledOnPublic: requireBoolean(body, "enabledOnPublic"),
      attribution: requireStringAllowEmpty(body, "attribution"),
    });
    sendJson(res, 200, { ok: true });
    return true;
  }

  return false;
}
