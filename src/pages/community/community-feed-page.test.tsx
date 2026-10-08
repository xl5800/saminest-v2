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
vi.mock("react-router-dom", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react-router-dom")>();
  return { ...actual, useNavigate: () => navigateMock };
});

import { useAuthStore } from "../../store/auth-store";
import { renderWithProviders } from "../../test/render-with-providers";
import { CommunityFeedPage } from "./community-feed-page";

const initialAuthState = useAuthStore.getState();

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
  authorAvatarUrl: null
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

describe("CommunityFeedPage", () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  beforeEach(() => {
    useAuthStore.setState(initialAuthState, true);
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

  it("shows the community name in the top bar and queries posts for the community id", () => {
    renderWithProviders(<CommunityFeedPage />);

    expect(screen.getByRole("heading", { name: "DMV 社区" })).toBeInTheDocument();
    expect(useCommunityPostsInfiniteQuery).toHaveBeenCalledWith("c-1");
  });

  it("renders a post card linking to its detail page with type pill, title, preview, author and counts", () => {
    renderWithProviders(<CommunityFeedPage />);

    const link = screen.getByRole("link", { name: /有人去过 Tysons 吗/ });
    expect(link).toHaveAttribute("href", "/community/post/cp-1");
    expect(link).toHaveTextContent("提问");
    expect(link).toHaveTextContent("周末想去逛逛，求推荐");
    expect(link).toHaveTextContent("Bob");
    expect(screen.getByLabelText("3 条评论")).toBeInTheDocument();
    expect(screen.getByLabelText("5 人收藏")).toBeInTheDocument();
  });

  it("uses the body as the headline (and no separate preview) when the post has no title", () => {
    useCommunityPostsInfiniteQuery.mockReturnValue(
      postsResult({
        data: { pages: [{ posts: [{ ...samplePost, title: null }], hasNextPage: false }] }
      })
    );

    renderWithProviders(<CommunityFeedPage />);

    expect(screen.getAllByText("周末想去逛逛，求推荐")).toHaveLength(1);
  });

  it("shows a loading status while the first page is pending", () => {
    useCommunityPostsInfiniteQuery.mockReturnValue(
      postsResult({ data: undefined, isPending: true })
    );

    renderWithProviders(<CommunityFeedPage />);

    expect(screen.getByRole("status")).toHaveTextContent("加载中…");
  });

  it("shows an error alert when posts fail to load", () => {
    useCommunityPostsInfiniteQuery.mockReturnValue(
      postsResult({ data: undefined, isPending: false, isError: true })
    );

    renderWithProviders(<CommunityFeedPage />);

    expect(screen.getByRole("alert")).toHaveTextContent("社区加载失败，请稍后重试。");
  });

  it("shows an error alert when the community itself fails to load", () => {
    useDmvCommunityQuery.mockReturnValue({ data: undefined, isError: true });
    useCommunityPostsInfiniteQuery.mockReturnValue(
      postsResult({ data: undefined, isPending: true })
    );

    renderWithProviders(<CommunityFeedPage />);

    expect(screen.getByRole("alert")).toHaveTextContent("社区加载失败，请稍后重试。");
  });

  it("shows the empty state with a link to the create page", () => {
    useCommunityPostsInfiniteQuery.mockReturnValue(
      postsResult({ data: { pages: [{ posts: [], hasNextPage: false }] } })
    );

    renderWithProviders(<CommunityFeedPage />);

    expect(screen.getByText("暂无帖子，欢迎发布第一条")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "去发布" })).toHaveAttribute("href", "/community/new");
  });

  it("navigates to /community/new from the top bar publish button", () => {
    renderWithProviders(<CommunityFeedPage />);

    fireEvent.click(screen.getByRole("button", { name: "发布" }));

    expect(navigateMock).toHaveBeenCalledWith("/community/new");
  });

  it("silently joins the community once the user is logged in", () => {
    useAuthStore.getState().setSession({ user: { id: "user-1" } } as never);

    renderWithProviders(<CommunityFeedPage />);

    expect(joinMutate).toHaveBeenCalledWith({ communityId: "c-1", userId: "user-1" });
  });

  it("does not try to join when logged out", () => {
    renderWithProviders(<CommunityFeedPage />);

    expect(joinMutate).not.toHaveBeenCalled();
  });

  it("does not try to join before the community id is known", () => {
    useAuthStore.getState().setSession({ user: { id: "user-1" } } as never);
    useDmvCommunityQuery.mockReturnValue({ data: undefined, isError: false });

    renderWithProviders(<CommunityFeedPage />);

    expect(joinMutate).not.toHaveBeenCalled();
  });

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

    renderWithProviders(<CommunityFeedPage />);

    callback?.([{ isIntersecting: true } as IntersectionObserverEntry], {} as IntersectionObserver);

    expect(fetchNextPage).toHaveBeenCalledTimes(1);
  });
});
