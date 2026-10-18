import { cleanup, fireEvent, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { useCategoriesQuery, postListMock, navigateMock, hideSplashScreen } = vi.hoisted(() => ({
  useCategoriesQuery: vi.fn(),
  postListMock: vi.fn(),
  navigateMock: vi.fn(),
  hideSplashScreen: vi.fn()
}));

vi.mock("../../app/splash-screen", () => ({ hideSplashScreen }));
vi.mock("../../features/categories/use-categories-query", () => ({ useCategoriesQuery }));
// 列表本身各有测试，这里只验证首页给每个标签传了什么；空状态原样渲染出来，
// 方便验证"还没有工作信息"那段文案。
vi.mock("../../features/posts/post-list", () => ({
  PostList: (props: Record<string, unknown>) => {
    postListMock(props);
    return (
      <div data-testid="post-list" data-variant={String(props.variant)}>
        {props.emptyState as React.ReactNode}
      </div>
    );
  }
}));
vi.mock("../../features/activities/activity-feed", () => ({
  ActivityFeed: () => <div data-testid="activity-feed" />
}));
vi.mock("react-router-dom", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react-router-dom")>();
  return { ...actual, useNavigate: () => navigateMock };
});

import { useSelectedRegionStore } from "../../store/selected-region-store";
import { renderWithProviders } from "../../test/render-with-providers";
import { HOME_TAB_STORAGE_KEY, HomePage } from "./home-page";

const initialRegionState = useSelectedRegionStore.getState();

const CATEGORIES = [
  { id: "cat-rent", slug: "rent", nameZh: "租房" },
  { id: "cat-wanted", slug: "wanted", nameZh: "求租" },
  { id: "cat-used", slug: "used", nameZh: "二手" },
  { id: "cat-hiring", slug: "hiring", nameZh: "招聘" },
  { id: "cat-seeking", slug: "job-seeking", nameZh: "求职" }
];

function lastPostListProps(): Record<string, unknown> {
  return postListMock.mock.calls.at(-1)?.[0] as Record<string, unknown>;
}

