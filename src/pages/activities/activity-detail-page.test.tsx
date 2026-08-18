import { cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const {
  useActivityDetailQuery,
  useActivityParticipantsQuery,
  useActivityParticipationQuery,
  useToggleActivityParticipationMutation,
  useActivityFavoriteIdsQuery,
  useToggleActivityFavoriteMutation,
  shareMock,
  mutateParticipationMock
} = vi.hoisted(() => ({
  useActivityDetailQuery: vi.fn(),
  useActivityParticipantsQuery: vi.fn(),
  useActivityParticipationQuery: vi.fn(),
  useToggleActivityParticipationMutation: vi.fn(),
  useActivityFavoriteIdsQuery: vi.fn(),
  useToggleActivityFavoriteMutation: vi.fn(),
  shareMock: vi.fn(),
  mutateParticipationMock: vi.fn()
}));

vi.mock("../../features/activities/use-activity-detail-query", () => ({
  useActivityDetailQuery
}));
vi.mock("../../features/activities/use-activity-participants-query", () => ({
  useActivityParticipantsQuery
}));
// ActivityDetailPage 现在自己调用一次 useActivityParticipationAction
// （内部实际调的是这两个 hook），驱动"参加活动"按钮和头像堆叠的空位，
// mock 到这一层，跟 activity-participation-button.test.tsx 是同一个模式。
vi.mock("../../features/activities/use-activity-participation-query", () => ({
  useActivityParticipationQuery
}));
vi.mock("../../features/activities/use-toggle-activity-participation-mutation", () => ({
  useToggleActivityParticipationMutation
}));
// ActivityDetailPage 渲染 ActivityFavoriteButton，那个组件自己有一套 hook
// （跟 PostDetailPage mock FavoriteButton 依赖的 hook 是同一个模式）。
vi.mock("../../features/activities/use-activity-favorite-ids-query", () => ({
  useActivityFavoriteIdsQuery
}));
vi.mock("../../features/activities/use-toggle-activity-favorite-mutation", () => ({
  useToggleActivityFavoriteMutation
}));
vi.mock("@capacitor/share", () => ({
  Share: { share: shareMock }
}));

import { useAuthStore } from "../../store/auth-store";
import { renderWithProviders } from "../../test/render-with-providers";
import { ActivityDetailPage } from "./activity-detail-page";

const initialAuthState = useAuthStore.getState();

const sampleActivityDetail = {
  id: "act-1",
  organizerId: "user-1",
  organizerDisplayName: "Alice",
  organizerAvatarUrl: null,
  channel: "food",
  tagText: "火锅",
  title: "周末吃火锅",
  description: "一起吃火锅，AA制",
  locationId: "loc-1",
  locationName: "Rockville",
  landmarkText: "海底捞",
  isOnline: false,
  startAt: "2099-08-20T18:00:00.000Z",
  capacity: 4,
  participantCount: 2,
  contactMethod: "wechat",
  contactValue: "abc123",
  status: "open",
  requiresApproval: false
};

describe("ActivityDetailPage", () => {
  afterEach(() => {
    cleanup();
  });

  beforeEach(() => {
    useAuthStore.setState(initialAuthState, true);
    useActivityDetailQuery.mockReset();
    useActivityParticipantsQuery.mockReset();
    useActivityParticipationQuery.mockReset();
    useToggleActivityParticipationMutation.mockReset();
    useActivityFavoriteIdsQuery.mockReset();
    useToggleActivityFavoriteMutation.mockReset();
    shareMock.mockReset();
    mutateParticipationMock.mockReset();

    useActivityParticipantsQuery.mockReturnValue({ data: [] });
    useActivityParticipationQuery.mockReturnValue({ data: null, isPending: false });
    useToggleActivityParticipationMutation.mockReturnValue({
      mutate: mutateParticipationMock,
      isPending: false
    });
    useActivityFavoriteIdsQuery.mockReturnValue({ data: [] });
    useToggleActivityFavoriteMutation.mockReturnValue({ mutate: vi.fn(), isPending: false });
  });

  it("shows a loading message while the query is pending", () => {
    useActivityDetailQuery.mockReturnValue({ data: undefined, isPending: true, isError: false });

    renderWithProviders(<ActivityDetailPage />, {
      initialEntries: ["/activities/act-1"],
      route: "/activities/:id"
    });

    expect(screen.getByRole("status")).toHaveTextContent("加载中…");
  });

  it("shows a plain error message on a genuine fetch failure", () => {
    useActivityDetailQuery.mockReturnValue({ data: undefined, isPending: false, isError: true });

    renderWithProviders(<ActivityDetailPage />, {
      initialEntries: ["/activities/act-1"],
      route: "/activities/:id"
    });

    expect(screen.getByRole("alert")).toHaveTextContent("活动加载失败，请稍后重试。");
  });

  it("shows a friendly not-found message, without distinguishing missing vs. invisible, when the query resolves to null", () => {
    useActivityDetailQuery.mockReturnValue({ data: null, isPending: false, isError: false });

    renderWithProviders(<ActivityDetailPage />, {
      initialEntries: ["/activities/act-1"],
      route: "/activities/:id"
    });

    expect(screen.getByRole("heading", { name: "活动未找到" })).toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent("活动不存在或已被取消。");
  });

  it("renders the full activity content in the new order: title, channel/tag, avatar stack, time, location, description, contact info", () => {
    useActivityDetailQuery.mockReturnValue({
      data: sampleActivityDetail,
      isPending: false,
      isError: false
    });

    const { container } = renderWithProviders(<ActivityDetailPage />, {
      initialEntries: ["/activities/act-1"],
      route: "/activities/:id"
    });

    expect(screen.getByRole("heading", { name: "🍜 周末吃火锅" })).toBeInTheDocument();
    expect(screen.getByText("吃饭搭子")).toBeInTheDocument();
    expect(screen.getByText("火锅")).toBeInTheDocument();
    expect(screen.getByText(/发起人：/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Alice" })).toHaveAttribute("href", "/users/user-1");
    expect(screen.getByText("海底捞")).toBeInTheDocument();
    expect(screen.getByText("Rockville")).toBeInTheDocument();
    expect(screen.getByText("一起吃火锅，AA制")).toBeInTheDocument();
    expect(screen.getByText("abc123")).toBeInTheDocument();

    // 页面顺序断言：标题 → 频道/标签(+发起人) → 头像堆叠 → 时间 → 地点 →
    // 描述 → 联系方式 → 发起人卡片 → 按钮对 → 操作行，用各个文案在
    // document.body.textContent 里出现的先后顺序来断言，不依赖具体 DOM
    // 结构。
    const text = container.textContent ?? "";
    const titleIndex = text.indexOf("周末吃火锅");
    // 用频道标签"吃饭搭子"而不是活动标签"火锅"作为这一步的锚点文字——
    // "火锅"本身是标题"周末吃火锅"的子串，用它定位会误命中标题内部，不是
    // 真正的频道/标签徽标那一行。
    const tagIndex = text.indexOf("吃饭搭子");
    const organizerLinkIndex = text.indexOf("发起人：");
    const startAtIndex = text.indexOf("08-20");
    const locationIndex = text.indexOf("海底捞");
    const descriptionIndex = text.indexOf("一起吃火锅，AA制");
    const contactIndex = text.indexOf("联系方式");
    const reportIndex = text.indexOf("举报");

    expect(titleIndex).toBeLessThan(tagIndex);
    expect(tagIndex).toBeLessThan(organizerLinkIndex);
    expect(organizerLinkIndex).toBeLessThan(startAtIndex);
    expect(startAtIndex).toBeLessThan(locationIndex);
    expect(locationIndex).toBeLessThan(descriptionIndex);
    expect(descriptionIndex).toBeLessThan(contactIndex);
    expect(contactIndex).toBeLessThan(reportIndex);
  });

  it("renders the ActivityParticipantAvatars stack with the organizer's crown badge", () => {
    useActivityDetailQuery.mockReturnValue({
      data: sampleActivityDetail,
      isPending: false,
      isError: false
    });

    const { container } = renderWithProviders(<ActivityDetailPage />, {
      initialEntries: ["/activities/act-1"],
      route: "/activities/:id"
    });

    expect(container.querySelector("svg.lucide-crown")).toBeInTheDocument();
  });

  it("shows '线上活动' instead of a landmark/location when isOnline is true", () => {
    useActivityDetailQuery.mockReturnValue({
      data: { ...sampleActivityDetail, isOnline: true, landmarkText: null, locationName: null },
      isPending: false,
      isError: false
    });

    renderWithProviders(<ActivityDetailPage />, {
      initialEntries: ["/activities/act-1"],
      route: "/activities/:id"
    });

    expect(screen.getByText("线上活动")).toBeInTheDocument();
  });

  it("does not render a contact block when contactMethod/contactValue are null", () => {
    useActivityDetailQuery.mockReturnValue({
      data: { ...sampleActivityDetail, contactMethod: null, contactValue: null },
      isPending: false,
      isError: false
    });

    renderWithProviders(<ActivityDetailPage />, {
      initialEntries: ["/activities/act-1"],
      route: "/activities/:id"
    });

    expect(screen.queryByText(/联系方式/)).not.toBeInTheDocument();
  });

  it("does not render a participants list section when the query resolves to an empty list (not visible to this viewer, or nobody joined)", () => {
    useActivityDetailQuery.mockReturnValue({
      data: sampleActivityDetail,
      isPending: false,
      isError: false
    });
    useActivityParticipantsQuery.mockReturnValue({ data: [] });

    renderWithProviders(<ActivityDetailPage />, {
      initialEntries: ["/activities/act-1"],
      route: "/activities/:id"
    });

    expect(screen.queryByText(/参与者（/)).not.toBeInTheDocument();
  });

  it("renders the full participants list with each display name, linking to /users/:id, when the query returns a non-empty list", () => {
    useActivityDetailQuery.mockReturnValue({
      data: sampleActivityDetail,
      isPending: false,
      isError: false
    });
    useActivityParticipantsQuery.mockReturnValue({
      data: [
        { userId: "user-1", displayName: "Alice", avatarUrl: null },
        { userId: "user-2", displayName: "Bob", avatarUrl: null }
      ]
    });

    renderWithProviders(<ActivityDetailPage />, {
      initialEntries: ["/activities/act-1"],
      route: "/activities/:id"
    });

    expect(screen.getByText("参与者（2）")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Bob" })).toHaveAttribute("href", "/users/user-2");
  });

  it("renders the '参加活动' button alongside the real content", () => {
    useAuthStore.getState().setSession({ user: { id: "user-2" } } as never);
    useActivityDetailQuery.mockReturnValue({
      data: sampleActivityDetail,
      isPending: false,
      isError: false
    });

    renderWithProviders(<ActivityDetailPage />, {
      initialEntries: ["/activities/act-1"],
      route: "/activities/:id"
    });

    expect(screen.getByRole("button", { name: "我要报名" })).toBeInTheDocument();
  });

  it("shows '申请加入' instead of '我要报名' when the activity's requiresApproval is true (P2), wiring ActivityDetail.requiresApproval through to the button", () => {
    useAuthStore.getState().setSession({ user: { id: "user-2" } } as never);
    useActivityDetailQuery.mockReturnValue({
      data: { ...sampleActivityDetail, requiresApproval: true },
      isPending: false,
      isError: false
    });

    renderWithProviders(<ActivityDetailPage />, {
      initialEntries: ["/activities/act-1"],
      route: "/activities/:id"
    });

    expect(screen.getByRole("button", { name: "申请加入" })).toBeInTheDocument();
  });

  it("renders a '查看发起人' button next to '参加活动', linking to /users/:organizerId", () => {
    useAuthStore.getState().setSession({ user: { id: "user-2" } } as never);
    useActivityDetailQuery.mockReturnValue({
      data: sampleActivityDetail,
      isPending: false,
      isError: false
    });

    renderWithProviders(<ActivityDetailPage />, {
      initialEntries: ["/activities/act-1"],
      route: "/activities/:id"
    });

    expect(screen.getByRole("link", { name: "查看发起人" })).toHaveAttribute(
      "href",
      "/users/user-1"
    );
  });

  it("renders an organizer card (avatar + nickname + '发起人' label) linking to the same /users/:organizerId destination", () => {
    useActivityDetailQuery.mockReturnValue({
      data: sampleActivityDetail,
      isPending: false,
      isError: false
    });

    renderWithProviders(<ActivityDetailPage />, {
      initialEntries: ["/activities/act-1"],
      route: "/activities/:id"
    });

    // 发起人卡片的可访问名称包含"Alice"和"发起人"两段文字（头像+昵称+标签
    // 都在同一个 <Link> 里），跟页面上方"发起人：Alice"那个只有"Alice"
    // 作为可访问名称的文字链接是两个不同的元素——用这个更完整的名称匹配，
        // 避免跟上面那个断言重复命中同一个元素。
    const organizerCardLink = screen.getByRole("link", { name: "Alice 发起人" });
    expect(organizerCardLink).toHaveAttribute("href", "/users/user-1");
  });

  it("renders the collect/share/report action row (♡ 收藏, ↗ 分享, ⋯ 举报)", () => {
    useActivityDetailQuery.mockReturnValue({
      data: sampleActivityDetail,
      isPending: false,
      isError: false
    });

    renderWithProviders(<ActivityDetailPage />, {
      initialEntries: ["/activities/act-1"],
      route: "/activities/:id"
    });

    expect(screen.getByRole("button", { name: /收藏/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /分享/ })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /举报/ })).toHaveAttribute(
      "href",
      "/activities/act-1/report"
    );
  });

  it("calls Share.share with the activity title, a time/location summary, and the hardcoded production domain when 分享 is clicked", async () => {
    useActivityDetailQuery.mockReturnValue({
      data: sampleActivityDetail,
      isPending: false,
      isError: false
    });

    renderWithProviders(<ActivityDetailPage />, {
      initialEntries: ["/activities/act-1"],
      route: "/activities/:id"
    });

    fireEvent.click(screen.getByRole("button", { name: /分享/ }));

    await waitFor(() => {
      expect(shareMock).toHaveBeenCalledWith(
        expect.objectContaining({
          title: "周末吃火锅",
          url: "https://www.saminest.com/activities/act-1",
          dialogTitle: "分享"
        })
      );
    });
  });

  it("renders the ActivityFavoriteButton (♡ 收藏)", () => {
    useAuthStore.getState().setSession({ user: { id: "user-2" } } as never);
    useActivityDetailQuery.mockReturnValue({
      data: sampleActivityDetail,
      isPending: false,
      isError: false
    });
    useActivityFavoriteIdsQuery.mockReturnValue({ data: ["act-1"] });

    const { container } = renderWithProviders(<ActivityDetailPage />, {
      initialEntries: ["/activities/act-1"],
      route: "/activities/:id"
    });

    const heartIcon = container.querySelector("svg.lucide-heart");
    expect(heartIcon).toBeInTheDocument();
    expect(heartIcon).toHaveClass("fill-current", "text-danger");
  });

  // 这是这次改版最重要的一致性测试：头像堆叠的"空位"点击必须触发跟
  // "参加活动"按钮完全同一个 mutation 调用，不能是另一套独立实现。这里
  // 用同一个 activity（capacity 4，1 个参与者，还有 2 个空位）验证点击
  // 任意一个空位，调的是 useToggleActivityParticipationMutation 返回的
  // 同一个 mutate 函数，参数也完全一致——如果详情页内部各自维护了两份
  // 状态，这个测试会因为空位点击没有调用 mutateParticipationMock，或者
  // 调用参数跟按钮点击时不一致而失败。
  it("wires the avatar stack's empty-slot click through the exact same mutation call as the '参加活动' button", () => {
    useAuthStore.getState().setSession({ user: { id: "user-2" } } as never);
    useActivityDetailQuery.mockReturnValue({
      data: sampleActivityDetail,
      isPending: false,
      isError: false
    });
    useActivityParticipantsQuery.mockReturnValue({
      data: [{ userId: "user-3", displayName: "Carol", avatarUrl: null }]
    });

    renderWithProviders(<ActivityDetailPage />, {
      initialEntries: ["/activities/act-1"],
      route: "/activities/:id"
    });

    // 直接断言这个 mutation hook 在这次渲染里只被调用了一次——如果详情页
    // 不小心多渲染了一份独立的报名状态（比如同时嵌了一个
    // <ActivityParticipationButton> 又给头像堆叠另起一套逻辑），这里会
    // 变成 2 次，能在 mock 层面直接抓到"两套实例"这类回归，不只是依赖
    // "点击结果恰好一样"这种可能被同一个 mock 返回值掩盖的间接验证。
    expect(useToggleActivityParticipationMutation).toHaveBeenCalledTimes(1);
    expect(useActivityParticipationQuery).toHaveBeenCalledTimes(1);

    const emptySlotButtons = screen.getAllByRole("button", { name: "报名加入活动" });
    expect(emptySlotButtons.length).toBeGreaterThan(0);
    fireEvent.click(emptySlotButtons[0]);

    const expectedMutationInput = {
      activityId: "act-1",
      userId: "user-2",
      isCurrentlyJoined: false,
      organizerId: "user-1",
      activityTitle: "周末吃火锅",
      requiresApproval: false
    };
    expect(mutateParticipationMock).toHaveBeenCalledWith(
      expectedMutationInput,
      expect.objectContaining({ onError: expect.any(Function) })
    );

    mutateParticipationMock.mockClear();
    fireEvent.click(screen.getByRole("button", { name: "我要报名" }));

    expect(mutateParticipationMock).toHaveBeenCalledWith(
      expectedMutationInput,
      expect.objectContaining({ onError: expect.any(Function) })
    );
  });

  it("does not render a clickable empty slot for a user who has already joined (isApproved) — their own avatar already occupies a slot", () => {
    useAuthStore.getState().setSession({ user: { id: "user-2" } } as never);
    useActivityDetailQuery.mockReturnValue({
      data: sampleActivityDetail,
      isPending: false,
      isError: false
    });
    useActivityParticipationQuery.mockReturnValue({ data: "approved", isPending: false });
    useActivityParticipantsQuery.mockReturnValue({
      data: [{ userId: "user-2", displayName: "Bob", avatarUrl: null }]
    });

    renderWithProviders(<ActivityDetailPage />, {
      initialEntries: ["/activities/act-1"],
      route: "/activities/:id"
    });

    for (const button of screen.getAllByRole("button", { name: "报名加入活动" })) {
      expect(button).toBeDisabled();
    }
  });
});
