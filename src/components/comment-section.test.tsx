import { cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const {
  usePostDetailQuery,
  usePostCommentsQuery,
  useCreateCommentMutation,
  useDeleteCommentMutation,
  useCreateReportMutation,
  createCommentMutateAsync
} = vi.hoisted(() => ({
  usePostDetailQuery: vi.fn(),
  usePostCommentsQuery: vi.fn(),
  useCreateCommentMutation: vi.fn(),
  useDeleteCommentMutation: vi.fn(),
  useCreateReportMutation: vi.fn(),
  createCommentMutateAsync: vi.fn()
}));

vi.mock("../features/posts/use-post-detail-query", () => ({ usePostDetailQuery }));
vi.mock("../features/comments/use-post-comments-query", () => ({ usePostCommentsQuery }));
vi.mock("../features/comments/use-create-comment-mutation", () => ({
  useCreateCommentMutation
}));
vi.mock("../features/comments/use-delete-comment-mutation", () => ({
  useDeleteCommentMutation
}));
vi.mock("../features/reports/use-create-report-mutation", () => ({
  useCreateReportMutation
}));

import { useAuthStore } from "../store/auth-store";
import { renderWithProviders } from "../test/render-with-providers";
import { CommentSection } from "./comment-section";

const initialAuthState = useAuthStore.getState();

const rootComment = {
  id: "c1",
  postId: "post-1",
  userId: "user-2",
  parentId: null,
  content: "第一条评论",
  authorDisplayName: "Bob",
  createdAt: "2026-08-04T00:00:00.000Z",
  isDeleted: false
};

function renderSection() {
  return renderWithProviders(<CommentSection postId="post-1" />);
}

describe("CommentSection", () => {
  afterEach(() => {
    cleanup();
  });

  beforeEach(() => {
    useAuthStore.setState(initialAuthState, true);
    usePostDetailQuery.mockReset();
    usePostCommentsQuery.mockReset();
    useCreateCommentMutation.mockReset();
    useDeleteCommentMutation.mockReset();
    useCreateReportMutation.mockReset();
    createCommentMutateAsync.mockReset();

    usePostDetailQuery.mockReturnValue({ data: { commentCount: 0 } });
    usePostCommentsQuery.mockReturnValue({ data: [], isPending: false, isError: false });
    useCreateCommentMutation.mockReturnValue({
      mutateAsync: createCommentMutateAsync,
      isPending: false
    });
    useDeleteCommentMutation.mockReturnValue({ mutateAsync: vi.fn(), isPending: false });
    useCreateReportMutation.mockReturnValue({ mutateAsync: vi.fn(), isPending: false });
  });

  it("shows the comment count from usePostDetailQuery, not comments.length", () => {
    usePostDetailQuery.mockReturnValue({ data: { commentCount: 12 } });
    usePostCommentsQuery.mockReturnValue({
      data: [rootComment],
      isPending: false,
      isError: false
    });

    renderSection();

    // 23 号卡：标题从"评论"改成"留言"。
    expect(screen.getByRole("heading", { name: "留言 (12)" })).toBeInTheDocument();
  });

  it("does not show the composer textarea when there is no session, and shows a 登录 link instead", () => {
    renderSection();

    expect(screen.queryByPlaceholderText("写下你的评论…")).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "登录" })).toHaveAttribute("href", "/login");
  });

  // 输入框改版成圆角胶囊单行输入条之后不再有单独的"发表评论"文字标签，
  // 靠 placeholder 定位输入框；发送按钮也从文字按钮变成图标按钮，
  // 可访问名称改用 aria-label="发表评论"（未提交时）/"发送中…"（提交中）。
  it("shows the composer textarea and submits a top-level comment (parentId: null) when logged in", async () => {
    useAuthStore.getState().setSession({ user: { id: "user-1" } } as never);
    createCommentMutateAsync.mockResolvedValue({ id: "new-comment", createdAt: "now" });

    renderSection();

    fireEvent.change(screen.getByPlaceholderText("写下你的评论…"), {
      target: { value: "这是一条新评论" }
    });
    fireEvent.click(screen.getByRole("button", { name: "发表评论" }));

    await waitFor(() => {
      expect(createCommentMutateAsync).toHaveBeenCalledWith({
        postId: "post-1",
        userId: "user-1",
        parentId: null,
        content: "这是一条新评论"
      });
    });
  });

  // jsdom 不做真实布局，scrollHeight 在这里恒为 0，用 defineProperty
  // 手动模拟出"输入变长导致 scrollHeight 变大"这件事，验证的是
  // handleContentChange 自己的算法（style.height 是否跟着 scrollHeight
  // 走），而不是浏览器真实的撑高像素——真实撑高效果只能在浏览器里肉眼
  // 确认。max-h-32/overflow-y-auto 这两个 class 断言的是"CSS 封顶 +
  // 内部滚动"这条规则确实挂在元素上，同样不是断言真实渲染出的像素高度。
  it("grows the textarea's inline height to match scrollHeight as content changes, and keeps the max-h-32/overflow-y-auto cap classes for once content exceeds it", () => {
    useAuthStore.getState().setSession({ user: { id: "user-1" } } as never);

    renderSection();

    const textarea = screen.getByPlaceholderText("写下你的评论…") as HTMLTextAreaElement;
    expect(textarea).toHaveClass("max-h-32", "overflow-y-auto");

    Object.defineProperty(textarea, "scrollHeight", { value: 40, configurable: true });
    fireEvent.change(textarea, { target: { value: "一行短评论" } });
    expect(textarea.style.height).toBe("40px");

    Object.defineProperty(textarea, "scrollHeight", { value: 260, configurable: true });
    fireEvent.change(textarea, {
      target: {
        value:
          "这是一段很长很长很长很长很长很长很长很长很长很长很长很长很长很长很长的评论，用来测试输入框是否会随着内容变长而撑高。"
      }
    });
    expect(textarea.style.height).toBe("260px");
  });

  it("resets the textarea's inline height back to auto after a successful submit", async () => {
    useAuthStore.getState().setSession({ user: { id: "user-1" } } as never);
    createCommentMutateAsync.mockResolvedValue({ id: "new-comment", createdAt: "now" });

    renderSection();

    const textarea = screen.getByPlaceholderText("写下你的评论…") as HTMLTextAreaElement;
    Object.defineProperty(textarea, "scrollHeight", { value: 200, configurable: true });
    fireEvent.change(textarea, { target: { value: "一条会被撑高再提交的评论" } });
    expect(textarea.style.height).toBe("200px");

    fireEvent.click(screen.getByRole("button", { name: "发表评论" }));

    await waitFor(() => {
      expect(createCommentMutateAsync).toHaveBeenCalled();
    });
    expect(textarea.style.height).toBe("auto");
  });

  it("shows a validation error and does not call the mutation when the comment is empty", async () => {
    useAuthStore.getState().setSession({ user: { id: "user-1" } } as never);

    renderSection();

    fireEvent.click(screen.getByRole("button", { name: "发表评论" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("请输入评论内容。");
    expect(createCommentMutateAsync).not.toHaveBeenCalled();
  });

  it("shows a loading status while comments are being fetched", () => {
    usePostCommentsQuery.mockReturnValue({ data: undefined, isPending: true, isError: false });

    renderSection();

    expect(screen.getByRole("status")).toHaveTextContent("加载中…");
  });

  it("shows an error message when comments fail to load", () => {
    usePostCommentsQuery.mockReturnValue({ data: undefined, isPending: false, isError: true });

    renderSection();

    expect(screen.getByRole("alert")).toHaveTextContent("评论加载失败，请稍后重试。");
  });

  it("shows an empty-state message when there are no comments", () => {
    renderSection();

    expect(screen.getByText("暂无评论，来发表第一条评论吧。")).toBeInTheDocument();
  });

  it("builds and renders the comment tree from the flat list returned by usePostCommentsQuery", () => {
    usePostCommentsQuery.mockReturnValue({
      data: [rootComment],
      isPending: false,
      isError: false
    });

    renderSection();

    expect(screen.getByText("第一条评论")).toBeInTheDocument();
    expect(screen.getByText("Bob")).toBeInTheDocument();
  });
});
