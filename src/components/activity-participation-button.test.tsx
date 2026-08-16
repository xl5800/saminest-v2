import { act, cleanup, fireEvent, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { useActivityParticipationQuery, useToggleActivityParticipationMutation, mutateMock } =
  vi.hoisted(() => ({
    useActivityParticipationQuery: vi.fn(),
    useToggleActivityParticipationMutation: vi.fn(),
    mutateMock: vi.fn()
  }));

vi.mock("../features/activities/use-activity-participation-query", () => ({
  useActivityParticipationQuery
}));
vi.mock("../features/activities/use-toggle-activity-participation-mutation", () => ({
  useToggleActivityParticipationMutation
}));

import { useAuthStore } from "../store/auth-store";
import { renderWithProviders } from "../test/render-with-providers";
import { AppError } from "../utils/app-error";
import { ActivityParticipationButton } from "./activity-participation-button";

const initialAuthState = useAuthStore.getState();

const defaultProps = {
  activityId: "act-1",
  activityStatus: "open",
  organizerId: "organizer-1",
  activityTitle: "周末吃火锅",
  requiresApproval: false
};

describe("ActivityParticipationButton", () => {
  afterEach(() => {
    cleanup();
  });

  beforeEach(() => {
    useAuthStore.setState(initialAuthState, true);
    mutateMock.mockReset();
    useActivityParticipationQuery.mockReset();
    useToggleActivityParticipationMutation.mockReset();

    useActivityParticipationQuery.mockReturnValue({ data: null, isPending: false });
    useToggleActivityParticipationMutation.mockReturnValue({
      mutate: mutateMock,
      isPending: false
    });
  });

  it("shows a login link instead of a button when logged out", () => {
    renderWithProviders(<ActivityParticipationButton {...defaultProps} />);

    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "登录" })).toHaveAttribute("href", "/login");
  });

  it("calls the mutation to join (isCurrentlyJoined: false) when logged in, not participating, and the activity is open", () => {
    useAuthStore.getState().setSession({ user: { id: "user-1" } } as never);
    useActivityParticipationQuery.mockReturnValue({ data: null, isPending: false });

    renderWithProviders(<ActivityParticipationButton {...defaultProps} />);

    const button = screen.getByRole("button", { name: "我要报名" });
    fireEvent.click(button);

    expect(mutateMock).toHaveBeenCalledWith(
      {
        activityId: "act-1",
        userId: "user-1",
        isCurrentlyJoined: false,
        organizerId: "organizer-1",
        activityTitle: "周末吃火锅",
        requiresApproval: false
      },
      expect.objectContaining({ onError: expect.any(Function) })
    );
  });

  it("shows '申请加入' instead of '我要报名' when the activity requires approval and the user has not applied", () => {
    useAuthStore.getState().setSession({ user: { id: "user-1" } } as never);
    useActivityParticipationQuery.mockReturnValue({ data: null, isPending: false });

    renderWithProviders(
      <ActivityParticipationButton {...defaultProps} requiresApproval={true} />
    );

    const button = screen.getByRole("button", { name: "申请加入" });
    fireEvent.click(button);

    expect(mutateMock).toHaveBeenCalledWith(
      expect.objectContaining({ isCurrentlyJoined: false, requiresApproval: true }),
      expect.objectContaining({ onError: expect.any(Function) })
    );
  });

  it("shows a disabled '申请中，等待发起人同意' button and does not call the mutation when participationStatus is 'pending'", () => {
    useAuthStore.getState().setSession({ user: { id: "user-1" } } as never);
    useActivityParticipationQuery.mockReturnValue({ data: "pending", isPending: false });

    renderWithProviders(
      <ActivityParticipationButton {...defaultProps} requiresApproval={true} />
    );

    const button = screen.getByRole("button", { name: "申请中，等待发起人同意" });
    expect(button).toBeDisabled();

    fireEvent.click(button);
    expect(mutateMock).not.toHaveBeenCalled();
  });

  it("shows plain text '申请已被拒绝' with no button at all when participationStatus is 'rejected'", () => {
    useAuthStore.getState().setSession({ user: { id: "user-1" } } as never);
    useActivityParticipationQuery.mockReturnValue({ data: "rejected", isPending: false });

    renderWithProviders(
      <ActivityParticipationButton {...defaultProps} requiresApproval={true} />
    );

    expect(screen.getByText("申请已被拒绝")).toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("calls the mutation to leave (isCurrentlyJoined: true) when participationStatus is 'approved'", () => {
    useAuthStore.getState().setSession({ user: { id: "user-1" } } as never);
    useActivityParticipationQuery.mockReturnValue({ data: "approved", isPending: false });

    renderWithProviders(<ActivityParticipationButton {...defaultProps} />);

    const button = screen.getByRole("button", { name: "退出活动" });
    fireEvent.click(button);

    expect(mutateMock).toHaveBeenCalledWith(
      {
        activityId: "act-1",
        userId: "user-1",
        isCurrentlyJoined: true,
        organizerId: "organizer-1",
        activityTitle: "周末吃火锅",
        requiresApproval: false
      },
      expect.objectContaining({ onError: expect.any(Function) })
    );
  });

  it("styles '退出活动' as a secondary (outlined) button, distinct from the primary '我要报名' button", () => {
    useAuthStore.getState().setSession({ user: { id: "user-1" } } as never);
    useActivityParticipationQuery.mockReturnValue({ data: "approved", isPending: false });

    renderWithProviders(<ActivityParticipationButton {...defaultProps} />);

    const button = screen.getByRole("button", { name: "退出活动" });
    expect(button.className).toContain("border-border");
    expect(button.className).not.toContain("bg-primary");
  });

  it("keeps '我要报名' as the solid primary button", () => {
    useAuthStore.getState().setSession({ user: { id: "user-1" } } as never);
    useActivityParticipationQuery.mockReturnValue({ data: null, isPending: false });

    renderWithProviders(<ActivityParticipationButton {...defaultProps} />);

    const button = screen.getByRole("button", { name: "我要报名" });
    expect(button.className).toContain("bg-primary");
  });

  it("disables the join button and shows '报名已满' when the activity is not open and the user has not participated", () => {
    useAuthStore.getState().setSession({ user: { id: "user-1" } } as never);
    useActivityParticipationQuery.mockReturnValue({ data: null, isPending: false });

    renderWithProviders(
      <ActivityParticipationButton {...defaultProps} activityStatus="full" />
    );

    const button = screen.getByRole("button", { name: "报名已满" });
    expect(button).toBeDisabled();

    fireEvent.click(button);
    expect(mutateMock).not.toHaveBeenCalled();
  });

  it("still allows leaving when the activity is not open but the user is approved", () => {
    useAuthStore.getState().setSession({ user: { id: "user-1" } } as never);
    useActivityParticipationQuery.mockReturnValue({ data: "approved", isPending: false });

    renderWithProviders(
      <ActivityParticipationButton {...defaultProps} activityStatus="full" />
    );

    const button = screen.getByRole("button", { name: "退出活动" });
    expect(button).not.toBeDisabled();
  });

  it("disables the button and shows '处理中…' while the mutation is pending", () => {
    useAuthStore.getState().setSession({ user: { id: "user-1" } } as never);
    useActivityParticipationQuery.mockReturnValue({ data: null, isPending: false });
    useToggleActivityParticipationMutation.mockReturnValue({
      mutate: mutateMock,
      isPending: true
    });

    renderWithProviders(<ActivityParticipationButton {...defaultProps} />);

    const button = screen.getByRole("button", { name: "处理中…" });
    expect(button).toBeDisabled();

    fireEvent.click(button);
    expect(mutateMock).not.toHaveBeenCalled();
  });

  it("shows the error message for a known-safe error code (ACTIVITY_JOIN_FORBIDDEN)", () => {
    useAuthStore.getState().setSession({ user: { id: "user-1" } } as never);
    useActivityParticipationQuery.mockReturnValue({ data: null, isPending: false });

    renderWithProviders(<ActivityParticipationButton {...defaultProps} />);

    fireEvent.click(screen.getByRole("button", { name: "我要报名" }));

    const { onError } = mutateMock.mock.calls[0][1];
    act(() => {
      onError(
        new AppError("报名失败，这个活动可能已满员或已结束，请刷新后重试。", "ACTIVITY_JOIN_FORBIDDEN")
      );
    });

    expect(screen.getByRole("alert")).toHaveTextContent(
      "报名失败，这个活动可能已满员或已结束，请刷新后重试。"
    );
  });

  it("shows the error message for the known-safe ACTIVITY_JOIN_REJECTED error code", () => {
    useAuthStore.getState().setSession({ user: { id: "user-1" } } as never);
    useActivityParticipationQuery.mockReturnValue({ data: null, isPending: false });

    renderWithProviders(<ActivityParticipationButton {...defaultProps} />);

    fireEvent.click(screen.getByRole("button", { name: "我要报名" }));

    const { onError } = mutateMock.mock.calls[0][1];
    act(() => {
      onError(new AppError("你的申请已被发起人拒绝，无法重新加入。", "ACTIVITY_JOIN_REJECTED"));
    });

    expect(screen.getByRole("alert")).toHaveTextContent(
      "你的申请已被发起人拒绝，无法重新加入。"
    );
  });

  it("falls back to the generic error message for an unrecognized error code (does not leak raw DB error text)", () => {
    useAuthStore.getState().setSession({ user: { id: "user-1" } } as never);
    useActivityParticipationQuery.mockReturnValue({ data: null, isPending: false });

    renderWithProviders(<ActivityParticipationButton {...defaultProps} />);

    fireEvent.click(screen.getByRole("button", { name: "我要报名" }));

    const { onError } = mutateMock.mock.calls[0][1];
    act(() => {
      onError(new AppError("raw supabase failure detail", "ACTIVITY_JOIN_FAILED"));
    });

    expect(screen.getByRole("alert")).toHaveTextContent("操作失败，请稍后重试。");
  });
});
