import { cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { useMyProfileQuery, useUpdateDisplayNameMutation, mutateAsyncMock, navigateMock } =
  vi.hoisted(() => ({
    useMyProfileQuery: vi.fn(),
    useUpdateDisplayNameMutation: vi.fn(),
    mutateAsyncMock: vi.fn(),
    navigateMock: vi.fn()
  }));

vi.mock("../../features/profile/use-my-profile-query", () => ({
  useMyProfileQuery
}));
vi.mock("../../features/profile/use-update-display-name-mutation", () => ({
  useUpdateDisplayNameMutation
}));
vi.mock("react-router-dom", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react-router-dom")>();
  return { ...actual, useNavigate: () => navigateMock };
});

import { useAuthStore } from "../../store/auth-store";
import { renderWithProviders } from "../../test/render-with-providers";
import { EditProfilePage } from "./edit-profile-page";

const initialAuthState = useAuthStore.getState();

function renderPage() {
  return renderWithProviders(<EditProfilePage />);
}

describe("EditProfilePage", () => {
  afterEach(() => {
    cleanup();
  });

  beforeEach(() => {
    useAuthStore.setState(initialAuthState, true);
    useAuthStore.getState().setSession({ user: { id: "user-1" } } as never);

    useMyProfileQuery.mockReset();
    useUpdateDisplayNameMutation.mockReset();
    mutateAsyncMock.mockReset();
    navigateMock.mockReset();

    useMyProfileQuery.mockReturnValue({
      data: { displayName: "小明", avatarUrl: null },
      isPending: false,
      isError: false
    });
    useUpdateDisplayNameMutation.mockReturnValue({
      mutateAsync: mutateAsyncMock,
      isPending: false
    });
  });

  it("renders the current display name as the input's initial value", () => {
    renderPage();

    expect(screen.getByLabelText("昵称")).toHaveValue("小明");
  });

  it("shows a validation error and does not call the mutation when the display name is cleared", () => {
    renderPage();

    fireEvent.change(screen.getByLabelText("昵称"), { target: { value: "   " } });
    fireEvent.click(screen.getByRole("button", { name: "保存" }));

    expect(screen.getByRole("alert")).toHaveTextContent("请填写昵称。");
    expect(mutateAsyncMock).not.toHaveBeenCalled();
  });

  it("shows a validation error when the display name is longer than 20 characters", () => {
    renderPage();

    fireEvent.change(screen.getByLabelText("昵称"), {
      target: { value: "a".repeat(21) }
    });
    fireEvent.click(screen.getByRole("button", { name: "保存" }));

    expect(screen.getByRole("alert")).toHaveTextContent("昵称不能超过 20 个字。");
    expect(mutateAsyncMock).not.toHaveBeenCalled();
  });

  it("calls the mutation with the trimmed display name and navigates to /profile on success", async () => {
    mutateAsyncMock.mockResolvedValue(undefined);
    renderPage();

    fireEvent.change(screen.getByLabelText("昵称"), {
      target: { value: "  小红  " }
    });
    fireEvent.click(screen.getByRole("button", { name: "保存" }));

    await waitFor(() => {
      expect(mutateAsyncMock).toHaveBeenCalledWith({
        userId: "user-1",
        displayName: "小红"
      });
    });
    await waitFor(() => {
      expect(navigateMock).toHaveBeenCalledWith("/profile");
    });
  });

  it("shows a generic error message and does not navigate when the mutation rejects", async () => {
    mutateAsyncMock.mockRejectedValue(new Error("network down"));
    renderPage();

    fireEvent.change(screen.getByLabelText("昵称"), { target: { value: "小红" } });
    fireEvent.click(screen.getByRole("button", { name: "保存" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("保存失败，请稍后重试。");
    expect(navigateMock).not.toHaveBeenCalled();
  });

  it("shows a loading status and disables the form while the profile is still loading", () => {
    useMyProfileQuery.mockReturnValue({ data: undefined, isPending: true, isError: false });

    renderPage();

    expect(screen.getByRole("status")).toHaveTextContent("加载中…");
    expect(screen.getByLabelText("昵称")).toBeDisabled();
    expect(screen.getByRole("button", { name: "保存" })).toBeDisabled();
  });

  it("shows an error and disables the form when the profile fails to load", () => {
    useMyProfileQuery.mockReturnValue({ data: undefined, isPending: false, isError: true });

    renderPage();

    expect(screen.getByRole("alert")).toHaveTextContent("用户信息加载失败，请稍后重试。");
    expect(screen.getByLabelText("昵称")).toBeDisabled();
    expect(screen.getByRole("button", { name: "保存" })).toBeDisabled();
  });
});
