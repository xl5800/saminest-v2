import { beforeEach, describe, expect, it, vi } from "vitest";

const { queryBuilder, eqMock, insertMock, matchMock } = vi.hoisted(() => {
  const eqMock = vi.fn();
  const insertMock = vi.fn();
  const matchMock = vi.fn();
  const builder: Record<string, ReturnType<typeof vi.fn>> = {};
  builder.select = vi.fn(() => builder);
  builder.eq = eqMock;
  builder.insert = insertMock;
  builder.delete = vi.fn(() => builder);
  builder.match = matchMock;
  return { queryBuilder: builder, eqMock, insertMock, matchMock };
});

const fromMock = vi.fn(() => queryBuilder);

vi.mock("../integrations/supabase/client", () => ({
  getSupabaseClient: () => ({ from: fromMock })
}));

import { addFavorite, listFavoritedPostIds, removeFavorite } from "./favorites-repository";

describe("listFavoritedPostIds", () => {
  beforeEach(() => {
    fromMock.mockClear();
    queryBuilder.select.mockClear();
    queryBuilder.delete.mockClear();
    eqMock.mockReset();
    insertMock.mockReset();
    matchMock.mockReset();
  });

  it("returns the post ids favorited by the given user", async () => {
    eqMock.mockResolvedValue({
      data: [{ post_id: "post-1" }, { post_id: "post-2" }],
      error: null
    });

    const result = await listFavoritedPostIds("user-1");

    expect(fromMock).toHaveBeenCalledWith("favorites");
    expect(queryBuilder.select).toHaveBeenCalledWith("post_id");
    expect(eqMock).toHaveBeenCalledWith("user_id", "user-1");
    expect(result).toEqual(["post-1", "post-2"]);
  });

  it("returns an empty array when the user has no favorites", async () => {
    eqMock.mockResolvedValue({ data: [], error: null });

    expect(await listFavoritedPostIds("user-1")).toEqual([]);
  });

  it("throws an AppError when the query fails", async () => {
    eqMock.mockResolvedValue({
      data: null,
      error: { message: "network down", code: "500" }
    });

    await expect(listFavoritedPostIds("user-1")).rejects.toMatchObject({
      code: "FAVORITES_LIST_FAILED"
    });
  });
});

describe("addFavorite", () => {
  beforeEach(() => {
    fromMock.mockClear();
    queryBuilder.select.mockClear();
    queryBuilder.delete.mockClear();
    eqMock.mockReset();
    insertMock.mockReset();
    matchMock.mockReset();
  });

  it("inserts a favorites row for the given user and post", async () => {
    insertMock.mockResolvedValue({ error: null });

    await addFavorite({ userId: "user-1", postId: "post-1" });

    expect(fromMock).toHaveBeenCalledWith("favorites");
    expect(insertMock).toHaveBeenCalledWith({
      user_id: "user-1",
      post_id: "post-1"
    });
  });

  it("treats a unique-violation error as an idempotent success", async () => {
    insertMock.mockResolvedValue({
      error: { message: "duplicate key value", code: "23505" }
    });

    await expect(
      addFavorite({ userId: "user-1", postId: "post-1" })
    ).resolves.toBeUndefined();
  });

  it("throws an AppError for any other insert failure", async () => {
    insertMock.mockResolvedValue({
      error: { message: "insert failed", code: "500" }
    });

    await expect(
      addFavorite({ userId: "user-1", postId: "post-1" })
    ).rejects.toMatchObject({ code: "FAVORITE_ADD_FAILED" });
  });

  it("throws a distinct ACCOUNT_RESTRICTED AppError with a friendly message on an RLS violation (42501)", async () => {
    insertMock.mockResolvedValue({
      error: {
        message: "new row violates row-level security policy for table \"favorites\"",
        code: "42501"
      }
    });

    await expect(
      addFavorite({ userId: "user-1", postId: "post-1" })
    ).rejects.toMatchObject({
      code: "ACCOUNT_RESTRICTED",
      message: "您的账号当前处于限制状态，无法执行此操作，如有疑问请联系管理员。"
    });
  });
});

describe("removeFavorite", () => {
  beforeEach(() => {
    fromMock.mockClear();
    queryBuilder.select.mockClear();
    queryBuilder.delete.mockClear();
    eqMock.mockReset();
    insertMock.mockReset();
    matchMock.mockReset();
  });

  it("deletes the favorites row matching the user and post", async () => {
    matchMock.mockResolvedValue({ error: null });

    await removeFavorite({ userId: "user-1", postId: "post-1" });

    expect(fromMock).toHaveBeenCalledWith("favorites");
    expect(queryBuilder.delete).toHaveBeenCalled();
    expect(matchMock).toHaveBeenCalledWith({
      user_id: "user-1",
      post_id: "post-1"
    });
  });

  it("throws an AppError when the delete fails", async () => {
    matchMock.mockResolvedValue({
      error: { message: "delete failed", code: "500" }
    });

    await expect(
      removeFavorite({ userId: "user-1", postId: "post-1" })
    ).rejects.toMatchObject({ code: "FAVORITE_REMOVE_FAILED" });
  });
});
