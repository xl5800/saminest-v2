import { cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { listApprovedPosts, useFavoritePostIdsQuery, useToggleFavoriteMutation } =
  vi.hoisted(() => ({
    listApprovedPosts: vi.fn(),
    useFavoritePostIdsQuery: vi.fn(),
    useToggleFavoriteMutation: vi.fn()
  }));

vi.mock("../../repositories/posts-repository", () => ({
  listApprovedPosts
}));
// PostList renders FavoriteButton per item, which pulls in useQuery/useMutation
// hooks of its own — mock those the same way favorite-button.test.tsx does so
// this file stays focused on list/pagination behavior.
vi.mock("../favorites/use-favorite-post-ids-query", () => ({
  useFavoritePostIdsQuery
}));
vi.mock("../favorites/use-toggle-favorite-mutation", () => ({
  useToggleFavoriteMutation
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
  publishedAt: "2026-07-01T00:00:00.000Z"
};

describe("PostList", () => {
  afterEach(() => {
    cleanup();
  });

  beforeEach(() => {
    listApprovedPosts.mockReset();
    useFavoritePostIdsQuery.mockReset();
    useToggleFavoriteMutation.mockReset();
    useFavoritePostIdsQuery.mockReturnValue({ data: [] });
    useToggleFavoriteMutation.mockReturnValue({ mutate: vi.fn(), isPending: false });
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

  it("renders each post's title, price, location, published date and a link to /post/:id", async () => {
    listApprovedPosts.mockResolvedValue({ posts: [samplePost], hasNextPage: false });

    renderWithProviders(<PostList />);

    const link = await screen.findByRole("link");
    expect(link).toHaveAttribute("href", "/post/post-1");
    expect(link).toHaveTextContent("Sunny room near metro");
    expect(link).toHaveTextContent("USD 1,200");
    expect(link).toHaveTextContent("Rockville");
  });

  it("falls back to a placeholder label when a post has no location", async () => {
    listApprovedPosts.mockResolvedValue({
      posts: [{ ...samplePost, locationName: null }],
      hasNextPage: false
    });

    renderWithProviders(<PostList />);

    expect(await screen.findByRole("link")).toHaveTextContent("地区未填写");
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

  it("disables 上一页 on the first page and disables 下一页 when there is no next page", async () => {
    listApprovedPosts.mockResolvedValue({ posts: [samplePost], hasNextPage: false });

    renderWithProviders(<PostList />);
    await screen.findByRole("link");

    expect(screen.getByRole("button", { name: "上一页" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "下一页" })).toBeDisabled();
  });

  it("advances to the next page and requests it from the repository", async () => {
    listApprovedPosts.mockResolvedValue({ posts: [samplePost], hasNextPage: true });

    renderWithProviders(<PostList />);
    await screen.findByRole("link");

    fireEvent.click(screen.getByRole("button", { name: "下一页" }));

    await waitFor(() => {
      expect(listApprovedPosts).toHaveBeenCalledWith({
        categoryId: undefined,
        page: 1,
        pageSize: 20
      });
    });
  });
});
