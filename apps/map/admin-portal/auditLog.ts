// docs/plans/36.md: the admin portal's audit trail (admin_audit_log, append-only, service_role
// only). Write-ahead and fail-closed: `audited()` writes an 'attempt' row BEFORE the action —
// if that cannot be written, the action does not run. A result row ('ok'/'error') follows.
import type { SupabaseClient } from "@supabase/supabase-js";
import { HttpError } from "./httpHelpers.ts";

export interface AuditActor {
  id: string | null;
  name: string | null;
}

export interface AuditEntry {
  actor: AuditActor;
  sourceIp: string;
  action: string;
  targetType?: string;
  targetId?: string;
  // Never a password, token or key — callers pass only what is safe to keep forever.
  detail?: Record<string, unknown>;
}

export type AuditOutcome = "attempt" | "ok" | "error" | "denied";

export interface AuditRow {
  id: number;
  created_at: string;
  actor_id: string | null;
  actor_name: string | null;
  action: string;
  outcome: AuditOutcome;
  target_type: string | null;
  target_id: string | null;
  detail: Record<string, unknown>;
  source_ip: string | null;
}

export const AUDIT_DEFAULT_LIMIT = 50;
export const AUDIT_MAX_LIMIT = 200;

export async function recordAudit(
  client: SupabaseClient,
  entry: AuditEntry,
  outcome: AuditOutcome,
  extraDetail?: Record<string, unknown>,
): Promise<void> {
  const { error } = await client.from("admin_audit_log").insert({
    actor_id: entry.actor.id,
    actor_name: entry.actor.name,
    action: entry.action,
    outcome,
    target_type: entry.targetType ?? null,
    target_id: entry.targetId ?? null,
    detail: { ...entry.detail, ...extraDetail },
    source_ip: entry.sourceIp,
  });
  if (error) throw new Error(`recordAudit failed: ${error.message}`);
}

export async function audited<T>(
  client: SupabaseClient,
  entry: AuditEntry,
  action: () => Promise<T>,
): Promise<T> {
  try {
    await recordAudit(client, entry, "attempt");
  } catch (err) {
    console.error(`admin-portal: audit write failed, action "${entry.action}" NOT performed:`, err);
    throw new HttpError(500, "The audit log is unavailable, so the action was not performed.");
  }

  let result: T;
  try {
    result = await action();
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await recordAudit(client, entry, "error", { message }).catch((auditErr: unknown) => {
      console.error(`admin-portal: could not record the error result of "${entry.action}":`, auditErr);
    });
    throw err;
  }

  try {
    await recordAudit(client, entry, "ok");
  } catch (err) {
    console.error(`admin-portal: action "${entry.action}" succeeded but its result row failed:`, err);
    throw new HttpError(500, `"${entry.action}" was performed, but its audit result row could not be written.`);
  }
  return result;
}

export interface ListAuditArgs {
  limit?: number;
  beforeId?: number;
}

export async function listAuditLog(client: SupabaseClient, args: ListAuditArgs = {}): Promise<AuditRow[]> {
  const limit = Math.min(Math.max(Math.trunc(args.limit ?? AUDIT_DEFAULT_LIMIT) || AUDIT_DEFAULT_LIMIT, 1), AUDIT_MAX_LIMIT);
  let query = client.from("admin_audit_log").select("*").order("id", { ascending: false }).limit(limit);
  if (args.beforeId !== undefined) query = query.lt("id", args.beforeId);
  const { data, error } = await query;
  if (error) throw new Error(`listAuditLog failed: ${error.message}`);
  return (data as AuditRow[] | null) ?? [];
}
