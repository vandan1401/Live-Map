// docs/plans/36.md: real authentication for the admin portal. A request must carry a valid
// Supabase access token (validated by GoTrue itself via getUser — signature, expiry and
// banned state, nothing hand-rolled) AND app_metadata.role === 'super_admin'. The role is
// granted only by scripts/grant-super-admin.ts; no HTTP route can set it.
import type { IncomingMessage } from "node:http";
import type { SupabaseClient, User } from "@supabase/supabase-js";
import { createDbClient } from "../src/lib/db/client.ts";
import { usernameToEmail } from "../src/lib/auth/username.ts";
import { HttpError } from "./httpHelpers.ts";

export const SUPER_ADMIN_ROLE = "super_admin";

export interface AdminActor {
  id: string;
  name: string;
  isSuperAdmin: boolean;
}

export function isSuperAdminUser(user: Pick<User, "app_metadata">): boolean {
  return user.app_metadata?.role === SUPER_ADMIN_ROLE;
}

// The socket address only. X-Forwarded-For is never trusted: this service is reached
// directly over Tailscale, not behind a proxy, so the header could only be forged.
export function sourceIp(req: IncomingMessage): string {
  return req.socket.remoteAddress ?? "unknown";
}

function actorFromUser(user: User): AdminActor {
  const displayName = user.app_metadata?.display_name as string | undefined;
  return { id: user.id, name: displayName ?? user.email ?? user.id, isSuperAdmin: isSuperAdminUser(user) };
}

// Throws 401 for a missing/invalid token. Returns the actor otherwise — the CALLER decides
// what to do with a non-admin (it must write the 'denied' audit row before answering 403).
export async function authenticate(req: IncomingMessage, client: SupabaseClient): Promise<AdminActor> {
  const header = req.headers.authorization ?? "";
  const match = /^Bearer (.+)$/.exec(header);
  if (!match) throw new HttpError(401, "Sign in required.");
  const { data, error } = await client.auth.getUser(match[1]);
  if (error || !data.user) throw new HttpError(401, "Session invalid or expired — sign in again.");
  return actorFromUser(data.user);
}

export interface LoginResult {
  accessToken: string;
  expiresAt: number;
  actor: AdminActor;
}

// Returns null for bad credentials (generic on purpose). The refresh token is dropped:
// the browser gets only the access token, so a session lasts one token lifetime.
export async function loginWithPassword(
  url: string,
  anonKey: string,
  username: string,
  password: string,
): Promise<LoginResult | null> {
  let email: string;
  try {
    email = usernameToEmail(username);
  } catch {
    return null;
  }
  const anon = createDbClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data, error } = await anon.auth.signInWithPassword({ email, password });
  if (error || !data.session) return null;
  return {
    accessToken: data.session.access_token,
    expiresAt: data.session.expires_at ?? 0,
    actor: actorFromUser(data.user),
  };
}

export const LOGIN_MAX_FAILURES = 5;
export const LOGIN_WINDOW_MS = 15 * 60 * 1000;

export function createLoginThrottle(now: () => number = Date.now) {
  const failures = new Map<string, { count: number; windowStart: number }>();
  return {
    isBlocked(ip: string): boolean {
      const entry = failures.get(ip);
      if (!entry) return false;
      if (now() - entry.windowStart >= LOGIN_WINDOW_MS) {
        failures.delete(ip);
        return false;
      }
      return entry.count >= LOGIN_MAX_FAILURES;
    },
    recordFailure(ip: string): void {
      const entry = failures.get(ip);
      if (!entry || now() - entry.windowStart >= LOGIN_WINDOW_MS) {
        failures.set(ip, { count: 1, windowStart: now() });
      } else {
        entry.count += 1;
      }
    },
    clear(ip: string): void {
      failures.delete(ip);
    },
  };
}
