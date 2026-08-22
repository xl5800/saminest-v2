import { cleanup, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { renderWithProviders } from "../test/render-with-providers";
import { AdminNav } from "./admin-nav";

describe("AdminNav", () => {
  afterEach(() => {
    cleanup();
  });

  it("renders all 6 admin destination links", () => {
    renderWithProviders(<AdminNav />, { initialEntries: ["/admin/posts"] });

    const links = screen.getAllByRole("link");
    expect(links).toHaveLength(6);
    expect(screen.getByRole("link", { name: "待审核" })).toHaveAttribute(
      "href",
      "/admin/posts"
    );
    expect(screen.getByRole("link", { name: "全部帖子" })).toHaveAttribute(
      "href",
      "/admin/posts/all"
    );
    expect(screen.getByRole("link", { name: "举报处理" })).toHaveAttribute(
      "href",
      "/admin/reports"
    );
    expect(screen.getByRole("link", { name: "联系客服" })).toHaveAttribute(
      "href",
      "/admin/feedback"
    );
    expect(screen.getByRole("link", { name: "用户管理" })).toHaveAttribute(
      "href",
      "/admin/users"
    );
    expect(screen.getByRole("link", { name: "分类管理" })).toHaveAttribute(
      "href",
      "/admin/categories"
    );
  });

  it("marks '联系客服' as active with aria-current on /admin/feedback", () => {
    renderWithProviders(<AdminNav />, { initialEntries: ["/admin/feedback"] });

    expect(screen.getByRole("link", { name: "联系客服" })).toHaveAttribute(
      "aria-current",
      "page"
    );
  });

  it("marks '待审核' as active with aria-current on /admin/posts", () => {
    renderWithProviders(<AdminNav />, { initialEntries: ["/admin/posts"] });

    expect(screen.getByRole("link", { name: "待审核" })).toHaveAttribute(
      "aria-current",
      "page"
    );
    expect(screen.getByRole("link", { name: "全部帖子" })).not.toHaveAttribute(
      "aria-current"
    );
  });

  // "/admin/posts" 是 "/admin/posts/all" 的字符串前缀——这条测试专门守住
  // AdminNav 用的是精确匹配，不是 bottom-nav.tsx 那种前缀匹配，避免"全部
  // 帖子"页面时"待审核"这个 tab 被误判成同时激活。
  it("marks only '全部帖子' as active on /admin/posts/all, not '待审核'", () => {
    renderWithProviders(<AdminNav />, { initialEntries: ["/admin/posts/all"] });

    expect(screen.getByRole("link", { name: "全部帖子" })).toHaveAttribute(
      "aria-current",
      "page"
    );
    expect(screen.getByRole("link", { name: "待审核" })).not.toHaveAttribute(
      "aria-current"
    );
  });

  it("marks '举报处理' as active with aria-current on /admin/reports", () => {
    renderWithProviders(<AdminNav />, { initialEntries: ["/admin/reports"] });

    expect(screen.getByRole("link", { name: "举报处理" })).toHaveAttribute(
      "aria-current",
      "page"
    );
  });

  it("marks '用户管理' as active with aria-current on /admin/users", () => {
    renderWithProviders(<AdminNav />, { initialEntries: ["/admin/users"] });

    expect(screen.getByRole("link", { name: "用户管理" })).toHaveAttribute(
      "aria-current",
      "page"
    );
  });

  it("marks '分类管理' as active with aria-current on /admin/categories", () => {
    renderWithProviders(<AdminNav />, { initialEntries: ["/admin/categories"] });

    expect(screen.getByRole("link", { name: "分类管理" })).toHaveAttribute(
      "aria-current",
      "page"
    );
  });
});
