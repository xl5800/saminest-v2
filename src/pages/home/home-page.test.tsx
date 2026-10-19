import { cleanup, fireEvent, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { navigateMock, hideSplashScreen } = vi.hoisted(() => ({
  navigateMock: vi.fn(),
  hideSplashScreen: vi.fn()
}));

vi.mock("../../app/splash-screen", () => ({ hideSplashScreen }));
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

  it("links the four icon entries to their own pages, in order", () => {
    renderWithProviders(<HomePage />);

    const entries = screen.getAllByRole("link");
    expect(entries.map((link) => [link.textContent, link.getAttribute("href")])).toEqual([
      ["招聘求职", "/jobs"],
      ["房屋租售", "/housing"],
      ["二手闲置", "/used"],
      ["找搭子", "/activities"]
    ]);
  });

  it("hides the splash screen right away (nothing to wait for)", () => {
    renderWithProviders(<HomePage />);
    expect(hideSplashScreen).toHaveBeenCalled();
  });
});
