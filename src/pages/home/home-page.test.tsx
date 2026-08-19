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

/** 每个测试都要先点开搜索图标才能看到输入框——搜索默认收起，不再是常驻
 *  一整行，见 home-page.tsx 顶部注释。 */
function openSearch(): void {
  fireEvent.click(screen.getByRole("button", { name: "搜索" }));
}

describe("HomePage", () => {
  afterEach(() => {
    cleanup();
  });

  beforeEach(() => {
    listActiveCategories.mockReset();
    listApprovedPosts.mockReset();
  });

  it("does not render a '一起去'/找搭子 entry on the home page — that's the bottom nav's job now", async () => {
    listActiveCategories.mockResolvedValue([]);
    listApprovedPosts.mockResolvedValue({ posts: [], hasNextPage: false });

    renderWithProviders(<HomePage />);

    expect(screen.queryByRole("link", { name: /一起去/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /找搭子/ })).not.toBeInTheDocument();
  });

  it("renders the heading, category nav and post list without crashing on an empty result", async () => {
    listActiveCategories.mockResolvedValue([
      { id: "cat-1", slug: "rent", nameZh: "租房" }
    ]);
    listApprovedPosts.mockResolvedValue({ posts: [], hasNextPage: false });

    renderWithProviders(<HomePage />);

    expect(screen.getByTestId("home-page")).toBeInTheDocument();
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

  describe("top bar (TopBar home variant)", () => {
    it("renders the 'Saminest' brand name and no stray state-name text (no region source yet)", () => {
      listActiveCategories.mockResolvedValue([]);
      listApprovedPosts.mockResolvedValue({ posts: [], hasNextPage: false });

      renderWithProviders(<HomePage />);

      expect(screen.getByText("Saminest")).toBeInTheDocument();
      expect(screen.queryByText("·")).not.toBeInTheDocument();
    });

    it("renders only icon buttons ('发布'/'搜索') at the top — no visible text '发布' button and no bottom floating publish button", () => {
      listActiveCategories.mockResolvedValue([]);
      listApprovedPosts.mockResolvedValue({ posts: [], hasNextPage: false });

      renderWithProviders(<HomePage />);

      expect(screen.getByRole("button", { name: "发布" })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "搜索" })).toBeInTheDocument();
      // 旧版顶部的文字"发布"按钮、底部悬浮发布按钮都不应该再出现。
      expect(screen.queryByRole("button", { name: "＋ 发布" })).not.toBeInTheDocument();
      expect(screen.queryByRole("button", { name: /发起搭子/ })).not.toBeInTheDocument();
    });

    it("opens the '选择发布类型' action sheet when the 发布 icon is clicked", async () => {
      listActiveCategories.mockResolvedValue([]);
      listApprovedPosts.mockResolvedValue({ posts: [], hasNextPage: false });

      renderWithProviders(<HomePage />);

      fireEvent.click(screen.getByRole("button", { name: "发布" }));

      expect(await screen.findByRole("dialog", { name: "选择发布类型" })).toBeInTheDocument();
    });
  });

  describe("search toggle", () => {
    it("does not show the search input by default", () => {
      listActiveCategories.mockResolvedValue([]);
      listApprovedPosts.mockResolvedValue({ posts: [], hasNextPage: false });

      renderWithProviders(<HomePage />);

      expect(
        screen.queryByPlaceholderText("搜租房、求租、二手物品…")
      ).not.toBeInTheDocument();
    });

    it("shows the search input after clicking the 搜索 icon, and hides it again on a second click", () => {
      listActiveCategories.mockResolvedValue([]);
      listApprovedPosts.mockResolvedValue({ posts: [], hasNextPage: false });

      renderWithProviders(<HomePage />);

      openSearch();
      expect(
        screen.getByPlaceholderText("搜租房、求租、二手物品…")
      ).toBeInTheDocument();

      fireEvent.click(screen.getByRole("button", { name: "搜索" }));
      expect(
        screen.queryByPlaceholderText("搜租房、求租、二手物品…")
      ).not.toBeInTheDocument();
    });

    it("debounces typing in the search box and eventually queries with the typed search value", async () => {
      listActiveCategories.mockResolvedValue([]);
      listApprovedPosts.mockResolvedValue({ posts: [], hasNextPage: false });

      renderWithProviders(<HomePage />);
      await screen.findByText("暂无帖子。");
      listApprovedPosts.mockClear();

      openSearch();
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

      openSearch();
      const input = screen.getByPlaceholderText("搜租房、求租、二手物品…");
      fireEvent.change(input, { target: { value: "nothing matches this" } });

      expect(
        await screen.findByText("没有找到相关帖子。", {}, { timeout: 2000 })
      ).toBeInTheDocument();
    });

    it("clears the typed search value when search is closed, reverting to the unfiltered feed", async () => {
      listActiveCategories.mockResolvedValue([]);
      listApprovedPosts.mockResolvedValue({ posts: [], hasNextPage: false });

      renderWithProviders(<HomePage />);
      await screen.findByText("暂无帖子。");

      openSearch();
      fireEvent.change(screen.getByPlaceholderText("搜租房、求租、二手物品…"), {
        target: { value: "sunny room" }
      });
      await waitFor(() => {
        expect(listApprovedPosts).toHaveBeenCalledWith(
          expect.objectContaining({ searchQuery: "sunny room" })
        );
      });

      // 关掉搜索。
      fireEvent.click(screen.getByRole("button", { name: "搜索" }));

      // 再打开一次，应该是空的，不是残留的上次输入。
      openSearch();
      expect(screen.getByPlaceholderText("搜租房、求租、二手物品…")).toHaveValue("");
    });
  });
});
