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
      page: 0,
      pageSize: 20
    });
  });
});
