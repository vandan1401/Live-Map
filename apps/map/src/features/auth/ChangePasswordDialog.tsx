import { useState, type FormEvent } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { changePassword } from "../../lib/auth/changePassword.ts";
import { getBrowserDbClient } from "../../lib/db/browserClient.ts";

interface Props {
  client: SupabaseClient;
  email: string;
  onClose: () => void;
  // Tests inject a fake; the app builds a STATELESS client so verifying the current password
  // never replaces the live session (docs/plans/39.md).
  createVerifyClient?: () => SupabaseClient;
}

const statelessClient = () =>
  getBrowserDbClient({ auth: { persistSession: false, autoRefreshToken: false } });

// Reuses the sign-in card's look (login-screen-*). Every field is cleared after any submit, so a
// password never lingers in the DOM once it has been used.
export function ChangePasswordDialog({ client, email, onClose, createVerifyClient = statelessClient }: Props) {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState<{ othersSignedOut: boolean } | null>(null);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (submitting || !current || !next || !confirm) return;
    setSubmitting(true);
    setError(null);
    const result = await changePassword({
      client,
      verifyClient: createVerifyClient(),
      email,
      current,
      next,
      confirm,
    });
    setSubmitting(false);
    setCurrent("");
    setNext("");
    setConfirm("");
    if (result.ok) setDone({ othersSignedOut: result.othersSignedOut });
    else setError(result.message);
  };

  if (done) {
    return (
      <div className="login-screen-overlay">
        <div className="login-screen-card">
          <h1>Password changed</h1>
          <p>Your password was changed.</p>
          {/* Honest timing: GoTrue revokes the other sessions at once, but an access token a lost
              device already holds keeps working until it expires (JWT_EXPIRY, about an hour). */}
          {done.othersSignedOut && <p>Your other devices will be signed out within the hour.</p>}
          <button type="button" className="login-screen-submit" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="login-screen-overlay">
      <form className="login-screen-card" onSubmit={(event) => void handleSubmit(event)}>
        <h1>Change password</h1>
        {error && <p className="login-screen-error">{error}</p>}
        <input
          className="login-screen-input"
          type="password"
          autoComplete="current-password"
          value={current}
          onChange={(event) => setCurrent(event.target.value)}
          placeholder="Current password"
          autoFocus
        />
        <input
          className="login-screen-input"
          type="password"
          autoComplete="new-password"
          value={next}
          onChange={(event) => setNext(event.target.value)}
          placeholder="New password"
        />
        <input
          className="login-screen-input"
          type="password"
          autoComplete="new-password"
          value={confirm}
          onChange={(event) => setConfirm(event.target.value)}
          placeholder="Confirm new password"
        />
        <button
          type="submit"
          className="login-screen-submit"
          disabled={!current || !next || !confirm || submitting}
        >
          {submitting ? "Changing…" : "Change password"}
        </button>
        <button type="button" className="change-password-cancel" onClick={onClose}>
          Cancel
        </button>
      </form>
    </div>
  );
}
