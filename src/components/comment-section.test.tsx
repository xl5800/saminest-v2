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

    expect(screen.getByRole("heading", { name: "评论 (12)" })).toBeInTheDocument();
  });

  it("does not show the composer textarea when there is no session, and shows a 登录 link instead", () => {
    renderSection();

    expect(screen.queryByLabelText("发表评论")).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "登录" })).toHaveAttribute("href", "/login");
  });

  it("shows the composer textarea and submits a top-level comment (parentId: null) when logged in", async () => {
    useAuthStore.getState().setSession({ user: { id: "user-1" } } as never);
    createCommentMutateAsync.mockResolvedValue({ id: "new-comment", createdAt: "now" });

    renderSection();

    fireEvent.change(screen.getByLabelText("发表评论"), {
      target: { value: "这是一条新评论" }
    });
    fireEvent.click(screen.getByRole("button", { name: "发表" }));

    await waitFor(() => {
      expect(createCommentMutateAsync).toHaveBeenCalledWith({
        postId: "post-1",
        userId: "user-1",
        parentId: null,
        content: "这是一条新评论"
      });
    });
  });

  it("shows a validation error and does not call the mutation when the comment is empty", async () => {
    useAuthStore.getState().setSession({ user: { id: "user-1" } } as never);

    renderSection();

    fireEvent.click(screen.getByRole("button", { name: "发表" }));

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
