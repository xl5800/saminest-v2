import { renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

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

beforeEach(() => {
  useAuthStore.setState(initialState, true);
  vi.clearAllMocks();
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
});
