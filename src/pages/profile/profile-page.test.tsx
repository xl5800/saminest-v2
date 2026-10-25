import { cleanup, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// 功能开关（config/feature-flags.ts）：这个文件的用例测的是功能打开时的行为，
// 默认都按"打开"跑；个别用例把开关改成 false 测关闭时的样子。
const featureFlags = vi.hoisted(() => ({ USER_PROFILE_PAGE_ENABLED: true, PHONE_REGISTRATION_ENABLED: true }));
vi.mock("../../config/feature-flags", () => ({
  get USER_PROFILE_PAGE_ENABLED() {
    return featureFlags.USER_PROFILE_PAGE_ENABLED;
  },
  get PHONE_REGISTRATION_ENABLED() {
    return featureFlags.PHONE_REGISTRATION_ENABLED;
  }
}));

const {
  getCurrentUserRole,
  getMyProfile,
  navigateMock,
  getOrCreateOwnSupportConversation,
  usePendingActivityParticipantsCountQuery,
  useMyPostsQuery,
  useFavoritePostIdsQuery,
  useMyJoinedActivitiesQuery,
  useMyOrganizedActivitiesQuery
} = vi.hoisted(() => ({
  getCurrentUserRole: vi.fn(),
  getMyProfile: vi.fn(),
  navigateMock: vi.fn(),
  getOrCreateOwnSupportConversation: vi.fn(),
  usePendingActivityParticipantsCountQuery: vi.fn(),
  useMyPostsQuery: vi.fn(),
  useFavoritePostIdsQuery: vi.fn(),
  useMyJoinedActivitiesQuery: vi.fn(),
  useMyOrganizedActivitiesQuery: vi.fn()
}));

vi.mock("../../repositories/profiles-repository", () => ({
  getCurrentUserRole,
  getMyProfile
}));
// "帮助与客服"这一行调用这个仓库函数再跳转——单独 mock 掉，避免测试真的打到 Supabase。
vi.mock("../../repositories/conversations-repository", () => ({
  getOrCreateOwnSupportConversation
}));
vi.mock("../../features/activities/use-has-pending-activity-participants-query", () => ({
  usePendingActivityParticipantsCountQuery
}));
// 我的页改版：顶部三个数字直接用这几个列表查询的条数。
vi.mock("../../features/my-posts/use-my-posts-query", () => ({ useMyPostsQuery }));
vi.mock("../../features/favorites/use-favorite-post-ids-query", () => ({ useFavoritePostIdsQuery }));
vi.mock("../../features/activities/use-my-joined-activities-query", () => ({ useMyJoinedActivitiesQuery }));
vi.mock("../../features/activities/use-my-organized-activities-query", () => ({ useMyOrganizedActivitiesQuery }));
vi.mock("react-router-dom", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react-router-dom")>();
  return { ...actual, useNavigate: () => navigateMock };
});

import { useAuthStore } from "../../store/auth-store";
import { useSelectedRegionStore } from "../../store/selected-region-store";
import { renderWithProviders } from "../../test/render-with-providers";
import { ProfilePage } from "./profile-page";

const initialAuthState = useAuthStore.getState();

