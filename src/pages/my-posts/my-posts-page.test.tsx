import { cleanup, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { listMyPosts, archivePost, resubmitPost, deleteMyPost } = vi.hoisted(() => ({
  listMyPosts: vi.fn(),
  archivePost: vi.fn(),
  resubmitPost: vi.fn(),
  deleteMyPost: vi.fn()
}));

vi.mock("../../repositories/posts-repository", () => ({
  listMyPosts,
  archivePost,
  resubmitPost,
  deleteMyPost
}));

import { useAuthStore } from "../../store/auth-store";
import { renderWithProviders } from "../../test/render-with-providers";
import { MyPostsPage } from "./my-posts-page";

const initialAuthState = useAuthStore.getState();

const samplePost = {
  id: "post-1",
  title: "Sunny room near metro",
  categoryName: "租房",
  locationName: "Rockville",
  coverImageUrl: "https://img.example.com/1.jpg",
  status: "approved",
  createdAt: "2026-07-01T00:00:00.000Z",
  rejectionReason: null
};

describe("MyPostsPage", () => {
  afterEach(() => {
    cleanup();
  });

  beforeEach(() => {
    useAuthStore.setState(initialAuthState, true);
    useAuthStore.getState().setSession({
      user: { id: "user-1", email: "alice@example.com" }
    } as never);
    listMyPosts.mockReset();
    archivePost.mockReset();
    resubmitPost.mockReset();
    deleteMyPost.mockReset();
  });

  it("shows a loading state before the query resolves", () => {
    listMyPosts.mockReturnValue(new Promise(() => {}));

    renderWithProviders(<MyPostsPage />);

    expect(screen.getByRole("status")).toHaveTextContent("加载中");
  });

  it("shows an empty state when there are no posts", async () => {
    listMyPosts.mockResolvedValue([]);

    renderWithProviders(<MyPostsPage />);

    expect(await screen.findByText("暂无发布，去发一条吧。")).toBeInTheDocument();
  });

  it("shows an error state when the query fails", async () => {
    listMyPosts.mockRejectedValue(new Error("network down"));

    renderWithProviders(<MyPostsPage />);

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "发布列表加载失败，请稍后重试。"
    );
  });

  it("queries with the current user's id", async () => {
    listMyPosts.mockResolvedValue([]);

    renderWithProviders(<MyPostsPage />);

    await screen.findByText("暂无发布，去发一条吧。");
    expect(listMyPosts).toHaveBeenCalledWith("user-1");
  });

  it("renders a post's title, category, location, created date, cover image, and status label", async () => {
    listMyPosts.mockResolvedValue([samplePost]);

    renderWithProviders(<MyPostsPage />);

    const title = await screen.findByText("Sunny room near metro");
    const card = title.closest("li");
    expect(card).toHaveTextContent("租房");
    expect(card).toHaveTextContent("Rockville");
    expect(card).toHaveTextContent("已发布");
    expect(screen.getByAltText("Sunny room near metro")).toHaveAttribute(
      "src",
      "https://img.example.com/1.jpg"
    );
  });

  it("shows a placeholder when a post has no cover image", async () => {
    listMyPosts.mockResolvedValue([{ ...samplePost, coverImageUrl: null }]);

    renderWithProviders(<MyPostsPage />);

    expect(await screen.findByTestId("my-post-thumbnail-placeholder")).toBeInTheDocument();
  });

  it("falls back to '地区未填写' when locationName is null", async () => {
    listMyPosts.mockResolvedValue([{ ...samplePost, locationName: null }]);

    renderWithProviders(<MyPostsPage />);

    const title = await screen.findByText("Sunny room near metro");
    expect(title.closest("li")).toHaveTextContent("地区未填写");
  });

  it("shows '审核中' for a pending post and does not show the rejected note", async () => {
    listMyPosts.mockResolvedValue([{ ...samplePost, status: "pending" }]);

    renderWithProviders(<MyPostsPage />);

    const title = await screen.findByText("Sunny room near metro");
    expect(title.closest("li")).toHaveTextContent("审核中");
    expect(screen.queryByText("审核未通过")).not.toBeInTheDocument();
  });

  it("shows the '审核未通过' note for a rejected post without revealing a specific reason", async () => {
    listMyPosts.mockResolvedValue([
      { ...samplePost, status: "rejected", rejectionReason: "标题涉嫌虚假宣传。" }
    ]);

    renderWithProviders(<MyPostsPage />);

    const title = await screen.findByText("Sunny room near metro");
    expect(title.closest("li")).toHaveTextContent("审核未通过");
    expect(screen.queryByText("标题涉嫌虚假宣传。")).not.toBeInTheDocument();
  });

  it("shows '草稿' and '已下架' labels for draft and archived posts", async () => {
    listMyPosts.mockResolvedValue([
      { ...samplePost, id: "post-draft", title: "Draft post", status: "draft" },
      { ...samplePost, id: "post-archived", title: "Archived post", status: "archived" }
    ]);

    renderWithProviders(<MyPostsPage />);

    await screen.findByText("Draft post");
    expect(screen.getByText("草稿")).toBeInTheDocument();
    expect(screen.getByText("已下架")).toBeInTheDocument();
  });

  it("shows only '编辑' (no '查看') for a draft post, and links '编辑' to /publish/:id", async () => {
    listMyPosts.mockResolvedValue([{ ...samplePost, status: "draft" }]);

    renderWithProviders(<MyPostsPage />);

    const title = await screen.findByText("Sunny room near metro");
    const card = title.closest("li") as HTMLElement;
    expect(within(card).queryByRole("link", { name: "查看" })).not.toBeInTheDocument();
    expect(within(card).getByRole("link", { name: "编辑" })).toHaveAttribute(
      "href",
      "/publish/post-1"
    );
  });

  it("shows '查看' linking to /post/:id for a non-draft post", async () => {
    listMyPosts.mockResolvedValue([samplePost]);

    renderWithProviders(<MyPostsPage />);

    const title = await screen.findByText("Sunny room near metro");
    const card = title.closest("li") as HTMLElement;
    expect(within(card).getByRole("link", { name: "查看" })).toHaveAttribute(
      "href",
      "/post/post-1"
    );
  });

  it("only shows the '更多' button when the status has secondary actions, and reveals them on click", async () => {
    listMyPosts.mockResolvedValue([samplePost]);

    renderWithProviders(<MyPostsPage />);

    const title = await screen.findByText("Sunny room near metro");
    const card = title.closest("li") as HTMLElement;

    expect(within(card).queryByRole("button", { name: "下架" })).not.toBeInTheDocument();
    fireEvent.click(within(card).getByRole("button", { name: "更多" }));
    expect(within(card).getByRole("button", { name: "下架" })).toBeInTheDocument();
    expect(within(card).getByRole("button", { name: "删除" })).toBeInTheDocument();
    expect(within(card).queryByRole("button", { name: "重新提交审核" })).not.toBeInTheDocument();
  });

  it("shows '重新提交审核' instead of '下架' for a rejected/archived post", async () => {
    listMyPosts.mockResolvedValue([{ ...samplePost, status: "archived" }]);

    renderWithProviders(<MyPostsPage />);

    const title = await screen.findByText("Sunny room near metro");
    const card = title.closest("li") as HTMLElement;
    fireEvent.click(within(card).getByRole("button", { name: "更多" }));

    expect(within(card).getByRole("button", { name: "重新提交审核" })).toBeInTheDocument();
    expect(within(card).queryByRole("button", { name: "下架" })).not.toBeInTheDocument();
  });

  it("archives a post: calls archivePost, updates the badge to '已下架', and closes the menu", async () => {
    listMyPosts.mockResolvedValue([samplePost]);
    archivePost.mockResolvedValue(undefined);

    renderWithProviders(<MyPostsPage />);

    const title = await screen.findByText("Sunny room near metro");
    const card = title.closest("li") as HTMLElement;
    fireEvent.click(within(card).getByRole("button", { name: "更多" }));
    fireEvent.click(within(card).getByRole("button", { name: "下架" }));

    await waitFor(() => {
      expect(archivePost).toHaveBeenCalledWith("post-1");
    });
    await waitFor(() => {
      expect(within(card).getByText("已下架")).toBeInTheDocument();
    });
    expect(within(card).queryByRole("button", { name: "下架" })).not.toBeInTheDocument();
  });

  it("resubmits a rejected post: calls resubmitPost, updates the badge to '审核中', and clears the rejected note", async () => {
    listMyPosts.mockResolvedValue([
      { ...samplePost, status: "rejected", rejectionReason: "标题涉嫌虚假宣传。" }
    ]);
    resubmitPost.mockResolvedValue(undefined);

    renderWithProviders(<MyPostsPage />);

    const title = await screen.findByText("Sunny room near metro");
    const card = title.closest("li") as HTMLElement;
    fireEvent.click(within(card).getByRole("button", { name: "更多" }));
    fireEvent.click(within(card).getByRole("button", { name: "重新提交审核" }));

    await waitFor(() => {
      expect(resubmitPost).toHaveBeenCalledWith("post-1");
    });
    await waitFor(() => {
      expect(within(card).getByText("审核中")).toBeInTheDocument();
    });
    expect(within(card).queryByText("审核未通过")).not.toBeInTheDocument();
  });

  it("shows a row error and keeps the post when archivePost fails", async () => {
    listMyPosts.mockResolvedValue([samplePost]);
    archivePost.mockRejectedValue(new Error("boom"));

    renderWithProviders(<MyPostsPage />);

    const title = await screen.findByText("Sunny room near metro");
    const card = title.closest("li") as HTMLElement;
    fireEvent.click(within(card).getByRole("button", { name: "更多" }));
    fireEvent.click(within(card).getByRole("button", { name: "下架" }));

    expect(await within(card).findByRole("alert")).toHaveTextContent(
      "操作失败，请稍后重试。"
    );
    expect(within(card).getByText("已发布")).toBeInTheDocument();
  });

  it("opens a confirmation dialog when '删除' is clicked, and does not call deleteMyPost until confirmed", async () => {
    listMyPosts.mockResolvedValue([samplePost]);

    renderWithProviders(<MyPostsPage />);

    const title = await screen.findByText("Sunny room near metro");
    const card = title.closest("li") as HTMLElement;
    fireEvent.click(within(card).getByRole("button", { name: "更多" }));
    fireEvent.click(within(card).getByRole("button", { name: "删除" }));

    expect(await screen.findByRole("dialog", { name: "确认删除" })).toBeInTheDocument();
    expect(deleteMyPost).not.toHaveBeenCalled();
  });

  it("cancels the delete confirmation dialog without calling deleteMyPost", async () => {
    listMyPosts.mockResolvedValue([samplePost]);

    renderWithProviders(<MyPostsPage />);

    const title = await screen.findByText("Sunny room near metro");
    const card = title.closest("li") as HTMLElement;
    fireEvent.click(within(card).getByRole("button", { name: "更多" }));
    fireEvent.click(within(card).getByRole("button", { name: "删除" }));
    const dialog = await screen.findByRole("dialog", { name: "确认删除" });
    fireEvent.click(within(dialog).getByRole("button", { name: "取消" }));

    await waitFor(() => {
      expect(screen.queryByRole("dialog", { name: "确认删除" })).not.toBeInTheDocument();
    });
    expect(deleteMyPost).not.toHaveBeenCalled();
    expect(screen.getByText("Sunny room near metro")).toBeInTheDocument();
  });

  it("deletes the post after confirming: calls deleteMyPost and removes the row", async () => {
    listMyPosts.mockResolvedValue([samplePost]);
    deleteMyPost.mockResolvedValue(undefined);

    renderWithProviders(<MyPostsPage />);

    const title = await screen.findByText("Sunny room near metro");
    const card = title.closest("li") as HTMLElement;
    fireEvent.click(within(card).getByRole("button", { name: "更多" }));
    fireEvent.click(within(card).getByRole("button", { name: "删除" }));
    const dialog = await screen.findByRole("dialog", { name: "确认删除" });
    fireEvent.click(within(dialog).getByRole("button", { name: "确认删除" }));

    await waitFor(() => {
      expect(deleteMyPost).toHaveBeenCalledWith("post-1");
    });
    await waitFor(() => {
      expect(screen.queryByText("Sunny room near metro")).not.toBeInTheDocument();
    });
  });

  it("shows an error inside the dialog and keeps the post when deleteMyPost fails", async () => {
    listMyPosts.mockResolvedValue([samplePost]);
    deleteMyPost.mockRejectedValue(new Error("boom"));

    renderWithProviders(<MyPostsPage />);

    const title = await screen.findByText("Sunny room near metro");
    const card = title.closest("li") as HTMLElement;
    fireEvent.click(within(card).getByRole("button", { name: "更多" }));
    fireEvent.click(within(card).getByRole("button", { name: "删除" }));
    const dialog = await screen.findByRole("dialog", { name: "确认删除" });
    fireEvent.click(within(dialog).getByRole("button", { name: "确认删除" }));

    expect(await within(dialog).findByRole("alert")).toHaveTextContent(
      "操作失败，请稍后重试。"
    );
    expect(screen.getByText("Sunny room near metro")).toBeInTheDocument();
  });
});
