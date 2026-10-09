import { beforeEach, describe, expect, it, vi } from "vitest";

const { queryBuilder, singleMock, maybeSingleMock, updateMock, overrideTypesMock, insertMock } = vi.hoisted(() => {
  const singleMock = vi.fn();
  const maybeSingleMock = vi.fn();
  const updateMock = vi.fn();
  const overrideTypesMock = vi.fn();
  const insertMock = vi.fn();
  const builder: Record<string, ReturnType<typeof vi.fn>> = {};
  for (const name of ["select", "eq", "is", "order", "range", "gte"]) {
    builder[name] = vi.fn(() => builder);
  }
  builder.insert = insertMock;
  builder.single = singleMock;
  builder.maybeSingle = maybeSingleMock;
  builder.update = updateMock;
  builder.overrideTypes = overrideTypesMock;
  return { queryBuilder: builder, singleMock, maybeSingleMock, updateMock, overrideTypesMock, insertMock };
});

const fromMock = vi.fn(() => queryBuilder);

vi.mock("../integrations/supabase/client", () => ({
  getSupabaseClient: () => ({ from: fromMock })
}));

import {
  countCommunityPostsSince,
  createCommunityPost,
  deleteCommunityPost,
  getCommunityBySlug,
  getCommunityPostDetail,
  isCommunityMember,
  joinCommunity,
  listCommunityPosts,
  listMyCommunityPosts,
  updateCommunityPost
} from "./community-repository";

const RESTRICTED_MESSAGE = "您的账号当前处于限制状态，无法执行此操作，如有疑问请联系管理员。";

function makeRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "cp-1",
    post_type: "discussion",
    title: "标题",
    body: "正文",
    pinned: false,
    comment_count: 2,
    favorite_count: 3,
    created_at: "2026-08-01T00:00:00.000Z",
    author_id: "user-1",
    author: { display_name: "Alice", avatar_url: "https://x/a.png" },
    community_post_images: [],
    ...overrides
  };
}

beforeEach(() => {
  fromMock.mockClear();
  for (const fn of Object.values(queryBuilder)) fn.mockClear();
  singleMock.mockReset();
  overrideTypesMock.mockReset();
  insertMock.mockReset();
  maybeSingleMock.mockReset();
  updateMock.mockReset();
  updateMock.mockReturnValue(queryBuilder);
  // insert() 既要能直接 resolve（joinCommunity），也要能继续链式调用
  // （createCommunityPost: insert().select().single()），按用例各自覆盖。
  insertMock.mockReturnValue(queryBuilder);
});

describe("getCommunityBySlug", () => {
  it("queries communities by slug and maps the row", async () => {
    singleMock.mockResolvedValue({
      data: {
        id: "c-1",
        name: "DMV 社区",
        slug: "dmv",
        description: "覆盖 DC / Maryland / Virginia 的本地华人讨论区",
        member_count: 12,
        is_official: true
      },
      error: null
    });

    const result = await getCommunityBySlug("dmv");

    expect(fromMock).toHaveBeenCalledWith("communities");
    expect(queryBuilder.select).toHaveBeenCalledWith(
      "id, name, slug, description, member_count, is_official"
    );
    expect(queryBuilder.eq).toHaveBeenCalledWith("slug", "dmv");
    expect(result).toEqual({
      id: "c-1",
      name: "DMV 社区",
      slug: "dmv",
      description: "覆盖 DC / Maryland / Virginia 的本地华人讨论区",
      memberCount: 12,
      isOfficial: true
    });
  });

  // DMV 种子行建表时没填 description，线上就是 null——必须原样透传 null，
  // 不能被转成空字符串或 undefined，调用方靠 null 判断要不要用兜底文案。
  it("passes a null description through unchanged", async () => {
    singleMock.mockResolvedValue({
      data: {
        id: "c-1",
        name: "DMV 社区",
        slug: "dmv",
        description: null,
        member_count: 0,
        is_official: false
      },
      error: null
    });

    const result = await getCommunityBySlug("dmv");

    expect(result.description).toBeNull();
    expect(result.memberCount).toBe(0);
  });

  it("throws COMMUNITY_FETCH_FAILED when the query fails", async () => {
    singleMock.mockResolvedValue({ data: null, error: { message: "boom", code: "500" } });

    await expect(getCommunityBySlug("dmv")).rejects.toMatchObject({
      code: "COMMUNITY_FETCH_FAILED"
    });
  });
});

