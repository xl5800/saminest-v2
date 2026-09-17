import { cleanup, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { useAdminSupportConversationsQuery } = vi.hoisted(() => ({
  useAdminSupportConversationsQuery: vi.fn()
}));

vi.mock("../../features/admin/use-admin-support-conversations-query", () => ({
  useAdminSupportConversationsQuery
}));

import { renderWithProviders } from "../../test/render-with-providers";
import { AdminSupportConversationsPage } from "./support-conversations-page";

describe("AdminSupportConversationsPage", () => {
  afterEach(() => {
    cleanup();
  });

  beforeEach(() => {
    useAdminSupportConversationsQuery.mockReset();
  });

  it("shows a loading indicator while pending", () => {
    useAdminSupportConversationsQuery.mockReturnValue({ data: undefined, isPending: true, isError: false });

    renderWithProviders(<AdminSupportConversationsPage />);

    expect(screen.getByRole("status")).toHaveTextContent("加载中…");
  });

  it("shows an error message when the list fails to load", () => {
    useAdminSupportConversationsQuery.mockReturnValue({ data: undefined, isPending: false, isError: true });

    renderWithProviders(<AdminSupportConversationsPage />);

    expect(screen.getByRole("alert")).toHaveTextContent("客服会话加载失败，请稍后重试。");
  });

  it("shows an empty-state message when there are no support conversations", () => {
    useAdminSupportConversationsQuery.mockReturnValue({ data: [], isPending: false, isError: false });

    renderWithProviders(<AdminSupportConversationsPage />);

    expect(screen.getByRole("status")).toHaveTextContent("暂无客服会话");
  });

  it("renders each conversation as a row linking to /admin/support/:conversationId, with display name, last-message time, and preview", () => {
    useAdminSupportConversationsQuery.mockReturnValue({
      data: [
        {
          conversationId: "conversation-1",
          userId: "user-1",
          displayName: "Alice",
          avatarUrl: null,
          lastMessageAt: "2026-07-20T12:00:00.000Z",
          lastMessagePreview: "你好，我想咨询一下"
        },
        {
          conversationId: "conversation-2",
          userId: "user-2",
          displayName: "Bob",
          avatarUrl: "https://img.example.com/bob.jpg",
          lastMessageAt: null,
          lastMessagePreview: null
        }
      ],
      isPending: false,
      isError: false
    });

    const { container } = renderWithProviders(<AdminSupportConversationsPage />);

    const aliceLink = screen.getByRole("link", { name: /Alice/ });
    expect(aliceLink).toHaveAttribute("href", "/admin/support/conversation-1");
    expect(aliceLink).toHaveTextContent("你好，我想咨询一下");

    const bobLink = screen.getByRole("link", { name: /Bob/ });
    expect(bobLink).toHaveAttribute("href", "/admin/support/conversation-2");
    // avatarUrl 存在时渲染真实 <img>，不是首字母占位。
    expect(container.querySelector('img[src="https://img.example.com/bob.jpg"]')).toBeInTheDocument();
  });

  it("falls back to an initial-letter placeholder when avatarUrl is null", () => {
    useAdminSupportConversationsQuery.mockReturnValue({
      data: [
        {
          conversationId: "conversation-1",
          userId: "user-1",
          displayName: "alice",
          avatarUrl: null,
          lastMessageAt: null,
          lastMessagePreview: null
        }
      ],
      isPending: false,
      isError: false
    });

    renderWithProviders(<AdminSupportConversationsPage />);

    expect(screen.getByText("A")).toBeInTheDocument();
  });
});
