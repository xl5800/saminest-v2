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

  it("shows a '编辑资料' button pointing to /profile/edit", async () => {
    renderWithProviders(<ProfilePage />);

    await screen.findByText("Alice");
    expect(screen.getByRole("link", { name: "编辑资料" })).toHaveAttribute(
      "href",
      "/profile/edit"
    );
  });

  it("shows the bio (个性签名) when the profile has one, but not the city — the compact card only has nickname/signature/email per codex_task_profile_redesign.md", async () => {
    getMyProfile.mockResolvedValue({
      displayName: "Alice",
      bio: "Hi there, I like hiking.",
      avatarUrl: null,
      locationName: "Rockville"
    });

    renderWithProviders(<ProfilePage />);

    await screen.findByText("Alice");
    expect(screen.getByText("Hi there, I like hiking.")).toBeInTheDocument();
    expect(screen.queryByText("Rockville")).not.toBeInTheDocument();
  });

  it("does not show a city/bio section when the profile has neither", async () => {
    renderWithProviders(<ProfilePage />);

    await screen.findByText("Alice");
    // getMyProfile 这次只 mock 了 displayName（beforeEach 里
    // { displayName: "Alice" }），bio/locationName 都是 undefined。
    expect(screen.queryByText(/暂无简介/)).not.toBeInTheDocument();
  });

  it("shows the '我的收藏' link to /favorites", async () => {
    renderWithProviders(<ProfilePage />);

    await screen.findByText("Alice");
    expect(screen.getByRole("link", { name: "我的收藏" })).toHaveAttribute(
      "href",
      "/favorites"
    );
  });

  it("shows the '联系客服' link to /feedback", async () => {
    renderWithProviders(<ProfilePage />);

    await screen.findByText("Alice");
    expect(screen.getByRole("link", { name: "联系客服" })).toHaveAttribute(
      "href",
      "/feedback"
    );
  });

  it("shows the '我的发布' link to /my-posts", async () => {
    renderWithProviders(<ProfilePage />);

    await screen.findByText("Alice");
    expect(screen.getByRole("link", { name: "我的发布" })).toHaveAttribute(
      "href",
      "/my-posts"
    );
  });

  it("shows the '我的活动' link to /my-activities", async () => {
    renderWithProviders(<ProfilePage />);

    await screen.findByText("Alice");
    expect(screen.getByRole("link", { name: "我的活动" })).toHaveAttribute(
      "href",
      "/my-activities"
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

  describe("top bar (TopBar tab variant)", () => {
    it("renders '我的' as the page heading and a 设置 button, with no brand name/发布 button/? help icon", async () => {
      renderWithProviders(<ProfilePage />);

      await screen.findByText("Alice");
      expect(screen.getByRole("heading", { name: "我的" })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "设置" })).toBeInTheDocument();
      expect(screen.queryByText("Saminest")).not.toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "发布" })).not.toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "?" })).not.toBeInTheDocument();
    });

    it("navigates to the settings placeholder route when the 设置 gear is clicked", async () => {
      renderWithProviders(<ProfilePage />);

      await screen.findByText("Alice");
      fireEvent.click(screen.getByRole("button", { name: "设置" }));

      expect(navigateMock).toHaveBeenCalledWith("/settings");
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
