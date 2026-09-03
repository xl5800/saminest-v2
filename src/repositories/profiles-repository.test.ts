import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  queryBuilder,
  maybeSingleMock,
  overrideTypesMock,
  insertMock,
  updateMock,
  eqAfterUpdateMock,
  rpcMock
} = vi.hoisted(() => {
  const maybeSingleMock = vi.fn();
  const overrideTypesMock = vi.fn();
  const insertMock = vi.fn();
  const updateMock = vi.fn();
  const eqAfterUpdateMock = vi.fn();
  const builder: Record<string, ReturnType<typeof vi.fn>> = {};
  const chain = ["select", "eq"] as const;
  for (const method of chain) {
    builder[method] = vi.fn(() => builder);
  }
  builder.maybeSingle = maybeSingleMock;
  builder.overrideTypes = overrideTypesMock;
  builder.insert = insertMock;
  return {
    queryBuilder: builder,
    maybeSingleMock,
    overrideTypesMock,
    insertMock,
    updateMock,
    eqAfterUpdateMock,
    rpcMock: vi.fn()
  };
});

const fromMock = vi.fn(() => queryBuilder);

// updateMyProfile/updateMyAvatarUrl 走 .from("profiles").update(payload).eq("id", userId)——
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
  getPublicProfile,
  listProfilesForAdmin,
  updateMyAvatarUrl,
  updateMyProfile
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
    overrideTypesMock.mockReset();
    // getMyProfile 在 .maybeSingle() 之后还链式调用 .overrideTypes()，让
    // maybeSingle 返回共享的 queryBuilder 本身，再由 overrideTypesMock
    // 提供最终 resolve 的 {data, error}——跟 activities-repository.test.ts
    // 里 getActivityDetail 的 mock 方式是同一个模式。
    maybeSingleMock.mockReturnValue(queryBuilder);
  });

  it("returns display name/avatar/bio/locationId/locationName/age when the profile row exists", async () => {
    overrideTypesMock.mockResolvedValue({
      data: {
        display_name: "Alice",
        avatar_url: "https://example.com/avatar.png",
        bio: "Hi there",
        location_id: "loc-1",
        location: { name: "Rockville" },
        age: 25
      },
      error: null
    });

    const result = await getMyProfile("user-1");

    expect(fromMock).toHaveBeenCalledWith("profiles");
    expect(queryBuilder.select).toHaveBeenCalledWith(
      "display_name, avatar_url, bio, location_id, location:locations(name), age"
    );
    expect(queryBuilder.eq).toHaveBeenCalledWith("id", "user-1");
    expect(result).toEqual({
      displayName: "Alice",
      avatarUrl: "https://example.com/avatar.png",
      bio: "Hi there",
      locationId: "loc-1",
      locationName: "Rockville",
      age: 25
    });
  });

  it("returns null avatar/bio/locationId/locationName/age when those fields are unset", async () => {
    overrideTypesMock.mockResolvedValue({
      data: {
        display_name: "Alice",
        avatar_url: null,
        bio: null,
        location_id: null,
        location: null,
        age: null
      },
      error: null
    });

    const result = await getMyProfile("user-1");

    expect(result).toEqual({
      displayName: "Alice",
      avatarUrl: null,
      bio: null,
      locationId: null,
      locationName: null,
      age: null
    });
  });

  it("returns null without throwing when there is no matching profile row", async () => {
    overrideTypesMock.mockResolvedValue({ data: null, error: null });

    await expect(getMyProfile("missing-user")).resolves.toBeNull();
  });

  it("throws an AppError when the query fails", async () => {
    overrideTypesMock.mockResolvedValue({
      data: null,
      error: { message: "network down", code: "500" }
    });

    await expect(getMyProfile("user-1")).rejects.toMatchObject({
      code: "MY_PROFILE_FETCH_FAILED"
    });
  });
});

