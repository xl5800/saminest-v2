import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  rpcMock,
  queryBuilder,
  overrideTypesMock,
  maybeSingleMock,
  markReadUpdateMock,
  markReadFirstEqMock,
  markReadSecondEqMock
} = vi.hoisted(() => {
  const overrideTypesMock = vi.fn();
  const maybeSingleMock = vi.fn();
  const builder: Record<string, ReturnType<typeof vi.fn>> = {};
  const chain = ["select", "order", "eq", "is", "in"] as const;
  for (const method of chain) {
    builder[method] = vi.fn(() => builder);
  }
  builder.overrideTypes = overrideTypesMock;
  builder.maybeSingle = maybeSingleMock;

  // markConversationAsRead 走 .update(payload).eq(...).eq(...)，两次
  // .eq() 链式调用后直接 await 整个表达式拿 {error}，没有 .select()/
  // .maybeSingle() 这种终止调用——跟 profiles-repository.test.ts 里
  // updateMyProfile 的 mock 方式同一个道理（update 链路的 eq 跟
  // select/eq/maybeSingle 那条链路的 eq 语义不一样，不能复用共享的
  // queryBuilder），只是这里链了两层 eq，需要两层 mock 对象。
  const markReadUpdateMock = vi.fn();
  const markReadFirstEqMock = vi.fn();
  const markReadSecondEqMock = vi.fn();
  markReadUpdateMock.mockReturnValue({ eq: markReadFirstEqMock });
  markReadFirstEqMock.mockReturnValue({ eq: markReadSecondEqMock });

  return {
    rpcMock: vi.fn(),
    queryBuilder: builder,
    overrideTypesMock,
    maybeSingleMock,
    markReadUpdateMock,
    markReadFirstEqMock,
    markReadSecondEqMock
  };
});

const markReadQueryBuilder = { update: markReadUpdateMock };

const fromMock = vi.fn(() => queryBuilder);

vi.mock("../integrations/supabase/client", () => ({
  getSupabaseClient: () => ({ rpc: rpcMock, from: fromMock })
}));

