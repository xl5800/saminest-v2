import { beforeEach, describe, expect, it, vi } from "vitest";

const { queryBuilder, eqMock, insertMock, matchMock, overrideTypesMock } = vi.hoisted(() => {
  const eqMock = vi.fn();
  const insertMock = vi.fn();
  const matchMock = vi.fn();
  const overrideTypesMock = vi.fn();
  const builder: Record<string, ReturnType<typeof vi.fn>> = {};
  builder.select = vi.fn(() => builder);
  builder.eq = eqMock;
  builder.insert = insertMock;
  builder.delete = vi.fn(() => builder);
  builder.match = matchMock;
  builder.overrideTypes = overrideTypesMock;
  return { queryBuilder: builder, eqMock, insertMock, matchMock, overrideTypesMock };
});

const fromMock = vi.fn(() => queryBuilder);

vi.mock("../integrations/supabase/client", () => ({
  getSupabaseClient: () => ({ from: fromMock })
}));

import {
  addFavorite,
  listFavoritedPostIds,
  listFavoritedPosts,
  removeFavorite
} from "./favorites-repository";

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

describe("listFavoritedPosts", () => {
  beforeEach(() => {
    fromMock.mockClear();
    queryBuilder.select.mockClear();
    queryBuilder.delete.mockClear();
    eqMock.mockReset();
    insertMock.mockReset();
    matchMock.mockReset();
    overrideTypesMock.mockReset();
    // 跟 listFavoritedPostIds 不同，这个函数在 .eq() 之后还要链式调用
    // .overrideTypes()，所以这里让 eq() 返回 builder 本身（可继续链式调用），
    // 由 overrideTypesMock 负责最终 resolve 出 { data, error }。
    eqMock.mockReturnValue(queryBuilder);
  });

  it("returns the favorited posts, mapped to PostListItem, for the given user", async () => {
    overrideTypesMock.mockResolvedValue({
      data: [
        {
          post: {
            id: "post-1",
            title: "Sunny room",
            price_amount: 1200,
            price_label: null,
            currency_code: "USD",
            published_at: "2026-07-01T00:00:00.000Z",
            deleted_at: null,
            location: { name: "Rockville" }
          }
        }
      ],
      error: null
    });

    const result = await listFavoritedPosts("user-1");

    expect(fromMock).toHaveBeenCalledWith("favorites");
    expect(queryBuilder.select).toHaveBeenCalledWith(
      "post:posts(id, title, price_amount, price_label, currency_code, published_at, deleted_at, location:locations(name))"
    );
    expect(eqMock).toHaveBeenCalledWith("user_id", "user-1");
    expect(result).toEqual([
      {
        id: "post-1",
        title: "Sunny room",
        priceAmount: 1200,
        priceLabel: null,
        currencyCode: "USD",
        locationName: "Rockville",
        publishedAt: "2026-07-01T00:00:00.000Z"
      }
    ]);
  });

  it("filters out favorites whose post has been soft-deleted", async () => {
    overrideTypesMock.mockResolvedValue({
      data: [
        {
          post: {
            id: "post-1",
            title: "Sunny room",
            price_amount: 1200,
            price_label: null,
            currency_code: "USD",
            published_at: "2026-07-01T00:00:00.000Z",
            deleted_at: "2026-07-10T00:00:00.000Z",
            location: null
          }
        },
        {
          post: {
            id: "post-2",
            title: "Cozy studio",
            price_amount: 900,
            price_label: null,
            currency_code: "USD",
            published_at: "2026-07-02T00:00:00.000Z",
            deleted_at: null,
            location: null
          }
        }
      ],
      error: null
    });

    const result = await listFavoritedPosts("user-1");

    expect(result).toEqual([
      {
        id: "post-2",
        title: "Cozy studio",
        priceAmount: 900,
        priceLabel: null,
        currencyCode: "USD",
        locationName: null,
        publishedAt: "2026-07-02T00:00:00.000Z"
      }
    ]);
  });

  it("returns an empty array when the user has no favorites", async () => {
    overrideTypesMock.mockResolvedValue({ data: [], error: null });

    await expect(listFavoritedPosts("user-1")).resolves.toEqual([]);
  });

  it("throws an AppError when the query fails", async () => {
    overrideTypesMock.mockResolvedValue({
      data: null,
      error: { message: "network down", code: "500" }
    });

    await expect(listFavoritedPosts("user-1")).rejects.toMatchObject({
      code: "FAVORITED_POSTS_LIST_FAILED"
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
