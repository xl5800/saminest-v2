import { cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { listAllPosts, deletePost } = vi.hoisted(() => ({
  listAllPosts: vi.fn(),
  deletePost: vi.fn()
}));

vi.mock("../../repositories/posts-repository", () => ({
  listAllPosts
}));
vi.mock("../../repositories/admin-repository", () => ({
  deletePost
}));

import { renderWithProviders } from "../../test/render-with-providers";
import { AdminAllPostsPage } from "./all-posts-page";

const samplePost = {
  id: "post-1",
  title: "Sunny room near metro",
  createdAt: "2026-07-01T00:00:00.000Z",
  authorName: "Alice",
  categoryName: "租房",
  status: "approved"
};

describe("AdminAllPostsPage", () => {
  afterEach(() => {
    cleanup();
  });

  beforeEach(() => {
    listAllPosts.mockReset();
    deletePost.mockReset();
  });

  it("shows a loading state before the query resolves", () => {
    listAllPosts.mockReturnValue(new Promise(() => {}));

    renderWithProviders(<AdminAllPostsPage />);

    expect(screen.getByRole("status")).toHaveTextContent("加载中");
  });

  it("shows an empty state when there are no posts", async () => {
    listAllPosts.mockResolvedValue([]);

    renderWithProviders(<AdminAllPostsPage />);

    expect(await screen.findByText("暂无帖子")).toBeInTheDocument();
  });

  it("shows an error state when the query fails", async () => {
    listAllPosts.mockRejectedValue(new Error("network down"));

    renderWithProviders(<AdminAllPostsPage />);

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "帖子加载失败，请稍后重试。"
    );
  });

  it("renders each post's title, author, category, status label, and created date", async () => {
    listAllPosts.mockResolvedValue([samplePost]);

    renderWithProviders(<AdminAllPostsPage />);

    const item = await screen.findByText("Sunny room near metro");
    const row = item.closest("li");
    expect(row).toHaveTextContent("Alice");
    expect(row).toHaveTextContent("租房");
    expect(row).toHaveTextContent("已通过");
  });

  it("defaults the status filter to all (no filter) and requests without a status", async () => {
    listAllPosts.mockResolvedValue([]);

    renderWithProviders(<AdminAllPostsPage />);

    await waitFor(() => {
      expect(listAllPosts).toHaveBeenCalledWith(undefined);
    });
    expect(screen.getByLabelText("状态")).toHaveValue("");
  });

  it("re-queries with the new status when the filter changes", async () => {
    listAllPosts.mockResolvedValue([]);

    renderWithProviders(<AdminAllPostsPage />);
    await waitFor(() => {
      expect(listAllPosts).toHaveBeenCalledWith(undefined);
    });

    fireEvent.change(screen.getByLabelText("状态"), { target: { value: "pending" } });

    await waitFor(() => {
      expect(listAllPosts).toHaveBeenCalledWith("pending");
    });
  });

  it("shows a validation error and does not call deletePost when confirming with an empty reason", async () => {
    listAllPosts.mockResolvedValue([samplePost]);

    renderWithProviders(<AdminAllPostsPage />);
    await screen.findByText("Sunny room near metro");

    fireEvent.click(screen.getByRole("button", { name: "删除" }));
    fireEvent.click(screen.getByRole("button", { name: "确认删除" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("请填写删除原因。");
    expect(deletePost).not.toHaveBeenCalled();
  });

  it("calls deletePost with the typed reason and removes the row on success", async () => {
    listAllPosts.mockResolvedValue([samplePost]);
    deletePost.mockResolvedValue(undefined);

    renderWithProviders(<AdminAllPostsPage />);
    await screen.findByText("Sunny room near metro");

    fireEvent.click(screen.getByRole("button", { name: "删除" }));
    fireEvent.change(screen.getByLabelText("删除原因"), {
      target: { value: "违反平台规则" }
    });
    fireEvent.click(screen.getByRole("button", { name: "确认删除" }));

    await waitFor(() => {
      expect(screen.queryByText("Sunny room near metro")).not.toBeInTheDocument();
    });
    expect(deletePost).toHaveBeenCalledWith("post-1", "违反平台规则");
  });

  it("preserves the typed reason and shows a row error when deletePost fails", async () => {
    listAllPosts.mockResolvedValue([samplePost]);
    deletePost.mockRejectedValue(new Error("boom"));

    renderWithProviders(<AdminAllPostsPage />);
    await screen.findByText("Sunny room near metro");

    fireEvent.click(screen.getByRole("button", { name: "删除" }));
    fireEvent.change(screen.getByLabelText("删除原因"), {
      target: { value: "违反平台规则" }
    });
    fireEvent.click(screen.getByRole("button", { name: "确认删除" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "操作失败，请稍后重试。"
    );
    expect(screen.getByLabelText("删除原因")).toHaveValue("违反平台规则");
    expect(screen.getByText("Sunny room near metro")).toBeInTheDocument();
  });
});
