import { cleanup, fireEvent, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const {
  useMyConversationsQuery,
  navigateMock,
  useIsBlockingQuery,
  useBlockUserMutation,
  useUnblockUserMutation,
  blockMutateAsyncMock,
  unblockMutateAsyncMock
} = vi.hoisted(() => ({
  useMyConversationsQuery: vi.fn(),
  navigateMock: vi.fn(),
  useIsBlockingQuery: vi.fn(),
  useBlockUserMutation: vi.fn(),
  useUnblockUserMutation: vi.fn(),
  blockMutateAsyncMock: vi.fn(),
  unblockMutateAsyncMock: vi.fn()
}));

vi.mock("../../features/conversations/use-my-conversations-query", () => ({
  useMyConversationsQuery
}));
// conversation-swipe-row.tsx（10 号卡新增）直接用这三个现成 hook 实现
// "屏蔽"这一项——这个页面测试不关心屏蔽功能本身的所有细节（那些在
// conversation-swipe-row.test.tsx 里已经覆盖），但既然它们会被真的渲染
// 出来（每一行都挂载 ConversationSwipeRow），必须 mock 掉，否则会真的
// 调用底层仓库函数、打到 Supabase 客户端。
vi.mock("../../features/blocks/use-is-blocking-query", () => ({ useIsBlockingQuery }));
vi.mock("../../features/blocks/use-block-user-mutation", () => ({ useBlockUserMutation }));
vi.mock("../../features/blocks/use-unblock-user-mutation", () => ({ useUnblockUserMutation }));
vi.mock("react-router-dom", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react-router-dom")>();
  return { ...actual, useNavigate: () => navigateMock };
});

import { useAuthStore } from "../../store/auth-store";
import { useConversationListPreferencesStore } from "../../store/conversation-list-preferences-store";
import { renderWithProviders } from "../../test/render-with-providers";
import { ConversationListPage } from "./conversation-list-page";

const initialAuthState = useAuthStore.getState();
const initialPreferencesState = useConversationListPreferencesStore.getState();

// 用鼠标事件模拟拖动，理由见 conversation-swipe-row.test.tsx 顶部注释——
// 这个仓库的 jsdom 测试环境没有实现 window.PointerEvent。
function dragTo(surface: HTMLElement, { startX, endX }: { startX: number; endX: number }) {
  fireEvent.mouseDown(surface, { button: 0, clientX: startX });
  fireEvent.mouseMove(window, { clientX: endX });
  fireEvent.mouseUp(window, { clientX: endX });
}

