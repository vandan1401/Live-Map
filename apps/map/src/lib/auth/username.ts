// Pure — no supabase import (NAVIGATION.md layer rule: this is Domain, not Data access).
// Supabase Auth has no username concept, only email — every account is a synthetic,
// invisible internal address so the session/JWT/RLS machinery (auth.uid(), auth.jwt())
// keeps working unmodified while the user only ever sees a username (D-019).

const USERNAME_PATTERN = /^[a-z0-9_-]{2,32}$/;
const EMAIL_DOMAIN = "colony.local";

export class InvalidUsernameError extends Error {
  constructor(username: string) {
    super(
      `"${username}" is not a valid username — use 2-32 characters, letters, numbers, ` +
        `hyphens, or underscores only.`,
    );
    this.name = "InvalidUsernameError";
  }
}

// The one place username validation lives (docs/plans/09.md §3) — reused by the login
// form and scripts/create-user.ts so the two can never drift apart.
export function usernameToEmail(username: string): string {
  const normalised = username.trim().toLowerCase();
  if (!USERNAME_PATTERN.test(normalised)) {
    throw new InvalidUsernameError(username);
  }
  return `${normalised}@${EMAIL_DOMAIN}`;
}
