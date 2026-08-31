import { afterAll, describe, expect, it } from "vitest";
import { createOrgUser, listOrgUsers, reassignUserOrg } from "./actions.ts";
import { InvalidUsernameError } from "../src/lib/auth/username.ts";
import {
  createScratchOrg,
  createScratchUser,
  createStatelessAnonClient,
  deleteScratchUser,
  serviceRoleClient,
  type ScratchUser,
} from "../src/lib/auth/testHelpers.ts";
import { signIn } from "../src/lib/auth/session.ts";

// docs/plans/23.md phase 3: live-integration proof for the admin portal's own domain
// layer, against the real local Docker Supabase — no mocks, this repo's convention.
const createdUsers: ScratchUser[] = [];

afterAll(async () => {
  await Promise.all(createdUsers.map((user) => deleteScratchUser(user)));
});

describe("createOrgUser", () => {
  it("creates a real account that can sign in, with the org id on its session", async () => {
    const admin = serviceRoleClient();
    const orgId = await createScratchOrg();
    const suffix = Math.random().toString(36).slice(2, 10);
    const username = `ap-${suffix}`;
    const password = `pw-${suffix}`;

    const created = await createOrgUser(admin, {
      username,
      password,
      displayName: "Portal Test User",
      orgId,
    });
    expect(created.id).toEqual(expect.any(String));

    const anon = createStatelessAnonClient();
    const result = await signIn(anon, username, password);
    expect(result.ok).toBe(true);

    const { data: sessionData } = await anon.auth.getSession();
    expect(sessionData.session?.user.app_metadata.org_id).toBe(orgId);
    createdUsers.push({ id: created.id, displayName: "Portal Test User", client: anon });
  }, 15_000);

  it("throws InvalidUsernameError for a malformed username, proving the shared validator is wired in", async () => {
    const admin = serviceRoleClient();
    const orgId = await createScratchOrg();
    await expect(
      createOrgUser(admin, {
        username: "Not A Valid Username!",
        password: "irrelevant",
        displayName: "irrelevant",
        orgId,
      }),
    ).rejects.toBeInstanceOf(InvalidUsernameError);
  });
});

describe("reassignUserOrg", () => {
  it("changes org_id and preserves display_name unchanged", async () => {
    const admin = serviceRoleClient();
    const orgA = await createScratchOrg();
    const orgB = await createScratchOrg();
    const user = await createScratchUser("Preserve Me", orgA);

    await reassignUserOrg(admin, user.id, orgB);

    const { data } = await admin.auth.admin.getUserById(user.id);
    expect(data.user?.app_metadata.org_id).toBe(orgB);
    expect(data.user?.app_metadata.display_name).toBe("Preserve Me");

    await deleteScratchUser(user);
  }, 15_000);
});

describe("listOrgUsers", () => {
  it("returns a scratch user for their own org, not for a different org", async () => {
    const admin = serviceRoleClient();
    const orgA = await createScratchOrg();
    const orgB = await createScratchOrg();
    const user = await createScratchUser("Listed User", orgA);

    const forOrgA = await listOrgUsers(admin, orgA);
    expect(forOrgA.some((u) => u.id === user.id && u.displayName === "Listed User")).toBe(true);

    const forOrgB = await listOrgUsers(admin, orgB);
    expect(forOrgB.some((u) => u.id === user.id)).toBe(false);

    await deleteScratchUser(user);
  }, 15_000);
});