describe("isCommunityMember", () => {
  it("queries community_members by (community_id, user_id) and returns true when a row exists", async () => {
    maybeSingleMock.mockResolvedValue({ data: { community_id: "c-1" }, error: null });

    const result = await isCommunityMember("c-1", "user-1");

    expect(fromMock).toHaveBeenCalledWith("community_members");
    expect(queryBuilder.eq).toHaveBeenCalledWith("community_id", "c-1");
    expect(queryBuilder.eq).toHaveBeenCalledWith("user_id", "user-1");
    expect(result).toBe(true);
  });

  it("returns false (not an error) when the user has not joined", async () => {
    maybeSingleMock.mockResolvedValue({ data: null, error: null });

    await expect(isCommunityMember("c-1", "user-1")).resolves.toBe(false);
  });

  it("throws COMMUNITY_MEMBERSHIP_FETCH_FAILED when the query fails", async () => {
    maybeSingleMock.mockResolvedValue({ data: null, error: { message: "boom", code: "500" } });

    await expect(isCommunityMember("c-1", "user-1")).rejects.toMatchObject({
      code: "COMMUNITY_MEMBERSHIP_FETCH_FAILED"
    });
  });
});

describe("countCommunityPostsSince", () => {
  it("counts only visible posts (approved, not soft-deleted) created since the given time, without fetching rows", async () => {
    queryBuilder.gte.mockResolvedValue({ count: 3, error: null });

    const result = await countCommunityPostsSince("c-1", "2026-10-08T04:00:00.000Z");

    expect(fromMock).toHaveBeenCalledWith("community_posts");
    expect(queryBuilder.select).toHaveBeenCalledWith("id", { count: "exact", head: true });
    expect(queryBuilder.eq).toHaveBeenCalledWith("community_id", "c-1");
    expect(queryBuilder.eq).toHaveBeenCalledWith("status", "approved");
    expect(queryBuilder.is).toHaveBeenCalledWith("deleted_at", null);
    expect(queryBuilder.gte).toHaveBeenCalledWith("created_at", "2026-10-08T04:00:00.000Z");
    expect(result).toBe(3);
  });

  it("treats a null count as 0", async () => {
    queryBuilder.gte.mockResolvedValue({ count: null, error: null });

    await expect(countCommunityPostsSince("c-1", "2026-10-08T04:00:00.000Z")).resolves.toBe(0);
  });

  it("throws COMMUNITY_POST_COUNT_FAILED when the query fails", async () => {
    queryBuilder.gte.mockResolvedValue({ count: null, error: { message: "boom", code: "500" } });

    await expect(countCommunityPostsSince("c-1", "2026-10-08T04:00:00.000Z")).rejects.toMatchObject({
      code: "COMMUNITY_POST_COUNT_FAILED"
    });
  });
});

describe("joinCommunity", () => {
  it("inserts a community_members row", async () => {
    insertMock.mockResolvedValue({ error: null });

    await joinCommunity({ communityId: "c-1", userId: "user-1" });

    expect(fromMock).toHaveBeenCalledWith("community_members");
    expect(insertMock).toHaveBeenCalledWith({ community_id: "c-1", user_id: "user-1" });
  });

  it("swallows a unique violation (already a member)", async () => {
    insertMock.mockResolvedValue({ error: { message: "duplicate", code: "23505" } });

    await expect(joinCommunity({ communityId: "c-1", userId: "user-1" })).resolves.toBeUndefined();
  });

  it("maps 42501 to ACCOUNT_RESTRICTED", async () => {
    insertMock.mockResolvedValue({ error: { message: "rls", code: "42501" } });

    await expect(joinCommunity({ communityId: "c-1", userId: "user-1" })).rejects.toMatchObject({
      code: "ACCOUNT_RESTRICTED",
      message: RESTRICTED_MESSAGE
    });
  });

  it("throws COMMUNITY_JOIN_FAILED for other errors", async () => {
    insertMock.mockResolvedValue({ error: { message: "boom", code: "500" } });

    await expect(joinCommunity({ communityId: "c-1", userId: "user-1" })).rejects.toMatchObject({
      code: "COMMUNITY_JOIN_FAILED"
    });
  });
});

