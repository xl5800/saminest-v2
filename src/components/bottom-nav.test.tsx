import { cleanup, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { renderWithProviders } from "../test/render-with-providers";
import { BottomNav } from "./bottom-nav";

describe("BottomNav", () => {
  afterEach(() => {
    cleanup();
  });

  it("renders all 5 links with the correct hrefs", () => {
    renderWithProviders(<BottomNav />, { initialEntries: ["/"] });

    expect(screen.getByRole("link", { name: "首页" })).toHaveAttribute("href", "/");
    expect(screen.getByRole("link", { name: "分类" })).toHaveAttribute(
      "href",
      "/categories"
    );
    expect(screen.getByRole("link", { name: "发布" })).toHaveAttribute(
      "href",
      "/publish"
    );
    expect(screen.getByRole("link", { name: "消息" })).toHaveAttribute(
      "href",
      "/messages"
    );
    expect(screen.getByRole("link", { name: "我的" })).toHaveAttribute(
      "href",
      "/profile"
    );
  });

  it("marks '首页' as the active item with aria-current when on /", () => {
    renderWithProviders(<BottomNav />, { initialEntries: ["/"] });

    expect(screen.getByRole("link", { name: "首页" })).toHaveAttribute(
      "aria-current",
      "page"
    );
    expect(screen.getByRole("link", { name: "分类" })).not.toHaveAttribute(
      "aria-current"
    );
    expect(screen.getByRole("link", { name: "消息" })).not.toHaveAttribute(
      "aria-current"
    );
  });

  it("marks '消息' as the active item with aria-current when on /messages", () => {
    renderWithProviders(<BottomNav />, { initialEntries: ["/messages"] });

    expect(screen.getByRole("link", { name: "消息" })).toHaveAttribute(
      "aria-current",
      "page"
    );
    expect(screen.getByRole("link", { name: "首页" })).not.toHaveAttribute(
      "aria-current"
    );
  });

  it("marks '我的' as the active item with aria-current when on /profile", () => {
    renderWithProviders(<BottomNav />, { initialEntries: ["/profile"] });

    expect(screen.getByRole("link", { name: "我的" })).toHaveAttribute(
      "aria-current",
      "page"
    );
  });
});
