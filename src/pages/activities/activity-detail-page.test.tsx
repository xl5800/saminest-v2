import { cleanup, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const {
  useActivityDetailQuery,
  useActivityParticipantsQuery,
  useActivityParticipationQuery,
  useToggleActivityParticipationMutation
} = vi.hoisted(() => ({
  useActivityDetailQuery: vi.fn(),
  useActivityParticipantsQuery: vi.fn(),
  useActivityParticipationQuery: vi.fn(),
  useToggleActivityParticipationMutation: vi.fn()
}));

vi.mock("../../features/activities/use-activity-detail-query", () => ({
  useActivityDetailQuery
}));
vi.mock("../../features/activities/use-activity-participants-query", () => ({
  useActivityParticipantsQuery
}));
// ActivityDetailPage 渲染 ActivityParticipationButton，那个组件自己有一套
// hook（跟 PostDetailPage mock FavoriteButton 依赖的 hook 是同一个模式），
// 这里也 mock 掉，让这个文件只关心 ActivityDetailPage 自己的渲染行为。
vi.mock("../../features/activities/use-activity-participation-query", () => ({
  useActivityParticipationQuery
}));
vi.mock("../../features/activities/use-toggle-activity-participation-mutation", () => ({
  useToggleActivityParticipationMutation
}));

import { useAuthStore } from "../../store/auth-store";
import { renderWithProviders } from "../../test/render-with-providers";
import { ActivityDetailPage } from "./activity-detail-page";

const initialAuthState = useAuthStore.getState();

const sampleActivityDetail = {
  id: "act-1",
  organizerId: "user-1",
  organizerDisplayName: "Alice",
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

    useActivityParticipantsQuery.mockReturnValue({ data: [] });
    useActivityParticipationQuery.mockReturnValue({ data: null, isPending: false });
    useToggleActivityParticipationMutation.mockReturnValue({ mutate: vi.fn(), isPending: false });
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

  it("renders the full activity content — emoji+title, channel, tag, organizer, time, location, description, participant summary and contact info", () => {
    useActivityDetailQuery.mockReturnValue({
      data: sampleActivityDetail,
      isPending: false,
      isError: false
    });

    renderWithProviders(<ActivityDetailPage />, {
      initialEntries: ["/activities/act-1"],
      route: "/activities/:id"
    });

    expect(
      screen.getByRole("heading", { name: "🍜 周末吃火锅" })
    ).toBeInTheDocument();
    expect(screen.getByText("吃饭搭子")).toBeInTheDocument();
    expect(screen.getByText("火锅")).toBeInTheDocument();
    expect(screen.getByText(/发起人：/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Alice" })).toHaveAttribute(
      "href",
      "/users/user-1"
    );
    expect(screen.getByText("海底捞")).toBeInTheDocument();
    expect(screen.getByText("Rockville")).toBeInTheDocument();
    expect(screen.getByText("一起吃火锅，AA制")).toBeInTheDocument();
    expect(screen.getByText("还差 2 人（2/4）")).toBeInTheDocument();
    expect(screen.getByText("abc123")).toBeInTheDocument();
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

  it("does not render a participants section when the query resolves to an empty list (not visible to this viewer, or nobody joined)", () => {
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

    expect(screen.queryByText(/参与者/)).not.toBeInTheDocument();
  });

  it("renders the participants section with each display name, linking to /users/:id, when the query returns a non-empty list", () => {
    useActivityDetailQuery.mockReturnValue({
      data: sampleActivityDetail,
      isPending: false,
      isError: false
    });
    useActivityParticipantsQuery.mockReturnValue({
      data: [
        { userId: "user-1", displayName: "Alice" },
        { userId: "user-2", displayName: "Bob" }
      ]
    });

    renderWithProviders(<ActivityDetailPage />, {
      initialEntries: ["/activities/act-1"],
      route: "/activities/:id"
    });

    expect(screen.getByText("参与者（2）")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Bob" })).toHaveAttribute("href", "/users/user-2");
    // 这个夹具里 user-1/Alice 同时是发起人和参与者之一，页面上会渲染出
    // 两个文字都是"Alice"的链接（发起人那一处 + 参与者 pill 那一处）——
    // 用 getAllByRole 而不是 getByText，避免命中多个元素报错，两处都应该
    // 指向同一个 /users/user-1。
    const aliceLinks = screen.getAllByRole("link", { name: "Alice" });
    expect(aliceLinks).toHaveLength(2);
    for (const link of aliceLinks) {
      expect(link).toHaveAttribute("href", "/users/user-1");
    }
  });

  it("renders the participation button alongside the real content", () => {
    useAuthStore.getState().setSession({ user: { id: "user-1" } } as never);
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
    useAuthStore.getState().setSession({ user: { id: "user-1" } } as never);
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

  it("renders a 举报 link to /activities/:id/report (P0 activity reporting)", () => {
    useActivityDetailQuery.mockReturnValue({
      data: sampleActivityDetail,
      isPending: false,
      isError: false
    });

    renderWithProviders(<ActivityDetailPage />, {
      initialEntries: ["/activities/act-1"],
      route: "/activities/:id"
    });

    expect(screen.getByRole("link", { name: "举报" })).toHaveAttribute(
      "href",
      "/activities/act-1/report"
    );
  });
});
