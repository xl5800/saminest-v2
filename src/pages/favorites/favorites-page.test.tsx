import { cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { listFavoritedPosts, listFavoritedPostIds, addFavorite, removeFavorite } =
  vi.hoisted(() => ({
    listFavoritedPosts: vi.fn(),
    listFavoritedPostIds: vi.fn(),
    addFavorite: vi.fn(),
    removeFavorite: vi.fn()
  }));

vi.mock("../../repositories/favorites-repository", () => ({
  listFavoritedPosts,
  listFavoritedPostIds,
  addFavorite,
  removeFavorite
}));

import { useAuthStore } from "../../store/auth-store";
import { renderWithProviders } from "../../test/render-with-providers";
import { FavoritesPage } from "./favorites-page";

const initialAuthState = useAuthStore.getState();

// 帖子卡片统一视觉（新一轮 UI 审计 P0 #1）：跟 post-list.test.tsx/
// my-posts-page.test.tsx 的 samplePost 同一个模式，收藏列表页现在也要
// 展示 categoryName/coverImageUrl。
const samplePost = {
  id: "post-1",
  title: "Sunny room",
  priceAmount: 1200,
  priceLabel: null,
  currencyCode: "USD",
  locationName: "Rockville",
  createdAt: "2000-07-01T00:00:00.000Z",
  categoryName: "租房",
  coverImageUrl: "https://img.example.com/cover.jpg"
};

describe("FavoritesPage", () => {
  afterEach(() => {
    cleanup();
  });

  beforeEach(() => {
    useAuthStore.setState(initialAuthState, true);
    useAuthStore.getState().setSession({ user: { id: "user-1" } } as never);
    listFavoritedPosts.mockReset();
    listFavoritedPostIds.mockReset();
    addFavorite.mockReset();
    removeFavorite.mockReset();
    listFavoritedPostIds.mockResolvedValue([]);
  });

  it("shows a loading state while favorites are pending", () => {
    listFavoritedPosts.mockReturnValue(new Promise(() => {}));

    renderWithProviders(<FavoritesPage />);

    expect(screen.getByRole("status")).toHaveTextContent("加载中");
  });

  it("shows an error message when the favorites request fails", async () => {
    listFavoritedPosts.mockRejectedValue(new Error("network down"));

    renderWithProviders(<FavoritesPage />);

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "收藏加载失败，请稍后重试。"
    );
  });

  it("shows an empty state when there are no favorited posts", async () => {
    listFavoritedPosts.mockResolvedValue([]);

    renderWithProviders(<FavoritesPage />);

    expect(await screen.findByText("暂无收藏。")).toBeInTheDocument();
  });

  // 21 号卡（二级页面顶部栏简化）：顶部栏换成 TopBar 的 nav-only 变体，
  // 不再是全局 AppHeader 的"← Saminest 发布"——跟 region-select-page.test.tsx
  // "renders the nav-only TopBar..." 是同一个断言模式。页面下面本来就有
  // "我的收藏"这行 <h1> 大标题，顶部栏不需要再重复一份标题文字。
  it("renders the nav-only TopBar (back arrow only, no title/brand/publish text)", async () => {
    listFavoritedPosts.mockResolvedValue([]);

    renderWithProviders(<FavoritesPage />);

    await screen.findByText("暂无收藏。");

    expect(screen.getByRole("button", { name: "返回" })).toBeInTheDocument();
    expect(screen.queryByText("Saminest")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "发布" })).not.toBeInTheDocument();
    // "我的收藏"页面内大标题还在，不受顶部栏简化影响。
    expect(screen.getByRole("heading", { name: "我的收藏" })).toBeInTheDocument();
  });

  it("renders the favorited posts with title/price/location", async () => {
    listFavoritedPosts.mockResolvedValue([samplePost]);
    listFavoritedPostIds.mockResolvedValue(["post-1"]);

    renderWithProviders(<FavoritesPage />);

    expect(await screen.findByText("Sunny room")).toBeInTheDocument();
    expect(screen.getByText("USD 1,200")).toBeInTheDocument();
    expect(screen.getByText("Rockville")).toBeInTheDocument();
    expect(screen.getByText("2000-07-01")).toBeInTheDocument();
  });

  // 帖子卡片统一视觉（新一轮 UI 审计 P0 #1）：收藏列表页改动前完全没有
  // 缩略图（四种帖子卡片呈现里唯一"看不到图"的一个），这组测试覆盖新加的
  // PostThumbnail——有封面图/无封面图两种情况都要覆盖，还有卡片容器 class
  // 改成跟 my-posts-page.tsx/activity-card.tsx 一致这条验收标准。
  describe("缩略图 + 卡片容器（帖子卡片统一视觉）", () => {
    it("renders a cover image thumbnail when the post has one", async () => {
      listFavoritedPosts.mockResolvedValue([samplePost]);
      listFavoritedPostIds.mockResolvedValue(["post-1"]);

      const { container } = renderWithProviders(<FavoritesPage />);
      await screen.findByText("Sunny room");

      const img = container.querySelector("img");
      expect(img).toHaveAttribute("src", "https://img.example.com/cover.jpg");
      expect(screen.queryByTestId("post-thumbnail-placeholder")).not.toBeInTheDocument();
    });

    it("renders the shared category-color icon placeholder (not plain text) when the post has no cover image", async () => {
      listFavoritedPosts.mockResolvedValue([{ ...samplePost, coverImageUrl: null }]);
      listFavoritedPostIds.mockResolvedValue(["post-1"]);

      const { container } = renderWithProviders(<FavoritesPage />);
      await screen.findByText("Sunny room");

      const placeholder = screen.getByTestId("post-thumbnail-placeholder");
      expect(placeholder).toHaveClass("bg-primary-light");
      expect(placeholder.querySelector("svg.lucide-house")).toBeInTheDocument();
      expect(container.querySelector("img")).not.toBeInTheDocument();
    });

    it("uses the rounded-2xl/border/shadow-card container that my-posts-page.tsx and activity-card.tsx already use, not the old rounded-lg/no-shadow combo", async () => {
      listFavoritedPosts.mockResolvedValue([samplePost]);
      listFavoritedPostIds.mockResolvedValue(["post-1"]);

      renderWithProviders(<FavoritesPage />);
      const title = await screen.findByText("Sunny room");

      const card = title.closest("li");
      expect(card).toHaveClass("rounded-2xl", "border", "border-border", "bg-white", "shadow-card");
      expect(card).not.toHaveClass("rounded-lg");
    });
  });

  it("removes the row from the list after un-favoriting via FavoriteButton", async () => {
    listFavoritedPosts.mockResolvedValue([samplePost]);
    listFavoritedPostIds.mockResolvedValue(["post-1"]);
    removeFavorite.mockResolvedValue(undefined);

    renderWithProviders(<FavoritesPage />);

    expect(await screen.findByText("Sunny room")).toBeInTheDocument();

    // 取消收藏之后，重新拉取到的收藏列表里这个帖子应该已经不在了。
    listFavoritedPosts.mockResolvedValue([]);

    const favoriteButton = await screen.findByRole("button", { name: "★ 已收藏" });
    fireEvent.click(favoriteButton);

    await waitFor(() => {
      expect(removeFavorite).toHaveBeenCalledWith({
        userId: "user-1",
        postId: "post-1"
      });
    });
    await waitFor(() => {
      expect(screen.queryByText("Sunny room")).not.toBeInTheDocument();
    });
  });
});
