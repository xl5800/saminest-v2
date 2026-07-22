import { beforeEach, describe, expect, it, vi } from "vitest";

const { queryBuilder, maybeSingleMock, rpcMock } = vi.hoisted(() => {
  const maybeSingleMock = vi.fn();
  const builder: Record<string, ReturnType<typeof vi.fn>> = {};
  const chain = ["select", "eq"] as const;
  for (const method of chain) {
    builder[method] = vi.fn(() => builder);
  }
  builder.maybeSingle = maybeSingleMock;
  return { queryBuilder: builder, maybeSingleMock, rpcMock: vi.fn() };
});

const fromMock = vi.fn(() => queryBuilder);

vi.mock("../integrations/supabase/client", () => ({
  getSupabaseClient: () => ({ from: fromMock, rpc: rpcMock })
}));

import { getCurrentUserRole, getMyProfile, listProfilesForAdmin } from "./profiles-repository";

describe("getCurrentUserRole", () => {
  beforeEach(() => {
    fromMock.mockClear();
    for (const key of Object.keys(queryBuilder)) {
      queryBuilder[key].mockClear();
    }
    maybeSingleMock.mockReset();
  });

  it("returns the role when the profile row exists", async () => {
    maybeSingleMock.mockResolvedValue({ data: { role: "admin" }, error: null });

    const result = await getCurrentUserRole("user-1");

    expect(fromMock).toHaveBeenCalledWith("profiles");
    expect(queryBuilder.select).toHaveBeenCalledWith("role");
    expect(queryBuilder.eq).toHaveBeenCalledWith("id", "user-1");
    expect(result).toBe("admin");
  });

  it("returns null without throwing when there is no matching profile row", async () => {
    maybeSingleMock.mockResolvedValue({ data: null, error: null });

    await expect(getCurrentUserRole("missing-user")).resolves.toBeNull();
  });

  it("throws an AppError when the query fails", async () => {
    maybeSingleMock.mockResolvedValue({
      data: null,
      error: { message: "network down", code: "500" }
    });

    await expect(getCurrentUserRole("user-1")).rejects.toMatchObject({
      code: "PROFILE_ROLE_FETCH_FAILED"
    });
  });
});

describe("getMyProfile", () => {
  beforeEach(() => {
    fromMock.mockClear();
    for (const key of Object.keys(queryBuilder)) {
      queryBuilder[key].mockClear();
    }
    maybeSingleMock.mockReset();
  });

  it("returns the display name and avatar url when the profile row exists", async () => {
    maybeSingleMock.mockResolvedValue({
      data: { display_name: "Alice", avatar_url: "https://example.com/avatar.png" },
      error: null
    });

    const result = await getMyProfile("user-1");

    expect(fromMock).toHaveBeenCalledWith("profiles");
    expect(queryBuilder.select).toHaveBeenCalledWith("display_name, avatar_url");
    expect(queryBuilder.eq).toHaveBeenCalledWith("id", "user-1");
    expect(result).toEqual({ displayName: "Alice", avatarUrl: "https://example.com/avatar.png" });
  });

  it("returns a null avatar url when the profile has no avatar", async () => {
    maybeSingleMock.mockResolvedValue({
      data: { display_name: "Alice", avatar_url: null },
      error: null
    });

    const result = await getMyProfile("user-1");

    expect(result).toEqual({ displayName: "Alice", avatarUrl: null });
  });

  it("returns null without throwing when there is no matching profile row", async () => {
    maybeSingleMock.mockResolvedValue({ data: null, error: null });

    await expect(getMyProfile("missing-user")).resolves.toBeNull();
  });

  it("throws an AppError when the query fails", async () => {
    maybeSingleMock.mockResolvedValue({
      data: null,
      error: { message: "network down", code: "500" }
    });

    await expect(getMyProfile("user-1")).rejects.toMatchObject({
      code: "MY_PROFILE_FETCH_FAILED"
    });
  });
});

describe("listProfilesForAdmin", () => {
  beforeEach(() => {
    rpcMock.mockReset();
  });

  it("calls list_profiles_for_admin with search_term: undefined when no search term is given", async () => {
    rpcMock.mockResolvedValue({ data: [], error: null });

    await listProfilesForAdmin();

    expect(rpcMock).toHaveBeenCalledWith("list_profiles_for_admin", {
      search_term: undefined
    });
  });

  it("passes the given search term through", async () => {
    rpcMock.mockResolvedValue({ data: [], error: null });

    await listProfilesForAdmin("alice");

    expect(rpcMock).toHaveBeenCalledWith("list_profiles_for_admin", {
      search_term: "alice"
    });
  });

  it("maps rows to AdminProfileListItem (camelCase)", async () => {
    rpcMock.mockResolvedValue({
      data: [
        {
          id: "user-1",
          display_name: "Alice",
          email: "alice@example.com",
          role: "user",
          account_status: "active",
          created_at: "2026-07-01T00:00:00.000Z"
        }
      ],
      error: null
    });

    const result = await listProfilesForAdmin();

    expect(result).toEqual([
      {
        id: "user-1",
        displayName: "Alice",
        email: "alice@example.com",
        role: "user",
        accountStatus: "active",
        createdAt: "2026-07-01T00:00:00.000Z"
      }
    ]);
  });

  it("returns an empty list without throwing when there are no matching profiles", async () => {
    rpcMock.mockResolvedValue({ data: [], error: null });

    await expect(listProfilesForAdmin()).resolves.toEqual([]);
  });

  it("throws an AppError when the RPC returns an error (e.g. caller is not an admin)", async () => {
    rpcMock.mockResolvedValue({
      data: null,
      error: { message: "only admins can list user profiles" }
    });

    await expect(listProfilesForAdmin()).rejects.toMatchObject({
      code: "ADMIN_PROFILES_LIST_FAILED"
    });
  });
});
