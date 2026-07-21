import { cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { listActiveCategories, listApprovedPosts } = vi.hoisted(() => ({
  listActiveCategories: vi.fn(),
  listApprovedPosts: vi.fn()
}));

vi.mock("../../repositories/categories-repository", () => ({
  listActiveCategories
}));
vi.mock("../../repositories/posts-repository", () => ({
  listApprovedPosts
}));

import { renderWithProviders } from "../../test/render-with-providers";
import { HomePage } from "./home-page";

describe("HomePage", () => {
  afterEach(() => {
    cleanup();
  });

  beforeEach(() => {
    listActiveCategories.mockReset();
    listApprovedPosts.mockReset();
  });

  it("renders the heading, category nav and post list without crashing on an empty result", async () => {
    listActiveCategories.mockResolvedValue([
      { id: "cat-1", slug: "rent", nameZh: "租房" }
    ]);
    listApprovedPosts.mockResolvedValue({ posts: [], hasNextPage: false });

    renderWithProviders(<HomePage />);

    expect(screen.getByRole("heading", { name: "Saminest" })).toBeInTheDocument();
    expect(await screen.findByRole("link", { name: "租房" })).toHaveAttribute(
      "href",
      "/category/rent"
    );
    expect(await screen.findByText("暂无帖子。")).toBeInTheDocument();
  });

  it("queries posts with no category filter", async () => {
    listActiveCategories.mockResolvedValue([]);
    listApprovedPosts.mockResolvedValue({ posts: [], hasNextPage: false });

    renderWithProviders(<HomePage />);

    await screen.findByText("暂无帖子。");
    expect(listApprovedPosts).toHaveBeenCalledWith({
      categoryId: undefined,
      searchQuery: "",
      page: 0,
      pageSize: 20
    });
  });

  it("debounces typing in the search box and eventually queries with the typed search value", async () => {
    listActiveCategories.mockResolvedValue([]);
    listApprovedPosts.mockResolvedValue({ posts: [], hasNextPage: false });

    renderWithProviders(<HomePage />);
    await screen.findByText("暂无帖子。");
    listApprovedPosts.mockClear();

    const input = screen.getByPlaceholderText("搜租房、求租、二手物品…");
    fireEvent.change(input, { target: { value: "sunny room" } });

    // Not yet debounced — no call with the typed value should have fired
    // immediately after the keystroke.
    expect(listApprovedPosts).not.toHaveBeenCalledWith(
      expect.objectContaining({ searchQuery: "sunny room" })
    );

    await waitFor(
      () => {
        expect(listApprovedPosts).toHaveBeenCalledWith({
          categoryId: undefined,
          searchQuery: "sunny room",
          page: 0,
          pageSize: 20
        });
      },
      { timeout: 2000 }
    );
  });

  it("shows the search-specific empty state instead of the generic one once a search yields no results", async () => {
    listActiveCategories.mockResolvedValue([]);
    listApprovedPosts.mockResolvedValue({ posts: [], hasNextPage: false });

    renderWithProviders(<HomePage />);
    await screen.findByText("暂无帖子。");

    const input = screen.getByPlaceholderText("搜租房、求租、二手物品…");
    fireEvent.change(input, { target: { value: "nothing matches this" } });

    expect(
      await screen.findByText("没有找到相关帖子。", {}, { timeout: 2000 })
    ).toBeInTheDocument();
  });
});
