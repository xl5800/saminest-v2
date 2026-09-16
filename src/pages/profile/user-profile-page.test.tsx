import { cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const {
  usePublicProfileQuery,
  useCreateProfileConversationMutation,
  mutateMock,
  navigateMock,
  useIsBlockingQuery,
  useBlockUserMutation,
  useUnblockUserMutation,
  blockMutateAsyncMock,
  unblockMutateAsyncMock,
  listApprovedPosts
} = vi.hoisted(() => ({
  usePublicProfileQuery: vi.fn(),
  useCreateProfileConversationMutation: vi.fn(),
  mutateMock: vi.fn(),
  navigateMock: vi.fn(),
  useIsBlockingQuery: vi.fn(),
  useBlockUserMutation: vi.fn(),
  useUnblockUserMutation: vi.fn(),
  blockMutateAsyncMock: vi.fn(),
  unblockMutateAsyncMock: vi.fn(),
  listApprovedPosts: vi.fn()
}));

vi.mock("../../features/profile/use-public-profile-query", () => ({
  usePublicProfileQuery
}));
vi.mock("../../features/conversations/use-create-profile-conversation-mutation", () => ({
  useCreateProfileConversationMutation
}));
// UGC 安全功能补齐任务卡 1：屏蔽相关的三个 hook 也要 mock 掉，理由跟上面
// 两个已有 hook 一样——否则会真的调用底层仓库函数，打到 Supabase 客户端。
vi.mock("../../features/blocks/use-is-blocking-query", () => ({
  useIsBlockingQuery
}));
vi.mock("../../features/blocks/use-block-user-mutation", () => ({
  useBlockUserMutation
}));
vi.mock("../../features/blocks/use-unblock-user-mutation", () => ({
  useUnblockUserMutation
}));
// 22 号卡：页面底部新增的"作品"网格（改版前标题是"发布的作品"，去 Banner
// 改版精简成两个字）用的是真实的 PostList 组件（不是单独 mock 掉整个
// 组件），只 mock 它最终依赖的仓库函数——跟这个文件里其它 hook 同一个
// "mock 网络边界，不 mock 组件树"的原则，见 post-list.test.tsx。
vi.mock("../../repositories/posts-repository", () => ({
  listApprovedPosts
}));
vi.mock("react-router-dom", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react-router-dom")>();
  return { ...actual, useNavigate: () => navigateMock };
});

import { useAuthStore } from "../../store/auth-store";
import { renderWithProviders } from "../../test/render-with-providers";
import { AppError } from "../../utils/app-error";
import { UserProfilePage } from "./user-profile-page";

const initialAuthState = useAuthStore.getState();

const samplePublicProfile = {
  id: "user-2",
  displayName: "Bob",
  bio: "Hi there, I like hiking.",
  avatarUrl: null,
  locationName: "Rockville",
  age: null
};

function renderPage() {
  return renderWithProviders(<UserProfilePage />, {
    initialEntries: ["/users/user-2"],
    route: "/users/:userId"
  });
}

