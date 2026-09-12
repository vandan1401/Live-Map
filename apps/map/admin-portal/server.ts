// docs/plans/23.md phase 3: the admin portal. Local-only, owner-run, never deployed — same
// posture tools/pipeline/ui/server.py already established (127.0.0.1 only, never started by
// Claude; see .claude/hooks/guard.sh and CLAUDE.md's "Never run" list). Lives outside src/
// on purpose: nothing under src/ imports this directory, so `pnpm build`'s Vite bundle
// never includes it — confirmed by grepping dist/ after a build, not assumed.
//
// Plain node:http, no new dependency — same "Node's built-in" posture
// scripts/generate-public-link.ts already established for crypto.randomUUID(). Run via
// `pnpm admin-portal` (owner only) or `make admin-portal` from the repo root.
//
// No login/auth layer: whoever can run this locally already holds
// SUPABASE_SERVICE_ROLE_KEY in .env, which is full admin access to that Supabase project
// regardless of this tool. Every mutating route does require `Content-Type: application/
// json`, a cheap CSRF mitigation — a stray cross-site form POST cannot forge that header
// without script access this same-origin page already controls.

import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { createDbClient } from "../src/lib/db/client.ts";
import { fetchColoniesByOrg } from "../src/lib/db/colonies.ts";
import { fetchOrganizations, insertOrganization } from "../src/lib/db/organizations.ts";
import { regeneratePublicLink, revokePublicLink } from "../src/lib/colony/publicColony.ts";
import { createOrgUser, InvalidUsernameError, listOrgUsers, reassignUserOrg } from "./actions.ts";
import { handleBackdropRoute } from "./backdropRoutes.ts";
import { HttpError, sendJson, sendError, requireJsonContentType, readJsonBody, requireString } from "./httpHelpers.ts";

declare const process: NodeJS.Process & { loadEnvFile?: (path?: string) => void };
try {
  process.loadEnvFile?.();
} catch {
  // No .env file — fall through to whatever is already in the environment.
}

const PORT = 5002; // tools/pipeline/ui/ already owns 5001.
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

async function handleApi(req: IncomingMessage, res: ServerResponse, pathname: string, client: ReturnType<typeof createDbClient>): Promise<void> {
  const method = req.method ?? "GET";
  if (method !== "GET") requireJsonContentType(req);

  if (pathname === "/api/organizations" && method === "GET") {
    sendJson(res, 200, { ok: true, organizations: await fetchOrganizations(client) });
    return;
  }
  if (pathname === "/api/organizations" && method === "POST") {
    const body = await readJsonBody(req);
    const org = await insertOrganization(client, requireString(body, "name"));
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

  if (pathname === "/api/users" && method === "POST") {
    const body = await readJsonBody(req);
    const created = await createOrgUser(client, {
      username: requireString(body, "username"),
      password: requireString(body, "password"),
      displayName: requireString(body, "displayName"),
      orgId: requireString(body, "orgId"),
    });
    sendJson(res, 200, { ok: true, user: created });
    return;
  }

  const userMatch = /^\/api\/users\/([^/]+)$/.exec(pathname);
  if (userMatch && method === "PATCH") {
    const body = await readJsonBody(req);
    await reassignUserOrg(client, userMatch[1], requireString(body, "orgId"));
    sendJson(res, 200, { ok: true });
    return;
  }

  const publicLinkMatch = /^\/api\/colonies\/([^/]+)\/public-link$/.exec(pathname);
  if (publicLinkMatch && method === "POST") {
    const result = await regeneratePublicLink(client, publicLinkMatch[1]);
    if (!result.ok) {
      sendError(res, 404, `no colony with id "${publicLinkMatch[1]}".`);
      return;
    }
    sendJson(res, 200, { ok: true, token: result.token });
    return;
  }
  if (publicLinkMatch && method === "DELETE") {
    await revokePublicLink(client, publicLinkMatch[1]);
    sendJson(res, 200, { ok: true });
    return;
  }

  // docs/plans/29.md: backdrop-image/backdrop routes, split into their own module
  // (invariant 7) — returns false for anything it doesn't own.
  if (await handleBackdropRoute(req, res, pathname, method, client)) return;

  sendError(res, 404, `no route for ${method} ${pathname}`);
}

function main(): void {
  const url = process.env.VITE_SUPABASE_URL ?? "";
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
  if (!url || !serviceRoleKey) {
    console.error(
      "admin-portal: VITE_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set (see .env.example).",
    );
    process.exitCode = 1;
    return;
  }
  const client = createDbClient(url, serviceRoleKey);

  const server = createServer((req, res) => {
    void (async () => {
      const pathname = new URL(req.url ?? "/", `http://${req.headers.host ?? "127.0.0.1"}`).pathname;
      try {
        if (pathname.startsWith("/api/")) {
          await handleApi(req, res, pathname, client);
        } else if (req.method === "GET") {
          await serveStatic(res, pathname);
        } else {
          sendError(res, 404, "not found");
        }
      } catch (err) {
        if (err instanceof HttpError) {
          sendError(res, err.status, err.message);
        } else if (err instanceof InvalidUsernameError) {
          sendError(res, 400, err.message);
        } else {
          sendError(res, 500, err instanceof Error ? err.message : String(err));
        }
      }
    })();
  });

  server.listen(PORT, "127.0.0.1", () => {
    console.log(`admin portal listening on http://127.0.0.1:${PORT}`);
  });
}

main();
