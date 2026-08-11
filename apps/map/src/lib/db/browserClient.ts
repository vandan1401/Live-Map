import type { SupabaseClient } from "@supabase/supabase-js";
import { createDbClient } from "./client.ts";

// The only place import.meta.env.VITE_SUPABASE_* is read. Never imported from
// scripts/import-seed.ts — that runs under tsx, not Vite, and builds its own client
// from process.env via createDbClient directly.
export function getBrowserDbClient(): SupabaseClient {
  return createDbClient(
    import.meta.env.VITE_SUPABASE_URL,
    import.meta.env.VITE_SUPABASE_ANON_KEY,
  );
}