describe("ProfilePage", () => {
  afterEach(() => {
    cleanup();
  });

  beforeEach(() => {
    featureFlags.USER_PROFILE_PAGE_ENABLED = true;
    useAuthStore.setState(initialAuthState, true);
    useAuthStore.getState().setSession({
      user: { id: "user-1", email: "alice@example.com", created_at: "2026-03-01T00:00:00.000Z" }
    } as never);
    useSelectedRegionStore.setState({
      selectedRegion: { stateCode: "VA", stateName: "Virginia", cityId: null, cityName: null }
    });
    getCurrentUserRole.mockReset();
    getMyProfile.mockReset();
    navigateMock.mockReset();
    getOrCreateOwnSupportConversation.mockReset();
    getCurrentUserRole.mockResolvedValue("user");
    getMyProfile.mockResolvedValue({ displayName: "Alice" });
    usePendingActivityParticipantsCountQuery.mockReset();
    usePendingActivityParticipantsCountQuery.mockReturnValue({ data: 0 });
    useMyPostsQuery.mockReturnValue({ data: [{ id: "p1" }, { id: "p2" }, { id: "p3" }] });
    useFavoritePostIdsQuery.mockReturnValue({ data: ["f1", "f2"] });
    useMyJoinedActivitiesQuery.mockReturnValue({ data: [{ id: "a1" }] });
    useMyOrganizedActivitiesQuery.mockReturnValue({ data: [{ id: "a1" }, { id: "a2" }] });
  });

  it("shows the display name", async () => {
    renderWithProviders(<ProfilePage />);

    expect(await screen.findByText("Alice")).toBeInTheDocument();
  });

  // 我的页改版：昵称下面一行是"地区 · 哪年加入"。
  it("shows the region and the year the account was created under the name", async () => {
    renderWithProviders(<ProfilePage />);

    expect(await screen.findByText("弗吉尼亚 · 2026 年加入")).toBeInTheDocument();
  });

  it("renders a profile-header-shaped skeleton, not a plain 加载中 paragraph, while the profile query is pending", () => {
    getMyProfile.mockReturnValue(new Promise(() => {}));

    const { container } = renderWithProviders(<ProfilePage />);

    const status = screen.getByRole("status");
    expect(status.querySelector("p")).not.toBeInTheDocument();
    expect(status.querySelector(".sr-only")).toHaveTextContent("加载中…");
    const pulsingBlocks = container.querySelectorAll(".animate-pulse");
    expect(pulsingBlocks.length).toBeGreaterThan(0);
    for (const block of pulsingBlocks) {
      expect(block).toHaveAttribute("aria-hidden", "true");
    }
  });

  it("does not show the email or the profile's location name", async () => {
    getMyProfile.mockResolvedValue({ displayName: "Alice", avatarUrl: null, locationName: "Rockville" });

    renderWithProviders(<ProfilePage />);

    await screen.findByText("Alice");
    expect(screen.queryByText("alice@example.com")).not.toBeInTheDocument();
    expect(screen.queryByText("Rockville")).not.toBeInTheDocument();
  });

  it("shows the bio under the header when profile.bio is set", async () => {
    getMyProfile.mockResolvedValue({ displayName: "Alice", avatarUrl: null, bio: "Hi there, I like hiking." });

    renderWithProviders(<ProfilePage />);

    expect(await screen.findByText("Hi there, I like hiking.")).toBeInTheDocument();
  });

  it("shows the age next to the name when profile.age is set", async () => {
    getMyProfile.mockResolvedValue({ displayName: "Alice", avatarUrl: null, bio: null, age: 28 });

    renderWithProviders(<ProfilePage />);

    expect(await screen.findByText("28 岁")).toBeInTheDocument();
  });

  describe("header links", () => {
    it("links the avatar and name to the user's own public page when that page is enabled", async () => {
      renderWithProviders(<ProfilePage />);

      await screen.findByText("Alice");
      expect(screen.getByRole("link", { name: "查看个人主页" })).toHaveAttribute("href", "/users/user-1");
    });

    it("does not offer the public page while it is turned off", async () => {
      featureFlags.USER_PROFILE_PAGE_ENABLED = false;
      renderWithProviders(<ProfilePage />);

      await screen.findByText("Alice");
      expect(screen.queryByRole("link", { name: "查看个人主页" })).not.toBeInTheDocument();
    });

    it("has a 编辑资料 button pointing to /profile/edit", async () => {
      renderWithProviders(<ProfilePage />);

      await screen.findByText("Alice");
      expect(screen.getByRole("link", { name: "编辑资料" })).toHaveAttribute("href", "/profile/edit");
    });
  });

  // 我的页改版：发布 / 收藏 / 活动三个数字，点了进对应页面。
  describe("我的发布 / 我的收藏 / 我的活动 numbers", () => {
    it("shows the three counts with links, counting an activity once even if I both joined and organized it", async () => {
      renderWithProviders(<ProfilePage />);

      await screen.findByText("Alice");
      const nav = screen.getByRole("navigation", { name: "我的发布、收藏和活动" });
      const links = within(nav).getAllByRole("link");
      expect(links.map((link) => link.textContent)).toEqual(["3我的发布", "2我的收藏", "2我的活动"]);
      expect(links[0]).toHaveAttribute("href", "/my-posts");
      expect(links[1]).toHaveAttribute("href", "/favorites");
      expect(links[2]).toHaveAttribute("href", "/my-activities");
    });

    it("shows a dash while a count is still loading", async () => {
      useMyPostsQuery.mockReturnValue({ data: undefined });

      renderWithProviders(<ProfilePage />);

      const link = await screen.findByRole("link", { name: /我的发布/ });
      expect(link).toHaveTextContent("–我的发布");
    });

    // 审核入口红点任务卡："我的活动"显示待处理申请数。
    it("shows the pending applicant count on 我的活动", async () => {
      usePendingActivityParticipantsCountQuery.mockReturnValue({ data: 3 });
      renderWithProviders(<ProfilePage />);

      const link = await screen.findByRole("link", { name: /我的活动/ });
      expect(within(link).getByTestId("group-row-badge")).toHaveTextContent("3");
    });

    it("does not show a badge on 我的活动 when there are no pending applicants", async () => {
      renderWithProviders(<ProfilePage />);

      const link = await screen.findByRole("link", { name: /我的活动/ });
      expect(within(link).queryByTestId("group-row-badge")).not.toBeInTheDocument();
    });
  });

  describe("no TopBar, no region pill, no search bar at the top", () => {
    it("has no brand name, 发布 / ? / 返回 buttons at the top", async () => {
      renderWithProviders(<ProfilePage />);

      await screen.findByText("Alice");
      expect(screen.queryByText("华邻")).not.toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "发布" })).not.toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "?" })).not.toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "返回" })).not.toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "搜索" })).not.toBeInTheDocument();
    });

    it("still exposes a single sr-only <h1>我的</h1> landmark for screen readers", async () => {
      renderWithProviders(<ProfilePage />);

      await screen.findByText("Alice");
      const heading = screen.getByRole("heading", { name: "我的" });
      expect(heading.tagName).toBe("H1");
      expect(heading).toHaveClass("sr-only");
    });
  });

  describe("'我的内容' group card", () => {
    it("contains exactly 我的社区发帖 / 已屏蔽, in that order", async () => {
      renderWithProviders(<ProfilePage />);

      await screen.findByText("Alice");
      const group = screen.getByRole("navigation", { name: "我的内容" });
      const links = within(group).getAllByRole("link");
      expect(links.map((link) => link.textContent?.replace("›", ""))).toEqual(["我的社区发帖", "已屏蔽"]);
      expect(links[0]).toHaveAttribute("href", "/my-community-posts");
      expect(links[1]).toHaveAttribute("href", "/blocked-users");
    });
  });

  describe("'账号与服务' group card", () => {
    it("shows 帮助与客服 (a button) and 设置 (a link) for a non-admin user, with no 后台管理 row", async () => {
      getCurrentUserRole.mockResolvedValue("user");

      renderWithProviders(<ProfilePage />);

      await screen.findByText("Alice");
      const group = screen.getByRole("navigation", { name: "账号与服务" });
      const rows = group.querySelectorAll("a, button");
      expect(Array.from(rows).map((row) => row.textContent?.replace("›", ""))).toEqual(["帮助与客服", "设置"]);
      expect(rows[0].tagName).toBe("BUTTON");
      expect(rows[1]).toHaveAttribute("href", "/settings");
      expect(screen.queryByRole("link", { name: /后台管理/ })).not.toBeInTheDocument();
    });

    it("adds 后台管理 linking to /admin/posts only for an admin account", async () => {
      getCurrentUserRole.mockResolvedValue("admin");

      renderWithProviders(<ProfilePage />);

      const group = await screen.findByRole("navigation", { name: "账号与服务" });
      await within(group).findByRole("link", { name: /后台管理/ });
      const rows = group.querySelectorAll("a, button");
      expect(Array.from(rows).map((row) => row.textContent?.replace("›", ""))).toEqual([
        "帮助与客服",
        "设置",
        "后台管理"
      ]);
      expect(rows[2]).toHaveAttribute("href", "/admin/posts");
    });
  });

  describe("'帮助与客服' 按钮", () => {
    it("stretches to the full row width (w-full text-left)", async () => {
      renderWithProviders(<ProfilePage />);

      await screen.findByText("Alice");
      const helpButton = screen.getByRole("button", { name: "帮助与客服" });
      expect(helpButton.className).toMatch(/\bw-full\b/);
      expect(helpButton.className).toMatch(/text-left/);
    });

    it("calls get_or_create_own_system_conversation and navigates to the resulting conversation on click", async () => {
      getOrCreateOwnSupportConversation.mockResolvedValue({ conversationId: "conversation-1" });

      renderWithProviders(<ProfilePage />);

      await screen.findByText("Alice");
      fireEvent.click(screen.getByRole("button", { name: "帮助与客服" }));

      await waitFor(() => {
        expect(getOrCreateOwnSupportConversation).toHaveBeenCalled();
      });
      await waitFor(() => {
        expect(navigateMock).toHaveBeenCalledWith("/messages/conversation-1");
      });
    });

    it("shows a generic error message when the RPC fails, and does not navigate", async () => {
      getOrCreateOwnSupportConversation.mockRejectedValue(new Error("network down"));

      renderWithProviders(<ProfilePage />);

      await screen.findByText("Alice");
      fireEvent.click(screen.getByRole("button", { name: "帮助与客服" }));

      expect(await screen.findByRole("alert")).toHaveTextContent("打开客服会话失败，请稍后重试。");
      expect(navigateMock).not.toHaveBeenCalledWith(expect.stringMatching(/^\/messages\//));
    });
  });

  // 我的页改版：退出登录挪进设置页（见 settings-page.test.tsx）。
  it("no longer has a 退出登录 button on this page", async () => {
    renderWithProviders(<ProfilePage />);

    await screen.findByText("Alice");
    expect(screen.queryByRole("button", { name: "退出登录" })).not.toBeInTheDocument();
  });
});
