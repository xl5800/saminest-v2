import { renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { ensureProfileExists } = vi.hoisted(() => ({
  ensureProfileExists: vi.fn()
}));

vi.mock("../repositories/profiles-repository", () => ({
  ensureProfileExists
}));

import { useAuthStore } from "../store/auth-store";
import { useAuthBootstrap } from "./use-auth-bootstrap";

type AuthChangeCallback = (event: string, session: unknown) => void;

const unsubscribe = vi.fn();
const onAuthStateChange = vi.fn((_callback: AuthChangeCallback) => ({
  data: { subscription: { unsubscribe } }
}));
const getSession = vi.fn(() =>
  Promise.resolve({ data: { session: null } })
);

vi.mock("../integrations/supabase/client", () => ({
  getSupabaseClient: () => ({
    auth: { getSession, onAuthStateChange }
  })
}));

const initialState = useAuthStore.getState();

function buildSession(userId: string, displayName?: string) {
  return {
    access_token: "token",
    user: {
      id: userId,
      user_metadata: displayName === undefined ? {} : { display_name: displayName }
    }
  } as never;
}

/**
 * getSession() 在这个测试文件里全局 mock 成固定返回 null session，挂载时
 * 异步 resolve——如果测试在它 resolve 之前就手动触发 onAuthStateChange
 * 的 handler，之后这个迟到的 null session 会把 lastCheckedUserId 重新
 * 冲回 null，产生一次多余的补建触发。先等 isInitializing 变 false，
 * 确保这次挂载时的 getSession() 已经真正落地，再拿 handler 去手动触发
 * 后续场景，避免这个纯测试环境时序问题污染断言。
 */
async function renderAndGetHandler() {
  renderHook(() => useAuthBootstrap());
  await vi.waitFor(() => {
    expect(useAuthStore.getState().isInitializing).toBe(false);
  });
  return onAuthStateChange.mock.calls[0][0] as AuthChangeCallback;
}

beforeEach(() => {
  useAuthStore.setState(initialState, true);
  vi.clearAllMocks();
  ensureProfileExists.mockReset();
  ensureProfileExists.mockResolvedValue(undefined);
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("useAuthBootstrap", () => {
  it("registers exactly one auth listener and clears the loading flag", async () => {
    const { unmount } = renderHook(() => useAuthBootstrap());

    await vi.waitFor(() => {
      expect(useAuthStore.getState().isInitializing).toBe(false);
    });

    expect(onAuthStateChange).toHaveBeenCalledOnce();

    unmount();
    expect(unsubscribe).toHaveBeenCalledOnce();
  });

  it("updates the store when the auth listener fires", () => {
    renderHook(() => useAuthBootstrap());
    const handler = onAuthStateChange.mock.calls[0][0];
    const session = { access_token: "token" } as never;

    handler("SIGNED_IN", session);

    expect(useAuthStore.getState().session).toBe(session);
  });

  it("calls ensureProfileExists with the user id and display_name from user_metadata when a session first appears", async () => {
    const handler = await renderAndGetHandler();

    handler("SIGNED_IN", buildSession("user-1", "小明"));

    await vi.waitFor(() => {
      expect(ensureProfileExists).toHaveBeenCalledWith("user-1", "小明");
    });
  });

  it("falls back to a default display name when user_metadata has none", async () => {
    const handler = await renderAndGetHandler();

    handler("SIGNED_IN", buildSession("user-1"));

    await vi.waitFor(() => {
      expect(ensureProfileExists).toHaveBeenCalledWith("user-1", "新用户");
    });
  });

  it("does not call ensureProfileExists again when the auth listener re-fires for the same user id", async () => {
    const handler = await renderAndGetHandler();
    const session = buildSession("user-1", "小明");

    handler("SIGNED_IN", session);
    await vi.waitFor(() => {
      expect(ensureProfileExists).toHaveBeenCalledTimes(1);
    });

    handler("TOKEN_REFRESHED", session);
    handler("SIGNED_IN", session);

    expect(ensureProfileExists).toHaveBeenCalledTimes(1);
  });

  it("calls ensureProfileExists again once a different user id signs in", async () => {
    const handler = await renderAndGetHandler();

    handler("SIGNED_IN", buildSession("user-1", "小明"));
    await vi.waitFor(() => {
      expect(ensureProfileExists).toHaveBeenCalledTimes(1);
    });

    handler("SIGNED_OUT", null);
    handler("SIGNED_IN", buildSession("user-2", "小红"));

    await vi.waitFor(() => {
      expect(ensureProfileExists).toHaveBeenCalledTimes(2);
    });
    expect(ensureProfileExists).toHaveBeenNthCalledWith(2, "user-2", "小红");
  });

  it("does not block session updates or throw when ensureProfileExists rejects", async () => {
    ensureProfileExists.mockRejectedValue(new Error("network down"));

    const handler = await renderAndGetHandler();
    const session = buildSession("user-1", "小明");

    expect(() => handler("SIGNED_IN", session)).not.toThrow();

    await vi.waitFor(() => {
      expect(useAuthStore.getState().session).toBe(session);
    });
  });
});
