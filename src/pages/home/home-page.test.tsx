import { cleanup, fireEvent, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { useMyCommunitiesQuery, useCommunityPostsInfiniteQuery, navigateMock } = vi.hoisted(() => ({
  useMyCommunitiesQuery: vi.fn(),
  useCommunityPostsInfiniteQuery: vi.fn(),
  navigateMock: vi.fn()
}));

vi.mock("../../features/community/use-my-communities-query", () => ({ useMyCommunitiesQuery }));
vi.mock("../../features/community/use-community-posts-query", () => ({
  useCommunityPostsInfiniteQuery
}));
// 收藏按钮自己的 hook 会打 Supabase，这里只验证首页把它放进了操作行。
vi.mock("../../components/community-post-favorite-button", () => ({
  CommunityPostFavoriteButton: ({ communityPostId }: { communityPostId: string }) => (
    <button type="button" aria-label="收藏" data-post-id={communityPostId} />
  )
}));
vi.mock("react-router-dom", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react-router-dom")>();
  return { ...actual, useNavigate: () => navigateMock };
});

import { useAuthStore } from "../../store/auth-store";
import { useSelectedRegionStore } from "../../store/selected-region-store";
import { renderWithProviders } from "../../test/render-with-providers";
import { HomePage } from "./home-page";

const initialAuthState = useAuthStore.getState();
const initialRegionState = useSelectedRegionStore.getState();

const samplePost = {
  id: "cp-1",
  postType: "question",
  title: "有人去过 Tysons 吗",
  body: "周末想去逛逛，求推荐",
  pinned: false,
  commentCount: 3,
  favoriteCount: 5,
  createdAt: "2026-08-01T00:00:00.000Z",
  authorId: "user-2",
  authorDisplayName: "Bob",
  authorAvatarUrl: null,
  coverImageUrl: null as string | null,
  images: [] as string[],
  communityName: "DMV 宠物社区",
  communitySlug: "dmv-pets"
};

function joined(id: string, slug: string, name: string) {
  return {
    id,
    slug,
    name,
    description: null,
    memberCount: 1,
    isOfficial: false,
    stateCodes: ["DC", "MD", "VA"]
  };
}

function postsResult(overrides: Record<string, unknown> = {}) {
  return {
    data: { pages: [{ posts: [samplePost], hasNextPage: false }] },
    isPending: false,
    isError: false,
    fetchNextPage: vi.fn(),
    hasNextPage: false,
    isFetchingNextPage: false,
    ...overrides
  };
}

