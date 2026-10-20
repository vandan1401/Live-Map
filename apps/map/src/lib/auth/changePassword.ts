import type { SupabaseClient } from "@supabase/supabase-js";

// Self-service password change (docs/plans/39.md). Accounts have a synthetic email and no
// mail delivery (D-019), so there is no reset link: a member proves the CURRENT password, then
// sets a new one. Forgotten passwords stay the admin portal's job.
//
// Must equal admin-portal/actions.ts's MIN_PASSWORD_LENGTH; src/ cannot import that Node-only
// module, so changePassword.test.ts pins the two values equal.
export const MIN_PASSWORD_LENGTH = 8;

export type ChangePasswordFailure =
  | "too-short"
  | "mismatch"
  | "same"
  | "wrong-current"
  | "weak-password"
  | "rate-limited"
  | "recent-login-needed"
  | "failed";

export type ChangePasswordResult =
  | { ok: true; othersSignedOut: boolean }
  | { ok: false; reason: ChangePasswordFailure; message: string };

// Fixed strings only. GoTrue's own error text is never shown (it can carry detail about the
// account) and no password ever appears in any message.
const MESSAGES: Record<ChangePasswordFailure, string> = {
  "too-short": `New password must be at least ${MIN_PASSWORD_LENGTH} characters.`,
  mismatch: "The new passwords do not match.",
  same: "Choose a password different from your current one.",
  "wrong-current": "Current password is incorrect.",
  "weak-password": "That password was rejected as too easy to guess. Choose a longer or less common one.",
  "rate-limited": "Too many attempts. Wait a minute and try again.",
  "recent-login-needed": "Please sign out, sign in again, then change your password.",
  failed: "Could not change the password. Check your connection and try again.",
};

function fail(reason: ChangePasswordFailure): ChangePasswordResult {
  return { ok: false, reason, message: MESSAGES[reason] };
}

interface AuthErrorLike {
  code?: string;
  status?: number;
  name?: string;
}

function isRateLimited(error: AuthErrorLike): boolean {
  return error.status === 429 || error.code === "over_request_rate_limit";
}

export interface ChangePasswordArgs {
  // The live session's client: the password is changed on it and it stays signed in.
  client: SupabaseClient;
  // A STATELESS client (persistSession: false): used only to verify the current password, so
  // the live session is never replaced by the verification sign-in.
  verifyClient: SupabaseClient;
  email: string;
  current: string;
  next: string;
  confirm: string;
}

export async function changePassword(args: ChangePasswordArgs): Promise<ChangePasswordResult> {
  const { client, verifyClient, email, current, next, confirm } = args;

  // 1. Validation that needs no network. Order is part of the contract: a short password is
  // reported before a mismatch, so the first thing a user fixes is the first thing they see.
  if (next.length < MIN_PASSWORD_LENGTH) return fail("too-short");
  if (next !== confirm) return fail("mismatch");
  if (next === current) return fail("same");

  // 2. The CURRENT password is verified by GoTrue, never compared in the browser.
  const verified = await verifyClient.auth.signInWithPassword({ email, password: current });
  if (verified.error) {
    if (isRateLimited(verified.error)) return fail("rate-limited");
    // ONLY GoTrue's own "wrong credentials" answer is a statement about the password. A dropped
    // connection, a 5xx or a proxy error must never tell a member their (correct) password is
    // wrong (/review finding: this app is an offline-first PWA, so that WILL happen).
    const code = (verified.error as AuthErrorLike).code;
    return fail(code === "invalid_credentials" ? "wrong-current" : "failed");
  }
  // That sign-in created a second session; revoke it at once so no stray refresh token lives on.
  await verifyClient.auth.signOut({ scope: "local" }).catch(() => undefined);

  // 3. Change the password on the live session.
  const updated = await client.auth.updateUser({ password: next });
  if (updated.error) {
    const { code, name } = updated.error as AuthErrorLike;
    if (isRateLimited(updated.error)) return fail("rate-limited");
    if (code === "same_password") return fail("same");
    if (code === "weak_password") return fail("weak-password");
    // This device's own session is gone (e.g. another device changed the password first): a retry
    // can never work, only signing in again can.
    if (
      code === "reauthentication_needed" ||
      code === "reauthentication_not_valid" ||
      code === "session_not_found" ||
      name === "AuthSessionMissingError"
    ) {
      return fail("recent-login-needed");
    }
    return fail("failed");
  }

  // 4. Sign out every OTHER device. The password has already changed, so an error here is still
  // a success: reporting failure would tell the member their new password did not take.
  const others = await client.auth.signOut({ scope: "others" }).then(
    ({ error }) => error === null,
    () => false,
  );
  return { ok: true, othersSignedOut: others };
}
