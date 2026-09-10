import { useEffect, useState } from "react";
import type { Session, SupabaseClient } from "@supabase/supabase-js";
import { fetchMyOrganization } from "../db/organizations.ts";

// Split out of App.tsx (invariant 7's 250-line cap) — the signed-in group's real name
// (owner ask: the home screen must show what's set in the admin portal, not the single
// checked-in `presentation.json` default every group used to share). Returns null while
// loading or on fetch failure, in which case ColonyPicker falls back to that default.
export function useOrgName(
  client: SupabaseClient | null,
  session: Session | null | undefined,
): string | null {
  const [orgName, setOrgName] = useState<string | null>(null);

  useEffect(() => {
    if (!client || !session) return;
    fetchMyOrganization(client)
      .then((org) => setOrgName(org?.name ?? null))
      .catch((error: unknown) => {
        // Non-fatal: ColonyPicker falls back to presentation.json's default heading.
        console.error("failed to load organization name:", error);
      });
  }, [client, session]);

  return orgName;
}
