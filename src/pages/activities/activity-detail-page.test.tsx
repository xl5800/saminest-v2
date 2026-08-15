import { cleanup, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { useActivityDetailQuery, useActivityParticipationQuery, useToggleActivityParticipationMutation } =
  vi.hoisted(() => ({
    useActivityDetailQuery: vi.fn(),
    useActivityParticipationQuery: vi.fn(),
    useToggleActivityParticipationMutation: vi.fn()
  }));

vi.mock("../../features/activities/use-activity-detail-query", () => ({
  useActivityDetailQuery
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
  status: "open"
};

describe("ActivityDetailPage", () => {
  afterEach(() => {
    cleanup();
  });

  beforeEach(() => {
    useAuthStore.setState(initialAuthState, true);
    useActivityDetailQuery.mockReset();
    useActivityParticipationQuery.mockReset();
    useToggleActivityParticipationMutation.mockReset();

    useActivityParticipationQuery.mockReturnValue({ data: false, isPending: false });
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
    expect(screen.getByText("发起人：Alice")).toBeInTheDocument();
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
});
