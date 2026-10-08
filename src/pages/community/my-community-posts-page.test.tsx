import { cleanup, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { listMyCommunityPosts, deleteCommunityPost } = vi.hoisted(() => ({
  listMyCommunityPosts: vi.fn(),
  deleteCommunityPost: vi.fn()
}));

vi.mock("../../repositories/community-repository", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../repositories/community-repository")>();
  return { ...actual, listMyCommunityPosts, deleteCommunityPost };
});

import { useAuthStore } from "../../store/auth-store";
import { renderWithProviders } from "../../test/render-with-providers";
import { MyCommunityPostsPage } from "./my-community-posts-page";

const initialAuthState = useAuthStore.getState();

const titledPost = {
  id: "cp-1",
  postType: "question",
  title: "有标题的帖子",
  body: "这是正文摘要",
  status: "approved",
  commentCount: 3,
  favoriteCount: 5,
  createdAt: "2000-07-01T00:00:00.000Z"
};
const untitledPost = {
  id: "cp-2",
  postType: "share",
  title: null,
  body: "没有标题只有正文",
  status: "approved",
  commentCount: 0,
  favoriteCount: 0,
  createdAt: "2000-07-02T00:00:00.000Z"
};

describe("MyCommunityPostsPage", () => {
  afterEach(() => {
    cleanup();
  });

  beforeEach(() => {
    useAuthStore.setState(initialAuthState, true);
    useAuthStore.getState().setSession({ user: { id: "user-1" } } as never);
    listMyCommunityPosts.mockReset();
    deleteCommunityPost.mockReset();
    listMyCommunityPosts.mockResolvedValue([titledPost, untitledPost]);
  });

  it("requests only the current user's posts and renders the 我的社区发帖 heading without a publish button", async () => {
    renderWithProviders(<MyCommunityPostsPage />);

    expect(screen.getByRole("heading", { name: "我的社区发帖" })).toBeInTheDocument();
    await screen.findByText("有标题的帖子");
    expect(listMyCommunityPosts).toHaveBeenCalledWith("user-1");
    expect(screen.queryByRole("button", { name: "发布" })).not.toBeInTheDocument();
  });

  it("shows a loading status while pending", () => {
    listMyCommunityPosts.mockReturnValue(new Promise(() => undefined));

    renderWithProviders(<MyCommunityPostsPage />);

    expect(screen.getByRole("status")).toHaveTextContent("加载中…");
  });

  it("shows the empty state when there are no posts", async () => {
    listMyCommunityPosts.mockResolvedValue([]);

    renderWithProviders(<MyCommunityPostsPage />);

    expect(await screen.findByText("暂无发布的社区帖子。")).toBeInTheDocument();
  });

  it("shows an error message when loading fails", async () => {
    listMyCommunityPosts.mockRejectedValue(new Error("boom"));

    renderWithProviders(<MyCommunityPostsPage />);

    expect(await screen.findByRole("alert")).toHaveTextContent("社区帖子加载失败，请稍后重试。");
  });

  it("renders type pill, title + body preview, and comment/favorite counts for a titled post", async () => {
    renderWithProviders(<MyCommunityPostsPage />);

    await screen.findByText("有标题的帖子");
    expect(screen.getByText("提问")).toBeInTheDocument();
    expect(screen.getByText("这是正文摘要")).toBeInTheDocument();
    expect(screen.getByLabelText("3 条评论")).toBeInTheDocument();
    expect(screen.getByLabelText("5 次收藏")).toBeInTheDocument();
  });

  it("uses the body as the headline for a post without a title, without repeating it as a preview", async () => {
    renderWithProviders(<MyCommunityPostsPage />);

    await screen.findByText("没有标题只有正文");
    expect(screen.getAllByText("没有标题只有正文")).toHaveLength(1);
    expect(screen.getByText("分享")).toBeInTheDocument();
  });

  it("links 查看/编辑 to the post detail and edit routes", async () => {
    renderWithProviders(<MyCommunityPostsPage />);

    await screen.findByText("有标题的帖子");
    const links = screen.getAllByRole("link");
    expect(links.map((link) => link.getAttribute("href"))).toEqual([
      "/community/post/cp-1",
      "/community/post/cp-1/edit",
      "/community/post/cp-2",
      "/community/post/cp-2/edit"
    ]);
  });

  it("opens a confirm dialog on 删除 and does not delete until confirmed; 取消 closes it", async () => {
    renderWithProviders(<MyCommunityPostsPage />);
    await screen.findByText("有标题的帖子");

    fireEvent.click(screen.getAllByRole("button", { name: "删除" })[0]);

    const dialog = screen.getByRole("dialog", { name: "确认删除" });
    expect(deleteCommunityPost).not.toHaveBeenCalled();

    fireEvent.click(within(dialog).getByRole("button", { name: "取消" }));

    expect(screen.queryByRole("dialog", { name: "确认删除" })).not.toBeInTheDocument();
    expect(deleteCommunityPost).not.toHaveBeenCalled();
    expect(screen.getByText("有标题的帖子")).toBeInTheDocument();
  });

  it("deletes the right post with the current user id on confirm and removes only that row from the list", async () => {
    deleteCommunityPost.mockResolvedValue(undefined);
    renderWithProviders(<MyCommunityPostsPage />);
    await screen.findByText("有标题的帖子");

    fireEvent.click(screen.getAllByRole("button", { name: "删除" })[0]);
    fireEvent.click(
      within(screen.getByRole("dialog", { name: "确认删除" })).getByRole("button", {
        name: "确认删除"
      })
    );

    await waitFor(() => {
      expect(deleteCommunityPost).toHaveBeenCalledWith("cp-1", "user-1");
    });
    await waitFor(() => {
      expect(screen.queryByText("有标题的帖子")).not.toBeInTheDocument();
    });
    expect(screen.getByText("没有标题只有正文")).toBeInTheDocument();
    expect(screen.queryByRole("dialog", { name: "确认删除" })).not.toBeInTheDocument();
  });

  it("keeps the row and shows an error inside the dialog when deletion fails", async () => {
    deleteCommunityPost.mockRejectedValue(new Error("boom"));
    renderWithProviders(<MyCommunityPostsPage />);
    await screen.findByText("有标题的帖子");

    fireEvent.click(screen.getAllByRole("button", { name: "删除" })[0]);
    const dialog = screen.getByRole("dialog", { name: "确认删除" });
    fireEvent.click(within(dialog).getByRole("button", { name: "确认删除" }));

    expect(await within(dialog).findByRole("alert")).toHaveTextContent("操作失败，请稍后重试。");
    expect(screen.getByText("有标题的帖子")).toBeInTheDocument();
  });
});
