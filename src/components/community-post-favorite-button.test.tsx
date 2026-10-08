import { act, cleanup, fireEvent, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const {
  useCommunityPostFavoriteIdsQuery,
  useToggleCommunityPostFavoriteMutation,
  navigateMock,
  mutateMock
} = vi.hoisted(() => ({
  useCommunityPostFavoriteIdsQuery: vi.fn(),
  useToggleCommunityPostFavoriteMutation: vi.fn(),
  navigateMock: vi.fn(),
  mutateMock: vi.fn()
}));

vi.mock("../features/favorites/use-community-post-favorite-ids-query", () => ({
  useCommunityPostFavoriteIdsQuery
}));
vi.mock("../features/favorites/use-toggle-community-post-favorite-mutation", () => ({
  useToggleCommunityPostFavoriteMutation
}));
vi.mock("react-router-dom", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react-router-dom")>();
  return { ...actual, useNavigate: () => navigateMock };
});

import { useAuthStore } from "../store/auth-store";
import { renderWithProviders } from "../test/render-with-providers";
import { AppError } from "../utils/app-error";
import { CommunityPostFavoriteButton } from "./community-post-favorite-button";

const initialAuthState = useAuthStore.getState();

describe("CommunityPostFavoriteButton", () => {
  afterEach(() => {
    cleanup();
  });

  beforeEach(() => {
    useAuthStore.setState(initialAuthState, true);
    navigateMock.mockReset();
    mutateMock.mockReset();
    useCommunityPostFavoriteIdsQuery.mockReset();
    useToggleCommunityPostFavoriteMutation.mockReset();

    useCommunityPostFavoriteIdsQuery.mockReturnValue({ data: [] });
    useToggleCommunityPostFavoriteMutation.mockReturnValue({
      mutate: mutateMock,
      isPending: false
    });
  });

  it("navigates to /login and does not call the mutation when logged out", () => {
    renderWithProviders(<CommunityPostFavoriteButton communityPostId="cp-1" />);

    fireEvent.click(screen.getByRole("button"));

    expect(navigateMock).toHaveBeenCalledWith("/login");
    expect(mutateMock).not.toHaveBeenCalled();
  });

  it("adds a favorite when logged in and the post is not yet favorited", () => {
    useAuthStore.getState().setSession({ user: { id: "user-1" } } as never);

    renderWithProviders(<CommunityPostFavoriteButton communityPostId="cp-1" />);

    const button = screen.getByRole("button", { name: "收藏" });
    expect(button).toHaveAttribute("aria-pressed", "false");

    fireEvent.click(button);

    expect(mutateMock).toHaveBeenCalledWith(
      { userId: "user-1", communityPostId: "cp-1", isCurrentlyFavorited: false },
      expect.objectContaining({ onError: expect.any(Function) })
    );
  });

  it("removes the favorite when the post is already favorited", () => {
    useAuthStore.getState().setSession({ user: { id: "user-1" } } as never);
    useCommunityPostFavoriteIdsQuery.mockReturnValue({ data: ["cp-1"] });

    renderWithProviders(<CommunityPostFavoriteButton communityPostId="cp-1" />);

    const button = screen.getByRole("button", { name: "取消收藏" });
    expect(button).toHaveAttribute("aria-pressed", "true");

    fireEvent.click(button);

    expect(mutateMock).toHaveBeenCalledWith(
      { userId: "user-1", communityPostId: "cp-1", isCurrentlyFavorited: true },
      expect.objectContaining({ onError: expect.any(Function) })
    );
  });

  it("renders a filled star icon when favorited and an outline star otherwise", () => {
    useAuthStore.getState().setSession({ user: { id: "user-1" } } as never);
    useCommunityPostFavoriteIdsQuery.mockReturnValue({ data: ["cp-1"] });

    const { container, unmount } = renderWithProviders(
      <CommunityPostFavoriteButton communityPostId="cp-1" />
    );
    expect(container.querySelector("svg.lucide-star")).toHaveClass("text-primary");
    expect(container.querySelector("svg.lucide-star")).toHaveAttribute("fill", "currentColor");
    unmount();

    useCommunityPostFavoriteIdsQuery.mockReturnValue({ data: [] });
    const second = renderWithProviders(<CommunityPostFavoriteButton communityPostId="cp-1" />);
    expect(second.container.querySelector("svg.lucide-star")).toHaveAttribute("fill", "none");
  });

  it("does not treat a stale favorite id list as favorited when logged out", () => {
    useCommunityPostFavoriteIdsQuery.mockReturnValue({ data: ["cp-1"] });

    renderWithProviders(<CommunityPostFavoriteButton communityPostId="cp-1" />);

    expect(screen.getByRole("button")).toHaveAttribute("aria-pressed", "false");
  });

  it("renders the icon variant with a visible 收藏 text label", () => {
    renderWithProviders(<CommunityPostFavoriteButton communityPostId="cp-1" variant="icon" />);

    const button = screen.getByRole("button", { name: "收藏" });
    expect(button).toHaveTextContent("收藏");
  });

  it("shows the account-restricted message when onError reports ACCOUNT_RESTRICTED", () => {
    useAuthStore.getState().setSession({ user: { id: "user-1" } } as never);

    renderWithProviders(<CommunityPostFavoriteButton communityPostId="cp-1" />);
    fireEvent.click(screen.getByRole("button"));

    const { onError } = mutateMock.mock.calls[0][1];
    act(() => {
      onError(new AppError("您的账号当前处于限制状态", "ACCOUNT_RESTRICTED"));
    });

    expect(screen.getByRole("alert")).toHaveTextContent("您的账号当前处于限制状态");
  });

  it("stays silent when onError reports a generic failure", () => {
    useAuthStore.getState().setSession({ user: { id: "user-1" } } as never);

    renderWithProviders(<CommunityPostFavoriteButton communityPostId="cp-1" />);
    fireEvent.click(screen.getByRole("button"));

    const { onError } = mutateMock.mock.calls[0][1];
    act(() => {
      onError(new Error("network down"));
    });

    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("disables the button while the mutation is pending", () => {
    useAuthStore.getState().setSession({ user: { id: "user-1" } } as never);
    useToggleCommunityPostFavoriteMutation.mockReturnValue({
      mutate: mutateMock,
      isPending: true
    });

    renderWithProviders(<CommunityPostFavoriteButton communityPostId="cp-1" />);

    const button = screen.getByRole("button");
    expect(button).toBeDisabled();
    fireEvent.click(button);
    expect(mutateMock).not.toHaveBeenCalled();
  });
});
