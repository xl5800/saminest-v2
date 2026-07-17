import { beforeEach, describe, expect, it, vi } from "vitest";

const { rpcMock } = vi.hoisted(() => ({
  rpcMock: vi.fn()
}));

vi.mock("../integrations/supabase/client", () => ({
  getSupabaseClient: () => ({ rpc: rpcMock })
}));

import { createDirectConversation } from "./conversations-repository";

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

  it("throws an AppError when the RPC succeeds but returns no conversation id", async () => {
    rpcMock.mockResolvedValue({ data: null, error: null });

    await expect(createDirectConversation("post-1")).rejects.toMatchObject({
      code: "CONVERSATION_CREATE_ID_MISSING"
    });
  });
});
