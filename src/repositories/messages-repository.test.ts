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
      "id, sender_id, body, created_at"
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

  it("maps rows to MessageListItem", async () => {
    overrideTypesMock.mockResolvedValue({
      data: [
        {
          id: "message-1",
          sender_id: "user-1",
          body: "你好",
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

  it("inserts a message row and returns the new id", async () => {
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
      body: "你好"
    });
    expect(queryBuilder.select).toHaveBeenCalledWith("id");
    expect(result).toEqual({ id: "message-1" });
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
