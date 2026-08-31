import { QueryClient } from "@tanstack/react-query";
import { cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// 30 号卡：jsdom 没有实现 scrollIntoView，"从查看申请链接跳过来自动
// 滚动到对应审核面板"这个行为需要一个桩实现才能在测试里跑，跟这个仓库
// 别处给 IntersectionObserver 打桩（src/test/setup.ts）是同一个道理，只是
// 这个只有这一个页面用得到，就近声明在这个文件里，不搬进全局 setup。
const scrollIntoViewMock = vi.fn();
Element.prototype.scrollIntoView = scrollIntoViewMock;

const {
  listMyOrganizedActivities,
  listMyJoinedActivities,
  cancelActivity,
  leaveActivity,
  listPendingActivityParticipants,
  approveActivityParticipant,
  rejectActivityParticipant,
  createActivityConversation,
  findExistingActivityConversation,
  sendMessage,
  getMyProfile
} = vi.hoisted(() => ({
  listMyOrganizedActivities: vi.fn(),
  listMyJoinedActivities: vi.fn(),
  cancelActivity: vi.fn(),
  leaveActivity: vi.fn(),
  listPendingActivityParticipants: vi.fn(),
  approveActivityParticipant: vi.fn(),
  rejectActivityParticipant: vi.fn(),
  createActivityConversation: vi.fn(),
  findExistingActivityConversation: vi.fn(),
  sendMessage: vi.fn(),
  getMyProfile: vi.fn()
}));

vi.mock("../../repositories/activities-repository", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../repositories/activities-repository")>();
  return {
    ...actual,
    listMyOrganizedActivities,
    listMyJoinedActivities,
    cancelActivity,
    leaveActivity,
    listPendingActivityParticipants,
    approveActivityParticipant,
    rejectActivityParticipant
  };
});
// "退出"这个 tab 现在走 useToggleActivityParticipationMutation（真实实现，
// 没有 mock 掉这个 hook 本身）——那个 hook 除了 leaveActivity 还会尝试给
// 发起人发一条私信通知，依赖这几个仓库函数，这里一并 mock 掉，避免测试
// 时真的打到 Supabase。findExistingActivityConversation 是
// useModerateActivityParticipantMutation（同意/拒绝申请后反向通知申请人）
// 依赖的查找函数，同一个原因需要 mock。
vi.mock("../../repositories/conversations-repository", () => ({
  createActivityConversation,
  findExistingActivityConversation
}));
vi.mock("../../repositories/messages-repository", () => ({
  sendMessage
}));
vi.mock("../../repositories/profiles-repository", () => ({
  getMyProfile
}));

import { useAuthStore } from "../../store/auth-store";
import { renderWithProviders } from "../../test/render-with-providers";
import { MyActivitiesPage } from "./my-activities-page";

const initialAuthState = useAuthStore.getState();

const sampleOrganizedActivity = {
  id: "act-1",
  organizerId: "user-1",
  channel: "food",
  tagText: "火锅",
  title: "周末吃火锅",
  locationName: "Rockville",
  landmarkText: "海底捞",
  isOnline: false,
  startAt: "2099-08-20T18:00:00.000Z",
  capacity: 4,
  participantCount: 2,
  status: "open",
  requiresApproval: false
};

const sampleJoinedActivity = {
  ...sampleOrganizedActivity,
  id: "act-2",
  organizerId: "organizer-1",
  title: "别人发起的活动",
  participationStatus: "approved" as const
};

const samplePendingApplicant = {
  participantId: "participant-1",
  activityId: "act-1",
  userId: "applicant-1",
  displayName: "Bob"
};

