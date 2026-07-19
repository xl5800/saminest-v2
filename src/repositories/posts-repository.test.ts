import { beforeEach, describe, expect, it, vi } from "vitest";

const { queryBuilder, overrideTypesMock, singleMock, maybeSingleMock } = vi.hoisted(() => {
  const overrideTypesMock = vi.fn();
  const singleMock = vi.fn();
  const maybeSingleMock = vi.fn();
  const builder: Record<string, ReturnType<typeof vi.fn>> = {};
  const chain = [
    "select",
    "eq",
    "is",
    "order",
    "range",
    "insert"
  ] as const;
  for (const method of chain) {
    builder[method] = vi.fn(() => builder);
  }
  builder.overrideTypes = overrideTypesMock;
  builder.single = singleMock;
  builder.maybeSingle = maybeSingleMock;
  return { queryBuilder: builder, overrideTypesMock, singleMock, maybeSingleMock };
});

const fromMock = vi.fn(() => queryBuilder);

vi.mock("../integrations/supabase/client", () => ({
  getSupabaseClient: () => ({ from: fromMock })
}));

import {
  createPost,
  getPostAuthorId,
  listAllPosts,
  listApprovedPosts,
  listPendingPosts
} from "./posts-repository";

describe("listApprovedPosts", () => {
  beforeEach(() => {
    fromMock.mockClear();
    for (const key of Object.keys(queryBuilder)) {
      queryBuilder[key].mockClear();
    }
    overrideTypesMock.mockReset();
    singleMock.mockReset();
    maybeSingleMock.mockReset();
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

describe("createPost", () => {
  beforeEach(() => {
    fromMock.mockClear();
    for (const key of Object.keys(queryBuilder)) {
      queryBuilder[key].mockClear();
    }
    overrideTypesMock.mockReset();
    singleMock.mockReset();
    maybeSingleMock.mockReset();
  });

  it("inserts a post with status hardcoded to pending and returns the new id", async () => {
    singleMock.mockResolvedValue({ data: { id: "post-123" }, error: null });

    const result = await createPost({
      authorId: "user-1",
      categoryId: "cat-1",
      locationId: "loc-1",
      title: "Sunny room",
      description: "A description long enough.",
      priceAmount: 1200,
      contactMethod: "email",
      contactValue: "a@b.com"
    });

    expect(fromMock).toHaveBeenCalledWith("posts");
    expect(queryBuilder.insert).toHaveBeenCalledWith({
      author_id: "user-1",
      category_id: "cat-1",
      location_id: "loc-1",
      title: "Sunny room",
      description: "A description long enough.",
      price_amount: 1200,
      contact_method: "email",
      contact_value: "a@b.com",
      status: "pending"
    });
    expect(queryBuilder.select).toHaveBeenCalledWith("id");
    expect(result).toEqual({ id: "post-123" });
  });

  it("hardcodes status to pending even conceptually if a caller tried to influence it", async () => {
    singleMock.mockResolvedValue({ data: { id: "post-1" }, error: null });

    await createPost({
      authorId: "user-1",
      categoryId: "cat-1",
      locationId: null,
      title: "Title long enough",
      description: "Description long enough.",
      priceAmount: null,
      contactMethod: null,
      contactValue: null
    });

    const insertedPayload = queryBuilder.insert.mock.calls[0][0];
    expect(insertedPayload.status).toBe("pending");
  });

  it("throws an AppError when the insert fails", async () => {
    singleMock.mockResolvedValue({
      data: null,
      error: { message: "insert failed", code: "500" }
    });

    await expect(
      createPost({
        authorId: "user-1",
        categoryId: "cat-1",
        locationId: null,
        title: "Title long enough",
        description: "Description long enough.",
        priceAmount: null,
        contactMethod: null,
        contactValue: null
      })
    ).rejects.toMatchObject({ code: "POST_CREATE_FAILED" });
  });

  it("throws an AppError when insert succeeds but no row id is returned", async () => {
    singleMock.mockResolvedValue({ data: null, error: null });

    await expect(
      createPost({
        authorId: "user-1",
        categoryId: "cat-1",
        locationId: null,
        title: "Title long enough",
        description: "Description long enough.",
        priceAmount: null,
        contactMethod: null,
        contactValue: null
      })
    ).rejects.toMatchObject({ code: "POST_CREATE_ID_MISSING" });
  });
});

describe("listPendingPosts", () => {
  beforeEach(() => {
    fromMock.mockClear();
    for (const key of Object.keys(queryBuilder)) {
      queryBuilder[key].mockClear();
    }
    overrideTypesMock.mockReset();
    singleMock.mockReset();
    maybeSingleMock.mockReset();
  });

  it("filters to pending, non-deleted posts ordered by created_at ascending, with a nested author/category select", async () => {
    overrideTypesMock.mockResolvedValue({ data: [], error: null });

    await listPendingPosts();

    expect(fromMock).toHaveBeenCalledWith("posts");
    expect(queryBuilder.select).toHaveBeenCalledWith(
      "id, title, created_at, author:profiles(display_name), category:categories(name_zh)"
    );
    expect(queryBuilder.eq).toHaveBeenCalledWith("status", "pending");
    expect(queryBuilder.is).toHaveBeenCalledWith("deleted_at", null);
    expect(queryBuilder.order).toHaveBeenCalledWith("created_at", { ascending: true });
  });

  it("maps rows to AdminPostListItem including author and category names", async () => {
    overrideTypesMock.mockResolvedValue({
      data: [
        {
          id: "post-1",
          title: "Sunny room",
          created_at: "2026-07-01T00:00:00.000Z",
          author: { display_name: "Alice" },
          category: { name_zh: "租房" }
        }
      ],
      error: null
    });

    const result = await listPendingPosts();

    expect(result).toEqual([
      {
        id: "post-1",
        title: "Sunny room",
        createdAt: "2026-07-01T00:00:00.000Z",
        authorName: "Alice",
        categoryName: "租房",
        status: "pending"
      }
    ]);
  });

  it("falls back to placeholder text when the joined author or category is missing", async () => {
    overrideTypesMock.mockResolvedValue({
      data: [
        {
          id: "post-1",
          title: "Sunny room",
          created_at: "2026-07-01T00:00:00.000Z",
          author: null,
          category: null
        }
      ],
      error: null
    });

    const result = await listPendingPosts();

    expect(result[0].authorName).toBe("未知用户");
    expect(result[0].categoryName).toBe("未知分类");
  });

  it("returns an empty list without throwing when there are no pending posts", async () => {
    overrideTypesMock.mockResolvedValue({ data: [], error: null });

    await expect(listPendingPosts()).resolves.toEqual([]);
  });

  it("throws an AppError when the Supabase query fails", async () => {
    overrideTypesMock.mockResolvedValue({
      data: null,
      error: { message: "network down", code: "500" }
    });

    await expect(listPendingPosts()).rejects.toMatchObject({
      code: "ADMIN_PENDING_POSTS_LIST_FAILED"
    });
  });
});

describe("getPostAuthorId", () => {
  beforeEach(() => {
    fromMock.mockClear();
    for (const key of Object.keys(queryBuilder)) {
      queryBuilder[key].mockClear();
    }
    overrideTypesMock.mockReset();
    singleMock.mockReset();
    maybeSingleMock.mockReset();
  });

  it("returns the post's author id when the post exists", async () => {
    maybeSingleMock.mockResolvedValue({
      data: { author_id: "user-1" },
      error: null
    });

    const result = await getPostAuthorId("post-1");

    expect(fromMock).toHaveBeenCalledWith("posts");
    expect(queryBuilder.select).toHaveBeenCalledWith("author_id");
    expect(queryBuilder.eq).toHaveBeenCalledWith("id", "post-1");
    expect(result).toBe("user-1");
  });

  it("returns null without throwing when the post does not exist", async () => {
    maybeSingleMock.mockResolvedValue({ data: null, error: null });

    await expect(getPostAuthorId("missing-post")).resolves.toBeNull();
  });

  it("throws an AppError when the query fails", async () => {
    maybeSingleMock.mockResolvedValue({
      data: null,
      error: { message: "network down", code: "500" }
    });

    await expect(getPostAuthorId("post-1")).rejects.toMatchObject({
      code: "POST_AUTHOR_FETCH_FAILED"
    });
  });
});

describe("listAllPosts", () => {
  beforeEach(() => {
    fromMock.mockClear();
    for (const key of Object.keys(queryBuilder)) {
      queryBuilder[key].mockClear();
    }
    overrideTypesMock.mockReset();
    singleMock.mockReset();
    maybeSingleMock.mockReset();
  });

  it("excludes soft-deleted posts, orders by created_at descending, and does not filter by status by default", async () => {
    overrideTypesMock.mockResolvedValue({ data: [], error: null });

    await listAllPosts();

    expect(fromMock).toHaveBeenCalledWith("posts");
    expect(queryBuilder.select).toHaveBeenCalledWith(
      "id, title, created_at, status, author:profiles(display_name), category:categories(name_zh)"
    );
    expect(queryBuilder.is).toHaveBeenCalledWith("deleted_at", null);
    expect(queryBuilder.order).toHaveBeenCalledWith("created_at", { ascending: false });
    expect(queryBuilder.eq).not.toHaveBeenCalled();
  });

  it("also filters by status when statusFilter is provided", async () => {
    overrideTypesMock.mockResolvedValue({ data: [], error: null });

    await listAllPosts("approved");

    expect(queryBuilder.eq).toHaveBeenCalledWith("status", "approved");
  });

  it("maps rows to AdminPostListItem including status, author, and category names", async () => {
    overrideTypesMock.mockResolvedValue({
      data: [
        {
          id: "post-1",
          title: "Sunny room",
          created_at: "2026-07-01T00:00:00.000Z",
          status: "approved",
          author: { display_name: "Alice" },
          category: { name_zh: "租房" }
        }
      ],
      error: null
    });

    const result = await listAllPosts();

    expect(result).toEqual([
      {
        id: "post-1",
        title: "Sunny room",
        createdAt: "2026-07-01T00:00:00.000Z",
        authorName: "Alice",
        categoryName: "租房",
        status: "approved"
      }
    ]);
  });

  it("falls back to placeholder text when the joined author or category is missing", async () => {
    overrideTypesMock.mockResolvedValue({
      data: [
        {
          id: "post-1",
          title: "Sunny room",
          created_at: "2026-07-01T00:00:00.000Z",
          status: "rejected",
          author: null,
          category: null
        }
      ],
      error: null
    });

    const result = await listAllPosts();

    expect(result[0].authorName).toBe("未知用户");
    expect(result[0].categoryName).toBe("未知分类");
  });

  it("returns an empty list without throwing when there are no posts", async () => {
    overrideTypesMock.mockResolvedValue({ data: [], error: null });

    await expect(listAllPosts()).resolves.toEqual([]);
  });

  it("throws an AppError when the Supabase query fails", async () => {
    overrideTypesMock.mockResolvedValue({
      data: null,
      error: { message: "network down", code: "500" }
    });

    await expect(listAllPosts()).rejects.toMatchObject({
      code: "ADMIN_ALL_POSTS_LIST_FAILED"
    });
  });
});
