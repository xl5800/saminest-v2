import { QueryClient } from "@tanstack/react-query";
import { cleanup, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const {
  useMessagesQuery,
  useSendMessageMutation,
  useMyConversationsQuery,
  useMyProfileQuery,
  mutateAsyncMock,
  markConversationAsRead,
  useIsBlockingQuery,
  useIsBlockedPairQuery,
  useBlockUserMutation,
  useUnblockUserMutation,
  blockMutateAsyncMock,
  unblockMutateAsyncMock
} = vi.hoisted(() => ({
  useMessagesQuery: vi.fn(),
  useSendMessageMutation: vi.fn(),
  useMyConversationsQuery: vi.fn(),
  useMyProfileQuery: vi.fn(),
  mutateAsyncMock: vi.fn(),
  markConversationAsRead: vi.fn(),
  useIsBlockingQuery: vi.fn(),
  useIsBlockedPairQuery: vi.fn(),
  useBlockUserMutation: vi.fn(),
  useUnblockUserMutation: vi.fn(),
  blockMutateAsyncMock: vi.fn(),
  unblockMutateAsyncMock: vi.fn()
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
// 28 号卡：我方消息气泡头像的数据源，跟"我的"页共用同一个 hook——mock 掉
// 避免测试真的打到 Supabase，跟上面几个既有 hook 是同一个理由。
vi.mock("../../features/profile/use-my-profile-query", () => ({
  useMyProfileQuery
}));
// markConversationAsRead 是页面直接调用仓库函数（不经过 mutation hook），
// 见 conversation-page.tsx 挂载时的 useEffect，这里单独 mock 掉，避免
// 系统通知会话的测试真的打到 Supabase。
vi.mock("../../repositories/conversations-repository", () => ({
  markConversationAsRead
}));
// UGC 安全功能补齐任务卡 1：屏蔽相关的四个 hook 也要 mock 掉，否则会真的
// 调用底层仓库函数（进而打到 Supabase 客户端），跟上面几个已有 hook 是
// 同一个理由。
vi.mock("../../features/blocks/use-is-blocking-query", () => ({
  useIsBlockingQuery
}));
vi.mock("../../features/blocks/use-is-blocked-pair-query", () => ({
  useIsBlockedPairQuery
}));
vi.mock("../../features/blocks/use-block-user-mutation", () => ({
  useBlockUserMutation
}));
vi.mock("../../features/blocks/use-unblock-user-mutation", () => ({
  useUnblockUserMutation
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
    useMyProfileQuery.mockReset();
    markConversationAsRead.mockReset();
    markConversationAsRead.mockResolvedValue(undefined);
    useIsBlockingQuery.mockReset();
    useIsBlockedPairQuery.mockReset();
    useBlockUserMutation.mockReset();
    useUnblockUserMutation.mockReset();
    blockMutateAsyncMock.mockReset();
    unblockMutateAsyncMock.mockReset();

    useMessagesQuery.mockReturnValue({
      data: [],
      isPending: false,
      isError: false
    });
    useSendMessageMutation.mockReturnValue({
      mutateAsync: mutateAsyncMock,
      isPending: false
    });
    useIsBlockingQuery.mockReturnValue({ data: false });
    useIsBlockedPairQuery.mockReturnValue({ data: false });
    useBlockUserMutation.mockReturnValue({ mutateAsync: blockMutateAsyncMock, isPending: false });
    useUnblockUserMutation.mockReturnValue({ mutateAsync: unblockMutateAsyncMock, isPending: false });
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
    useMyProfileQuery.mockReturnValue({ data: { displayName: "Alice", avatarUrl: null } });
  });

  it("renders the other party's nickname and conversation context in the chat header", () => {
    renderPage();

    expect(screen.getByRole("heading", { name: "Bob" })).toBeInTheDocument();
    expect(screen.getByText("关于 木桌")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "返回" })).toBeInTheDocument();
    // 屏蔽功能补齐之后，非系统会话且 otherUserId 存在时，原来那个禁用的
    // 占位按钮换成了真正可点的"…"菜单——见下面 "blocking" describe 区块。
    expect(screen.getByRole("button", { name: "更多会话选项" })).toBeEnabled();
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

  // 28 号卡（私信消息气泡头像显示，改版后）：不做"连续同一发送者只在第
  // 一条显示"的分组——双方每一条消息都各自带一个头像，没有 spacer 占位，
  // 不管上一条是谁发的、隔了多久。
  it("shows an avatar on every message, on both sides (mine and the other party's), with no grouping/spacer even for consecutive messages from the same sender", () => {
    useMessagesQuery.mockReturnValue({
      data: [
        { id: "message-1", senderId: "user-1", body: "我的第一条", notificationPayload: null, createdAt: "2026-07-20T12:00:00.000Z" },
        { id: "message-1b", senderId: "user-1", body: "我的第一条续", notificationPayload: null, createdAt: "2026-07-20T12:00:30.000Z" },
        { id: "message-2", senderId: "seller-1", body: "对方第一条", notificationPayload: null, createdAt: "2026-07-20T12:01:00.000Z" },
        { id: "message-3", senderId: "seller-1", body: "对方第二条", notificationPayload: null, createdAt: "2026-07-20T12:02:00.000Z" },
        { id: "message-4", senderId: "user-1", body: "我的第二条", notificationPayload: null, createdAt: "2026-07-20T12:03:00.000Z" }
      ],
      isPending: false,
      isError: false
    });

    renderPage();

    // 对方两条连续消息（message-2/message-3）各自都有头像；我方三条
    // （message-1/message-1b/message-4）也各自都有头像——完全不看上一条
    // 消息是谁发的。没有任何 spacer 占位元素。
    expect(screen.getAllByTestId("message-avatar")).toHaveLength(2);
    expect(screen.getAllByTestId("message-avatar-self")).toHaveLength(3);
    expect(screen.queryByTestId("message-avatar-spacer")).not.toBeInTheDocument();
    expect(screen.queryByTestId("message-avatar-spacer-self")).not.toBeInTheDocument();
  });

  it("renders my own avatar image when myProfile.avatarUrl is present, and a nickname-initial placeholder otherwise", () => {
    useMyProfileQuery.mockReturnValue({
      data: { displayName: "Alice", avatarUrl: "https://img.example.com/alice.jpg" }
    });
    useMessagesQuery.mockReturnValue({
      data: [
        { id: "message-1", senderId: "user-1", body: "你好", notificationPayload: null, createdAt: "2026-07-20T12:00:00.000Z" }
      ],
      isPending: false,
      isError: false
    });

    renderPage();

    expect(screen.getByTestId("message-avatar-self")).toHaveAttribute(
      "src",
      "https://img.example.com/alice.jpg"
    );
  });

  it("falls back to '我' as my own avatar's placeholder initial when myProfile has no display name yet", () => {
    useMyProfileQuery.mockReturnValue({ data: null });
    useMessagesQuery.mockReturnValue({
      data: [
        { id: "message-1", senderId: "user-1", body: "你好", notificationPayload: null, createdAt: "2026-07-20T12:00:00.000Z" }
      ],
      isPending: false,
      isError: false
    });

    renderPage();

    expect(screen.getByTestId("message-avatar-self")).toHaveTextContent("我");
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

  it("shows the repository's specific message and preserves the typed text when sending rejects with MESSAGE_SEND_FORBIDDEN", async () => {
    // 这个 code 现在涵盖账号受限和屏蔽关系两种可能（见
    // messages-repository.ts 里 sendMessage() 的注释），页面只负责"展示
    // AppError 自带的具体文案而不是通用兜底文案"，不关心背后具体是哪种。
    mutateAsyncMock.mockRejectedValue(
      new AppError(
        "消息未能发送：你的账号可能处于限制状态，或你与对方之间存在屏蔽关系。",
        "MESSAGE_SEND_FORBIDDEN"
      )
    );

    renderPage();

    fireEvent.change(screen.getByLabelText("消息内容"), {
      target: { value: "这条消息发不出去" }
    });
    fireEvent.click(screen.getByRole("button", { name: "发送" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "消息未能发送：你的账号可能处于限制状态，或你与对方之间存在屏蔽关系。"
    );
    expect(screen.getByLabelText("消息内容")).toHaveValue("这条消息发不出去");
  });

  // UGC 安全功能补齐任务卡 1（屏蔽用户）：header "…"菜单 + 输入框换成
  // 屏蔽提示——见 conversation-page.tsx 顶部对应的注释段落。
  describe("blocking", () => {
    it("disables the more-options button when otherUserId is null (other party has left the conversation)", () => {
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

      expect(screen.getByRole("button", { name: "更多会话选项（暂不可用）" })).toBeDisabled();
      expect(screen.queryByRole("button", { name: "更多会话选项" })).not.toBeInTheDocument();
    });

    it("disables the more-options button for a system conversation", () => {
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

      renderPage();

      expect(screen.getByRole("button", { name: "更多会话选项（暂不可用）" })).toBeDisabled();
    });

    it("opens the more-options menu on click, showing '屏蔽此人' when not currently blocking, and closes it after the item is clicked", async () => {
      renderPage();

      expect(screen.queryByRole("menu")).not.toBeInTheDocument();

      fireEvent.click(screen.getByRole("button", { name: "更多会话选项" }));
      expect(screen.getByRole("menu")).toBeInTheDocument();
      const menuItem = screen.getByRole("menuitem", { name: "屏蔽此人" });

      fireEvent.click(menuItem);

      expect(blockMutateAsyncMock).toHaveBeenCalledWith({
        blockerId: "user-1",
        blockedId: "seller-1"
      });
      await waitFor(() => {
        expect(screen.queryByRole("menu")).not.toBeInTheDocument();
      });
    });

    it("shows '取消屏蔽' and calls the unblock mutation when already blocking", () => {
      useIsBlockingQuery.mockReturnValue({ data: true });

      renderPage();

      fireEvent.click(screen.getByRole("button", { name: "更多会话选项" }));
      fireEvent.click(screen.getByRole("menuitem", { name: "取消屏蔽" }));

      expect(unblockMutateAsyncMock).toHaveBeenCalledWith({
        blockerId: "user-1",
        blockedId: "seller-1"
      });
      expect(blockMutateAsyncMock).not.toHaveBeenCalled();
    });

    it("closes the more-options menu when clicking outside it", () => {
      renderPage();

      fireEvent.click(screen.getByRole("button", { name: "更多会话选项" }));
      expect(screen.getByRole("menu")).toBeInTheDocument();

      fireEvent.mouseDown(screen.getByTestId("conversation-messages"));

      expect(screen.queryByRole("menu")).not.toBeInTheDocument();
    });

    it("closes the more-options menu when pressing Escape", () => {
      renderPage();

      fireEvent.click(screen.getByRole("button", { name: "更多会话选项" }));
      expect(screen.getByRole("menu")).toBeInTheDocument();

      fireEvent.keyDown(window, { key: "Escape" });

      expect(screen.queryByRole("menu")).not.toBeInTheDocument();
    });

    it("shows a generic error alert in the message list when the block action fails", async () => {
      blockMutateAsyncMock.mockRejectedValue(new Error("network down"));

      renderPage();

      fireEvent.click(screen.getByRole("button", { name: "更多会话选项" }));
      fireEvent.click(screen.getByRole("menuitem", { name: "屏蔽此人" }));

      expect(await screen.findByRole("alert")).toHaveTextContent("操作失败，请稍后重试。");
    });

    it("replaces the composer with a blocked-relationship banner when isBlockedPair is true, for a non-system conversation", () => {
      useIsBlockedPairQuery.mockReturnValue({ data: true });

      renderPage();

      expect(screen.getByTestId("conversation-blocked-banner")).toHaveTextContent(
        "你们之间存在屏蔽关系，无法互发消息。"
      );
      expect(screen.queryByTestId("conversation-composer")).not.toBeInTheDocument();
    });

    it("does not render the blocked-relationship banner when isBlockedPair is false", () => {
      renderPage();

      expect(screen.queryByTestId("conversation-blocked-banner")).not.toBeInTheDocument();
      expect(screen.getByTestId("conversation-composer")).toBeInTheDocument();
    });

    it("does not render the blocked-relationship banner for a system conversation even if isBlockedPair were somehow true", () => {
      useIsBlockedPairQuery.mockReturnValue({ data: true });
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

      renderPage();

      expect(screen.queryByTestId("conversation-blocked-banner")).not.toBeInTheDocument();
      expect(screen.queryByTestId("conversation-composer")).not.toBeInTheDocument();
    });
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
  });

  // 未读标记不再只服务系统通知会话——markConversationAsRead 本身早就是
  // 通用实现，之前只在 system 分支调用是范围限制，不是这个函数的能力
  // 限制，这次把这个限制去掉。
  it("calls markConversationAsRead for a non-system (regular) conversation too", async () => {
    renderPage();

    await waitFor(() => {
      expect(markConversationAsRead).toHaveBeenCalledWith("conversation-1", "user-1");
    });
  });

  it("invalidates the conversations list query (['conversations', userId]) after markConversationAsRead succeeds, so the list reflects the read state when the user navigates back", async () => {
    const invalidateQueriesSpy = vi.spyOn(QueryClient.prototype, "invalidateQueries");

    renderPage();

    await waitFor(() => {
      expect(invalidateQueriesSpy).toHaveBeenCalledWith({ queryKey: ["conversations", "user-1"] });
    });

    invalidateQueriesSpy.mockRestore();
  });

  it("does not invalidate the conversations list query when markConversationAsRead fails", async () => {
    markConversationAsRead.mockRejectedValue(new Error("network down"));
    const invalidateQueriesSpy = vi.spyOn(QueryClient.prototype, "invalidateQueries");
    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    renderPage();

    await waitFor(() => {
      expect(markConversationAsRead).toHaveBeenCalled();
    });
    expect(invalidateQueriesSpy).not.toHaveBeenCalledWith({
      queryKey: ["conversations", "user-1"]
    });

    invalidateQueriesSpy.mockRestore();
    consoleErrorSpy.mockRestore();
  });

  // 30 号卡（打通"活动申请通知"到审核页面的跳转，方案 A）。
  describe("活动申请通知的'查看申请 →'链接", () => {
    it("renders a '查看申请 →' link under the message when refActivityId is present, pointing to /my-activities?pendingActivityId=<id>", () => {
      useMessagesQuery.mockReturnValue({
        data: [
          {
            id: "message-1",
            senderId: "seller-1",
            body: "Bob 申请加入你的活动《周末吃火锅》，去处理一下吧。",
            notificationPayload: null,
            refActivityId: "act-1",
            createdAt: "2026-07-20T12:00:00.000Z"
          }
        ],
        isPending: false,
        isError: false
      });

      renderPage();

      const link = screen.getByRole("link", { name: "查看申请 →" });
      expect(link).toHaveAttribute("href", "/my-activities?pendingActivityId=act-1");
    });

    it("does not render the link when refActivityId is null (e.g. a plain '报名了'/'退出了' notification)", () => {
      useMessagesQuery.mockReturnValue({
        data: [
          {
            id: "message-1",
            senderId: "seller-1",
            body: "Bob 报名了你的活动《周末吃火锅》",
            notificationPayload: null,
            refActivityId: null,
            createdAt: "2026-07-20T12:00:00.000Z"
          }
        ],
        isPending: false,
        isError: false
      });

      renderPage();

      expect(screen.queryByRole("link", { name: "查看申请 →" })).not.toBeInTheDocument();
    });

    it("does not render the link on the sender's own copy of the message (isMine), even though it has refActivityId", () => {
      useMessagesQuery.mockReturnValue({
        data: [
          {
            id: "message-1",
            // 当前登录用户（user-1）自己就是发这条消息的申请人。
            senderId: "user-1",
            body: "Alice 申请加入你的活动《周末吃火锅》，去处理一下吧。",
            notificationPayload: null,
            refActivityId: "act-1",
            createdAt: "2026-07-20T12:00:00.000Z"
          }
        ],
        isPending: false,
        isError: false
      });

      renderPage();

      expect(screen.queryByRole("link", { name: "查看申请 →" })).not.toBeInTheDocument();
    });

    it("keeps the plain chat-bubble style — does not turn the message into a SystemNotificationCard", () => {
      useMessagesQuery.mockReturnValue({
        data: [
          {
            id: "message-1",
            senderId: "seller-1",
            body: "Bob 申请加入你的活动《周末吃火锅》，去处理一下吧。",
            notificationPayload: null,
            refActivityId: "act-1",
            createdAt: "2026-07-20T12:00:00.000Z"
          }
        ],
        isPending: false,
        isError: false
      });

      renderPage();

      // 方案 A 明确要求：不是系统通知卡片（没有 aria-label="系统通知"的
      // 容器），消息正文仍然在普通气泡里显示，输入框也还在（双方仍然能
      // 继续在这条会话里聊天）。
      expect(screen.queryByLabelText("系统通知")).not.toBeInTheDocument();
      expect(
        screen.getByText("Bob 申请加入你的活动《周末吃火锅》，去处理一下吧。")
      ).toBeInTheDocument();
      expect(screen.getByTestId("conversation-composer")).toBeInTheDocument();
    });
  });
});