describe("listCommunityPosts", () => {
  it("filters approved, non-deleted posts of the community, pinned first then newest, and fetches pageSize + 1 rows", async () => {
    overrideTypesMock.mockResolvedValue({ data: [], error: null });

    await listCommunityPosts({ communityId: "c-1", page: 2, pageSize: 20 });

    expect(fromMock).toHaveBeenCalledWith("community_posts");
    expect(queryBuilder.eq).toHaveBeenCalledWith("community_id", "c-1");
    expect(queryBuilder.eq).toHaveBeenCalledWith("status", "approved");
    expect(queryBuilder.is).toHaveBeenCalledWith("deleted_at", null);
    expect(queryBuilder.order).toHaveBeenNthCalledWith(1, "pinned", { ascending: false });
    expect(queryBuilder.order).toHaveBeenNthCalledWith(2, "created_at", { ascending: false });
    expect(queryBuilder.range).toHaveBeenCalledWith(40, 60);
  });

  it("embeds community_post_images, ordered by sort_order on the embedded table, without limiting it in SQL", async () => {
    overrideTypesMock.mockResolvedValue({ data: [], error: null });

    await listCommunityPosts({ communityId: "c-1", page: 0, pageSize: 20 });

    expect(queryBuilder.select).toHaveBeenCalledWith(
      expect.stringContaining("community_post_images(public_url, sort_order, deleted_at)")
    );
    expect(queryBuilder.order).toHaveBeenCalledWith("sort_order", {
      foreignTable: "community_post_images",
      ascending: true
    });
  });

  it("uses the lowest-sort_order non-deleted image as coverImageUrl, and null when there are no images", async () => {
    overrideTypesMock.mockResolvedValue({
      data: [
        makeRow({
          id: "with-images",
          community_post_images: [
            { public_url: "https://x/deleted.webp", sort_order: 0, deleted_at: "2026-08-02T00:00:00.000Z" },
            { public_url: "https://x/second.webp", sort_order: 2, deleted_at: null },
            { public_url: "https://x/first.webp", sort_order: 1, deleted_at: null }
          ]
        }),
        makeRow({ id: "no-images", community_post_images: [] }),
        makeRow({ id: "null-images", community_post_images: null })
      ],
      error: null
    });

    const result = await listCommunityPosts({ communityId: "c-1", page: 0, pageSize: 20 });

    expect(result.posts.map((p) => [p.id, p.coverImageUrl])).toEqual([
      ["with-images", "https://x/first.webp"],
      ["no-images", null],
      ["null-images", null]
    ]);
  });

  it("maps rows and reports hasNextPage=false when rows do not exceed pageSize", async () => {
    overrideTypesMock.mockResolvedValue({ data: [makeRow()], error: null });

    const result = await listCommunityPosts({ communityId: "c-1", page: 0, pageSize: 20 });

    expect(result.hasNextPage).toBe(false);
    expect(result.posts).toEqual([
      {
        id: "cp-1",
        postType: "discussion",
        title: "标题",
        body: "正文",
        pinned: false,
        commentCount: 2,
        favoriteCount: 3,
        createdAt: "2026-08-01T00:00:00.000Z",
        authorId: "user-1",
        authorDisplayName: "Alice",
        authorAvatarUrl: "https://x/a.png",
        coverImageUrl: null
      }
    ]);
  });

  it("drops the extra row and reports hasNextPage=true when more than pageSize rows come back", async () => {
    overrideTypesMock.mockResolvedValue({
      data: [makeRow({ id: "a" }), makeRow({ id: "b" }), makeRow({ id: "c" })],
      error: null
    });

    const result = await listCommunityPosts({ communityId: "c-1", page: 0, pageSize: 2 });

    expect(result.hasNextPage).toBe(true);
    expect(result.posts.map((p) => p.id)).toEqual(["a", "b"]);
  });

  it("falls back to a placeholder author when the profile join is null", async () => {
    overrideTypesMock.mockResolvedValue({ data: [makeRow({ author: null })], error: null });

    const result = await listCommunityPosts({ communityId: "c-1", page: 0, pageSize: 20 });

    expect(result.posts[0]).toMatchObject({ authorDisplayName: "未知用户", authorAvatarUrl: null });
  });

  it("throws COMMUNITY_POSTS_LIST_FAILED when the query fails", async () => {
    overrideTypesMock.mockResolvedValue({ data: null, error: { message: "boom", code: "500" } });

    await expect(
      listCommunityPosts({ communityId: "c-1", page: 0, pageSize: 20 })
    ).rejects.toMatchObject({ code: "COMMUNITY_POSTS_LIST_FAILED" });
  });
});

