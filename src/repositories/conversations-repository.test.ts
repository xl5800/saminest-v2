import { beforeEach, describe, expect, it, vi } from "vitest";

const { rpcMock, queryBuilder, overrideTypesMock, maybeSingleMock } = vi.hoisted(() => {
  const overrideTypesMock = vi.fn();
  const maybeSingleMock = vi.fn();
  const builder: Record<string, ReturnType<typeof vi.fn>> = {};
  const chain = ["select", "order", "eq", "is", "in"] as const;
  for (const method of chain) {
    builder[method] = vi.fn(() => builder);
  }
  builder.overrideTypes = overrideTypesMock;
  builder.maybeSingle = maybeSingleMock;
  return { rpcMock: vi.fn(), queryBuilder: builder, overrideTypesMock, maybeSingleMock };
});

const fromMock = vi.fn(() => queryBuilder);

vi.mock("../integrations/supabase/client", () => ({
  getSupabaseClient: () => ({ rpc: rpcMock, from: fromMock })
}));

import {
  createActivityConversation,
  createDirectConversation,
  createProfileConversation,
  findExistingActivityConversation,
  listMyConversations
} from "./conversations-repository";

describe("createDirectConversation", () => {
  beforeEach(() => {
    rpcMock.mockReset();
  });

  it("calls create_direct_conversation with target_post_id and returns the conversation id", async () => {
    rpcMock.mockResolvedValue({ data: "conversation-1", error: null });

    const result = await createDirectConversation("post-1");

    expect(rpcMock).toHaveBeenCalledWith("create_direct_conversation", {
      target_post_id: "post-1"
    });
    expect(result).toEqual({ conversationId: "conversation-1" });
  });

  it("throws an AppError when the RPC returns an error (e.g. messaging yourself)", async () => {
    rpcMock.mockResolvedValue({
      data: null,
      error: { message: "cannot start a direct conversation with yourself" }
    });

    await expect(createDirectConversation("post-1")).rejects.toMatchObject({
      code: "CONVERSATION_CREATE_FAILED"
    });
  });

  it("throws a distinct ACCOUNT_RESTRICTED AppError with a friendly message when the account is restricted", async () => {
    rpcMock.mockResolvedValue({
      data: null,
      error: {
        message: "restricted accounts cannot start a direct conversation"
      }
    });

    await expect(createDirectConversation("post-1")).rejects.toMatchObject({
      code: "ACCOUNT_RESTRICTED",
      message: "您的账号当前处于限制状态，无法执行此操作，如有疑问请联系管理员。"
    });
  });

  it("throws an AppError when the RPC succeeds but returns no conversation id", async () => {
    rpcMock.mockResolvedValue({ data: null, error: null });

    await expect(createDirectConversation("post-1")).rejects.toMatchObject({
      code: "CONVERSATION_CREATE_ID_MISSING"
    });
  });
});

describe("createActivityConversation", () => {
  beforeEach(() => {
    rpcMock.mockReset();
  });

  it("calls create_activity_conversation with target_activity_id and returns the conversation id", async () => {
    rpcMock.mockResolvedValue({ data: "conversation-1", error: null });

    const result = await createActivityConversation("act-1");

    expect(rpcMock).toHaveBeenCalledWith("create_activity_conversation", {
      target_activity_id: "act-1"
    });
    expect(result).toEqual({ conversationId: "conversation-1" });
  });

  it("throws an AppError when the RPC returns an error (e.g. messaging yourself)", async () => {
    rpcMock.mockResolvedValue({
      data: null,
      error: { message: "cannot start a direct conversation with yourself" }
    });

    await expect(createActivityConversation("act-1")).rejects.toMatchObject({
      code: "ACTIVITY_CONVERSATION_CREATE_FAILED"
    });
  });

  it("throws a distinct ACCOUNT_RESTRICTED AppError with a friendly message when the account is restricted", async () => {
    rpcMock.mockResolvedValue({
      data: null,
      error: {
        message: "restricted accounts cannot start a direct conversation"
      }
    });

    await expect(createActivityConversation("act-1")).rejects.toMatchObject({
      code: "ACCOUNT_RESTRICTED",
      message: "您的账号当前处于限制状态，无法执行此操作，如有疑问请联系管理员。"
    });
  });

  it("throws an AppError when the RPC succeeds but returns no conversation id", async () => {
    rpcMock.mockResolvedValue({ data: null, error: null });

    await expect(createActivityConversation("act-1")).rejects.toMatchObject({
      code: "ACTIVITY_CONVERSATION_CREATE_ID_MISSING"
    });
  });
});

