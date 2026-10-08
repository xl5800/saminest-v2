import { beforeEach, describe, expect, it, vi } from "vitest";

const { queryBuilder, singleMock, overrideTypesMock, insertMock } = vi.hoisted(() => {
  const singleMock = vi.fn();
  const overrideTypesMock = vi.fn();
  const insertMock = vi.fn();
  const builder: Record<string, ReturnType<typeof vi.fn>> = {};
  for (const name of ["select", "eq", "is", "order", "range"]) {
    builder[name] = vi.fn(() => builder);
  }
  builder.insert = insertMock;
  builder.single = singleMock;
  builder.overrideTypes = overrideTypesMock;
  return { queryBuilder: builder, singleMock, overrideTypesMock, insertMock };
});

const fromMock = vi.fn(() => queryBuilder);

vi.mock("../integrations/supabase/client", () => ({
  getSupabaseClient: () => ({ from: fromMock })
}));

import {
  createCommunityPost,
  getCommunityBySlug,
  getCommunityPostDetail,
  joinCommunity,
  listCommunityPosts
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
    ...overrides
  };
}

beforeEach(() => {
  fromMock.mockClear();
  for (const fn of Object.values(queryBuilder)) fn.mockClear();
  singleMock.mockReset();
  overrideTypesMock.mockReset();
  insertMock.mockReset();
  // insert() 既要能直接 resolve（joinCommunity），也要能继续链式调用
  // （createCommunityPost: insert().select().single()），按用例各自覆盖。
  insertMock.mockReturnValue(queryBuilder);
});

describe("getCommunityBySlug", () => {
  it("queries communities by slug and maps the row", async () => {
    singleMock.mockResolvedValue({
      data: { id: "c-1", name: "DMV 社区", slug: "dmv" },
      error: null
    });

    const result = await getCommunityBySlug("dmv");

    expect(fromMock).toHaveBeenCalledWith("communities");
    expect(queryBuilder.eq).toHaveBeenCalledWith("slug", "dmv");
    expect(result).toEqual({ id: "c-1", name: "DMV 社区", slug: "dmv" });
  });

  it("throws COMMUNITY_FETCH_FAILED when the query fails", async () => {
    singleMock.mockResolvedValue({ data: null, error: { message: "boom", code: "500" } });

    await expect(getCommunityBySlug("dmv")).rejects.toMatchObject({
      code: "COMMUNITY_FETCH_FAILED"
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
        authorAvatarUrl: "https://x/a.png"
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