describe("getPublicProfile", () => {
  beforeEach(() => {
    fromMock.mockClear();
    for (const key of Object.keys(queryBuilder)) {
      queryBuilder[key].mockClear();
    }
    maybeSingleMock.mockReset();
    overrideTypesMock.mockReset();
    maybeSingleMock.mockReturnValue(queryBuilder);
  });

  it("returns id/displayName/bio/avatarUrl/locationName/age when the profile row exists", async () => {
    overrideTypesMock.mockResolvedValue({
      data: {
        id: "user-2",
        display_name: "Bob",
        bio: "Hi there",
        avatar_url: "https://example.com/bob.jpg",
        location: { name: "Rockville" },
        age: 30
      },
      error: null
    });

    const result = await getPublicProfile("user-2");

    expect(fromMock).toHaveBeenCalledWith("profiles");
    expect(queryBuilder.select).toHaveBeenCalledWith(
      "id, display_name, bio, avatar_url, location:locations(name), age"
    );
    expect(queryBuilder.eq).toHaveBeenCalledWith("id", "user-2");
    expect(result).toEqual({
      id: "user-2",
      displayName: "Bob",
      bio: "Hi there",
      avatarUrl: "https://example.com/bob.jpg",
      locationName: "Rockville",
      age: 30
    });
  });

  // age 是公开信息（跟 locationName 同等公开程度，见迁移文件
  // 20260903050000_add_profile_age.sql），这里单独断言一下——不是只在
  // getMyProfile 那边测过就够，公开主页这条路径也要确认真的把它带出来了。
  it("exposes age as public information, same as locationName", async () => {
    overrideTypesMock.mockResolvedValue({
      data: {
        id: "user-2",
        display_name: "Bob",
        bio: null,
        avatar_url: null,
        location: null,
        age: 42
      },
      error: null
    });

    const result = await getPublicProfile("user-2");

    expect(result?.age).toBe(42);
  });

  it("returns null bio/avatarUrl/locationName/age when those fields are unset", async () => {
    overrideTypesMock.mockResolvedValue({
      data: {
        id: "user-2",
        display_name: "Bob",
        bio: null,
        avatar_url: null,
        location: null,
        age: null
      },
      error: null
    });

    const result = await getPublicProfile("user-2");

    expect(result).toEqual({
      id: "user-2",
      displayName: "Bob",
      bio: null,
      avatarUrl: null,
      locationName: null,
      age: null
    });
  });

  it("returns null without throwing when there is no matching profile row (e.g. a nonexistent :userId)", async () => {
    overrideTypesMock.mockResolvedValue({ data: null, error: null });

    await expect(getPublicProfile("missing-user")).resolves.toBeNull();
  });

  it("throws an AppError when the query fails", async () => {
    overrideTypesMock.mockResolvedValue({
      data: null,
      error: { message: "network down", code: "500" }
    });

    await expect(getPublicProfile("user-2")).rejects.toMatchObject({
      code: "PUBLIC_PROFILE_FETCH_FAILED"
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

describe("updateMyProfile", () => {
  beforeEach(() => {
    fromMock.mockClear();
    updateMock.mockClear();
    eqAfterUpdateMock.mockReset();
  });

  it("updates display_name/bio/location_id together for the given user id", async () => {
    eqAfterUpdateMock.mockResolvedValue({ error: null });
    fromMock.mockReturnValueOnce(updateQueryBuilder);

    await updateMyProfile("user-1", {
      displayName: "小明",
      bio: "你好",
      locationId: "loc-1",
      age: 25
    });

    expect(fromMock).toHaveBeenCalledWith("profiles");
    expect(updateMock).toHaveBeenCalledWith({
      display_name: "小明",
      bio: "你好",
      location_id: "loc-1",
      age: 25
    });
    expect(eqAfterUpdateMock).toHaveBeenCalledWith("id", "user-1");
  });

  it("passes bio: null, locationId: null, and age: null through unchanged (caller is responsible for the empty-string-to-null coercion)", async () => {
    eqAfterUpdateMock.mockResolvedValue({ error: null });
    fromMock.mockReturnValueOnce(updateQueryBuilder);

    await updateMyProfile("user-1", {
      displayName: "小明",
      bio: null,
      locationId: null,
      age: null
    });

    expect(updateMock).toHaveBeenCalledWith({
      display_name: "小明",
      bio: null,
      location_id: null,
      age: null
    });
  });

  it("throws PROFILE_UPDATE_FAILED when the update fails", async () => {
    eqAfterUpdateMock.mockResolvedValue({
      error: { message: "network down", code: "500" }
    });
    fromMock.mockReturnValueOnce(updateQueryBuilder);

    await expect(
      updateMyProfile("user-1", { displayName: "小明", bio: null, locationId: null, age: null })
    ).rejects.toMatchObject({ code: "PROFILE_UPDATE_FAILED" });
  });

  it("does not include role/account_status/avatar_url in the update payload (those are not writable from this page)", async () => {
    eqAfterUpdateMock.mockResolvedValue({ error: null });
    fromMock.mockReturnValueOnce(updateQueryBuilder);

    await updateMyProfile("user-1", {
      displayName: "小红",
      bio: null,
      locationId: null,
      age: null
    });

    expect(Object.keys(updateMock.mock.calls[0][0]).sort()).toEqual(
      ["age", "bio", "display_name", "location_id"].sort()
    );
  });
});

describe("updateMyAvatarUrl", () => {
  beforeEach(() => {
    fromMock.mockClear();
    updateMock.mockClear();
    eqAfterUpdateMock.mockReset();
  });

  it("updates only the avatar_url column for the given user id", async () => {
    eqAfterUpdateMock.mockResolvedValue({ error: null });
    fromMock.mockReturnValueOnce(updateQueryBuilder);

    await updateMyAvatarUrl("user-1", "https://example.com/new-avatar.webp");

    expect(fromMock).toHaveBeenCalledWith("profiles");
    expect(updateMock).toHaveBeenCalledWith({
      avatar_url: "https://example.com/new-avatar.webp"
    });
    expect(eqAfterUpdateMock).toHaveBeenCalledWith("id", "user-1");
  });

  it("throws PROFILE_AVATAR_UPDATE_FAILED when the update fails", async () => {
    eqAfterUpdateMock.mockResolvedValue({
      error: { message: "network down", code: "500" }
    });
    fromMock.mockReturnValueOnce(updateQueryBuilder);

    await expect(
      updateMyAvatarUrl("user-1", "https://example.com/new-avatar.webp")
    ).rejects.toMatchObject({ code: "PROFILE_AVATAR_UPDATE_FAILED" });
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
