import { cleanup, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  resetIntersectionObserverMock,
  triggerLastIntersectionObserver
} from "../../test/setup";

const { listApprovedPosts } = vi.hoisted(() => ({
  listApprovedPosts: vi.fn()
}));

vi.mock("../../repositories/posts-repository", () => ({
  listApprovedPosts
}));

import { renderWithProviders } from "../../test/render-with-providers";
import { PostList } from "./post-list";

const samplePost = {
  id: "post-1",
  title: "Sunny room near metro",
  priceAmount: 1200,
  priceLabel: null,
  currencyCode: "USD",
  locationName: "Rockville",
  createdAt: "2000-07-01T00:00:00.000Z",
  categoryName: "租房",
  authorDisplayName: "Alice",
  coverImageUrl: "https://img.example.com/cover.jpg",
  favoriteCount: 5,
  commentCount: 2
};

describe("PostList", () => {
  afterEach(() => {
    cleanup();
  });

  beforeEach(() => {
    listApprovedPosts.mockReset();
    resetIntersectionObserverMock();
  });

  it("shows a loading state before the query resolves", () => {
    listApprovedPosts.mockReturnValue(new Promise(() => {}));

    renderWithProviders(<PostList />);

    expect(screen.getByRole("status")).toHaveTextContent("加载中…");
  });

  it("shows an empty state instead of crashing when there are no posts", async () => {
    listApprovedPosts.mockResolvedValue({ posts: [], hasNextPage: false });

    renderWithProviders(<PostList />);

    expect(await screen.findByText("暂无帖子。")).toBeInTheDocument();
  });

  it("shows an error state when the query fails", async () => {
    listApprovedPosts.mockRejectedValue(new Error("network down"));

    renderWithProviders(<PostList />);

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "帖子加载失败，请稍后重试。"
    );
  });

  it("renders each post's title, price, and a link to /post/:id", async () => {
    listApprovedPosts.mockResolvedValue({ posts: [samplePost], hasNextPage: false });

    renderWithProviders(<PostList />);

    const link = await screen.findByRole("link");
    expect(link).toHaveAttribute("href", "/post/post-1");
    expect(link).toHaveTextContent("Sunny room near metro");
    expect(link).toHaveTextContent("USD 1,200");
  });

  // 19 号卡（帖子卡片改版）：分类标签 pill 和地点文字整个从卡片上去掉了，
  // 不再展示（详情页仍然完整展示这些信息，只是列表卡片不再承载）。
  it("does not render the category tag pill or the location text on the card", async () => {
    listApprovedPosts.mockResolvedValue({ posts: [samplePost], hasNextPage: false });

    renderWithProviders(<PostList />);

    const link = await screen.findByRole("link");
    expect(link).not.toHaveTextContent("租房");
    expect(link).not.toHaveTextContent("Rockville");
  });

  it("truncates a very long title to a single line with an ellipsis (no multi-line wrap)", async () => {
    const longTitlePost = {
      ...samplePost,
      title:
        "这是一个非常非常非常非常非常非常非常非常非常非常非常非常长的标题用来测试省略号截断效果"
    };
    listApprovedPosts.mockResolvedValue({ posts: [longTitlePost], hasNextPage: false });

    renderWithProviders(<PostList />);

    const title = await screen.findByText(longTitlePost.title);
    expect(title).toHaveClass("truncate");
  });

  // 精简卡片改版（Facebook Marketplace 风格）之后，作者昵称、发布时间、
  // 收藏数/评论数、FavoriteButton 都从列表卡片上去掉了——这些信息只在
  // 详情页展示，不是这个组件漏渲染。
  it("does not render author nickname, published date, favorite/comment counts, or a favorite button", async () => {
    listApprovedPosts.mockResolvedValue({ posts: [samplePost], hasNextPage: false });

    renderWithProviders(<PostList />);

    const link = await screen.findByRole("link");
    expect(link).not.toHaveTextContent("Alice");
    expect(link).not.toHaveTextContent("2000-07-01");
    expect(screen.queryByText("♥ 5")).not.toBeInTheDocument();
    expect(screen.queryByText("💬 2")).not.toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("renders a two-column CSS grid (not the old waterfall columns-2 layout)", async () => {
    listApprovedPosts.mockResolvedValue({ posts: [samplePost], hasNextPage: false });

    const { container } = renderWithProviders(<PostList />);
    await screen.findByRole("link");

    expect(container.querySelector(".grid.grid-cols-2")).toBeInTheDocument();
    expect(container.querySelector(".columns-2")).not.toBeInTheDocument();
  });

  // 19 号卡：图片区域从 16:9 改成更接近人像照片的 4:5（任务卡给的 3:4～4:5
  // 区间内）。
  it("renders the cover image at a 4:5 aspect ratio, and the card itself with no border/shadow", async () => {
    listApprovedPosts.mockResolvedValue({ posts: [samplePost], hasNextPage: false });

    renderWithProviders(<PostList />);

    const img = await screen.findByRole("img");
    expect(img).toHaveClass("aspect-[4/5]");

    const link = screen.getByRole("link");
    expect(link).not.toHaveClass("border-border", "shadow-card");
  });

  // 19 号卡：价格为空时，那一整行文字完全不渲染——不是渲染出来但显示
  // "价格未填写"这几个字，也不是留一行空白占位。
  it("renders no price row at all (not a '价格未填写' placeholder, not an empty line) when the post has no price", async () => {
    listApprovedPosts.mockResolvedValue({
      posts: [{ ...samplePost, priceAmount: null, priceLabel: null }],
      hasNextPage: false
    });

    renderWithProviders(<PostList />);

    await screen.findByText(samplePost.title);
    expect(screen.queryByText("价格未填写")).not.toBeInTheDocument();
    expect(screen.queryByText(/USD/)).not.toBeInTheDocument();
  });

  it("still renders the price row (with the real amount) when the post has a price", async () => {
    listApprovedPosts.mockResolvedValue({ posts: [samplePost], hasNextPage: false });

    renderWithProviders(<PostList />);

    expect(await screen.findByText("USD 1,200")).toBeInTheDocument();
  });

  it("renders an <img> with the cover image url when coverImageUrl is present", async () => {
    listApprovedPosts.mockResolvedValue({ posts: [samplePost], hasNextPage: false });

    renderWithProviders(<PostList />);

    const img = await screen.findByRole("img");
    expect(img).toHaveAttribute("src", "https://img.example.com/cover.jpg");
    expect(screen.queryByTestId("post-thumbnail-placeholder")).not.toBeInTheDocument();
  });

  it("renders a designed placeholder instead of an <img> when coverImageUrl is absent", async () => {
    listApprovedPosts.mockResolvedValue({
      posts: [{ ...samplePost, coverImageUrl: null }],
      hasNextPage: false
    });

    renderWithProviders(<PostList />);

    await screen.findByRole("link");
    expect(screen.getByTestId("post-thumbnail-placeholder")).toBeInTheDocument();
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
  });

  it("passes categoryId through to the query", async () => {
    listApprovedPosts.mockResolvedValue({ posts: [], hasNextPage: false });

    renderWithProviders(<PostList categoryId="cat-1" />);

    await waitFor(() => {
      expect(listApprovedPosts).toHaveBeenCalledWith({
        categoryId: "cat-1",
        page: 0,
        pageSize: 20
      });
    });
  });

  // 22 号卡（发帖者主页改版）：发帖者主页给这个组件传 authorId，只请求/
  // 展示某一个作者的帖子，不做标签切换、复用同一套数据请求和卡片组件。
  it("passes authorId through to the query (22 号卡：发帖者主页“发布的作品”网格)", async () => {
    listApprovedPosts.mockResolvedValue({ posts: [], hasNextPage: false });

    renderWithProviders(<PostList authorId="user-1" />);

    await waitFor(() => {
      expect(listApprovedPosts).toHaveBeenCalledWith({
        authorId: "user-1",
        page: 0,
        pageSize: 20
      });
    });
  });

  it("only requests the first page on initial load", async () => {
    listApprovedPosts.mockResolvedValue({ posts: [samplePost], hasNextPage: true });

    renderWithProviders(<PostList />);

    await screen.findByRole("link");

    expect(listApprovedPosts).toHaveBeenCalledTimes(1);
    expect(listApprovedPosts).toHaveBeenCalledWith({
      categoryId: undefined,
      searchQuery: undefined,
      page: 0,
      pageSize: 20
    });
  });

  it("loads and appends the next page when the sentinel enters the viewport", async () => {
    const secondPost = { ...samplePost, id: "post-2", title: "Second room" };
    listApprovedPosts
      .mockResolvedValueOnce({ posts: [samplePost], hasNextPage: true })
      .mockResolvedValueOnce({ posts: [secondPost], hasNextPage: false });

    renderWithProviders(<PostList />);
    await screen.findByRole("link");

    triggerLastIntersectionObserver(true);

    await waitFor(() => {
      expect(listApprovedPosts).toHaveBeenCalledTimes(2);
    });
    expect(listApprovedPosts).toHaveBeenNthCalledWith(2, {
      categoryId: undefined,
      searchQuery: undefined,
      page: 1,
      pageSize: 20
    });

    const links = await screen.findAllByRole("link");
    expect(links).toHaveLength(2);
    expect(links[0]).toHaveAttribute("href", "/post/post-1");
    expect(links[1]).toHaveAttribute("href", "/post/post-2");
  });

  it("does not fetch again once there is no next page", async () => {
    listApprovedPosts
      .mockResolvedValueOnce({ posts: [samplePost], hasNextPage: true })
      .mockResolvedValueOnce({
        posts: [{ ...samplePost, id: "post-2" }],
        hasNextPage: false
      });

    renderWithProviders(<PostList />);
    await screen.findByRole("link");

    triggerLastIntersectionObserver(true);
    await waitFor(() => {
      expect(listApprovedPosts).toHaveBeenCalledTimes(2);
    });
    await screen.findAllByRole("link");

    // hasNextPage is now false, so the sentinel has been unmounted and its
    // observer disconnected — triggering the last known instance again must
    // not cause a third request.
    triggerLastIntersectionObserver(true);

    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(listApprovedPosts).toHaveBeenCalledTimes(2);
  });

  it("shows a loading indicator while fetching the next page", async () => {
    let resolveSecondPage: (value: { posts: typeof samplePost[]; hasNextPage: boolean }) => void =
      () => {};
    const secondPagePromise = new Promise<{ posts: typeof samplePost[]; hasNextPage: boolean }>(
      (resolve) => {
        resolveSecondPage = resolve;
      }
    );
    listApprovedPosts
      .mockResolvedValueOnce({ posts: [samplePost], hasNextPage: true })
      .mockReturnValueOnce(secondPagePromise);

    renderWithProviders(<PostList />);
    await screen.findByRole("link");

    triggerLastIntersectionObserver(true);

    expect(await screen.findByText("加载更多…")).toBeInTheDocument();

    resolveSecondPage({ posts: [{ ...samplePost, id: "post-2" }], hasNextPage: false });

    await waitFor(() => {
      expect(screen.queryByText("加载更多…")).not.toBeInTheDocument();
    });
  });
});
