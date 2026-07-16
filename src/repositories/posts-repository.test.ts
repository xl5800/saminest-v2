import { beforeEach, describe, expect, it, vi } from "vitest";

const { queryBuilder, overrideTypesMock } = vi.hoisted(() => {
  const overrideTypesMock = vi.fn();
  const builder: Record<string, ReturnType<typeof vi.fn>> = {};
  const chain = [
    "select",
    "eq",
    "is",
    "order",
    "range"
  ] as const;
  for (const method of chain) {
    builder[method] = vi.fn(() => builder);
  }
  builder.overrideTypes = overrideTypesMock;
  return { queryBuilder: builder, overrideTypesMock };
});

const fromMock = vi.fn(() => queryBuilder);

vi.mock("../integrations/supabase/client", () => ({
  getSupabaseClient: () => ({ from: fromMock })
}));

import { listApprovedPosts } from "./posts-repository";

describe("listApprovedPosts", () => {
  beforeEach(() => {
    fromMock.mockClear();
    for (const key of Object.keys(queryBuilder)) {
      queryBuilder[key].mockClear();
    }
    overrideTypesMock.mockReset();
  });

  it("filters to approved, non-deleted posts ordered by published_at desc", async () => {
    overrideTypesMock.mockResolvedValue({ data: [], error: null });

    await listApprovedPosts({ page: 0, pageSize: 20 });

    expect(fromMock).toHaveBeenCalledWith("posts");
    expect(queryBuilder.eq).toHaveBeenCalledWith("status", "approved");
    expect(queryBuilder.is).toHaveBeenCalledWith("deleted_at", null);
    expect(queryBuilder.order).toHaveBeenCalledWith("published_at", {
      ascending: false
    });
    expect(queryBuilder.range).toHaveBeenCalledWith(0, 20);
  });

  it("also filters by category when categoryId is provided", async () => {
    overrideTypesMock.mockResolvedValue({ data: [], error: null });

    await listApprovedPosts({ categoryId: "cat-1", page: 0, pageSize: 20 });

    expect(queryBuilder.eq).toHaveBeenCalledWith("status", "approved");
    expect(queryBuilder.eq).toHaveBeenCalledWith("category_id", "cat-1");
  });

  it("requests page * pageSize as the range offset", async () => {
    overrideTypesMock.mockResolvedValue({ data: [], error: null });

    await listApprovedPosts({ page: 2, pageSize: 10 });

    expect(queryBuilder.range).toHaveBeenCalledWith(20, 30);
  });

  it("maps rows to PostListItem and reports no next page when exactly pageSize rows come back", async () => {
    overrideTypesMock.mockResolvedValue({
      data: [
        {
          id: "post-1",
          title: "Sunny room",
          price_amount: 1200,
          price_label: null,
          currency_code: "USD",
          published_at: "2026-07-01T00:00:00.000Z",
          location: { name: "Rockville" }
        }
      ],
      error: null
    });

    const result = await listApprovedPosts({ page: 0, pageSize: 1 });

    expect(result).toEqual({
      posts: [
        {
          id: "post-1",
          title: "Sunny room",
          priceAmount: 1200,
          priceLabel: null,
          currencyCode: "USD",
          publishedAt: "2026-07-01T00:00:00.000Z",
          locationName: "Rockville"
        }
      ],
      hasNextPage: false
    });
  });

  it("drops the extra row and reports hasNextPage when more than pageSize rows come back", async () => {
    overrideTypesMock.mockResolvedValue({
      data: [
        {
          id: "post-1",
          title: "A",
          price_amount: null,
          price_label: "面议",
          currency_code: "USD",
          published_at: null,
          location: null
        },
        {
          id: "post-2",
          title: "B",
          price_amount: null,
          price_label: "面议",
          currency_code: "USD",
          published_at: null,
          location: null
        }
      ],
      error: null
    });

    const result = await listApprovedPosts({ page: 0, pageSize: 1 });

    expect(result.hasNextPage).toBe(true);
    expect(result.posts).toHaveLength(1);
    expect(result.posts[0].id).toBe("post-1");
  });

  it("returns an empty list without throwing when there are no matching posts", async () => {
    overrideTypesMock.mockResolvedValue({ data: [], error: null });

    const result = await listApprovedPosts({ page: 0, pageSize: 20 });

    expect(result).toEqual({ posts: [], hasNextPage: false });
  });

  it("throws an AppError when the Supabase query fails", async () => {
    overrideTypesMock.mockResolvedValue({
      data: null,
      error: { message: "network down", code: "500" }
    });

    await expect(listApprovedPosts({ page: 0, pageSize: 20 })).rejects.toMatchObject({
      code: "POSTS_LIST_FAILED"
    });
  });
});
