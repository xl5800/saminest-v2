import { cleanup, fireEvent, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { useMessagesQuery, useSendMessageMutation, useMyConversationsQuery, mutateAsyncMock } = vi.hoisted(() => ({
  useMessagesQuery: vi.fn(),
  useSendMessageMutation: vi.fn(),
  useMyConversationsQuery: vi.fn(),
  mutateAsyncMock: vi.fn()
}));

vi.mock("../../features/messages/use-messages-query", () => ({
  useMessagesQuery
}));
vi.mock("../../features/messages/use-send-message-mutation", () => ({
  useSendMessageMutation
}));
vi.mock("../../features/conversations/use-my-conversations-query", () => ({
  useMyConversationsQuery
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
    useMyConversationsQuery.mockReset();

    useMessagesQuery.mockReturnValue({
      data: [],
      isPending: false,
      isError: false
    });
    useSendMessageMutation.mockReturnValue({
      mutateAsync: mutateAsyncMock,
      isPending: false
    });
    useMyConversationsQuery.mockReturnValue({
      data: [
        {
          id: "conversation-1",
          postId: "post-1",
          postTitle: "木桌",
          otherPartyRole: "seller",
          lastActivityAt: "2026-07-20T12:00:00.000Z"
        }
      ],
      isPending: false,
      isError: false
    });
  });

  it("renders the other party identity and conversation context in the chat header", () => {
    renderPage();

    expect(screen.getByRole("heading", { name: "卖家" })).toBeInTheDocument();
    expect(screen.getByText("关于 木桌")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "返回" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "更多会话选项（暂不可用）" })).toBeDisabled();
  });

  it("separates my messages from the other party without visible form-style labels", () => {
    useMessagesQuery.mockReturnValue({
      data: [
        {
          id: "message-1",
          senderId: "user-1",
          body: "你好",
          createdAt: "2026-07-20T12:00:00.000Z"
        },
        {
          id: "message-2",
          senderId: "seller-1",
          body: "在的",
          createdAt: "2026-07-20T12:01:00.000Z"
        }
      ],
      isPending: false,
      isError: false
    });

    const { container } = renderPage();

    const mine = container.querySelector('[data-message-owner="self"]');
    const theirs = container.querySelector('[data-message-owner="other"]');

    expect(mine).toHaveClass("justify-end");
    expect(theirs).toHaveClass("justify-start");
    expect(within(mine as HTMLElement).getByText("你好")).toBeInTheDocument();
    expect(within(theirs as HTMLElement).getByText("在的")).toBeInTheDocument();
    expect(screen.queryByText(/^(我|对方)：/)).not.toBeInTheDocument();
    expect(container.querySelectorAll("time")).toHaveLength(2);
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

  it("disables the send button for empty or whitespace-only content", () => {
    renderPage();

    const sendButton = screen.getByRole("button", { name: "发送" });
    expect(sendButton).toBeDisabled();

    fireEvent.change(screen.getByLabelText("消息内容"), {
      target: { value: "   " }
    });

    expect(sendButton).toBeDisabled();
    expect(mutateAsyncMock).not.toHaveBeenCalled();
  });

  it("keeps the compact composer above the safe area and reserves message-list bottom space", () => {
    renderPage();

    const composer = screen.getByTestId("conversation-composer");
    const messageRegion = screen.getByTestId("conversation-messages");
    const input = screen.getByLabelText("消息内容");

    expect(composer.getAttribute("style")).toContain("env(safe-area-inset-bottom)");
    expect(messageRegion).toHaveClass("overflow-y-auto", "pb-6");
    expect(input).toHaveAttribute("rows", "1");
    expect(input).toHaveClass("h-12", "text-base");
  });

  it("wraps a long unbroken message inside a 75 percent bubble", () => {
    const longMessage = "a".repeat(300);
    useMessagesQuery.mockReturnValue({
      data: [
        {
          id: "message-long",
          senderId: "seller-1",
          body: longMessage,
          createdAt: "2026-07-20T12:00:00.000Z"
        }
      ],
      isPending: false,
      isError: false
    });

    renderPage();

    const bubble = screen.getByText(longMessage);
    expect(bubble).toHaveClass("[overflow-wrap:anywhere]");
    expect(bubble.parentElement).toHaveClass("max-w-[75%]");
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
