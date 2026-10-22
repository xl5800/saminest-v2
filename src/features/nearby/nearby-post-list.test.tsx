import { cleanup, fireEvent, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { listNearbyPostIds, listApprovedPostsByIds } = vi.hoisted(() => ({
  listNearbyPostIds: vi.fn(),
  listApprovedPostsByIds: vi.fn()
}));

vi.mock("../../repositories/nearby-repository", () => ({ listNearbyPostIds }));
vi.mock("../../repositories/posts-repository", () => ({ listApprovedPostsByIds }));

import type { PostFeedItem } from "../../repositories/posts-repository";
import { renderWithProviders } from "../../test/render-with-providers";
import { NearbyPostList } from "./nearby-post-list";

const LOCATION = { latitude: 38.95, longitude: -77.23, label: "McLean", source: "zip" as const, zip: "22102" };

function post(id: string): PostFeedItem {
  return {
    id,
    authorId: `author-${id}`,
    title: `房源 ${id}`,
    priceAmount: 20,
    priceLabel: null,
    currencyCode: "USD",
    locationName: null,
    createdAt: "2026-10-19T00:00:00Z",
    categoryName: "求租",
    authorDisplayName: "Amy",
    authorAvatarUrl: null,
    coverImageUrl: null,
    favoriteCount: 0,
    commentCount: 0,
    posterAge: null,
    posterGender: null,
    categorySlug: "wanted",
    salaryUnit: null,
    employmentType: null,
    jobPerks: []
  };
}

function mockPage(refs: Array<[string, number | null]>) {
  listNearbyPostIds.mockResolvedValueOnce(refs.map(([postId, distanceMiles]) => ({ postId, distanceMiles })));
  listApprovedPostsByIds.mockResolvedValueOnce(refs.map(([id]) => post(id)));
}

// 房屋页距离筛选：按距离的列表（首页二手的用法在 nearby-used-list.test.tsx）。
describe("NearbyPostList", () => {
  beforeEach(() => {
    listNearbyPostIds.mockReset();
    listApprovedPostsByIds.mockReset();
  });

  afterEach(() => {
    cleanup();
  });

  it("asks for newest-first within the radius with the search term, and shows 求租 text cards with distances", async () => {
    mockPage([
      ["a", 3.21],
      ["b", 18],
      ["c", null]
    ]);
    renderWithProviders(
      <NearbyPostList
        location={LOCATION}
        radiusMiles={10}
        categorySlugs={["wanted"]}
        variant="wanted"
        newestFirstWithinRadius
        searchQuery="单间"
        emptyText="附近还没有求租信息"
        onPublishClick={() => {}}
      />
    );

    expect(await screen.findByText("房源 a")).toBeInTheDocument();
    expect(listNearbyPostIds).toHaveBeenCalledWith({
      latitude: 38.95,
      longitude: -77.23,
      categorySlugs: ["wanted"],
      limit: 20,
      offset: 0,
      radiusMiles: 10,
      searchQuery: "单间"
    });
    expect(screen.getByText("约 3.2 英里")).toBeInTheDocument();
    const text = document.body.textContent ?? "";
    const order = ["房源 a", "以下距离超过 10 英里", "房源 b", "以下未标注位置", "房源 c"].map((part) =>
      text.indexOf(part)
    );
    expect(order.every((index) => index >= 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
  });

  it("shows the given empty text with a publish button", async () => {
    mockPage([]);
    const onPublishClick = vi.fn();
    renderWithProviders(
      <NearbyPostList
        location={LOCATION}
        radiusMiles={10}
        categorySlugs={["rent"]}
        emptyText="附近还没有出租房源，欢迎发布第一条"
        onPublishClick={onPublishClick}
      />
    );

    expect(await screen.findByText("附近还没有出租房源，欢迎发布第一条")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "去发布" }));
    expect(onPublishClick).toHaveBeenCalled();
  });
});
