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
import { useSelectedRegionStore } from "../../store/selected-region-store";
import { HomePage } from "./home-page";

const initialRegionState = useSelectedRegionStore.getState();

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
    useSelectedRegionStore.setState(initialRegionState, true);
    localStorage.clear();
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
      "/?category=rent"
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
    it("renders only the 'Saminest' brand name with no stray state-name text when no region has been selected yet", () => {
      listActiveCategories.mockResolvedValue([]);
      listApprovedPosts.mockResolvedValue({ posts: [], hasNextPage: false });

      renderWithProviders(<HomePage />);

      expect(screen.getByText("Saminest")).toBeInTheDocument();
      expect(screen.queryByText("·")).not.toBeInTheDocument();
    });

    // 06 号卡：地区选择页写入的 useSelectedRegionStore 现在是首页地区文案的
    // 真实数据源，不再是写死的 null——见 home-page.tsx 顶部注释。08 号卡：
    // 展示格式从"裸露的 stateCode"改成 formatRegionLabel 的两种情形。
    it("renders '{cityName}, {stateCode}' when a DMV city has been selected (has real city data)", () => {
      listActiveCategories.mockResolvedValue([]);
      listApprovedPosts.mockResolvedValue({ posts: [], hasNextPage: false });
      useSelectedRegionStore.getState().setSelectedRegion({
        stateCode: "VA",
        stateName: "Virginia",
        cityId: "loc-arlington",
        cityName: "Arlington"
      });

      renderWithProviders(<HomePage />);

      expect(screen.getByText("Arlington, VA")).toBeInTheDocument();
      expect(screen.getByText("Saminest")).toBeInTheDocument();
    });

    // 08 号卡：全美 50 州里大多数州没有城市数据，直接选中整个州时没有
    // cityName，胶囊第二行应该退回展示州名。12 号卡：格式从英文全名统一
    // 改成"缩写 + 中文州名"（如"CA 加利福尼亚州"）。
    it("renders '<code> <中文州名>' when a state with no city data has been selected directly", () => {
      listActiveCategories.mockResolvedValue([]);
      listApprovedPosts.mockResolvedValue({ posts: [], hasNextPage: false });
      useSelectedRegionStore.getState().setSelectedRegion({
        stateCode: "CA",
        stateName: "California",
        cityId: null,
        cityName: null
      });

      renderWithProviders(<HomePage />);

      expect(screen.getByText("CA 加利福尼亚州")).toBeInTheDocument();
      expect(screen.queryByText("California")).not.toBeInTheDocument();
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

  // 03 号卡（category-tab）：分类 Tab 页的 tile / CategoryNav 的分类 Chips
  // 现在都统一导航到 /?category=<slug>，首页自己读这个查询参数筛选，不再
  // 有独立的 /category/:slug 详情页，见 category-nav.tsx / categories-page.tsx
  // 的改动。
  describe("category filter (?category=<slug>)", () => {
    it("filters the post list by the resolved categoryId when landing on /?category=<slug>", async () => {
      listActiveCategories.mockResolvedValue([
        { id: "cat-1", slug: "rent", nameZh: "租房" }
      ]);
      listApprovedPosts.mockResolvedValue({ posts: [], hasNextPage: false });

      renderWithProviders(<HomePage />, { initialEntries: ["/?category=rent"] });

      await waitFor(() => {
        expect(listApprovedPosts).toHaveBeenCalledWith(
          expect.objectContaining({ categoryId: "cat-1" })
        );
      });
    });

    it("marks the matching CategoryNav chip as active via aria-current when a ?category= param is present", async () => {
      listActiveCategories.mockResolvedValue([
        { id: "cat-1", slug: "rent", nameZh: "租房" }
      ]);
      listApprovedPosts.mockResolvedValue({ posts: [], hasNextPage: false });

      renderWithProviders(<HomePage />, { initialEntries: ["/?category=rent"] });

      expect(await screen.findByRole("link", { name: "租房" })).toHaveAttribute(
        "aria-current",
        "page"
      );
      expect(screen.getByRole("link", { name: "推荐" })).not.toHaveAttribute("aria-current");
    });

    it("queries with no category filter when there is no ?category= param (unchanged default browsing state)", async () => {
      listActiveCategories.mockResolvedValue([
        { id: "cat-1", slug: "rent", nameZh: "租房" }
      ]);
      listApprovedPosts.mockResolvedValue({ posts: [], hasNextPage: false });

      renderWithProviders(<HomePage />);

      await waitFor(() => {
        expect(listApprovedPosts).toHaveBeenCalledWith(
          expect.objectContaining({ categoryId: undefined })
        );
      });
    });

    it("does not filter (categoryId undefined) when the ?category= slug doesn't match any known category yet (categories still loading)", async () => {
      listActiveCategories.mockReturnValue(new Promise(() => {}));
      listApprovedPosts.mockResolvedValue({ posts: [], hasNextPage: false });

      renderWithProviders(<HomePage />, { initialEntries: ["/?category=rent"] });

      await waitFor(() => {
        expect(listApprovedPosts).toHaveBeenCalledWith(
          expect.objectContaining({ categoryId: undefined })
        );
      });
    });
  });

  // 08 号卡：首页信息流按 useSelectedRegionStore 选中的州筛选。
  describe("region filter (useSelectedRegionStore)", () => {
    it("queries posts with no stateCode filter when no region has been selected", async () => {
      listActiveCategories.mockResolvedValue([]);
      listApprovedPosts.mockResolvedValue({ posts: [], hasNextPage: false });

      renderWithProviders(<HomePage />);

      await waitFor(() => {
        expect(listApprovedPosts).toHaveBeenCalledWith(
          expect.objectContaining({ stateCode: undefined })
        );
      });
    });

    it("queries posts with the selected region's stateCode once one has been chosen", async () => {
      listActiveCategories.mockResolvedValue([]);
      listApprovedPosts.mockResolvedValue({ posts: [], hasNextPage: false });
      useSelectedRegionStore.getState().setSelectedRegion({
        stateCode: "CA",
        stateName: "California",
        cityId: null,
        cityName: null
      });

      renderWithProviders(<HomePage />);

      await waitFor(() => {
        expect(listApprovedPosts).toHaveBeenCalledWith(
          expect.objectContaining({ stateCode: "CA" })
        );
      });
    });

    // 08 号卡 8.4：选中一个没有内容的州之后，信息流区域展示"这个地区还没有
    // 内容"的空状态，点"去发布"复用首页已有的 PublishActionSheet（跟顶部
    // "＋"图标同一个开关），不是另起一个入口。
    it("shows the region empty state with a '去发布' button that opens the same PublishActionSheet as the '+' icon, when the selected region has no content", async () => {
      listActiveCategories.mockResolvedValue([]);
      listApprovedPosts.mockResolvedValue({ posts: [], hasNextPage: false });
      useSelectedRegionStore.getState().setSelectedRegion({
        stateCode: "CA",
        stateName: "California",
        cityId: null,
        cityName: null
      });

      renderWithProviders(<HomePage />);

      expect(
        await screen.findByText("这个地区还没有内容，欢迎发布第一条")
      ).toBeInTheDocument();
      expect(screen.queryByText("暂无帖子。")).not.toBeInTheDocument();

      fireEvent.click(screen.getByRole("button", { name: "去发布" }));

      expect(await screen.findByRole("dialog", { name: "选择发布类型" })).toBeInTheDocument();
    });

    it("falls back to the generic '暂无帖子。' empty state when no region is selected", async () => {
      listActiveCategories.mockResolvedValue([]);
      listApprovedPosts.mockResolvedValue({ posts: [], hasNextPage: false });

      renderWithProviders(<HomePage />);

      expect(await screen.findByText("暂无帖子。")).toBeInTheDocument();
      expect(
        screen.queryByText("这个地区还没有内容，欢迎发布第一条")
      ).not.toBeInTheDocument();
    });
  });
});
