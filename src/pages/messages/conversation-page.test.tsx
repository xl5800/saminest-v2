import { cleanup, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const {
  useMessagesQuery,
  useSendMessageMutation,
  useMyConversationsQuery,
  mutateAsyncMock,
  markConversationAsRead
} = vi.hoisted(() => ({
  useMessagesQuery: vi.fn(),
  useSendMessageMutation: vi.fn(),
  useMyConversationsQuery: vi.fn(),
  mutateAsyncMock: vi.fn(),
  markConversationAsRead: vi.fn()
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
// markConversationAsRead 是页面直接调用仓库函数（不经过 mutation hook），
// 见 conversation-page.tsx 挂载时的 useEffect，这里单独 mock 掉，避免
// 系统通知会话的测试真的打到 Supabase。
vi.mock("../../repositories/conversations-repository", () => ({
  markConversationAsRead
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
    markConversationAsRead.mockReset();
    markConversationAsRead.mockResolvedValue(undefined);

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
          originType: "post",
          otherUserId: "seller-1",
          otherDisplayName: "Bob",
          otherAvatarUrl: null,
          lastActivityAt: "2026-07-20T12:00:00.000Z"
        }
      ],
      isPending: false,
      isError: false
    });
  });

  it("renders the other party's nickname and conversation context in the chat header", () => {
    renderPage();

    expect(screen.getByRole("heading", { name: "Bob" })).toBeInTheDocument();
    expect(screen.getByText("关于 木桌")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "返回" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "更多会话选项（暂不可用）" })).toBeDisabled();
  });

  it("falls back to '对方' in the header when otherDisplayName is null", () => {
    useMyConversationsQuery.mockReturnValue({
      data: [
        {
          id: "conversation-1",
          postId: "post-1",
          postTitle: "木桌",
          originType: "post",
          otherUserId: null,
          otherDisplayName: null,
          otherAvatarUrl: null,
          lastActivityAt: "2026-07-20T12:00:00.000Z"
        }
      ],
      isPending: false,
      isError: false
    });

    renderPage();

    expect(screen.getByRole("heading", { name: "对方" })).toBeInTheDocument();
  });

  it("wraps the header avatar and nickname in a link to /users/:otherUserId", () => {
    const { container } = renderPage();

    const nicknameLink = screen.getByRole("link", { name: "Bob" });
    expect(nicknameLink).toHaveAttribute("href", "/users/seller-1");

    const headerAvatarLink = container.querySelector('header a[href="/users/seller-1"]');
    expect(headerAvatarLink).toBeInTheDocument();
  });

  it("does not render a profile link in the header when otherUserId is null", () => {
    useMyConversationsQuery.mockReturnValue({
      data: [
        {
          id: "conversation-1",
          postId: "post-1",
          postTitle: "木桌",
          originType: "post",
          otherUserId: null,
          otherDisplayName: null,
          otherAvatarUrl: null,
          lastActivityAt: "2026-07-20T12:00:00.000Z"
        }
      ],
      isPending: false,
      isError: false
    });

    renderPage();

    expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });

  it("renders an <img> avatar in the header when otherAvatarUrl is present, and a nickname-initial placeholder when it is absent", () => {
    useMyConversationsQuery.mockReturnValue({
      data: [
        {
          id: "conversation-1",
          postId: "post-1",
          postTitle: "木桌",
          originType: "post",
          otherUserId: "seller-1",
          otherDisplayName: "Bob",
          otherAvatarUrl: "https://img.example.com/bob.jpg",
          lastActivityAt: "2026-07-20T12:00:00.000Z"
        }
      ],
      isPending: false,
      isError: false
    });

    // 头像 <img alt=""> 是装饰性图片，无障碍树里没有 role="img"，直接用
    // querySelector 定位。
    const { container } = renderPage();

    const headerAvatar = container.querySelector("header img");
    expect(headerAvatar).toHaveAttribute("src", "https://img.example.com/bob.jpg");
  });

  it("separates my messages from the other party without visible form-style labels", () => {
    useMessagesQuery.mockReturnValue({
      data: [
        {
          id: "message-1",
          senderId: "user-1",
          body: "你好",
          notificationPayload: null,
          createdAt: "2026-07-20T12:00:00.000Z"
        },
        {
          id: "message-2",
          senderId: "seller-1",
          body: "在的",
          notificationPayload: null,
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
    // 两条消息相隔 1 分钟且同一天，按分组时间线规则只在第一条消息前显示一条时间分隔线。
    expect(container.querySelectorAll("time")).toHaveLength(1);
  });

  it("only shows a time divider before the first message of a tightly-spaced run", () => {
    useMessagesQuery.mockReturnValue({
      data: [
        { id: "message-1", senderId: "user-1", body: "第一条", notificationPayload: null, createdAt: "2026-07-20T12:00:00.000Z" },
        { id: "message-2", senderId: "seller-1", body: "第二条", notificationPayload: null, createdAt: "2026-07-20T12:02:00.000Z" },
        { id: "message-3", senderId: "user-1", body: "第三条", notificationPayload: null, createdAt: "2026-07-20T12:04:00.000Z" }
      ],
      isPending: false,
      isError: false
    });

    const { container } = renderPage();

    const messageRegion = screen.getByTestId("conversation-messages");
    const listItems = Array.from(messageRegion.querySelectorAll("li"));

    expect(container.querySelectorAll("time")).toHaveLength(1);
    // 时间分隔线是列表里独立的一项，排在这组消息最前面，不属于任何消息气泡。
    expect(listItems[0].querySelector("time")).toBeInTheDocument();
    expect(listItems[0]).not.toHaveAttribute("data-message-owner");
    expect(listItems.slice(1).every((item) => item.hasAttribute("data-message-owner"))).toBe(true);
  });

  it("shows the avatar only on the first message of a consecutive run from the same sender, uses a spacer on later ones, and never renders an avatar for the current user's own messages", () => {
    useMessagesQuery.mockReturnValue({
      data: [
        { id: "message-1", senderId: "user-1", body: "我的第一条", notificationPayload: null, createdAt: "2026-07-20T12:00:00.000Z" },
        { id: "message-2", senderId: "seller-1", body: "对方第一条", notificationPayload: null, createdAt: "2026-07-20T12:01:00.000Z" },
        { id: "message-3", senderId: "seller-1", body: "对方第二条", notificationPayload: null, createdAt: "2026-07-20T12:02:00.000Z" },
        { id: "message-4", senderId: "user-1", body: "我的第二条", notificationPayload: null, createdAt: "2026-07-20T12:03:00.000Z" }
      ],
      isPending: false,
      isError: false
    });

    renderPage();

    // 只有对方那一组连续消息里的第一条（message-2）显示头像，第二条
    // （message-3）不重复显示、只用一个等宽 spacer 占位；我发的两条
    // （message-1/message-4）完全不渲染头像也不渲染 spacer。
    expect(screen.getAllByTestId("message-avatar")).toHaveLength(1);
    expect(screen.getAllByTestId("message-avatar-spacer")).toHaveLength(1);
  });

  it("inserts a new time divider after a gap of more than 5 minutes", () => {
    useMessagesQuery.mockReturnValue({
      data: [
        { id: "message-1", senderId: "user-1", body: "早一点的消息", notificationPayload: null, createdAt: "2026-07-20T12:00:00.000Z" },
        { id: "message-2", senderId: "seller-1", body: "十分钟后的消息", notificationPayload: null, createdAt: "2026-07-20T12:10:00.000Z" }
      ],
      isPending: false,
      isError: false
    });

    const { container } = renderPage();

    expect(container.querySelectorAll("time")).toHaveLength(2);
  });

  it("inserts a new time divider when messages cross a local day boundary even if the gap is small", () => {
    // 使用本地午夜前后各 1 分钟，避免测试结果依赖运行环境的时区。
    const localMidnight = new Date(2026, 6, 21, 0, 0, 0, 0);
    const justBeforeMidnight = new Date(localMidnight.getTime() - 60 * 1000).toISOString();
    const justAfterMidnight = new Date(localMidnight.getTime() + 60 * 1000).toISOString();

    useMessagesQuery.mockReturnValue({
      data: [
        { id: "message-1", senderId: "user-1", body: "昨晚的消息", notificationPayload: null, createdAt: justBeforeMidnight },
        { id: "message-2", senderId: "seller-1", body: "今天凌晨的消息", notificationPayload: null, createdAt: justAfterMidnight }
      ],
      isPending: false,
      isError: false
    });

    const { container } = renderPage();

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
          notificationPayload: null,
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

  describe("system notification conversations (originType: 'system')", () => {
    function mockSystemConversation() {
      useMyConversationsQuery.mockReturnValue({
        data: [
          {
            id: "conversation-1",
            postId: null,
            postTitle: null,
            originType: "system",
            otherUserId: null,
            otherDisplayName: null,
            otherAvatarUrl: null,
            lastActivityAt: "2026-08-18T00:00:00.000Z"
          }
        ],
        isPending: false,
        isError: false
      });
    }

    it("shows 'Saminest 通知' + '官方通知' in the header instead of otherDisplayName/postTitle, with a Bell icon (not an avatar/initial)", () => {
      mockSystemConversation();

      const { container } = renderPage();

      expect(screen.getByRole("heading", { name: "Saminest 通知" })).toBeInTheDocument();
      expect(screen.getByText("官方通知")).toBeInTheDocument();
      expect(container.querySelector("header svg.lucide-bell")).toBeInTheDocument();
      expect(container.querySelector("header img")).not.toBeInTheDocument();
    });

    it("does not render a /users/:id profile link in the header for a system conversation", () => {
      mockSystemConversation();

      renderPage();

      expect(screen.queryByRole("link")).not.toBeInTheDocument();
    });

    it("does not render the composer form for a system conversation", () => {
      mockSystemConversation();

      renderPage();

      expect(screen.queryByTestId("conversation-composer")).not.toBeInTheDocument();
      expect(screen.queryByLabelText("消息内容")).not.toBeInTheDocument();
    });

    it("renders a system notification message as a card (icon + title + summary + time), not a chat bubble, and does not treat it as a consecutive message needing an avatar/spacer", () => {
      mockSystemConversation();
      useMessagesQuery.mockReturnValue({
        data: [
          {
            id: "message-1",
            senderId: null,
            body: "你的帖子《周末吃火锅》审核通过，现在可以在首页看到啦。",
            notificationPayload: {
              title: "帖子审核通过",
              summary: "你的帖子《周末吃火锅》审核通过，现在可以在首页看到啦。",
              link: "/post/post-1"
            },
            createdAt: "2026-08-18T00:00:00.000Z"
          }
        ],
        isPending: false,
        isError: false
      });

      const { container } = renderPage();

      expect(screen.getByText("帖子审核通过")).toBeInTheDocument();
      expect(
        screen.getByText("你的帖子《周末吃火锅》审核通过，现在可以在首页看到啦。")
      ).toBeInTheDocument();
      const systemRow = container.querySelector('[data-message-owner="system"]');
      expect(systemRow).toBeInTheDocument();
      expect(container.querySelector('[data-message-owner="other"]')).not.toBeInTheDocument();
      expect(screen.queryByTestId("message-avatar")).not.toBeInTheDocument();
      expect(screen.queryByTestId("message-avatar-spacer")).not.toBeInTheDocument();
    });

    it("wraps the system notification card in a link to notificationPayload.link when it is present", () => {
      mockSystemConversation();
      useMessagesQuery.mockReturnValue({
        data: [
          {
            id: "message-1",
            senderId: null,
            body: "你的帖子审核通过。",
            notificationPayload: {
              title: "帖子审核通过",
              summary: null,
              link: "/post/post-1"
            },
            createdAt: "2026-08-18T00:00:00.000Z"
          }
        ],
        isPending: false,
        isError: false
      });

      renderPage();

      expect(screen.getByRole("link", { name: /帖子审核通过/ })).toHaveAttribute(
        "href",
        "/post/post-1"
      );
    });

    it("does not wrap the system notification card in a link when notificationPayload.link is null", () => {
      mockSystemConversation();
      useMessagesQuery.mockReturnValue({
        data: [
          {
            id: "message-1",
            senderId: null,
            body: "你的帖子未通过审核。",
            notificationPayload: {
              title: "帖子审核未通过",
              summary: "违反社区规范。",
              link: null
            },
            createdAt: "2026-08-18T00:00:00.000Z"
          }
        ],
        isPending: false,
        isError: false
      });

      renderPage();

      expect(screen.getByText("帖子审核未通过")).toBeInTheDocument();
      expect(screen.queryByRole("link")).not.toBeInTheDocument();
    });

    it("calls markConversationAsRead with the conversation and current user ids for a system conversation", async () => {
      mockSystemConversation();

      renderPage();

      await waitFor(() => {
        expect(markConversationAsRead).toHaveBeenCalledWith("conversation-1", "user-1");
      });
    });

    it("does not call markConversationAsRead for a non-system conversation", async () => {
      renderPage();

      await new Promise((resolve) => setTimeout(resolve, 0));
      expect(markConversationAsRead).not.toHaveBeenCalled();
    });
  });
});