describe("createProfileConversation", () => {
  beforeEach(() => {
    rpcMock.mockReset();
  });

  it("calls create_profile_conversation with target_user_id and returns the conversation id", async () => {
    rpcMock.mockResolvedValue({ data: "conversation-1", error: null });

    const result = await createProfileConversation("user-2");

    expect(rpcMock).toHaveBeenCalledWith("create_profile_conversation", {
      target_user_id: "user-2"
    });
    expect(result).toEqual({ conversationId: "conversation-1" });
  });

  it("throws a distinct ACCOUNT_RESTRICTED AppError with a friendly message when the account is restricted", async () => {
    rpcMock.mockResolvedValue({
      data: null,
      error: {
        message: "restricted accounts cannot start a direct conversation"
      }
    });

    await expect(createProfileConversation("user-2")).rejects.toMatchObject({
      code: "ACCOUNT_RESTRICTED",
      message: "您的账号当前处于限制状态，无法执行此操作，如有疑问请联系管理员。"
    });
  });

  it("throws a distinct PROFILE_CONVERSATION_DAILY_LIMIT_REACHED AppError with a friendly Chinese message when the daily limit is reached", async () => {
    rpcMock.mockResolvedValue({
      data: null,
      error: { message: "daily new conversation limit reached" }
    });

    await expect(createProfileConversation("user-2")).rejects.toMatchObject({
      code: "PROFILE_CONVERSATION_DAILY_LIMIT_REACHED",
      message: "你今天主动私信的新用户数量已经达到上限，请明天再试。"
    });
  });

  it("throws a generic PROFILE_CONVERSATION_CREATE_FAILED AppError for any other error (e.g. messaging yourself, target not found)", async () => {
    rpcMock.mockResolvedValue({
      data: null,
      error: { message: "cannot start a direct conversation with yourself" }
    });

    await expect(createProfileConversation("user-2")).rejects.toMatchObject({
      code: "PROFILE_CONVERSATION_CREATE_FAILED"
    });
  });

  it("throws an AppError when the RPC succeeds but returns no conversation id", async () => {
    rpcMock.mockResolvedValue({ data: null, error: null });

    await expect(createProfileConversation("user-2")).rejects.toMatchObject({
      code: "PROFILE_CONVERSATION_CREATE_ID_MISSING"
    });
  });
});

