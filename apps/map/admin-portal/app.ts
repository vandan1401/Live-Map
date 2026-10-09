// docs/plans/23.md phase 3 + docs/plans/36.md: the admin portal's request handling. Split from
// server.ts (the process entry point) so tests can drive it over a real HTTP socket without
// the entry point's side effects. Every /api route except POST /api/login requires a valid
// access token belonging to a super_admin; every mutating route is audited.
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { readFile } from "node:fs/promises";
import path from "node:path";
import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchColoniesByOrg } from "../src/lib/db/colonies.ts";
import { fetchOrganizations, insertOrganization } from "../src/lib/db/organizations.ts";
import { regeneratePublicLink, revokePublicLink } from "../src/lib/colony/publicColony.ts";
import { InvalidUsernameError, listOrgUsers } from "./actions.ts";
import { authenticate, createLoginThrottle, loginWithPassword, sourceIp } from "./auth.ts";
import { audited, recordAudit } from "./auditLog.ts";
import { handleBackdropRoute } from "./backdropRoutes.ts";
import { HttpError, sendJson, sendError, requireJsonContentType, readJsonBody, requireString } from "./httpHelpers.ts";
import { auditEntry, handleUserRoute, type RouteContext } from "./userRoutes.ts";

export interface AdminConfig {
  supabaseUrl: string;
  anonKey: string;
}

type Throttle = ReturnType<typeof createLoginThrottle>;

const STATIC_DIR = path.resolve(import.meta.dirname, "static");

async function serveStatic(res: ServerResponse, pathname: string): Promise<void> {
  const relative = pathname === "/" ? "index.html" : pathname.replace(/^\/+/, "");
  const resolved = path.resolve(STATIC_DIR, relative);
  if (!resolved.startsWith(STATIC_DIR)) {
    sendError(res, 400, "invalid path");
    return;
  }
  try {
    const body = await readFile(resolved);
    const ext = path.extname(resolved);
    const contentType =
      ext === ".html" ? "text/html" : ext === ".js" ? "text/javascript" : ext === ".css" ? "text/css" : "application/octet-stream";
    res.writeHead(200, { "Content-Type": contentType });
    res.end(body);
  } catch {
    sendError(res, 404, "not found");
  }
}

async function handleLogin(req: IncomingMessage, res: ServerResponse, client: SupabaseClient, cfg: AdminConfig, throttle: Throttle): Promise<void> {
  const ip = sourceIp(req);
  const body = await readJsonBody(req);
  const username = requireString(body, "username");
  const password = requireString(body, "password");
  const entry = { actor: { id: null as string | null, name: null as string | null }, sourceIp: ip, action: "login", detail: { username } };
  // Fail-closed: if the audit row cannot be written, no token is issued.
  const record = async (outcome: "ok" | "denied", reason?: string, actor?: { id: string; name: string }) => {
    try {
      await recordAudit(client, actor ? { ...entry, actor } : entry, outcome, reason ? { reason } : undefined);
    } catch {
      throw new HttpError(500, "The audit log is unavailable, so sign-in is refused.");
    }
  };
  if (throttle.isBlocked(ip)) {
    await record("denied", "throttled");
    throw new HttpError(429, "Too many failed sign-ins — try again in 15 minutes.");
  }
  // Counted BEFORE the sign-in: counting after would let a burst of parallel requests all pass
  // the isBlocked() check above. A success clears the counter again below.
  throttle.recordFailure(ip);
  const result = await loginWithPassword(cfg.supabaseUrl, cfg.anonKey, username, password);
  if (!result) {
    await record("denied", "bad credentials");
    throw new HttpError(401, "Wrong username or password.");
  }
  if (!result.actor.isSuperAdmin) {
    await record("denied", "not a super admin", result.actor);
    throw new HttpError(403, "This account is not allowed to use the admin portal.");
  }
  throttle.clear(ip);
  await record("ok", undefined, result.actor);
  sendJson(res, 200, { ok: true, accessToken: result.accessToken, expiresAt: result.expiresAt, name: result.actor.name });
}