describe("MyActivitiesPage", () => {
  afterEach(() => {
    cleanup();
  });

  beforeEach(() => {
    useAuthStore.setState(initialAuthState, true);
    useAuthStore.getState().setSession({ user: { id: "user-1" } } as never);
    listMyOrganizedActivities.mockReset();
    listMyJoinedActivities.mockReset();
    cancelActivity.mockReset();
    leaveActivity.mockReset();
    listPendingActivityParticipants.mockReset();
    approveActivityParticipant.mockReset();
    rejectActivityParticipant.mockReset();
    createActivityConversation.mockReset();
    findExistingActivityConversation.mockReset();
    sendMessage.mockReset();
    getMyProfile.mockReset();
    // 两个 tab 背后是两个独立查询，默认都给一个已解决的空结果，避免每个
    // 只关心其中一个 tab 的用例都要重复 mock 另一个。
    listMyOrganizedActivities.mockResolvedValue([]);
    listMyJoinedActivities.mockResolvedValue([]);
    listPendingActivityParticipants.mockResolvedValue([]);
    getMyProfile.mockResolvedValue({ displayName: "Alice", avatarUrl: null });
    createActivityConversation.mockResolvedValue({ conversationId: "conv-1" });
    findExistingActivityConversation.mockResolvedValue({ conversationId: "conv-1" });
    sendMessage.mockResolvedValue({ id: "msg-1" });
    scrollIntoViewMock.mockReset();
  });

  it("defaults to the '我发起的' tab", async () => {
    renderWithProviders(<MyActivitiesPage />);

    expect(screen.getByRole("button", { name: "我发起的" })).toHaveAttribute(
      "aria-current",
      "page"
    );
    expect(screen.getByRole("button", { name: "我报名的" })).not.toHaveAttribute(
      "aria-current"
    );
  });

  // 21 号卡（二级页面顶部栏简化）：顶部栏换成 TopBar 的 nav-only 变体，
  // 不再是全局 AppHeader 的"← Saminest 发布"——跟
  // region-select-page.test.tsx "renders the nav-only TopBar..." 是同一个
  // 断言模式。页面下面本来就有"我的活动"这行 <h1> 大标题，不受影响。
  it("renders the nav-only TopBar (back arrow only, no title/brand/publish text)", () => {
    renderWithProviders(<MyActivitiesPage />);

    expect(screen.getByRole("button", { name: "返回" })).toBeInTheDocument();
    expect(screen.queryByText("Saminest")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "发布" })).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "我的活动" })).toBeInTheDocument();
  });

  it("shows a loading state before the organized-activities query resolves", () => {
    listMyOrganizedActivities.mockReturnValue(new Promise(() => {}));

    renderWithProviders(<MyActivitiesPage />);

    expect(screen.getByRole("status")).toHaveTextContent("加载中");
  });

  it("shows an error state when the organized-activities query fails", async () => {
    listMyOrganizedActivities.mockRejectedValue(new Error("network down"));

    renderWithProviders(<MyActivitiesPage />);

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "活动加载失败，请稍后重试。"
    );
  });

  it("shows an empty state linking to /activities/new on the '我发起的' tab", async () => {
    renderWithProviders(<MyActivitiesPage />);

    expect(await screen.findByRole("link", { name: "去发起一个" })).toHaveAttribute(
      "href",
      "/activities/new"
    );
  });

  it("renders an organized activity's title, channel, location, time, participant summary, and status badge", async () => {
    listMyOrganizedActivities.mockResolvedValue([sampleOrganizedActivity]);

    renderWithProviders(<MyActivitiesPage />);

    const link = await screen.findByRole("link", { name: /周末吃火锅/ });
    expect(link).toHaveAttribute("href", "/activities/act-1");
    expect(link).toHaveTextContent("🍜 周末吃火锅");
    expect(link).toHaveTextContent("吃饭搭子");
    expect(link).toHaveTextContent("海底捞");
    expect(link).toHaveTextContent("还差 2 人（2/4）");
    expect(screen.getByText("招募中")).toBeInTheDocument();
  });

  it("shows a '取消活动' action only when status is open/full, not for cancelled/ended", async () => {
    listMyOrganizedActivities.mockResolvedValue([
      { ...sampleOrganizedActivity, id: "act-open", status: "open" },
      { ...sampleOrganizedActivity, id: "act-full", status: "full" },
      { ...sampleOrganizedActivity, id: "act-cancelled", status: "cancelled" },
      { ...sampleOrganizedActivity, id: "act-ended", status: "ended" }
    ]);

    renderWithProviders(<MyActivitiesPage />);

    await screen.findAllByText(/周末吃火锅/);
    expect(screen.getAllByRole("button", { name: "取消活动" })).toHaveLength(2);
  });

  it("opens a confirmation dialog when '取消活动' is clicked, and does not call cancelActivity before confirming", async () => {
    listMyOrganizedActivities.mockResolvedValue([sampleOrganizedActivity]);

    renderWithProviders(<MyActivitiesPage />);
    await screen.findByText(/周末吃火锅/);

    fireEvent.click(screen.getByRole("button", { name: "取消活动" }));

    expect(screen.getByRole("dialog", { name: "确认取消" })).toBeInTheDocument();
    expect(cancelActivity).not.toHaveBeenCalled();
  });

  it("calls cancelActivity and updates the row to '已取消' after confirming, removing the 取消活动 action", async () => {
    listMyOrganizedActivities.mockResolvedValue([sampleOrganizedActivity]);
    cancelActivity.mockResolvedValue(undefined);

    renderWithProviders(<MyActivitiesPage />);
    await screen.findByText(/周末吃火锅/);

    fireEvent.click(screen.getByRole("button", { name: "取消活动" }));
    fireEvent.click(screen.getByRole("button", { name: "确认取消" }));

    await waitFor(() => {
      expect(cancelActivity).toHaveBeenCalledWith("act-1");
    });
    expect(await screen.findByText("已取消")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "取消活动" })).not.toBeInTheDocument();
    expect(screen.queryByRole("dialog", { name: "确认取消" })).not.toBeInTheDocument();
  });

  it("closes the confirmation dialog without calling cancelActivity when '取消' is clicked", async () => {
    listMyOrganizedActivities.mockResolvedValue([sampleOrganizedActivity]);

    renderWithProviders(<MyActivitiesPage />);
    await screen.findByText(/周末吃火锅/);

    fireEvent.click(screen.getByRole("button", { name: "取消活动" }));
    fireEvent.click(screen.getByRole("dialog").querySelector("button")!);

    expect(screen.queryByRole("dialog", { name: "确认取消" })).not.toBeInTheDocument();
    expect(cancelActivity).not.toHaveBeenCalled();
  });

  it("shows an error message inside the dialog and keeps the row unchanged when cancelActivity fails", async () => {
    listMyOrganizedActivities.mockResolvedValue([sampleOrganizedActivity]);
    cancelActivity.mockRejectedValue(new Error("failed"));

    renderWithProviders(<MyActivitiesPage />);
    await screen.findByText(/周末吃火锅/);

    fireEvent.click(screen.getByRole("button", { name: "取消活动" }));
    fireEvent.click(screen.getByRole("button", { name: "确认取消" }));

    // 卡片和弹窗各自都会展示这条行级错误（rowErrors 是同一份 state，两处
    // 都读），所以这里有两个 role="alert" 元素，用 findAllByRole 而不是
    // findByRole（后者在命中多个元素时会报错）。
    const alerts = await screen.findAllByRole("alert");
    expect(alerts.length).toBeGreaterThan(0);
    for (const alert of alerts) {
      expect(alert).toHaveTextContent("操作失败，请稍后重试。");
    }
    expect(screen.getByText("招募中")).toBeInTheDocument();
  });

  it("switches to the '我报名的' tab and shows its empty state linking to /activities", async () => {
    renderWithProviders(<MyActivitiesPage />);

    fireEvent.click(screen.getByRole("button", { name: "我报名的" }));

    expect(
      await screen.findByRole("link", { name: "去看看有什么活动" })
    ).toHaveAttribute("href", "/activities");
  });

  it("renders a joined activity and marks '我报名的' as active after switching", async () => {
    listMyJoinedActivities.mockResolvedValue([sampleJoinedActivity]);

    renderWithProviders(<MyActivitiesPage />);
    fireEvent.click(screen.getByRole("button", { name: "我报名的" }));

    expect(await screen.findByText(/别人发起的活动/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "我报名的" })).toHaveAttribute(
      "aria-current",
      "page"
    );
  });

  it("shows '发起人已取消此活动' for a joined activity whose status is 'cancelled'", async () => {
    listMyJoinedActivities.mockResolvedValue([
      { ...sampleJoinedActivity, status: "cancelled" }
    ]);

    renderWithProviders(<MyActivitiesPage />);
    fireEvent.click(screen.getByRole("button", { name: "我报名的" }));

    expect(await screen.findByText("发起人已取消此活动")).toBeInTheDocument();
  });

  it("shows '申请中，等待发起人同意' for a joined activity whose participationStatus is 'pending'", async () => {
    listMyJoinedActivities.mockResolvedValue([
      { ...sampleJoinedActivity, participationStatus: "pending" }
    ]);

    renderWithProviders(<MyActivitiesPage />);
    fireEvent.click(screen.getByRole("button", { name: "我报名的" }));

    expect(await screen.findByText("申请中，等待发起人同意")).toBeInTheDocument();
  });

  it("does not show the pending note for an approved participation", async () => {
    listMyJoinedActivities.mockResolvedValue([sampleJoinedActivity]);

    renderWithProviders(<MyActivitiesPage />);
    fireEvent.click(screen.getByRole("button", { name: "我报名的" }));
    await screen.findByText(/别人发起的活动/);

    expect(screen.queryByText("申请中，等待发起人同意")).not.toBeInTheDocument();
  });

  it("shows a '退出' button on the joined tab, with no confirmation dialog, that removes the row on success", async () => {
    listMyJoinedActivities.mockResolvedValue([sampleJoinedActivity]);
    leaveActivity.mockResolvedValue(undefined);

    renderWithProviders(<MyActivitiesPage />);
    fireEvent.click(screen.getByRole("button", { name: "我报名的" }));
    await screen.findByText(/别人发起的活动/);

    fireEvent.click(screen.getByRole("button", { name: "退出" }));

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    await waitFor(() => {
      expect(leaveActivity).toHaveBeenCalledWith("act-2", "user-1");
    });
    await waitFor(() => {
      expect(screen.queryByText(/别人发起的活动/)).not.toBeInTheDocument();
    });
  });

  it("uses useToggleActivityParticipationMutation for '退出' (not a bare leaveActivity call), so the organizer gets the same '退出了你的活动' notification as from the detail page", async () => {
    listMyJoinedActivities.mockResolvedValue([sampleJoinedActivity]);
    leaveActivity.mockResolvedValue(undefined);

    renderWithProviders(<MyActivitiesPage />);
    fireEvent.click(screen.getByRole("button", { name: "我报名的" }));
    await screen.findByText(/别人发起的活动/);

    fireEvent.click(screen.getByRole("button", { name: "退出" }));

    await waitFor(() => {
      expect(sendMessage).toHaveBeenCalled();
    });
    expect(createActivityConversation).toHaveBeenCalledWith("act-2");
    expect(sendMessage).toHaveBeenCalledWith({
      conversationId: "conv-1",
      senderId: "user-1",
      body: "Alice 退出了你的活动《别人发起的活动》"
    });
  });

  it("shows a row-level error and keeps the row when leaveActivity fails", async () => {
    listMyJoinedActivities.mockResolvedValue([sampleJoinedActivity]);
    leaveActivity.mockRejectedValue(new Error("failed"));

    renderWithProviders(<MyActivitiesPage />);
    fireEvent.click(screen.getByRole("button", { name: "我报名的" }));
    await screen.findByText(/别人发起的活动/);

    fireEvent.click(screen.getByRole("button", { name: "退出" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "操作失败，请稍后重试。"
    );
    expect(screen.getByText(/别人发起的活动/)).toBeInTheDocument();
  });

  it("shows a '待审核申请（N）' panel only for a requires_approval activity that has pending applicants", async () => {
    listMyOrganizedActivities.mockResolvedValue([
      { ...sampleOrganizedActivity, requiresApproval: true }
    ]);
    listPendingActivityParticipants.mockResolvedValue([samplePendingApplicant]);

    renderWithProviders(<MyActivitiesPage />);

    expect(await screen.findByText("待审核申请（1）")).toBeInTheDocument();
    expect(screen.getByText("Bob")).toBeInTheDocument();
  });

  it("does not show a pending-applicants panel for an activity that does not require approval", async () => {
    listMyOrganizedActivities.mockResolvedValue([sampleOrganizedActivity]);
    listPendingActivityParticipants.mockResolvedValue([samplePendingApplicant]);

    renderWithProviders(<MyActivitiesPage />);
    await screen.findByText(/周末吃火锅/);

    expect(screen.queryByText(/待审核申请/)).not.toBeInTheDocument();
  });

  it("calls approveActivityParticipant on 同意, removes the applicant from the panel, and bumps participantCount locally", async () => {
    listMyOrganizedActivities.mockResolvedValue([
      { ...sampleOrganizedActivity, requiresApproval: true, participantCount: 2, capacity: 4 }
    ]);
    listPendingActivityParticipants.mockResolvedValue([samplePendingApplicant]);
    approveActivityParticipant.mockResolvedValue(undefined);

    renderWithProviders(<MyActivitiesPage />);
    await screen.findByText("待审核申请（1）");

    fireEvent.click(screen.getByRole("button", { name: "同意" }));

    await waitFor(() => {
      expect(approveActivityParticipant).toHaveBeenCalledWith("participant-1");
    });
    expect(screen.queryByText("Bob")).not.toBeInTheDocument();
    expect(await screen.findByText("还差 1 人（3/4）")).toBeInTheDocument();
  });

  it("flips an organized activity to '已满员' locally when an approval fills the last spot", async () => {
    listMyOrganizedActivities.mockResolvedValue([
      { ...sampleOrganizedActivity, requiresApproval: true, participantCount: 3, capacity: 4 }
    ]);
    listPendingActivityParticipants.mockResolvedValue([samplePendingApplicant]);
    approveActivityParticipant.mockResolvedValue(undefined);

    renderWithProviders(<MyActivitiesPage />);
    await screen.findByText("待审核申请（1）");

    fireEvent.click(screen.getByRole("button", { name: "同意" }));

    expect(await screen.findByText("已满员")).toBeInTheDocument();
  });

  it("calls rejectActivityParticipant on 拒绝, removes the applicant, and leaves participantCount unchanged", async () => {
    listMyOrganizedActivities.mockResolvedValue([
      { ...sampleOrganizedActivity, requiresApproval: true, participantCount: 2, capacity: 4 }
    ]);
    listPendingActivityParticipants.mockResolvedValue([samplePendingApplicant]);
    rejectActivityParticipant.mockResolvedValue(undefined);

    renderWithProviders(<MyActivitiesPage />);
    await screen.findByText("待审核申请（1）");

    fireEvent.click(screen.getByRole("button", { name: "拒绝" }));

    await waitFor(() => {
      expect(rejectActivityParticipant).toHaveBeenCalledWith("participant-1");
    });
    expect(screen.queryByText("Bob")).not.toBeInTheDocument();
    expect(screen.getByText("还差 2 人（2/4）")).toBeInTheDocument();
  });

  it("sends a '被同意了' notification to the applicant via findExistingActivityConversation + sendMessage when approving", async () => {
    listMyOrganizedActivities.mockResolvedValue([
      { ...sampleOrganizedActivity, requiresApproval: true }
    ]);
    listPendingActivityParticipants.mockResolvedValue([samplePendingApplicant]);
    approveActivityParticipant.mockResolvedValue(undefined);

    renderWithProviders(<MyActivitiesPage />);
    await screen.findByText("待审核申请（1）");

    fireEvent.click(screen.getByRole("button", { name: "同意" }));

    await waitFor(() => {
      expect(sendMessage).toHaveBeenCalled();
    });
    expect(findExistingActivityConversation).toHaveBeenCalledWith({
      applicantUserId: "applicant-1",
      organizerUserId: "user-1"
    });
    expect(sendMessage).toHaveBeenCalledWith({
      conversationId: "conv-1",
      senderId: "user-1",
      body: "你申请加入的《周末吃火锅》被同意了"
    });
  });

  it("sends a '被拒绝了' notification to the applicant when rejecting", async () => {
    listMyOrganizedActivities.mockResolvedValue([
      { ...sampleOrganizedActivity, requiresApproval: true }
    ]);
    listPendingActivityParticipants.mockResolvedValue([samplePendingApplicant]);
    rejectActivityParticipant.mockResolvedValue(undefined);

    renderWithProviders(<MyActivitiesPage />);
    await screen.findByText("待审核申请（1）");

    fireEvent.click(screen.getByRole("button", { name: "拒绝" }));

    await waitFor(() => {
      expect(sendMessage).toHaveBeenCalledWith({
        conversationId: "conv-1",
        senderId: "user-1",
        body: "你申请加入的《周末吃火锅》被拒绝了"
      });
    });
  });

  it("shows a row-level error and keeps the applicant in the panel when approveActivityParticipant fails", async () => {
    listMyOrganizedActivities.mockResolvedValue([
      { ...sampleOrganizedActivity, requiresApproval: true }
    ]);
    listPendingActivityParticipants.mockResolvedValue([samplePendingApplicant]);
    approveActivityParticipant.mockRejectedValue(new Error("failed"));

    renderWithProviders(<MyActivitiesPage />);
    await screen.findByText("待审核申请（1）");

    fireEvent.click(screen.getByRole("button", { name: "同意" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("操作失败，请稍后重试。");
    expect(screen.getByText("Bob")).toBeInTheDocument();
  });

  it("shows a row-level error and keeps the applicant in the panel when rejectActivityParticipant fails", async () => {
    listMyOrganizedActivities.mockResolvedValue([
      { ...sampleOrganizedActivity, requiresApproval: true }
    ]);
    listPendingActivityParticipants.mockResolvedValue([samplePendingApplicant]);
    rejectActivityParticipant.mockRejectedValue(new Error("failed"));

    renderWithProviders(<MyActivitiesPage />);
    await screen.findByText("待审核申请（1）");

    fireEvent.click(screen.getByRole("button", { name: "拒绝" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("操作失败，请稍后重试。");
    expect(screen.getByText("Bob")).toBeInTheDocument();
  });

  // 30 号卡（打通"活动申请通知"到审核页面的跳转）。
  describe("'我发起的' tab 待审核红点", () => {
    it("shows a dot next to '我发起的' when there is at least one pending applicant", async () => {
      listMyOrganizedActivities.mockResolvedValue([
        { ...sampleOrganizedActivity, requiresApproval: true }
      ]);
      listPendingActivityParticipants.mockResolvedValue([samplePendingApplicant]);

      renderWithProviders(<MyActivitiesPage />);

      expect(await screen.findByTestId("pending-applicants-tab-dot")).toBeInTheDocument();
    });

    it("does not show the dot when there are no pending applicants", async () => {
      listMyOrganizedActivities.mockResolvedValue([
        { ...sampleOrganizedActivity, requiresApproval: true }
      ]);
      listPendingActivityParticipants.mockResolvedValue([]);

      renderWithProviders(<MyActivitiesPage />);
      await screen.findByText(/周末吃火锅/);

      expect(screen.queryByTestId("pending-applicants-tab-dot")).not.toBeInTheDocument();
    });

    it("removes the dot after approving the only pending applicant", async () => {
      listMyOrganizedActivities.mockResolvedValue([
        { ...sampleOrganizedActivity, requiresApproval: true }
      ]);
      listPendingActivityParticipants.mockResolvedValue([samplePendingApplicant]);
      approveActivityParticipant.mockResolvedValue(undefined);

      renderWithProviders(<MyActivitiesPage />);
      await screen.findByTestId("pending-applicants-tab-dot");

      fireEvent.click(screen.getByRole("button", { name: "同意" }));

      await waitFor(() => {
        expect(screen.queryByTestId("pending-applicants-tab-dot")).not.toBeInTheDocument();
      });
    });

    it("invalidates the bottom-nav pending-approval query (['has-pending-activity-participants', userId]) after approving, so its dot disappears without waiting for a refocus", async () => {
      listMyOrganizedActivities.mockResolvedValue([
        { ...sampleOrganizedActivity, requiresApproval: true }
      ]);
      listPendingActivityParticipants.mockResolvedValue([samplePendingApplicant]);
      approveActivityParticipant.mockResolvedValue(undefined);
      const invalidateQueriesSpy = vi.spyOn(QueryClient.prototype, "invalidateQueries");

      renderWithProviders(<MyActivitiesPage />);
      await screen.findByText("待审核申请（1）");

      fireEvent.click(screen.getByRole("button", { name: "同意" }));

      await waitFor(() => {
        expect(invalidateQueriesSpy).toHaveBeenCalledWith({
          queryKey: ["has-pending-activity-participants", "user-1"]
        });
      });

      invalidateQueriesSpy.mockRestore();
    });

    it("also invalidates the bottom-nav pending-approval query after rejecting", async () => {
      listMyOrganizedActivities.mockResolvedValue([
        { ...sampleOrganizedActivity, requiresApproval: true }
      ]);
      listPendingActivityParticipants.mockResolvedValue([samplePendingApplicant]);
      rejectActivityParticipant.mockResolvedValue(undefined);
      const invalidateQueriesSpy = vi.spyOn(QueryClient.prototype, "invalidateQueries");

      renderWithProviders(<MyActivitiesPage />);
      await screen.findByText("待审核申请（1）");

      fireEvent.click(screen.getByRole("button", { name: "拒绝" }));

      await waitFor(() => {
        expect(invalidateQueriesSpy).toHaveBeenCalledWith({
          queryKey: ["has-pending-activity-participants", "user-1"]
        });
      });

      invalidateQueriesSpy.mockRestore();
    });
  });

  // 30 号卡：从"查看申请 →"链接跳过来（?pendingActivityId=<活动id>）自动
  // 展开+滚动到对应活动的审核面板。
  describe("从'查看申请 →'链接跳转过来的自动展开+滚动 (?pendingActivityId=)", () => {
    it("auto-expands and scrolls to the matching activity's pending-applicants panel", async () => {
      listMyOrganizedActivities.mockResolvedValue([
        { ...sampleOrganizedActivity, id: "act-1", requiresApproval: true }
      ]);
      listPendingActivityParticipants.mockResolvedValue([samplePendingApplicant]);

      renderWithProviders(<MyActivitiesPage />, {
        initialEntries: ["/my-activities?pendingActivityId=act-1"]
      });

      await screen.findByText("待审核申请（1）");

      const panel = document.getElementById("pending-applicants-panel-act-1");
      expect(panel).toHaveAttribute("open");
      expect(scrollIntoViewMock).toHaveBeenCalledWith({ behavior: "smooth", block: "center" });
    });

    it("does not auto-expand a different activity's panel that doesn't match pendingActivityId", async () => {
      listMyOrganizedActivities.mockResolvedValue([
        { ...sampleOrganizedActivity, id: "act-1", requiresApproval: true },
        { ...sampleOrganizedActivity, id: "act-2", title: "另一场活动", requiresApproval: true }
      ]);
      listPendingActivityParticipants.mockResolvedValue([
        samplePendingApplicant,
        { ...samplePendingApplicant, participantId: "participant-2", activityId: "act-2" }
      ]);

      renderWithProviders(<MyActivitiesPage />, {
        initialEntries: ["/my-activities?pendingActivityId=act-1"]
      });

      await screen.findAllByText(/待审核申请（1）/);

      expect(document.getElementById("pending-applicants-panel-act-1")).toHaveAttribute("open");
      expect(document.getElementById("pending-applicants-panel-act-2")).not.toHaveAttribute("open");
    });

    it("does nothing (no throw) when pendingActivityId does not match any organized activity", async () => {
      listMyOrganizedActivities.mockResolvedValue([sampleOrganizedActivity]);

      renderWithProviders(<MyActivitiesPage />, {
        initialEntries: ["/my-activities?pendingActivityId=does-not-exist"]
      });

      await screen.findByText(/周末吃火锅/);

      expect(scrollIntoViewMock).not.toHaveBeenCalled();
    });

    it("does not auto-expand anything when the URL has no pendingActivityId query param", async () => {
      listMyOrganizedActivities.mockResolvedValue([
        { ...sampleOrganizedActivity, requiresApproval: true }
      ]);
      listPendingActivityParticipants.mockResolvedValue([samplePendingApplicant]);

      renderWithProviders(<MyActivitiesPage />);
      await screen.findByText("待审核申请（1）");

      expect(document.getElementById("pending-applicants-panel-act-1")).not.toHaveAttribute("open");
      expect(scrollIntoViewMock).not.toHaveBeenCalled();
    });
  });
});
