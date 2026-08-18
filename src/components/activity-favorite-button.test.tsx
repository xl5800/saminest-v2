import { act, cleanup, fireEvent, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { useActivityFavoriteIdsQuery, useToggleActivityFavoriteMutation, navigateMock, mutateMock } =
  vi.hoisted(() => ({
    useActivityFavoriteIdsQuery: vi.fn(),
    useToggleActivityFavoriteMutation: vi.fn(),
    navigateMock: vi.fn(),
    mutateMock: vi.fn()
  }));

vi.mock("../features/activities/use-activity-favorite-ids-query", () => ({
  useActivityFavoriteIdsQuery
}));
vi.mock("../features/activities/use-toggle-activity-favorite-mutation", () => ({
  useToggleActivityFavoriteMutation
}));
vi.mock("react-router-dom", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react-router-dom")>();
  return { ...actual, useNavigate: () => navigateMock };
});

import { useAuthStore } from "../store/auth-store";
import { renderWithProviders } from "../test/render-with-providers";
import { AppError } from "../utils/app-error";
import { ActivityFavoriteButton } from "./activity-favorite-button";

const initialAuthState = useAuthStore.getState();

describe("ActivityFavoriteButton", () => {
  afterEach(() => {
    cleanup();
  });

  beforeEach(() => {
    useAuthStore.setState(initialAuthState, true);
    navigateMock.mockReset();
    mutateMock.mockReset();
    useActivityFavoriteIdsQuery.mockReset();
    useToggleActivityFavoriteMutation.mockReset();

    useActivityFavoriteIdsQuery.mockReturnValue({ data: [] });
    useToggleActivityFavoriteMutation.mockReturnValue({ mutate: mutateMock, isPending: false });
  });

  it("navigates to /login and does not call the mutation when logged out", () => {
    renderWithProviders(<ActivityFavoriteButton activityId="act-1" />);

    fireEvent.click(screen.getByRole("button"));

    expect(navigateMock).toHaveBeenCalledWith("/login");
    expect(mutateMock).not.toHaveBeenCalled();
  });

  it("calls the mutation to add a favorite when logged in and the activity is not yet favorited", () => {
    useAuthStore.getState().setSession({ user: { id: "user-1" } } as never);
    useActivityFavoriteIdsQuery.mockReturnValue({ data: [] });

    renderWithProviders(<ActivityFavoriteButton activityId="act-1" />);

    const button = screen.getByRole("button");
    expect(button).toHaveAttribute("aria-pressed", "false");

    fireEvent.click(button);

    expect(mutateMock).toHaveBeenCalledWith(
      {
        userId: "user-1",
        activityId: "act-1",
        isCurrentlyFavorited: false
      },
      expect.objectContaining({ onError: expect.any(Function) })
    );
  });

  it("calls the mutation to remove a favorite when logged in and the activity is already favorited", () => {
    useAuthStore.getState().setSession({ user: { id: "user-1" } } as never);
    useActivityFavoriteIdsQuery.mockReturnValue({ data: ["act-1"] });

    renderWithProviders(<ActivityFavoriteButton activityId="act-1" />);

    const button = screen.getByRole("button");
    expect(button).toHaveAttribute("aria-pressed", "true");

    fireEvent.click(button);

    expect(mutateMock).toHaveBeenCalledWith(
      {
        userId: "user-1",
        activityId: "act-1",
        isCurrentlyFavorited: true
      },
      expect.objectContaining({ onError: expect.any(Function) })
    );
  });

  it("renders a filled heart icon (text-danger) when the activity is already favorited", () => {
    useAuthStore.getState().setSession({ user: { id: "user-1" } } as never);
    useActivityFavoriteIdsQuery.mockReturnValue({ data: ["act-1"] });

    const { container } = renderWithProviders(<ActivityFavoriteButton activityId="act-1" />);

    expect(container.querySelector("svg.lucide-heart")).toHaveClass("fill-current", "text-danger");
  });

  it("renders an outline (non-filled) heart icon when the activity is not favorited", () => {
    useAuthStore.getState().setSession({ user: { id: "user-1" } } as never);
    useActivityFavoriteIdsQuery.mockReturnValue({ data: [] });

    const { container } = renderWithProviders(<ActivityFavoriteButton activityId="act-1" />);

    expect(container.querySelector("svg.lucide-heart")).not.toHaveClass("fill-current");
  });

  it("shows the account-restricted message when the mutation's onError reports ACCOUNT_RESTRICTED", () => {
    useAuthStore.getState().setSession({ user: { id: "user-1" } } as never);
    useActivityFavoriteIdsQuery.mockReturnValue({ data: [] });

    renderWithProviders(<ActivityFavoriteButton activityId="act-1" />);

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
    useActivityFavoriteIdsQuery.mockReturnValue({ data: [] });

    renderWithProviders(<ActivityFavoriteButton activityId="act-1" />);

    fireEvent.click(screen.getByRole("button"));

    const { onError } = mutateMock.mock.calls[0][1];
    act(() => {
      onError(new Error("network down"));
    });

    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("disables the button while the mutation is pending, preventing a double submit", () => {
    useAuthStore.getState().setSession({ user: { id: "user-1" } } as never);
    useActivityFavoriteIdsQuery.mockReturnValue({ data: [] });
    useToggleActivityFavoriteMutation.mockReturnValue({ mutate: mutateMock, isPending: true });

    renderWithProviders(<ActivityFavoriteButton activityId="act-1" />);

    const button = screen.getByRole("button");
    expect(button).toBeDisabled();

    fireEvent.click(button);

    expect(mutateMock).not.toHaveBeenCalled();
  });
});
