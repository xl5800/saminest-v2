import { act, cleanup, fireEvent, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { useFavoritePostIdsQuery, useToggleFavoriteMutation, navigateMock, mutateMock } =
  vi.hoisted(() => ({
    useFavoritePostIdsQuery: vi.fn(),
    useToggleFavoriteMutation: vi.fn(),
    navigateMock: vi.fn(),
    mutateMock: vi.fn()
  }));

vi.mock("../features/favorites/use-favorite-post-ids-query", () => ({
  useFavoritePostIdsQuery
}));
vi.mock("../features/favorites/use-toggle-favorite-mutation", () => ({
  useToggleFavoriteMutation
}));
vi.mock("react-router-dom", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react-router-dom")>();
  return { ...actual, useNavigate: () => navigateMock };
});

import { useAuthStore } from "../store/auth-store";
import { renderWithProviders } from "../test/render-with-providers";
import { AppError } from "../utils/app-error";
import { FavoriteButton } from "./favorite-button";

const initialAuthState = useAuthStore.getState();

describe("FavoriteButton", () => {
  afterEach(() => {
    cleanup();
  });

  beforeEach(() => {
    useAuthStore.setState(initialAuthState, true);
    navigateMock.mockReset();
    mutateMock.mockReset();
    useFavoritePostIdsQuery.mockReset();
    useToggleFavoriteMutation.mockReset();

    useFavoritePostIdsQuery.mockReturnValue({ data: [] });
    useToggleFavoriteMutation.mockReturnValue({ mutate: mutateMock, isPending: false });
  });

  it("navigates to /login and does not call the mutation when logged out", () => {
    renderWithProviders(<FavoriteButton postId="post-1" />);

    fireEvent.click(screen.getByRole("button"));

    expect(navigateMock).toHaveBeenCalledWith("/login");
    expect(mutateMock).not.toHaveBeenCalled();
  });

  it("calls the mutation to add a favorite when logged in and the post is not yet favorited", () => {
    useAuthStore.getState().setSession({ user: { id: "user-1" } } as never);
    useFavoritePostIdsQuery.mockReturnValue({ data: [] });

    renderWithProviders(<FavoriteButton postId="post-1" />);

    const button = screen.getByRole("button");
    expect(button).toHaveAttribute("aria-pressed", "false");

    fireEvent.click(button);

    expect(mutateMock).toHaveBeenCalledWith(
      {
        userId: "user-1",
        postId: "post-1",
        isCurrentlyFavorited: false
      },
      expect.objectContaining({ onError: expect.any(Function) })
    );
  });

  it("calls the mutation to remove a favorite when logged in and the post is already favorited", () => {
    useAuthStore.getState().setSession({ user: { id: "user-1" } } as never);
    useFavoritePostIdsQuery.mockReturnValue({ data: ["post-1"] });

    renderWithProviders(<FavoriteButton postId="post-1" />);

    const button = screen.getByRole("button");
    expect(button).toHaveAttribute("aria-pressed", "true");

    fireEvent.click(button);

    expect(mutateMock).toHaveBeenCalledWith(
      {
        userId: "user-1",
        postId: "post-1",
        isCurrentlyFavorited: true
      },
      expect.objectContaining({ onError: expect.any(Function) })
    );
  });

  it("shows the account-restricted message when the mutation's onError reports ACCOUNT_RESTRICTED", () => {
    useAuthStore.getState().setSession({ user: { id: "user-1" } } as never);
    useFavoritePostIdsQuery.mockReturnValue({ data: [] });

    renderWithProviders(<FavoriteButton postId="post-1" />);

    fireEvent.click(screen.getByRole("button"));

    const { onError } = mutateMock.mock.calls[0][1];
    act(() => {
      onError(
        new AppError(
          "您的账号当前处于限制状态，无法执行此操作，如有疑问请联系管理员。",
          "ACCOUNT_RESTRICTED"
        )
      );
    });

    expect(screen.getByRole("alert")).toHaveTextContent(
      "您的账号当前处于限制状态，无法执行此操作，如有疑问请联系管理员。"
    );
  });

  it("does not show any alert when the mutation's onError reports a generic (non-restricted) failure", () => {
    useAuthStore.getState().setSession({ user: { id: "user-1" } } as never);
    useFavoritePostIdsQuery.mockReturnValue({ data: [] });

    renderWithProviders(<FavoriteButton postId="post-1" />);

    fireEvent.click(screen.getByRole("button"));

    const { onError } = mutateMock.mock.calls[0][1];
    act(() => {
      onError(new Error("network down"));
    });

    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("disables the button while the mutation is pending, preventing a double submit", () => {
    useAuthStore.getState().setSession({ user: { id: "user-1" } } as never);
    useFavoritePostIdsQuery.mockReturnValue({ data: [] });
    useToggleFavoriteMutation.mockReturnValue({ mutate: mutateMock, isPending: true });

    renderWithProviders(<FavoriteButton postId="post-1" />);

    const button = screen.getByRole("button");
    expect(button).toBeDisabled();

    fireEvent.click(button);

    expect(mutateMock).not.toHaveBeenCalled();
  });
});
