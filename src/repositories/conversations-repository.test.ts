import { beforeEach, describe, expect, it, vi } from "vitest";

const { rpcMock, queryBuilder, overrideTypesMock } = vi.hoisted(() => {
  const overrideTypesMock = vi.fn();
  const builder: Record<string, ReturnType<typeof vi.fn>> = {};
  const chain = ["select", "order"] as const;
  for (const method of chain) {
    builder[method] = vi.fn(() => builder);
  }
  builder.overrideTypes = overrideTypesMock;
  return { rpcMock: vi.fn(), queryBuilder: builder, overrideTypesMock };
});

const fromMock = vi.fn(() => queryBuilder);

vi.mock("../integrations/supabase/client", () => ({
  getSupabaseClient: () => ({ rpc: rpcMock, from: fromMock })
}));

import { createDirectConversation, listMyConversations } from "./conversations-repository";

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

describe("listMyConversations", () => {
  beforeEach(() => {
    fromMock.mockClear();
    for (const key of Object.keys(queryBuilder)) {
      queryBuilder[key].mockClear();
    }
    overrideTypesMock.mockReset();
  });

  it("queries conversations with a nested posts(title) select, ordered by created_at desc", async () => {
    overrideTypesMock.mockResolvedValue({ data: [], error: null });

    await listMyConversations("user-1");

    expect(fromMock).toHaveBeenCalledWith("conversations");
    expect(queryBuilder.select).toHaveBeenCalledWith(
      "id, post_id, created_by, last_message_at, created_at, posts(title)"
    );
    expect(queryBuilder.order).toHaveBeenCalledWith("created_at", { ascending: false });
  });

  it("maps a row with a post title", async () => {
    overrideTypesMock.mockResolvedValue({
      data: [
        {
          id: "conv-1",
          post_id: "post-1",
          created_by: "user-1",
          last_message_at: "2026-07-10T00:00:00.000Z",
          created_at: "2026-07-01T00:00:00.000Z",
          posts: { title: "Sunny room" }
        }
      ],
      error: null
    });

    const result = await listMyConversations("user-1");

    expect(result).toEqual([
      {
        id: "conv-1",
        postId: "post-1",
        postTitle: "Sunny room",
        otherPartyRole: "seller",
        lastActivityAt: "2026-07-10T00:00:00.000Z"
      }
    ]);
  });

  it("maps a row with post_id null (no post attached) to postTitle: null", async () => {
    overrideTypesMock.mockResolvedValue({
      data: [
        {
          id: "conv-1",
          post_id: null,
          created_by: "user-1",
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
    overrideTypesMock.mockResolvedValue({
      data: [
        {
          id: "conv-1",
          post_id: "post-hidden",
          created_by: "user-1",
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

  it("marks the other party as seller when the current user is the conversation creator (buyer)", async () => {
    overrideTypesMock.mockResolvedValue({
      data: [
        {
          id: "conv-1",
          post_id: "post-1",
          created_by: "user-1",
          last_message_at: null,
          created_at: "2026-07-01T00:00:00.000Z",
          posts: { title: "Sunny room" }
        }
      ],
      error: null
    });

    const result = await listMyConversations("user-1");

    expect(result[0].otherPartyRole).toBe("seller");
  });

  it("marks the other party as buyer when the current user is not the conversation creator (seller)", async () => {
    overrideTypesMock.mockResolvedValue({
      data: [
        {
          id: "conv-1",
          post_id: "post-1",
          created_by: "buyer-user",
          last_message_at: null,
          created_at: "2026-07-01T00:00:00.000Z",
          posts: { title: "Sunny room" }
        }
      ],
      error: null
    });

    const result = await listMyConversations("seller-user");

    expect(result[0].otherPartyRole).toBe("buyer");
  });

  it("falls back to created_at for lastActivityAt when last_message_at is null", async () => {
    overrideTypesMock.mockResolvedValue({
      data: [
        {
          id: "conv-1",
          post_id: null,
          created_by: "user-1",
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
    overrideTypesMock.mockResolvedValue({
      data: [
        {
          id: "conv-oldest-activity",
          post_id: null,
          created_by: "user-1",
          last_message_at: "2026-07-02T00:00:00.000Z",
          created_at: "2026-07-09T00:00:00.000Z",
          posts: null
        },
        {
          id: "conv-newest-activity-null-last-message",
          post_id: null,
          created_by: "user-1",
          last_message_at: null,
          created_at: "2026-07-15T00:00:00.000Z",
          posts: null
        },
        {
          id: "conv-middle-activity",
          post_id: null,
          created_by: "user-1",
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

  it("throws an AppError when the Supabase query fails", async () => {
    overrideTypesMock.mockResolvedValue({
      data: null,
      error: { message: "network down", code: "500" }
    });

    await expect(listMyConversations("user-1")).rejects.toMatchObject({
      code: "CONVERSATIONS_LIST_FAILED"
    });
  });

  it("returns an empty list without throwing when the user has no conversations", async () => {
    overrideTypesMock.mockResolvedValue({ data: [], error: null });

    await expect(listMyConversations("user-1")).resolves.toEqual([]);
  });
});
