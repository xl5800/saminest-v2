import { cleanup, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { listActiveCategories } = vi.hoisted(() => ({
  listActiveCategories: vi.fn()
}));

vi.mock("../../repositories/categories-repository", () => ({
  listActiveCategories
}));

import { renderWithProviders } from "../../test/render-with-providers";
import { CategoryNav } from "./category-nav";

describe("CategoryNav", () => {
  afterEach(() => {
    cleanup();
  });

  beforeEach(() => {
    listActiveCategories.mockReset();
  });

  it("renders a '推荐' link plus one link per active category, from the database not hardcoded", async () => {
    listActiveCategories.mockResolvedValue([
      { id: "cat-1", slug: "rent", nameZh: "租房" },
      { id: "cat-2", slug: "wanted", nameZh: "求租" },
      { id: "cat-3", slug: "used", nameZh: "二手" }
    ]);

    renderWithProviders(<CategoryNav />);

    await waitFor(() => {
      expect(screen.getByRole("link", { name: "租房" })).toHaveAttribute(
        "href",
        "/category/rent"
      );
    });
    expect(screen.getByRole("link", { name: "求租" })).toHaveAttribute(
      "href",
      "/category/wanted"
    );
    expect(screen.getByRole("link", { name: "二手" })).toHaveAttribute(
      "href",
      "/category/used"
    );
    expect(screen.getByRole("link", { name: "推荐" })).toHaveAttribute("href", "/");
  });

  it("marks the active category link with aria-current", async () => {
    listActiveCategories.mockResolvedValue([
      { id: "cat-1", slug: "rent", nameZh: "租房" }
    ]);

    renderWithProviders(<CategoryNav activeSlug="rent" />);

    const rentLink = await screen.findByRole("link", { name: "租房" });
    expect(rentLink).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: "推荐" })).not.toHaveAttribute(
      "aria-current"
    );
  });

  it("renders nothing (not a crash) when the categories request fails", async () => {
    listActiveCategories.mockRejectedValue(new Error("network down"));

    const { container } = renderWithProviders(<CategoryNav />);

    await waitFor(() => {
      expect(container.querySelector("nav")).not.toBeInTheDocument();
    });
  });
});