describe("HomePage (community aggregate feed)", () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  beforeEach(() => {
    useAuthStore.setState(initialAuthState, true);
    useSelectedRegionStore.setState(initialRegionState, true);
    localStorage.clear();
    navigateMock.mockReset();
    useMyCommunitiesQuery.mockReset();
    useCommunityPostsInfiniteQuery.mockReset();

    // 默认：游客，没有已加入列表（useMyCommunitiesQuery 在没有 userId 时不发请求）。
    useMyCommunitiesQuery.mockReturnValue({ data: undefined, isError: false });
    useCommunityPostsInfiniteQuery.mockReturnValue(postsResult());
  });

  function loginAs(userId: string): void {
    useAuthStore.getState().setSession({ user: { id: userId } } as never);
  }

  describe("top bar (TopBar home variant)", () => {
    it("renders the 'Saminest' brand name with no stray separator when no region has been selected", () => {
      renderWithProviders(<HomePage />);

      expect(screen.getByText("Saminest")).toBeInTheDocument();
      expect(screen.queryByText("·")).not.toBeInTheDocument();
    });

    it("renders '{cityName}, {stateCode}' for a selected DMV city and navigates to /region-select when the region button is clicked", () => {
      useSelectedRegionStore.getState().setSelectedRegion({
        stateCode: "VA",
        stateName: "Virginia",
        cityId: "loc-arlington",
        cityName: "Arlington"
      });

      renderWithProviders(<HomePage />);

      fireEvent.click(screen.getByText("Arlington, VA"));
      expect(navigateMock).toHaveBeenCalledWith("/region-select");
    });

    it("renders '<code> <中文州名>' when a state with no city data has been selected", () => {
      useSelectedRegionStore.getState().setSelectedRegion({
        stateCode: "CA",
        stateName: "California",
        cityId: null,
        cityName: null
      });

      renderWithProviders(<HomePage />);

      expect(screen.getByText("CA 加利福尼亚州")).toBeInTheDocument();
    });

    it("opens the '选择发布类型' action sheet when the ＋ icon is clicked", async () => {
      renderWithProviders(<HomePage />);

      fireEvent.click(screen.getByRole("button", { name: "发布" }));

      expect(await screen.findByRole("dialog", { name: "选择发布类型" })).toBeInTheDocument();
    });

    it("navigates to the site-wide search page /search from the search icon", () => {
      renderWithProviders(<HomePage />);

      fireEvent.click(screen.getByRole("button", { name: "搜索" }));

      expect(navigateMock).toHaveBeenCalledWith("/search");
    });

    it("shows the fixed '推荐' tab", () => {
      renderWithProviders(<HomePage />);

      expect(screen.getByText("推荐")).toBeInTheDocument();
    });
  });

  describe("feed scope (personalised first, all communities as the fallback)", () => {
    it('queries ALL communities for a logged-out visitor and shows the join-a-community banner linking to /community', () => {
      renderWithProviders(<HomePage />);

      expect(useCommunityPostsInfiniteQuery).toHaveBeenLastCalledWith("all");
      expect(useMyCommunitiesQuery).toHaveBeenCalledWith(undefined);
      expect(screen.getByRole("link", { name: /还没加入任何社区/ })).toHaveAttribute(
        "href",
        "/community"
      );
    });

    it("queries only the joined communities, with no banner, once the user has joined at least one", () => {
      loginAs("user-1");
      useMyCommunitiesQuery.mockReturnValue({
        data: [joined("c-2", "dmv-pets", "DMV 宠物社区"), joined("c-3", "dmv-students", "DMV 留学生社区")],
        isError: false
      });

      renderWithProviders(<HomePage />);

      expect(useMyCommunitiesQuery).toHaveBeenCalledWith("user-1");
      expect(useCommunityPostsInfiniteQuery).toHaveBeenLastCalledWith(["c-2", "c-3"]);
      expect(screen.queryByRole("link", { name: /还没加入任何社区/ })).not.toBeInTheDocument();
    });

    it("falls back to ALL communities (with the banner) for a logged-in user who has joined nothing yet", () => {
      loginAs("user-1");
      useMyCommunitiesQuery.mockReturnValue({ data: [], isError: false });

      renderWithProviders(<HomePage />);

      expect(useCommunityPostsInfiniteQuery).toHaveBeenLastCalledWith("all");
      expect(screen.getByRole("link", { name: /还没加入任何社区/ })).toBeInTheDocument();
    });

    it("does not query posts (scope undefined, skeleton shown) until a logged-in user's joined list has loaded, and shows no banner meanwhile", () => {
      loginAs("user-1");
      useMyCommunitiesQuery.mockReturnValue({ data: undefined, isError: false });
      useCommunityPostsInfiniteQuery.mockReturnValue(postsResult({ data: undefined, isPending: true }));

      renderWithProviders(<HomePage />);

      expect(useCommunityPostsInfiniteQuery).toHaveBeenLastCalledWith(undefined);
      expect(screen.getByRole("status")).toHaveTextContent("加载中…");
      expect(screen.queryByRole("link", { name: /还没加入任何社区/ })).not.toBeInTheDocument();
    });

    it("falls back to ALL communities without the banner when the joined list fails to load (can't tell the user joined nothing)", () => {
      loginAs("user-1");
      useMyCommunitiesQuery.mockReturnValue({ data: undefined, isError: true });

      renderWithProviders(<HomePage />);

      expect(useCommunityPostsInfiniteQuery).toHaveBeenLastCalledWith("all");
      expect(screen.queryByRole("link", { name: /还没加入任何社区/ })).not.toBeInTheDocument();
    });

    it("no longer renders the 我的社区 card row or the dashed 加入更多 card", () => {
      renderWithProviders(<HomePage />);

      expect(screen.queryByRole("region", { name: "我的社区" })).not.toBeInTheDocument();
      expect(screen.queryByText("加入更多")).not.toBeInTheDocument();
    });
  });

  describe("post feed", () => {
    it("renders a clickable community-name tag on each post that links to that community's feed, outside the detail link", () => {
      renderWithProviders(<HomePage />);

      const tag = screen.getByRole("link", { name: "DMV 宠物社区" });
      expect(tag).toHaveAttribute("href", "/community/dmv-pets");
      const detailLink = screen.getByRole("link", { name: /有人去过 Tysons 吗/ });
      expect(detailLink).not.toContainElement(tag);
      expect(tag).not.toContainElement(detailLink);
    });

    it("renders a post row linking to its detail page with separate title and body, author, and comment count", () => {
      renderWithProviders(<HomePage />);

      const link = screen.getByRole("link", { name: /有人去过 Tysons 吗/ });
      expect(link).toHaveAttribute("href", "/community/post/cp-1");
      expect(screen.getByText("有人去过 Tysons 吗")).toBeInTheDocument();
      expect(screen.getByText("周末想去逛逛，求推荐")).toBeInTheDocument();
      expect(screen.getByRole("link", { name: /Bob/ })).toHaveAttribute(
        "href",
        "/community/post/cp-1"
      );
      expect(screen.getByLabelText("3 条评论")).toBeInTheDocument();
    });

    it("renders the action row with favorite and share, and no like control", () => {
      renderWithProviders(<HomePage />);

      expect(screen.getByRole("button", { name: "收藏" })).toHaveAttribute("data-post-id", "cp-1");
      expect(screen.getByRole("button", { name: "分享帖子" })).toBeEnabled();
      expect(screen.queryByRole("button", { name: /赞/ })).not.toBeInTheDocument();
    });

    it("keeps the action buttons outside the detail-page link", () => {
      renderWithProviders(<HomePage />);

      const link = screen.getByRole("link", { name: /有人去过 Tysons 吗/ });
      expect(link).not.toContainElement(screen.getByRole("button", { name: "收藏" }));
      expect(link).not.toContainElement(screen.getByRole("button", { name: "分享帖子" }));
    });

    it("uses the body as the headline (and no separate preview) when the post has no title", () => {
      useCommunityPostsInfiniteQuery.mockReturnValue(
        postsResult({
          data: { pages: [{ posts: [{ ...samplePost, title: null }], hasNextPage: false }] }
        })
      );

      renderWithProviders(<HomePage />);

      expect(screen.getAllByText("周末想去逛逛，求推荐")).toHaveLength(1);
    });

    function renderWithImages(images: string[]) {
      useCommunityPostsInfiniteQuery.mockReturnValue(
        postsResult({
          data: { pages: [{ posts: [{ ...samplePost, images }], hasNextPage: false }] }
        })
      );
      return renderWithProviders(<HomePage />);
    }

    // 跟 community-feed-page.test.tsx 的图片区域测试同一套断言——首页帖子卡片
    // 的图片区域直接复用同一个 PostImageCarousel（文字下方满宽展示，不是旁边
    // 的小方块缩略图），行为理应逐条保持一致。
    it("renders no image area (no carousel, no placeholder) on a card without images", () => {
      const { container } = renderWithImages([]);

      expect(container.querySelector("li a img")).toBeNull();
      expect(screen.queryByTestId("post-image-carousel-scroller")).not.toBeInTheDocument();
    });

    it("renders a single image full-width under the text, without a scroller or dots", () => {
      const { container } = renderWithImages(["https://x/cover.webp"]);

      const img = container.querySelector("li a img");
      expect(img).toHaveAttribute("src", "https://x/cover.webp");
      expect(img).toHaveClass("object-cover");
      expect(screen.queryByTestId("post-image-carousel-scroller")).not.toBeInTheDocument();
      expect(screen.queryByRole("img", { name: /第 \d+ 张/ })).not.toBeInTheDocument();
    });

    it("renders every image in a swipeable carousel with dots when the post has several", () => {
      const urls = ["https://x/1.webp", "https://x/2.webp", "https://x/3.webp"];
      const { container } = renderWithImages(urls);

      expect(screen.getByTestId("post-image-carousel-scroller")).toBeInTheDocument();
      expect(
        Array.from(container.querySelectorAll("li a img")).map((i) => i.getAttribute("src"))
      ).toEqual(urls);
      expect(screen.getByRole("img", { name: "第 1 张，共 3 张" })).toBeInTheDocument();
    });

    it("shows a loading status while the first page is pending", () => {
      useCommunityPostsInfiniteQuery.mockReturnValue(
        postsResult({ data: undefined, isPending: true })
      );

      renderWithProviders(<HomePage />);

      expect(screen.getByRole("status")).toHaveTextContent("加载中…");
    });

    it("shows an error alert when posts fail to load", () => {
      useCommunityPostsInfiniteQuery.mockReturnValue(
        postsResult({ data: undefined, isPending: false, isError: true })
      );

      renderWithProviders(<HomePage />);

      expect(screen.getByRole("alert")).toHaveTextContent("社区加载失败，请稍后重试。");
    });

    it("shows the empty state with a link to the community create page", () => {
      useCommunityPostsInfiniteQuery.mockReturnValue(
        postsResult({ data: { pages: [{ posts: [], hasNextPage: false }] } })
      );

      renderWithProviders(<HomePage />);

      expect(screen.getByText("暂无帖子，欢迎发布第一条")).toBeInTheDocument();
      expect(screen.getByRole("link", { name: "去发布" })).toHaveAttribute("href", "/community/new");
    });

    it("is visible to logged-out visitors (no auth gate on the feed)", () => {
      renderWithProviders(<HomePage />);

      expect(screen.getByText("有人去过 Tysons 吗")).toBeInTheDocument();
    });
  });

  describe("pagination", () => {
    it("fetches the next page when the sentinel scrolls into view and more pages exist", () => {
      const fetchNextPage = vi.fn();
      let callback: IntersectionObserverCallback | undefined;
      class FakeIntersectionObserver {
        constructor(cb: IntersectionObserverCallback) {
          callback = cb;
        }
        observe = vi.fn();
        disconnect = vi.fn();
      }
      vi.stubGlobal("IntersectionObserver", FakeIntersectionObserver);
      useCommunityPostsInfiniteQuery.mockReturnValue(
        postsResult({ hasNextPage: true, fetchNextPage })
      );

      renderWithProviders(<HomePage />);

      callback?.([{ isIntersecting: true } as IntersectionObserverEntry], {} as IntersectionObserver);

      expect(fetchNextPage).toHaveBeenCalledTimes(1);
    });

    it("does not observe anything when there is no next page", () => {
      const observe = vi.fn();
      class FakeIntersectionObserver {
        observe = observe;
        disconnect = vi.fn();
      }
      vi.stubGlobal("IntersectionObserver", FakeIntersectionObserver);

      renderWithProviders(<HomePage />);

      expect(observe).not.toHaveBeenCalled();
    });
  });
});