describe("getCommunityPostDetail", () => {
  beforeEach(() => {
    // single() 之后还要链式 overrideTypes()，所以这里返回 builder 本身。
    singleMock.mockReturnValue(queryBuilder);
  });

  it("fetches a single post by id and maps it including communityId", async () => {
    overrideTypesMock.mockResolvedValue({
      data: makeRow({ community_id: "c-1" }),
      error: null
    });

    const result = await getCommunityPostDetail("cp-1");

    expect(queryBuilder.eq).toHaveBeenCalledWith("id", "cp-1");
    expect(result).toMatchObject({
      id: "cp-1",
      communityId: "c-1",
      commentCount: 2,
      favoriteCount: 3,
      authorDisplayName: "Alice"
    });
  });

  it("returns all non-deleted image urls in sort_order order (dropping soft-deleted and url-less rows) plus the cover", async () => {
    overrideTypesMock.mockResolvedValue({
      data: makeRow({
        community_id: "c-1",
        community_post_images: [
          { public_url: "https://x/3.webp", sort_order: 2, deleted_at: null },
          { public_url: "https://x/deleted.webp", sort_order: 1, deleted_at: "2026-08-02T00:00:00.000Z" },
          { public_url: null, sort_order: 3, deleted_at: null },
          { public_url: "https://x/1.webp", sort_order: 0, deleted_at: null }
        ]
      }),
      error: null
    });

    const result = await getCommunityPostDetail("cp-1");

    expect(queryBuilder.select).toHaveBeenCalledWith(
      expect.stringContaining("community_post_images(public_url, sort_order, deleted_at)")
    );
    expect(queryBuilder.order).toHaveBeenCalledWith("sort_order", {
      foreignTable: "community_post_images",
      ascending: true
    });
    expect(result.images).toEqual(["https://x/1.webp", "https://x/3.webp"]);
    expect(result.coverImageUrl).toBe("https://x/1.webp");
  });

  it("returns an empty images array and a null cover for a post without images", async () => {
    overrideTypesMock.mockResolvedValue({ data: makeRow({ community_id: "c-1" }), error: null });

    const result = await getCommunityPostDetail("cp-1");

    expect(result.images).toEqual([]);
    expect(result.coverImageUrl).toBeNull();
  });

  it("throws COMMUNITY_POST_DETAIL_FAILED when the row cannot be read", async () => {
    overrideTypesMock.mockResolvedValue({ data: null, error: { message: "no rows", code: "PGRST116" } });

    await expect(getCommunityPostDetail("cp-1")).rejects.toMatchObject({
      code: "COMMUNITY_POST_DETAIL_FAILED"
    });
  });
});

describe("createCommunityPost", () => {
  const input = {
    communityId: "c-1",
    authorId: "user-1",
    postType: "question" as const,
    title: null,
    body: "有人知道吗"
  };

  it("inserts the post payload and returns the new id", async () => {
    singleMock.mockResolvedValue({ data: { id: "cp-9" }, error: null });

    const result = await createCommunityPost(input);

    expect(fromMock).toHaveBeenCalledWith("community_posts");
    expect(insertMock).toHaveBeenCalledWith({
      community_id: "c-1",
      author_id: "user-1",
      post_type: "question",
      title: null,
      body: "有人知道吗"
    });
    expect(result).toEqual({ id: "cp-9" });
  });

  it("maps 42501 to ACCOUNT_RESTRICTED", async () => {
    singleMock.mockResolvedValue({ data: null, error: { message: "rls", code: "42501" } });

    await expect(createCommunityPost(input)).rejects.toMatchObject({
      code: "ACCOUNT_RESTRICTED",
      message: RESTRICTED_MESSAGE
    });
  });

  it("throws COMMUNITY_POST_CREATE_FAILED for other errors", async () => {
    singleMock.mockResolvedValue({ data: null, error: { message: "boom", code: "500" } });

    await expect(createCommunityPost(input)).rejects.toMatchObject({
      code: "COMMUNITY_POST_CREATE_FAILED"
    });
  });

  it("throws COMMUNITY_POST_CREATE_ID_MISSING when no row is returned", async () => {
    singleMock.mockResolvedValue({ data: null, error: null });

    await expect(createCommunityPost(input)).rejects.toMatchObject({
      code: "COMMUNITY_POST_CREATE_ID_MISSING"
    });
  });
});

