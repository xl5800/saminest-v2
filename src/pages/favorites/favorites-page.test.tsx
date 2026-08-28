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
    listFavoritedPosts.mockResolvedValue([
      {
        id: "post-1",
        title: "Sunny room",
        priceAmount: 1200,
        priceLabel: null,
        currencyCode: "USD",
        locationName: "Rockville",
        createdAt: "2000-07-01T00:00:00.000Z"
      }
    ]);
    listFavoritedPostIds.mockResolvedValue(["post-1"]);

    renderWithProviders(<FavoritesPage />);

    expect(await screen.findByText("Sunny room")).toBeInTheDocument();
    expect(screen.getByText("USD 1,200")).toBeInTheDocument();
    expect(screen.getByText("Rockville")).toBeInTheDocument();
    expect(screen.getByText("2000-07-01")).toBeInTheDocument();
  });

  it("removes the row from the list after un-favoriting via FavoriteButton", async () => {
    listFavoritedPosts.mockResolvedValue([
      {
        id: "post-1",
        title: "Sunny room",
        priceAmount: 1200,
        priceLabel: null,
        currencyCode: "USD",
        locationName: "Rockville",
        createdAt: "2000-07-01T00:00:00.000Z"
      }
    ]);
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
