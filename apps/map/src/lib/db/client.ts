import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// Pure — no import.meta, no process.env. Safe to import from both Vite (browser) and
// tsx (scripts/import-seed.ts) contexts. Each caller reads its own env source and passes
// the values in; see browserClient.ts for the Vite side.
export function createDbClient(url: string, anonKey: string): SupabaseClient {
  if (!url || !anonKey) {
    throw new Error("Supabase url and anon key are both required");
  }
  return createClient(url, anonKey);
}
