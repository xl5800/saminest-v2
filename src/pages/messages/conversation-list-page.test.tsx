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

  it("renders the other party's nickname and post titles, linking to /messages/:id", () => {
    useMyConversationsQuery.mockReturnValue({
      data: [
        {
          id: "conv-1",
          postId: "post-1",
          postTitle: "Sunny room",
          otherUserId: "user-2",
          otherDisplayName: "Bob",
          otherAvatarUrl: null,
          lastActivityAt: "2026-07-10T00:00:00.000Z"
        },
        {
          id: "conv-2",
          postId: "post-2",
          postTitle: "Used sofa",
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

    const links = screen.getAllByRole("link");
    expect(links).toHaveLength(2);

    expect(links[0]).toHaveAttribute("href", "/messages/conv-1");
    expect(links[0]).toHaveTextContent("Bob");
    expect(links[0]).toHaveTextContent("关于：Sunny room");

    expect(links[1]).toHaveAttribute("href", "/messages/conv-2");
    expect(links[1]).toHaveTextContent("Carol");
    expect(links[1]).toHaveTextContent("关于：Used sofa");
  });

  it("falls back to '对方' when otherDisplayName is null (e.g. the other party has left the conversation)", () => {
    useMyConversationsQuery.mockReturnValue({
      data: [
        {
          id: "conv-1",
          postId: null,
          postTitle: null,
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

    expect(screen.getByRole("link")).toHaveTextContent("对方");
  });

  it("renders an <img> avatar when otherAvatarUrl is present, and a nickname-initial placeholder (no <img>) when it is absent", () => {
    useMyConversationsQuery.mockReturnValue({
      data: [
        {
          id: "conv-1",
          postId: null,
          postTitle: null,
          otherUserId: "user-2",
          otherDisplayName: "Bob",
          otherAvatarUrl: "https://img.example.com/bob.jpg",
          lastActivityAt: "2026-07-10T00:00:00.000Z"
        },
        {
          id: "conv-2",
          postId: null,
          postTitle: null,
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

    const link = screen.getByRole("link");
    expect(link).not.toHaveTextContent("关于");
  });

  it("renders a formatted date for lastActivityAt using the shared formatter", () => {
    useMyConversationsQuery.mockReturnValue({
      data: [
        {
          id: "conv-1",
          postId: null,
          postTitle: null,
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

    expect(screen.getByRole("link")).toHaveTextContent(
      new Date("2026-07-10T00:00:00.000Z").toLocaleDateString("zh-CN")
    );
  });
});
