import { cleanup, fireEvent, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { useCommunityPostDetailQuery } = vi.hoisted(() => ({
  useCommunityPostDetailQuery: vi.fn()
}));

vi.mock("../../features/community/use-community-post-detail-query", () => ({
  useCommunityPostDetailQuery
}));
vi.mock("../../components/comment-section", () => ({
  CommentSection: ({ communityPostId }: { communityPostId: string }) => (
    <div data-testid="comment-section">comments for {communityPostId}</div>
  )
}));
vi.mock("../../components/community-post-favorite-button", () => ({
  CommunityPostFavoriteButton: ({
    communityPostId,
    variant
  }: {
    communityPostId: string;
    variant?: string;
  }) => (
    <div data-testid="favorite-button">
      {communityPostId}/{variant}
    </div>
  )
}));

import { renderWithProviders } from "../../test/render-with-providers";
import { CommunityPostDetailPage } from "./community-post-detail-page";

const samplePost = {
  id: "cp-1",
  communityId: "c-1",
  postType: "recommend",
  title: "推荐一家中餐馆",
  body: "第一行\n第二行",
  pinned: false,
  commentCount: 4,
  favoriteCount: 2,
  createdAt: "2026-08-01T00:00:00.000Z",
  authorId: "user-2",
  authorDisplayName: "Bob",
  authorAvatarUrl: null
};

function renderPage() {
  return renderWithProviders(<CommunityPostDetailPage />, {
    initialEntries: ["/community/post/cp-1"],
    route: "/community/post/:id"
  });
}

describe("CommunityPostDetailPage", () => {
  afterEach(() => {
    cleanup();
  });

  beforeEach(() => {
    useCommunityPostDetailQuery.mockReset();
    useCommunityPostDetailQuery.mockReturnValue({
      data: samplePost,
      isPending: false,
      isError: false
    });
  });

  it("loads the post by the :id route param", () => {
    renderPage();

    expect(useCommunityPostDetailQuery).toHaveBeenCalledWith("cp-1");
  });

  it("renders the type pill, title, author, body and comment count", () => {
    renderPage();

    expect(screen.getByText("推荐")).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 1, name: "推荐一家中餐馆" })).toBeInTheDocument();
    expect(screen.getByText("Bob")).toBeInTheDocument();
    expect(screen.getByText(/第一行/)).toHaveClass("whitespace-pre-wrap");
    expect(screen.getByLabelText("4 条评论")).toBeInTheDocument();
  });

  it("omits the title heading when the post has no title", () => {
    useCommunityPostDetailQuery.mockReturnValue({
      data: { ...samplePost, title: null },
      isPending: false,
      isError: false
    });

    renderPage();

    // 页面里只剩顶栏那一个 h1（"帖子详情"），没有帖子标题。
    expect(screen.getAllByRole("heading", { level: 1 }).map((h) => h.textContent)).toEqual([
      "帖子详情"
    ]);
  });

  it("mounts the icon-variant favorite button and the comment section for this post", () => {
    renderPage();

    expect(screen.getByTestId("favorite-button")).toHaveTextContent("cp-1/icon");
    expect(screen.getByTestId("comment-section")).toHaveTextContent("comments for cp-1");
  });

  it("puts a 举报 link to /community/post/:id/report in the top bar's … menu", () => {
    renderPage();

    expect(screen.queryByRole("link", { name: "举报" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "更多" }));

    expect(screen.getByRole("link", { name: "举报" })).toHaveAttribute(
      "href",
      "/community/post/cp-1/report"
    );
  });

  it("still offers the 举报 link (built from the route id) before the post has loaded", () => {
    useCommunityPostDetailQuery.mockReturnValue({
      data: undefined,
      isPending: true,
      isError: false
    });

    renderPage();
    fireEvent.click(screen.getByRole("button", { name: "更多" }));

    expect(screen.getByRole("link", { name: "举报" })).toHaveAttribute(
      "href",
      "/community/post/cp-1/report"
    );
  });

  it("shows a loading status while the post is pending", () => {
    useCommunityPostDetailQuery.mockReturnValue({
      data: undefined,
      isPending: true,
      isError: false
    });

    renderPage();

    expect(screen.getByRole("status")).toHaveTextContent("加载中…");
    expect(screen.queryByTestId("comment-section")).not.toBeInTheDocument();
  });

  it("shows a not-found alert when the post cannot be loaded", () => {
    useCommunityPostDetailQuery.mockReturnValue({
      data: undefined,
      isPending: false,
      isError: true
    });

    renderPage();

    expect(screen.getByRole("alert")).toHaveTextContent("帖子不存在或已被删除。");
    expect(screen.queryByTestId("comment-section")).not.toBeInTheDocument();
  });
});
