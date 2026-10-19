import { cleanup, fireEvent, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { useCategoriesQuery, postListMock } = vi.hoisted(() => ({
  useCategoriesQuery: vi.fn(),
  postListMock: vi.fn()
}));

vi.mock("../../features/categories/use-categories-query", () => ({ useCategoriesQuery }));
// 列表本身有自己的测试，这里只验证搜索页给 PostList 传了什么。
vi.mock("../../features/posts/post-list", () => ({
  PostList: (props: Record<string, unknown>) => {
    postListMock(props);
    return <div data-testid="post-list" />;
  }
}));
// 防抖直接透传，测试里不用等计时器。
vi.mock("../../utils/use-debounced-value", () => ({
  useDebouncedValue: <T,>(value: T) => value
}));

import { useSelectedRegionStore } from "../../store/selected-region-store";
import { renderWithProviders } from "../../test/render-with-providers";
import { SearchPage } from "./search-page";

const initialRegionState = useSelectedRegionStore.getState();

const CATEGORIES = [
  { id: "cat-rent", slug: "rent", nameZh: "租房" },
  { id: "cat-wanted", slug: "wanted", nameZh: "求租" },
  { id: "cat-used", slug: "used", nameZh: "二手" },
  { id: "cat-hiring", slug: "hiring", nameZh: "招聘" },
  { id: "cat-seeking", slug: "job-seeking", nameZh: "求职" },
  { id: "cat-free", slug: "free", nameZh: "免费物品" }
];

function lastPostListProps(): Record<string, unknown> {
  return postListMock.mock.calls.at(-1)?.[0] as Record<string, unknown>;
}

function typeKeyword(value: string): void {
  fireEvent.change(screen.getByRole("searchbox", { name: "搜索帖子" }), { target: { value } });
}

describe("SearchPage", () => {
  afterEach(() => cleanup());

  beforeEach(() => {
    useSelectedRegionStore.setState(initialRegionState, true);
    useCategoriesQuery.mockReturnValue({ data: CATEGORIES, isPending: false, isError: false });
    postListMock.mockReset();
  });

  it("shows a hint and does not query before anything is typed", () => {
    renderWithProviders(<SearchPage />);

    expect(screen.getByText("输入关键词，搜索招聘、房屋、二手和免费物品")).toBeInTheDocument();
    expect(postListMock).not.toHaveBeenCalled();
  });

  it("searches all classified categories in the selected state", () => {
    useSelectedRegionStore.setState({
      selectedRegion: { stateCode: "VA", stateName: "Virginia", cityId: null, cityName: null }
    });
    renderWithProviders(<SearchPage />);

    expect(screen.getByPlaceholderText("在弗吉尼亚搜索工作、房屋、二手…")).toBeInTheDocument();
    typeKeyword(" 书桌 ");

    expect(lastPostListProps()).toMatchObject({
      variant: "grid",
      searchQuery: "书桌",
      stateCode: "VA",
      categoryIds: ["cat-hiring", "cat-seeking", "cat-rent", "cat-wanted", "cat-used", "cat-free"]
    });
  });

  it("narrows the search to one kind with the chips", () => {
    renderWithProviders(<SearchPage />);
    typeKeyword("餐馆");

    fireEvent.click(screen.getByRole("button", { name: "招聘求职" }));
    expect(lastPostListProps()).toMatchObject({ variant: "job", categoryIds: ["cat-hiring", "cat-seeking"] });

    fireEvent.click(screen.getByRole("button", { name: "房屋租售" }));
    expect(lastPostListProps()).toMatchObject({ variant: "grid", categoryIds: ["cat-rent", "cat-wanted"] });

    fireEvent.click(screen.getByRole("button", { name: "免费物品" }));
    expect(lastPostListProps()).toMatchObject({ categoryIds: ["cat-free"] });
  });

  it("does not query without any category to search in", () => {
    useCategoriesQuery.mockReturnValue({ data: [], isPending: false, isError: false });
    renderWithProviders(<SearchPage />);
    typeKeyword("书桌");

    expect(postListMock).not.toHaveBeenCalled();
    expect(screen.getByText("没有找到相关帖子。")).toBeInTheDocument();
  });
});
