import { cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const clipboardWriteMock = vi.hoisted(() => vi.fn());

const {
  useCommunityBySlugQuery,
  useCommunityMembershipQuery,
  useCommunityPostsInfiniteQuery,
  useJoinCommunityMutation,
  useLeaveCommunityMutation,
  joinMutate,
  leaveMutate,
  navigateMock
} = vi.hoisted(() => ({
  useCommunityBySlugQuery: vi.fn(),
  useCommunityMembershipQuery: vi.fn(),
  useCommunityPostsInfiniteQuery: vi.fn(),
  useJoinCommunityMutation: vi.fn(),
  useLeaveCommunityMutation: vi.fn(),
  joinMutate: vi.fn(),
  leaveMutate: vi.fn(),
  navigateMock: vi.fn()
}));

vi.mock("../../features/community/use-community-by-slug-query", () => ({
  useCommunityBySlugQuery
}));
vi.mock("../../features/community/use-community-membership-query", () => ({
  useCommunityMembershipQuery
}));
vi.mock("../../features/community/use-community-posts-query", () => ({
  useCommunityPostsInfiniteQuery
}));
vi.mock("../../features/community/use-join-community-mutation", () => ({
  useJoinCommunityMutation
}));
vi.mock("../../features/community/use-leave-community-mutation", () => ({
  useLeaveCommunityMutation
}));
vi.mock("@capacitor/clipboard", () => ({ Clipboard: { write: clipboardWriteMock } }));
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
  authorAvatarUrl: null,
  coverImageUrl: null as string | null,
  images: [] as string[]
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
    leaveMutate.mockReset();
    useLeaveCommunityMutation.mockReset();
    useLeaveCommunityMutation.mockReturnValue({ mutate: leaveMutate, isPending: false });
    useCommunityBySlugQuery.mockReset();
    useCommunityMembershipQuery.mockReset();
    useCommunityPostsInfiniteQuery.mockReset();
    useJoinCommunityMutation.mockReset();

    useCommunityBySlugQuery.mockReturnValue({
      data: {
        id: "c-1",
        name: "DMV 社区",
        slug: "dmv",
        description: "覆盖 DC / Maryland / Virginia 的本地华人讨论区",
        memberCount: 12,
        isOfficial: true
      },
      isError: false
    });
    clipboardWriteMock.mockReset();
    clipboardWriteMock.mockResolvedValue(undefined);
    // 默认：不是成员（没有任何静默加入，成员状态只来自真实的成员关系查询）。
    useCommunityMembershipQuery.mockReturnValue({ data: false });
    useCommunityPostsInfiniteQuery.mockReturnValue(postsResult());
    useJoinCommunityMutation.mockReturnValue({ mutate: joinMutate });
  });

  /** 路由参数 :slug 来自 URL，页面靠 useParams 读它。 */
  function renderFeed(entry = "/community/dmv") {
    return renderWithProviders(<CommunityFeedPage />, {
      route: "/community/:slug",
      initialEntries: [entry]
    });
  }

  it("shows the community name in the top bar and queries posts for that community only", () => {
    renderFeed();

    expect(screen.getByRole("heading", { name: "DMV 社区" })).toBeInTheDocument();
    expect(useCommunityPostsInfiniteQuery).toHaveBeenCalledWith(["c-1"]);
  });

  it("resolves the community from the :slug route param (not a hard-coded dmv)", () => {
    renderFeed("/community/dmv-students");

    expect(useCommunityBySlugQuery).toHaveBeenCalledWith("dmv-students");
  });

  it("waits (no posts query scope) until the community id is known", () => {
    useCommunityBySlugQuery.mockReturnValue({ data: undefined, isError: false });
    useCommunityPostsInfiniteQuery.mockReturnValue(postsResult({ data: undefined, isPending: true }));

    renderFeed();

    expect(useCommunityPostsInfiniteQuery).toHaveBeenCalledWith(undefined);
  });

  it("renders a post card linking to its detail page with title, preview, author and counts (no type pill)", () => {
    renderFeed();

    const link = screen.getByRole("link", { name: /有人去过 Tysons 吗/ });
    expect(link).toHaveAttribute("href", "/community/post/cp-1");
    expect(link).not.toHaveTextContent("提问");
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

    renderFeed();

    expect(screen.getAllByText("周末想去逛逛，求推荐")).toHaveLength(1);
  });

  describe("community header", () => {
    it("shows the abbreviated avatar, name, official badge, member count and description from the community row", () => {
      renderFeed();

      const header = screen.getByRole("region", { name: "社区信息" });
      expect(header).toHaveTextContent("DMV");
      expect(header).toHaveTextContent("DMV 社区");
      expect(header).toHaveTextContent("12 位成员");
      expect(header).toHaveTextContent("覆盖 DC / Maryland / Virginia 的本地华人讨论区");
      expect(screen.getByLabelText("官方认证")).toBeInTheDocument();
    });

    it("keeps the square avatar abbreviation short for multi-part slugs (dmv-students -> DMV)", () => {
      useCommunityBySlugQuery.mockReturnValue({
        data: {
          id: "c-3",
          name: "DMV 留学生社区",
          slug: "dmv-students",
          description: null,
          memberCount: 0,
          isOfficial: false
        },
        isError: false
      });

      renderFeed("/community/dmv-students");

      const header = screen.getByRole("region", { name: "社区信息" });
      expect(header).toHaveTextContent(/^DMVDMV 留学生社区/);
      expect(header).not.toHaveTextContent("STUDENTS");
    });

    it("hides the verified badge for a non-official community and the description when it is empty", () => {
      useCommunityBySlugQuery.mockReturnValue({
        data: { id: "c-1", name: "DMV 社区", slug: "dmv", description: null, memberCount: 0, isOfficial: false },
        isError: false
      });

      renderFeed();

      expect(screen.queryByLabelText("官方认证")).not.toBeInTheDocument();
      expect(screen.getByRole("region", { name: "社区信息" })).toHaveTextContent("0 位成员");
    });

    it("shows a header skeleton (no header content) while the community is loading", () => {
      useCommunityBySlugQuery.mockReturnValue({ data: undefined, isError: false });
      useCommunityPostsInfiniteQuery.mockReturnValue(
        postsResult({ data: undefined, isPending: true })
      );

      renderFeed();

      expect(screen.queryByRole("region", { name: "社区信息" })).not.toBeInTheDocument();
    });
  });

  describe("join button", () => {
    it("shows a 退出 button (instead of 加入) when the user really is a member, and leaves only after confirming", () => {
      useAuthStore.getState().setSession({ user: { id: "user-1" } } as never);
      useCommunityMembershipQuery.mockReturnValue({ data: true });

      renderFeed();

      expect(screen.queryByRole("button", { name: "加入" })).not.toBeInTheDocument();
      expect(useCommunityMembershipQuery).toHaveBeenCalledWith("c-1", "user-1");

      fireEvent.click(screen.getByRole("button", { name: "退出" }));
      expect(screen.getByRole("dialog", { name: "确认退出社区" })).toHaveTextContent("DMV 社区");
      expect(leaveMutate).not.toHaveBeenCalled();

      fireEvent.click(screen.getByRole("button", { name: "确认退出" }));

      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
      expect(leaveMutate).toHaveBeenCalledWith({ communityId: "c-1", userId: "user-1" });
      expect(joinMutate).not.toHaveBeenCalled();
    });

    it("closes the confirmation without leaving when 取消 is clicked", () => {
      useAuthStore.getState().setSession({ user: { id: "user-1" } } as never);
      useCommunityMembershipQuery.mockReturnValue({ data: true });

      renderFeed();
      fireEvent.click(screen.getByRole("button", { name: "退出" }));
      fireEvent.click(screen.getByRole("button", { name: "取消" }));

      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
      expect(leaveMutate).not.toHaveBeenCalled();
    });

    it("shows a disabled 退出中… button while the leave request is in flight", () => {
      useAuthStore.getState().setSession({ user: { id: "user-1" } } as never);
      useCommunityMembershipQuery.mockReturnValue({ data: true });
      useLeaveCommunityMutation.mockReturnValue({ mutate: leaveMutate, isPending: true });

      renderFeed();

      expect(screen.getByRole("button", { name: "退出中…" })).toBeDisabled();
    });

    it("shows a clickable 加入 button for a logged-in non-member and joins on click (never on its own)", () => {
      useAuthStore.getState().setSession({ user: { id: "user-1" } } as never);

      renderFeed();

      expect(screen.queryByRole("button", { name: "退出" })).not.toBeInTheDocument();
      expect(joinMutate).not.toHaveBeenCalled();

      fireEvent.click(screen.getByRole("button", { name: "加入" }));

      expect(joinMutate).toHaveBeenCalledWith({ communityId: "c-1", userId: "user-1" });
      expect(navigateMock).not.toHaveBeenCalled();
    });

    it("shows a 加入 button that sends a logged-out user to /login without joining", () => {
      renderFeed();

      expect(screen.queryByRole("button", { name: "退出" })).not.toBeInTheDocument();
      fireEvent.click(screen.getByRole("button", { name: "加入" }));

      expect(navigateMock).toHaveBeenCalledWith("/login");
      expect(joinMutate).not.toHaveBeenCalled();
    });

    it("shows a disabled 加入中… button while the join request is in flight", () => {
      useAuthStore.getState().setSession({ user: { id: "user-1" } } as never);
      useJoinCommunityMutation.mockReturnValue({ mutate: joinMutate, isPending: true });

      renderFeed();

      expect(screen.getByRole("button", { name: "加入中…" })).toBeDisabled();
    });

    it("keeps the 加入 button clickable for a retry when the join failed", () => {
      useAuthStore.getState().setSession({ user: { id: "user-1" } } as never);
      useJoinCommunityMutation.mockReturnValue({ mutate: joinMutate, isError: true });

      renderFeed();

      fireEvent.click(screen.getByRole("button", { name: "加入" }));

      expect(joinMutate).toHaveBeenCalledWith({ communityId: "c-1", userId: "user-1" });
    });
  });

  describe("share button", () => {
    it("copies the production URL of the current page and confirms", async () => {
      renderFeed("/community/dmv-pets");

      fireEvent.click(screen.getByRole("button", { name: "分享" }));

      expect(await screen.findByText("链接已复制")).toBeInTheDocument();
      expect(clipboardWriteMock).toHaveBeenCalledWith({
        string: "https://www.saminest.com/community/dmv-pets"
      });
    });

    it("stays silent (no confirmation, no alert) when copying fails", async () => {
      clipboardWriteMock.mockRejectedValue(new Error("denied"));
      const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
      renderFeed();

      fireEvent.click(screen.getByRole("button", { name: "分享" }));

      await waitFor(() => expect(errorSpy).toHaveBeenCalled());
      expect(screen.queryByText("链接已复制")).not.toBeInTheDocument();
      expect(screen.queryByRole("alert")).not.toBeInTheDocument();
      errorSpy.mockRestore();
    });
  });

  describe("floating publish button", () => {
    it("is a fixed bottom-right pill, and the top bar no longer has its own publish button", () => {
      renderFeed();

      const buttons = screen.getAllByRole("button", { name: "发布" });
      expect(buttons).toHaveLength(1);
      expect(buttons[0]).toHaveClass("fixed", "right-4", "h-[50px]", "rounded-full", "bg-primary");
    });

    it("leaves enough bottom padding in the list container so the last post is not covered", () => {
      const { container } = renderFeed();

      expect(container.querySelector(".pb-40")).not.toBeNull();
    });
  });

  describe("post list styling", () => {
    it("renders flat rows (border-b, no card border/shadow/rounding)", () => {
      renderFeed();

      const row = screen.getByRole("link", { name: /有人去过 Tysons 吗/ });
      expect(row).toHaveClass("border-b");
      expect(row).not.toHaveClass("rounded-card-lg", "shadow-card", "border");
    });

    it("shows a 置顶 tag only on pinned posts", () => {
      useCommunityPostsInfiniteQuery.mockReturnValue(
        postsResult({
          data: {
            pages: [
              {
                posts: [
                  { ...samplePost, id: "pinned-1", title: "置顶公告", pinned: true },
                  { ...samplePost, id: "normal-1", title: "普通帖子", pinned: false }
                ],
                hasNextPage: false
              }
            ]
          }
        })
      );

      renderFeed();

      expect(screen.getByRole("link", { name: /置顶公告/ })).toHaveTextContent("置顶");
      expect(screen.getByRole("link", { name: /普通帖子/ })).not.toHaveTextContent("置顶");
    });

    it("shows comment and favorite counts with MessageCircle / Heart icons, each bound to its own field", () => {
      useCommunityPostsInfiniteQuery.mockReturnValue(
        postsResult({
          data: {
            pages: [{ posts: [{ ...samplePost, commentCount: 7, favoriteCount: 9 }], hasNextPage: false }]
          }
        })
      );

      const { container } = renderFeed();

      const comments = screen.getByLabelText("7 条评论");
      const favorites = screen.getByLabelText("9 人收藏");
      expect(comments).toHaveTextContent("7");
      expect(comments.querySelector("svg.lucide-message-circle")).not.toBeNull();
      expect(favorites).toHaveTextContent("9");
      expect(favorites.querySelector("svg.lucide-heart")).not.toBeNull();
      expect(container.querySelector("svg.lucide-star")).toBeNull();
    });
  });

  function renderWithImages(images: string[]) {
    useCommunityPostsInfiniteQuery.mockReturnValue(
      postsResult({
        data: { pages: [{ posts: [{ ...samplePost, images }], hasNextPage: false }] }
      })
    );
    return renderFeed();
  }

  it("renders no image area (no carousel, no placeholder) on a card without images", () => {
    const { container } = renderWithImages([]);

    expect(container.querySelector("a img")).toBeNull();
    expect(screen.queryByTestId("post-image-carousel-scroller")).not.toBeInTheDocument();
  });

  it("renders a single image full-width under the text, without a scroller or dots", () => {
    const { container } = renderWithImages(["https://x/1.webp"]);

    const img = container.querySelector("a img");
    expect(img).toHaveAttribute("src", "https://x/1.webp");
    expect(img).toHaveClass("object-cover");
    expect(screen.queryByTestId("post-image-carousel-scroller")).not.toBeInTheDocument();
    expect(screen.queryByRole("img", { name: /第 \d+ 张/ })).not.toBeInTheDocument();
  });

  it("renders every image in a swipeable carousel with dots when the post has several", () => {
    const urls = ["https://x/1.webp", "https://x/2.webp", "https://x/3.webp"];
    const { container } = renderWithImages(urls);

    expect(screen.getByTestId("post-image-carousel-scroller")).toBeInTheDocument();
    expect(Array.from(container.querySelectorAll("a img")).map((i) => i.getAttribute("src"))).toEqual(
      urls
    );
    expect(screen.getByRole("img", { name: "第 1 张，共 3 张" })).toBeInTheDocument();
  });

  it("does not render the old 64x64 side thumbnail from coverImageUrl any more", () => {
    useCommunityPostsInfiniteQuery.mockReturnValue(
      postsResult({
        data: {
          pages: [{ posts: [{ ...samplePost, coverImageUrl: "https://x/cover.webp" }], hasNextPage: false }]
        }
      })
    );

    const { container } = renderFeed();

    expect(container.querySelector("a img")).toBeNull();
  });

  it("shows a loading status while the first page is pending", () => {
    useCommunityPostsInfiniteQuery.mockReturnValue(
      postsResult({ data: undefined, isPending: true })
    );

    renderFeed();

    expect(screen.getByRole("status")).toHaveTextContent("加载中…");
  });

  it("shows an error alert when posts fail to load", () => {
    useCommunityPostsInfiniteQuery.mockReturnValue(
      postsResult({ data: undefined, isPending: false, isError: true })
    );

    renderFeed();

    expect(screen.getByRole("alert")).toHaveTextContent("社区加载失败，请稍后重试。");
  });

  it("shows an error alert when the community itself fails to load", () => {
    useCommunityBySlugQuery.mockReturnValue({ data: undefined, isError: true });
    useCommunityPostsInfiniteQuery.mockReturnValue(
      postsResult({ data: undefined, isPending: true })
    );

    renderFeed();

    expect(screen.getByRole("alert")).toHaveTextContent("社区加载失败，请稍后重试。");
  });

  it("shows the empty state with a link to the create page", () => {
    useCommunityPostsInfiniteQuery.mockReturnValue(
      postsResult({ data: { pages: [{ posts: [], hasNextPage: false }] } })
    );

    renderFeed();

    expect(screen.getByText("暂无帖子，欢迎发布第一条")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "去发布" })).toHaveAttribute(
      "href",
      "/community/dmv/new"
    );
  });

  it("navigates to /community/:slug/new (current community pre-selected) from the floating publish button", () => {
    renderFeed("/community/dmv-pets");

    fireEvent.click(screen.getByRole("button", { name: "发布" }));

    expect(navigateMock).toHaveBeenCalledWith("/community/dmv-pets/new");
  });

  it("never silently joins on mount, logged in or not (no auto-join any more)", () => {
    useAuthStore.getState().setSession({ user: { id: "user-1" } } as never);

    renderFeed();

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

    renderFeed();

    callback?.([{ isIntersecting: true } as IntersectionObserverEntry], {} as IntersectionObserver);

    expect(fetchNextPage).toHaveBeenCalledTimes(1);
  });
});
