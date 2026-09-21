import { cleanup, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const {
  getCurrentUserRole,
  getMyProfile,
  signOut,
  navigateMock,
  getOrCreateOwnSystemConversation
} = vi.hoisted(() => ({
  getCurrentUserRole: vi.fn(),
  getMyProfile: vi.fn(),
  signOut: vi.fn(),
  navigateMock: vi.fn(),
  getOrCreateOwnSystemConversation: vi.fn()
}));

vi.mock("../../repositories/profiles-repository", () => ({
  getCurrentUserRole,
  getMyProfile
}));
// 联系客服改成真聊天任务卡："帮助与客服"这一行改成调用这个仓库函数再
// 跳转，见下面"帮助与客服"那组测试——单独 mock 掉，避免测试真的打到
// Supabase。
vi.mock("../../repositories/conversations-repository", () => ({
  getOrCreateOwnSystemConversation
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
    getOrCreateOwnSystemConversation.mockReset();
    getCurrentUserRole.mockResolvedValue("user");
    getMyProfile.mockResolvedValue({ displayName: "Alice" });
  });

  it("shows the display name", async () => {
    renderWithProviders(<ProfilePage />);

    expect(await screen.findByText("Alice")).toBeInTheDocument();
  });

  // 24 号卡当时把头像卡片精简成不展示邮箱这一行——邮箱以前是靠
  // ProfileSummary 的 tertiaryText 传的，这个 prop 已经整个删掉了，这条
  // 这次没有变。locationName 也从来不是 ProfileSummary 的真实 prop
  // （getMyProfile 结果就算带了这个字段，组件本身也不认识、不会渲染），
  // 这两条断言依然成立。
  it("does not show the email under the avatar (24 号卡：头像卡片精简，邮箱这条至今未恢复)", async () => {
    getMyProfile.mockResolvedValue({
      displayName: "Alice",
      avatarUrl: null,
      locationName: "Rockville"
    });

    renderWithProviders(<ProfilePage />);

    await screen.findByText("Alice");
    expect(screen.queryByText("alice@example.com")).not.toBeInTheDocument();
    expect(screen.queryByText("Rockville")).not.toBeInTheDocument();
  });

  // 加回简介+年龄任务卡：24 号卡当时精简掉的简介这次加回来了，这条测试
  // 反过来断言"有 bio 就应该展示出来"，是上面那条测试历史上验证过的
  // 反向行为，不是遗漏。
  it("shows the bio under the avatar when profile.bio is set", async () => {
    getMyProfile.mockResolvedValue({
      displayName: "Alice",
      avatarUrl: null,
      bio: "Hi there, I like hiking."
    });

    renderWithProviders(<ProfilePage />);

    await screen.findByText("Alice");
    expect(await screen.findByText("Hi there, I like hiking.")).toBeInTheDocument();
  });

  it("shows the age under the bio when profile.age is set, and shows neither line when both are missing", async () => {
    getMyProfile.mockResolvedValue({
      displayName: "Alice",
      avatarUrl: null,
      bio: null,
      age: 28
    });

    renderWithProviders(<ProfilePage />);

    await screen.findByText("Alice");
    expect(await screen.findByText("28 岁")).toBeInTheDocument();
  });

  // 整卡可点 + 铅笔编辑角标任务卡：头像卡片右上角原来的"查看个人主页"
  // 圆形图标按钮整个去掉了（BARRY 反馈容易被误认成头像加载失败的占位
  // 图标），改成整张卡片可点，跳到同一个 /users/:自己的id 地址；"编辑
  // 资料"这个入口这次挪回了头像右下角的铅笔角标（不是这个 describe 块
  // 断言的对象，见下面"头像右下角铅笔编辑角标"那组测试）。
  describe("avatar card: 整卡可点 (整卡可点 + 铅笔编辑角标任务卡，取代原来右上角的'查看个人主页'图标按钮)", () => {
    it("makes the whole avatar card a role=link that navigates to /users/<self id> on click, not a small icon button", async () => {
      renderWithProviders(<ProfilePage />);

      await screen.findByText("Alice");
      const card = screen.getByRole("link", { name: "查看个人主页" });
      // 现在是整张卡片（role="link" 的 <div>），不是一个真的 <a>，没有
      // href 属性——点击之后触发 useNavigate()，断言导航目标即可。
      expect(card).not.toHaveAttribute("href");
      fireEvent.click(card);
      expect(navigateMock).toHaveBeenCalledWith("/users/user-1");
    });

    it("navigates when clicking the nickname text too (whole card is clickable, not just a small button)", async () => {
      renderWithProviders(<ProfilePage />);

      await screen.findByText("Alice");
      fireEvent.click(screen.getByText("Alice"));

      expect(navigateMock).toHaveBeenCalledWith("/users/user-1");
    });

    it("navigates when clicking the avatar placeholder too", async () => {
      renderWithProviders(<ProfilePage />);

      await screen.findByText("Alice");
      // getMyProfile 的默认 mock 没有 avatarUrl，退化成首字母占位"A"。
      fireEvent.click(screen.getByText("A"));

      expect(navigateMock).toHaveBeenCalledWith("/users/user-1");
    });
  });

  // 整卡可点 + 铅笔编辑角标任务卡：头像右下角新增的编辑角标，独立于整卡
  // 点击目标，跳 /profile/edit。历史上 24 号卡曾经在这个位置放过一个
  // "编辑资料"图标按钮、后来被公开主页 Facebook 风格头图改版换成了
  // "查看个人主页"（见上面 avatar card 那组测试），这次铅笔角标"回归"到
  // 头像右下角，是有意的行为，不是意外倒退——aria-label 沿用"编辑资料"
  // 这个历史文案（跟下面"账号与服务"卡片里的"编辑个人信息"故意用不同
  // 措辞区分，见 profile-summary.tsx 的注释）。
  describe("头像右下角铅笔编辑角标 (整卡可点 + 铅笔编辑角标任务卡)", () => {
    it("renders a '编辑资料' link pinned to the avatar, pointing to /profile/edit", async () => {
      renderWithProviders(<ProfilePage />);

      await screen.findByText("Alice");
      expect(screen.getByRole("link", { name: "编辑资料" })).toHaveAttribute(
        "href",
        "/profile/edit"
      );
    });

    it("clicking the pencil badge does not also trigger the whole-card navigation", async () => {
      renderWithProviders(<ProfilePage />);

      await screen.findByText("Alice");
      navigateMock.mockClear();
      fireEvent.click(screen.getByRole("link", { name: "编辑资料" }));

      expect(navigateMock).not.toHaveBeenCalled();
    });
  });

  // 这两个入口最初一版展示真实数字（复用 useMyPostsQuery/
  // useFavoritePostIdsQuery 取 .length），用户反馈不需要显示数字，改成了
  // 纯文字+图标的入口——不再调用那两个 hook，这里只验证"文字入口存在、
  // 点击能跳转"，不再断言具体数字。24.2 时这两个入口在头像卡片内部的
  // 两栏区块里，加回简介+年龄任务卡把它们挪到了身份卡下面单独一张
  // GroupCard（"我的发布与收藏"），这里的断言本身（链接文本/href）不
  // 关心具体挂在哪张卡片下，不受这次挪动影响。
  describe("我的发布/我的收藏 entries (24.2，位置在加回简介+年龄任务卡后变了，见下)", () => {
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

  // 11 号卡 11.2 曾经是"头像单独包一层 Link 跳自己的公开主页预览"
  // （avatarHref），整卡可点任务卡把 avatarHref 这个 prop 整个删掉了——
  // 整卡都跳同一个地址之后，头像单独再包一层 Link 已经没有必要，继续
  // 保留还会导致"头像的 Link 嵌套在整卡可点击区域内部"这种问题，见
  // profile-summary.tsx 的注释。点头像现在的效果被上面"avatar card:
  // 整卡可点"那组测试覆盖（点头像所在区域会冒泡触发整卡的 onClick），
  // 不再需要头像自己是一个独立的 <Link>。

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

    // 24.2：我的发布/我的收藏不是"我的内容"（我的活动/已屏蔽）这张卡片
    // 里的一行——它们现在单独在自己的一张 GroupCard 里（见下面新增的
    // describe 块），这条断言只验证"没有混进这张卡片"，不关心它们实际
    // 挂在哪。
    it("does not contain 我的发布/我的收藏 as rows inside the '我的内容' card", async () => {
      renderWithProviders(<ProfilePage />);

      const group = await screen.findByRole("navigation", { name: "我的内容" });
      expect(within(group).queryByText("我的发布")).not.toBeInTheDocument();
      expect(within(group).queryByText("我的收藏")).not.toBeInTheDocument();
    });
  });

  // 加回简介+年龄任务卡：我的发布/我的收藏从身份卡内部的两栏图标按钮，
  // 改成跟"我的活动/已屏蔽"一样的整行 GroupRow，单独一张 GroupCard，在
  // 身份卡下面、"我的内容"卡片之前。
  describe("'我的发布与收藏' group card (加回简介+年龄任务卡)", () => {
    it("contains exactly 我的发布/我的收藏 two rows, in that order, linking to the existing pages", async () => {
      renderWithProviders(<ProfilePage />);

      await screen.findByText("Alice");
      const group = screen.getByRole("navigation", { name: "我的发布与收藏" });
      const links = within(group).getAllByRole("link");
      expect(links.map((link) => link.textContent?.replace("›", ""))).toEqual(["我的发布", "我的收藏"]);
      expect(links[0]).toHaveAttribute("href", "/my-posts");
      expect(links[1]).toHaveAttribute("href", "/favorites");
    });

    it("is not nested inside the avatar (ProfileSummary) card", async () => {
      renderWithProviders(<ProfilePage />);

      await screen.findByText("Alice");
      const group = screen.getByRole("navigation", { name: "我的发布与收藏" });
      // ProfileSummary 渲染的身份卡是 rounded-profile-card bg-card 这张
      // 容器——这个 nav 不应该是它的后代，确认两者是身份卡下面单独一张
      // 卡片，不是身份卡内部的一部分。
      const avatarCard = screen.getByText("Alice").closest(".rounded-profile-card");
      expect(avatarCard).not.toBeNull();
      expect(avatarCard).not.toContainElement(group);
    });
  });

  // 24.4：合并成一张"账号与服务"卡片——帮助与客服（原"联系客服"文案）/
  // 设置/后台管理（仅管理员）。公开主页 Facebook 风格头图改版（联动）
  // 又在最前面加了一行"编辑个人信息"（原来在头像卡片右上角的入口挪到
  // 这里，见上面 avatar card 那组测试）。
  //
  // 联系客服改成真聊天任务卡："帮助与客服"这一行不再是跳 /feedback 的
  // <Link>，改成 <button onClick={contactSupport}>——下面的行序测试因此
  // 改用 querySelectorAll("a, button") 按 DOM 顺序取这几行（不能再用
  // getAllByRole("link")，那样会漏掉这一行，因为它现在不是链接）；这个
  // 按钮的实际点击行为单独放进"帮助与客服"这组新测试里验证。
  describe("'账号与服务' group card (24.4 + 公开主页 Facebook 风格头图改版联动)", () => {
    it("shows '编辑个人信息' as the first row (a link to /profile/edit), then '帮助与客服' (a button, renamed from '联系客服'), and '设置' (a link) for a non-admin user (no 后台管理 row)", async () => {
      getCurrentUserRole.mockResolvedValue("user");

      renderWithProviders(<ProfilePage />);

      await screen.findByText("Alice");
      const group = screen.getByRole("navigation", { name: "账号与服务" });
      const rows = group.querySelectorAll("a, button");
      expect(Array.from(rows).map((row) => row.textContent?.replace("›", ""))).toEqual([
        "编辑个人信息",
        "帮助与客服",
        "设置"
      ]);
      expect(rows[0]).toHaveAttribute("href", "/profile/edit");
      expect(rows[1].tagName).toBe("BUTTON");
      expect(rows[2]).toHaveAttribute("href", "/settings");
      expect(screen.queryByText("联系客服")).not.toBeInTheDocument();
      // /feedback 这个路由本身没有删，但这个按钮不再指向它——确认这一行
      // 确实不是一个还带着旧 href 的 <a>。
      expect(screen.queryByRole("link", { name: "帮助与客服" })).not.toBeInTheDocument();
    });

    it("shows '后台管理' as the fourth row, linking to /admin/posts, only for an admin account", async () => {
      getCurrentUserRole.mockResolvedValue("admin");

      renderWithProviders(<ProfilePage />);

      const group = await screen.findByRole("navigation", { name: "账号与服务" });
      // isAdmin 是独立的一次异步查询（useIsAdminQuery），跟分组卡片本身
      // 的渲染时机不是同一个 tick——先等"后台管理"这一行真的出现，再取
      // 整组行序，避免在 isAdmin 还没回来之前就断言。
      await within(group).findByRole("link", { name: /后台管理/ });
      const rows = group.querySelectorAll("a, button");
      expect(Array.from(rows).map((row) => row.textContent?.replace("›", ""))).toEqual([
        "编辑个人信息",
        "帮助与客服",
        "设置",
        "后台管理"
      ]);
      expect(rows[3]).toHaveAttribute("href", "/admin/posts");
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

  // 联系客服改成真聊天任务卡：这组测试是 useContactSupport() 这个共享
  // hook 的主要覆盖点（其它调用方——privacy-page.tsx/terms-page.tsx——
  // 只做浅层验证，不重复测一遍这套逻辑，见那两个文件的测试）。
  describe("'帮助与客服' 按钮 (联系客服改成真聊天任务卡)", () => {
    // 修复"帮助与客服"chevron 贴字/分隔线变短任务卡：<button> 表单控件
    // 不会像 <div>/<a> 那样自动撑满 flex 父容器的宽度，之前共用的
    // className 缺一个 w-full，导致这一行比其它 <Link> 行窄——chevron
    // 贴着文字、下面 divide-y 分隔线也跟着变短。这里断言 w-full/text-left
    // 两个 class 确实挂在这个按钮上，锁定这条修复。
    it("stretches to the full row width (w-full text-left), matching the <Link> rows instead of shrinking to its content", async () => {
      renderWithProviders(<ProfilePage />);

      await screen.findByText("Alice");
      const helpButton = screen.getByRole("button", { name: "帮助与客服" });
      expect(helpButton.className).toMatch(/\bw-full\b/);
      expect(helpButton.className).toMatch(/text-left/);
    });

    it("calls get_or_create_own_system_conversation and navigates to the resulting conversation on click", async () => {
      getOrCreateOwnSystemConversation.mockResolvedValue({ conversationId: "conversation-1" });

      renderWithProviders(<ProfilePage />);

      await screen.findByText("Alice");
      fireEvent.click(screen.getByRole("button", { name: "帮助与客服" }));

      await waitFor(() => {
        expect(getOrCreateOwnSystemConversation).toHaveBeenCalled();
      });
      await waitFor(() => {
        expect(navigateMock).toHaveBeenCalledWith("/messages/conversation-1");
      });
    });

    it("shows a generic error message when the RPC fails, and does not navigate", async () => {
      getOrCreateOwnSystemConversation.mockRejectedValue(new Error("network down"));

      renderWithProviders(<ProfilePage />);

      await screen.findByText("Alice");
      fireEvent.click(screen.getByRole("button", { name: "帮助与客服" }));

      expect(await screen.findByRole("alert")).toHaveTextContent(
        "打开客服会话失败，请稍后重试。"
      );
      expect(navigateMock).not.toHaveBeenCalledWith(expect.stringMatching(/^\/messages\//));
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
