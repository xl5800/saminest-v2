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

  it("shows the display name", async () => {
    renderWithProviders(<ProfilePage />);

    expect(await screen.findByText("Alice")).toBeInTheDocument();
  });

  // 24 号卡：头像卡片不再展示简介/邮箱这两行文字——邮箱以前是靠
  // ProfileSummary 的 tertiaryText 传的，这个 prop 已经整个删掉了。
  it("does not show the bio or the email under the avatar (24 号卡：头像卡片精简)", async () => {
    getMyProfile.mockResolvedValue({
      displayName: "Alice",
      bio: "Hi there, I like hiking.",
      avatarUrl: null,
      locationName: "Rockville"
    });

    renderWithProviders(<ProfilePage />);

    await screen.findByText("Alice");
    expect(screen.queryByText("Hi there, I like hiking.")).not.toBeInTheDocument();
    expect(screen.queryByText("alice@example.com")).not.toBeInTheDocument();
    expect(screen.queryByText("Rockville")).not.toBeInTheDocument();
  });

  describe("avatar card: edit-profile pencil icon (24.2)", () => {
    it("shows a small circular '编辑资料' icon-button link to /profile/edit, not a full-width list row", async () => {
      renderWithProviders(<ProfilePage />);

      await screen.findByText("Alice");
      expect(screen.getByRole("link", { name: "编辑资料" })).toHaveAttribute(
        "href",
        "/profile/edit"
      );
    });
  });

  // 头像卡片下面这两栏最初一版展示真实数字（复用 useMyPostsQuery/
  // useFavoritePostIdsQuery 取 .length），用户反馈不需要显示数字，改成了
  // 纯文字+图标的入口——不再调用那两个 hook，这里只验证"文字入口存在、
  // 点击能跳转"，不再断言具体数字。
  describe("avatar card: 我的发布/我的收藏 entries (24.2)", () => {
    it("shows a '我的发布' entry linking to /my-posts, with no count number", async () => {
      renderWithProviders(<ProfilePage />);

      const link = await screen.findByRole("link", { name: "我的发布" });
      expect(link).toHaveAttribute("href", "/my-posts");
      expect(link).not.toHaveTextContent(/\d/);
    });

    it("shows a '我的收藏' entry linking to /favorites, with no count number", async () => {
      renderWithProviders(<ProfilePage />);

      const link = await screen.findByRole("link", { name: "我的收藏" });
      expect(link).toHaveAttribute("href", "/favorites");
      expect(link).not.toHaveTextContent(/\d/);
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
  // 设置齿轮）整个删掉，顶部不再有独立顶栏。24 号卡 24.1 调查确认：这个
  // 页面本来就没有 14 号卡那套地区 pill + 搜索栏（任务卡描述的顶部现状跟
  // 当前代码不符，24.2.1 因此本来就已经满足），这里继续断言"顶部什么都
  // 没有"这条不变的事实，同时明确覆盖一下"地区/搜索"这两个具体元素。
  describe("no TopBar, no region pill, no search bar at the top (11 号卡 + 24 号卡 24.1 结论)", () => {
    it("has no visible '我的' title text, no 设置 gear button, no brand name/发布 button/? help icon at the top", async () => {
      renderWithProviders(<ProfilePage />);

      await screen.findByText("Alice");
      expect(screen.queryByRole("button", { name: "设置" })).not.toBeInTheDocument();
      expect(screen.queryByText("Saminest")).not.toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "发布" })).not.toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "?" })).not.toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "返回" })).not.toBeInTheDocument();
    });

    it("has no region-select pill button and no search icon/input", async () => {
      renderWithProviders(<ProfilePage />);

      await screen.findByText("Alice");
      expect(screen.queryByText("选择地区")).not.toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "搜索" })).not.toBeInTheDocument();
      expect(screen.queryByRole("searchbox")).not.toBeInTheDocument();
    });

    it("still exposes a single sr-only <h1>我的</h1> landmark for screen readers, even with no visible TopBar title", async () => {
      renderWithProviders(<ProfilePage />);

      await screen.findByText("Alice");
      const heading = screen.getByRole("heading", { name: "我的" });
      expect(heading.tagName).toBe("H1");
      expect(heading).toHaveClass("sr-only");
    });
  });

  // 24.3：合并成一张"我的内容"卡片，只有我的活动/已屏蔽两行。
  describe("'我的内容' group card (24.3)", () => {
    it("contains exactly 我的活动/已屏蔽 two rows, in that order, linking to the existing pages", async () => {
      renderWithProviders(<ProfilePage />);

      await screen.findByText("Alice");
      const group = screen.getByRole("navigation", { name: "我的内容" });
      const links = within(group).getAllByRole("link");
      expect(links.map((link) => link.textContent?.replace("›", ""))).toEqual(["我的活动", "已屏蔽"]);
      expect(links[0]).toHaveAttribute("href", "/my-activities");
      expect(links[1]).toHaveAttribute("href", "/blocked-users");
    });

    // 24.2：我的发布/我的收藏挪到头像卡片下面的入口，不再是这张卡片/任何
    // 列表里的一行。
    it("no longer contains 我的发布/我的收藏 as list rows (moved under the avatar card)", async () => {
      renderWithProviders(<ProfilePage />);

      const group = await screen.findByRole("navigation", { name: "我的内容" });
      expect(within(group).queryByText("我的发布")).not.toBeInTheDocument();
      expect(within(group).queryByText("我的收藏")).not.toBeInTheDocument();
    });
  });

  // 24.4：合并成一张"账号与服务"卡片——帮助与客服（原"联系客服"文案）/
  // 设置/后台管理（仅管理员）。
  describe("'账号与服务' group card (24.4)", () => {
    it("shows '帮助与客服' (renamed from '联系客服') linking to /feedback, and '设置' linking to /settings, for a non-admin user (no 后台管理 row)", async () => {
      getCurrentUserRole.mockResolvedValue("user");

      renderWithProviders(<ProfilePage />);

      await screen.findByText("Alice");
      const group = screen.getByRole("navigation", { name: "账号与服务" });
      const links = within(group).getAllByRole("link");
      expect(links.map((link) => link.textContent?.replace("›", ""))).toEqual(["帮助与客服", "设置"]);
      expect(links[0]).toHaveAttribute("href", "/feedback");
      expect(links[1]).toHaveAttribute("href", "/settings");
      expect(screen.queryByText("联系客服")).not.toBeInTheDocument();
    });

    it("shows '后台管理' as the third row, linking to /admin/posts, only for an admin account", async () => {
      getCurrentUserRole.mockResolvedValue("admin");

      renderWithProviders(<ProfilePage />);

      const group = await screen.findByRole("navigation", { name: "账号与服务" });
      // isAdmin 是独立的一次异步查询（useIsAdminQuery），跟分组卡片本身
      // 的渲染时机不是同一个 tick——先等"后台管理"这一行真的出现，再取
      // 整组链接顺序，避免在 isAdmin 还没回来之前就断言。
      await within(group).findByRole("link", { name: /后台管理/ });
      const links = within(group).getAllByRole("link");
      expect(links.map((link) => link.textContent?.replace("›", ""))).toEqual([
        "帮助与客服",
        "设置",
        "后台管理"
      ]);
      expect(links[2]).toHaveAttribute("href", "/admin/posts");
    });

    // 24.1 调查结论：这个权限判断（useIsAdminQuery，跟 RequireAdmin 路由
    // 守卫共用同一个 hook）在改版前就已经存在，这次只是原样保留，不是新增。
    it("does not show '后台管理' for a non-admin account, even after the profile has loaded", async () => {
      getCurrentUserRole.mockResolvedValue("user");

      renderWithProviders(<ProfilePage />);

      await screen.findByText("Alice");
      expect(screen.queryByRole("link", { name: /后台管理/ })).not.toBeInTheDocument();
    });
  });

  // 24.5：退出登录改成单独一张白色圆角卡片，红色文字，不再是描边按钮。
  describe("退出登录 (24.5)", () => {
    it("renders as a centered red-text button, not the old bordered-outline button", async () => {
      renderWithProviders(<ProfilePage />);

      await screen.findByText("Alice");
      const button = screen.getByRole("button", { name: "退出登录" });
      expect(button).toHaveClass("text-danger");
      expect(button.className).not.toContain("border");
    });
  });
});
