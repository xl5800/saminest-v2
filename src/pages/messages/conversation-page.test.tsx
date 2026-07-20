import { cleanup, fireEvent, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { useMessagesQuery, useSendMessageMutation, mutateAsyncMock } = vi.hoisted(() => ({
  useMessagesQuery: vi.fn(),
  useSendMessageMutation: vi.fn(),
  mutateAsyncMock: vi.fn()
}));

vi.mock("../../features/messages/use-messages-query", () => ({
  useMessagesQuery
}));
vi.mock("../../features/messages/use-send-message-mutation", () => ({
  useSendMessageMutation
}));

import { useAuthStore } from "../../store/auth-store";
import { renderWithProviders } from "../../test/render-with-providers";
import { AppError } from "../../utils/app-error";
import { MessageConversationPage } from "./conversation-page";

const initialAuthState = useAuthStore.getState();

function renderPage() {
  return renderWithProviders(<MessageConversationPage />, {
    initialEntries: ["/messages/conversation-1"],
    route: "/messages/:conversationId"
  });
}

describe("MessageConversationPage", () => {
  afterEach(() => {
    cleanup();
  });

  beforeEach(() => {
    useAuthStore.setState(initialAuthState, true);
    useAuthStore.getState().setSession({ user: { id: "user-1" } } as never);

    mutateAsyncMock.mockReset();
    useMessagesQuery.mockReset();
    useSendMessageMutation.mockReset();

    useMessagesQuery.mockReturnValue({
      data: [],
      isPending: false,
      isError: false
    });
    useSendMessageMutation.mockReturnValue({
      mutateAsync: mutateAsyncMock,
      isPending: false
    });
  });

  it("labels each message as 我 or 对方 based on the current session's user id", () => {
    useMessagesQuery.mockReturnValue({
      data: [
        { id: "message-1", senderId: "user-1", body: "你好", createdAt: "t1" },
        { id: "message-2", senderId: "seller-1", body: "在的", createdAt: "t2" }
      ],
      isPending: false,
      isError: false
    });

    renderPage();

    expect(screen.getByText("我：你好")).toBeInTheDocument();
    expect(screen.getByText("对方：在的")).toBeInTheDocument();
  });

  it("shows an empty-conversation message when there are no messages yet", () => {
    renderPage();

    expect(
      screen.getByText("还没有消息，发一条打个招呼吧。")
    ).toBeInTheDocument();
  });

  it("shows a load error message when the messages query fails", () => {
    useMessagesQuery.mockReturnValue({
      data: undefined,
      isPending: false,
      isError: true
    });

    renderPage();

    expect(screen.getByRole("alert")).toHaveTextContent(
      "消息加载失败，请刷新页面重试。"
    );
  });

  it("sends a valid message and clears the input on success", async () => {
    mutateAsyncMock.mockResolvedValue({ id: "message-1" });

    renderPage();

    fireEvent.change(screen.getByLabelText("消息内容"), {
      target: { value: "你好，还在吗？" }
    });
    fireEvent.click(screen.getByRole("button", { name: "发送" }));

    expect(mutateAsyncMock).toHaveBeenCalledWith({
      senderId: "user-1",
      body: "你好，还在吗？"
    });

    await screen.findByLabelText("消息内容");
    expect(screen.getByLabelText("消息内容")).toHaveValue("");
  });

  it("shows a validation error and does not call the mutation for an empty message", () => {
    renderPage();

    fireEvent.click(screen.getByRole("button", { name: "发送" }));

    expect(screen.getByRole("alert")).toHaveTextContent("请输入消息内容。");
    expect(mutateAsyncMock).not.toHaveBeenCalled();
  });

  it("shows a validation error and does not call the mutation when the message is too long", () => {
    renderPage();

    fireEvent.change(screen.getByLabelText("消息内容"), {
      target: { value: "a".repeat(5001) }
    });
    fireEvent.click(screen.getByRole("button", { name: "发送" }));

    expect(screen.getByRole("alert")).toHaveTextContent(
      "消息内容不能超过 5000 字。"
    );
    expect(mutateAsyncMock).not.toHaveBeenCalled();
  });

  it("shows an error and preserves the typed text when sending fails", async () => {
    mutateAsyncMock.mockRejectedValue(new Error("network down"));

    renderPage();

    fireEvent.change(screen.getByLabelText("消息内容"), {
      target: { value: "这条消息发不出去" }
    });
    fireEvent.click(screen.getByRole("button", { name: "发送" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "发送失败，请稍后重试。"
    );
    expect(screen.getByLabelText("消息内容")).toHaveValue("这条消息发不出去");
  });

  it("shows the account-restricted message and preserves the typed text when sending rejects with ACCOUNT_RESTRICTED", async () => {
    mutateAsyncMock.mockRejectedValue(
      new AppError(
        "您的账号当前处于限制状态，无法执行此操作，如有疑问请联系管理员。",
        "ACCOUNT_RESTRICTED"
      )
    );

    renderPage();

    fireEvent.change(screen.getByLabelText("消息内容"), {
      target: { value: "这条消息发不出去" }
    });
    fireEvent.click(screen.getByRole("button", { name: "发送" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "您的账号当前处于限制状态，无法执行此操作，如有疑问请联系管理员。"
    );
    expect(screen.getByLabelText("消息内容")).toHaveValue("这条消息发不出去");
  });
});
