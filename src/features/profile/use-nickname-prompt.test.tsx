import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { getMyProfile } = vi.hoisted(() => ({ getMyProfile: vi.fn() }));

vi.mock("../../repositories/profiles-repository", () => ({ getMyProfile }));

import { useAuthStore } from "../../store/auth-store";
import { useNicknamePromptStore } from "../../store/nickname-prompt-store";
import { dismissNicknamePrompt, useNicknamePrompt } from "./use-nickname-prompt";

const initialAuthState = useAuthStore.getState();

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

async function renderWithName(displayName: string) {
  getMyProfile.mockResolvedValue({ displayName, avatarUrl: null, bio: null, locationId: null, locationName: null, age: null });
  const hook = renderHook(() => useNicknamePrompt(), { wrapper });
  await waitFor(() => expect(getMyProfile).toHaveBeenCalled());
  await waitFor(() => expect(hook.result.current).toBeDefined());
  return hook;
}

describe("useNicknamePrompt", () => {
  beforeEach(() => {
    useAuthStore.setState(initialAuthState, true);
    useAuthStore.getState().setSession({ user: { id: "user-1" } } as never);
    getMyProfile.mockReset();
    useNicknamePromptStore.setState({ open: false, resolvers: [] });
  });

  afterEach(() => {
    window.localStorage.clear();
  });

  it("runs the action synchronously when the user already has a real nickname", async () => {
    const { result } = await renderWithName("Alice");
    const action = vi.fn();

    result.current.runWithNicknameCheck(action);

    expect(action).toHaveBeenCalledTimes(1);
    expect(useNicknamePromptStore.getState().open).toBe(false);
  });

  it("opens the prompt for a default nickname and runs the action after it finishes", async () => {
    const { result } = await renderWithName("同城用户0042");
    await waitFor(() => expect(result.current.needsPrompt).toBe(true));
    const action = vi.fn();

    result.current.runWithNicknameCheck(action);

    expect(action).not.toHaveBeenCalled();
    expect(useNicknamePromptStore.getState().open).toBe(true);

    useNicknamePromptStore.getState().finish();
    await waitFor(() => expect(action).toHaveBeenCalledTimes(1));
  });

  it("does not prompt again after the user skipped it on this device", async () => {
    dismissNicknamePrompt("user-1");
    const { result } = await renderWithName("同城用户0042");
    const action = vi.fn();

    result.current.runWithNicknameCheck(action);

    expect(action).toHaveBeenCalledTimes(1);
    expect(useNicknamePromptStore.getState().open).toBe(false);
  });
});
