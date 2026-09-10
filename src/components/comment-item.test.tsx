import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const {
  useCreateCommentMutation,
  useDeleteCommentMutation,
  useCreateReportMutation,
  createCommentMutateAsync,
  deleteCommentMutateAsync,
  createReportMutateAsync
} = vi.hoisted(() => ({
  useCreateCommentMutation: vi.fn(),
  useDeleteCommentMutation: vi.fn(),
  useCreateReportMutation: vi.fn(),
  createCommentMutateAsync: vi.fn(),
  deleteCommentMutateAsync: vi.fn(),
  createReportMutateAsync: vi.fn()
}));

vi.mock("../features/comments/use-create-comment-mutation", () => ({
  useCreateCommentMutation
}));
vi.mock("../features/comments/use-delete-comment-mutation", () => ({
  useDeleteCommentMutation
}));
vi.mock("../features/reports/use-create-report-mutation", () => ({
  useCreateReportMutation
}));

import type { CommentNode } from "../utils/build-comment-tree";
import { AppError } from "../utils/app-error";
import { CommentItem } from "./comment-item";

function makeNode(overrides: Partial<CommentNode> = {}): CommentNode {
  return {
    id: "c1",
    postId: "post-1",
    userId: "user-2",
    parentId: null,
    content: "hello there",
    authorDisplayName: "Bob",
    authorAvatarUrl: null,
    createdAt: "2026-08-04T00:00:00.000Z",
    isDeleted: false,
    children: [],
    ...overrides
  };
}

// 33 号卡：必须跟 comment-item.tsx 里的同名常量保持一致——这里没有从源码
// 导出复用，是因为那两个常量本来就只是组件内部的实现细节，不是这个组件
// 对外暴露的公共接口，不值得为了一个测试文件专门导出。
const LONG_PRESS_MS = 500;

/**
 * 模拟一次"按住不放超过长按阈值"的鼠标手势，触发举报入口浮层——只在这一次
 * 调用期间切到假计时器，触发完立刻切回真计时器，不影响调用方后续可能会
 * 用到的 waitFor/findBy（这些依赖真实的微任务调度）。
 */
function longPressCommentContent(index = 0): void {
  const content = screen.getAllByTestId("comment-content")[index];
  vi.useFakeTimers();
  fireEvent.mouseDown(content, { button: 0, clientX: 0, clientY: 0 });
  // 定时器回调里的 setState 不是由 React 的事件处理批处理触发的，必须
  // 包一层 act() 才能让这次状态更新在断言之前同步刷新到 DOM——照抄
  // use-debounced-value.test.ts 已经踩过的同一个坑。
  act(() => {
    vi.advanceTimersByTime(LONG_PRESS_MS);
  });
  vi.useRealTimers();
}

