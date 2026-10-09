import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * 阶段九：社区浏览页新增的两个查询 hook。repository 函数各自已经有单测，
 * 这里只测 hook 自己的行为——什么时候不该发请求（enabled）、传给 repository
 * 的参数对不对（"今日"的起点是不是本地时区当天 0 点）。
 */

const { isCommunityMember, countCommunityPostsSince } = vi.hoisted(() => ({
  isCommunityMember: vi.fn(),
  countCommunityPostsSince: vi.fn()
}));

vi.mock("../../repositories/community-repository", () => ({
  isCommunityMember,
  countCommunityPostsSince
}));

import { useCommunityMembershipQuery } from "./use-community-membership-query";
import { useCommunityPostsTodayCountQuery } from "./use-community-posts-today-count-query";

function setup() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  return { wrapper };
}

describe("useCommunityMembershipQuery", () => {
  beforeEach(() => {
    isCommunityMember.mockReset();
  });

  it("asks the repository with the community and user ids and exposes the boolean result", async () => {
    isCommunityMember.mockResolvedValue(true);
    const { wrapper } = setup();

    const { result } = renderHook(() => useCommunityMembershipQuery("c-1", "user-1"), { wrapper });

    await waitFor(() => expect(result.current.data).toBe(true));
    expect(isCommunityMember).toHaveBeenCalledWith("c-1", "user-1");
  });

  it("does not fire a request for a guest (no user id)", () => {
    const { wrapper } = setup();

    renderHook(() => useCommunityMembershipQuery("c-1", undefined), { wrapper });

    expect(isCommunityMember).not.toHaveBeenCalled();
  });

  it("does not fire a request until the community id is known", () => {
    const { wrapper } = setup();

    renderHook(() => useCommunityMembershipQuery(undefined, "user-1"), { wrapper });

    expect(isCommunityMember).not.toHaveBeenCalled();
  });

  // staleTime: 0 的原因（见 hook 注释）：从 Feed 页静默加入后回到浏览页，
  // 不能吃着旧缓存继续显示"加入"。同一个 QueryClient 里先后挂载两次，第二次
  // 挂载必须重新请求一次。
  it("re-checks membership on every mount instead of serving a cached answer (staleTime 0)", async () => {
    isCommunityMember.mockResolvedValueOnce(false).mockResolvedValueOnce(true);
    const { wrapper } = setup();

    const first = renderHook(() => useCommunityMembershipQuery("c-1", "user-1"), { wrapper });
    await waitFor(() => expect(first.result.current.data).toBe(false));
    first.unmount();

    const second = renderHook(() => useCommunityMembershipQuery("c-1", "user-1"), { wrapper });
    await waitFor(() => expect(second.result.current.data).toBe(true));
    expect(isCommunityMember).toHaveBeenCalledTimes(2);
  });
});

describe("useCommunityPostsTodayCountQuery", () => {
  beforeEach(() => {
    countCommunityPostsSince.mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("counts posts since 0:00 of the viewer's local day", async () => {
    // 用本地时区构造的时间（不带 Z），断言也按本地时区算——测试在任何时区的
    // 机器上都成立，不依赖 UTC 偏移。
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(2026, 9, 8, 21, 30, 0));
    countCommunityPostsSince.mockResolvedValue(5);
    const { wrapper } = setup();

    const { result } = renderHook(() => useCommunityPostsTodayCountQuery("c-1"), { wrapper });

    await waitFor(() => expect(result.current.data).toBe(5));
    expect(countCommunityPostsSince).toHaveBeenCalledWith(
      "c-1",
      new Date(2026, 9, 8, 0, 0, 0).toISOString()
    );
  });

  it("does not fire a request until the community id is known", () => {
    const { wrapper } = setup();

    renderHook(() => useCommunityPostsTodayCountQuery(undefined), { wrapper });

    expect(countCommunityPostsSince).not.toHaveBeenCalled();
  });
});
