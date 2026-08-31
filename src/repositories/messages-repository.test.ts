import { beforeEach, describe, expect, it, vi } from "vitest";

const { queryBuilder, overrideTypesMock, singleMock } = vi.hoisted(() => {
  const overrideTypesMock = vi.fn();
  const singleMock = vi.fn();
  const builder: Record<string, ReturnType<typeof vi.fn>> = {};
  const chain = ["select", "eq", "is", "order", "insert"] as const;
  for (const method of chain) {
    builder[method] = vi.fn(() => builder);
  }
  builder.overrideTypes = overrideTypesMock;
  builder.single = singleMock;
  return { queryBuilder: builder, overrideTypesMock, singleMock };
});

const fromMock = vi.fn(() => queryBuilder);

vi.mock("../integrations/supabase/client", () => ({
  getSupabaseClient: () => ({ from: fromMock })
}));

import { listMessages, sendMessage } from "./messages-repository";

describe("listMessages", () => {
  beforeEach(() => {
    fromMock.mockClear();
    for (const key of Object.keys(queryBuilder)) {
      queryBuilder[key].mockClear();
    }
    overrideTypesMock.mockReset();
    singleMock.mockReset();
  });

  it("filters to the given conversation's non-deleted messages ordered oldest first", async () => {
    overrideTypesMock.mockResolvedValue({ data: [], error: null });

    await listMessages("conversation-1");

    expect(fromMock).toHaveBeenCalledWith("messages");
    expect(queryBuilder.select).toHaveBeenCalledWith(
      "id, sender_id, body, notification_payload, ref_activity_id, created_at"
    );
    expect(queryBuilder.eq).toHaveBeenCalledWith(
      "conversation_id",
      "conversation-1"
    );
    expect(queryBuilder.is).toHaveBeenCalledWith("deleted_at", null);
    expect(queryBuilder.order).toHaveBeenCalledWith("created_at", {
      ascending: true
    });
  });

  it("maps a regular (user-sent) row to MessageListItem with notificationPayload: null and refActivityId: null", async () => {
    overrideTypesMock.mockResolvedValue({
      data: [
        {
          id: "message-1",
          sender_id: "user-1",
          body: "你好",
          notification_payload: null,
          ref_activity_id: null,
          created_at: "2026-07-17T00:00:00.000Z"
        }
      ],
      error: null
    });

    const result = await listMessages("conversation-1");

    expect(result).toEqual([
      {
        id: "message-1",
        senderId: "user-1",
        body: "你好",
        notificationPayload: null,
        refActivityId: null,
        createdAt: "2026-07-17T00:00:00.000Z"
      }
    ]);
  });

  // 30 号卡：只有"申请加入（需要审核）"这条活动通知消息会带这一列，见
  // use-toggle-activity-participation-mutation.ts 的 notifyOrganizer()。
  it("maps ref_activity_id through to refActivityId when the row has one (30 号卡：活动申请通知)", async () => {
    overrideTypesMock.mockResolvedValue({
      data: [
        {
          id: "message-3",
          sender_id: "user-2",
          body: "Alice 申请加入你的活动《周末吃火锅》，去处理一下吧。",
          notification_payload: null,
          ref_activity_id: "act-1",
          created_at: "2026-07-17T00:00:00.000Z"
        }
      ],
      error: null
    });

    const result = await listMessages("conversation-1");

    expect(result[0]).toMatchObject({ refActivityId: "act-1" });
  });

  it("maps a system notification row (sender_id: null) to MessageListItem with its notificationPayload", async () => {
    overrideTypesMock.mockResolvedValue({
      data: [
        {
          id: "message-2",
          sender_id: null,
          body: "你的帖子《周末吃火锅》审核通过，现在可以在首页看到啦。",
          notification_payload: {
            title: "帖子审核通过",
            summary: "你的帖子《周末吃火锅》审核通过，现在可以在首页看到啦。",
            link: "/post/post-1"
          },
          created_at: "2026-07-17T00:00:00.000Z"
        }
      ],
      error: null
    });

    const result = await listMessages("conversation-1");

    expect(result).toEqual([
      {
        id: "message-2",
        senderId: null,
        body: "你的帖子《周末吃火锅》审核通过，现在可以在首页看到啦。",
        notificationPayload: {
          title: "帖子审核通过",
          summary: "你的帖子《周末吃火锅》审核通过，现在可以在首页看到啦。",
          link: "/post/post-1"
        },
        createdAt: "2026-07-17T00:00:00.000Z"
      }
    ]);
  });

  it("returns an empty list without throwing when there are no messages", async () => {
    overrideTypesMock.mockResolvedValue({ data: [], error: null });

    await expect(listMessages("conversation-1")).resolves.toEqual([]);
  });

  it("throws an AppError when the query fails", async () => {
    overrideTypesMock.mockResolvedValue({
      data: null,
      error: { message: "network down", code: "500" }
    });

    await expect(listMessages("conversation-1")).rejects.toMatchObject({
      code: "MESSAGES_LIST_FAILED"
    });
  });
});