describe("findExistingActivityConversation", () => {
  beforeEach(() => {
    fromMock.mockClear();
    for (const key of Object.keys(queryBuilder)) {
      queryBuilder[key].mockClear();
    }
    overrideTypesMock.mockReset();
    maybeSingleMock.mockReset();
  });

  it("queries direct, non-post conversations created by the applicant, then looks for the organizer among their members", async () => {
    overrideTypesMock.mockResolvedValue({ data: [{ id: "conv-1" }], error: null });
    maybeSingleMock.mockResolvedValue({ data: { conversation_id: "conv-1" }, error: null });

    await findExistingActivityConversation({
      createdByUserId: "applicant-1",
      otherUserId: "organizer-1"
    });

    expect(fromMock).toHaveBeenNthCalledWith(1, "conversations");
    expect(queryBuilder.select).toHaveBeenNthCalledWith(1, "id");
    expect(queryBuilder.eq).toHaveBeenCalledWith("type", "direct");
    expect(queryBuilder.is).toHaveBeenCalledWith("post_id", null);
    expect(queryBuilder.is).toHaveBeenCalledWith("deleted_at", null);
    expect(queryBuilder.eq).toHaveBeenCalledWith("created_by", "applicant-1");

    expect(fromMock).toHaveBeenNthCalledWith(2, "conversation_members");
    expect(queryBuilder.select).toHaveBeenNthCalledWith(2, "conversation_id");
    expect(queryBuilder.eq).toHaveBeenCalledWith("user_id", "organizer-1");
    expect(queryBuilder.in).toHaveBeenCalledWith("conversation_id", ["conv-1"]);
  });

  it("returns the conversation id when a matching conversation is found", async () => {
    overrideTypesMock.mockResolvedValue({ data: [{ id: "conv-1" }], error: null });
    maybeSingleMock.mockResolvedValue({ data: { conversation_id: "conv-1" }, error: null });

    await expect(
      findExistingActivityConversation({
        createdByUserId: "applicant-1",
        otherUserId: "organizer-1"
      })
    ).resolves.toEqual({ conversationId: "conv-1" });
  });

  it("returns null without a second query when the applicant has no matching direct/non-post conversations at all", async () => {
    overrideTypesMock.mockResolvedValue({ data: [], error: null });

    const result = await findExistingActivityConversation({
      createdByUserId: "applicant-1",
      otherUserId: "organizer-1"
    });

    expect(result).toBeNull();
    expect(fromMock).toHaveBeenCalledTimes(1);
  });

  it("returns null when the applicant has candidate conversations but none include the organizer as a member", async () => {
    overrideTypesMock.mockResolvedValue({ data: [{ id: "conv-1" }], error: null });
    maybeSingleMock.mockResolvedValue({ data: null, error: null });

    await expect(
      findExistingActivityConversation({
        createdByUserId: "applicant-1",
        otherUserId: "organizer-1"
      })
    ).resolves.toBeNull();
  });

  it("throws an AppError when the first (conversations) query fails", async () => {
    overrideTypesMock.mockResolvedValue({
      data: null,
      error: { message: "network down", code: "500" }
    });

    await expect(
      findExistingActivityConversation({
        createdByUserId: "applicant-1",
        otherUserId: "organizer-1"
      })
    ).rejects.toMatchObject({ code: "ACTIVITY_CONVERSATION_LOOKUP_FAILED" });
  });

  it("throws an AppError when the second (conversation_members) query fails", async () => {
    overrideTypesMock.mockResolvedValue({ data: [{ id: "conv-1" }], error: null });
    maybeSingleMock.mockResolvedValue({
      data: null,
      error: { message: "network down", code: "500" }
    });

    await expect(
      findExistingActivityConversation({
        createdByUserId: "applicant-1",
        otherUserId: "organizer-1"
      })
    ).rejects.toMatchObject({ code: "ACTIVITY_CONVERSATION_LOOKUP_FAILED" });
  });
});

