import { beforeEach, describe, expect, it, vi } from "vitest";

const { queryBuilder, overrideTypesMock, singleMock, createSignedUrlsMock, rpcMock } = vi.hoisted(() => {
  const overrideTypesMock = vi.fn();
  const singleMock = vi.fn();
  const builder: Record<string, ReturnType<typeof vi.fn>> = {};
  const chain = ["select", "eq", "is", "order", "insert"] as const;
  for (const method of chain) {
    builder[method] = vi.fn(() => builder);
  }
  builder.overrideTypes = overrideTypesMock;
  builder.single = singleMock;
  return {
    queryBuilder: builder,
    overrideTypesMock,
    singleMock,
    createSignedUrlsMock: vi.fn(),
    rpcMock: vi.fn()
  };
});

const fromMock = vi.fn(() => queryBuilder);
const storageFromMock = vi.fn(() => ({ createSignedUrls: createSignedUrlsMock }));

vi.mock("../integrations/supabase/client", () => ({
  getSupabaseClient: () => ({
    from: fromMock,
    storage: { from: storageFromMock },
    rpc: rpcMock
  })
}));

import { adminReplyToSupportConversation, listMessages, sendMessage } from "./messages-repository";

describe("listMessages", () => {
  beforeEach(() => {
    fromMock.mockClear();
    for (const key of Object.keys(queryBuilder)) {
      queryBuilder[key].mockClear();
    }
    overrideTypesMock.mockReset();
    singleMock.mockReset();
    storageFromMock.mockClear();
    createSignedUrlsMock.mockReset();
    // 大多数测试不关心图片签名这件事，默认给一个"没有任何路径需要签"的
    // 空结果——只有真的带 image_path 的行才会走到这个批量签名调用。
    createSignedUrlsMock.mockResolvedValue({ data: [], error: null });
  });

  it("filters to the given conversation's non-deleted messages ordered oldest first", async () => {
    overrideTypesMock.mockResolvedValue({ data: [], error: null });

    await listMessages("conversation-1");

    expect(fromMock).toHaveBeenCalledWith("messages");
    expect(queryBuilder.select).toHaveBeenCalledWith(
      "id, sender_id, body, notification_payload, image_path, ref_activity_id, created_at"
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

  it("maps a regular (user-sent) row to MessageListItem with notificationPayload: null, imageUrl: null and refActivityId: null", async () => {
    overrideTypesMock.mockResolvedValue({
      data: [
        {
          id: "message-1",
          sender_id: "user-1",
          body: "你好",
          notification_payload: null,
          image_path: null,
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
        imageUrl: null,
        refActivityId: null,
        createdAt: "2026-07-17T00:00:00.000Z"
      }
    ]);
    // 没有任何一行带 image_path，不应该发起批量签名请求。
    expect(createSignedUrlsMock).not.toHaveBeenCalled();
  });

  // 联系客服改成真聊天任务卡：带 image_path 的行要批量签名，映射成
  // imageUrl。
  describe("images (联系客服改成真聊天任务卡)", () => {
    it("batch-signs every distinct image_path and maps it to imageUrl", async () => {
      overrideTypesMock.mockResolvedValue({
        data: [
          {
            id: "message-1",
            sender_id: "user-1",
            body: "看这张截图",
            notification_payload: null,
            image_path: "conversation-1/image-1.webp",
            ref_activity_id: null,
            created_at: "2026-07-17T00:00:00.000Z"
          },
          {
            id: "message-2",
            sender_id: "seller-1",
            body: null,
            notification_payload: null,
            image_path: "conversation-1/image-1.webp",
            ref_activity_id: null,
            created_at: "2026-07-17T00:01:00.000Z"
          }
        ],
        error: null
      });
      createSignedUrlsMock.mockResolvedValue({
        data: [
          { path: "conversation-1/image-1.webp", signedUrl: "https://signed.example.com/image-1.webp", error: null }
        ],
        error: null
      });

      const result = await listMessages("conversation-1");

      expect(storageFromMock).toHaveBeenCalledWith("message-images");
      // 两条消息用的是同一张图——去重之后应该只签一次，不是发两次请求。
      expect(createSignedUrlsMock).toHaveBeenCalledTimes(1);
      expect(createSignedUrlsMock).toHaveBeenCalledWith(
        ["conversation-1/image-1.webp"],
        expect.any(Number)
      );
      expect(result[0].imageUrl).toBe("https://signed.example.com/image-1.webp");
      expect(result[1].imageUrl).toBe("https://signed.example.com/image-1.webp");
    });

    it("does not call createSignedUrls when no row has an image_path", async () => {
      overrideTypesMock.mockResolvedValue({
        data: [
          {
            id: "message-1",
            sender_id: "user-1",
            body: "你好",
            notification_payload: null,
            image_path: null,
            ref_activity_id: null,
            created_at: "2026-07-17T00:00:00.000Z"
          }
        ],
        error: null
      });

      await listMessages("conversation-1");

      expect(createSignedUrlsMock).not.toHaveBeenCalled();
    });

    it("falls back to imageUrl: null for a path the signing call could not sign (e.g. already deleted from storage), without failing the whole list", async () => {
      overrideTypesMock.mockResolvedValue({
        data: [
          {
            id: "message-1",
            sender_id: "user-1",
            body: null,
            notification_payload: null,
            image_path: "conversation-1/missing.webp",
            ref_activity_id: null,
            created_at: "2026-07-17T00:00:00.000Z"
          }
        ],
        error: null
      });
      createSignedUrlsMock.mockResolvedValue({
        data: [{ path: "conversation-1/missing.webp", signedUrl: null, error: "not_found" }],
        error: null
      });

      const result = await listMessages("conversation-1");

      expect(result[0].imageUrl).toBeNull();
    });

    it("throws an AppError when the batch signing call itself fails", async () => {
      overrideTypesMock.mockResolvedValue({
        data: [
          {
            id: "message-1",
            sender_id: "user-1",
            body: null,
            notification_payload: null,
            image_path: "conversation-1/image-1.webp",
            ref_activity_id: null,
            created_at: "2026-07-17T00:00:00.000Z"
          }
        ],
        error: null
      });
      createSignedUrlsMock.mockResolvedValue({
        data: null,
        error: { message: "network down" }
      });

      await expect(listMessages("conversation-1")).rejects.toMatchObject({
        code: "MESSAGE_IMAGE_SIGN_FAILED"
      });
    });
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
          image_path: null,
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
          image_path: null,
          ref_activity_id: null,
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
        imageUrl: null,
        refActivityId: null,
        createdAt: "2026-07-17T00:00:00.000Z"
      }
    ]);
  });

  // 联系客服改成真聊天任务卡新增：sender_id 为 null 且
  // notification_payload 也为 null 的行——不是系统通知，是
  // admin_reply_to_support_conversation() 插入的客服聊天回复。仓库层
  // 只负责原样映射这一行，不做任何"是不是客服回复"的判断，那是
  // conversation-page.tsx 的事。
  it("maps an admin reply row (sender_id: null, notification_payload: null) through unchanged, like any other row", async () => {
    overrideTypesMock.mockResolvedValue({
      data: [
        {
          id: "message-4",
          sender_id: null,
          body: "你好，我是客服，有什么可以帮你的？",
          notification_payload: null,
          image_path: null,
          ref_activity_id: null,
          created_at: "2026-07-17T00:00:00.000Z"
        }
      ],
      error: null
    });

    const result = await listMessages("conversation-1");

    expect(result).toEqual([
      {
        id: "message-4",
        senderId: null,
        body: "你好，我是客服，有什么可以帮你的？",
        notificationPayload: null,
        imageUrl: null,
        refActivityId: null,
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

  it("inserts a message row (with image_path/ref_activity_id: null by default) and returns the new id", async () => {
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
      image_path: null,
      ref_activity_id: null
    });
    expect(queryBuilder.select).toHaveBeenCalledWith("id");
    expect(result).toEqual({ id: "message-1" });
  });

  // 联系客服改成真聊天任务卡：body 改成可选，一条消息可以只有图片。
  describe("images (联系客服改成真聊天任务卡)", () => {
    it("inserts image_path when provided, with body left undefined mapped to null", async () => {
      singleMock.mockResolvedValue({ data: { id: "message-1" }, error: null });

      await sendMessage({
        conversationId: "conversation-1",
        senderId: "user-1",
        imagePath: "conversation-1/image-1.webp"
      });

      expect(queryBuilder.insert).toHaveBeenCalledWith({
        conversation_id: "conversation-1",
        sender_id: "user-1",
        body: null,
        image_path: "conversation-1/image-1.webp",
        ref_activity_id: null
      });
    });

    it("inserts both body and image_path when both are provided", async () => {
      singleMock.mockResolvedValue({ data: { id: "message-1" }, error: null });

      await sendMessage({
        conversationId: "conversation-1",
        senderId: "user-1",
        body: "看这张截图",
        imagePath: "conversation-1/image-1.webp"
      });

      expect(queryBuilder.insert).toHaveBeenCalledWith({
        conversation_id: "conversation-1",
        sender_id: "user-1",
        body: "看这张截图",
        image_path: "conversation-1/image-1.webp",
        ref_activity_id: null
      });
    });
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
      image_path: null,
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

// 联系客服改成真聊天任务卡：管理员回复客服会话，唯一合法入口是
// admin_reply_to_support_conversation() 这个 RPC，不是直接 insert。
describe("adminReplyToSupportConversation", () => {
  beforeEach(() => {
    rpcMock.mockReset();
  });

  it("calls the admin_reply_to_support_conversation RPC with the given conversation/body/image", async () => {
    rpcMock.mockResolvedValue({ data: null, error: null });

    await adminReplyToSupportConversation(
      "conversation-1",
      "你好，请修改后重新提交。",
      null
    );

    expect(rpcMock).toHaveBeenCalledWith("admin_reply_to_support_conversation", {
      target_conversation_id: "conversation-1",
      body: "你好，请修改后重新提交。",
      image_path: null
    });
  });

  it("throws an AppError when the RPC fails (e.g. caller is not an admin)", async () => {
    rpcMock.mockResolvedValue({
      data: null,
      error: { message: "only admins can reply to support conversations" }
    });

    await expect(
      adminReplyToSupportConversation("conversation-1", "不应该能发", null)
    ).rejects.toMatchObject({ code: "ADMIN_SUPPORT_REPLY_FAILED" });
  });
});