describe("sendMessage", () => {
  beforeEach(() => {
    fromMock.mockClear();
    for (const key of Object.keys(queryBuilder)) {
      queryBuilder[key].mockClear();
    }
    overrideTypesMock.mockReset();
    singleMock.mockReset();
  });

  it("inserts a message row (with ref_activity_id: null by default) and returns the new id", async () => {
    singleMock.mockResolvedValue({ data: { id: "message-1" }, error: null });

    const result = await sendMessage({
      conversationId: "conversation-1",
      senderId: "user-1",
      body: "你好"
    });

    expect(fromMock).toHaveBeenCalledWith("messages");
    expect(queryBuilder.insert).toHaveBeenCalledWith({
      conversation_id: "conversation-1",
      sender_id: "user-1",
      body: "你好",
      ref_activity_id: null
    });
    expect(queryBuilder.select).toHaveBeenCalledWith("id");
    expect(result).toEqual({ id: "message-1" });
  });

  // 30 号卡：notifyOrganizer() 发"申请加入（需要审核）"这条消息时会传
  // refActivityId，这里确认它原样写进 ref_activity_id 这一列。
  it("inserts ref_activity_id when refActivityId is provided (30 号卡：活动申请通知)", async () => {
    singleMock.mockResolvedValue({ data: { id: "message-1" }, error: null });

    await sendMessage({
      conversationId: "conversation-1",
      senderId: "user-1",
      body: "Alice 申请加入你的活动《周末吃火锅》，去处理一下吧。",
      refActivityId: "act-1"
    });

    expect(queryBuilder.insert).toHaveBeenCalledWith({
      conversation_id: "conversation-1",
      sender_id: "user-1",
      body: "Alice 申请加入你的活动《周末吃火锅》，去处理一下吧。",
      ref_activity_id: "act-1"
    });
  });

  it("throws an AppError when the insert fails", async () => {
    singleMock.mockResolvedValue({
      data: null,
      error: { message: "insert failed", code: "500" }
    });

    await expect(
      sendMessage({
        conversationId: "conversation-1",
        senderId: "user-1",
        body: "你好"
      })
    ).rejects.toMatchObject({ code: "MESSAGE_SEND_FAILED" });
  });

  it("throws a distinct MESSAGE_SEND_FORBIDDEN AppError with a friendly message on an RLS violation (42501)", async () => {
    // 42501 现在可能来自账号受限或屏蔽关系两种真实原因（见
    // messages-repository.ts 里 sendMessage() 的注释），这里只验证映射到
    // 了一个不预设具体原因、但明确"重试没用"的专门错误码/文案，不是原始的
    // "违反行级安全策略"或者被误判定成单一原因。
    singleMock.mockResolvedValue({
      data: null,
      error: {
        message: "new row violates row-level security policy for table \"messages\"",
        code: "42501"
      }
    });

    await expect(
      sendMessage({
        conversationId: "conversation-1",
        senderId: "user-1",
        body: "你好"
      })
    ).rejects.toMatchObject({
      code: "MESSAGE_SEND_FORBIDDEN",
      message: "消息未能发送：你的账号可能处于限制状态，或你与对方之间存在屏蔽关系。"
    });
  });

  it("throws an AppError when insert succeeds but no row id is returned", async () => {
    singleMock.mockResolvedValue({ data: null, error: null });

    await expect(
      sendMessage({
        conversationId: "conversation-1",
        senderId: "user-1",
        body: "你好"
      })
    ).rejects.toMatchObject({ code: "MESSAGE_SEND_ID_MISSING" });
  });
});