describe("ConversationListPage", () => {
  afterEach(() => {
    cleanup();
  });

  beforeEach(() => {
    useMyConversationsQuery.mockReset();
    navigateMock.mockReset();
    useIsBlockingQuery.mockReset();
    useBlockUserMutation.mockReset();
    useUnblockUserMutation.mockReset();
    blockMutateAsyncMock.mockReset();
    unblockMutateAsyncMock.mockReset();
    useIsBlockingQuery.mockReturnValue({ data: false });
    useBlockUserMutation.mockReturnValue({ mutateAsync: blockMutateAsyncMock, isPending: false });
    useUnblockUserMutation.mockReturnValue({
      mutateAsync: unblockMutateAsyncMock,
      isPending: false
    });

    useAuthStore.setState(initialAuthState, true);
    // 10 号卡新增的本地偏好 store 是真实的 Zustand + persist 实现（不是
    // mock），每个测试之间要重置内存态和 localStorage，避免上一个测试
    // "标为未读"/"隐藏"/"删除"过的会话 id 串到下一个测试里。
    useConversationListPreferencesStore.setState(initialPreferencesState, true);
    localStorage.clear();
  });

  describe("top bar (TopBar tab variant)", () => {
    it("renders '消息' as the page heading and a 通知 button, with no brand name/发布 button/? help icon", () => {
      useMyConversationsQuery.mockReturnValue({ data: [], isPending: false, isError: false });

      renderWithProviders(<ConversationListPage />);

      expect(screen.getByRole("heading", { name: "消息" })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "通知" })).toBeInTheDocument();
      expect(screen.queryByText("Saminest")).not.toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "发布" })).not.toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "?" })).not.toBeInTheDocument();
    });

    it("navigates to the notifications placeholder route when the 通知 bell is clicked", () => {
      useMyConversationsQuery.mockReturnValue({ data: [], isPending: false, isError: false });

      renderWithProviders(<ConversationListPage />);
      fireEvent.click(screen.getByRole("button", { name: "通知" }));

      expect(navigateMock).toHaveBeenCalledWith("/notifications");
    });
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

  // 10.1 扁平化：容器改成 divide-y divide-border（对应 --line token），
  // 每一行不再是独立的圆角/投影/白底卡片。
  it("renders a flat, divider-separated list — no per-row card border/rounded/shadow classes", () => {
    useMyConversationsQuery.mockReturnValue({
      data: [
        { ...baseConversation("conv-1", "Bob") },
        { ...baseConversation("conv-2", "Carol") }
      ],
      isPending: false,
      isError: false
    });

    const { container } = renderWithProviders(<ConversationListPage />);

    const list = container.querySelector("ul");
    expect(list).toHaveClass("divide-y", "divide-border");

    const rows = container.querySelectorAll("li");
    expect(rows).toHaveLength(2);
    for (const row of rows) {
      expect(row.className).not.toMatch(/\brounded/);
      expect(row.className).not.toMatch(/\bshadow/);
      expect(row.className).not.toMatch(/\bborder\b/);
    }
  });

  it("renders each conversation's nickname/avatar/preview/time inside a single link to /messages/:id (no separate /users/:id link)", () => {
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
          lastActivityAt: "2026-07-10T00:00:00.000Z",
          lastMessagePreview: "关于：《Sunny room》"
        },
        {
          id: "conv-2",
          postId: "post-2",
          postTitle: "Used sofa",
          originType: "post",
          otherUserId: "user-3",
          otherDisplayName: "Carol",
          otherAvatarUrl: null,
          lastActivityAt: "2026-07-09T00:00:00.000Z",
          lastMessagePreview: "关于：《Used sofa》"
        }
      ],
      isPending: false,
      isError: false
    });

    renderWithProviders(<ConversationListPage />);

    // 每一行只有一个 Link（指向会话本身），没有任何指向 /users/ 的链接——
    // 10.2 头像点击行为修正之后，整个仓库层面不应该再有一个链接指向
    // /users/ 前缀出现在这个列表里。
    const links = screen.getAllByRole("link");
    expect(links).toHaveLength(2);
    expect(links.every((link) => !link.getAttribute("href")?.startsWith("/users/"))).toBe(true);

    // 16 号卡：不再单独展示"关于：{postTitle}"这一行，最近一条消息预览
    // （lastMessagePreview）承担了展示"联系上下文"的作用——如果最近一条
    // 正好是发起联系时插入的引用消息，预览文字本身就是"关于：《标题》"，
    // 见 conversation-swipe-row.tsx 顶部这次改动的注释。
    const conversationLinks = screen.getAllByTestId("conversation-link");
    expect(conversationLinks).toHaveLength(2);
    expect(conversationLinks[0]).toHaveAttribute("href", "/messages/conv-1");
    expect(conversationLinks[0]).toHaveTextContent("Bob");
    expect(conversationLinks[0]).toHaveTextContent("关于：《Sunny room》");
    expect(conversationLinks[1]).toHaveAttribute("href", "/messages/conv-2");
    expect(conversationLinks[1]).toHaveTextContent("Carol");
    expect(conversationLinks[1]).toHaveTextContent("关于：《Used sofa》");
  });

  it("falls back to '对方' when otherDisplayName is null", () => {
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
    expect(screen.getAllByRole("link")).toHaveLength(1);
    expect(screen.getByTestId("conversation-link")).toHaveAttribute("href", "/messages/conv-1");
  });

  it("renders a system-notification row (originType: 'system') with 'Saminest 通知' + a Bell icon instead of otherDisplayName/avatar", () => {
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
    expect(container.querySelector("svg.lucide-bell")).toBeInTheDocument();
    expect(container.querySelector("img")).not.toBeInTheDocument();
    expect(screen.getAllByRole("link")).toHaveLength(1);
    expect(screen.getByTestId("conversation-link")).toHaveAttribute(
      "href",
      "/messages/conv-system-1"
    );
    // 系统会话没有"对方"，左滑菜单不应该出现屏蔽/已屏蔽按钮。
    expect(screen.queryByRole("button", { name: "屏蔽" })).not.toBeInTheDocument();
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

    const { container } = renderWithProviders(<ConversationListPage />);

    const images = container.querySelectorAll("img");
    expect(images).toHaveLength(1);
    expect(images[0]).toHaveAttribute("src", "https://img.example.com/bob.jpg");
    expect(screen.getByText("C")).toBeInTheDocument();
  });

  // 16 号卡：这一行整个已经去掉了（不再是"postTitle 为空时才不显示"，
  // 而是不管 postTitle 是什么都不再单独展示这一行），这里保留一个最简单
  // 的回归断言确认它真的不出现。
  it("never renders a 关于： line (removed in favor of lastMessagePreview)", () => {
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

    expect(screen.getByTestId("conversation-link")).not.toHaveTextContent("关于");
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
    expect(screen.getByText("Bob")).toHaveClass("font-bold");
    expect(screen.getByText("在的，什么事？")).toHaveClass("font-semibold");
    expect(screen.getByText("Carol")).not.toHaveClass("font-bold");
    expect(screen.getByText("好的，谢谢")).not.toHaveClass("font-semibold");
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

  // UGC 安全功能补齐任务卡 1（屏蔽用户）之后新增的入口：10 号卡把"屏蔽"
  // 接进了左滑菜单，跟 conversation-page.tsx 头部"…"菜单共享同一套
  // hook/同一条数据库记录（这里只做一次轻量的端到端接线验证，具体的
  // 屏蔽/取消屏蔽/错误处理等细节已经在 conversation-swipe-row.test.tsx
  // 里覆盖过，不在这里重复）。
  it("wires the logged-in user's id through to the 屏蔽 action", async () => {
    useAuthStore.getState().setSession({ user: { id: "user-1" } } as never);
    useMyConversationsQuery.mockReturnValue({
      data: [baseConversation("conv-1", "Bob")],
      isPending: false,
      isError: false
    });

    renderWithProviders(<ConversationListPage />);
    fireEvent.click(screen.getByRole("button", { name: "屏蔽" }));

    await vi.waitFor(() => {
      expect(blockMutateAsyncMock).toHaveBeenCalledWith({
        blockerId: "user-1",
        blockedId: "user-2"
      });
    });
  });

  // 10.3："标为未读/不显示/删除"走本地 store（conversation-list-preferences-
  // store.ts），不涉及后端。
  describe("local list preferences (标为未读 / 不显示 / 删除)", () => {
    it("filters out conversations that have been hidden or deleted locally", () => {
      useConversationListPreferencesStore.getState().hideConversation("conv-hidden");
      useConversationListPreferencesStore.getState().deleteConversation("conv-deleted");
      useMyConversationsQuery.mockReturnValue({
        data: [
          baseConversation("conv-visible", "Bob"),
          baseConversation("conv-hidden", "Carol"),
          baseConversation("conv-deleted", "Dave")
        ],
        isPending: false,
        isError: false
      });

      renderWithProviders(<ConversationListPage />);

      expect(screen.getByText("Bob")).toBeInTheDocument();
      expect(screen.queryByText("Carol")).not.toBeInTheDocument();
      expect(screen.queryByText("Dave")).not.toBeInTheDocument();
    });

    it("hides a row immediately after clicking 不显示 in its swipe menu", () => {
      useMyConversationsQuery.mockReturnValue({
        data: [baseConversation("conv-1", "Bob")],
        isPending: false,
        isError: false
      });

      renderWithProviders(<ConversationListPage />);
      expect(screen.getByText("Bob")).toBeInTheDocument();

      fireEvent.click(screen.getByRole("button", { name: "不显示" }));

      expect(screen.queryByText("Bob")).not.toBeInTheDocument();
      expect(screen.getByRole("status")).toHaveTextContent("暂无消息");
    });

    it("shows an unread dot for a conversation that has been manually 标为未读, even though the server says it is read", () => {
      useMyConversationsQuery.mockReturnValue({
        data: [{ ...baseConversation("conv-1", "Bob"), isUnread: false }],
        isPending: false,
        isError: false
      });

      renderWithProviders(<ConversationListPage />);
      expect(screen.queryByTestId("unread-dot")).not.toBeInTheDocument();

      fireEvent.click(screen.getByRole("button", { name: "标为未读" }));

      expect(screen.getByTestId("unread-dot")).toBeInTheDocument();
    });

    it("clears the manual 标为未读 marker once the row is actually navigated into", () => {
      useMyConversationsQuery.mockReturnValue({
        data: [{ ...baseConversation("conv-1", "Bob"), isUnread: false }],
        isPending: false,
        isError: false
      });

      renderWithProviders(<ConversationListPage />);
      fireEvent.click(screen.getByRole("button", { name: "标为未读" }));
      expect(screen.getByTestId("unread-dot")).toBeInTheDocument();

      fireEvent.click(screen.getByTestId("conversation-link"));

      expect(
        useConversationListPreferencesStore.getState().manuallyUnreadIds["conv-1"]
      ).toBeUndefined();
    });
  });

  // 10.3：同一时间最多一行处于"左滑菜单打开"状态。
  it("closes a previously-opened row's menu when another row is swiped open", () => {
    useMyConversationsQuery.mockReturnValue({
      data: [baseConversation("conv-1", "Bob"), baseConversation("conv-2", "Carol")],
      isPending: false,
      isError: false
    });

    renderWithProviders(<ConversationListPage />);
    const surfaces = screen.getAllByTestId("conversation-row-drag-surface");

    dragTo(surfaces[0], { startX: 200, endX: 0 });
    expect(surfaces[0]).toHaveStyle({ transform: `translateX(-288px)` });

    dragTo(surfaces[1], { startX: 200, endX: 0 });
    expect(surfaces[1]).toHaveStyle({ transform: `translateX(-288px)` });
    expect(surfaces[0]).toHaveStyle({ transform: `translateX(0px)` });
  });
});

function baseConversation(id: string, displayName: string) {
  return {
    id,
    postId: null,
    postTitle: null,
    originType: "post",
    otherUserId: displayName === "Bob" ? "user-2" : displayName === "Carol" ? "user-3" : "user-4",
    otherDisplayName: displayName,
    otherAvatarUrl: null,
    lastActivityAt: "2026-07-10T00:00:00.000Z",
    lastMessagePreview: null,
    isUnread: false
  };
}