describe("listMyConversations", () => {
  beforeEach(() => {
    fromMock.mockClear();
    for (const key of Object.keys(queryBuilder)) {
      queryBuilder[key].mockClear();
    }
    overrideTypesMock.mockReset();
    // 默认给个已解决的空结果——只关心 conversations 那次查询本身的用例
    // 不用每个都额外串两个空 mock；conversationIds 为空时 fetchOtherParties
    // 根本不会发出后两次查询，用不上这个默认值也没关系。
    overrideTypesMock.mockResolvedValue({ data: [], error: null });
  });

  it("queries conversations with a nested posts(title) select, ordered by created_at desc, and skips the member/profile queries when there are no conversations", async () => {
    await listMyConversations("user-1");

    expect(fromMock).toHaveBeenCalledTimes(1);
    expect(fromMock).toHaveBeenCalledWith("conversations");
    expect(queryBuilder.select).toHaveBeenCalledWith(
      "id, post_id, last_message_at, created_at, posts(title)"
    );
    expect(queryBuilder.order).toHaveBeenCalledWith("created_at", { ascending: false });
  });

  it("batch-queries conversation_members (excluding left_at) then profiles, and maps a row with a post title + the other party's identity", async () => {
    overrideTypesMock
      .mockResolvedValueOnce({
        data: [
          {
            id: "conv-1",
            post_id: "post-1",
            last_message_at: "2026-07-10T00:00:00.000Z",
            created_at: "2026-07-01T00:00:00.000Z",
            posts: { title: "Sunny room" }
          }
        ],
        error: null
      })
      .mockResolvedValueOnce({
        data: [
          { conversation_id: "conv-1", user_id: "user-1" },
          { conversation_id: "conv-1", user_id: "user-2" }
        ],
        error: null
      })
      .mockResolvedValueOnce({
        data: [{ id: "user-2", display_name: "Bob", avatar_url: "https://img.example.com/bob.jpg" }],
        error: null
      });

    const result = await listMyConversations("user-1");

    expect(fromMock).toHaveBeenNthCalledWith(2, "conversation_members");
    expect(queryBuilder.select).toHaveBeenNthCalledWith(2, "conversation_id, user_id");
    expect(queryBuilder.in).toHaveBeenCalledWith("conversation_id", ["conv-1"]);
    expect(queryBuilder.is).toHaveBeenCalledWith("left_at", null);

    expect(fromMock).toHaveBeenNthCalledWith(3, "profiles");
    expect(queryBuilder.select).toHaveBeenNthCalledWith(3, "id, display_name, avatar_url");
    expect(queryBuilder.in).toHaveBeenCalledWith("id", ["user-2"]);

    expect(result).toEqual([
      {
        id: "conv-1",
        postId: "post-1",
        postTitle: "Sunny room",
        otherUserId: "user-2",
        otherDisplayName: "Bob",
        otherAvatarUrl: "https://img.example.com/bob.jpg",
        lastActivityAt: "2026-07-10T00:00:00.000Z"
      }
    ]);
  });

  it("returns null for otherUserId/otherDisplayName/otherAvatarUrl, without throwing, when the other party has already left the conversation", async () => {
    overrideTypesMock
      .mockResolvedValueOnce({
        data: [
          {
            id: "conv-1",
            post_id: null,
            last_message_at: null,
            created_at: "2026-07-01T00:00:00.000Z",
            posts: null
          }
        ],
        error: null
      })
      // 只剩当前用户自己是活跃成员（对方已经 left_at 不为空退出），
      // conversation_members 这次查询（.is("left_at", null) 已经把对方
      // 那一行过滤掉）就只会返回这一条。
      .mockResolvedValueOnce({
        data: [{ conversation_id: "conv-1", user_id: "user-1" }],
        error: null
      });

    const result = await listMyConversations("user-1");

    // 找不到非自己的成员，otherUserIds 为空，不应该再发第三次 profiles
    // 查询。
    expect(fromMock).toHaveBeenCalledTimes(2);
    expect(result).toEqual([
      {
        id: "conv-1",
        postId: null,
        postTitle: null,
        otherUserId: null,
        otherDisplayName: null,
        otherAvatarUrl: null,
        lastActivityAt: "2026-07-01T00:00:00.000Z"
      }
    ]);
  });

  it("maps a row with post_id null (no post attached) to postTitle: null", async () => {
    overrideTypesMock.mockResolvedValueOnce({
      data: [
        {
          id: "conv-1",
          post_id: null,
          last_message_at: null,
          created_at: "2026-07-01T00:00:00.000Z",
          posts: null
        }
      ],
      error: null
    });

    const result = await listMyConversations("user-1");

    expect(result[0].postId).toBeNull();
    expect(result[0].postTitle).toBeNull();
  });

  it("treats a set post_id with an RLS-blocked (null) nested posts join as no title, without throwing", async () => {
    overrideTypesMock.mockResolvedValueOnce({
      data: [
        {
          id: "conv-1",
          post_id: "post-hidden",
          last_message_at: null,
          created_at: "2026-07-01T00:00:00.000Z",
          posts: null
        }
      ],
      error: null
    });

    const result = await listMyConversations("user-1");

    expect(result[0].postId).toBe("post-hidden");
    expect(result[0].postTitle).toBeNull();
  });

  it("falls back to created_at for lastActivityAt when last_message_at is null", async () => {
    overrideTypesMock.mockResolvedValueOnce({
      data: [
        {
          id: "conv-1",
          post_id: null,
          last_message_at: null,
          created_at: "2026-07-05T00:00:00.000Z",
          posts: null
        }
      ],
      error: null
    });

    const result = await listMyConversations("user-1");

    expect(result[0].lastActivityAt).toBe("2026-07-05T00:00:00.000Z");
  });

  it("sorts by lastActivityAt (last_message_at ?? created_at) descending, regardless of DB fetch order", async () => {
    overrideTypesMock.mockResolvedValueOnce({
      data: [
        {
          id: "conv-oldest-activity",
          post_id: null,
          last_message_at: "2026-07-02T00:00:00.000Z",
          created_at: "2026-07-09T00:00:00.000Z",
          posts: null
        },
        {
          id: "conv-newest-activity-null-last-message",
          post_id: null,
          last_message_at: null,
          created_at: "2026-07-15T00:00:00.000Z",
          posts: null
        },
        {
          id: "conv-middle-activity",
          post_id: null,
          last_message_at: "2026-07-08T00:00:00.000Z",
          created_at: "2026-07-01T00:00:00.000Z",
          posts: null
        }
      ],
      error: null
    });

    const result = await listMyConversations("user-1");

    expect(result.map((item) => item.id)).toEqual([
      "conv-newest-activity-null-last-message",
      "conv-middle-activity",
      "conv-oldest-activity"
    ]);
  });

  it("throws an AppError when the conversations query fails", async () => {
    overrideTypesMock.mockResolvedValueOnce({
      data: null,
      error: { message: "network down", code: "500" }
    });

    await expect(listMyConversations("user-1")).rejects.toMatchObject({
      code: "CONVERSATIONS_LIST_FAILED"
    });
  });

  it("throws an AppError when the conversation_members query fails", async () => {
    overrideTypesMock
      .mockResolvedValueOnce({
        data: [
          {
            id: "conv-1",
            post_id: null,
            last_message_at: null,
            created_at: "2026-07-01T00:00:00.000Z",
            posts: null
          }
        ],
        error: null
      })
      .mockResolvedValueOnce({
        data: null,
        error: { message: "network down", code: "500" }
      });

    await expect(listMyConversations("user-1")).rejects.toMatchObject({
      code: "CONVERSATIONS_LIST_FAILED"
    });
  });

  it("throws an AppError when the profiles query fails", async () => {
    overrideTypesMock
      .mockResolvedValueOnce({
        data: [
          {
            id: "conv-1",
            post_id: null,
            last_message_at: null,
            created_at: "2026-07-01T00:00:00.000Z",
            posts: null
          }
        ],
        error: null
      })
      .mockResolvedValueOnce({
        data: [{ conversation_id: "conv-1", user_id: "user-2" }],
        error: null
      })
      .mockResolvedValueOnce({
        data: null,
        error: { message: "network down", code: "500" }
      });

    await expect(listMyConversations("user-1")).rejects.toMatchObject({
      code: "CONVERSATIONS_LIST_FAILED"
    });
  });

  it("returns an empty list without throwing when the user has no conversations", async () => {
    await expect(listMyConversations("user-1")).resolves.toEqual([]);
  });
});
