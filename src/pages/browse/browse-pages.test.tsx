import { cleanup, fireEvent, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { useCategoriesQuery, postListMock, navigateMock } = vi.hoisted(() => ({
  useCategoriesQuery: vi.fn(),
  postListMock: vi.fn(),
  navigateMock: vi.fn()
}));

vi.mock("../../features/categories/use-categories-query", () => ({ useCategoriesQuery }));
// 列表本身有自己的测试，这里只验证每个页面给 PostList 传了什么；空状态原样
// 渲染出来，方便验证"还没有工作信息"那段文案。
vi.mock("../../features/posts/post-list", () => ({
  PostList: (props: Record<string, unknown>) => {
    postListMock(props);
    return <div data-testid="post-list">{props.emptyState as React.ReactNode}</div>;
  }
}));
vi.mock("react-router-dom", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react-router-dom")>();
  return { ...actual, useNavigate: () => navigateMock };
});

import { useSelectedRegionStore } from "../../store/selected-region-store";
import { renderWithProviders } from "../../test/render-with-providers";
import { FreePage } from "./free-page";
import { HousingPage } from "./housing-page";
import { JobsPage } from "./jobs-page";
import { UsedPage } from "./used-page";

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

describe("browse pages", () => {
  afterEach(() => {
    cleanup();
  });

  beforeEach(() => {
    useSelectedRegionStore.setState(initialRegionState, true);
    useCategoriesQuery.mockReset();
    useCategoriesQuery.mockReturnValue({ data: CATEGORIES, isPending: false, isError: false });
    postListMock.mockReset();
    navigateMock.mockReset();
  });

  describe("JobsPage", () => {
    it("lists hiring + job-seeking together under 全部, in the job format", () => {
      renderWithProviders(<JobsPage />);

      expect(screen.getByRole("heading", { name: "招聘求职" })).toBeInTheDocument();
      expect(lastPostListProps()).toMatchObject({
        variant: "job",
        categoryId: undefined,
        categoryIds: ["cat-hiring", "cat-seeking"]
      });
    });

    it("narrows to one job category with the chips, and publishes the matching kind", () => {
      renderWithProviders(<JobsPage />);

      fireEvent.click(screen.getByRole("button", { name: "求职" }));
      expect(lastPostListProps()).toMatchObject({ categoryId: "cat-seeking", categoryIds: undefined });
      fireEvent.click(screen.getByRole("button", { name: "发布" }));
      expect(navigateMock).toHaveBeenCalledWith("/publish?category=job-seeking");

      fireEvent.click(screen.getByRole("button", { name: "招聘" }));
      expect(lastPostListProps()).toMatchObject({ categoryId: "cat-hiring" });
    });

    it("offers free publishing from the empty state", () => {
      renderWithProviders(<JobsPage />);

      expect(screen.getByText("还没有工作信息，你要招人吗？")).toBeInTheDocument();
      fireEvent.click(screen.getByRole("button", { name: "免费发布" }));
      expect(navigateMock).toHaveBeenCalledWith("/publish?category=hiring");
    });

    it("shows the empty state without querying when the job categories don't exist yet", () => {
      useCategoriesQuery.mockReturnValue({
        data: CATEGORIES.filter((category) => !["hiring", "job-seeking"].includes(category.slug)),
        isPending: false,
        isError: false
      });
      renderWithProviders(<JobsPage />);

      expect(postListMock).not.toHaveBeenCalled();
      expect(screen.getByText("还没有工作信息，你要招人吗？")).toBeInTheDocument();
    });

    it("waits for the categories, and shows an error when they fail", () => {
      useCategoriesQuery.mockReturnValue({ data: undefined, isPending: true, isError: false });
      renderWithProviders(<JobsPage />);
      expect(postListMock).not.toHaveBeenCalled();
      cleanup();

      useCategoriesQuery.mockReturnValue({ data: undefined, isPending: false, isError: true });
      renderWithProviders(<JobsPage />);
      expect(screen.getByRole("alert")).toHaveTextContent("加载失败");
    });
  });

  describe("HousingPage", () => {
    it("shows rentals as a grid and 求租 as text cards, filtered by the selected state", () => {
      useSelectedRegionStore.setState({
        selectedRegion: { stateCode: "MD", stateName: "Maryland", cityId: null, cityName: null }
      });
      renderWithProviders(<HousingPage />);

      expect(lastPostListProps()).toMatchObject({ categoryId: "cat-rent", variant: "grid", stateCode: "MD" });
      fireEvent.click(screen.getByRole("button", { name: "求租" }));
      expect(lastPostListProps()).toMatchObject({ categoryId: "cat-wanted", variant: "wanted" });
      fireEvent.click(screen.getByRole("button", { name: "发布" }));
      expect(navigateMock).toHaveBeenCalledWith("/publish?category=wanted");
    });
  });

  describe("UsedPage", () => {
    it("shows used items as a grid", () => {
      renderWithProviders(<UsedPage />);

      expect(screen.getByRole("heading", { name: "二手闲置" })).toBeInTheDocument();
      expect(lastPostListProps()).toMatchObject({ categoryId: "cat-used", variant: "grid" });
    });
  });

  // 免费物品任务卡
  describe("FreePage", () => {
    it("shows free items as a grid with a free-publish empty state", () => {
      renderWithProviders(<FreePage />);

      expect(screen.getByRole("heading", { name: "免费物品" })).toBeInTheDocument();
      expect(lastPostListProps()).toMatchObject({ categoryId: "cat-free", variant: "grid" });
      fireEvent.click(screen.getByRole("button", { name: "免费发布" }));
      expect(navigateMock).toHaveBeenCalledWith("/publish?category=free");
    });

    it("shows the empty state without querying when the free category doesn't exist yet", () => {
      useCategoriesQuery.mockReturnValue({
        data: CATEGORIES.filter((category) => category.slug !== "free"),
        isPending: false,
        isError: false
      });
      renderWithProviders(<FreePage />);

      expect(postListMock).not.toHaveBeenCalled();
      expect(screen.getByText("还没有免费物品，你有闲置想送人吗？")).toBeInTheDocument();
    });
  });
});
