import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * 阶段十三：多社区通用化新增/改造的 hook。repository 函数各自有单测，这里只测
 * hook 自己的行为：什么时候不发请求（enabled）、传给 repository 的范围参数、缓存
 * key 的形状、加入社区后失效哪些缓存。
 */

const { getCommunityBySlug, listCommunities, listMyCommunities, listCommunityPosts, joinCommunity } =
  vi.hoisted(() => ({
    getCommunityBySlug: vi.fn(),
    listCommunities: vi.fn(),
    listMyCommunities: vi.fn(),
    listCommunityPosts: vi.fn(),
    joinCommunity: vi.fn()
  }));

vi.mock("../../repositories/community-repository", () => ({
  getCommunityBySlug,
  listCommunities,
  listMyCommunities,
  listCommunityPosts,
  joinCommunity
}));

import { useCommunityBySlugQuery } from "./use-community-by-slug-query";
import { useCommunityPostsInfiniteQuery } from "./use-community-posts-query";
import { useJoinCommunityMutation } from "./use-join-community-mutation";
import { useListCommunitiesQuery } from "./use-list-communities-query";
import { useMyCommunitiesQuery } from "./use-my-communities-query";

function setup() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  return { wrapper, queryClient, invalidateSpy };
}

beforeEach(() => {
  getCommunityBySlug.mockReset();
  listCommunities.mockReset();
  listMyCommunities.mockReset();
  listCommunityPosts.mockReset();
  joinCommunity.mockReset();
  listCommunityPosts.mockResolvedValue({ posts: [], hasNextPage: false });
});

describe("useCommunityBySlugQuery", () => {
  it("fetches whichever slug it is given (not a hard-coded dmv) and caches per slug", async () => {
    getCommunityBySlug.mockResolvedValue({ id: "c-2", slug: "dmv-pets" });
    const { wrapper, queryClient } = setup();

    const { result } = renderHook(() => useCommunityBySlugQuery("dmv-pets"), { wrapper });

    await waitFor(() => expect(result.current.data).toEqual({ id: "c-2", slug: "dmv-pets" }));
    expect(getCommunityBySlug).toHaveBeenCalledWith("dmv-pets");
    expect(queryClient.getQueryData(["community", "dmv-pets"])).toBeDefined();
  });

  it("does not fire a request while the slug is unknown", () => {
    const { wrapper } = setup();

    renderHook(() => useCommunityBySlugQuery(undefined), { wrapper });

    expect(getCommunityBySlug).not.toHaveBeenCalled();
  });
});

describe("useListCommunitiesQuery", () => {
  it("returns every community from the repository", async () => {
    listCommunities.mockResolvedValue([{ id: "c-1" }, { id: "c-2" }]);
    const { wrapper } = setup();

    const { result } = renderHook(() => useListCommunitiesQuery(), { wrapper });

    await waitFor(() => expect(result.current.data).toHaveLength(2));
  });
});

describe("useMyCommunitiesQuery", () => {
  it("asks the repository for the user's joined communities", async () => {
    listMyCommunities.mockResolvedValue([{ id: "c-1" }]);
    const { wrapper } = setup();

    const { result } = renderHook(() => useMyCommunitiesQuery("user-1"), { wrapper });

    await waitFor(() => expect(result.current.data).toEqual([{ id: "c-1" }]));
    expect(listMyCommunities).toHaveBeenCalledWith("user-1");
  });

  it("does not fire a request for a guest (no user id)", () => {
    const { wrapper } = setup();

    renderHook(() => useMyCommunitiesQuery(undefined), { wrapper });

    expect(listMyCommunities).not.toHaveBeenCalled();
  });
});

describe("useCommunityPostsInfiniteQuery", () => {
  it("does not fire a request while the scope is still unknown (undefined)", () => {
    const { wrapper } = setup();

    renderHook(() => useCommunityPostsInfiniteQuery(undefined), { wrapper });

    expect(listCommunityPosts).not.toHaveBeenCalled();
  });

  it('passes "all" straight through as the repository scope', async () => {
    const { wrapper } = setup();

    renderHook(() => useCommunityPostsInfiniteQuery("all"), { wrapper });

    await waitFor(() => expect(listCommunityPosts).toHaveBeenCalled());
    expect(listCommunityPosts).toHaveBeenCalledWith({ communityIds: "all", page: 0, pageSize: 20 });
  });

  it("passes the given community ids through", async () => {
    const { wrapper } = setup();

    renderHook(() => useCommunityPostsInfiniteQuery(["c-1", "c-2"]), { wrapper });

    await waitFor(() => expect(listCommunityPosts).toHaveBeenCalled());
    expect(listCommunityPosts).toHaveBeenCalledWith({
      communityIds: ["c-1", "c-2"],
      page: 0,
      pageSize: 20
    });
  });

  it("uses a different cache entry per scope, and the same one regardless of id order", async () => {
    const { wrapper, queryClient } = setup();

    renderHook(() => useCommunityPostsInfiniteQuery(["c-2", "c-1"]), { wrapper });
    renderHook(() => useCommunityPostsInfiniteQuery(["c-1", "c-2"]), { wrapper });
    renderHook(() => useCommunityPostsInfiniteQuery("all"), { wrapper });

    await waitFor(() => expect(queryClient.getQueryCache().getAll()).toHaveLength(2));
    expect(queryClient.getQueryState(["community-posts", "c-1,c-2"])).toBeDefined();
    expect(queryClient.getQueryState(["community-posts", "all"])).toBeDefined();
  });
});

describe("useJoinCommunityMutation", () => {
  it("invalidates the community, membership, my-communities and community-posts caches after joining", async () => {
    joinCommunity.mockResolvedValue(undefined);
    const { wrapper, invalidateSpy } = setup();
    const { result } = renderHook(() => useJoinCommunityMutation(), { wrapper });

    await act(async () => {
      await result.current.mutateAsync({ communityId: "c-1", userId: "user-1" });
    });

    const keys = invalidateSpy.mock.calls.map((call) => (call[0] as { queryKey: unknown[] }).queryKey);
    expect(keys).toEqual([
      ["community"],
      ["community-membership"],
      ["my-communities"],
      ["community-posts"]
    ]);
  });
});