describe("listMyCommunityPosts", () => {
  it("queries only the author's own non-deleted posts, newest first, and maps rows", async () => {
    overrideTypesMock.mockResolvedValue({
      data: [
        {
          id: "cp-1",
          post_type: "question",
          title: null,
          body: "正文",
          status: "approved",
          comment_count: 2,
          favorite_count: 3,
          created_at: "2026-08-01T00:00:00.000Z"
        }
      ],
      error: null
    });

    const result = await listMyCommunityPosts("user-1");

    expect(fromMock).toHaveBeenCalledWith("community_posts");
    expect(queryBuilder.eq).toHaveBeenCalledWith("author_id", "user-1");
    expect(queryBuilder.is).toHaveBeenCalledWith("deleted_at", null);
    expect(queryBuilder.order).toHaveBeenCalledWith("created_at", { ascending: false });
    expect(result).toEqual([
      {
        id: "cp-1",
        postType: "question",
        title: null,
        body: "正文",
        status: "approved",
        commentCount: 2,
        favoriteCount: 3,
        createdAt: "2026-08-01T00:00:00.000Z"
      }
    ]);
  });

  it("returns an empty array when there are no rows", async () => {
    overrideTypesMock.mockResolvedValue({ data: null, error: null });

    await expect(listMyCommunityPosts("user-1")).resolves.toEqual([]);
  });

  it("throws MY_COMMUNITY_POSTS_LIST_FAILED on a query error", async () => {
    overrideTypesMock.mockResolvedValue({ data: null, error: { message: "boom", code: "500" } });

    await expect(listMyCommunityPosts("user-1")).rejects.toMatchObject({
      code: "MY_COMMUNITY_POSTS_LIST_FAILED"
    });
  });
});

describe("updateCommunityPost", () => {
  const input = {
    id: "cp-1",
    authorId: "user-1",
    postType: "help" as const,
    title: "新标题",
    body: "新正文"
  };

  it("updates only post_type/title/body, scoped to the post's id, author and non-deleted rows", async () => {
    maybeSingleMock.mockResolvedValue({ data: { id: "cp-1" }, error: null });

    await updateCommunityPost(input);

    expect(updateMock).toHaveBeenCalledWith({
      post_type: "help",
      title: "新标题",
      body: "新正文"
    });
    expect(queryBuilder.eq).toHaveBeenCalledWith("id", "cp-1");
    expect(queryBuilder.eq).toHaveBeenCalledWith("author_id", "user-1");
    expect(queryBuilder.is).toHaveBeenCalledWith("deleted_at", null);
  });

  it("throws instead of silently succeeding when the filter matched zero rows (not found / not yours / already deleted)", async () => {
    maybeSingleMock.mockResolvedValue({ data: null, error: null });

    await expect(updateCommunityPost(input)).rejects.toMatchObject({
      code: "COMMUNITY_POST_UPDATE_FAILED",
      message: "帖子不存在，或没有权限编辑。"
    });
  });

  it("maps 42501 to ACCOUNT_RESTRICTED", async () => {
    maybeSingleMock.mockResolvedValue({ data: null, error: { message: "rls", code: "42501" } });

    await expect(updateCommunityPost(input)).rejects.toMatchObject({
      code: "ACCOUNT_RESTRICTED",
      message: RESTRICTED_MESSAGE
    });
  });

  it("throws COMMUNITY_POST_UPDATE_FAILED for other errors", async () => {
    maybeSingleMock.mockResolvedValue({ data: null, error: { message: "boom", code: "500" } });

    await expect(updateCommunityPost(input)).rejects.toMatchObject({
      code: "COMMUNITY_POST_UPDATE_FAILED"
    });
  });
});

describe("deleteCommunityPost", () => {
  it("soft-deletes by setting deleted_at, scoped to the author's own not-yet-deleted post", async () => {
    maybeSingleMock.mockResolvedValue({ data: { id: "cp-1" }, error: null });

    await deleteCommunityPost("cp-1", "user-1");

    const payload = updateMock.mock.calls[0][0] as { deleted_at: string };
    expect(Number.isNaN(Date.parse(payload.deleted_at))).toBe(false);
    expect(Object.keys(payload)).toEqual(["deleted_at"]);
    expect(queryBuilder.eq).toHaveBeenCalledWith("id", "cp-1");
    expect(queryBuilder.eq).toHaveBeenCalledWith("author_id", "user-1");
    expect(queryBuilder.is).toHaveBeenCalledWith("deleted_at", null);
  });

  it("throws instead of silently succeeding when zero rows were affected", async () => {
    maybeSingleMock.mockResolvedValue({ data: null, error: null });

    await expect(deleteCommunityPost("cp-1", "user-1")).rejects.toMatchObject({
      code: "COMMUNITY_POST_DELETE_FAILED"
    });
  });

  it("throws COMMUNITY_POST_DELETE_FAILED on a query error", async () => {
    maybeSingleMock.mockResolvedValue({ data: null, error: { message: "boom", code: "500" } });

    await expect(deleteCommunityPost("cp-1", "user-1")).rejects.toMatchObject({
      code: "COMMUNITY_POST_DELETE_FAILED"
    });
  });
});