import {
  createActivityConversation,
  createDirectConversation,
  createProfileConversation,
  findExistingActivityConversation,
  hasUnreadSystemNotification,
  listMyConversations,
  markConversationAsRead
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

// 16 号卡「对话去重」：这个函数不再假设"申请人是 created_by"或者"会话
// 没有挂在任何帖子下"（两个人之间现在只有一条 direct 会话，不管最初是
// 从哪个入口、由谁建的），改成三步都查 conversation_members/conversations，
// 不再联表带 created_by/post_id 条件，见 conversations-repository.ts 里
// 这个函数的详细注释。
describe("findExistingActivityConversation", () => {
  beforeEach(() => {
    fromMock.mockClear();
    for (const key of Object.keys(queryBuilder)) {
      queryBuilder[key].mockClear();
    }
    overrideTypesMock.mockReset();
    maybeSingleMock.mockReset();
  });

  it("queries the applicant's conversation memberships, then looks for the organizer among the same conversations' members, then confirms the conversation is a non-deleted direct one", async () => {
    overrideTypesMock.mockResolvedValue({ data: [{ conversation_id: "conv-1" }], error: null });
    maybeSingleMock
      .mockResolvedValueOnce({ data: { conversation_id: "conv-1" }, error: null })
      .mockResolvedValueOnce({ data: { id: "conv-1" }, error: null });

    await findExistingActivityConversation({
      applicantUserId: "applicant-1",
      organizerUserId: "organizer-1"
    });

    expect(fromMock).toHaveBeenNthCalledWith(1, "conversation_members");
    expect(queryBuilder.select).toHaveBeenNthCalledWith(1, "conversation_id");
    expect(queryBuilder.eq).toHaveBeenNthCalledWith(1, "user_id", "applicant-1");

    expect(fromMock).toHaveBeenNthCalledWith(2, "conversation_members");
    expect(queryBuilder.select).toHaveBeenNthCalledWith(2, "conversation_id");
    expect(queryBuilder.eq).toHaveBeenNthCalledWith(2, "user_id", "organizer-1");
    expect(queryBuilder.in).toHaveBeenCalledWith("conversation_id", ["conv-1"]);

    expect(fromMock).toHaveBeenNthCalledWith(3, "conversations");
    expect(queryBuilder.select).toHaveBeenNthCalledWith(3, "id");
    expect(queryBuilder.eq).toHaveBeenCalledWith("id", "conv-1");
    expect(queryBuilder.eq).toHaveBeenCalledWith("type", "direct");
    expect(queryBuilder.is).toHaveBeenCalledWith("deleted_at", null);
  });

  it("returns the conversation id when a matching, non-deleted direct conversation is found", async () => {
    overrideTypesMock.mockResolvedValue({ data: [{ conversation_id: "conv-1" }], error: null });
    maybeSingleMock
      .mockResolvedValueOnce({ data: { conversation_id: "conv-1" }, error: null })
      .mockResolvedValueOnce({ data: { id: "conv-1" }, error: null });

    await expect(
      findExistingActivityConversation({
        applicantUserId: "applicant-1",
        organizerUserId: "organizer-1"
      })
    ).resolves.toEqual({ conversationId: "conv-1" });
  });

  it("returns null without further queries when the applicant is not a member of any conversation at all", async () => {
    overrideTypesMock.mockResolvedValue({ data: [], error: null });

    const result = await findExistingActivityConversation({
      applicantUserId: "applicant-1",
      organizerUserId: "organizer-1"
    });

    expect(result).toBeNull();
    expect(fromMock).toHaveBeenCalledTimes(1);
  });

  it("returns null when the applicant has conversations but the organizer is not a member of any of them", async () => {
    overrideTypesMock.mockResolvedValue({ data: [{ conversation_id: "conv-1" }], error: null });
    maybeSingleMock.mockResolvedValueOnce({ data: null, error: null });

    await expect(
      findExistingActivityConversation({
        applicantUserId: "applicant-1",
        organizerUserId: "organizer-1"
      })
    ).resolves.toBeNull();
  });

  // 找到了一条两人都在的会话，但那条会话其实已经被软删除（或者理论上
  // 不是 direct 类型）——第三步查不到，同样返回 null，不当成"找到了"。
  it("returns null when a shared conversation is found but it is soft-deleted (or not type=direct)", async () => {
    overrideTypesMock.mockResolvedValue({ data: [{ conversation_id: "conv-1" }], error: null });
    maybeSingleMock
      .mockResolvedValueOnce({ data: { conversation_id: "conv-1" }, error: null })
      .mockResolvedValueOnce({ data: null, error: null });

    await expect(
      findExistingActivityConversation({
        applicantUserId: "applicant-1",
        organizerUserId: "organizer-1"
      })
    ).resolves.toBeNull();
  });

  it("throws an AppError when the first (applicant memberships) query fails", async () => {
    overrideTypesMock.mockResolvedValue({
      data: null,
      error: { message: "network down", code: "500" }
    });

    await expect(
      findExistingActivityConversation({
        applicantUserId: "applicant-1",
        organizerUserId: "organizer-1"
      })
    ).rejects.toMatchObject({ code: "ACTIVITY_CONVERSATION_LOOKUP_FAILED" });
  });

  it("throws an AppError when the second (organizer membership) query fails", async () => {
    overrideTypesMock.mockResolvedValue({ data: [{ conversation_id: "conv-1" }], error: null });
    maybeSingleMock.mockResolvedValueOnce({
      data: null,
      error: { message: "network down", code: "500" }
    });

    await expect(
      findExistingActivityConversation({
        applicantUserId: "applicant-1",
        organizerUserId: "organizer-1"
      })
    ).rejects.toMatchObject({ code: "ACTIVITY_CONVERSATION_LOOKUP_FAILED" });
  });

  it("throws an AppError when the third (conversation confirmation) query fails", async () => {
    overrideTypesMock.mockResolvedValue({ data: [{ conversation_id: "conv-1" }], error: null });
    maybeSingleMock
      .mockResolvedValueOnce({ data: { conversation_id: "conv-1" }, error: null })
      .mockResolvedValueOnce({
        data: null,
        error: { message: "network down", code: "500" }
      });

    await expect(
      findExistingActivityConversation({
        applicantUserId: "applicant-1",
        organizerUserId: "organizer-1"
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

  it("queries conversations with a nested posts(title) select (including last_message_preview/last_message_sender_id), ordered by created_at desc, and skips the member/profile queries when there are no conversations", async () => {
    await listMyConversations("user-1");

    expect(fromMock).toHaveBeenCalledTimes(1);
    expect(fromMock).toHaveBeenCalledWith("conversations");
    expect(queryBuilder.select).toHaveBeenCalledWith(
      "id, post_id, origin_type, last_message_at, last_message_preview, last_message_sender_id, created_at, posts(title)"
    );
    expect(queryBuilder.order).toHaveBeenCalledWith("created_at", { ascending: false });
  });

  it("batch-queries conversation_members (excluding left_at, including last_read_at) then profiles, and maps a row with a post title + the other party's identity + preview/unread", async () => {
    overrideTypesMock
      .mockResolvedValueOnce({
        data: [
          {
            id: "conv-1",
            post_id: "post-1",
            origin_type: "post",
            last_message_at: "2026-07-10T00:00:00.000Z",
            last_message_preview: "在的，什么事？",
            // 最后一条消息是对方（user-2）发的，不是当前用户自己——见 20 号
            // 卡的 isUnread computation 那组测试，这里只是确认这个字段本身
            // 有被正确从数据库行读取/传下去。
            last_message_sender_id: "user-2",
            created_at: "2026-07-01T00:00:00.000Z",
            posts: { title: "Sunny room" }
          }
        ],
        error: null
      })
      .mockResolvedValueOnce({
        data: [
          // 当前用户自己（user-1）的 last_read_at 早于 last_message_at，
          // 这一行同时验证了这次改动的两件事：能从同一批
          // conversation_members 行里挑出自己那条算 isUnread，而不是
          // 只挑对方那条算身份。
          { conversation_id: "conv-1", user_id: "user-1", last_read_at: "2026-07-09T00:00:00.000Z" },
          { conversation_id: "conv-1", user_id: "user-2", last_read_at: "2026-07-10T00:00:00.000Z" }
        ],
        error: null
      })
      .mockResolvedValueOnce({
        data: [{ id: "user-2", display_name: "Bob", avatar_url: "https://img.example.com/bob.jpg" }],
        error: null
      });

    const result = await listMyConversations("user-1");

    expect(fromMock).toHaveBeenNthCalledWith(2, "conversation_members");
    expect(queryBuilder.select).toHaveBeenNthCalledWith(2, "conversation_id, user_id, last_read_at");
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
        originType: "post",
        otherUserId: "user-2",
        otherDisplayName: "Bob",
        otherAvatarUrl: "https://img.example.com/bob.jpg",
        lastActivityAt: "2026-07-10T00:00:00.000Z",
        lastMessagePreview: "在的，什么事？",
        isUnread: true
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
            origin_type: "post",
            last_message_at: null,
            last_message_preview: null,
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
        data: [{ conversation_id: "conv-1", user_id: "user-1", last_read_at: null }],
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
        originType: "post",
        otherUserId: null,
        otherDisplayName: null,
        otherAvatarUrl: null,
        lastActivityAt: "2026-07-01T00:00:00.000Z",
        lastMessagePreview: null,
        // 从来没有过消息（last_message_at 为空），不管 last_read_at 是什么
        // 都不算未读。
        isUnread: false
      }
    ]);
  });

  it("maps a row with post_id null (no post attached) to postTitle: null", async () => {
    overrideTypesMock.mockResolvedValueOnce({
      data: [
        {
          id: "conv-1",
          post_id: null,
          origin_type: "post",
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
          origin_type: "post",
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
          origin_type: "post",
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
          origin_type: "post",
          last_message_at: "2026-07-02T00:00:00.000Z",
          created_at: "2026-07-09T00:00:00.000Z",
          posts: null
        },
        {
          id: "conv-newest-activity-null-last-message",
          post_id: null,
          origin_type: "post",
          last_message_at: null,
          created_at: "2026-07-15T00:00:00.000Z",
          posts: null
        },
        {
          id: "conv-middle-activity",
          post_id: null,
          origin_type: "post",
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
            origin_type: "post",
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
            origin_type: "post",
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

  it("maps origin_type: 'system' through as originType, with otherUserId null (no 'other party' concept for system notification conversations)", async () => {
    overrideTypesMock
      .mockResolvedValueOnce({
        data: [
          {
            id: "conv-system-1",
            post_id: null,
            origin_type: "system",
            last_message_at: "2026-08-18T00:00:00.000Z",
            last_message_preview: "你的帖子审核通过，现在可以在首页看到啦。",
            // 系统通知消息没有真实发送者，见 20260818162648 迁移——这里是
            // null，"是不是自己发的"这条判断天然不成立，不会抑制未读红点。
            last_message_sender_id: null,
            created_at: "2026-08-18T00:00:00.000Z",
            posts: null
          }
        ],
        error: null
      })
      // 系统通知会话只有接收者自己一个成员，fetchConversationMemberInfo
      // 里 user_id !== currentUserId 这条过滤会把这一行排掉（不会再发
      // 第三次 profiles 查询），但 user_id === currentUserId 这一条现在
      // 会被用来算 isUnread。
      .mockResolvedValueOnce({
        data: [{ conversation_id: "conv-system-1", user_id: "user-1", last_read_at: null }],
        error: null
      });

    const result = await listMyConversations("user-1");

    expect(result).toEqual([
      {
        id: "conv-system-1",
        postId: null,
        postTitle: null,
        originType: "system",
        otherUserId: null,
        otherDisplayName: null,
        otherAvatarUrl: null,
        lastActivityAt: "2026-08-18T00:00:00.000Z",
        lastMessagePreview: "你的帖子审核通过，现在可以在首页看到啦。",
        isUnread: true
      }
    ]);
  });

  describe("isUnread computation", () => {
    // 每个用例都只放一条 conversation_members 行（当前用户自己），不涉及
    // "对方是谁"这条支线逻辑，专门验证 computeIsUnread 通过
    // fetchConversationMemberInfo 接到 listMyConversations 之后的行为。
    // 除非用例本身在测"是不是自己发的"这条分支，否则一律把
    // last_message_sender_id 设成对方（user-2），排除"没传这个字段时也
    // 恰好和 currentUserId 不相等"这种巧合掩盖了断言的可能。

    it("is false when the conversation has never had a message (last_message_at is null), regardless of last_read_at", async () => {
      overrideTypesMock
        .mockResolvedValueOnce({
          data: [
            {
              id: "conv-1",
              post_id: null,
              origin_type: "post",
              last_message_at: null,
              last_message_preview: null,
              last_message_sender_id: null,
              created_at: "2026-07-01T00:00:00.000Z",
              posts: null
            }
          ],
          error: null
        })
        .mockResolvedValueOnce({
          data: [
            {
              conversation_id: "conv-1",
              user_id: "user-1",
              last_read_at: "2026-06-01T00:00:00.000Z"
            }
          ],
          error: null
        });

      const result = await listMyConversations("user-1");

      expect(result[0].isUnread).toBe(false);
    });

    it("is true when there is a message but the user has never read this conversation (last_read_at is null)", async () => {
      overrideTypesMock
        .mockResolvedValueOnce({
          data: [
            {
              id: "conv-1",
              post_id: null,
              origin_type: "post",
              last_message_at: "2026-07-10T00:00:00.000Z",
              last_message_preview: "hi",
              last_message_sender_id: "user-2",
              created_at: "2026-07-01T00:00:00.000Z",
              posts: null
            }
          ],
          error: null
        })
        .mockResolvedValueOnce({
          data: [{ conversation_id: "conv-1", user_id: "user-1", last_read_at: null }],
          error: null
        });

      const result = await listMyConversations("user-1");

      expect(result[0].isUnread).toBe(true);
    });

    it("is false when last_read_at is at or after last_message_at", async () => {
      overrideTypesMock
        .mockResolvedValueOnce({
          data: [
            {
              id: "conv-1",
              post_id: null,
              origin_type: "post",
              last_message_at: "2026-07-10T00:00:00.000Z",
              last_message_preview: "hi",
              last_message_sender_id: "user-2",
              created_at: "2026-07-01T00:00:00.000Z",
              posts: null
            }
          ],
          error: null
        })
        .mockResolvedValueOnce({
          data: [
            {
              conversation_id: "conv-1",
              user_id: "user-1",
              last_read_at: "2026-07-10T12:00:00.000Z"
            }
          ],
          error: null
        });

      const result = await listMyConversations("user-1");

      expect(result[0].isUnread).toBe(false);
    });

    it("falls back to isUnread: false (never-read treated the same as no data) when the current user's own row is missing from the conversation_members batch for some reason", async () => {
      overrideTypesMock
        .mockResolvedValueOnce({
          data: [
            {
              id: "conv-1",
              post_id: null,
              origin_type: "post",
              last_message_at: null,
              last_message_preview: null,
              last_message_sender_id: null,
              created_at: "2026-07-01T00:00:00.000Z",
              posts: null
            }
          ],
          error: null
        })
        .mockResolvedValueOnce({ data: [], error: null });

      const result = await listMyConversations("user-1");

      expect(result[0].isUnread).toBe(false);
    });

    // 20 号卡：修复"自己发的消息点亮自己的未读红点"这个 bug 的核心用例。
    describe("20 号卡：不该是自己发的消息点亮自己的红点", () => {
      it("is false when the current user sent the last message themself, even though they have never explicitly marked this (brand-new) conversation as read", async () => {
        overrideTypesMock
          .mockResolvedValueOnce({
            data: [
              {
                id: "conv-1",
                post_id: null,
                origin_type: "post",
                last_message_at: "2026-07-10T00:00:00.000Z",
                last_message_preview: "你好，请问还在吗？",
                last_message_sender_id: "user-1",
                created_at: "2026-07-10T00:00:00.000Z",
                posts: null
              }
            ],
            error: null
          })
          // 全新会话，用户自己还从来没有被 markConversationAsRead 标记过
          // （last_read_at 为 null）——改版前这种情况会先落进"没读过就算
          // 未读"分支，错误地判成未读；"是不是自己发的"这条判断必须排在
          // 它前面。
          .mockResolvedValueOnce({
            data: [{ conversation_id: "conv-1", user_id: "user-1", last_read_at: null }],
            error: null
          });

        const result = await listMyConversations("user-1");

        expect(result[0].isUnread).toBe(false);
      });

      it("is false when the current user sent the last message themself, even though last_message_at is newer than their own last_read_at (the exact regression scenario: opened the conversation, then sent a message)", async () => {
        overrideTypesMock
          .mockResolvedValueOnce({
            data: [
              {
                id: "conv-1",
                post_id: null,
                origin_type: "post",
                last_message_at: "2026-07-10T00:05:00.000Z",
                last_message_preview: "在的，什么事？",
                last_message_sender_id: "user-1",
                created_at: "2026-07-01T00:00:00.000Z",
                posts: null
              }
            ],
            error: null
          })
          // last_read_at 是打开会话页那一刻写的（早于发出这条消息的时间）。
          .mockResolvedValueOnce({
            data: [
              {
                conversation_id: "conv-1",
                user_id: "user-1",
                last_read_at: "2026-07-10T00:00:00.000Z"
              }
            ],
            error: null
          });

        const result = await listMyConversations("user-1");

        expect(result[0].isUnread).toBe(false);
      });

      it("is true when the other party replies after the current user's own last message (their reply becomes the new last message, sent by someone else)", async () => {
        overrideTypesMock
          .mockResolvedValueOnce({
            data: [
              {
                id: "conv-1",
                post_id: null,
                origin_type: "post",
                last_message_at: "2026-07-10T00:10:00.000Z",
                last_message_preview: "在的，什么事？",
                last_message_sender_id: "user-2",
                created_at: "2026-07-01T00:00:00.000Z",
                posts: null
              }
            ],
            error: null
          })
          .mockResolvedValueOnce({
            data: [
              {
                conversation_id: "conv-1",
                user_id: "user-1",
                last_read_at: "2026-07-10T00:00:00.000Z"
              }
            ],
            error: null
          });

        const result = await listMyConversations("user-1");

        expect(result[0].isUnread).toBe(true);
      });
    });
  });
});

describe("markConversationAsRead", () => {
  beforeEach(() => {
    markReadUpdateMock.mockClear();
    markReadFirstEqMock.mockClear();
    markReadSecondEqMock.mockReset();
    fromMock.mockClear();
  });

  it("updates last_read_at for the given conversation/user pair", async () => {
    markReadSecondEqMock.mockResolvedValue({ error: null });
    fromMock.mockReturnValueOnce(markReadQueryBuilder);

    await markConversationAsRead("conv-1", "user-1");

    expect(fromMock).toHaveBeenCalledWith("conversation_members");
    expect(markReadUpdateMock).toHaveBeenCalledWith(
      expect.objectContaining({ last_read_at: expect.any(String) })
    );
    expect(markReadFirstEqMock).toHaveBeenCalledWith("conversation_id", "conv-1");
    expect(markReadSecondEqMock).toHaveBeenCalledWith("user_id", "user-1");
  });

  it("throws CONVERSATION_MARK_READ_FAILED when the update fails", async () => {
    markReadSecondEqMock.mockResolvedValue({
      error: { message: "network down", code: "500" }
    });
    fromMock.mockReturnValueOnce(markReadQueryBuilder);

    await expect(markConversationAsRead("conv-1", "user-1")).rejects.toMatchObject({
      code: "CONVERSATION_MARK_READ_FAILED"
    });
  });
});

describe("hasUnreadSystemNotification", () => {
  beforeEach(() => {
    fromMock.mockClear();
    for (const key of Object.keys(queryBuilder)) {
      queryBuilder[key].mockClear();
    }
    overrideTypesMock.mockReset();
    maybeSingleMock.mockReset();
  });

  it("returns false without a second query when the user has no system-notification conversation at all", async () => {
    maybeSingleMock.mockReturnValueOnce(queryBuilder);
    overrideTypesMock.mockResolvedValueOnce({ data: null, error: null });

    const result = await hasUnreadSystemNotification("user-1");

    expect(fromMock).toHaveBeenCalledTimes(1);
    expect(fromMock).toHaveBeenCalledWith("conversations");
    expect(queryBuilder.eq).toHaveBeenCalledWith("origin_type", "system");
    expect(queryBuilder.eq).toHaveBeenCalledWith("created_by", "user-1");
    expect(result).toBe(false);
  });

  it("returns false when the system conversation exists but has never had a message (last_message_at is null)", async () => {
    maybeSingleMock.mockReturnValueOnce(queryBuilder);
    overrideTypesMock.mockResolvedValueOnce({
      data: { id: "conv-system-1", last_message_at: null },
      error: null
    });

    await expect(hasUnreadSystemNotification("user-1")).resolves.toBe(false);
    expect(fromMock).toHaveBeenCalledTimes(1);
  });

  it("returns true when last_read_at has never been set but there is at least one message", async () => {
    maybeSingleMock.mockReturnValueOnce(queryBuilder);
    overrideTypesMock.mockResolvedValueOnce({
      data: { id: "conv-system-1", last_message_at: "2026-08-18T00:00:00.000Z" },
      error: null
    });
    maybeSingleMock.mockResolvedValueOnce({ data: { last_read_at: null }, error: null });

    const result = await hasUnreadSystemNotification("user-1");

    expect(fromMock).toHaveBeenNthCalledWith(2, "conversation_members");
    expect(result).toBe(true);
  });

  it("returns true when last_message_at is more recent than last_read_at", async () => {
    maybeSingleMock.mockReturnValueOnce(queryBuilder);
    overrideTypesMock.mockResolvedValueOnce({
      data: { id: "conv-system-1", last_message_at: "2026-08-18T12:00:00.000Z" },
      error: null
    });
    maybeSingleMock.mockResolvedValueOnce({
      data: { last_read_at: "2026-08-18T00:00:00.000Z" },
      error: null
    });

    await expect(hasUnreadSystemNotification("user-1")).resolves.toBe(true);
  });

  it("returns false when last_read_at is at or after last_message_at", async () => {
    maybeSingleMock.mockReturnValueOnce(queryBuilder);
    overrideTypesMock.mockResolvedValueOnce({
      data: { id: "conv-system-1", last_message_at: "2026-08-18T00:00:00.000Z" },
      error: null
    });
    maybeSingleMock.mockResolvedValueOnce({
      data: { last_read_at: "2026-08-18T12:00:00.000Z" },
      error: null
    });

    await expect(hasUnreadSystemNotification("user-1")).resolves.toBe(false);
  });

  // 20 号卡：跟 listMyConversations 共用同一个 computeIsUnread()，这里
  // 补一条对称的用例——理论上系统通知的输入框已经在 UI 层隐藏（见
  // conversation-page.tsx），不会真的发生，但函数本身的判断逻辑应该对
  // 这种情况也正确。
  it("returns false when the last system-notification message's sender happens to be the current user themself", async () => {
    maybeSingleMock.mockReturnValueOnce(queryBuilder);
    overrideTypesMock.mockResolvedValueOnce({
      data: {
        id: "conv-system-1",
        last_message_at: "2026-08-18T00:00:00.000Z",
        last_message_sender_id: "user-1"
      },
      error: null
    });
    maybeSingleMock.mockResolvedValueOnce({ data: { last_read_at: null }, error: null });

    await expect(hasUnreadSystemNotification("user-1")).resolves.toBe(false);
  });

  it("throws UNREAD_SYSTEM_NOTIFICATION_CHECK_FAILED when the conversation query fails", async () => {
    maybeSingleMock.mockReturnValueOnce(queryBuilder);
    overrideTypesMock.mockResolvedValueOnce({
      data: null,
      error: { message: "network down", code: "500" }
    });

    await expect(hasUnreadSystemNotification("user-1")).rejects.toMatchObject({
      code: "UNREAD_SYSTEM_NOTIFICATION_CHECK_FAILED"
    });
  });

  it("throws UNREAD_SYSTEM_NOTIFICATION_CHECK_FAILED when the conversation_members query fails", async () => {
    maybeSingleMock.mockReturnValueOnce(queryBuilder);
    overrideTypesMock.mockResolvedValueOnce({
      data: { id: "conv-system-1", last_message_at: "2026-08-18T00:00:00.000Z" },
      error: null
    });
    maybeSingleMock.mockResolvedValueOnce({
      data: null,
      error: { message: "network down", code: "500" }
    });

    await expect(hasUnreadSystemNotification("user-1")).rejects.toMatchObject({
      code: "UNREAD_SYSTEM_NOTIFICATION_CHECK_FAILED"
    });
  });
});
