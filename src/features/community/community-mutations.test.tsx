import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * 社区功能阶段二：这几个 hook 本身几乎是 useMutation 的直接透传，但
 * onSuccess 里"到底失效哪几个 queryKey"是真正的行为（评论数/收藏数由数据库
 * 触发器维护，缓存不失效页面上的数字就是旧的）——单独开一个文件，直接测真实
 * hook（只 mock 它们依赖的 repository 函数）。
 */

const {
  createComment,
  softDeleteComment,
  createCommunityPost,
  addCommunityPostFavorite,
  removeCommunityPostFavorite
} = vi.hoisted(() => ({
  createComment: vi.fn(),
  softDeleteComment: vi.fn(),
  createCommunityPost: vi.fn(),
  addCommunityPostFavorite: vi.fn(),
  removeCommunityPostFavorite: vi.fn()
}));

vi.mock("../../repositories/comments-repository", () => ({ createComment, softDeleteComment }));
vi.mock("../../repositories/community-repository", () => ({ createCommunityPost }));
vi.mock("../../repositories/favorites-repository", () => ({
  addCommunityPostFavorite,
  removeCommunityPostFavorite
}));

import { useCreateCommentMutation } from "../comments/use-create-comment-mutation";
import { useDeleteCommentMutation } from "../comments/use-delete-comment-mutation";
import { useToggleCommunityPostFavoriteMutation } from "../favorites/use-toggle-community-post-favorite-mutation";
import { useCreateCommunityPostMutation } from "./use-create-community-post-mutation";

function setup() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  return { wrapper, invalidateSpy };
}

function invalidatedKeys(spy: ReturnType<typeof setup>["invalidateSpy"]) {
  return spy.mock.calls.map((call) => (call[0] as { queryKey: unknown[] }).queryKey);
}

beforeEach(() => {
  createComment.mockReset();
  softDeleteComment.mockReset();
  createCommunityPost.mockReset();
  addCommunityPostFavorite.mockReset();
  removeCommunityPostFavorite.mockReset();
});

describe("useCreateCommentMutation (communityPostId branch)", () => {
  it("invalidates the community post's comments and detail caches, and nothing else", async () => {
    createComment.mockResolvedValue({ id: "c1", createdAt: "now" });
    const { wrapper, invalidateSpy } = setup();
    const { result } = renderHook(() => useCreateCommentMutation(), { wrapper });

    await act(async () => {
      await result.current.mutateAsync({
        communityPostId: "cp-1",
        userId: "user-1",
        parentId: null,
        content: "hi"
      });
    });

    expect(invalidatedKeys(invalidateSpy)).toEqual([
      ["community-post-comments", "cp-1"],
      ["community-post-detail", "cp-1"]
    ]);
  });

  it("still invalidates the post and activity caches for the other two targets", async () => {
    createComment.mockResolvedValue({ id: "c1", createdAt: "now" });
    const { wrapper, invalidateSpy } = setup();
    const { result } = renderHook(() => useCreateCommentMutation(), { wrapper });

    await act(async () => {
      await result.current.mutateAsync({
        postId: "p-1",
        userId: "user-1",
        parentId: null,
        content: "hi"
      });
      await result.current.mutateAsync({
        activityId: "a-1",
        userId: "user-1",
        parentId: null,
        content: "hi"
      });
    });

    expect(invalidatedKeys(invalidateSpy)).toEqual([
      ["post-comments", "p-1"],
      ["post-detail", "p-1"],
      ["activity-comments", "a-1"],
      ["activity-detail", "a-1"]
    ]);
  });
});

describe("useDeleteCommentMutation (communityPostId branch)", () => {
  it("soft-deletes the comment and invalidates the community post's comments and detail caches", async () => {
    softDeleteComment.mockResolvedValue(undefined);
    const { wrapper, invalidateSpy } = setup();
    const { result } = renderHook(() => useDeleteCommentMutation(), { wrapper });

    await act(async () => {
      await result.current.mutateAsync({
        communityPostId: "cp-1",
        commentId: "c1",
        userId: "user-1"
      });
    });

    expect(softDeleteComment).toHaveBeenCalledWith("c1", "user-1");
    expect(invalidatedKeys(invalidateSpy)).toEqual([
      ["community-post-comments", "cp-1"],
      ["community-post-detail", "cp-1"]
    ]);
  });
});

describe("useToggleCommunityPostFavoriteMutation", () => {
  it("adds a favorite and invalidates the favorite ids, the feed and the post detail", async () => {
    addCommunityPostFavorite.mockResolvedValue(undefined);
    const { wrapper, invalidateSpy } = setup();
    const { result } = renderHook(() => useToggleCommunityPostFavoriteMutation(), { wrapper });

    await act(async () => {
      await result.current.mutateAsync({
        userId: "user-1",
        communityPostId: "cp-1",
        isCurrentlyFavorited: false
      });
    });

    expect(addCommunityPostFavorite).toHaveBeenCalledWith({
      userId: "user-1",
      communityPostId: "cp-1"
    });
    expect(removeCommunityPostFavorite).not.toHaveBeenCalled();
    expect(invalidatedKeys(invalidateSpy)).toEqual([
      ["community-post-favorites", "user-1"],
      ["community-posts"],
      ["community-post-detail", "cp-1"]
    ]);
  });

  it("removes the favorite when currently favorited", async () => {
    removeCommunityPostFavorite.mockResolvedValue(undefined);
    const { wrapper } = setup();
    const { result } = renderHook(() => useToggleCommunityPostFavoriteMutation(), { wrapper });

    await act(async () => {
      await result.current.mutateAsync({
        userId: "user-1",
        communityPostId: "cp-1",
        isCurrentlyFavorited: true
      });
    });

    expect(removeCommunityPostFavorite).toHaveBeenCalledWith({
      userId: "user-1",
      communityPostId: "cp-1"
    });
    expect(addCommunityPostFavorite).not.toHaveBeenCalled();
  });
});

describe("useCreateCommunityPostMutation", () => {
  it("creates the post and invalidates every community-posts feed cache (single-community and home aggregate)", async () => {
    createCommunityPost.mockResolvedValue({ id: "cp-9" });
    const { wrapper, invalidateSpy } = setup();
    const { result } = renderHook(() => useCreateCommunityPostMutation(), { wrapper });

    const input = {
      communityId: "c-1",
      authorId: "user-1",
      postType: "discussion" as const,
      title: null,
      body: "hello"
    };
    let created: { id: string } | undefined;
    await act(async () => {
      created = await result.current.mutateAsync(input);
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(createCommunityPost.mock.calls[0]?.[0]).toEqual(input);
    expect(created).toEqual({ id: "cp-9" });
    expect(invalidatedKeys(invalidateSpy)).toEqual([["community-posts"]]);
  });
});
