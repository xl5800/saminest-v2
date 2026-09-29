import { cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { listPendingPosts, approvePost, rejectPost } = vi.hoisted(() => ({
  listPendingPosts: vi.fn(),
  approvePost: vi.fn(),
  rejectPost: vi.fn()
}));

vi.mock("../../repositories/posts-repository", () => ({
  listPendingPosts,
  // AdminNav（这个页面顶部渲染的管理后台导航条）功能改动清单第 7 项新增了
  // "待审核"角标，会调用 countPendingPosts——这个页面自己的测试跟角标数字
  // 无关，这里只给一个不为 0 的默认值，不然会一直不渲染而失去测试意义。
  countPendingPosts: () => Promise.resolve(0)
}));
vi.mock("../../repositories/admin-repository", () => ({
  approvePost,
  rejectPost
}));
// 同上，AdminNav 也会为"举报处理"角标调用 countPendingReports；这个页面
// 本身不依赖举报数据，这里只提供最小 mock 避免真的打到 Supabase。
vi.mock("../../repositories/reports-repository", () => ({
  countPendingReports: () => Promise.resolve(0)
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
