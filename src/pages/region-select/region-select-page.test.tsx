import { cleanup, fireEvent, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { useActivityRegionsQuery, useCitiesWithStateQuery, navigateMock } = vi.hoisted(() => ({
  useActivityRegionsQuery: vi.fn(),
  useCitiesWithStateQuery: vi.fn(),
  navigateMock: vi.fn()
}));

vi.mock("../../features/locations/use-activity-regions-query", () => ({
  useActivityRegionsQuery
}));
vi.mock("../../features/locations/use-cities-with-state-query", () => ({
  useCitiesWithStateQuery
}));
vi.mock("react-router-dom", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react-router-dom")>();
  return { ...actual, useNavigate: () => navigateMock };
});

import { renderWithProviders } from "../../test/render-with-providers";
import { useSelectedRegionStore } from "../../store/selected-region-store";
import { RegionSelectPage } from "./region-select-page";

// DC 只有 1 个城市（单一地区的州，直接选中），VA/MD 各有多个（下钻）——
// 跟真实种子数据的分布一致，见 locations-repository.ts / migration 里的
// 14 条 type = 'city' 行。
const STATES = [
  { id: "state-dc", name: "DC" },
  { id: "state-va", name: "VA" },
  { id: "state-md", name: "MD" }
];

const CITIES = [
  { id: "city-dc", name: "Washington, DC", stateCode: "DC" },
  { id: "city-arlington", name: "Arlington", stateCode: "VA" },
  { id: "city-alexandria", name: "Alexandria", stateCode: "VA" },
  { id: "city-rockville", name: "Rockville", stateCode: "MD" },
  { id: "city-bethesda", name: "Bethesda", stateCode: "MD" }
];

const initialRegionState = useSelectedRegionStore.getState();

describe("RegionSelectPage", () => {
  afterEach(() => {
    cleanup();
  });

  beforeEach(() => {
    useActivityRegionsQuery.mockReset();
    useCitiesWithStateQuery.mockReset();
    navigateMock.mockReset();
    useSelectedRegionStore.setState(initialRegionState, true);
    localStorage.clear();

    useActivityRegionsQuery.mockReturnValue({ data: STATES, isPending: false, isError: false });
    useCitiesWithStateQuery.mockReturnValue({ data: CITIES, isPending: false, isError: false });
  });

  it("renders the nav-only TopBar with the '地区选择' title and no brand/publish text", () => {
    renderWithProviders(<RegionSelectPage />);

    expect(screen.getByRole("heading", { name: "地区选择" })).toBeInTheDocument();
    expect(screen.queryByText("Saminest")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "发布" })).not.toBeInTheDocument();
  });

  it("shows a chevron-bearing row for multi-city states (VA/MD) and a plain row for the single-city state (DC)", () => {
    renderWithProviders(<RegionSelectPage />);

    const dcRow = screen.getByRole("button", { name: "DC" });
    const vaRow = screen.getByRole("button", { name: "VA" });
    const mdRow = screen.getByRole("button", { name: "MD" });
    expect(dcRow.querySelector("svg")).not.toBeInTheDocument();
    expect(vaRow.querySelector("svg")).toBeInTheDocument();
    expect(mdRow.querySelector("svg")).toBeInTheDocument();
  });

  it("selects DC's only city directly and navigates back, without drilling down", () => {
    renderWithProviders(<RegionSelectPage />);

    fireEvent.click(screen.getByRole("button", { name: "DC" }));

    expect(useSelectedRegionStore.getState().selectedRegion).toEqual({
      cityId: "city-dc",
      cityName: "Washington, DC",
      stateCode: "DC"
    });
    expect(navigateMock).toHaveBeenCalledWith(-1);
  });

  it("drills into VA's city list on click, then selects a city and navigates back", () => {
    renderWithProviders(<RegionSelectPage />);

    fireEvent.click(screen.getByRole("button", { name: "VA" }));

    expect(screen.getByRole("button", { name: "Arlington" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Alexandria" })).toBeInTheDocument();
    // 下钻之后州列表本身不再展示。
    expect(screen.queryByRole("button", { name: "DC" })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Arlington" }));

    expect(useSelectedRegionStore.getState().selectedRegion).toEqual({
      cityId: "city-arlington",
      cityName: "Arlington",
      stateCode: "VA"
    });
    expect(navigateMock).toHaveBeenCalledWith(-1);
  });

  it("returns to the state list (not out of the page) when clicking back while drilled down", () => {
    renderWithProviders(<RegionSelectPage />);

    fireEvent.click(screen.getByRole("button", { name: "VA" }));
    expect(screen.getByRole("button", { name: "Arlington" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "返回" }));

    expect(screen.getByRole("button", { name: "DC" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Arlington" })).not.toBeInTheDocument();
    // 没有真的离开这个页面/触发路由导航。
    expect(navigateMock).not.toHaveBeenCalled();
  });

  it("filters to matching cities across all states when searching, selecting one writes its own state code", () => {
    renderWithProviders(<RegionSelectPage />);

    fireEvent.change(screen.getByPlaceholderText("请输入地址搜索"), {
      target: { value: "ar" }
    });

    // Arlington 命中；未命中的州行/城市行都不再展示。
    expect(screen.getByRole("button", { name: "Arlington" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "VA" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Rockville" })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Arlington" }));

    expect(useSelectedRegionStore.getState().selectedRegion).toEqual({
      cityId: "city-arlington",
      cityName: "Arlington",
      stateCode: "VA"
    });
  });

  it("shows an empty-results message when the search matches nothing", () => {
    renderWithProviders(<RegionSelectPage />);

    fireEvent.change(screen.getByPlaceholderText("请输入地址搜索"), {
      target: { value: "no such place" }
    });

    expect(screen.getByText("没有找到匹配的地区。")).toBeInTheDocument();
  });

  it("re-sorts the currently visible list alphabetically when '按字母' is selected", () => {
    renderWithProviders(<RegionSelectPage />);

    fireEvent.click(screen.getByRole("button", { name: "VA" }));
    fireEvent.click(screen.getByRole("button", { name: "按字母" }));

    const cityButtons = screen
      .getAllByRole("button")
      .filter((button) => ["Arlington", "Alexandria"].includes(button.textContent ?? ""));
    expect(cityButtons.map((button) => button.textContent)).toEqual(["Alexandria", "Arlington"]);
  });

  it("shows the loading state while either query is pending", () => {
    useActivityRegionsQuery.mockReturnValue({ data: undefined, isPending: true, isError: false });

    renderWithProviders(<RegionSelectPage />);

    expect(screen.getByRole("status")).toHaveTextContent("加载中…");
  });

  it("shows an error state when either query fails", () => {
    useCitiesWithStateQuery.mockReturnValue({ data: undefined, isPending: false, isError: true });

    renderWithProviders(<RegionSelectPage />);

    expect(screen.getByRole("alert")).toHaveTextContent("地区加载失败，请稍后重试。");
  });
});
