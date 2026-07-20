import { cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { getCurrentUserRole, getMyProfile, signOut, navigateMock } = vi.hoisted(() => ({
  getCurrentUserRole: vi.fn(),
  getMyProfile: vi.fn(),
  signOut: vi.fn(),
  navigateMock: vi.fn()
}));

vi.mock("../../repositories/profiles-repository", () => ({
  getCurrentUserRole,
  getMyProfile
}));
vi.mock("../../services/auth/auth-service", () => ({
  authService: { signOut }
}));
vi.mock("react-router-dom", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react-router-dom")>();
  return { ...actual, useNavigate: () => navigateMock };
});

import { useAuthStore } from "../../store/auth-store";
import { renderWithProviders } from "../../test/render-with-providers";
import { ProfilePage } from "./profile-page";

const initialAuthState = useAuthStore.getState();

describe("ProfilePage", () => {
  afterEach(() => {
    cleanup();
  });

  beforeEach(() => {
    useAuthStore.setState(initialAuthState, true);
    useAuthStore.getState().setSession({
      user: { id: "user-1", email: "alice@example.com" }
    } as never);
    getCurrentUserRole.mockReset();
    getMyProfile.mockReset();
    signOut.mockReset();
    navigateMock.mockReset();
    getCurrentUserRole.mockResolvedValue("user");
    getMyProfile.mockResolvedValue({ displayName: "Alice" });
  });

  it("shows the display name and email", async () => {
    renderWithProviders(<ProfilePage />);

    expect(await screen.findByText("Alice")).toBeInTheDocument();
    expect(screen.getByText("alice@example.com")).toBeInTheDocument();
  });

  it("shows the '我的收藏' link to /favorites", async () => {
    renderWithProviders(<ProfilePage />);

    await screen.findByText("Alice");
    expect(screen.getByRole("link", { name: "我的收藏" })).toHaveAttribute(
      "href",
      "/favorites"
    );
  });

  it("calls authService.signOut and navigates home when logging out", async () => {
    signOut.mockResolvedValue(undefined);

    renderWithProviders(<ProfilePage />);
    await screen.findByText("Alice");

    fireEvent.click(screen.getByRole("button", { name: "退出登录" }));

    await waitFor(() => {
      expect(signOut).toHaveBeenCalled();
    });
    await waitFor(() => {
      expect(navigateMock).toHaveBeenCalledWith("/");
    });
  });

  it("does not show the admin section for a non-admin user", async () => {
    getCurrentUserRole.mockResolvedValue("user");

    renderWithProviders(<ProfilePage />);

    await screen.findByText("Alice");
    expect(screen.queryByRole("link", { name: "后台管理" })).not.toBeInTheDocument();
  });

  it("shows the admin section for an admin user", async () => {
    getCurrentUserRole.mockResolvedValue("admin");

    renderWithProviders(<ProfilePage />);

    await screen.findByText("Alice");
    expect(await screen.findByRole("link", { name: "后台管理" })).toHaveAttribute(
      "href",
      "/admin/posts"
    );
  });
});
