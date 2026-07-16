import { beforeEach, describe, expect, it } from "vitest";

import { useAuthStore } from "./auth-store";

const initialState = useAuthStore.getState();

beforeEach(() => {
  useAuthStore.setState(initialState, true);
});

describe("useAuthStore", () => {
  it("starts with no session and isInitializing true", () => {
    expect(useAuthStore.getState().session).toBeNull();
    expect(useAuthStore.getState().isInitializing).toBe(true);
  });

  it("setSession updates the session", () => {
    const session = { access_token: "token" } as never;

    useAuthStore.getState().setSession(session);

    expect(useAuthStore.getState().session).toBe(session);
  });

  it("setInitializing flips the loading flag", () => {
    useAuthStore.getState().setInitializing(false);

    expect(useAuthStore.getState().isInitializing).toBe(false);
  });
});
