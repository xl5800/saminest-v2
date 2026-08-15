import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * 这个 hook 本来跟这个仓库其它薄封装 hook（use-activities-query.ts 等）一样
 * 不该单独有测试文件——那些 hook 只是 useQuery/useMutation 的直接透传，
 * 一直靠消费它们的组件测试间接覆盖（组件测试里直接 mock 掉 hook 本身，
 * 见 activity-participation-button.test.tsx）。
 *
 * 这次单独开一个文件是刻意的例外：这一批任务给这个 hook 加了一段真正的
 * 业务逻辑（报名/退出成功后再通知发起人，含"自己操作自己的活动不发通知"
 * 的防御分支、"通知失败不影响报名/退出本身成败"的 try/catch），不再是
 * 纯粹的"调 A 或调 B"透传。如果继续只在 activity-participation-button.test.tsx
 * 里 mock 掉整个 hook，这段新逻辑会完全没有任何测试覆盖到——这里用
 * renderHook 直接测真实的 hook 实现（只 mock 它依赖的四个 repository
 * 函数），能测到 activity-participation-button.test.tsx 那种"只 mock 掉
 * hook 本身"的写法测不到的东西。
 */

const { joinActivity, leaveActivity, createActivityConversation, sendMessage, getMyProfile } =
  vi.hoisted(() => ({
    joinActivity: vi.fn(),
    leaveActivity: vi.fn(),
    createActivityConversation: vi.fn(),
    sendMessage: vi.fn(),
    getMyProfile: vi.fn()
  }));

vi.mock("../../repositories/activities-repository", () => ({
  joinActivity,
  leaveActivity
}));
vi.mock("../../repositories/conversations-repository", () => ({
  createActivityConversation
}));
vi.mock("../../repositories/messages-repository", () => ({
  sendMessage
}));
vi.mock("../../repositories/profiles-repository", () => ({
  getMyProfile
}));

import { useToggleActivityParticipationMutation } from "./use-toggle-activity-participation-mutation";

function createWrapper(queryClient: QueryClient) {
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}

const baseInput = {
  activityId: "act-1",
  userId: "user-1",
  organizerId: "organizer-1",
  activityTitle: "周末吃火锅"
};