describe("UserProfilePage", () => {
  afterEach(() => {
    cleanup();
  });

  beforeEach(() => {
    useAuthStore.setState(initialAuthState, true);
    usePublicProfileQuery.mockReset();
    useCreateProfileConversationMutation.mockReset();
    mutateMock.mockReset();
    navigateMock.mockReset();
    useIsBlockingQuery.mockReset();
    useBlockUserMutation.mockReset();
    useUnblockUserMutation.mockReset();
    blockMutateAsyncMock.mockReset();
    unblockMutateAsyncMock.mockReset();
    listApprovedPosts.mockReset();

    useCreateProfileConversationMutation.mockReturnValue({
      mutate: mutateMock,
      isPending: false
    });
    useIsBlockingQuery.mockReturnValue({ data: false });
    useBlockUserMutation.mockReturnValue({ mutateAsync: blockMutateAsyncMock, isPending: false });
    useUnblockUserMutation.mockReturnValue({ mutateAsync: unblockMutateAsyncMock, isPending: false });
    // 这个文件里绝大多数测试不关心"作品"网格具体展示什么，默认给
    // 一个已解决的空结果，避免每个测试都要重复 mock 这一个查询。
    listApprovedPosts.mockResolvedValue({ posts: [], hasNextPage: false });
  });

  it("shows a loading message while the query is pending", () => {
    usePublicProfileQuery.mockReturnValue({ data: undefined, isPending: true, isError: false });

    renderPage();

    expect(screen.getByRole("status")).toHaveTextContent("加载中…");
  });

  it("shows a plain error message on a genuine fetch failure", () => {
    usePublicProfileQuery.mockReturnValue({ data: undefined, isPending: false, isError: true });

    renderPage();

    expect(screen.getByRole("alert")).toHaveTextContent("用户信息加载失败，请稍后重试。");
  });

  it("shows a not-found message when the query resolves to null", () => {
    usePublicProfileQuery.mockReturnValue({ data: null, isPending: false, isError: false });

    renderPage();

    expect(screen.getByRole("heading", { name: "用户未找到" })).toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent("用户不存在。");
  });

  // 22 号卡：昵称下面只展示简介，不再展示城市——任务卡给的顺序原话是
  // "头像下面是昵称 + 个人简介"，没有提城市，这里按字面顺序去掉了这一行
  // （PublicProfile.locationName 这个字段本身没删，只是页面不渲染）。
  it("renders avatar-initial placeholder, nickname, and bio for a normal profile, without a location line", () => {
    usePublicProfileQuery.mockReturnValue({
      data: samplePublicProfile,
      isPending: false,
      isError: false
    });

    const { container } = renderPage();

    expect(container.querySelector("img")).not.toBeInTheDocument();
    expect(screen.getByText("B")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Bob" })).toBeInTheDocument();
    expect(screen.getByText("Hi there, I like hiking.")).toBeInTheDocument();
    expect(screen.queryByText("Rockville")).not.toBeInTheDocument();
  });

  it("renders an <img> avatar when avatarUrl is present", () => {
    usePublicProfileQuery.mockReturnValue({
      data: { ...samplePublicProfile, avatarUrl: "https://example.com/bob.jpg" },
      isPending: false,
      isError: false
    });

    const { container } = renderPage();

    expect(container.querySelector("img")).toHaveAttribute(
      "src",
      "https://example.com/bob.jpg"
    );
  });

  it("does not render a bio section (no '暂无简介' placeholder) when bio is empty", () => {
    usePublicProfileQuery.mockReturnValue({
      data: { ...samplePublicProfile, bio: null },
      isPending: false,
      isError: false
    });

    renderPage();

    expect(screen.queryByText(/暂无简介/)).not.toBeInTheDocument();
    expect(screen.queryByText("Hi there, I like hiking.")).not.toBeInTheDocument();
  });

  // 公开主页去 Banner 改版：22 号卡加的 Facebook 风格深色渐变头图整个
  // 去掉了，头像/昵称/年龄放回同一行（头像左，昵称+年龄纵向排列在右），
  // 见 user-profile-page.tsx 函数级注释。
  describe("去 Banner 改版 (公开主页)", () => {
    it("does not render the removed gradient cover block", () => {
      usePublicProfileQuery.mockReturnValue({
        data: samplePublicProfile,
        isPending: false,
        isError: false
      });

      renderPage();

      expect(screen.queryByTestId("profile-cover-gradient")).not.toBeInTheDocument();
    });

    it("no longer gives the no-avatar placeholder the banner-boundary overlap/ring classes", () => {
      usePublicProfileQuery.mockReturnValue({
        data: samplePublicProfile,
        isPending: false,
        isError: false
      });

      renderPage();

      const placeholder = screen.getByText("B");
      expect(placeholder.className).not.toMatch(/-mt-12/);
      expect(placeholder.className).not.toMatch(/ring-4/);
      expect(placeholder.className).not.toMatch(/ring-card/);
      expect(placeholder.className).toMatch(/rounded-full/);
    });

    it("no longer gives the <img> avatar the banner-boundary overlap/ring classes when avatarUrl is present", () => {
      usePublicProfileQuery.mockReturnValue({
        data: { ...samplePublicProfile, avatarUrl: "https://example.com/bob.jpg" },
        isPending: false,
        isError: false
      });

      const { container } = renderPage();

      const img = container.querySelector("img");
      expect(img?.className).not.toMatch(/-mt-12/);
      expect(img?.className).not.toMatch(/ring-4/);
      expect(img?.className).not.toMatch(/ring-card/);
      expect(img?.className).toMatch(/rounded-full/);
    });

    it("renders the nickname next to the avatar in the same row, not on a separate full-width line below it", () => {
      usePublicProfileQuery.mockReturnValue({
        data: samplePublicProfile,
        isPending: false,
        isError: false
      });

      renderPage();

      const heading = screen.getByRole("heading", { name: "Bob" });
      const placeholder = screen.getByText("B");
      // 头像（placeholder）和"昵称+年龄"文字块是同一个 flex 行的两个
      // 直接子元素，heading 本身是文字块内部再嵌一层，所以要往上找
      // 两层父元素才是头像和文字块共同的容器。
      expect(heading.parentElement?.parentElement).toContainElement(placeholder);
    });

    it("shows the age directly under the nickname, in the same text block", () => {
      usePublicProfileQuery.mockReturnValue({
        data: { ...samplePublicProfile, age: 25 },
        isPending: false,
        isError: false
      });

      renderPage();

      const heading = screen.getByRole("heading", { name: "Bob" });
      const age = screen.getByText("25 岁");
      expect(heading.parentElement).toContainElement(age);
    });

    it("does not render an age line when data.age is null", () => {
      usePublicProfileQuery.mockReturnValue({
        data: samplePublicProfile,
        isPending: false,
        isError: false
      });

      renderPage();

      expect(screen.queryByText(/岁/)).not.toBeInTheDocument();
    });
  });

  // 头像缩小 + 年龄胶囊 + 发消息满宽任务卡。
  describe("头像缩小 + 年龄胶囊 + 发消息满宽 (返回/更多同行等任务卡)", () => {
    it("shrinks the no-avatar placeholder to 60px", () => {
      usePublicProfileQuery.mockReturnValue({
        data: samplePublicProfile,
        isPending: false,
        isError: false
      });

      renderPage();

      const placeholder = screen.getByText("B");
      expect(placeholder.className).toMatch(/h-\[60px\]/);
      expect(placeholder.className).toMatch(/w-\[60px\]/);
      expect(placeholder.className).not.toMatch(/h-24/);
    });

    it("shrinks the <img> avatar to 60px when avatarUrl is present", () => {
      usePublicProfileQuery.mockReturnValue({
        data: { ...samplePublicProfile, avatarUrl: "https://example.com/bob.jpg" },
        isPending: false,
        isError: false
      });

      const { container } = renderPage();

      const img = container.querySelector("img");
      expect(img?.className).toMatch(/h-\[60px\]/);
      expect(img?.className).toMatch(/w-\[60px\]/);
      expect(img?.className).not.toMatch(/h-24/);
    });

    it("styles the age as a pill (rounded-full, muted background) matching the '我的' page identity card's age pill", () => {
      usePublicProfileQuery.mockReturnValue({
        data: { ...samplePublicProfile, age: 25 },
        isPending: false,
        isError: false
      });

      renderPage();

      const age = screen.getByText("25 岁");
      expect(age.tagName).toBe("SPAN");
      expect(age.className).toMatch(/rounded-full/);
      expect(age.className).toMatch(/bg-bg/);
    });

    it("renders '发消息' as a full-width button (not paired side-by-side with a block button)", () => {
      usePublicProfileQuery.mockReturnValue({
        data: samplePublicProfile,
        isPending: false,
        isError: false
      });

      renderPage();

      const messageButton = screen.getByRole("button", { name: "发消息" });
      expect(messageButton.className).toMatch(/\bw-full\b/);
    });

    it("no longer renders a '屏蔽此人' button next to '发消息' in the page body", () => {
      usePublicProfileQuery.mockReturnValue({
        data: samplePublicProfile,
        isPending: false,
        isError: false
      });

      renderPage();

      // 屏蔽此人已经挪进"更多操作"菜单（见 blocking 那组测试），菜单
      // 没打开之前页面主体不应该出现这个文案。
      expect(screen.queryByText("屏蔽此人")).not.toBeInTheDocument();
    });

    it("renders a divider below the '发消息' button, above the '作品' heading", () => {
      usePublicProfileQuery.mockReturnValue({
        data: samplePublicProfile,
        isPending: false,
        isError: false
      });

      const { container } = renderPage();

      const divider = container.querySelector(".border-t");
      expect(divider).toBeInTheDocument();
      const messageButton = screen.getByRole("button", { name: "发消息" });
      const heading = screen.getByRole("heading", { name: "作品" });
      // 分割线在文档顺序上应该排在"发消息"按钮之后、"作品"标题之前。
      expect(
        messageButton.compareDocumentPosition(divider as Element) &
          Node.DOCUMENT_POSITION_FOLLOWING
      ).toBeTruthy();
      expect(
        heading.compareDocumentPosition(divider as Element) & Node.DOCUMENT_POSITION_PRECEDING
      ).toBeTruthy();
    });

    it("does not render the divider when viewing your own profile (no '发消息' button to separate from '作品')", () => {
      useAuthStore.getState().setSession({ user: { id: "user-2" } } as never);
      usePublicProfileQuery.mockReturnValue({
        data: samplePublicProfile,
        isPending: false,
        isError: false
      });

      const { container } = renderPage();

      expect(container.querySelector(".border-t")).not.toBeInTheDocument();
    });
  });

  it("shows a '发消息' button for a visitor viewing someone else's profile", () => {
    usePublicProfileQuery.mockReturnValue({
      data: samplePublicProfile,
      isPending: false,
      isError: false
    });

    renderPage();

    expect(screen.getByRole("button", { name: "发消息" })).toBeInTheDocument();
  });

  it("does not show a '发消息' button when viewing your own profile", () => {
    useAuthStore.getState().setSession({ user: { id: "user-2" } } as never);
    usePublicProfileQuery.mockReturnValue({
      data: samplePublicProfile,
      isPending: false,
      isError: false
    });

    renderPage();

    expect(screen.queryByRole("button", { name: "发消息" })).not.toBeInTheDocument();
  });

  it("navigates to /login when clicking 发消息 while logged out", () => {
    usePublicProfileQuery.mockReturnValue({
      data: samplePublicProfile,
      isPending: false,
      isError: false
    });

    renderPage();
    fireEvent.click(screen.getByRole("button", { name: "发消息" }));

    expect(navigateMock).toHaveBeenCalledWith("/login");
    expect(mutateMock).not.toHaveBeenCalled();
  });

  it("calls createProfileConversation with the target userId and navigates to the conversation on success", async () => {
    useAuthStore.getState().setSession({ user: { id: "user-1" } } as never);
    usePublicProfileQuery.mockReturnValue({
      data: samplePublicProfile,
      isPending: false,
      isError: false
    });
    mutateMock.mockImplementation((_targetUserId, { onSuccess }) => {
      onSuccess({ conversationId: "conv-1" });
    });

    renderPage();
    fireEvent.click(screen.getByRole("button", { name: "发消息" }));

    expect(mutateMock).toHaveBeenCalledWith("user-2", expect.any(Object));
    await waitFor(() => {
      expect(navigateMock).toHaveBeenCalledWith("/messages/conv-1");
    });
  });

  it("shows the daily-limit message verbatim when the mutation rejects with PROFILE_CONVERSATION_DAILY_LIMIT_REACHED", async () => {
    useAuthStore.getState().setSession({ user: { id: "user-1" } } as never);
    usePublicProfileQuery.mockReturnValue({
      data: samplePublicProfile,
      isPending: false,
      isError: false
    });
    mutateMock.mockImplementation((_targetUserId, { onError }) => {
      onError(
        new AppError(
          "你今天主动私信的新用户数量已经达到上限，请明天再试。",
          "PROFILE_CONVERSATION_DAILY_LIMIT_REACHED"
        )
      );
    });

    renderPage();
    fireEvent.click(screen.getByRole("button", { name: "发消息" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "你今天主动私信的新用户数量已经达到上限，请明天再试。"
    );
  });

  it("shows the account-restricted message verbatim when the mutation rejects with ACCOUNT_RESTRICTED", async () => {
    useAuthStore.getState().setSession({ user: { id: "user-1" } } as never);
    usePublicProfileQuery.mockReturnValue({
      data: samplePublicProfile,
      isPending: false,
      isError: false
    });
    mutateMock.mockImplementation((_targetUserId, { onError }) => {
      onError(
        new AppError(
          "您的账号当前处于限制状态，无法执行此操作，如有疑问请联系管理员。",
          "ACCOUNT_RESTRICTED"
        )
      );
    });

    renderPage();
    fireEvent.click(screen.getByRole("button", { name: "发消息" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "您的账号当前处于限制状态，无法执行此操作，如有疑问请联系管理员。"
    );
  });

  it("shows a generic error message for an unrecognized failure", async () => {
    useAuthStore.getState().setSession({ user: { id: "user-1" } } as never);
    usePublicProfileQuery.mockReturnValue({
      data: samplePublicProfile,
      isPending: false,
      isError: false
    });
    mutateMock.mockImplementation((_targetUserId, { onError }) => {
      onError(new Error("network down"));
    });

    renderPage();
    fireEvent.click(screen.getByRole("button", { name: "发消息" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "会话创建失败，请稍后重试。"
    );
  });

  // 22 号卡：不再用 TopBar，返回箭头换成一个圆形按钮——但不管加载中/
  // 加载失败/正常显示，这个按钮都应该在，跟改版前 TopBar 一直渲染返回
  // 按钮是同一个行为，只是不再依赖 TopBar 这个组件本身。返回/更多同行
  // 任务卡把这个按钮从 fixed 悬浮改成了页面顶部一条普通的页内行，这条
  // "不管什么状态都应该在"的约束本身没有变。
  it("renders a '返回' button even while the profile query is pending", () => {
    usePublicProfileQuery.mockReturnValue({ data: undefined, isPending: true, isError: false });

    renderPage();

    expect(screen.getByRole("button", { name: "返回" })).toBeInTheDocument();
  });

  it("navigates back one entry in history when the back button is clicked", () => {
    usePublicProfileQuery.mockReturnValue({
      data: samplePublicProfile,
      isPending: false,
      isError: false
    });

    renderPage();
    fireEvent.click(screen.getByRole("button", { name: "返回" }));

    expect(navigateMock).toHaveBeenCalledWith(-1);
  });

  // 返回/更多同行任务卡：返回箭头 + 更多操作从 fixed 悬浮改成页面顶部
  // 一条普通的页内行，不再挡住下面的头像。
  describe("返回/更多操作同行 (返回/更多同行任务卡)", () => {
    it("no longer uses fixed positioning for the back button or the more-menu button", () => {
      usePublicProfileQuery.mockReturnValue({
        data: samplePublicProfile,
        isPending: false,
        isError: false
      });

      renderPage();

      const backButton = screen.getByRole("button", { name: "返回" });
      const moreButton = screen.getByRole("button", { name: "更多操作" });
      expect(backButton.className).not.toMatch(/\bfixed\b/);
      expect(moreButton.className).not.toMatch(/\bfixed\b/);
    });

    it("renders the back button and the more-menu button as siblings in the same top row", () => {
      usePublicProfileQuery.mockReturnValue({
        data: samplePublicProfile,
        isPending: false,
        isError: false
      });

      renderPage();

      const backButton = screen.getByRole("button", { name: "返回" });
      // 更多操作按钮外面包了一层 relative 容器（给下拉菜单当锚点），
      // 真正跟返回按钮同一行的兄弟节点是那层容器，不是按钮本身。
      const moreButtonWrapper = screen.getByRole("button", { name: "更多操作" }).parentElement;
      expect(backButton.parentElement).toContainElement(moreButtonWrapper);
    });

    it("still renders the back button (with the row's right side empty) when '更多操作' is not shown, e.g. own profile", () => {
      useAuthStore.getState().setSession({ user: { id: "user-2" } } as never);
      usePublicProfileQuery.mockReturnValue({
        data: samplePublicProfile,
        isPending: false,
        isError: false
      });

      renderPage();

      expect(screen.getByRole("button", { name: "返回" })).toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "更多操作" })).not.toBeInTheDocument();
    });

    it("still renders the back button on a genuine fetch error, and on a not-found profile", () => {
      usePublicProfileQuery.mockReturnValue({ data: undefined, isPending: false, isError: true });
      const { unmount } = renderPage();
      expect(screen.getByRole("button", { name: "返回" })).toBeInTheDocument();
      unmount();

      usePublicProfileQuery.mockReturnValue({ data: null, isPending: false, isError: false });
      renderPage();
      expect(screen.getByRole("button", { name: "返回" })).toBeInTheDocument();
    });
  });

  // 22 号卡验收标准："只有一个'发消息'按钮...没有'关注'按钮"。"屏蔽此人"
  // 和"更多操作"（举报用户的入口）都是任务卡完全没提到、但真实存在的
  // UGC 安全功能，跟用户确认过明确保留，不属于"关注"那种"暂时不放入口"
  // 的按钮。屏蔽此人/更多操作合并任务卡之后，"屏蔽此人"从独立按钮挪进了
  // "更多操作"下拉菜单——菜单没打开之前顶层只有 3 个 <button>（返回 +
  // 发消息 + 更多操作），打开菜单之后菜单里的"屏蔽此人"也是一个
  // <button>（举报用户是 <Link>，不计入 button 数量），变成 4 个。
  it("renders '发消息'/'更多操作' as the only top-level action buttons — '屏蔽此人' lives inside the more-menu, no follow button", () => {
    usePublicProfileQuery.mockReturnValue({
      data: samplePublicProfile,
      isPending: false,
      isError: false
    });

    renderPage();

    expect(screen.getByRole("button", { name: "发消息" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /关注/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "屏蔽此人" })).not.toBeInTheDocument();
    // 返回 + 发消息 + 更多操作，一共 3 个 <button>。
    expect(screen.getAllByRole("button")).toHaveLength(3);

    fireEvent.click(screen.getByRole("button", { name: "更多操作" }));

    expect(screen.getByRole("button", { name: "屏蔽此人" })).toBeInTheDocument();
    // 打开菜单之后：返回 + 发消息 + 更多操作 + 菜单里的屏蔽此人，共 4 个。
    expect(screen.getAllByRole("button")).toHaveLength(4);
  });

  // 07 号卡（活动卡片头像区放大 + 发起者联系参与者）验收标准："发起者
  // 主页不再展示 TA发起的搭子 列表"——04 号卡最初引入的这个区块已经整个
  // 删掉，联系发起人/参与者统一走活动详情页的"点头像/整行进主页"机制，
  // 不需要在这个页面单独列一份活动。
  it("never renders a 'TA 发起的搭子' section (07 号卡删掉了这个区块)", () => {
    usePublicProfileQuery.mockReturnValue({
      data: samplePublicProfile,
      isPending: false,
      isError: false
    });

    renderPage();

    expect(screen.queryByText("TA 发起的搭子")).not.toBeInTheDocument();
  });

  // UGC 安全功能补齐任务卡 1（屏蔽用户）。屏蔽此人/更多操作合并任务卡：
  // "屏蔽此人/取消屏蔽"从页面主体一个独立按钮挪进了"更多操作"下拉菜单，
  // 下面这些测试都要先点开菜单才能找到这一项——isBlocking/
  // isBlockActionPending/handleToggleBlock 这几个状态和函数本身、
  // blockError 的展示位置、屏蔽生效的后端行为都没有变，只是触发它的
  // 入口挪了地方。
  describe("blocking (菜单里的'屏蔽此人/取消屏蔽'一项)", () => {
    it("does not show a '更多操作' button (and therefore no '屏蔽此人' entry) when viewing your own profile", () => {
      useAuthStore.getState().setSession({ user: { id: "user-2" } } as never);
      usePublicProfileQuery.mockReturnValue({
        data: samplePublicProfile,
        isPending: false,
        isError: false
      });

      renderPage();

      expect(screen.queryByRole("button", { name: "更多操作" })).not.toBeInTheDocument();
      expect(screen.queryByText(/屏蔽/)).not.toBeInTheDocument();
    });

    it("shows '屏蔽此人' in the more-menu for a visitor viewing someone else's profile when not currently blocking", () => {
      usePublicProfileQuery.mockReturnValue({
        data: samplePublicProfile,
        isPending: false,
        isError: false
      });

      renderPage();
      fireEvent.click(screen.getByRole("button", { name: "更多操作" }));

      expect(screen.getByRole("button", { name: "屏蔽此人" })).toBeInTheDocument();
    });

    it("shows '取消屏蔽' in the more-menu when useIsBlockingQuery reports the current user already blocks the target", () => {
      useIsBlockingQuery.mockReturnValue({ data: true });
      usePublicProfileQuery.mockReturnValue({
        data: samplePublicProfile,
        isPending: false,
        isError: false
      });

      renderPage();
      fireEvent.click(screen.getByRole("button", { name: "更多操作" }));

      expect(screen.getByRole("button", { name: "取消屏蔽" })).toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "屏蔽此人" })).not.toBeInTheDocument();
    });

    it("navigates to /login when clicking the block menu item while logged out", () => {
      usePublicProfileQuery.mockReturnValue({
        data: samplePublicProfile,
        isPending: false,
        isError: false
      });

      renderPage();
      fireEvent.click(screen.getByRole("button", { name: "更多操作" }));
      fireEvent.click(screen.getByRole("button", { name: "屏蔽此人" }));

      expect(navigateMock).toHaveBeenCalledWith("/login");
      expect(blockMutateAsyncMock).not.toHaveBeenCalled();
    });

    it("calls blockUser with the current user as blocker and the profile owner as blocked on click, and closes the menu", async () => {
      useAuthStore.getState().setSession({ user: { id: "user-1" } } as never);
      usePublicProfileQuery.mockReturnValue({
        data: samplePublicProfile,
        isPending: false,
        isError: false
      });

      renderPage();
      fireEvent.click(screen.getByRole("button", { name: "更多操作" }));
      fireEvent.click(screen.getByRole("button", { name: "屏蔽此人" }));

      await waitFor(() => {
        expect(blockMutateAsyncMock).toHaveBeenCalledWith({
          blockerId: "user-1",
          blockedId: "user-2"
        });
      });
      // 点击后菜单应该自己收起——举报用户这个链接也是菜单内容的一部分，
      // 菜单关闭之后它也不应该再出现在文档里。
      expect(screen.queryByRole("link", { name: "举报用户" })).not.toBeInTheDocument();
    });

    it("calls unblockUser instead when already blocking, and re-opening the menu afterwards shows '屏蔽此人' again", async () => {
      useAuthStore.getState().setSession({ user: { id: "user-1" } } as never);
      useIsBlockingQuery.mockReturnValue({ data: true });
      usePublicProfileQuery.mockReturnValue({
        data: samplePublicProfile,
        isPending: false,
        isError: false
      });

      renderPage();
      fireEvent.click(screen.getByRole("button", { name: "更多操作" }));
      fireEvent.click(screen.getByRole("button", { name: "取消屏蔽" }));

      await waitFor(() => {
        expect(unblockMutateAsyncMock).toHaveBeenCalledWith({
          blockerId: "user-1",
          blockedId: "user-2"
        });
      });
      expect(blockMutateAsyncMock).not.toHaveBeenCalled();

      // 状态切换是靠 useIsBlockingQuery 的返回值驱动的（mock 在这个测试
      // 里维持 data: true，不会真的在点击之后自动变成 false——这里只
      // 验证菜单重新打开之后还能正常渲染，不代表状态本身已经切换，状态
      // 切换本身是 UGC 安全功能补齐任务卡 1 已经验证过的既有逻辑）。
      fireEvent.click(screen.getByRole("button", { name: "更多操作" }));
      expect(screen.getByRole("button", { name: "取消屏蔽" })).toBeInTheDocument();
    });

    it("shows a generic error message when the block action fails", async () => {
      useAuthStore.getState().setSession({ user: { id: "user-1" } } as never);
      blockMutateAsyncMock.mockRejectedValue(new Error("network down"));
      usePublicProfileQuery.mockReturnValue({
        data: samplePublicProfile,
        isPending: false,
        isError: false
      });

      renderPage();
      fireEvent.click(screen.getByRole("button", { name: "更多操作" }));
      fireEvent.click(screen.getByRole("button", { name: "屏蔽此人" }));

      expect(await screen.findByRole("alert")).toHaveTextContent("操作失败，请稍后重试。");
    });
  });

  // UGC 安全功能补齐任务卡 2（举报用户）。22 号卡最初一版把"更多操作"
  // 下拉菜单里的"举报用户"改成了直接可点的悬浮链接，用户反馈要改回原来
  // 的下拉菜单形式（头图右上角悬浮圆形"更多操作"按钮，点开菜单里才是
  // "举报用户"），这里改回来了——保持左上角悬浮返回箭头不变。
  describe("举报用户 more-menu entry (悬浮圆形'更多操作'按钮，点开菜单里的一项)", () => {
    it("renders a floating '更多操作' button with a '举报用户' link to /users/:userId/report on someone else's profile", () => {
      usePublicProfileQuery.mockReturnValue({
        data: samplePublicProfile,
        isPending: false,
        isError: false
      });

      renderPage();

      // 菜单没打开之前，"举报用户"链接不应该出现在文档里。
      expect(screen.queryByRole("link", { name: "举报用户" })).not.toBeInTheDocument();

      fireEvent.click(screen.getByRole("button", { name: "更多操作" }));

      const reportLink = screen.getByRole("link", { name: "举报用户" });
      expect(reportLink).toHaveAttribute("href", "/users/user-2/report");
    });

    it("closes the menu after clicking the '举报用户' link", () => {
      usePublicProfileQuery.mockReturnValue({
        data: samplePublicProfile,
        isPending: false,
        isError: false
      });

      renderPage();
      fireEvent.click(screen.getByRole("button", { name: "更多操作" }));
      fireEvent.click(screen.getByRole("link", { name: "举报用户" }));

      expect(screen.queryByRole("link", { name: "举报用户" })).not.toBeInTheDocument();
    });

    it("does not render the '更多操作' button on your own profile", () => {
      useAuthStore.getState().setSession({ user: { id: "user-2" } } as never);
      usePublicProfileQuery.mockReturnValue({
        data: samplePublicProfile,
        isPending: false,
        isError: false
      });

      renderPage();

      expect(screen.queryByRole("button", { name: "更多操作" })).not.toBeInTheDocument();
    });

    it("does not render the '更多操作' button while the profile is still loading", () => {
      usePublicProfileQuery.mockReturnValue({ data: undefined, isPending: true, isError: false });

      renderPage();

      expect(screen.queryByRole("button", { name: "更多操作" })).not.toBeInTheDocument();
    });
  });

  // 22 号卡（用户主页改版）：新增的"作品"网格（改版前标题是"发布的
  // 作品"，去 Banner 改版精简成两个字，见 user-profile-page.tsx），复用
  // PostList 组件，只多传一个 authorId——只验证这条数据管线接对了
  // （authorId 传的是当前主页 userId、标题文案存在），不重复 PostList
  // 自己那份详尽测试（加载中/空状态/分页/卡片渲染……见 post-list.test.tsx）。
  describe("作品 (22 号卡：复用 PostList，只按 authorId 筛选)", () => {
    it("renders a '作品' heading and requests posts filtered to this profile's userId", async () => {
      usePublicProfileQuery.mockReturnValue({
        data: samplePublicProfile,
        isPending: false,
        isError: false
      });

      renderPage();

      expect(screen.getByRole("heading", { name: "作品" })).toBeInTheDocument();
      await waitFor(() => {
        expect(listApprovedPosts).toHaveBeenCalledWith({
          authorId: "user-2",
          page: 0,
          pageSize: 20
        });
      });
    });

    it("does not render the '发布/搭子/收藏' tab switcher — no tab buttons, just the one grid", () => {
      usePublicProfileQuery.mockReturnValue({
        data: samplePublicProfile,
        isPending: false,
        isError: false
      });

      renderPage();

      expect(screen.queryByRole("button", { name: "发布" })).not.toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "搭子" })).not.toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "收藏" })).not.toBeInTheDocument();
    });

    it("still renders the grid (and requests it) even when viewing your own profile", async () => {
      useAuthStore.getState().setSession({ user: { id: "user-2" } } as never);
      usePublicProfileQuery.mockReturnValue({
        data: samplePublicProfile,
        isPending: false,
        isError: false
      });

      renderPage();

      expect(screen.getByRole("heading", { name: "作品" })).toBeInTheDocument();
      await waitFor(() => {
        expect(listApprovedPosts).toHaveBeenCalledWith({
          authorId: "user-2",
          page: 0,
          pageSize: 20
        });
      });
    });
  });
});
