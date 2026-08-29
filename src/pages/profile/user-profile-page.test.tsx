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
// 22 号卡：页面底部新增的"发布的作品"网格用的是真实的 PostList 组件（不是
// 单独 mock 掉整个组件），只 mock 它最终依赖的仓库函数——跟这个文件里其它
// hook 同一个"mock 网络边界，不 mock 组件树"的原则，见 post-list.test.tsx。
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
  locationName: "Rockville"
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
    // 这个文件里绝大多数测试不关心"发布的作品"网格具体展示什么，默认给
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

  // 22 号卡：不再用 TopBar，返回箭头换成悬浮在头图上的圆形按钮——但不管
  // 加载中/加载失败/正常显示，这个按钮都应该在，跟改版前 TopBar 一直渲染
  // 返回按钮是同一个行为，只是不再依赖 TopBar 这个组件本身。
  it("renders a floating '返回' button even while the profile query is pending", () => {
    usePublicProfileQuery.mockReturnValue({ data: undefined, isPending: true, isError: false });

    renderPage();

    expect(screen.getByRole("button", { name: "返回" })).toBeInTheDocument();
  });

  it("navigates back one entry in history when the floating back button is clicked", () => {
    usePublicProfileQuery.mockReturnValue({
      data: samplePublicProfile,
      isPending: false,
      isError: false
    });

    renderPage();
    fireEvent.click(screen.getByRole("button", { name: "返回" }));

    expect(navigateMock).toHaveBeenCalledWith(-1);
  });

  // 22 号卡验收标准："只有一个'发消息'按钮...没有'关注'按钮"。"屏蔽此人"
  // 和"更多操作"（举报用户的入口）都是任务卡完全没提到、但真实存在的
  // UGC 安全功能，跟用户确认过明确保留，不属于"关注"那种"暂时不放入口"
  // 的按钮，所以按钮总数是 4 个：返回 + 发消息 + 屏蔽此人 + 更多操作。
  it("renders '发消息'/'屏蔽此人'/'更多操作' as the only action buttons on someone else's profile — no follow button", () => {
    usePublicProfileQuery.mockReturnValue({
      data: samplePublicProfile,
      isPending: false,
      isError: false
    });

    renderPage();

    expect(screen.getByRole("button", { name: "发消息" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "屏蔽此人" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /关注/ })).not.toBeInTheDocument();
    // 返回 + 发消息 + 屏蔽此人 + 更多操作，一共 4 个 <button>。
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

  // UGC 安全功能补齐任务卡 1（屏蔽用户）。
  describe("blocking", () => {
    it("does not show a '屏蔽此人' button when viewing your own profile", () => {
      useAuthStore.getState().setSession({ user: { id: "user-2" } } as never);
      usePublicProfileQuery.mockReturnValue({
        data: samplePublicProfile,
        isPending: false,
        isError: false
      });

      renderPage();

      expect(screen.queryByRole("button", { name: /屏蔽/ })).not.toBeInTheDocument();
    });

    it("shows '屏蔽此人' for a visitor viewing someone else's profile when not currently blocking", () => {
      usePublicProfileQuery.mockReturnValue({
        data: samplePublicProfile,
        isPending: false,
        isError: false
      });

      renderPage();

      expect(screen.getByRole("button", { name: "屏蔽此人" })).toBeInTheDocument();
    });

    it("shows '取消屏蔽' when useIsBlockingQuery reports the current user already blocks the target", () => {
      useIsBlockingQuery.mockReturnValue({ data: true });
      usePublicProfileQuery.mockReturnValue({
        data: samplePublicProfile,
        isPending: false,
        isError: false
      });

      renderPage();

      expect(screen.getByRole("button", { name: "取消屏蔽" })).toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "屏蔽此人" })).not.toBeInTheDocument();
    });

    it("navigates to /login when clicking the block button while logged out", () => {
      usePublicProfileQuery.mockReturnValue({
        data: samplePublicProfile,
        isPending: false,
        isError: false
      });

      renderPage();
      fireEvent.click(screen.getByRole("button", { name: "屏蔽此人" }));

      expect(navigateMock).toHaveBeenCalledWith("/login");
      expect(blockMutateAsyncMock).not.toHaveBeenCalled();
    });

    it("calls blockUser with the current user as blocker and the profile owner as blocked on click", async () => {
      useAuthStore.getState().setSession({ user: { id: "user-1" } } as never);
      usePublicProfileQuery.mockReturnValue({
        data: samplePublicProfile,
        isPending: false,
        isError: false
      });

      renderPage();
      fireEvent.click(screen.getByRole("button", { name: "屏蔽此人" }));

      await waitFor(() => {
        expect(blockMutateAsyncMock).toHaveBeenCalledWith({
          blockerId: "user-1",
          blockedId: "user-2"
        });
      });
    });

    it("calls unblockUser instead when already blocking", async () => {
      useAuthStore.getState().setSession({ user: { id: "user-1" } } as never);
      useIsBlockingQuery.mockReturnValue({ data: true });
      usePublicProfileQuery.mockReturnValue({
        data: samplePublicProfile,
        isPending: false,
        isError: false
      });

      renderPage();
      fireEvent.click(screen.getByRole("button", { name: "取消屏蔽" }));

      await waitFor(() => {
        expect(unblockMutateAsyncMock).toHaveBeenCalledWith({
          blockerId: "user-1",
          blockedId: "user-2"
        });
      });
      expect(blockMutateAsyncMock).not.toHaveBeenCalled();
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

  // 22 号卡（用户主页改版）：新增的"发布的作品"网格，复用 PostList 组件，
  // 只多传一个 authorId——只验证这条数据管线接对了（authorId 传的是当前
  // 主页 userId、标题文案存在），不重复 PostList 自己那份详尽测试
  // （加载中/空状态/分页/卡片渲染……见 post-list.test.tsx）。
  describe("发布的作品 (22 号卡：复用 PostList，只按 authorId 筛选)", () => {
    it("renders a '发布的作品' heading and requests posts filtered to this profile's userId", async () => {
      usePublicProfileQuery.mockReturnValue({
        data: samplePublicProfile,
        isPending: false,
        isError: false
      });

      renderPage();

      expect(screen.getByRole("heading", { name: "发布的作品" })).toBeInTheDocument();
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

      expect(screen.getByRole("heading", { name: "发布的作品" })).toBeInTheDocument();
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
