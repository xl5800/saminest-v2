import { cleanup, fireEvent, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const {
  useIsBlockingQuery,
  useBlockUserMutation,
  useUnblockUserMutation,
  blockMutateAsyncMock,
  unblockMutateAsyncMock
} = vi.hoisted(() => ({
  useIsBlockingQuery: vi.fn(),
  useBlockUserMutation: vi.fn(),
  useUnblockUserMutation: vi.fn(),
  blockMutateAsyncMock: vi.fn(),
  unblockMutateAsyncMock: vi.fn()
}));

vi.mock("../../features/blocks/use-is-blocking-query", () => ({ useIsBlockingQuery }));
vi.mock("../../features/blocks/use-block-user-mutation", () => ({ useBlockUserMutation }));
vi.mock("../../features/blocks/use-unblock-user-mutation", () => ({ useUnblockUserMutation }));

import { renderWithProviders } from "../../test/render-with-providers";
import { ConversationSwipeRow } from "./conversation-swipe-row";

const sampleConversation = {
  id: "conv-1",
  postId: null,
  postTitle: null,
  originType: "post" as const,
  otherUserId: "user-2",
  otherDisplayName: "Bob",
  otherAvatarUrl: null,
  lastActivityAt: "2026-07-10T00:00:00.000Z",
  lastMessagePreview: "在的，什么事？",
  isUnread: false
};

function renderRow(overrides: Partial<Parameters<typeof ConversationSwipeRow>[0]> = {}) {
  const props = {
    conversation: sampleConversation,
    currentUserId: "user-1",
    isOpen: false,
    onOpen: vi.fn(),
    onClose: vi.fn(),
    isManuallyUnread: false,
    onMarkAsUnread: vi.fn(),
    onHide: vi.fn(),
    onDelete: vi.fn(),
    onNavigate: vi.fn(),
    ...overrides
  };
  const result = renderWithProviders(
    <ul>
      <ConversationSwipeRow {...props} />
    </ul>
  );
  return { ...result, props };
}

// 用鼠标事件模拟拖动，不是 Pointer Events——见 conversation-swipe-row.tsx
// 顶部注释：这个仓库的 jsdom 测试环境没有实现 window.PointerEvent，
// fireEvent.pointerDown/Move/Up 在这个环境下拿到的 clientX 全部是
// undefined，写了也测不出实际效果。mousedown/mousemove（挂在 window 上）/
// mouseup 是组件真实监听的其中一组事件，jsdom 对它们有完整支持。
function dragTo(surface: HTMLElement, { startX, endX }: { startX: number; endX: number }) {
  fireEvent.mouseDown(surface, { button: 0, clientX: startX });
  fireEvent.mouseMove(window, { clientX: endX });
  fireEvent.mouseUp(window, { clientX: endX });
}

describe("ConversationSwipeRow", () => {
  afterEach(() => {
    cleanup();
  });

  beforeEach(() => {
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
  });

  it("renders avatar/nickname/preview/time inside a single link to /messages/:id, with no /users/:id link", () => {
    renderRow();

    const links = screen.getAllByRole("link");
    expect(links).toHaveLength(1);
    expect(links[0]).toHaveAttribute("href", "/messages/conv-1");
    expect(links[0]).toHaveTextContent("Bob");
    expect(links[0]).toHaveTextContent("在的，什么事？");
    expect(screen.queryByRole("link", { name: /Bob/ })).toHaveAttribute(
      "href",
      "/messages/conv-1"
    );
  });

  // 10.2 头像点击行为修正：头像现在跟整行共用同一个 Link，不再单独指向
  // /users/:id。
  it("wraps the avatar in the same single conversation link (clicking the avatar navigates to the conversation, not a profile)", () => {
    renderRow();

    const avatarInitial = screen.getByText("B");
    const link = screen.getByRole("link");
    expect(link).toContainElement(avatarInitial);
  });

  it("shows bold text and an unread dot when conversation.isUnread is true", () => {
    renderRow({ conversation: { ...sampleConversation, isUnread: true } });

    expect(screen.getByTestId("unread-dot")).toBeInTheDocument();
    expect(screen.getByText("Bob")).toHaveClass("font-bold");
  });

  // 10.3：手动"标为未读"跟服务端的 isUnread 是两个独立信号，任一个为真都要
  // 显示未读样式。
  it("shows bold text and an unread dot when isManuallyUnread is true even though conversation.isUnread is false", () => {
    renderRow({ conversation: { ...sampleConversation, isUnread: false }, isManuallyUnread: true });

    expect(screen.getByTestId("unread-dot")).toBeInTheDocument();
    expect(screen.getByText("Bob")).toHaveClass("font-bold");
  });

  it("does not show an unread dot when both isUnread and isManuallyUnread are false", () => {
    renderRow({ conversation: { ...sampleConversation, isUnread: false }, isManuallyUnread: false });

    expect(screen.queryByTestId("unread-dot")).not.toBeInTheDocument();
  });

  // fireEvent.click() 的返回值（dispatchEvent 是否被 preventDefault）在
  // 这里不是一个可靠的判断信号——react-router 的 <Link> 自己在"确实要
  // 导航"这条正常路径上也会调用 event.preventDefault()（用来阻止浏览器
  // 原生的整页跳转，改成客户端路由接管），所以"我自己的 onClick 主动拦下
  // 这次点击"和"Link 自己接管了这次正常导航"这两种情况，返回值都是
  // false，没法用这个返回值区分。这里改成直接断言 onNavigate/onClose
  // 有没有被调用——这才是这个组件真正关心、也真正能验证的行为信号。
  it("calls onNavigate when the row is closed and there was no drag", () => {
    const onNavigate = vi.fn();
    const onClose = vi.fn();
    renderRow({ onNavigate, onClose, isOpen: false });

    fireEvent.click(screen.getByRole("link"));

    expect(onNavigate).toHaveBeenCalledTimes(1);
    expect(onClose).not.toHaveBeenCalled();
  });

  it("calls onClose instead of onNavigate when the row's menu is already open and the content area is tapped", () => {
    const onNavigate = vi.fn();
    const onClose = vi.fn();
    renderRow({ onNavigate, onClose, isOpen: true });

    fireEvent.click(screen.getByRole("link"));

    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onNavigate).not.toHaveBeenCalled();
  });

  it("opens the menu (onOpen) when dragged left past half of the menu width", () => {
    const onOpen = vi.fn();
    const onClose = vi.fn();
    renderRow({ onOpen, onClose, isOpen: false });

    dragTo(screen.getByTestId("conversation-row-drag-surface"), { startX: 200, endX: 20 });

    expect(onOpen).toHaveBeenCalledTimes(1);
    expect(onClose).not.toHaveBeenCalled();
  });

  it("closes the menu (onClose) when dragged left less than half of the menu width", () => {
    const onOpen = vi.fn();
    const onClose = vi.fn();
    renderRow({ onOpen, onClose, isOpen: false });

    dragTo(screen.getByTestId("conversation-row-drag-surface"), { startX: 200, endX: 180 });

    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onOpen).not.toHaveBeenCalled();
  });

  it("does not navigate on the trailing click after a real drag, even though the drag itself ended up closed", () => {
    const onNavigate = vi.fn();
    const onOpen = vi.fn();
    const onClose = vi.fn();
    renderRow({ onNavigate, onOpen, onClose, isOpen: false });

    const surface = screen.getByTestId("conversation-row-drag-surface");
    dragTo(surface, { startX: 200, endX: 180 }); // 20px：超过点击阈值但没过半，收起
    onClose.mockClear();

    fireEvent.click(screen.getByRole("link"));

    expect(onNavigate).not.toHaveBeenCalled();
  });

  it("closes the menu when a mousedown happens outside the row while it is open", () => {
    const onClose = vi.fn();
    renderRow({ onClose, isOpen: true });

    fireEvent.mouseDown(document.body);

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  describe("menu actions (always present in the DOM, independent of swipe state)", () => {
    it("标为未读 calls onMarkAsUnread then onClose", () => {
      const onMarkAsUnread = vi.fn();
      const onClose = vi.fn();
      renderRow({ onMarkAsUnread, onClose });

      fireEvent.click(screen.getByRole("button", { name: "标为未读" }));

      expect(onMarkAsUnread).toHaveBeenCalledTimes(1);
      expect(onClose).toHaveBeenCalledTimes(1);
    });

    it("不显示 calls onHide then onClose", () => {
      const onHide = vi.fn();
      const onClose = vi.fn();
      renderRow({ onHide, onClose });

      fireEvent.click(screen.getByRole("button", { name: "不显示" }));

      expect(onHide).toHaveBeenCalledTimes(1);
      expect(onClose).toHaveBeenCalledTimes(1);
    });

    it("删除 calls onDelete then onClose", () => {
      const onDelete = vi.fn();
      const onClose = vi.fn();
      renderRow({ onDelete, onClose });

      fireEvent.click(screen.getByRole("button", { name: "删除" }));

      expect(onDelete).toHaveBeenCalledTimes(1);
      expect(onClose).toHaveBeenCalledTimes(1);
    });
  });

  describe("屏蔽 (reuses useIsBlockingQuery/useBlockUserMutation/useUnblockUserMutation)", () => {
    it("shows '屏蔽' when not currently blocking, and calls blockUser with the current+other user ids on click", async () => {
      useIsBlockingQuery.mockReturnValue({ data: false });
      const onClose = vi.fn();
      renderRow({ currentUserId: "user-1", onClose });

      fireEvent.click(screen.getByRole("button", { name: "屏蔽" }));

      await vi.waitFor(() => {
        expect(blockMutateAsyncMock).toHaveBeenCalledWith({
          blockerId: "user-1",
          blockedId: "user-2"
        });
      });
      await vi.waitFor(() => {
        expect(onClose).toHaveBeenCalledTimes(1);
      });
    });

    it("shows '已屏蔽' when currently blocking, and calls unblockUser on click", async () => {
      useIsBlockingQuery.mockReturnValue({ data: true });
      renderRow({ currentUserId: "user-1" });

      fireEvent.click(screen.getByRole("button", { name: "已屏蔽" }));

      await vi.waitFor(() => {
        expect(unblockMutateAsyncMock).toHaveBeenCalledWith({
          blockerId: "user-1",
          blockedId: "user-2"
        });
      });
      expect(blockMutateAsyncMock).not.toHaveBeenCalled();
    });

    it("shows a generic error and does not close the menu when the block action fails", async () => {
      useIsBlockingQuery.mockReturnValue({ data: false });
      blockMutateAsyncMock.mockRejectedValue(new Error("network down"));
      const onClose = vi.fn();
      renderRow({ currentUserId: "user-1", onClose });

      fireEvent.click(screen.getByRole("button", { name: "屏蔽" }));

      expect(await screen.findByRole("alert")).toHaveTextContent("操作失败，请稍后重试。");
      expect(onClose).not.toHaveBeenCalled();
    });

    it("does not render a 屏蔽/已屏蔽 button for a system-notification conversation", () => {
      renderRow({
        conversation: {
          ...sampleConversation,
          originType: "system",
          otherUserId: null,
          otherDisplayName: null
        }
      });

      expect(screen.queryByRole("button", { name: "屏蔽" })).not.toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "已屏蔽" })).not.toBeInTheDocument();
    });

    it("does not render a 屏蔽/已屏蔽 button when otherUserId is null (the other party has left the conversation)", () => {
      renderRow({ conversation: { ...sampleConversation, otherUserId: null } });

      expect(screen.queryByRole("button", { name: "屏蔽" })).not.toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "已屏蔽" })).not.toBeInTheDocument();
    });
  });
});
