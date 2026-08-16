import { cleanup, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { renderWithProviders } from "../test/render-with-providers";
import { BottomNav } from "./bottom-nav";

describe("BottomNav", () => {
  afterEach(() => {
    cleanup();
  });

  it("renders exactly 5 flat destination links, with no separate publish button", () => {
    renderWithProviders(<BottomNav />, { initialEntries: ["/"] });

    const links = screen.getAllByRole("link");
    expect(links).toHaveLength(5);
    expect(screen.getByRole("link", { name: /首页/ })).toHaveAttribute("href", "/");
    expect(screen.getByRole("link", { name: /分类/ })).toHaveAttribute(
      "href",
      "/categories"
    );
    expect(screen.getByRole("link", { name: /找搭子/ })).toHaveAttribute(
      "href",
      "/activities"
    );
    expect(screen.getByRole("link", { name: /消息/ })).toHaveAttribute(
      "href",
      "/messages"
    );
    expect(screen.getByRole("link", { name: /我的/ })).toHaveAttribute(
      "href",
      "/profile"
    );
    expect(screen.queryByRole("link", { name: /^发布$/ })).not.toBeInTheDocument();
  });

  it("marks '首页' as the active item with aria-current when on /", () => {
    renderWithProviders(<BottomNav />, { initialEntries: ["/"] });

    expect(screen.getByRole("link", { name: /首页/ })).toHaveAttribute(
      "aria-current",
      "page"
    );
    expect(screen.getByRole("link", { name: /分类/ })).not.toHaveAttribute(
      "aria-current"
    );
    expect(screen.getByRole("link", { name: /找搭子/ })).not.toHaveAttribute(
      "aria-current"
    );
  });

  it("marks '找搭子' as the active item with aria-current when on /activities", () => {
    renderWithProviders(<BottomNav />, { initialEntries: ["/activities"] });

    expect(screen.getByRole("link", { name: /找搭子/ })).toHaveAttribute(
      "aria-current",
      "page"
    );
    expect(screen.getByRole("link", { name: /首页/ })).not.toHaveAttribute(
      "aria-current"
    );
  });

  it("marks '找搭子' as active on a nested activities path (e.g. an activity detail page)", () => {
    renderWithProviders(<BottomNav />, { initialEntries: ["/activities/act-1"] });

    expect(screen.getByRole("link", { name: /找搭子/ })).toHaveAttribute(
      "aria-current",
      "page"
    );
  });

  it("marks '消息' as the active item with aria-current when on /messages", () => {
    renderWithProviders(<BottomNav />, { initialEntries: ["/messages"] });

    expect(screen.getByRole("link", { name: /消息/ })).toHaveAttribute(
      "aria-current",
      "page"
    );
    expect(screen.getByRole("link", { name: /首页/ })).not.toHaveAttribute(
      "aria-current"
    );
  });

  it("marks '我的' as the active item with aria-current when on /profile", () => {
    renderWithProviders(<BottomNav />, { initialEntries: ["/profile"] });

    expect(screen.getByRole("link", { name: /我的/ })).toHaveAttribute(
      "aria-current",
      "page"
    );
  });

  it("is fixed to the bottom of the screen", () => {
    renderWithProviders(<BottomNav />, { initialEntries: ["/"] });

    expect(screen.getByRole("navigation", { name: "底部导航" })).toHaveClass(
      "fixed",
      "inset-x-0",
      "bottom-0"
    );
  });

  it("reserves extra bottom padding for the iOS safe area (env(safe-area-inset-bottom))", () => {
    renderWithProviders(<BottomNav />, { initialEntries: ["/"] });

    const nav = screen.getByRole("navigation", { name: "底部导航" });
    expect(nav.className).toContain("env(safe-area-inset-bottom)");
  });
});
