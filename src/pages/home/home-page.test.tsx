import { cleanup, fireEvent, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const {
  useDmvCommunityQuery,
  useCommunityPostsInfiniteQuery,
  useJoinCommunityMutation,
  joinMutate,
  navigateMock
} = vi.hoisted(() => ({
  useDmvCommunityQuery: vi.fn(),
  useCommunityPostsInfiniteQuery: vi.fn(),
  useJoinCommunityMutation: vi.fn(),
  joinMutate: vi.fn(),
  navigateMock: vi.fn()
}));

vi.mock("../../features/community/use-dmv-community-query", () => ({ useDmvCommunityQuery }));
vi.mock("../../features/community/use-community-posts-query", () => ({
  useCommunityPostsInfiniteQuery
}));
vi.mock("../../features/community/use-join-community-mutation", () => ({
  useJoinCommunityMutation
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
  coverImageUrl: null as string | null
};

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
    joinMutate.mockReset();
    useDmvCommunityQuery.mockReset();
    useCommunityPostsInfiniteQuery.mockReset();
    useJoinCommunityMutation.mockReset();

    useDmvCommunityQuery.mockReturnValue({
      data: { id: "c-1", name: "DMV 社区", slug: "dmv" },
      isError: false
    });
    useCommunityPostsInfiniteQuery.mockReturnValue(postsResult());
    useJoinCommunityMutation.mockReturnValue({ mutate: joinMutate });
  });

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

    it("navigates to /community from the search icon (placeholder until community search exists)", () => {
      renderWithProviders(<HomePage />);

      fireEvent.click(screen.getByRole("button", { name: "搜索" }));

      expect(navigateMock).toHaveBeenCalledWith("/community");
    });

    it("shows the fixed '推荐' tab", () => {
      renderWithProviders(<HomePage />);

      expect(screen.getByText("推荐")).toBeInTheDocument();
    });
  });

  describe("我的社区 row", () => {
    it("renders the DMV community card and a '加入更多' card, both linking to /community", () => {
      renderWithProviders(<HomePage />);

      expect(screen.getByRole("link", { name: /DMV 社区/ })).toHaveAttribute("href", "/community");
      expect(screen.getByRole("link", { name: /加入更多/ })).toHaveAttribute("href", "/community");
    });

    it("still renders the community cards while the community is loading", () => {
      useDmvCommunityQuery.mockReturnValue({ data: undefined, isError: false });
      useCommunityPostsInfiniteQuery.mockReturnValue(
        postsResult({ data: undefined, isPending: true })
      );

      renderWithProviders(<HomePage />);

      expect(screen.getByRole("link", { name: /加入更多/ })).toBeInTheDocument();
    });
  });

  describe("post feed", () => {
    it("queries posts for the DMV community id", () => {
      renderWithProviders(<HomePage />);

      expect(useCommunityPostsInfiniteQuery).toHaveBeenCalledWith("c-1");
    });

    it("renders a post row linking to its detail page with separate title and body, author, and comment count", () => {
      renderWithProviders(<HomePage />);

      const link = screen.getByRole("link", { name: /有人去过 Tysons 吗/ });
      expect(link).toHaveAttribute("href", "/community/post/cp-1");
      expect(screen.getByText("有人去过 Tysons 吗")).toBeInTheDocument();
      expect(screen.getByText("周末想去逛逛，求推荐")).toBeInTheDocument();
      expect(link).toHaveTextContent("Bob");
      expect(screen.getByLabelText("3 条评论")).toBeInTheDocument();
    });

    it("renders the action row with favorite and share, and no like control", () => {
      renderWithProviders(<HomePage />);

      expect(screen.getByRole("button", { name: "收藏" })).toHaveAttribute("data-post-id", "cp-1");
      expect(screen.getByRole("button", { name: "分享" })).toBeDisabled();
      expect(screen.queryByRole("button", { name: /赞/ })).not.toBeInTheDocument();
    });

    it("keeps the action buttons outside the detail-page link", () => {
      renderWithProviders(<HomePage />);

      const link = screen.getByRole("link", { name: /有人去过 Tysons 吗/ });
      expect(link).not.toContainElement(screen.getByRole("button", { name: "收藏" }));
      expect(link).not.toContainElement(screen.getByRole("button", { name: "分享" }));
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

    it("shows the cover image thumbnail only on a post that has one", () => {
      useCommunityPostsInfiniteQuery.mockReturnValue(
        postsResult({
          data: {
            pages: [
              {
                posts: [
                  { ...samplePost, coverImageUrl: "https://x/cover.webp" },
                  { ...samplePost, id: "cp-2", title: "无图帖" }
                ],
                hasNextPage: false
              }
            ]
          }
        })
      );

      const { container } = renderWithProviders(<HomePage />);

      const images = container.querySelectorAll("li a img");
      expect(images).toHaveLength(1);
      expect(images[0]).toHaveAttribute("src", "https://x/cover.webp");
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

  describe("silent join", () => {
    it("silently joins the community once the user is logged in", () => {
      useAuthStore.getState().setSession({ user: { id: "user-1" } } as never);

      renderWithProviders(<HomePage />);

      expect(joinMutate).toHaveBeenCalledWith({ communityId: "c-1", userId: "user-1" });
    });

    it("does not try to join when logged out", () => {
      renderWithProviders(<HomePage />);

      expect(joinMutate).not.toHaveBeenCalled();
    });
  });
});
