import { cleanup, fireEvent, screen } from "@testing-library/react";
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

    expect(mutateMock).toHaveBeenCalledWith({
      userId: "user-1",
      postId: "post-1",
      isCurrentlyFavorited: false
    });
  });

  it("calls the mutation to remove a favorite when logged in and the post is already favorited", () => {
    useAuthStore.getState().setSession({ user: { id: "user-1" } } as never);
    useFavoritePostIdsQuery.mockReturnValue({ data: ["post-1"] });

    renderWithProviders(<FavoriteButton postId="post-1" />);

    const button = screen.getByRole("button");
    expect(button).toHaveAttribute("aria-pressed", "true");

    fireEvent.click(button);

    expect(mutateMock).toHaveBeenCalledWith({
      userId: "user-1",
      postId: "post-1",
      isCurrentlyFavorited: true
    });
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
