import { describe, expect, it } from "vitest";
import { fetchMyOrganization, fetchOrganizations, insertOrganization } from "./organizations.ts";
import { fetchColoniesByOrg, insertColony } from "./colonies.ts";
import { createScratchOrg, createScratchUser, serviceRoleClient } from "../auth/testHelpers.ts";

// docs/plans/23.md phase 3: the admin portal's org read/create surface, live against the
// real local Docker Supabase — no mocks, this repo's convention throughout.
describe("organizations", () => {
  it("a created organization appears in fetchOrganizations", async () => {
    const admin = serviceRoleClient();
    const name = `org-test-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    const created = await insertOrganization(admin, name);
    expect(created.name).toBe(name);

    const all = await fetchOrganizations(admin);
    expect(all.some((org) => org.id === created.id && org.name === name)).toBe(true);
  });
});

describe("fetchMyOrganization", () => {
  it("returns the signed-in user's own org, scoped by RLS, and its real name", async () => {
    const admin = serviceRoleClient();
    const name = `org-mine-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const org = await insertOrganization(admin, name);
    const otherOrgId = await createScratchOrg();
    const user = await createScratchUser("Test User", org.id);

    const mine = await fetchMyOrganization(user.client);

    expect(mine?.id).toBe(org.id);
    expect(mine?.name).toBe(name);
    expect(mine?.id).not.toBe(otherOrgId);
  });
});

describe("fetchColoniesByOrg", () => {
  it("returns a scratch colony for its own org and nothing for a different org", async () => {
    const admin = serviceRoleClient();
    const orgA = await createScratchOrg();
    const orgB = await createScratchOrg();
    const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const colonyId = `test-orgcolony-${suffix}`;

    await insertColony(admin, {
      id: colonyId,
      org_id: orgA,
      name: "org-scoped scratch colony",
      verified: false,
      svg: "<svg></svg>",
    });

    const forOrgA = await fetchColoniesByOrg(admin, orgA);
    expect(forOrgA.some((c) => c.id === colonyId)).toBe(true);

    const forOrgB = await fetchColoniesByOrg(admin, orgB);
    expect(forOrgB.some((c) => c.id === colonyId)).toBe(false);
  });
});
