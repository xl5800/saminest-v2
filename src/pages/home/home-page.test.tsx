import { cleanup, fireEvent, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { navigateMock, hideSplashScreen } = vi.hoisted(() => ({
  navigateMock: vi.fn(),
  hideSplashScreen: vi.fn()
}));

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

  it("shows nearby used items below the icons, with a 更多 link to /used", () => {
    renderWithProviders(<HomePage />);

    expect(screen.getByRole("heading", { name: "附近的二手" })).toBeInTheDocument();
    expect(screen.getByTestId("nearby-used-list")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "更多" })).toHaveAttribute("href", "/used");
  });

  it("never opens the location sheet on its own; the location bar opens it", () => {
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
