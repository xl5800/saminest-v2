import { cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const {
  listMyOrganizedActivities,
  listMyJoinedActivities,
  cancelActivity,
  leaveActivity,
  createActivityConversation,
  sendMessage,
  getMyProfile
} = vi.hoisted(() => ({
  listMyOrganizedActivities: vi.fn(),
  listMyJoinedActivities: vi.fn(),
  cancelActivity: vi.fn(),
  leaveActivity: vi.fn(),
  createActivityConversation: vi.fn(),
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
    leaveActivity
  };
});
// "退出"这个 tab 现在走 useToggleActivityParticipationMutation（真实实现，
// 没有 mock 掉这个 hook 本身）——那个 hook 除了 leaveActivity 还会尝试给
// 发起人发一条私信通知，依赖这三个仓库函数，这里一并 mock 掉，避免测试
// 时真的打到 Supabase。
vi.mock("../../repositories/conversations-repository", () => ({
  createActivityConversation
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
  status: "open"
};

const sampleJoinedActivity = {
  ...sampleOrganizedActivity,
  id: "act-2",
  organizerId: "organizer-1",
  title: "别人发起的活动"
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
    createActivityConversation.mockReset();
    sendMessage.mockReset();
    getMyProfile.mockReset();
    // 两个 tab 背后是两个独立查询，默认都给一个已解决的空结果，避免每个
    // 只关心其中一个 tab 的用例都要重复 mock 另一个。
    listMyOrganizedActivities.mockResolvedValue([]);
    listMyJoinedActivities.mockResolvedValue([]);
    getMyProfile.mockResolvedValue({ displayName: "Alice", avatarUrl: null });
    createActivityConversation.mockResolvedValue({ conversationId: "conv-1" });
    sendMessage.mockResolvedValue({ id: "msg-1" });
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
});
