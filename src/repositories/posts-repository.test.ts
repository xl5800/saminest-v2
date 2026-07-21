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
    "insert",
    "limit",
    "or"
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
  getPostDetail,
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

  it("filters to approved, non-deleted posts ordered by published_at desc, with a nested category/author/cover-image select", async () => {
    overrideTypesMock.mockResolvedValue({ data: [], error: null });

    await listApprovedPosts({ page: 0, pageSize: 20 });

    expect(fromMock).toHaveBeenCalledWith("posts");
    expect(queryBuilder.select).toHaveBeenCalledWith(
      "id, title, price_amount, price_label, currency_code, published_at, favorite_count, location:locations(name), category:categories(name_zh), author:profiles(display_name), post_images(public_url, sort_order, deleted_at)"
    );
    expect(queryBuilder.eq).toHaveBeenCalledWith("status", "approved");
    expect(queryBuilder.is).toHaveBeenCalledWith("deleted_at", null);
    expect(queryBuilder.order).toHaveBeenCalledWith("published_at", {
      ascending: false
    });
    expect(queryBuilder.order).toHaveBeenCalledWith("sort_order", {
      foreignTable: "post_images",
      ascending: true
    });
    expect(queryBuilder.limit).toHaveBeenCalledWith(1, { foreignTable: "post_images" });
    expect(queryBuilder.range).toHaveBeenCalledWith(0, 20);
  });

  it("also filters by category when categoryId is provided", async () => {
    overrideTypesMock.mockResolvedValue({ data: [], error: null });

    await listApprovedPosts({ categoryId: "cat-1", page: 0, pageSize: 20 });

    expect(queryBuilder.eq).toHaveBeenCalledWith("status", "approved");
    expect(queryBuilder.eq).toHaveBeenCalledWith("category_id", "cat-1");
  });

  it("filters by title/description ilike when searchQuery is provided", async () => {
    overrideTypesMock.mockResolvedValue({ data: [], error: null });

    await listApprovedPosts({ searchQuery: "sunny room", page: 0, pageSize: 20 });

    expect(queryBuilder.or).toHaveBeenCalledWith(
      "title.ilike.%sunny room%,description.ilike.%sunny room%"
    );
  });

  it("combines the search filter with the category filter (both apply together)", async () => {
    overrideTypesMock.mockResolvedValue({ data: [], error: null });

    await listApprovedPosts({
      categoryId: "cat-1",
      searchQuery: "sunny",
      page: 0,
      pageSize: 20
    });

    expect(queryBuilder.eq).toHaveBeenCalledWith("category_id", "cat-1");
    expect(queryBuilder.or).toHaveBeenCalledWith(
      "title.ilike.%sunny%,description.ilike.%sunny%"
    );
  });

  it("sanitizes a search term containing PostgREST-significant and ILIKE-wildcard characters before passing it to .or()", async () => {
    overrideTypesMock.mockResolvedValue({ data: [], error: null });

    await listApprovedPosts({
      searchQuery: "50% off, (great) deal_now\\",
      page: 0,
      pageSize: 20
    });

    // "," "(" ")" 整个丢弃；"%" "_" "\\" 转义成字面字符（先转义 \，避免
    // 转义出来的反斜杠又被后面 %/_ 那两条规则再转义一遍）。
    expect(queryBuilder.or).toHaveBeenCalledWith(
      "title.ilike.%50\\% off great deal\\_now\\\\%,description.ilike.%50\\% off great deal\\_now\\\\%"
    );
  });

  it("does not call .or() at all when searchQuery is empty or whitespace-only", async () => {
    overrideTypesMock.mockResolvedValue({ data: [], error: null });

    await listApprovedPosts({ searchQuery: "   ", page: 0, pageSize: 20 });

    expect(queryBuilder.or).not.toHaveBeenCalled();
  });

  it("does not call .or() at all when searchQuery is a string that sanitizes down to nothing (only , ( ) characters)", async () => {
    overrideTypesMock.mockResolvedValue({ data: [], error: null });

    await listApprovedPosts({ searchQuery: " (),( ", page: 0, pageSize: 20 });

    expect(queryBuilder.or).not.toHaveBeenCalled();
  });

  it("does not call .or() at all when searchQuery is not provided", async () => {
    overrideTypesMock.mockResolvedValue({ data: [], error: null });

    await listApprovedPosts({ page: 0, pageSize: 20 });

    expect(queryBuilder.or).not.toHaveBeenCalled();
  });

  it("requests page * pageSize as the range offset", async () => {
    overrideTypesMock.mockResolvedValue({ data: [], error: null });

    await listApprovedPosts({ page: 2, pageSize: 10 });

    expect(queryBuilder.range).toHaveBeenCalledWith(20, 30);
  });

  it("maps rows to PostFeedItem (including category, author, cover image, favorite count) and reports no next page when exactly pageSize rows come back", async () => {
    overrideTypesMock.mockResolvedValue({
      data: [
        {
          id: "post-1",
          title: "Sunny room",
          price_amount: 1200,
          price_label: null,
          currency_code: "USD",
          published_at: "2026-07-01T00:00:00.000Z",
          favorite_count: 3,
          location: { name: "Rockville" },
          category: { name_zh: "租房" },
          author: { display_name: "Alice" },
          post_images: [
            { public_url: "https://img.example.com/cover.jpg", sort_order: 0, deleted_at: null }
          ]
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
          locationName: "Rockville",
          categoryName: "租房",
          authorDisplayName: "Alice",
          coverImageUrl: "https://img.example.com/cover.jpg",
          favoriteCount: 3
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
          favorite_count: 0,
          location: null,
          category: null,
          author: null,
          post_images: []
        },
        {
          id: "post-2",
          title: "B",
          price_amount: null,
          price_label: "面议",
          currency_code: "USD",
          published_at: null,
          favorite_count: 0,
          location: null,
          category: null,
          author: null,
          post_images: []
        }
      ],
      error: null
    });

    const result = await listApprovedPosts({ page: 0, pageSize: 1 });

    expect(result.hasNextPage).toBe(true);
    expect(result.posts).toHaveLength(1);
    expect(result.posts[0].id).toBe("post-1");
  });

  it("returns coverImageUrl: null when a post has no post_images rows at all", async () => {
    overrideTypesMock.mockResolvedValue({
      data: [
        {
          id: "post-1",
          title: "No photo listing",
          price_amount: null,
          price_label: "面议",
          currency_code: "USD",
          published_at: null,
          favorite_count: 0,
          location: null,
          category: { name_zh: "二手" },
          author: { display_name: "Bob" },
          post_images: []
        }
      ],
      error: null
    });

    const result = await listApprovedPosts({ page: 0, pageSize: 20 });

    expect(result.posts[0].coverImageUrl).toBeNull();
  });

  it("returns coverImageUrl: null when the one embedded image row is soft-deleted", async () => {
    overrideTypesMock.mockResolvedValue({
      data: [
        {
          id: "post-1",
          title: "Deleted cover listing",
          price_amount: null,
          price_label: "面议",
          currency_code: "USD",
          published_at: null,
          favorite_count: 0,
          location: null,
          category: { name_zh: "二手" },
          author: { display_name: "Bob" },
          post_images: [
            {
              public_url: "https://img.example.com/deleted.jpg",
              sort_order: 0,
              deleted_at: "2026-07-02T00:00:00.000Z"
            }
          ]
        }
      ],
      error: null
    });

    const result = await listApprovedPosts({ page: 0, pageSize: 20 });

    expect(result.posts[0].coverImageUrl).toBeNull();
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

  it("throws a distinct ACCOUNT_RESTRICTED AppError with a friendly message on an RLS violation (42501)", async () => {
    singleMock.mockResolvedValue({
      data: null,
      error: {
        message: "new row violates row-level security policy for table \"posts\"",
        code: "42501"
      }
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
    ).rejects.toMatchObject({
      code: "ACCOUNT_RESTRICTED",
      message: "您的账号当前处于限制状态，无法执行此操作，如有疑问请联系管理员。"
    });
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

describe("getPostDetail", () => {
  beforeEach(() => {
    fromMock.mockClear();
    for (const key of Object.keys(queryBuilder)) {
      queryBuilder[key].mockClear();
    }
    overrideTypesMock.mockReset();
    singleMock.mockReset();
    maybeSingleMock.mockReset();
    // getPostDetail 在 .maybeSingle() 之后还链式调用 .overrideTypes()（跟
    // listApprovedPosts 处理嵌套 select 类型的方式一致），所以这里让
    // maybeSingle() 返回 builder 本身以便继续链式调用，由 overrideTypesMock
    // 负责最终 resolve 出 { data, error }——跟 favorites-repository.test.ts
    // 里 eq()/overrideTypes() 链式调用的处理方式是同一个模式。
    maybeSingleMock.mockReturnValue(queryBuilder);
  });

  it("returns full post detail with images ordered by sort_order, excluding a soft-deleted image, when the post exists and is visible (RLS already filtered)", async () => {
    overrideTypesMock.mockResolvedValue({
      data: {
        id: "post-1",
        title: "Sunny room",
        description: "A lovely room near the metro.",
        price_amount: 1200,
        price_label: null,
        currency_code: "USD",
        published_at: "2026-07-01T00:00:00.000Z",
        contact_method: "email",
        contact_value: "a@b.com",
        location: { name: "Rockville" },
        category: { name_zh: "租房" },
        author: { display_name: "Alice" },
        post_images: [
          { id: "img-1", public_url: "https://img.example.com/1.jpg", sort_order: 0, deleted_at: null },
          {
            id: "img-deleted",
            public_url: "https://img.example.com/deleted.jpg",
            sort_order: 1,
            deleted_at: "2026-07-02T00:00:00.000Z"
          },
          { id: "img-2", public_url: "https://img.example.com/2.jpg", sort_order: 2, deleted_at: null }
        ]
      },
      error: null
    });

    const result = await getPostDetail("post-1");

    expect(fromMock).toHaveBeenCalledWith("posts");
    expect(queryBuilder.eq).toHaveBeenCalledWith("id", "post-1");
    expect(queryBuilder.is).toHaveBeenCalledWith("deleted_at", null);
    expect(queryBuilder.order).toHaveBeenCalledWith("sort_order", {
      foreignTable: "post_images",
      ascending: true
    });
    expect(result).toEqual({
      id: "post-1",
      title: "Sunny room",
      description: "A lovely room near the metro.",
      priceAmount: 1200,
      priceLabel: null,
      currencyCode: "USD",
      categoryName: "租房",
      locationName: "Rockville",
      publishedAt: "2026-07-01T00:00:00.000Z",
      authorDisplayName: "Alice",
      contactMethod: "email",
      contactValue: "a@b.com",
      images: [
        { id: "img-1", publicUrl: "https://img.example.com/1.jpg", sortOrder: 0 },
        { id: "img-2", publicUrl: "https://img.example.com/2.jpg", sortOrder: 2 }
      ]
    });
  });

  it("does not filter by status — visibility is left entirely to RLS", async () => {
    overrideTypesMock.mockResolvedValue({ data: null, error: null });

    await getPostDetail("post-1");

    expect(queryBuilder.eq).not.toHaveBeenCalledWith("status", expect.anything());
  });

  it("returns null without throwing when the post does not exist or is not visible to the current viewer", async () => {
    overrideTypesMock.mockResolvedValue({ data: null, error: null });

    await expect(getPostDetail("missing-or-invisible-post")).resolves.toBeNull();
  });

  it("throws an AppError when the Supabase query fails", async () => {
    overrideTypesMock.mockResolvedValue({
      data: null,
      error: { message: "network down", code: "500" }
    });

    await expect(getPostDetail("post-1")).rejects.toMatchObject({
      code: "POST_DETAIL_FETCH_FAILED"
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
