import { beforeEach, describe, expect, it, vi } from "vitest";

const { queryBuilder, maybeSingleMock, insertMock, updateMock, eqAfterUpdateMock, rpcMock } =
  vi.hoisted(() => {
    const maybeSingleMock = vi.fn();
    const insertMock = vi.fn();
    const updateMock = vi.fn();
    const eqAfterUpdateMock = vi.fn();
    const builder: Record<string, ReturnType<typeof vi.fn>> = {};
    const chain = ["select", "eq"] as const;
    for (const method of chain) {
      builder[method] = vi.fn(() => builder);
    }
    builder.maybeSingle = maybeSingleMock;
    builder.insert = insertMock;
    return {
      queryBuilder: builder,
      maybeSingleMock,
      insertMock,
      updateMock,
      eqAfterUpdateMock,
      rpcMock: vi.fn()
    };
  });

const fromMock = vi.fn(() => queryBuilder);

// updateMyDisplayName 走 .from("profiles").update(payload).eq("id", userId)——
// eq() 在这条链路上是终止调用，直接 await 它拿 {error}，跟 select/eq/
// maybeSingle 那条链路里 eq() 只是"继续往下链"的中间调用不一样，不能复用
// queryBuilder 里那个永远 return this 的 eq mock，单独搭一个 update 专用的
// builder。
const updateQueryBuilder = { update: updateMock };
updateMock.mockReturnValue({ eq: eqAfterUpdateMock });

vi.mock("../integrations/supabase/client", () => ({
  getSupabaseClient: () => ({ from: fromMock, rpc: rpcMock })
}));

import {
  createProfile,
  ensureProfileExists,
  getCurrentUserRole,
  getMyProfile,
  listProfilesForAdmin,
  updateMyDisplayName
} from "./profiles-repository";

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

describe("createProfile", () => {
  beforeEach(() => {
    fromMock.mockClear();
    for (const key of Object.keys(queryBuilder)) {
      queryBuilder[key].mockClear();
    }
    insertMock.mockReset();
  });

  it("inserts a new profile row with role=user and account_status=active", async () => {
    insertMock.mockResolvedValue({ error: null });

    await createProfile({ id: "user-1", displayName: "小明" });

    expect(fromMock).toHaveBeenCalledWith("profiles");
    expect(insertMock).toHaveBeenCalledWith({
      id: "user-1",
      display_name: "小明",
      role: "user",
      account_status: "active"
    });
  });

  it("falls back to a default display name when given an empty/whitespace-only value", async () => {
    insertMock.mockResolvedValue({ error: null });

    await createProfile({ id: "user-1", displayName: "   " });

    expect(insertMock).toHaveBeenCalledWith(
      expect.objectContaining({ display_name: "新用户" })
    );
  });

  it("throws PROFILE_CREATE_FAILED when the insert fails", async () => {
    insertMock.mockResolvedValue({ error: { message: "boom", code: "500" } });

    await expect(
      createProfile({ id: "user-1", displayName: "小明" })
    ).rejects.toMatchObject({ code: "PROFILE_CREATE_FAILED" });
  });
});

describe("updateMyDisplayName", () => {
  beforeEach(() => {
    fromMock.mockClear();
    updateMock.mockClear();
    eqAfterUpdateMock.mockReset();
  });

  it("updates only the display_name column for the given user id", async () => {
    eqAfterUpdateMock.mockResolvedValue({ error: null });
    fromMock.mockReturnValueOnce(updateQueryBuilder);

    await updateMyDisplayName("user-1", "小明");

    expect(fromMock).toHaveBeenCalledWith("profiles");
    expect(updateMock).toHaveBeenCalledWith({ display_name: "小明" });
    expect(eqAfterUpdateMock).toHaveBeenCalledWith("id", "user-1");
  });

  it("throws PROFILE_DISPLAY_NAME_UPDATE_FAILED when the update fails", async () => {
    eqAfterUpdateMock.mockResolvedValue({
      error: { message: "network down", code: "500" }
    });
    fromMock.mockReturnValueOnce(updateQueryBuilder);

    await expect(
      updateMyDisplayName("user-1", "小明")
    ).rejects.toMatchObject({ code: "PROFILE_DISPLAY_NAME_UPDATE_FAILED" });
  });

  it("does not include role/account_status in the update payload (only display_name is writable from this page)", async () => {
    eqAfterUpdateMock.mockResolvedValue({ error: null });
    fromMock.mockReturnValueOnce(updateQueryBuilder);

    await updateMyDisplayName("user-1", "小红");

    expect(Object.keys(updateMock.mock.calls[0][0])).toEqual(["display_name"]);
  });
});

describe("ensureProfileExists", () => {
  beforeEach(() => {
    fromMock.mockClear();
    for (const key of Object.keys(queryBuilder)) {
      queryBuilder[key].mockClear();
    }
    maybeSingleMock.mockReset();
    insertMock.mockReset();
  });

  it("does nothing when a profile row already exists", async () => {
    maybeSingleMock.mockResolvedValue({ data: { id: "user-1" }, error: null });

    await ensureProfileExists("user-1", "小明");

    expect(queryBuilder.select).toHaveBeenCalledWith("id");
    expect(queryBuilder.eq).toHaveBeenCalledWith("id", "user-1");
    expect(insertMock).not.toHaveBeenCalled();
  });

  it("inserts a profile row when none exists yet", async () => {
    maybeSingleMock.mockResolvedValue({ data: null, error: null });
    insertMock.mockResolvedValue({ error: null });

    await ensureProfileExists("user-1", "小明");

    expect(insertMock).toHaveBeenCalledWith({
      id: "user-1",
      display_name: "小明",
      role: "user",
      account_status: "active"
    });
  });

  it("treats a 23505 unique violation on insert as already-created and does not throw", async () => {
    maybeSingleMock.mockResolvedValue({ data: null, error: null });
    insertMock.mockResolvedValue({
      error: { message: "duplicate key value violates unique constraint", code: "23505" }
    });

    await expect(ensureProfileExists("user-1", "小明")).resolves.toBeUndefined();
  });

  it("throws for a real insert failure that is not a unique violation", async () => {
    maybeSingleMock.mockResolvedValue({ data: null, error: null });
    insertMock.mockResolvedValue({ error: { message: "network down", code: "500" } });

    await expect(
      ensureProfileExists("user-1", "小明")
    ).rejects.toMatchObject({ code: "PROFILE_CREATE_FAILED" });
  });

  it("throws PROFILE_EXISTS_CHECK_FAILED when the existence check itself fails", async () => {
    maybeSingleMock.mockResolvedValue({
      data: null,
      error: { message: "network down", code: "500" }
    });

    await expect(
      ensureProfileExists("user-1", "小明")
    ).rejects.toMatchObject({ code: "PROFILE_EXISTS_CHECK_FAILED" });
  });
});
