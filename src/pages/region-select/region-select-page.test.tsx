import { cleanup, fireEvent, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { useCitiesWithStateQuery, useRegionContentCountsQuery, navigateMock } = vi.hoisted(() => ({
  useCitiesWithStateQuery: vi.fn(),
  useRegionContentCountsQuery: vi.fn(),
  navigateMock: vi.fn()
}));

vi.mock("../../features/locations/use-cities-with-state-query", () => ({
  useCitiesWithStateQuery
}));
vi.mock("../../features/locations/use-region-content-counts-query", () => ({
  useRegionContentCountsQuery
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
// 14 条 type = 'city' 行。其余 48 个州（08 号卡新增的全美覆盖）在这份
// mock 里没有任何城市数据，跟生产环境目前的真实情况一致。
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
    useCitiesWithStateQuery.mockReset();
    useRegionContentCountsQuery.mockReset();
    navigateMock.mockReset();
    useSelectedRegionStore.setState(initialRegionState, true);
    localStorage.clear();

    useCitiesWithStateQuery.mockReturnValue({ data: CITIES, isPending: false, isError: false });
    useRegionContentCountsQuery.mockReturnValue({
      data: new Map(),
      isPending: false,
      isError: false
    });
  });

  it("renders the nav-only TopBar with the '地区选择' title and no brand/publish text", () => {
    renderWithProviders(<RegionSelectPage />);

    expect(screen.getByRole("heading", { name: "地区选择" })).toBeInTheDocument();
    expect(screen.queryByText("Saminest")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "发布" })).not.toBeInTheDocument();
  });

  // 08 号卡：全美 50 州 + DC，共 51 项，用英文全名展示（不再是裸露的两字母
  // 缩写）。
  it("renders all 51 states (as full English names) plus the pinned '全美' option at the top", () => {
    renderWithProviders(<RegionSelectPage />);

    expect(screen.getByRole("button", { name: "全美" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Virginia" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Maryland" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "District of Columbia" })).toBeInTheDocument();
    // 一个没有任何城市数据的州（08 号卡新增覆盖），确认它也真的渲染出来了。
    expect(screen.getByRole("button", { name: "California" })).toBeInTheDocument();

    // 顶部"返回"按钮（TopBar nav-only 变体自带的 BackButton）只有一个
    // aria-label，可见 textContent 是空字符串（图标带 aria-hidden），不是
    // 字面文字"返回"，所以过滤时要排除空字符串，不是排除字面量"返回"。
    const nonStateLabels = ["全美", "按热度", "按字母", ""];
    const stateButtons = screen
      .getAllByRole("button")
      .filter((button) => !nonStateLabels.includes(button.textContent ?? ""));
    expect(stateButtons).toHaveLength(51);
  });

  it("shows a chevron-bearing row for multi-city states (VA/MD) and a plain row for the single-city state (DC)", () => {
    renderWithProviders(<RegionSelectPage />);

    const dcRow = screen.getByRole("button", { name: "District of Columbia" });
    const vaRow = screen.getByRole("button", { name: "Virginia" });
    const mdRow = screen.getByRole("button", { name: "Maryland" });
    expect(dcRow.querySelector("svg")).not.toBeInTheDocument();
    expect(vaRow.querySelector("svg")).toBeInTheDocument();
    expect(mdRow.querySelector("svg")).toBeInTheDocument();
  });

  // 08 号卡：其余 47 个没有城市数据的州，直接点击就选中整个州，不再是
  // 06 号卡时期"州列表里压根不存在这种州"（那时列表本身只来自 3 条真实
  // locations 行）。
  it("directly selects a state with no city data (e.g. California) and navigates back, with a null cityId/cityName", () => {
    renderWithProviders(<RegionSelectPage />);

    fireEvent.click(screen.getByRole("button", { name: "California" }));

    expect(useSelectedRegionStore.getState().selectedRegion).toEqual({
      stateCode: "CA",
      stateName: "California",
      cityId: null,
      cityName: null
    });
    expect(navigateMock).toHaveBeenCalledWith(-1);
  });

  it("selects DC's only city directly and navigates back, without drilling down", () => {
    renderWithProviders(<RegionSelectPage />);

    fireEvent.click(screen.getByRole("button", { name: "District of Columbia" }));

    expect(useSelectedRegionStore.getState().selectedRegion).toEqual({
      stateCode: "DC",
      stateName: "District of Columbia",
      cityId: "city-dc",
      cityName: "Washington, DC"
    });
    expect(navigateMock).toHaveBeenCalledWith(-1);
  });

  it("drills into VA's city list on click, then selects a city and navigates back", () => {
    renderWithProviders(<RegionSelectPage />);

    fireEvent.click(screen.getByRole("button", { name: "Virginia" }));

    expect(screen.getByRole("button", { name: "Arlington" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Alexandria" })).toBeInTheDocument();
    // 下钻之后州列表本身（以及"全美"）不再展示。
    expect(screen.queryByRole("button", { name: "District of Columbia" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "全美" })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Arlington" }));

    expect(useSelectedRegionStore.getState().selectedRegion).toEqual({
      stateCode: "VA",
      stateName: "Virginia",
      cityId: "city-arlington",
      cityName: "Arlington"
    });
    expect(navigateMock).toHaveBeenCalledWith(-1);
  });

  it("returns to the state list (not out of the page) when clicking back while drilled down", () => {
    renderWithProviders(<RegionSelectPage />);

    fireEvent.click(screen.getByRole("button", { name: "Virginia" }));
    expect(screen.getByRole("button", { name: "Arlington" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "返回" }));

    expect(screen.getByRole("button", { name: "District of Columbia" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Arlington" })).not.toBeInTheDocument();
    // 没有真的离开这个页面/触发路由导航。
    expect(navigateMock).not.toHaveBeenCalled();
  });

  // 08 号卡：「全美」清除已选地区（06 号卡没有的"取消选择"能力）。
  it("clears the selected region and navigates back when '全美' is clicked", () => {
    useSelectedRegionStore.getState().setSelectedRegion({
      stateCode: "VA",
      stateName: "Virginia",
      cityId: "city-arlington",
      cityName: "Arlington"
    });

    renderWithProviders(<RegionSelectPage />);
    fireEvent.click(screen.getByRole("button", { name: "全美" }));

    expect(useSelectedRegionStore.getState().selectedRegion).toBeNull();
    expect(navigateMock).toHaveBeenCalledWith(-1);
  });

  // 08 号卡：搜索扩展到全部 51 项，不再只匹配已有真实城市数据的地区。
  it("search matches state names/codes too, not just cities, and selecting a matched state (no city data) selects the whole state", () => {
    renderWithProviders(<RegionSelectPage />);

    fireEvent.change(screen.getByPlaceholderText("请输入地址搜索"), {
      target: { value: "california" }
    });

    const match = screen.getByRole("button", { name: "California" });
    expect(match).toBeInTheDocument();
    // 搜索结果视图里也不展示"全美"。
    expect(screen.queryByRole("button", { name: "全美" })).not.toBeInTheDocument();

    fireEvent.click(match);

    expect(useSelectedRegionStore.getState().selectedRegion).toEqual({
      stateCode: "CA",
      stateName: "California",
      cityId: null,
      cityName: null
    });
  });

  it("search also matches a state's two-letter code", () => {
    renderWithProviders(<RegionSelectPage />);

    fireEvent.change(screen.getByPlaceholderText("请输入地址搜索"), {
      target: { value: "wy" }
    });

    expect(screen.getByRole("button", { name: "Wyoming" })).toBeInTheDocument();
  });

  it("filters to matching cities across all states when searching, selecting one writes its own state code", () => {
    renderWithProviders(<RegionSelectPage />);

    fireEvent.change(screen.getByPlaceholderText("请输入地址搜索"), {
      target: { value: "ar" }
    });

    // Arlington 命中；未命中的州行/城市行都不再展示。
    expect(screen.getByRole("button", { name: "Arlington" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Virginia" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Rockville" })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Arlington" }));

    expect(useSelectedRegionStore.getState().selectedRegion).toEqual({
      stateCode: "VA",
      stateName: "Virginia",
      cityId: "city-arlington",
      cityName: "Arlington"
    });
  });

  it("shows an empty-results message when the search matches nothing", () => {
    renderWithProviders(<RegionSelectPage />);

    fireEvent.change(screen.getByPlaceholderText("请输入地址搜索"), {
      target: { value: "no such place anywhere" }
    });

    expect(screen.getByText("没有找到匹配的地区。")).toBeInTheDocument();
  });

  it("re-sorts the currently visible list alphabetically when '按字母' is selected", () => {
    renderWithProviders(<RegionSelectPage />);

    fireEvent.click(screen.getByRole("button", { name: "Virginia" }));
    fireEvent.click(screen.getByRole("button", { name: "按字母" }));

    const cityButtons = screen
      .getAllByRole("button")
      .filter((button) => ["Arlington", "Alexandria"].includes(button.textContent ?? ""));
    expect(cityButtons.map((button) => button.textContent)).toEqual(["Alexandria", "Arlington"]);
  });

  // 08 号卡 8.2：「按热度」按活跃内容数量（活动+帖子）降序排列 51 项州
  // 列表，数量为 0（或并列）的州统一按字母序垫底，不打乱整体顺序。
  it("'按热度' sorts the state list by content count descending, with zero/tied states falling back to alphabetical order at the bottom", () => {
    useRegionContentCountsQuery.mockReturnValue({
      data: new Map([
        ["MD", 2],
        ["VA", 5]
      ]),
      isPending: false,
      isError: false
    });

    renderWithProviders(<RegionSelectPage />);

    const stateNames = [
      "Virginia",
      "Maryland",
      "District of Columbia",
      "Alabama",
      "Wyoming"
    ];
    const orderedNames = screen
      .getAllByRole("button")
      .map((button) => button.textContent)
      .filter((text): text is string => !!text && stateNames.includes(text));

    // VA（5）在最前，MD（2）其次；DC/Alabama/Wyoming 全都是 0，按字母序
    // 排在后面（Alabama < District of Columbia < Wyoming）。
    expect(orderedNames).toEqual([
      "Virginia",
      "Maryland",
      "Alabama",
      "District of Columbia",
      "Wyoming"
    ]);
  });

  it("shows the loading state while either the cities or the content-counts query is pending", () => {
    useRegionContentCountsQuery.mockReturnValue({ data: undefined, isPending: true, isError: false });

    renderWithProviders(<RegionSelectPage />);

    expect(screen.getByRole("status")).toHaveTextContent("加载中…");
  });

  it("shows an error state when either query fails", () => {
    useCitiesWithStateQuery.mockReturnValue({ data: undefined, isPending: false, isError: true });

    renderWithProviders(<RegionSelectPage />);

    expect(screen.getByRole("alert")).toHaveTextContent("地区加载失败，请稍后重试。");
  });
});
