import { cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { listLikedCommunityPostIds, likeCommunityPost, unlikeCommunityPost, navigateMock } = vi.hoisted(() => ({
  listLikedCommunityPostIds: vi.fn(),
  likeCommunityPost: vi.fn(),
  unlikeCommunityPost: vi.fn(),
  navigateMock: vi.fn()
}));

vi.mock("../repositories/community-repository", () => ({
  listLikedCommunityPostIds,
  likeCommunityPost,
  unlikeCommunityPost
}));
vi.mock("react-router-dom", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react-router-dom")>();
  return { ...actual, useNavigate: () => navigateMock };
});

import { useAuthStore } from "../store/auth-store";
import { renderWithProviders } from "../test/render-with-providers";
import { CommunityPostLikeButton } from "./community-post-like-button";

const initialAuthState = useAuthStore.getState();

describe("CommunityPostLikeButton (社区帖子点赞任务卡)", () => {
  afterEach(() => cleanup());

  beforeEach(() => {
    useAuthStore.setState(initialAuthState, true);
    listLikedCommunityPostIds.mockReset().mockResolvedValue([]);
    likeCommunityPost.mockReset().mockResolvedValue(undefined);
    unlikeCommunityPost.mockReset().mockResolvedValue(undefined);
    navigateMock.mockReset();
  });

  function login() {
    useAuthStore.getState().setSession({ user: { id: "user-1" } } as never);
  }

  it("shows 赞 instead of 0 when nobody has liked the post", () => {
    renderWithProviders(<CommunityPostLikeButton communityPostId="cp-1" likeCount={0} />);
    expect(screen.getByRole("button", { name: "点赞" })).toHaveTextContent("赞");
  });

  it("sends a logged-out visitor to the login page instead of liking", () => {
    renderWithProviders(<CommunityPostLikeButton communityPostId="cp-1" likeCount={3} />, {
      initialEntries: ["/community/post/cp-1"]
    });

    fireEvent.click(screen.getByRole("button", { name: "点赞" }));

    expect(navigateMock).toHaveBeenCalledWith("/login?redirect=%2Fcommunity%2Fpost%2Fcp-1");
    expect(likeCommunityPost).not.toHaveBeenCalled();
  });

  it("turns blue and bumps the count immediately, then calls likeCommunityPost", async () => {
    login();
    renderWithProviders(<CommunityPostLikeButton communityPostId="cp-1" likeCount={3} />);

    fireEvent.click(screen.getByRole("button", { name: "点赞" }));

    const button = screen.getByRole("button", { name: "取消点赞" });
    expect(button).toHaveAttribute("aria-pressed", "true");
    expect(button).toHaveTextContent("4");
    expect(button).toHaveClass("text-primary");
    await waitFor(() =>
      expect(likeCommunityPost).toHaveBeenCalledWith({ userId: "user-1", communityPostId: "cp-1" })
    );
  });

  it("un-likes a post the user already liked", async () => {
    login();
    listLikedCommunityPostIds.mockResolvedValue(["cp-1"]);
    renderWithProviders(<CommunityPostLikeButton communityPostId="cp-1" likeCount={4} />);

    fireEvent.click(await screen.findByRole("button", { name: "取消点赞" }));

    expect(screen.getByRole("button", { name: "点赞" })).toHaveTextContent("3");
    await waitFor(() =>
      expect(unlikeCommunityPost).toHaveBeenCalledWith({ userId: "user-1", communityPostId: "cp-1" })
    );
  });

  it("rolls back the optimistic change when liking fails", async () => {
    login();
    likeCommunityPost.mockRejectedValue(new Error("boom"));
    renderWithProviders(<CommunityPostLikeButton communityPostId="cp-1" likeCount={3} />);

    fireEvent.click(screen.getByRole("button", { name: "点赞" }));

    await waitFor(() => expect(screen.getByRole("button", { name: "点赞" })).toHaveTextContent("3"));
  });
});
