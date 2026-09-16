import { beforeEach, describe, expect, it, vi } from "vitest";

const { queryBuilder, overrideTypesMock, singleMock, maybeSingleMock } = vi.hoisted(() => {
  const overrideTypesMock = vi.fn();
  const singleMock = vi.fn();
  const maybeSingleMock = vi.fn();
  const builder: Record<string, ReturnType<typeof vi.fn>> = {};
  const chain = ["select", "eq", "order", "insert", "update"] as const;
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

import { createComment, listComments, softDeleteComment } from "./comments-repository";

function resetAllMocks(): void {
  fromMock.mockClear();
  for (const key of Object.keys(queryBuilder)) {
    queryBuilder[key].mockClear();
  }
  overrideTypesMock.mockReset();
  singleMock.mockReset();
  maybeSingleMock.mockReset();
}

describe("listComments", () => {
  beforeEach(resetAllMocks);

  it("queries all comments for a post ordered by created_at ascending, with a nested author select", async () => {
    overrideTypesMock.mockResolvedValue({ data: [], error: null });

    await listComments({ postId: "post-1" });

    expect(fromMock).toHaveBeenCalledWith("comments");
    expect(queryBuilder.select).toHaveBeenCalledWith(
      "id, post_id, activity_id, user_id, parent_id, content, created_at, deleted_at, author:profiles(display_name, avatar_url)"
    );
    expect(queryBuilder.eq).toHaveBeenCalledWith("post_id", "post-1");
    expect(queryBuilder.order).toHaveBeenCalledWith("created_at", { ascending: true });
  });

  // 找搭子留言区任务卡：activity 版本，跟帖子版本除了 eq() 的列名，其它
  // 完全一样——同一个函数、只是传了 activityId 而不是 postId。
  it("queries all comments for an activity by activity_id instead of post_id", async () => {
    overrideTypesMock.mockResolvedValue({ data: [], error: null });

    await listComments({ activityId: "act-1" });

    expect(fromMock).toHaveBeenCalledWith("comments");
    expect(queryBuilder.eq).toHaveBeenCalledWith("activity_id", "act-1");
    expect(queryBuilder.eq).not.toHaveBeenCalledWith("post_id", expect.anything());
  });

  it("returns both active and soft-deleted comments, mapping deleted_at !== null to isDeleted: true", async () => {
    overrideTypesMock.mockResolvedValue({
      data: [
        {
          id: "c1",
          post_id: "post-1",
          activity_id: null,
          user_id: "user-1",
          parent_id: null,
          content: "hello",
          created_at: "2026-08-04T00:00:00.000Z",
          deleted_at: null,
          author: { display_name: "Alice", avatar_url: "https://img.example.com/alice.jpg" }
        },
        {
          id: "c2",
          post_id: "post-1",
          activity_id: null,
          user_id: "user-2",
          parent_id: "c1",
          content: "a deleted reply",
          created_at: "2026-08-04T00:01:00.000Z",
          deleted_at: "2026-08-04T00:05:00.000Z",
          author: { display_name: "Bob", avatar_url: null }
        }
      ],
      error: null
    });

    const result = await listComments({ postId: "post-1" });

    expect(result).toEqual([
      {
        id: "c1",
        postId: "post-1",
        activityId: null,
        userId: "user-1",
        parentId: null,
        content: "hello",
        authorDisplayName: "Alice",
        authorAvatarUrl: "https://img.example.com/alice.jpg",
        createdAt: "2026-08-04T00:00:00.000Z",
        isDeleted: false
      },
      {
        id: "c2",
        postId: "post-1",
        activityId: null,
        userId: "user-2",
        parentId: "c1",
        content: "a deleted reply",
        authorDisplayName: "Bob",
        authorAvatarUrl: null,
        createdAt: "2026-08-04T00:01:00.000Z",
        isDeleted: true
      }
    ]);
  });

  it("maps an activity comment row with postId: null / activityId set", async () => {
    overrideTypesMock.mockResolvedValue({
      data: [
        {
          id: "c3",
          post_id: null,
          activity_id: "act-1",
          user_id: "user-1",
          parent_id: null,
          content: "算我一个",
          created_at: "2026-08-04T00:00:00.000Z",
          deleted_at: null,
          author: { display_name: "Carol", avatar_url: null }
        }
      ],
      error: null
    });

    const result = await listComments({ activityId: "act-1" });

    expect(result).toEqual([
      {
        id: "c3",
        postId: null,
        activityId: "act-1",
        userId: "user-1",
        parentId: null,
        content: "算我一个",
        authorDisplayName: "Carol",
        authorAvatarUrl: null,
        createdAt: "2026-08-04T00:00:00.000Z",
        isDeleted: false
      }
    ]);
  });

  it("throws an AppError when the query fails", async () => {
    overrideTypesMock.mockResolvedValue({
      data: null,
      error: { message: "network down", code: "500" }
    });

    await expect(listComments({ postId: "post-1" })).rejects.toMatchObject({
      code: "COMMENTS_LIST_FAILED"
    });
  });
});

describe("createComment", () => {
  beforeEach(resetAllMocks);

  it("inserts a comment and returns its id/created_at", async () => {
    singleMock.mockResolvedValue({
      data: { id: "c1", created_at: "2026-08-04T00:00:00.000Z" },
      error: null
    });

    const result = await createComment({
      postId: "post-1",
      userId: "user-1",
      parentId: null,
      content: "hello"
    });

    expect(fromMock).toHaveBeenCalledWith("comments");
    expect(queryBuilder.insert).toHaveBeenCalledWith({
      post_id: "post-1",
      user_id: "user-1",
      parent_id: null,
      content: "hello"
    });
    expect(result).toEqual({ id: "c1", createdAt: "2026-08-04T00:00:00.000Z" });
  });

  // 找搭子留言区任务卡：activityId 版本，insert payload 用 activity_id、
  // 不带 post_id 这一列（不是显式传 null），跟上面帖子版本的 payload
  // 形状对称。
  it("inserts an activity comment with activity_id instead of post_id", async () => {
    singleMock.mockResolvedValue({
      data: { id: "c2", created_at: "2026-08-04T00:00:00.000Z" },
      error: null
    });

    const result = await createComment({
      activityId: "act-1",
      userId: "user-1",
      parentId: null,
      content: "算我一个"
    });

    expect(queryBuilder.insert).toHaveBeenCalledWith({
      activity_id: "act-1",
      user_id: "user-1",
      parent_id: null,
      content: "算我一个"
    });
    expect(result).toEqual({ id: "c2", createdAt: "2026-08-04T00:00:00.000Z" });
  });

  it("maps a 42501 RLS failure to a generic COMMENT_CREATE_FORBIDDEN error", async () => {
    singleMock.mockResolvedValue({
      data: null,
      error: { message: "new row violates row-level security policy", code: "42501" }
    });

    await expect(
      createComment({ postId: "post-1", userId: "user-1", parentId: null, content: "hi" })
    ).rejects.toMatchObject({ code: "COMMENT_CREATE_FORBIDDEN" });
  });

  it("throws COMMENT_CREATE_FAILED for any other insert failure", async () => {
    singleMock.mockResolvedValue({
      data: null,
      error: { message: "network down", code: "500" }
    });

    await expect(
      createComment({ postId: "post-1", userId: "user-1", parentId: null, content: "hi" })
    ).rejects.toMatchObject({ code: "COMMENT_CREATE_FAILED" });
  });
});

describe("softDeleteComment", () => {
  beforeEach(resetAllMocks);

  it("updates deleted_at, scoped to the comment id and the current user id", async () => {
    maybeSingleMock.mockResolvedValue({ data: { id: "c1" }, error: null });

    await softDeleteComment("c1", "user-1");

    expect(fromMock).toHaveBeenCalledWith("comments");
    expect(queryBuilder.update).toHaveBeenCalledWith(
      expect.objectContaining({ deleted_at: expect.any(String) })
    );
    expect(queryBuilder.eq).toHaveBeenCalledWith("id", "c1");
    expect(queryBuilder.eq).toHaveBeenCalledWith("user_id", "user-1");
  });

  it("throws COMMENT_DELETE_FAILED when the update affects zero rows (not found / not the owner)", async () => {
    maybeSingleMock.mockResolvedValue({ data: null, error: null });

    await expect(softDeleteComment("c1", "user-1")).rejects.toMatchObject({
      code: "COMMENT_DELETE_FAILED"
    });
  });

  it("throws COMMENT_DELETE_FAILED when the update query itself fails", async () => {
    maybeSingleMock.mockResolvedValue({
      data: null,
      error: { message: "network down", code: "500" }
    });

    await expect(softDeleteComment("c1", "user-1")).rejects.toMatchObject({
      code: "COMMENT_DELETE_FAILED"
    });
  });
});
