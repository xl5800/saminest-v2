import { act, cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { getMyProfile, updateMyProfile } = vi.hoisted(() => ({
  getMyProfile: vi.fn(),
  updateMyProfile: vi.fn()
}));

vi.mock("../repositories/profiles-repository", () => ({
  getMyProfile,
  updateMyProfile
}));

import { isNicknamePromptDismissed } from "../features/profile/use-nickname-prompt";
import { useAuthStore } from "../store/auth-store";
import { useNicknamePromptStore } from "../store/nickname-prompt-store";
import { renderWithProviders } from "../test/render-with-providers";
import { NicknamePromptSheet } from "./nickname-prompt-sheet";

const initialAuthState = useAuthStore.getState();

describe("NicknamePromptSheet", () => {
  afterEach(() => {
    cleanup();
    useNicknamePromptStore.setState({ open: false, resolvers: [] });
    window.localStorage.clear();
  });

  beforeEach(() => {
    useAuthStore.setState(initialAuthState, true);
    useAuthStore.getState().setSession({ user: { id: "user-1" } } as never);
    getMyProfile.mockReset();
    updateMyProfile.mockReset();
    getMyProfile.mockResolvedValue({
      displayName: "同城用户1234",
      avatarUrl: null,
      bio: "老简介",
      locationId: "loc-1",
      locationName: "Fairfax",
      age: 30
    });
  });

  it("renders nothing until requested", () => {
    renderWithProviders(<NicknamePromptSheet />);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("saves only the nickname, keeping the other profile fields, then resolves the request", async () => {
    updateMyProfile.mockResolvedValue(undefined);
    renderWithProviders(<NicknamePromptSheet />);
    await waitFor(() => expect(getMyProfile).toHaveBeenCalled());

    let resolved = false;
    act(() => {
      void useNicknamePromptStore.getState().request().then(() => {
        resolved = true;
      });
    });
    expect(await screen.findByRole("dialog", { name: "设置昵称" })).toBeInTheDocument();
    expect(await screen.findByText(/同城用户1234/)).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("昵称"), { target: { value: "  小王  " } });
    fireEvent.click(screen.getByRole("button", { name: "保存" }));

    await waitFor(() => expect(resolved).toBe(true));
    expect(updateMyProfile).toHaveBeenCalledWith("user-1", {
      displayName: "小王",
      bio: "老简介",
      locationId: "loc-1",
      age: 30
    });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("requires a non-empty nickname", async () => {
    renderWithProviders(<NicknamePromptSheet />);
    act(() => {
      void useNicknamePromptStore.getState().request();
    });

    fireEvent.click(await screen.findByRole("button", { name: "保存" }));

    expect(screen.getByRole("alert")).toHaveTextContent("请填写昵称。");
    expect(updateMyProfile).not.toHaveBeenCalled();
  });

  it("skip resolves the request and remembers the choice for this user", async () => {
    renderWithProviders(<NicknamePromptSheet />);
    let resolved = false;
    act(() => {
      void useNicknamePromptStore.getState().request().then(() => {
        resolved = true;
      });
    });

    fireEvent.click(await screen.findByRole("button", { name: "跳过" }));

    await waitFor(() => expect(resolved).toBe(true));
    expect(isNicknamePromptDismissed("user-1")).toBe(true);
    expect(updateMyProfile).not.toHaveBeenCalled();
  });

  it("keeps the sheet open with an error when saving fails", async () => {
    updateMyProfile.mockRejectedValue(new Error("boom"));
    renderWithProviders(<NicknamePromptSheet />);
    await waitFor(() => expect(getMyProfile).toHaveBeenCalled());
    act(() => {
      void useNicknamePromptStore.getState().request();
    });

    fireEvent.change(await screen.findByLabelText("昵称"), { target: { value: "小王" } });
    fireEvent.click(screen.getByRole("button", { name: "保存" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("保存失败");
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });
});
