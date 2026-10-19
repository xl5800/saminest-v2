import { cleanup, fireEvent, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { navigateMock, hideSplashScreen, flags } = vi.hoisted(() => ({
  navigateMock: vi.fn(),
  hideSplashScreen: vi.fn(),
  flags: { NEARBY_USED_ENABLED: false }
}));

// 功能开关：附近功能默认关着（首页精简），单独几个用例打开它测位置条。
vi.mock("../../config/feature-flags", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../config/feature-flags")>();
  return {
    ...actual,
    get NEARBY_USED_ENABLED() {
      return flags.NEARBY_USED_ENABLED;
    }
  };
});

vi.mock("../../app/splash-screen", () => ({ hideSplashScreen }));
// 附近的二手列表和选位置弹层自己有测试（features/nearby/），这里只确认首页放了它们。
vi.mock("../../features/nearby/nearby-used-list", () => ({
  NearbyUsedList: () => <div data-testid="nearby-used-list" />
}));
vi.mock("../../features/nearby/nearby-location-sheet", () => ({
  NearbyLocationSheet: () => <div role="dialog" aria-label="选择位置" />
}));
vi.mock("react-router-dom", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react-router-dom")>();
  return { ...actual, useNavigate: () => navigateMock };
});

import { useSelectedRegionStore } from "../../store/selected-region-store";
import { renderWithProviders } from "../../test/render-with-providers";
import { HomePage } from "./home-page";

const initialRegionState = useSelectedRegionStore.getState();

describe("HomePage (icon entries)", () => {
  afterEach(() => {
    cleanup();
  });

  beforeEach(() => {
    useSelectedRegionStore.setState(initialRegionState, true);
    navigateMock.mockReset();
    hideSplashScreen.mockReset();
    flags.NEARBY_USED_ENABLED = false;
  });

  it("shows a short Chinese region name with a location icon, and a search button, with no brand", () => {
    useSelectedRegionStore.setState({
      selectedRegion: { stateCode: "VA", stateName: "Virginia", cityId: null, cityName: null }
    });
    renderWithProviders(<HomePage />);

    const region = screen.getByRole("button", { name: "弗吉尼亚" });
    expect(region.querySelector("svg.lucide-map-pin")).not.toBeNull();
    expect(screen.queryByText("华邻")).not.toBeInTheDocument();

    fireEvent.click(region);
    expect(navigateMock).toHaveBeenCalledWith("/region-select");
    fireEvent.click(screen.getByRole("button", { name: "搜索" }));
    expect(navigateMock).toHaveBeenCalledWith("/search");
  });

  it("links the five icon entries to their own pages, in order", () => {
    renderWithProviders(<HomePage />);

    const entries = within(screen.getByRole("navigation", { name: "分类入口" })).getAllByRole("link");
    expect(entries.map((link) => [link.textContent, link.getAttribute("href")])).toEqual([
      ["招聘求职", "/jobs"],
      ["房屋租售", "/housing"],
      ["二手闲置", "/used"],
      ["免费物品", "/free"],
      ["找搭子", "/activities"]
    ]);
  });

  it("shows used items right below the icons, with no heading, 更多 link or location bar", () => {
    renderWithProviders(<HomePage />);

    expect(screen.getByTestId("nearby-used-list")).toBeInTheDocument();
    expect(screen.queryByRole("heading")).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "更多" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /显示附近的二手/ })).not.toBeInTheDocument();
  });

  it("uses grey icon tiles instead of blue ones", () => {
    renderWithProviders(<HomePage />);

    const tile = screen.getByRole("link", { name: "招聘求职" }).querySelector("span");
    expect(tile).toHaveClass("bg-field", "text-text-body");
    expect(tile).not.toHaveClass("text-primary");
  });

  it("with the nearby feature on: never opens the location sheet on its own; the location bar opens it", () => {
    flags.NEARBY_USED_ENABLED = true;
    useSelectedRegionStore.setState({
      selectedRegion: { stateCode: "VA", stateName: "Virginia", cityId: null, cityName: null }
    });
    renderWithProviders(<HomePage />);

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /显示附近的二手/ }));
    expect(screen.getByRole("dialog", { name: "选择位置" })).toBeInTheDocument();
  });

  it("hides the splash screen right away (nothing to wait for)", () => {
    renderWithProviders(<HomePage />);
    expect(hideSplashScreen).toHaveBeenCalled();
  });
});
