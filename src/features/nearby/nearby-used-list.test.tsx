import { cleanup, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { listNearbyPostIds, listApprovedPostsByIds, flags } = vi.hoisted(() => ({
  listNearbyPostIds: vi.fn(),
  listApprovedPostsByIds: vi.fn(),
  flags: { NEARBY_USED_ENABLED: true }
}));

// 这个文件测的是附近功能打开时的行为；最后一个用例测关掉时退回按州显示。
vi.mock("../../config/feature-flags", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../config/feature-flags")>();
  return {
    ...actual,
    get NEARBY_USED_ENABLED() {
      return flags.NEARBY_USED_ENABLED;
    }
  };
});

vi.mock("../../repositories/nearby-repository", () => ({ listNearbyPostIds }));
vi.mock("../../repositories/posts-repository", () => ({ listApprovedPostsByIds }));
// 没设位置时复用 PostList（它自己有测试），这里只确认传了二手分类和当前州。
vi.mock("../posts/post-list", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../posts/post-list")>();
  return {
    ...actual,
    PostList: (props: { categoryId: string; stateCode?: string }) => (
      <div data-testid="post-list" data-category={props.categoryId} data-state={props.stateCode} />
    )
  };
});
vi.mock("../categories/use-categories-query", () => ({
  useCategoriesQuery: () => ({ data: [{ id: "cat-1", slug: "used", nameZh: "二手" }], isError: false })
}));

import type { PostFeedItem } from "../../repositories/posts-repository";
import { useNearbyLocationStore } from "../../store/nearby-location-store";
import { useSelectedRegionStore } from "../../store/selected-region-store";
import { triggerLastIntersectionObserver } from "../../test/setup";
import { renderWithProviders } from "../../test/render-with-providers";
import { NearbyUsedList } from "./nearby-used-list";

function post(id: string): PostFeedItem {
  return {
    id,
    authorId: `author-${id}`,
    title: `二手 ${id}`,
    priceAmount: 20,
    priceLabel: null,
    currencyCode: "USD",
    locationName: null,
    createdAt: "2026-10-19T00:00:00Z",
    categoryName: "二手",
    authorDisplayName: "Amy",
    authorAvatarUrl: null,
    coverImageUrl: null,
    favoriteCount: 0,
    commentCount: 0,
    posterAge: null,
    posterGender: null,
    categorySlug: "used",
    salaryUnit: null,
    employmentType: null,
    jobPerks: []
  };
}

function mockPage(refs: Array<[string, number | null]>) {
  listNearbyPostIds.mockResolvedValueOnce(refs.map(([postId, distanceMiles]) => ({ postId, distanceMiles })));
  listApprovedPostsByIds.mockResolvedValueOnce(refs.map(([id]) => post(id)));
}

describe("NearbyUsedList", () => {
  beforeEach(() => {
    listNearbyPostIds.mockReset();
    listApprovedPostsByIds.mockReset();
    flags.NEARBY_USED_ENABLED = true;
    useNearbyLocationStore.setState({
      location: { latitude: 39.08, longitude: -77.15, label: "Rockville", source: "zip", zip: "20850" },
      radiusMiles: 50
    });
  });

  afterEach(() => {
    cleanup();
  });

  it("falls back to used items in the selected state when no location is set", () => {
    useNearbyLocationStore.setState({ location: null });
    useSelectedRegionStore.setState({
      selectedRegion: { stateCode: "VA", stateName: "Virginia", cityId: null, cityName: null }
    });
    renderWithProviders(<NearbyUsedList />);

    const list = screen.getByTestId("post-list");
    expect(list).toHaveAttribute("data-category", "cat-1");
    expect(list).toHaveAttribute("data-state", "VA");
    expect(listNearbyPostIds).not.toHaveBeenCalled();
  });

  it("ignores a saved location and shows used items by state while the nearby feature is off", () => {
    flags.NEARBY_USED_ENABLED = false;
    renderWithProviders(<NearbyUsedList />);

    expect(screen.getByTestId("post-list")).toHaveAttribute("data-category", "cat-1");
    expect(listNearbyPostIds).not.toHaveBeenCalled();
  });

  it("lists by distance with distance labels, a divider past the radius, and one before posts without a zip", async () => {
    mockPage([
      ["near", 0.4],
      ["mid", 12.34],
      ["far", 61.2],
      ["nozip", null]
    ]);
    renderWithProviders(<NearbyUsedList />);

    expect(await screen.findByText("二手 near")).toBeInTheDocument();
    expect(listNearbyPostIds).toHaveBeenCalledWith({
      latitude: 39.08,
      longitude: -77.15,
      categorySlugs: ["used"],
      limit: 20,
      offset: 0
    });
    expect(screen.getByText(/ · 1 英里内$/)).toBeInTheDocument();
    expect(screen.getByText(/ · 约 12\.3 英里$/)).toBeInTheDocument();
    expect(screen.getByText(/ · 约 61\.2 英里$/)).toBeInTheDocument();

    const text = document.body.textContent ?? "";
    const order = ["二手 mid", "以下距离超过 50 英里", "二手 far", "以下未标注位置", "二手 nozip"].map((part) =>
      text.indexOf(part)
    );
    expect(order.every((index) => index >= 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
  });

  it("puts the divider at the chosen radius", async () => {
    useNearbyLocationStore.setState({ radiusMiles: 10 });
    mockPage([
      ["near", 3],
      ["mid", 12]
    ]);
    renderWithProviders(<NearbyUsedList />);

    expect(await screen.findByText("以下距离超过 10 英里")).toBeInTheDocument();
    expect(screen.queryByText("以下未标注位置")).not.toBeInTheDocument();
  });

  it("loads the next page from the next offset when the bottom is reached", async () => {
    mockPage(Array.from({ length: 20 }, (_, index) => [`p${index}`, index] as [string, number]));
    mockPage([["last", 99]]);
    renderWithProviders(<NearbyUsedList />);

    expect(await screen.findByText("二手 p0")).toBeInTheDocument();
    triggerLastIntersectionObserver(true);

    expect(await screen.findByText("二手 last")).toBeInTheDocument();
    expect(listNearbyPostIds).toHaveBeenLastCalledWith(expect.objectContaining({ offset: 20 }));
  });

  it("shows an invitation to publish when there is nothing yet", async () => {
    listNearbyPostIds.mockResolvedValue([]);
    listApprovedPostsByIds.mockResolvedValue([]);
    renderWithProviders(<NearbyUsedList />);

    expect(await screen.findByText("附近还没有二手闲置，欢迎发布第一条")).toBeInTheDocument();
  });

  it("shows an error when loading fails", async () => {
    listNearbyPostIds.mockRejectedValue(new Error("boom"));
    renderWithProviders(<NearbyUsedList />);

    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("加载失败，请稍后重试。"));
  });
});
