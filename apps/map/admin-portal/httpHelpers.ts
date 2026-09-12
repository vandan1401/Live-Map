// docs/plans/29.md: split out of server.ts (invariant 7, 250-line cap) — the small,
// dependency-free HTTP primitives every route handler in this admin portal shares (this
// file, `server.ts`, and `backdropRoutes.ts` alike).
import type { IncomingMessage, ServerResponse } from "node:http";

export class HttpError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export function sendJson(res: ServerResponse, status: number, body: unknown): void {
  const payload = JSON.stringify(body);
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(payload);
}

// Errors reach the operator as a sentence, not a stack trace — same posture
// tools/pipeline/ui/server.py already established for this same audience (an owner at a
// terminal), carried over even though this is Tier 1 code.
export function sendError(res: ServerResponse, status: number, message: string): void {
  sendJson(res, status, { ok: false, error: message });
}

// The CSRF mitigation pinned in docs/plans/23.md §3 — a cross-site form POST/DELETE/PATCH
// cannot forge this header without script access this same-origin page already controls.
// Checked for every mutating route, including the body-less public-link ones (/review,
// 2026-08-31 — the check originally lived only inside readJsonBody, which those routes
// never call, so they were unprotected despite the file's own header comment claiming
// otherwise).
export function requireJsonContentType(req: IncomingMessage): void {
  const contentType = req.headers["content-type"] ?? "";
  if (!contentType.startsWith("application/json")) {
    throw new HttpError(415, "Content-Type must be application/json.");
  }
}

// Caller already calls requireJsonContentType for every non-GET method before dispatching,
// so this only ever parses a body already known to be application/json.
export async function readJsonBody(req: IncomingMessage): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(chunk as Buffer);
  const raw = Buffer.concat(chunks).toString("utf8");
  if (!raw) return {};
  try {
    return JSON.parse(raw) as Record<string, unknown>;
  } catch {
    throw new HttpError(400, "Request body is not valid JSON.");
  }
}

export function requireString(body: Record<string, unknown>, field: string): string {
  const value = body[field];
  if (typeof value !== "string" || value.length === 0) {
    throw new HttpError(400, `"${field}" is required.`);
  }
  return value;
}

// Like requireString, but an empty string is a valid value — for a field like a backdrop's
// attribution credit, where "no attribution yet" (the empty-string column default) is a
// real, allowed state, not a missing-input error.
export function requireStringAllowEmpty(body: Record<string, unknown>, field: string): string {
  const value = body[field];
  if (typeof value !== "string") {
    throw new HttpError(400, `"${field}" must be a string.`);
  }
  return value;
}

export function requireNumber(body: Record<string, unknown>, field: string): number {
  const value = body[field];
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new HttpError(400, `"${field}" must be a number.`);
  }
  return value;
}

export function requireBoolean(body: Record<string, unknown>, field: string): boolean {
  const value = body[field];
  if (typeof value !== "boolean") {
    throw new HttpError(400, `"${field}" must be a boolean.`);
  }
  return value;
}
