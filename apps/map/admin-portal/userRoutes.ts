// docs/plans/36.md: the user-management and audit-log routes, split out of server.ts
// (invariant 7). Returns false for anything it doesn't own. Every mutating action runs inside
// audited() so an 'attempt' row exists before it and an 'ok'/'error' row after it.
import type { IncomingMessage, ServerResponse } from "node:http";
import type { SupabaseClient } from "@supabase/supabase-js";
import { usernameToEmail } from "../src/lib/auth/username.ts";
import {
  createOrgUser,
  deleteUser,
  listAllUsers,
  loadManageableUser,
  reassignUserOrg,
  resetUserPassword,
  setUserActive,
  validatePassword,
} from "./actions.ts";
import type { AdminActor } from "./auth.ts";
import { audited, listAuditLog, type AuditEntry } from "./auditLog.ts";
import { HttpError, readJsonBody, requireBoolean, requireString, sendJson } from "./httpHelpers.ts";

export interface RouteContext {
  actor: AdminActor;
  ip: string;
}

export function auditEntry(
  ctx: RouteContext,
  action: string,
  targetType?: string,
  targetId?: string,
  detail?: Record<string, unknown>,
): AuditEntry {
  return {
    actor: { id: ctx.actor.id, name: ctx.actor.name },
    sourceIp: ctx.ip,
    action,
    targetType,
    targetId,
    detail,
  };
}

function numberParam(url: URL, name: string): number | undefined {
  const raw = url.searchParams.get(name);
  if (raw === null || raw === "") return undefined;
  const value = Number(raw);
  if (!Number.isFinite(value)) throw new HttpError(400, `"${name}" must be a number.`);
  return value;
}

export async function handleUserRoute(
  req: IncomingMessage,
  res: ServerResponse,
  url: URL,
  method: string,
  client: SupabaseClient,
  ctx: RouteContext,
): Promise<boolean> {
  const pathname = url.pathname;

  if (pathname === "/api/audit-log" && method === "GET") {
    const rows = await listAuditLog(client, { limit: numberParam(url, "limit"), beforeId: numberParam(url, "before_id") });
    sendJson(res, 200, { ok: true, rows });
    return true;
  }

  if (pathname === "/api/users" && method === "GET") {
    sendJson(res, 200, { ok: true, users: await listAllUsers(client) });
    return true;
  }

  if (pathname === "/api/users" && method === "POST") {
    const body = await readJsonBody(req);
    const username = requireString(body, "username");
    const password = requireString(body, "password");
    const displayName = requireString(body, "displayName");
    const orgId = requireString(body, "orgId");
    usernameToEmail(username); // 400 (via InvalidUsernameError) before any audit row
    validatePassword(password);
    const created = await audited(client, auditEntry(ctx, "create_user", "user", undefined, { username, orgId }), () =>
      createOrgUser(client, { username, password, displayName, orgId }),
    );
    sendJson(res, 200, { ok: true, user: created });
    return true;
  }

  const userMatch = /^\/api\/users\/([^/]+)(?:\/(password|active|delete))?$/.exec(pathname);
  if (!userMatch) return false;
  const [, userId, sub] = userMatch;

  if (!sub && method === "PATCH") {
    const body = await readJsonBody(req);
    const orgId = requireString(body, "orgId");
    await audited(client, auditEntry(ctx, "reassign_user_org", "user", userId, { orgId }), async () => {
      await loadManageableUser(client, ctx.actor.id, userId, false);
      await reassignUserOrg(client, userId, orgId);
    });
    sendJson(res, 200, { ok: true });
    return true;
  }

  if (sub === "password" && method === "POST") {
    const body = await readJsonBody(req);
    const password = requireString(body, "password");
    validatePassword(password);
    await audited(client, auditEntry(ctx, "reset_password", "user", userId), async () => {
      await loadManageableUser(client, ctx.actor.id, userId, true);
      await resetUserPassword(client, userId, password);
    });
    sendJson(res, 200, { ok: true });
    return true;
  }

  if (sub === "active" && method === "POST") {
    const body = await readJsonBody(req);
    const active = requireBoolean(body, "active");
    await audited(client, auditEntry(ctx, active ? "reactivate_user" : "deactivate_user", "user", userId), async () => {
      await loadManageableUser(client, ctx.actor.id, userId, false);
      await setUserActive(client, userId, active);
    });
    sendJson(res, 200, { ok: true });
    return true;
  }

  if (sub === "delete" && method === "POST") {
    const body = await readJsonBody(req);
    const confirmUsername = requireString(body, "confirmUsername");
    await audited(client, auditEntry(ctx, "delete_user", "user", userId, { confirmUsername }), async () => {
      const target = await loadManageableUser(client, ctx.actor.id, userId, false);
      let confirmedEmail = "";
      try {
        confirmedEmail = usernameToEmail(confirmUsername);
      } catch {
        // falls through to the mismatch error below
      }
      if (confirmedEmail !== target.email) {
        throw new HttpError(400, "confirmUsername does not match this user's username.");
      }
      await deleteUser(client, userId);
    });
    sendJson(res, 200, { ok: true });
    return true;
  }

  return false;
}
