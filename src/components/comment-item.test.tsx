import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
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
    createdAt: "2026-08-04T00:00:00.000Z",
    isDeleted: false,
    children: [],
    ...overrides
  };
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

  it("shows a success confirmation after submitting a report", async () => {
    createReportMutateAsync.mockResolvedValue({ id: "report-1" });

    render(<CommentItem node={makeNode()} depth={0} currentUserId="user-1" />);

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

    fireEvent.click(screen.getByRole("button", { name: "举报" }));
    expect(screen.queryByText("确定删除这条评论吗？")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "提交举报" })).toBeInTheDocument();
  });
});