async function handleApi(req: IncomingMessage, res: ServerResponse, url: URL, client: SupabaseClient, cfg: AdminConfig, throttle: Throttle): Promise<void> {
  const method = req.method ?? "GET";
  const pathname = url.pathname;
  if (method !== "GET") requireJsonContentType(req);

  if (pathname === "/api/login" && method === "POST") {
    await handleLogin(req, res, client, cfg, throttle);
    return;
  }

  const actor = await authenticate(req, client);
  const ip = sourceIp(req);
  if (!actor.isSuperAdmin) {
    await recordAudit(client, { actor: { id: actor.id, name: actor.name }, sourceIp: ip, action: "api_access", detail: { method, path: pathname } }, "denied").catch(() => undefined);
    throw new HttpError(403, "This account is not allowed to use the admin portal.");
  }
  const ctx: RouteContext = { actor, ip };

  if (pathname === "/api/organizations" && method === "GET") {
    sendJson(res, 200, { ok: true, organizations: await fetchOrganizations(client) });
    return;
  }
  if (pathname === "/api/organizations" && method === "POST") {
    const name = requireString(await readJsonBody(req), "name");
    const org = await audited(client, auditEntry(ctx, "create_org", "organization", undefined, { name }), () => insertOrganization(client, name));
    sendJson(res, 200, { ok: true, organization: org });
    return;
  }

  const usersMatch = /^\/api\/organizations\/([^/]+)\/users$/.exec(pathname);
  if (usersMatch && method === "GET") {
    sendJson(res, 200, { ok: true, users: await listOrgUsers(client, usersMatch[1]) });
    return;
  }
  const coloniesMatch = /^\/api\/organizations\/([^/]+)\/colonies$/.exec(pathname);
  if (coloniesMatch && method === "GET") {
    sendJson(res, 200, { ok: true, colonies: await fetchColoniesByOrg(client, coloniesMatch[1]) });
    return;
  }

  if (await handleUserRoute(req, res, url, method, client, ctx)) return;

  const publicLinkMatch = /^\/api\/colonies\/([^/]+)\/public-link$/.exec(pathname);
  if (publicLinkMatch && method === "POST") {
    const colonyId = publicLinkMatch[1];
    const result = await audited(client, auditEntry(ctx, "regenerate_public_link", "colony", colonyId), async () => {
      const regenerated = await regeneratePublicLink(client, colonyId);
      if (!regenerated.ok) throw new HttpError(404, `no colony with id "${colonyId}".`);
      return regenerated;
    });
    sendJson(res, 200, { ok: true, token: result.token });
    return;
  }
  if (publicLinkMatch && method === "DELETE") {
    const colonyId = publicLinkMatch[1];
    await audited(client, auditEntry(ctx, "revoke_public_link", "colony", colonyId), () => revokePublicLink(client, colonyId));
    sendJson(res, 200, { ok: true });
    return;
  }

  // docs/plans/29.md backdrop routes. Only the methods the handler owns are audited; the
  // handler does the work and this code answers after the audit result row is written.
  const backdropMatch = /^\/api\/colonies\/([^/]+)\/backdrop(-image)?$/.exec(pathname);
  if (backdropMatch && method === (backdropMatch[2] ? "POST" : "PATCH")) {
    const colonyId = backdropMatch[1];
    const action = backdropMatch[2] ? "upload_backdrop_image" : "update_backdrop";
    await audited(client, auditEntry(ctx, action, "colony", colonyId), () =>
      handleBackdropRoute(req, pathname, method, client),
    );
    sendJson(res, 200, { ok: true });
    return;
  }

  sendError(res, 404, `no route for ${method} ${pathname}`);
}

export function createAdminServer(client: SupabaseClient, cfg: AdminConfig): Server {
  const throttle = createLoginThrottle();
  return createServer((req, res) => {
    void (async () => {
      const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "127.0.0.1"}`);
      try {
        if (url.pathname.startsWith("/api/")) {
          await handleApi(req, res, url, client, cfg, throttle);
        } else if (req.method === "GET") {
          await serveStatic(res, url.pathname);
        } else {
          sendError(res, 404, "not found");
        }
      } catch (err) {
        if (res.headersSent) {
          // A route already answered (the backdrop handlers write their own response) and only
          // the trailing audit row failed; the response cannot be changed any more.
          console.error("admin-portal: error after the response was sent:", err);
          res.end();
        } else if (err instanceof HttpError) {
          sendError(res, err.status, err.message);
        } else if (err instanceof InvalidUsernameError) {
          sendError(res, 400, err.message);
        } else {
          sendError(res, 500, err instanceof Error ? err.message : String(err));
        }
      }
    })();
  });
}
