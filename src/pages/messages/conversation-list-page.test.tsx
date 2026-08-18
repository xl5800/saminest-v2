import { cleanup, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { useMyConversationsQuery } = vi.hoisted(() => ({
  useMyConversationsQuery: vi.fn()
}));

vi.mock("../../features/conversations/use-my-conversations-query", () => ({
  useMyConversationsQuery
}));

import { renderWithProviders } from "../../test/render-with-providers";
import { ConversationListPage } from "./conversation-list-page";

describe("ConversationListPage", () => {
  afterEach(() => {
    cleanup();
  });

  beforeEach(() => {
    useMyConversationsQuery.mockReset();
  });

  it("shows a loading state before the query resolves", () => {
    useMyConversationsQuery.mockReturnValue({
      data: undefined,
      isPending: true,
      isError: false
    });

    renderWithProviders(<ConversationListPage />);

    expect(screen.getByRole("status")).toHaveTextContent("加载中…");
  });

  it("shows an error state when the query fails", () => {
    useMyConversationsQuery.mockReturnValue({
      data: undefined,
      isPending: false,
      isError: true
    });

    renderWithProviders(<ConversationListPage />);

    expect(screen.getByRole("alert")).toHaveTextContent(
      "会话加载失败，请稍后重试。"
    );
  });

  it("shows 暂无消息 when the list is empty", () => {
    useMyConversationsQuery.mockReturnValue({
      data: [],
      isPending: false,
      isError: false
    });

    renderWithProviders(<ConversationListPage />);

    expect(screen.getByRole("status")).toHaveTextContent("暂无消息");
  });

  it("renders the other party's nickname/avatar linking to /users/:id, and post title/time linking to /messages/:id", () => {
    useMyConversationsQuery.mockReturnValue({
      data: [
        {
          id: "conv-1",
          postId: "post-1",
          postTitle: "Sunny room",
          originType: "post",
          otherUserId: "user-2",
          otherDisplayName: "Bob",
          otherAvatarUrl: null,
          lastActivityAt: "2026-07-10T00:00:00.000Z"
        },
        {
          id: "conv-2",
          postId: "post-2",
          postTitle: "Used sofa",
          originType: "post",
          otherUserId: "user-3",
          otherDisplayName: "Carol",
          otherAvatarUrl: null,
          lastActivityAt: "2026-07-09T00:00:00.000Z"
        }
      ],
      isPending: false,
      isError: false
    });

    renderWithProviders(<ConversationListPage />);

    expect(screen.getByRole("link", { name: "Bob" })).toHaveAttribute("href", "/users/user-2");
    expect(screen.getByRole("link", { name: "Carol" })).toHaveAttribute("href", "/users/user-3");

    const conversationLinks = screen.getAllByTestId("conversation-link");
    expect(conversationLinks).toHaveLength(2);
    expect(conversationLinks[0]).toHaveAttribute("href", "/messages/conv-1");
    expect(conversationLinks[0]).toHaveTextContent("关于：Sunny room");
    expect(conversationLinks[1]).toHaveAttribute("href", "/messages/conv-2");
    expect(conversationLinks[1]).toHaveTextContent("关于：Used sofa");
  });

  it("falls back to '对方' when otherDisplayName is null, and does not render a profile link when otherUserId is null (e.g. the other party has left the conversation)", () => {
    useMyConversationsQuery.mockReturnValue({
      data: [
        {
          id: "conv-1",
          postId: null,
          postTitle: null,
          originType: "post",
          otherUserId: null,
          otherDisplayName: null,
          otherAvatarUrl: null,
          lastActivityAt: "2026-07-10T00:00:00.000Z"
        }
      ],
      isPending: false,
      isError: false
    });

    renderWithProviders(<ConversationListPage />);

    expect(screen.getByText("对方")).toBeInTheDocument();
    // 只剩指向会话的那一个 Link，没有任何指向 /users/ 的链接。
    expect(screen.getAllByRole("link")).toHaveLength(1);
    expect(screen.getByTestId("conversation-link")).toHaveAttribute("href", "/messages/conv-1");
  });

  it("renders a system-notification row (originType: 'system') with 'Saminest 通知' + a Bell icon instead of otherDisplayName/avatar, and no /users/:id link", () => {
    useMyConversationsQuery.mockReturnValue({
      data: [
        {
          id: "conv-system-1",
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

    const { container } = renderWithProviders(<ConversationListPage />);

    expect(screen.getByText("Saminest 通知")).toBeInTheDocument();
    // Bell 图标是 lucide-react 渲染出的 <svg>，不是 <img>，也不是首字母
    // 占位文字——用 class 名里的 lucide-bell 断言图标类型确实是 Bell。
    expect(container.querySelector("svg.lucide-bell")).toBeInTheDocument();
    expect(container.querySelector("img")).not.toBeInTheDocument();
    // 只剩指向会话的那一个 Link，没有任何指向 /users/ 的链接——系统通知
    // 没有"对方"，没有公开主页可以跳。
    expect(screen.getAllByRole("link")).toHaveLength(1);
    expect(screen.getByTestId("conversation-link")).toHaveAttribute(
      "href",
      "/messages/conv-system-1"
    );
  });

  it("renders an <img> avatar when otherAvatarUrl is present, and a nickname-initial placeholder (no <img>) when it is absent", () => {
    useMyConversationsQuery.mockReturnValue({
      data: [
        {
          id: "conv-1",
          postId: null,
          postTitle: null,
          originType: "post",
          otherUserId: "user-2",
          otherDisplayName: "Bob",
          otherAvatarUrl: "https://img.example.com/bob.jpg",
          lastActivityAt: "2026-07-10T00:00:00.000Z"
        },
        {
          id: "conv-2",
          postId: null,
          postTitle: null,
          originType: "post",
          otherUserId: "user-3",
          otherDisplayName: "carol",
          otherAvatarUrl: null,
          lastActivityAt: "2026-07-09T00:00:00.000Z"
        }
      ],
      isPending: false,
      isError: false
    });

    // 头像 <img alt=""> 是装饰性图片（昵称文字已经在旁边），无障碍树里不会
    // 带 role="img"，getByRole 查不到，所以这里直接用 querySelectorAll。
    const { container } = renderWithProviders(<ConversationListPage />);

    const images = container.querySelectorAll("img");
    expect(images).toHaveLength(1);
    expect(images[0]).toHaveAttribute("src", "https://img.example.com/bob.jpg");

    // 第二条没有头像图，退化成昵称首字母占位（大写）——不渲染 <img>。
    expect(screen.getByText("C")).toBeInTheDocument();
  });

  it("renders without a broken 关于： fragment when postTitle is null", () => {
    useMyConversationsQuery.mockReturnValue({
      data: [
        {
          id: "conv-1",
          postId: null,
          postTitle: null,
          originType: "post",
          otherUserId: "user-2",
          otherDisplayName: "Bob",
          otherAvatarUrl: null,
          lastActivityAt: "2026-07-10T00:00:00.000Z"
        }
      ],
      isPending: false,
      isError: false
    });

    renderWithProviders(<ConversationListPage />);

    const link = screen.getByTestId("conversation-link");
    expect(link).not.toHaveTextContent("关于");
  });

  it("renders the last message preview text truncated to a single line, and omits the row entirely when there is no preview yet", () => {
    useMyConversationsQuery.mockReturnValue({
      data: [
        {
          id: "conv-1",
          postId: null,
          postTitle: null,
          originType: "post",
          otherUserId: "user-2",
          otherDisplayName: "Bob",
          otherAvatarUrl: null,
          lastActivityAt: "2026-07-10T00:00:00.000Z",
          lastMessagePreview: "在的，什么事？",
          isUnread: false
        },
        {
          id: "conv-2",
          postId: null,
          postTitle: null,
          originType: "post",
          otherUserId: "user-3",
          otherDisplayName: "Carol",
          otherAvatarUrl: null,
          lastActivityAt: "2026-07-09T00:00:00.000Z",
          lastMessagePreview: null,
          isUnread: false
        }
      ],
      isPending: false,
      isError: false
    });

    renderWithProviders(<ConversationListPage />);

    const previews = screen.getAllByTestId("conversation-preview");
    expect(previews).toHaveLength(1);
    expect(previews[0]).toHaveTextContent("在的，什么事？");
    expect(previews[0]).toHaveClass("truncate", "whitespace-nowrap");
    // 第二条 lastMessagePreview 为 null，不展示"暂无消息"这类占位文案。
    expect(screen.queryByText(/暂无消息/)).not.toBeInTheDocument();
  });

  it("shows a red dot and bolds the nickname/preview for an unread conversation, but not for a read one", () => {
    useMyConversationsQuery.mockReturnValue({
      data: [
        {
          id: "conv-unread",
          postId: null,
          postTitle: null,
          originType: "post",
          otherUserId: "user-2",
          otherDisplayName: "Bob",
          otherAvatarUrl: null,
          lastActivityAt: "2026-07-10T00:00:00.000Z",
          lastMessagePreview: "在的，什么事？",
          isUnread: true
        },
        {
          id: "conv-read",
          postId: null,
          postTitle: null,
          originType: "post",
          otherUserId: "user-3",
          otherDisplayName: "Carol",
          otherAvatarUrl: null,
          lastActivityAt: "2026-07-09T00:00:00.000Z",
          lastMessagePreview: "好的，谢谢",
          isUnread: false
        }
      ],
      isPending: false,
      isError: false
    });

    renderWithProviders(<ConversationListPage />);

    expect(screen.getAllByTestId("unread-dot")).toHaveLength(1);
    expect(screen.getByRole("link", { name: "Bob" })).toHaveClass("font-bold");
    const bobPreview = screen.getByText("在的，什么事？");
    expect(bobPreview).toHaveClass("font-semibold");
    expect(screen.getByRole("link", { name: "Carol" })).not.toHaveClass("font-bold");
    const carolPreview = screen.getByText("好的，谢谢");
    expect(carolPreview).not.toHaveClass("font-semibold");
  });

  it("renders a formatted date for lastActivityAt using the shared formatter", () => {
    useMyConversationsQuery.mockReturnValue({
      data: [
        {
          id: "conv-1",
          postId: null,
          postTitle: null,
          originType: "post",
          otherUserId: "user-2",
          otherDisplayName: "Bob",
          otherAvatarUrl: null,
          lastActivityAt: "2026-07-10T00:00:00.000Z"
        }
      ],
      isPending: false,
      isError: false
    });

    renderWithProviders(<ConversationListPage />);

    expect(screen.getByTestId("conversation-link")).toHaveTextContent(
      new Date("2026-07-10T00:00:00.000Z").toLocaleDateString("zh-CN")
    );
  });
});
