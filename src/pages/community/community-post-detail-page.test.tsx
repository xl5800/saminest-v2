import { cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { useCommunityPostDetailQuery, useDmvCommunityQuery, clipboardWrite } = vi.hoisted(() => ({
  useCommunityPostDetailQuery: vi.fn(),
  useDmvCommunityQuery: vi.fn(),
  clipboardWrite: vi.fn()
}));

vi.mock("../../features/community/use-community-post-detail-query", () => ({
  useCommunityPostDetailQuery
}));
vi.mock("../../features/community/use-dmv-community-query", () => ({
  useDmvCommunityQuery
}));
vi.mock("@capacitor/clipboard", () => ({
  Clipboard: { write: clipboardWrite }
}));
vi.mock("../../components/image-lightbox", () => ({
  ImageLightbox: ({
    images,
    initialIndex,
    onClose
  }: {
    images: string[];
    initialIndex: number;
    onClose: () => void;
  }) => (
    <div data-testid="lightbox">
      {initialIndex}/{images.length}
      <button type="button" onClick={onClose}>
        关闭大图
      </button>
    </div>
  )
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
  authorAvatarUrl: null,
  coverImageUrl: null,
  images: [] as string[]
};

const IMAGE_URLS = ["https://x/1.webp", "https://x/2.webp", "https://x/3.webp"];

function renderPage(state?: unknown) {
  return renderWithProviders(<CommunityPostDetailPage />, {
    initialEntries: [{ pathname: "/community/post/cp-1", state }] as never,
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
    useDmvCommunityQuery.mockReset();
    useDmvCommunityQuery.mockReturnValue({
      data: { id: "c-1", name: "DMV 社区", slug: "dmv", memberCount: 128 }
    });
    clipboardWrite.mockReset();
    clipboardWrite.mockResolvedValue(undefined);
  });

  it("shows '社区名 · N 位成员' as the top bar title, falling back to 帖子详情 until the community loads", () => {
    const { unmount } = renderPage();
    expect(screen.getByRole("heading", { level: 1, name: "DMV 社区 · 128 位成员" })).toBeInTheDocument();
    unmount();

    useDmvCommunityQuery.mockReturnValue({ data: undefined });
    renderPage();
    expect(screen.getByRole("heading", { level: 1, name: "帖子详情" })).toBeInTheDocument();
  });

  it("renders the body at 17px with 1.6 line height", () => {
    renderPage();

    expect(screen.getByText(/第一行/)).toHaveClass("text-[17px]", "leading-[1.6]");
  });

  it("lays the action row out as three equal columns: comment count, favorite, share", () => {
    renderPage();

    const commentCount = screen.getByLabelText("4 条评论");
    const row = commentCount.parentElement;
    expect(row).toHaveClass("grid", "grid-cols-3");
    expect(Array.from(row?.children ?? []).map((cell) => cell.textContent)).toEqual([
      "4",
      "cp-1/icon",
      "分享"
    ]);
  });

  it("copies the production post link when 分享 is clicked and shows a transient confirmation", async () => {
    renderPage();

    expect(screen.queryByText("链接已复制")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "分享" }));

    await waitFor(() => {
      expect(clipboardWrite).toHaveBeenCalledWith({
        string: "https://www.saminest.com/community/post/cp-1"
      });
    });
    expect(await screen.findByRole("status")).toHaveTextContent("链接已复制");
  });

  it("shows no confirmation when copying fails", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    clipboardWrite.mockRejectedValue(new Error("denied"));
    renderPage();

    fireEvent.click(screen.getByRole("button", { name: "分享" }));

    await waitFor(() => {
      expect(consoleError).toHaveBeenCalled();
    });
    expect(screen.queryByText("链接已复制")).not.toBeInTheDocument();
    consoleError.mockRestore();
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

    // 页面里只剩顶栏那一个 h1（社区名），没有帖子标题。
    expect(screen.getAllByRole("heading", { level: 1 }).map((h) => h.textContent)).toEqual([
      "DMV 社区 · 128 位成员"
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

  it("renders no image grid and no lightbox for a post without images", () => {
    renderPage();

    expect(screen.queryByRole("button", { name: /查看大图/ })).not.toBeInTheDocument();
    expect(screen.queryByTestId("lightbox")).not.toBeInTheDocument();
  });

  describe("with images", () => {
    beforeEach(() => {
      useCommunityPostDetailQuery.mockReturnValue({
        data: { ...samplePost, images: IMAGE_URLS },
        isPending: false,
        isError: false
      });
    });

    it("renders the images in a swipeable carousel (not a grid), in order, one clickable button per image", () => {
      const { container } = renderPage();

      const buttons = screen.getAllByRole("button", { name: /查看大图/ });
      expect(buttons).toHaveLength(3);
      expect(container.querySelector(".grid-cols-3.gap-2")).toBeNull();
      expect(screen.getByTestId("post-image-carousel-scroller")).toBeInTheDocument();
      expect(Array.from(container.querySelectorAll("button img")).map((img) => img.getAttribute("src"))).toEqual(
        IMAGE_URLS
      );
    });

    it("renders a single image as one full-width clickable image without a scroller", () => {
      useCommunityPostDetailQuery.mockReturnValue({
        data: { ...samplePost, images: [IMAGE_URLS[0]] },
        isPending: false,
        isError: false
      });

      renderPage();

      expect(screen.getAllByRole("button", { name: /查看大图/ })).toHaveLength(1);
      expect(screen.queryByTestId("post-image-carousel-scroller")).not.toBeInTheDocument();
    });

    it("opens the lightbox at the clicked image and closes it again", () => {
      renderPage();

      expect(screen.queryByTestId("lightbox")).not.toBeInTheDocument();
      fireEvent.click(screen.getByRole("button", { name: "查看大图 2" }));
      expect(screen.getByTestId("lightbox")).toHaveTextContent("1/3");

      fireEvent.click(screen.getByRole("button", { name: "关闭大图" }));
      expect(screen.queryByTestId("lightbox")).not.toBeInTheDocument();
    });

    it("opens the lightbox at the third image when the third image is clicked", () => {
      renderPage();

      fireEvent.click(screen.getByRole("button", { name: "查看大图 3" }));

      expect(screen.getByTestId("lightbox")).toHaveTextContent("2/3");
    });
  });

  it("shows the publish notice passed through location.state (partial image upload failure)", () => {
    renderPage({ publishSuccessMessage: "帖子已发布，但部分图片上传失败。" });

    expect(screen.getByRole("status")).toHaveTextContent("帖子已发布，但部分图片上传失败。");
  });

  it("shows no notice when arriving without location.state", () => {
    renderPage();

    expect(screen.queryByRole("status")).not.toBeInTheDocument();
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
