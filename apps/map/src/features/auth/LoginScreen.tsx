import { useState, type FormEvent } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { signIn } from "../../lib/auth/session.ts";

interface Props {
  client: SupabaseClient;
}

// Username/password (D-019, docs/plans/09.md) — supersedes the M4 free-text "who's
// using this device?" prompt. No forgot-password link: there is no self-service reset
// flow (scripts/create-user.ts is the only account-management path, admin-only).
export function LoginScreen({ client }: Props) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!username.trim() || !password) return;
    setSubmitting(true);
    setError(null);
    const result = await signIn(client, username.trim(), password);
    setSubmitting(false);
    if (!result.ok) setError(result.message);
    // On success, App.tsx's onAuthStateChange listener picks up the new session — no
    // local state to set here.
  };

  return (
    <div className="login-screen-overlay">
      <form className="login-screen-card" onSubmit={(event) => void handleSubmit(event)}>
        <h1>Sign in</h1>
        <p>Enter the username and password you were given.</p>
        {error && <p className="login-screen-error">{error}</p>}
        <input
          className="login-screen-input"
          value={username}
          onChange={(event) => setUsername(event.target.value)}
          placeholder="Username"
          autoCapitalize="none"
          autoFocus
        />
        <input
          className="login-screen-input"
          type="password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          placeholder="Password"
        />
        <button
          type="submit"
          className="login-screen-submit"
          disabled={!username.trim() || !password || submitting}
        >
          {submitting ? "Signing in…" : "Sign in"}
        </button>
      </form>
    </div>
  );
}
