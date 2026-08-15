import { createClient, type SupabaseClient, type SupabaseClientOptions } from "@supabase/supabase-js";

// Pure — no import.meta, no process.env. Safe to import from both Vite (browser) and
// tsx (scripts/import-seed.ts) contexts. Each caller reads its own env source and passes
// the values in; see browserClient.ts for the Vite side. `options` is optional and
// unused by the real app (getBrowserDbClient) — live-integration tests pass
// `{ auth: { persistSession: false } }` for a guaranteed-stateless anon client, since
// GoTrue's storage key is derived from the URL alone: two clients built from the same
// URL otherwise share one localStorage session, which would silently un-anonymise an
// "anon" test client left over from an earlier signed-in scratch user in the same file.
export function createDbClient(
  url: string,
  anonKey: string,
  options?: SupabaseClientOptions<"public">,
): SupabaseClient {
  if (!url || !anonKey) {
    throw new Error("Supabase url and anon key are both required");
  }
  return createClient(url, anonKey, options);
}
