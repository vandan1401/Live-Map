import type { Session, SupabaseClient } from "@supabase/supabase-js";
import { usernameToEmail } from "./username.ts";

// One generic message either way — never lets a caller distinguish "unknown username"
// from "wrong password" (no user enumeration for a login surface with only 5-6 accounts).
const SIGN_IN_ERROR_MESSAGE = "Incorrect username or password.";

export async function signIn(
  client: SupabaseClient,
  username: string,
  password: string,
): Promise<{ ok: true } | { ok: false; message: string }> {
  let email: string;
  try {
    email = usernameToEmail(username);
  } catch {
    return { ok: false, message: SIGN_IN_ERROR_MESSAGE };
  }
  const { error } = await client.auth.signInWithPassword({ email, password });
  if (error) return { ok: false, message: SIGN_IN_ERROR_MESSAGE };
  return { ok: true };
}

export async function signOut(client: SupabaseClient): Promise<void> {
  await client.auth.signOut();
}

// Must mirror the apply_plot_transition() migration's own coalesce exactly
// (app_metadata.display_name, then email, nothing else — docs/plans/09.md §C /review
// finding) so the name a user sees for themselves never disagrees with what the
// database just wrote for the same write. app_metadata, NOT user_metadata: the latter
// is writable by the user themselves and would defeat D-020's whole point. Returns null
// rather than a placeholder like "unknown" — a session with no email is a session this
// app should refuse to trust, not paper over (the exact `?? "unknown"` mistake tier-1.md
// warns against); App.tsx signs the session out when this returns null.
export function getDisplayName(session: Session): string | null {
  const displayName = session.user.app_metadata?.display_name;
  if (typeof displayName === "string" && displayName.length > 0) return displayName;
  return session.user.email ?? null;
}
