import { cleanup, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { listActiveCategories } = vi.hoisted(() => ({
  listActiveCategories: vi.fn()
}));

vi.mock("../../repositories/categories-repository", () => ({
  listActiveCategories
}));

import { renderWithProviders } from "../../test/render-with-providers";
import { CategoriesPage } from "./categories-page";

describe("CategoriesPage", () => {
  afterEach(() => {
    cleanup();
  });

  beforeEach(() => {
    listActiveCategories.mockReset();
  });

  it("shows a loading state while categories are pending", () => {
    listActiveCategories.mockReturnValue(new Promise(() => {}));

    renderWithProviders(<CategoriesPage />);

    expect(screen.getByRole("status")).toHaveTextContent("加载中");
  });

  it("shows an error message when the categories request fails", async () => {
    listActiveCategories.mockRejectedValue(new Error("network down"));

    renderWithProviders(<CategoriesPage />);

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "分类加载失败，请稍后重试。"
    );
  });

  it("shows an empty state when there are no categories", async () => {
    listActiveCategories.mockResolvedValue([]);

    renderWithProviders(<CategoriesPage />);

    expect(await screen.findByText("暂无分类。")).toBeInTheDocument();
  });

  it("renders one link per category, from the database not hardcoded", async () => {
    listActiveCategories.mockResolvedValue([
      { id: "cat-1", slug: "rent", nameZh: "租房" },
      { id: "cat-2", slug: "wanted", nameZh: "求租" },
      { id: "cat-3", slug: "used", nameZh: "二手" }
    ]);

    renderWithProviders(<CategoriesPage />);

    expect(await screen.findByRole("link", { name: "租房" })).toHaveAttribute(
      "href",
      "/category/rent"
    );
    expect(screen.getByRole("link", { name: "求租" })).toHaveAttribute(
      "href",
      "/category/wanted"
    );
    expect(screen.getByRole("link", { name: "二手" })).toHaveAttribute(
      "href",
      "/category/used"
    );
  });
});
