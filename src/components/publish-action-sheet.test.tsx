import { cleanup, fireEvent, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { navigateMock } = vi.hoisted(() => ({ navigateMock: vi.fn() }));

vi.mock("react-router-dom", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react-router-dom")>();
  return { ...actual, useNavigate: () => navigateMock };
});

import { useSelectedRegionStore } from "../store/selected-region-store";
import { renderWithProviders } from "../test/render-with-providers";
import { PublishActionSheet } from "./publish-action-sheet";

const initialRegionState = useSelectedRegionStore.getState();

function optionButtons() {
  return screen.getAllByRole("button").filter((button) => button.getAttribute("aria-label") !== "关闭");
}

describe("PublishActionSheet", () => {
  afterEach(() => {
    cleanup();
  });

  beforeEach(() => {
    navigateMock.mockReset();
    useSelectedRegionStore.setState(initialRegionState, true);
  });

  // 首页图标入口改版：四列图标网格。
  it("renders the eight publish options in a fixed order, with 社区帖子 first", () => {
    renderWithProviders(<PublishActionSheet onClose={vi.fn()} />);

    expect(optionButtons().map((button) => button.textContent)).toEqual([
      "社区帖子",
      "招聘",
      "求职",
      "房屋出租",
      "求租",
      "二手闲置",
      "免费送",
      "找搭子"
    ]);
  });

  it("titles the sheet with the selected region, falling back to 选择发布类型", () => {
    renderWithProviders(<PublishActionSheet onClose={vi.fn()} />);
    expect(screen.getByRole("heading", { name: "选择发布类型" })).toBeInTheDocument();
    cleanup();

    useSelectedRegionStore.setState({
      selectedRegion: { stateCode: "VA", stateName: "Virginia", cityId: null, cityName: null }
    });
    renderWithProviders(<PublishActionSheet onClose={vi.fn()} />);
    expect(screen.getByRole("heading", { name: "发布到弗吉尼亚" })).toBeInTheDocument();
  });

  // 首页图标改灰任务卡：八个图标都是浅灰底、深灰图标，没有哪个单独用蓝色突出。
  it("shows every option with the same grey icon tile, none highlighted in blue", () => {
    renderWithProviders(<PublishActionSheet onClose={vi.fn()} />);

    for (const button of optionButtons()) {
      const tile = button.querySelector("span");
      expect(tile).toHaveClass("bg-field", "text-text-body");
      expect(tile?.className).not.toContain("primary");
    }
  });

  it.each([
    ["社区帖子", "/community/new"],
    ["招聘", "/publish?category=hiring"],
    ["求职", "/publish?category=job-seeking"],
    ["房屋出租", "/publish?category=rent"],
    ["求租", "/publish?category=wanted"],
    ["二手闲置", "/publish?category=used"],
    ["免费送", "/publish?category=free"],
    ["找搭子", "/activities/new"]
  ])("navigates to the right form when %s is chosen, and closes once", (label, to) => {
    const onClose = vi.fn();
    renderWithProviders(<PublishActionSheet onClose={onClose} />);

    fireEvent.click(screen.getByRole("button", { name: label }));

    expect(navigateMock).toHaveBeenCalledWith(to);
    // 只调用一次：选项按钮的点击没有冒泡到背景再关一次。
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("closes via the round × button, the backdrop, or Escape", () => {
    const onClose = vi.fn();
    renderWithProviders(<PublishActionSheet onClose={onClose} />);

    fireEvent.click(screen.getByRole("button", { name: "关闭" }));
    fireEvent.click(screen.getByRole("dialog", { name: "选择发布类型" }));
    fireEvent.keyDown(window, { key: "Escape" });

    expect(onClose).toHaveBeenCalledTimes(3);
  });
});