describe("useToggleActivityParticipationMutation", () => {
  beforeEach(() => {
    joinActivity.mockReset();
    leaveActivity.mockReset();
    createActivityConversation.mockReset();
    sendMessage.mockReset();
    getMyProfile.mockReset();

    getMyProfile.mockResolvedValue({ displayName: "Alice", avatarUrl: null });
    createActivityConversation.mockResolvedValue({ conversationId: "conv-1" });
    sendMessage.mockResolvedValue({ id: "msg-1" });
  });

  it("calls joinActivity (not leaveActivity) when isCurrentlyJoined is false", async () => {
    joinActivity.mockResolvedValue(undefined);
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const { result } = renderHook(() => useToggleActivityParticipationMutation(), {
      wrapper: createWrapper(queryClient)
    });

    act(() => {
      result.current.mutate({ ...baseInput, isCurrentlyJoined: false });
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(joinActivity).toHaveBeenCalledWith("act-1", "user-1");
    expect(leaveActivity).not.toHaveBeenCalled();
  });

  it("calls leaveActivity (not joinActivity) when isCurrentlyJoined is true", async () => {
    leaveActivity.mockResolvedValue(undefined);
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const { result } = renderHook(() => useToggleActivityParticipationMutation(), {
      wrapper: createWrapper(queryClient)
    });

    act(() => {
      result.current.mutate({ ...baseInput, isCurrentlyJoined: true });
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(leaveActivity).toHaveBeenCalledWith("act-1", "user-1");
    expect(joinActivity).not.toHaveBeenCalled();
  });

  it("notifies the organizer with a '报名了' message after a successful join", async () => {
    joinActivity.mockResolvedValue(undefined);
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const { result } = renderHook(() => useToggleActivityParticipationMutation(), {
      wrapper: createWrapper(queryClient)
    });

    act(() => {
      result.current.mutate({ ...baseInput, isCurrentlyJoined: false });
    });

    await waitFor(() => expect(sendMessage).toHaveBeenCalled());
    expect(createActivityConversation).toHaveBeenCalledWith("act-1");
    expect(sendMessage).toHaveBeenCalledWith({
      conversationId: "conv-1",
      senderId: "user-1",
      body: "Alice 报名了你的活动《周末吃火锅》"
    });
  });

  it("notifies the organizer with a '退出了' message after a successful leave", async () => {
    leaveActivity.mockResolvedValue(undefined);
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const { result } = renderHook(() => useToggleActivityParticipationMutation(), {
      wrapper: createWrapper(queryClient)
    });

    act(() => {
      result.current.mutate({ ...baseInput, isCurrentlyJoined: true });
    });

    await waitFor(() => expect(sendMessage).toHaveBeenCalled());
    expect(sendMessage).toHaveBeenCalledWith({
      conversationId: "conv-1",
      senderId: "user-1",
      body: "Alice 退出了你的活动《周末吃火锅》"
    });
  });

  it("falls back to a generic actor label when the actor's own profile has no display name available", async () => {
    joinActivity.mockResolvedValue(undefined);
    getMyProfile.mockResolvedValue(null);
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const { result } = renderHook(() => useToggleActivityParticipationMutation(), {
      wrapper: createWrapper(queryClient)
    });

    act(() => {
      result.current.mutate({ ...baseInput, isCurrentlyJoined: false });
    });

    await waitFor(() => expect(sendMessage).toHaveBeenCalled());
    expect(sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({ body: "有人 报名了你的活动《周末吃火锅》" })
    );
  });

  it("does not notify anyone when the organizer is the actor themself (defensive: self-join/leave)", async () => {
    leaveActivity.mockResolvedValue(undefined);
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const { result } = renderHook(() => useToggleActivityParticipationMutation(), {
      wrapper: createWrapper(queryClient)
    });

    act(() => {
      result.current.mutate({
        ...baseInput,
        isCurrentlyJoined: true,
        organizerId: "user-1",
        userId: "user-1"
      });
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(createActivityConversation).not.toHaveBeenCalled();
    expect(sendMessage).not.toHaveBeenCalled();
    expect(getMyProfile).not.toHaveBeenCalled();
  });

  it("still resolves successfully — the join/leave already succeeded — even when the notification step fails, and logs the failure", async () => {
    joinActivity.mockResolvedValue(undefined);
    createActivityConversation.mockRejectedValue(new Error("conversation create failed"));
    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const { result } = renderHook(() => useToggleActivityParticipationMutation(), {
      wrapper: createWrapper(queryClient)
    });

    act(() => {
      result.current.mutate({ ...baseInput, isCurrentlyJoined: false });
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      "活动报名/退出通知发送失败：",
      expect.any(Error)
    );

    consoleErrorSpy.mockRestore();
  });

  it("does not call joinActivity/leaveActivity again when only the notification step fails (the core operation ran exactly once)", async () => {
    leaveActivity.mockResolvedValue(undefined);
    sendMessage.mockRejectedValue(new Error("send failed"));
    vi.spyOn(console, "error").mockImplementation(() => {});
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const { result } = renderHook(() => useToggleActivityParticipationMutation(), {
      wrapper: createWrapper(queryClient)
    });

    act(() => {
      result.current.mutate({ ...baseInput, isCurrentlyJoined: true });
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(leaveActivity).toHaveBeenCalledTimes(1);
  });

  it("invalidates activity-detail/activity-participation/activities/activity-participants queries on success", async () => {
    joinActivity.mockResolvedValue(undefined);
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const invalidateQueriesSpy = vi.spyOn(queryClient, "invalidateQueries");
    const { result } = renderHook(() => useToggleActivityParticipationMutation(), {
      wrapper: createWrapper(queryClient)
    });

    act(() => {
      result.current.mutate({ ...baseInput, isCurrentlyJoined: false });
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(invalidateQueriesSpy).toHaveBeenCalledWith({ queryKey: ["activity-detail", "act-1"] });
    expect(invalidateQueriesSpy).toHaveBeenCalledWith({
      queryKey: ["activity-participation", "act-1", "user-1"]
    });
    expect(invalidateQueriesSpy).toHaveBeenCalledWith({ queryKey: ["activities"] });
    expect(invalidateQueriesSpy).toHaveBeenCalledWith({
      queryKey: ["activity-participants", "act-1"]
    });
  });
});
