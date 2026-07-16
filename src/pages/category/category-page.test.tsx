import { cleanup, screen } from "@testing-library/react";
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
import { CategoryPage } from "./category-page";

describe("CategoryPage", () => {
  afterEach(() => {
    cleanup();
  });

  beforeEach(() => {
    listActiveCategories.mockReset();
    listApprovedPosts.mockReset();
  });

  it("resolves the slug to a category name and filters posts by its id", async () => {
    listActiveCategories.mockResolvedValue([
      { id: "cat-1", slug: "rent", nameZh: "租房" },
      { id: "cat-2", slug: "wanted", nameZh: "求租" }
    ]);
    listApprovedPosts.mockResolvedValue({ posts: [], hasNextPage: false });

    renderWithProviders(<CategoryPage />, {
      initialEntries: ["/category/rent"],
      route: "/category/:slug"
    });

    expect(
      await screen.findByRole("heading", { name: "租房" })
    ).toBeInTheDocument();
    expect(await screen.findByText("暂无帖子。")).toBeInTheDocument();
    expect(listApprovedPosts).toHaveBeenCalledWith({
      categoryId: "cat-1",
      page: 0,
      pageSize: 20
    });
  });

  it("shows a not-found state instead of crashing for an unknown slug", async () => {
    listActiveCategories.mockResolvedValue([
      { id: "cat-1", slug: "rent", nameZh: "租房" }
    ]);

    renderWithProviders(<CategoryPage />, {
      initialEntries: ["/category/does-not-exist"],
      route: "/category/:slug"
    });

    expect(
      await screen.findByRole("heading", { name: "分类未找到" })
    ).toBeInTheDocument();
    expect(listApprovedPosts).not.toHaveBeenCalled();
  });
});
