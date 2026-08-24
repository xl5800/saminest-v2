import { cleanup, fireEvent, screen, waitFor, within } from "@testing-library/react";
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

  // 13 号卡（"我的"页新增"已屏蔽"管理入口）。
  it("shows the '已屏蔽' link to /blocked-users", async () => {
    renderWithProviders(<ProfilePage />);

    await screen.findByText("Alice");
    expect(screen.getByRole("link", { name: "已屏蔽" })).toHaveAttribute(
      "href",
      "/blocked-users"
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

  // 11 号卡（我的页面收尾）：TopBar（06 号卡加的 tab 变体，标题"我的" +
  // 设置齿轮）整个删掉，顶部不再有独立顶栏；"设置"从顶栏图标移到功能
  // 列表最后一行。
  describe("no TopBar (11 号卡：顶栏精简)", () => {
    it("has no visible '我的' title text, no 设置 gear button, no brand name/发布 button/? help icon at the top", async () => {
      renderWithProviders(<ProfilePage />);

      await screen.findByText("Alice");
      // TopBar 整个没了：找不到齿轮按钮（原来是 role=button, name="设置"），
      // 也没有品牌名/文字"发布"按钮/"?"帮助图标——这些本来就是 TopBar
      // 才会渲染的东西。
      expect(screen.queryByRole("button", { name: "设置" })).not.toBeInTheDocument();
      expect(screen.queryByText("Saminest")).not.toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "发布" })).not.toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "?" })).not.toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "返回" })).not.toBeInTheDocument();
    });

    it("still exposes a single sr-only <h1>我的</h1> landmark for screen readers, even with no visible TopBar title", async () => {
      renderWithProviders(<ProfilePage />);

      await screen.findByText("Alice");
      const heading = screen.getByRole("heading", { name: "我的" });
      expect(heading.tagName).toBe("H1");
      expect(heading).toHaveClass("sr-only");
    });
  });

  describe("'设置' as the last settings-list row (moved down from the old TopBar gear)", () => {
    it("shows a '设置' link to /settings as the last row in the functional list", async () => {
      renderWithProviders(<ProfilePage />);

      await screen.findByText("Alice");
      expect(screen.getByRole("link", { name: "设置" })).toHaveAttribute("href", "/settings");
    });

    // 13 号卡："已屏蔽"插进"联系客服"和"设置"之间——归到列表靠后、跟设置类
    // 放一起，不是插进中间的业务功能行之间。
    it("orders the functional list as 编辑资料/我的发布/我的活动/我的收藏/联系客服/已屏蔽/设置", async () => {
      renderWithProviders(<ProfilePage />);

      await screen.findByText("Alice");
      const list = screen.getByRole("navigation", { name: "我的功能" });
      // textContent 会把装饰性 chevron（"›"，aria-hidden）也带出来，先去掉
      // 它再比对——真正要验证的是标签文字的顺序，不是原样字符串。
      const labels = within(list)
        .getAllByRole("link")
        .map((link) => link.textContent?.replace("›", ""));

      expect(labels).toEqual([
        "编辑资料",
        "我的发布",
        "我的活动",
        "我的收藏",
        "联系客服",
        "已屏蔽",
        "设置"
      ]);
    });
  });

  describe("avatar links to the self public-profile preview (11 号卡 11.2)", () => {
    it("wraps the avatar in a link to /users/<self id>", async () => {
      renderWithProviders(<ProfilePage />);

      await screen.findByText("Alice");
      expect(screen.getByRole("link", { name: "预览我的主页" })).toHaveAttribute(
        "href",
        "/users/user-1"
      );
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
