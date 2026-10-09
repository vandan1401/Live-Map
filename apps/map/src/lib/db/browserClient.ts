import type { SupabaseClient } from "@supabase/supabase-js";
import { getAppConfig } from "../config/appConfig.ts";
import { createDbClient } from "./client.ts";

// The only place the browser's Supabase URL/key is resolved (runtime /config.js first, then the
// build-time VITE_SUPABASE_* values — see lib/config/appConfig.ts). Never imported from
// scripts/import-seed.ts — that runs under tsx, not Vite, and builds its own client
// from process.env via createDbClient directly.
export function getBrowserDbClient(): SupabaseClient {
  const { supabaseUrl, supabaseAnonKey } = getAppConfig();
  return createDbClient(supabaseUrl, supabaseAnonKey);
}
