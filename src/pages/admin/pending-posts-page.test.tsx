import { cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { listPendingPosts, approvePost, rejectPost } = vi.hoisted(() => ({
  listPendingPosts: vi.fn(),
  approvePost: vi.fn(),
  rejectPost: vi.fn()
}));

vi.mock("../../repositories/posts-repository", () => ({
  listPendingPosts
}));
vi.mock("../../repositories/admin-repository", () => ({
  approvePost,
  rejectPost
}));

import { renderWithProviders } from "../../test/render-with-providers";
import { AdminPendingPostsPage } from "./pending-posts-page";

const samplePost = {
  id: "post-1",
  title: "Sunny room near metro",
  createdAt: "2026-07-01T00:00:00.000Z",
  authorName: "Alice",
  categoryName: "租房"
};

describe("AdminPendingPostsPage", () => {
  afterEach(() => {
    cleanup();
  });

  beforeEach(() => {
    listPendingPosts.mockReset();
    approvePost.mockReset();
    rejectPost.mockReset();
  });

  it("shows a loading state before the query resolves", () => {
    listPendingPosts.mockReturnValue(new Promise(() => {}));

    renderWithProviders(<AdminPendingPostsPage />);

    expect(screen.getByRole("status")).toHaveTextContent("加载中");
  });

  it("shows an empty state when there are no pending posts", async () => {
    listPendingPosts.mockResolvedValue([]);

    renderWithProviders(<AdminPendingPostsPage />);

    expect(await screen.findByText("暂无待审核帖子")).toBeInTheDocument();
  });

  it("shows an error state when the query fails", async () => {
    listPendingPosts.mockRejectedValue(new Error("network down"));

    renderWithProviders(<AdminPendingPostsPage />);

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "帖子加载失败，请稍后重试。"
    );
  });

  it("renders each post's title, author, category and created date", async () => {
    listPendingPosts.mockResolvedValue([samplePost]);

    renderWithProviders(<AdminPendingPostsPage />);

    const item = await screen.findByText("Sunny room near metro");
    const row = item.closest("li");
    expect(row).toHaveTextContent("Alice");
    expect(row).toHaveTextContent("租房");
  });

  it("removes the row on a successful approve", async () => {
    listPendingPosts.mockResolvedValue([samplePost]);
    approvePost.mockResolvedValue(undefined);

    renderWithProviders(<AdminPendingPostsPage />);
    await screen.findByText("Sunny room near metro");

    fireEvent.click(screen.getByRole("button", { name: "通过" }));

    await waitFor(() => {
      expect(screen.queryByText("Sunny room near metro")).not.toBeInTheDocument();
    });
    expect(approvePost).toHaveBeenCalledWith("post-1");
  });

  it("keeps the row and shows an inline error when approve fails", async () => {
    listPendingPosts.mockResolvedValue([samplePost]);
    approvePost.mockRejectedValue(new Error("boom"));

    renderWithProviders(<AdminPendingPostsPage />);
    await screen.findByText("Sunny room near metro");

    fireEvent.click(screen.getByRole("button", { name: "通过" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "操作失败，请稍后重试。"
    );
    expect(screen.getByText("Sunny room near metro")).toBeInTheDocument();
  });

  it("shows a validation error and does not call rejectPost when submitting an empty reason", async () => {
    listPendingPosts.mockResolvedValue([samplePost]);

    renderWithProviders(<AdminPendingPostsPage />);
    await screen.findByText("Sunny room near metro");

    fireEvent.click(screen.getByRole("button", { name: "驳回" }));
    fireEvent.click(screen.getByRole("button", { name: "确认驳回" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("请填写驳回原因。");
    expect(rejectPost).not.toHaveBeenCalled();
  });

  it("calls rejectPost with the typed reason and removes the row on success", async () => {
    listPendingPosts.mockResolvedValue([samplePost]);
    rejectPost.mockResolvedValue(undefined);

    renderWithProviders(<AdminPendingPostsPage />);
    await screen.findByText("Sunny room near metro");

    fireEvent.click(screen.getByRole("button", { name: "驳回" }));
    fireEvent.change(screen.getByLabelText("驳回原因"), {
      target: { value: "内容违规" }
    });
    fireEvent.click(screen.getByRole("button", { name: "确认驳回" }));

    await waitFor(() => {
      expect(screen.queryByText("Sunny room near metro")).not.toBeInTheDocument();
    });
    expect(rejectPost).toHaveBeenCalledWith("post-1", "内容违规");
  });

  it("preserves the typed reason when rejectPost fails", async () => {
    listPendingPosts.mockResolvedValue([samplePost]);
    rejectPost.mockRejectedValue(new Error("boom"));

    renderWithProviders(<AdminPendingPostsPage />);
    await screen.findByText("Sunny room near metro");

    fireEvent.click(screen.getByRole("button", { name: "驳回" }));
    fireEvent.change(screen.getByLabelText("驳回原因"), {
      target: { value: "内容违规" }
    });
    fireEvent.click(screen.getByRole("button", { name: "确认驳回" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "操作失败，请稍后重试。"
    );
    expect(screen.getByLabelText("驳回原因")).toHaveValue("内容违规");
    expect(screen.getByText("Sunny room near metro")).toBeInTheDocument();
  });
});
