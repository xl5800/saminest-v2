import { cleanup, fireEvent, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { useListCommunitiesQuery, useSearchCommunityPostsQuery } = vi.hoisted(() => ({
  useListCommunitiesQuery: vi.fn(),
  useSearchCommunityPostsQuery: vi.fn()
}));

vi.mock("../../features/community/use-list-communities-query", () => ({ useListCommunitiesQuery }));
vi.mock("../../features/community/use-search-community-posts-query", () => ({
  useSearchCommunityPostsQuery
}));
// 社区卡片自己的加入/退出逻辑在 browse-community-card 的测试里覆盖，这里只关心
// 搜索页把哪些社区交给它渲染。
vi.mock("../community/browse-community-card", () => ({
  BrowseCommunityCard: ({ community }: { community: { name: string } }) => (
    <div data-testid="community-result">{community.name}</div>
  )
}));
// 防抖直接透传，测试里不用等计时器。
vi.mock("../../utils/use-debounced-value", () => ({
  useDebouncedValue: <T,>(value: T) => value
}));

import { renderWithProviders } from "../../test/render-with-providers";
import { SearchPage } from "./search-page";

const communities = [
  { id: "c-1", name: "DMV 华人社区", slug: "dmv", description: "本地华人讨论", memberCount: 1, isOfficial: true, stateCodes: [] },
  { id: "c-2", name: "DMV 宠物社区", slug: "dmv-pets", description: null, memberCount: 1, isOfficial: false, stateCodes: [] }
];

const post = {
  id: "cp-1",
  postType: "discussion",
  title: "宠物医院推荐",
  body: "想找一家靠谱的宠物医院",
  pinned: false,
  commentCount: 2,
  favoriteCount: 0,
  createdAt: "2026-08-01T00:00:00.000Z",
  authorId: "u-1",
  authorDisplayName: "Alice",
  authorAvatarUrl: null,
  coverImageUrl: null,
  images: [],
  communityName: "DMV 宠物社区",
  communitySlug: "dmv-pets"
};

describe("SearchPage", () => {
  afterEach(() => cleanup());

  beforeEach(() => {
    useListCommunitiesQuery.mockReturnValue({ data: communities, isPending: false, isError: false });
    useSearchCommunityPostsQuery.mockReturnValue({ data: undefined, isPending: true, isError: false });
  });

  it("shows a hint and no results before anything is typed", () => {
    renderWithProviders(<SearchPage />);

    expect(screen.getByRole("searchbox", { name: "搜索社区和帖子" })).toBeInTheDocument();
    expect(screen.getByText("输入关键词，搜索社区和帖子")).toBeInTheDocument();
    expect(screen.queryByTestId("community-result")).not.toBeInTheDocument();
  });

  it("searches both communities and posts with the same keyword", () => {
    useSearchCommunityPostsQuery.mockReturnValue({ data: [post], isPending: false, isError: false });
    renderWithProviders(<SearchPage />);

    fireEvent.change(screen.getByRole("searchbox", { name: "搜索社区和帖子" }), {
      target: { value: "宠物" }
    });

    expect(useSearchCommunityPostsQuery).toHaveBeenLastCalledWith("宠物");
    const communityResults = screen.getAllByTestId("community-result");
    expect(communityResults.map((node) => node.textContent)).toEqual(["DMV 宠物社区"]);
    const postLink = screen.getByRole("link", { name: /宠物医院推荐/ });
    expect(postLink).toHaveAttribute("href", "/community/post/cp-1");
    expect(postLink).toHaveTextContent("Alice");
  });

  it("shows empty messages for each section when nothing matches", () => {
    useSearchCommunityPostsQuery.mockReturnValue({ data: [], isPending: false, isError: false });
    renderWithProviders(<SearchPage />);

    fireEvent.change(screen.getByRole("searchbox", { name: "搜索社区和帖子" }), {
      target: { value: "完全不相关" }
    });

    expect(screen.getByText("没有找到相关社区")).toBeInTheDocument();
    expect(screen.getByText("没有找到相关帖子")).toBeInTheDocument();
  });

  it("shows an error when the post search fails", () => {
    useSearchCommunityPostsQuery.mockReturnValue({ data: undefined, isPending: false, isError: true });
    renderWithProviders(<SearchPage />);

    fireEvent.change(screen.getByRole("searchbox", { name: "搜索社区和帖子" }), {
      target: { value: "x" }
    });

    expect(screen.getByRole("alert")).toHaveTextContent("搜索失败，请稍后重试。");
  });
});
