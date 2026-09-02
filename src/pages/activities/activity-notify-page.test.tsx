import { cleanup, fireEvent, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { useActivityDetailQuery, useNotifyActivityParticipantsMutation, mutateAsyncMock } =
  vi.hoisted(() => ({
    useActivityDetailQuery: vi.fn(),
    useNotifyActivityParticipantsMutation: vi.fn(),
    mutateAsyncMock: vi.fn()
  }));

vi.mock("../../features/activities/use-activity-detail-query", () => ({
  useActivityDetailQuery
}));
vi.mock("../../features/activities/use-notify-activity-participants-mutation", () => ({
  useNotifyActivityParticipantsMutation
}));

import { useAuthStore } from "../../store/auth-store";
import { renderWithProviders } from "../../test/render-with-providers";
import { ActivityNotifyPage } from "./activity-notify-page";

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

function renderPage() {
  return renderWithProviders(<ActivityNotifyPage />, {
    initialEntries: ["/activities/act-1/notify"],
    route: "/activities/:id/notify"
  });
}

describe("ActivityNotifyPage", () => {
  afterEach(() => {
    cleanup();
  });

  beforeEach(() => {
    useAuthStore.setState(initialAuthState, true);
    useActivityDetailQuery.mockReset();
    useNotifyActivityParticipantsMutation.mockReset();
    mutateAsyncMock.mockReset();

    useNotifyActivityParticipantsMutation.mockReturnValue({
      mutateAsync: mutateAsyncMock,
      isPending: false
    });
  });

  it("shows a loading message while the activity query is pending", () => {
    useActivityDetailQuery.mockReturnValue({ data: undefined, isPending: true, isError: false });

    renderPage();

    expect(screen.getByRole("status")).toHaveTextContent("加载中…");
  });

  it("shows a plain error message on a genuine fetch failure", () => {
    useActivityDetailQuery.mockReturnValue({ data: undefined, isPending: false, isError: true });

    renderPage();

    expect(screen.getByRole("alert")).toHaveTextContent("活动加载失败，请稍后重试。");
  });

  it("shows a not-found message when the activity query resolves to null", () => {
    useActivityDetailQuery.mockReturnValue({ data: null, isPending: false, isError: false });

    renderPage();

    expect(screen.getByRole("heading", { name: "活动未找到" })).toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent("活动不存在或已被取消。");
  });

  // 页面进入时先判断当前登录用户是不是这个活动的发起人，不是则只展示一句
  // 说明文案、不渲染表单（参照 report-user-page.tsx 对"不能举报自己"的
  // 处理方式）。
  it("shows an explanatory message and no form when the logged-in user is not the organizer", () => {
    useAuthStore.getState().setSession({ user: { id: "user-2" } } as never);
    useActivityDetailQuery.mockReturnValue({
      data: sampleActivityDetail,
      isPending: false,
      isError: false
    });

    renderPage();

    expect(screen.getByRole("alert")).toHaveTextContent("只有活动发起人才能通知参与者。");
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "发送通知" })).not.toBeInTheDocument();
  });

  it("shows the explanatory message (not the form) when there is no session at all", () => {
    useActivityDetailQuery.mockReturnValue({
      data: sampleActivityDetail,
      isPending: false,
      isError: false
    });

    renderPage();

    expect(screen.getByRole("alert")).toHaveTextContent("只有活动发起人才能通知参与者。");
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
  });

  it("shows the activity title at the top and renders the form for the organizer", () => {
    useAuthStore.getState().setSession({ user: { id: "user-1" } } as never);
    useActivityDetailQuery.mockReturnValue({
      data: sampleActivityDetail,
      isPending: false,
      isError: false
    });

    renderPage();

    expect(screen.getByRole("heading", { name: "周末吃火锅" })).toBeInTheDocument();
    expect(screen.getByRole("textbox")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "发送通知" })).toBeInTheDocument();
  });

  it("blocks submission and shows a validation message when the body is empty", () => {
    useAuthStore.getState().setSession({ user: { id: "user-1" } } as never);
    useActivityDetailQuery.mockReturnValue({
      data: sampleActivityDetail,
      isPending: false,
      isError: false
    });

    renderPage();
    fireEvent.click(screen.getByRole("button", { name: "发送通知" }));

    expect(screen.getByRole("alert")).toHaveTextContent("请输入通知内容。");
    expect(mutateAsyncMock).not.toHaveBeenCalled();
  });

  it("submits the trimmed body via the mutation with the activity id from the route, and shows '通知已发送' without navigating away", async () => {
    useAuthStore.getState().setSession({ user: { id: "user-1" } } as never);
    useActivityDetailQuery.mockReturnValue({
      data: sampleActivityDetail,
      isPending: false,
      isError: false
    });
    mutateAsyncMock.mockResolvedValue(undefined);

    renderPage();

    fireEvent.change(screen.getByRole("textbox"), {
      target: { value: "  下周六改到下午两点  " }
    });
    fireEvent.click(screen.getByRole("button", { name: "发送通知" }));

    expect(await screen.findByRole("status")).toHaveTextContent("通知已发送");
    expect(mutateAsyncMock).toHaveBeenCalledWith({
      activityId: "act-1",
      body: "下周六改到下午两点"
    });
    // 停留在这个页面，不渲染表单了（成功状态替换了表单，不是自动跳转）。
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
  });

  it("shows a generic error message and keeps the form when the mutation fails", async () => {
    useAuthStore.getState().setSession({ user: { id: "user-1" } } as never);
    useActivityDetailQuery.mockReturnValue({
      data: sampleActivityDetail,
      isPending: false,
      isError: false
    });
    mutateAsyncMock.mockRejectedValue(new Error("network down"));

    renderPage();

    fireEvent.change(screen.getByRole("textbox"), { target: { value: "下周六改到下午两点" } });
    fireEvent.click(screen.getByRole("button", { name: "发送通知" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("通知发送失败，请稍后重试。");
    expect(screen.getByRole("textbox")).toBeInTheDocument();
  });
});
