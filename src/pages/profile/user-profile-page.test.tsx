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
  unblockMutateAsyncMock
} = vi.hoisted(() => ({
  usePublicProfileQuery: vi.fn(),
  useCreateProfileConversationMutation: vi.fn(),
  mutateMock: vi.fn(),
  navigateMock: vi.fn(),
  useIsBlockingQuery: vi.fn(),
  useBlockUserMutation: vi.fn(),
  useUnblockUserMutation: vi.fn(),
  blockMutateAsyncMock: vi.fn(),
  unblockMutateAsyncMock: vi.fn()
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

    useCreateProfileConversationMutation.mockReturnValue({
      mutate: mutateMock,
      isPending: false
    });
    useIsBlockingQuery.mockReturnValue({ data: false });
    useBlockUserMutation.mockReturnValue({ mutateAsync: blockMutateAsyncMock, isPending: false });
    useUnblockUserMutation.mockReturnValue({ mutateAsync: unblockMutateAsyncMock, isPending: false });
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

  it("renders avatar-initial placeholder, nickname, location, and bio for a normal profile", () => {
    usePublicProfileQuery.mockReturnValue({
      data: samplePublicProfile,
      isPending: false,
      isError: false
    });

    const { container } = renderPage();

    expect(container.querySelector("img")).not.toBeInTheDocument();
    expect(screen.getByText("B")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Bob" })).toBeInTheDocument();
    expect(screen.getByText("Rockville")).toBeInTheDocument();
    expect(screen.getByText("Hi there, I like hiking.")).toBeInTheDocument();
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

  // 04 号卡改版：顶部换成 TopBar detail 变体，页面自己不再手写返回按钮。
  it("renders the TopBar detail variant's back button", () => {
    usePublicProfileQuery.mockReturnValue({ data: undefined, isPending: true, isError: false });

    renderPage();

    expect(screen.getByRole("button", { name: "返回" })).toBeInTheDocument();
  });

  // UGC 安全功能补齐任务卡 2（举报用户）之前，这个仓库还没有"举报用户"
  // 功能，这里曾经断言"…"更多菜单按钮不渲染；补上举报用户入口之后这条
  // 测试改成验证菜单和里面的"举报用户"链接确实存在，见下面新增的
  // describe("举报用户 more-menu entry") 区块。

  // 04 号卡验收标准："发起者主页只有「发消息」一个主操作按钮且居中，没有
  // 收藏/星标按钮"。UGC 安全功能补齐任务卡 1 之后新增的"屏蔽此人"按钮和
  // 任务卡 2 新增的"更多操作"更多菜单触发按钮，都是这两次任务卡明确要求
  // 加的入口，不属于这条验收标准想排除的"收藏/星标"类按钮，所以按钮总数
  // 从 2 个变成 4 个（返回 + 发消息 + 屏蔽此人 + 更多操作），断言跟着更新，
  // 而不是删掉这条测试。
  it("renders '发消息'/'屏蔽此人'/'更多操作' as the only action buttons on someone else's profile — no favorite/follow button", () => {
    usePublicProfileQuery.mockReturnValue({
      data: samplePublicProfile,
      isPending: false,
      isError: false
    });

    renderPage();

    expect(screen.getAllByRole("button")).toHaveLength(4); // 返回 + 发消息 + 屏蔽此人 + 更多操作
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

  // UGC 安全功能补齐任务卡 2（举报用户）。
  describe("举报用户 more-menu entry", () => {
    it("renders a '更多操作' menu with a '举报用户' link to /users/:userId/report on someone else's profile", () => {
      usePublicProfileQuery.mockReturnValue({
        data: samplePublicProfile,
        isPending: false,
        isError: false
      });

      renderPage();

      fireEvent.click(screen.getByRole("button", { name: "更多操作" }));

      const reportLink = screen.getByRole("link", { name: "举报用户" });
      expect(reportLink).toHaveAttribute("href", "/users/user-2/report");
    });

    it("does not render the '更多操作' menu button on your own profile", () => {
      useAuthStore.getState().setSession({ user: { id: "user-2" } } as never);
      usePublicProfileQuery.mockReturnValue({
        data: samplePublicProfile,
        isPending: false,
        isError: false
      });

      renderPage();

      expect(screen.queryByRole("button", { name: "更多操作" })).not.toBeInTheDocument();
    });

    it("does not render the '更多操作' menu button while the profile is still loading", () => {
      usePublicProfileQuery.mockReturnValue({ data: undefined, isPending: true, isError: false });

      renderPage();

      expect(screen.queryByRole("button", { name: "更多操作" })).not.toBeInTheDocument();
    });
  });
});