describe("HomePage (four category tabs)", () => {
  afterEach(() => {
    cleanup();
  });

  beforeEach(() => {
    window.localStorage.clear();
    // jsdom 没实现 scrollTo；切换标签会回到顶部。
    vi.spyOn(window, "scrollTo").mockImplementation(() => {});
    useSelectedRegionStore.setState(initialRegionState, true);
    useCategoriesQuery.mockReset();
    useCategoriesQuery.mockReturnValue({ data: CATEGORIES, isPending: false, isError: false });
    postListMock.mockReset();
    navigateMock.mockReset();
    hideSplashScreen.mockReset();
  });

  it("shows the region on the left and a search button, with no 华邻 brand and no ＋ / menu buttons", () => {
    useSelectedRegionStore.setState({
      selectedRegion: { stateCode: "VA", stateName: "Virginia", cityId: null, cityName: null }
    });
    renderWithProviders(<HomePage />);

    expect(screen.queryByText("华邻")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "发布" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "菜单" })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "搜索" }));
    expect(navigateMock).toHaveBeenCalledWith("/search");
  });

  it("shows a short Chinese region name (no state code, no 州) on the left", () => {
    useSelectedRegionStore.setState({
      selectedRegion: { stateCode: "VA", stateName: "Virginia", cityId: null, cityName: null }
    });
    renderWithProviders(<HomePage />);

    expect(screen.getByRole("button", { name: "弗吉尼亚" })).toBeInTheDocument();
  });

  it("navigates to the region picker from the region title (placeholder when no region is selected)", () => {
    renderWithProviders(<HomePage />);

    fireEvent.click(screen.getByRole("button", { name: /选择地区/ }));
    expect(navigateMock).toHaveBeenCalledWith("/region-select");
  });

  it("renders the four tabs in order with 招聘求职 selected by default", () => {
    renderWithProviders(<HomePage />);

    const tabs = screen.getAllByRole("tab");
    expect(tabs.map((tab) => tab.textContent)).toEqual(["招聘求职", "房屋租售", "二手闲置", "找搭子"]);
    expect(screen.getByRole("tab", { name: "招聘求职" })).toHaveAttribute("aria-selected", "true");
  });

  it("lists hiring + job-seeking posts together under 全部, in the job format", () => {
    renderWithProviders(<HomePage />);

    expect(lastPostListProps()).toMatchObject({
      variant: "job",
      categoryId: undefined,
      categoryIds: ["cat-hiring", "cat-seeking"]
    });
  });

  it("narrows to a single job category with the 招聘 / 求职 chips", () => {
    renderWithProviders(<HomePage />);

    fireEvent.click(screen.getByRole("button", { name: "求职" }));
    expect(lastPostListProps()).toMatchObject({ categoryId: "cat-seeking", categoryIds: undefined });

    fireEvent.click(screen.getByRole("button", { name: "招聘" }));
    expect(lastPostListProps()).toMatchObject({ categoryId: "cat-hiring" });
  });

  it("offers free publishing from the jobs empty state", () => {
    renderWithProviders(<HomePage />);

    expect(screen.getByText("还没有工作信息，你要招人吗？")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "免费发布" }));
    expect(navigateMock).toHaveBeenCalledWith("/publish?category=hiring");
  });

  it("shows the jobs empty state without querying when the job categories don't exist yet", () => {
    useCategoriesQuery.mockReturnValue({
      data: CATEGORIES.filter((category) => !["hiring", "job-seeking"].includes(category.slug)),
      isPending: false,
      isError: false
    });
    renderWithProviders(<HomePage />);

    expect(postListMock).not.toHaveBeenCalled();
    expect(screen.getByText("还没有工作信息，你要招人吗？")).toBeInTheDocument();
  });

  it("shows rentals as a grid and 求租 as text cards under 房屋租售", () => {
    renderWithProviders(<HomePage />);

    fireEvent.click(screen.getByRole("tab", { name: "房屋租售" }));
    expect(lastPostListProps()).toMatchObject({ categoryId: "cat-rent", variant: "grid" });

    fireEvent.click(screen.getByRole("button", { name: "求租" }));
    expect(lastPostListProps()).toMatchObject({ categoryId: "cat-wanted", variant: "wanted" });
  });

  it("shows used items as a grid and passes the selected state to the list", () => {
    useSelectedRegionStore.setState({
      selectedRegion: { stateCode: "MD", stateName: "Maryland", cityId: null, cityName: null }
    });
    renderWithProviders(<HomePage />);

    fireEvent.click(screen.getByRole("tab", { name: "二手闲置" }));
    expect(lastPostListProps()).toMatchObject({ categoryId: "cat-used", variant: "grid", stateCode: "MD" });
  });

  it("shows the activity feed under 找搭子", () => {
    renderWithProviders(<HomePage />);

    fireEvent.click(screen.getByRole("tab", { name: "找搭子" }));
    expect(screen.getByTestId("activity-feed")).toBeInTheDocument();
  });

  it("remembers the last tab across visits", () => {
    renderWithProviders(<HomePage />);
    fireEvent.click(screen.getByRole("tab", { name: "二手闲置" }));
    expect(window.localStorage.getItem(HOME_TAB_STORAGE_KEY)).toBe("used");
    cleanup();

    renderWithProviders(<HomePage />);
    expect(screen.getByRole("tab", { name: "二手闲置" })).toHaveAttribute("aria-selected", "true");
  });

  it("falls back to 招聘求职 when the stored tab is unknown", () => {
    window.localStorage.setItem(HOME_TAB_STORAGE_KEY, "bogus");
    renderWithProviders(<HomePage />);

    expect(screen.getByRole("tab", { name: "招聘求职" })).toHaveAttribute("aria-selected", "true");
  });

  it("waits for the categories before rendering a list, then hides the splash screen", () => {
    useCategoriesQuery.mockReturnValue({ data: undefined, isPending: true, isError: false });
    renderWithProviders(<HomePage />);

    expect(postListMock).not.toHaveBeenCalled();
    expect(hideSplashScreen).not.toHaveBeenCalled();

    useCategoriesQuery.mockReturnValue({ data: CATEGORIES, isPending: false, isError: false });
    fireEvent.click(screen.getByRole("tab", { name: "房屋租售" }));
    expect(hideSplashScreen).toHaveBeenCalled();
    expect(postListMock).toHaveBeenCalled();
  });

  it("shows an error when the categories fail to load", () => {
    useCategoriesQuery.mockReturnValue({ data: undefined, isPending: false, isError: true });
    renderWithProviders(<HomePage />);

    expect(screen.getByRole("alert")).toHaveTextContent("加载失败");
    expect(hideSplashScreen).toHaveBeenCalled();
  });
});