describe("CommentItem", () => {
  afterEach(() => {
    cleanup();
  });

  beforeEach(() => {
    createCommentMutateAsync.mockReset();
    deleteCommentMutateAsync.mockReset();
    createReportMutateAsync.mockReset();
    useCreateCommentMutation.mockReset();
    useDeleteCommentMutation.mockReset();
    useCreateReportMutation.mockReset();
    useCreateCommentMutation.mockReturnValue({
      mutateAsync: createCommentMutateAsync,
      isPending: false
    });
    useDeleteCommentMutation.mockReturnValue({
      mutateAsync: deleteCommentMutateAsync,
      isPending: false
    });
    useCreateReportMutation.mockReturnValue({
      mutateAsync: createReportMutateAsync,
      isPending: false
    });
  });

  it("shows author, content and no action buttons for a logged-out viewer", () => {
    render(<CommentItem node={makeNode()} depth={0} currentUserId={null} />);

    expect(screen.getByText("Bob")).toBeInTheDocument();
    expect(screen.getByText("hello there")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "回复" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "删除" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "举报" })).not.toBeInTheDocument();
  });

  it("shows 删除 only when the viewer is the comment's own author", () => {
    const { rerender } = render(
      <CommentItem node={makeNode({ userId: "user-1" })} depth={0} currentUserId="user-1" />
    );
    expect(screen.getByRole("button", { name: "删除" })).toBeInTheDocument();

    rerender(<CommentItem node={makeNode({ userId: "user-2" })} depth={0} currentUserId="user-1" />);
    expect(screen.queryByRole("button", { name: "删除" })).not.toBeInTheDocument();
  });

  it("submits a reply with parentId set to the comment being replied to", async () => {
    createCommentMutateAsync.mockResolvedValue({ id: "reply-1", createdAt: "now" });
    const node = makeNode({ id: "c1", postId: "post-1" });

    render(<CommentItem node={node} depth={0} currentUserId="user-1" />);

    fireEvent.click(screen.getByRole("button", { name: "回复" }));
    fireEvent.change(screen.getByLabelText(/回复 Bob/), {
      target: { value: "这是一条回复" }
    });
    fireEvent.click(screen.getByRole("button", { name: "发送" }));

    await waitFor(() => {
      expect(createCommentMutateAsync).toHaveBeenCalledWith({
        postId: "post-1",
        userId: "user-1",
        parentId: "c1",
        content: "这是一条回复"
      });
    });
  });

  it("shows a validation error and does not submit when the reply is empty", async () => {
    render(<CommentItem node={makeNode()} depth={0} currentUserId="user-1" />);

    fireEvent.click(screen.getByRole("button", { name: "回复" }));
    fireEvent.click(screen.getByRole("button", { name: "发送" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("请输入评论内容。");
    expect(createCommentMutateAsync).not.toHaveBeenCalled();
  });

  it("runs the two-step delete confirmation flow: click 删除 shows a confirm prompt, then 确认删除 calls the mutation", async () => {
    deleteCommentMutateAsync.mockResolvedValue(undefined);
    const node = makeNode({ id: "c1", postId: "post-1", userId: "user-1" });

    render(<CommentItem node={node} depth={0} currentUserId="user-1" />);

    fireEvent.click(screen.getByRole("button", { name: "删除" }));
    expect(screen.getByText("确定删除这条评论吗？")).toBeInTheDocument();
    expect(deleteCommentMutateAsync).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "确认删除" }));

    await waitFor(() => {
      expect(deleteCommentMutateAsync).toHaveBeenCalledWith({
        commentId: "c1",
        userId: "user-1",
        postId: "post-1"
      });
    });
  });

  it("cancels the delete confirmation without calling the mutation", () => {
    render(
      <CommentItem
        node={makeNode({ userId: "user-1" })}
        depth={0}
        currentUserId="user-1"
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "删除" }));
    fireEvent.click(screen.getByRole("button", { name: "取消" }));

    expect(screen.queryByText("确定删除这条评论吗？")).not.toBeInTheDocument();
    expect(deleteCommentMutateAsync).not.toHaveBeenCalled();
  });

  it("shows a success confirmation after submitting a report (opened via a long-press on the comment content)", async () => {
    createReportMutateAsync.mockResolvedValue({ id: "report-1" });

    render(<CommentItem node={makeNode()} depth={0} currentUserId="user-1" />);

    longPressCommentContent();
    fireEvent.click(screen.getByRole("button", { name: "举报" }));
    fireEvent.click(screen.getByLabelText("诈骗"));
    fireEvent.click(screen.getByRole("button", { name: "提交举报" }));

    expect(await screen.findByText("举报已提交")).toBeInTheDocument();
    expect(createReportMutateAsync).toHaveBeenCalledWith({
      reporterId: "user-1",
      targetType: "comment",
      targetId: "c1",
      reasonCode: "scam",
      description: null
    });
  });

  it("shows the REPORT_DUPLICATE message verbatim when the report mutation rejects with it", async () => {
    createReportMutateAsync.mockRejectedValue(
      new AppError("您已经举报过这条内容，正在处理中，请勿重复提交。", "REPORT_DUPLICATE")
    );

    render(<CommentItem node={makeNode()} depth={0} currentUserId="user-1" />);

    longPressCommentContent();
    fireEvent.click(screen.getByRole("button", { name: "举报" }));
    fireEvent.click(screen.getByLabelText("诈骗"));
    fireEvent.click(screen.getByRole("button", { name: "提交举报" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "您已经举报过这条内容，正在处理中，请勿重复提交。"
    );
  });

  it("shows a generic error message for an unrecognized report failure", async () => {
    createReportMutateAsync.mockRejectedValue(new Error("network down"));

    render(<CommentItem node={makeNode()} depth={0} currentUserId="user-1" />);

    longPressCommentContent();
    fireEvent.click(screen.getByRole("button", { name: "举报" }));
    fireEvent.click(screen.getByLabelText("诈骗"));
    fireEvent.click(screen.getByRole("button", { name: "提交举报" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "举报提交失败，请稍后重试。"
    );
  });

  it("shows a minimal placeholder (no author/time/action buttons) for a deleted comment that still has replies, and still renders those replies", () => {
    const node = makeNode({
      isDeleted: true,
      content: "should not be shown",
      authorDisplayName: "should not be shown either",
      children: [makeNode({ id: "reply-1", content: "a visible reply", authorDisplayName: "Carol" })]
    });

    render(<CommentItem node={node} depth={0} currentUserId="user-1" />);

    const placeholder = screen.getByText("该评论已删除");
    expect(placeholder).toBeInTheDocument();
    expect(screen.queryByText("should not be shown")).not.toBeInTheDocument();
    expect(screen.queryByText("should not be shown either")).not.toBeInTheDocument();
    // 极简占位不再显示昵称/时间那一行，也不显示回复/删除/举报这三个操作
    // 按钮——不能直接对整个 render 结果查"回复"按钮不存在，因为下面那条
    // 可见的 Carol 回复本身没被删除，合法地有自己的"回复"按钮；这里只
    // 断言占位这一行自己的容器（它的直接父节点，只包了这一个 <p>）内部
    // 没有任何 button。
    expect(placeholder.parentElement?.querySelector("button")).toBeNull();
    expect(screen.getByText("a visible reply")).toBeInTheDocument();
    expect(screen.getByText("Carol")).toBeInTheDocument();
  });

  it("does not render a deleted comment that has no replies at all", () => {
    const node = makeNode({
      isDeleted: true,
      content: "should not be shown",
      authorDisplayName: "should not be shown either",
      children: []
    });

    const { container } = render(<CommentItem node={node} depth={0} currentUserId="user-1" />);

    expect(screen.queryByText("should not be shown")).not.toBeInTheDocument();
    expect(screen.queryByText("should not be shown either")).not.toBeInTheDocument();
    expect(screen.queryByText("该评论已删除")).not.toBeInTheDocument();
    expect(container.textContent).toBe("");
  });

  it("keeps the three inline actions mutually exclusive — opening one closes the other", () => {
    render(
      <CommentItem
        node={makeNode({ userId: "user-1" })}
        depth={0}
        currentUserId="user-1"
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "回复" }));
    expect(screen.getByRole("button", { name: "发送" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "删除" }));
    expect(screen.queryByRole("button", { name: "发送" })).not.toBeInTheDocument();
    expect(screen.getByText("确定删除这条评论吗？")).toBeInTheDocument();

    longPressCommentContent();
    fireEvent.click(screen.getByRole("button", { name: "举报" }));
    expect(screen.queryByText("确定删除这条评论吗？")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "提交举报" })).toBeInTheDocument();
  });

  // 33 号卡（留言区头像展示 + 长按弹出举报，仿小红书）：头像展示部分。
  describe("头像展示", () => {
    it("renders an <img> with the author's avatar when authorAvatarUrl is present", () => {
      const { container } = render(
        <CommentItem
          node={makeNode({ authorAvatarUrl: "https://img.example.com/bob.jpg" })}
          depth={0}
          currentUserId="user-1"
        />
      );

      // alt="" 是装饰性图片，不带 img role（跟昵称重复念一遍没有必要，见
      // 下面的注释），用 querySelector 而不是 getByRole("img") 找——跟
      // post-list.test.tsx 里断言 variant="wanted" 头像的方式一致。
      const avatar = container.querySelector("img");
      expect(avatar).toHaveAttribute("src", "https://img.example.com/bob.jpg");
      // 装饰性头像，不承载额外的可访问性文本——昵称已经在旁边用可见文字
      // 展示了一遍，重复用 alt 念一次没有必要，跟 person-card.tsx/
      // post-list.tsx 的头像 alt="" 是同一个约定。
      expect(avatar).toHaveAttribute("alt", "");
    });

    it("renders an initial-letter fallback circle (no <img>) when authorAvatarUrl is null", () => {
      const { container } = render(
        <CommentItem
          node={makeNode({ authorDisplayName: "Bob", authorAvatarUrl: null })}
          depth={0}
          currentUserId="user-1"
        />
      );

      expect(container.querySelector("img")).not.toBeInTheDocument();
      const fallback = screen.getByText("B");
      expect(fallback).toHaveClass("bg-primary/10", "text-primary");
    });

    it("uses a smaller avatar for a reply (depth > 0) than for a top-level comment (depth 0)", () => {
      const { rerender, container } = render(
        <CommentItem node={makeNode({ authorAvatarUrl: null })} depth={0} currentUserId="user-1" />
      );
      expect(container.querySelector(".h-8.w-8")).toBeInTheDocument();
      expect(container.querySelector(".h-6.w-6")).not.toBeInTheDocument();

      rerender(
        <CommentItem node={makeNode({ authorAvatarUrl: null })} depth={1} currentUserId="user-1" />
      );
      expect(container.querySelector(".h-6.w-6")).toBeInTheDocument();
      expect(container.querySelector(".h-8.w-8")).not.toBeInTheDocument();
    });
  });

  // 33 号卡：长按弹出举报入口。
  describe("长按弹出举报入口", () => {
    it("does not render a persistent 举报 button in the actions row", () => {
      render(
        <CommentItem node={makeNode({ userId: "user-1" })} depth={0} currentUserId="user-1" />
      );

      expect(screen.queryByRole("button", { name: "举报" })).not.toBeInTheDocument();
    });

    it("opens a report-entry prompt after a mouse long-press on the comment content, and opens the report form from it", () => {
      render(<CommentItem node={makeNode()} depth={0} currentUserId="user-1" />);

      expect(screen.queryByRole("dialog", { name: "留言操作" })).not.toBeInTheDocument();

      longPressCommentContent();

      expect(screen.getByRole("dialog", { name: "留言操作" })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "举报" })).toBeInTheDocument();

      fireEvent.click(screen.getByRole("button", { name: "举报" }));

      expect(screen.queryByRole("dialog", { name: "留言操作" })).not.toBeInTheDocument();
      expect(screen.getByText("举报原因")).toBeInTheDocument();
    });

    it("also triggers via a touch long-press (mobile)", () => {
      render(<CommentItem node={makeNode()} depth={0} currentUserId="user-1" />);
      const content = screen.getByTestId("comment-content");

      vi.useFakeTimers();
      fireEvent.touchStart(content, { touches: [{ clientX: 0, clientY: 0 }] });
      act(() => {
        vi.advanceTimersByTime(LONG_PRESS_MS);
      });
      vi.useRealTimers();

      expect(screen.getByRole("dialog", { name: "留言操作" })).toBeInTheDocument();
    });

    it("does not open the prompt if the mouse is released before the long-press duration elapses", () => {
      render(<CommentItem node={makeNode()} depth={0} currentUserId="user-1" />);
      const content = screen.getByTestId("comment-content");

      vi.useFakeTimers();
      fireEvent.mouseDown(content, { button: 0, clientX: 0, clientY: 0 });
      act(() => {
        vi.advanceTimersByTime(LONG_PRESS_MS - 100);
      });
      fireEvent.mouseUp(window);
      act(() => {
        vi.advanceTimersByTime(100);
      });
      vi.useRealTimers();

      expect(screen.queryByRole("dialog", { name: "留言操作" })).not.toBeInTheDocument();
    });

    it("does not open the prompt if the pointer moves too far before the long-press duration elapses (treated as a scroll, not a long-press)", () => {
      render(<CommentItem node={makeNode()} depth={0} currentUserId="user-1" />);
      const content = screen.getByTestId("comment-content");

      vi.useFakeTimers();
      fireEvent.mouseDown(content, { button: 0, clientX: 0, clientY: 0 });
      fireEvent.mouseMove(window, { clientX: 50, clientY: 0 });
      act(() => {
        vi.advanceTimersByTime(LONG_PRESS_MS);
      });
      vi.useRealTimers();

      expect(screen.queryByRole("dialog", { name: "留言操作" })).not.toBeInTheDocument();
    });

    it("does not open the prompt for a logged-out viewer", () => {
      render(<CommentItem node={makeNode()} depth={0} currentUserId={null} />);
      const content = screen.getByTestId("comment-content");

      vi.useFakeTimers();
      fireEvent.mouseDown(content, { button: 0, clientX: 0, clientY: 0 });
      act(() => {
        vi.advanceTimersByTime(LONG_PRESS_MS);
      });
      vi.useRealTimers();

      expect(screen.queryByRole("dialog", { name: "留言操作" })).not.toBeInTheDocument();
    });

    it("dismisses the prompt without opening the report form when the backdrop is clicked", () => {
      render(<CommentItem node={makeNode()} depth={0} currentUserId="user-1" />);

      longPressCommentContent();
      fireEvent.click(screen.getByRole("dialog", { name: "留言操作" }));

      expect(screen.queryByRole("dialog", { name: "留言操作" })).not.toBeInTheDocument();
      expect(screen.queryByText("举报原因")).not.toBeInTheDocument();
    });

    it("dismisses the prompt without opening the report form when 取消 is clicked", () => {
      render(<CommentItem node={makeNode()} depth={0} currentUserId="user-1" />);

      longPressCommentContent();
      fireEvent.click(screen.getByRole("button", { name: "取消" }));

      expect(screen.queryByRole("dialog", { name: "留言操作" })).not.toBeInTheDocument();
      expect(screen.queryByText("举报原因")).not.toBeInTheDocument();
    });
  });
});
