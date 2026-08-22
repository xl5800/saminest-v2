import { cleanup, fireEvent, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const {
  useAccountDeletionStatusQuery,
  useRequestAccountDeletionMutation,
  useCancelAccountDeletionMutation,
  requestMutateAsyncMock,
  cancelMutateAsyncMock,
  verifyCurrentPasswordMock
} = vi.hoisted(() => ({
  useAccountDeletionStatusQuery: vi.fn(),
  useRequestAccountDeletionMutation: vi.fn(),
  useCancelAccountDeletionMutation: vi.fn(),
  requestMutateAsyncMock: vi.fn(),
  cancelMutateAsyncMock: vi.fn(),
  verifyCurrentPasswordMock: vi.fn()
}));

vi.mock("../../features/profile/use-account-deletion-status-query", () => ({
  useAccountDeletionStatusQuery
}));
vi.mock("../../features/profile/use-request-account-deletion-mutation", () => ({
  useRequestAccountDeletionMutation
}));
vi.mock("../../features/profile/use-cancel-account-deletion-mutation", () => ({
  useCancelAccountDeletionMutation
}));
vi.mock("../../services/auth/auth-service", () => ({
  authService: { verifyCurrentPassword: verifyCurrentPasswordMock }
}));

import { useAuthStore } from "../../store/auth-store";
import { renderWithProviders } from "../../test/render-with-providers";
import { AppError } from "../../utils/app-error";
import { DeleteAccountPage } from "./delete-account-page";

const initialAuthState = useAuthStore.getState();

function renderPage() {
  return renderWithProviders(<DeleteAccountPage />);
}

describe("DeleteAccountPage", () => {
  afterEach(() => {
    cleanup();
  });

  beforeEach(() => {
    useAuthStore.setState(initialAuthState, true);
    useAuthStore.getState().setSession({
      user: { id: "user-1", email: "barry@example.com" }
    } as never);

    requestMutateAsyncMock.mockReset();
    cancelMutateAsyncMock.mockReset();
    verifyCurrentPasswordMock.mockReset();

    useRequestAccountDeletionMutation.mockReset();
    useRequestAccountDeletionMutation.mockReturnValue({
      mutateAsync: requestMutateAsyncMock,
      isPending: false
    });
    useCancelAccountDeletionMutation.mockReset();
    useCancelAccountDeletionMutation.mockReturnValue({
      mutateAsync: cancelMutateAsyncMock,
      isPending: false
    });
    useAccountDeletionStatusQuery.mockReset();
  });

  it("shows the countdown and a cancel button when a deletion is pending", () => {
    useAccountDeletionStatusQuery.mockReturnValue({
      data: { scheduledPurgeAt: "2999-01-15T00:00:00.000Z" },
      isPending: false,
      isError: false
    });

    renderPage();

    expect(screen.getByText(/账号将在/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "撤销注销" })).toBeInTheDocument();
  });

  it("calls cancelAccountDeletion when clicking 撤销注销", async () => {
    useAccountDeletionStatusQuery.mockReturnValue({
      data: { scheduledPurgeAt: "2999-01-15T00:00:00.000Z" },
      isPending: false,
      isError: false
    });
    cancelMutateAsyncMock.mockResolvedValue(undefined);

    renderPage();
    fireEvent.click(screen.getByRole("button", { name: "撤销注销" }));

    expect(cancelMutateAsyncMock).toHaveBeenCalled();
  });

  it("renders the deletion form when there is no pending request", () => {
    useAccountDeletionStatusQuery.mockReturnValue({ data: null, isPending: false, isError: false });

    renderPage();

    expect(screen.getByRole("heading", { name: "注销账号" })).toBeInTheDocument();
    expect(screen.getByLabelText("输入当前密码确认身份")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "确认注销账号" })).toBeInTheDocument();
  });

  it("requires the confirmation text to match before submitting", async () => {
    useAccountDeletionStatusQuery.mockReturnValue({ data: null, isPending: false, isError: false });

    renderPage();
    fireEvent.change(screen.getByLabelText("输入当前密码确认身份"), {
      target: { value: "correct-password" }
    });
    fireEvent.change(screen.getByLabelText(/请输入"注销"确认操作/), {
      target: { value: "不对" }
    });
    fireEvent.click(screen.getByRole("button", { name: "确认注销账号" }));

    expect(await screen.findByRole("alert")).toHaveTextContent('请在下方输入"注销"以确认');
    expect(verifyCurrentPasswordMock).not.toHaveBeenCalled();
  });

  it("verifies the password then requests deletion on a valid submit", async () => {
    useAccountDeletionStatusQuery.mockReturnValue({ data: null, isPending: false, isError: false });
    verifyCurrentPasswordMock.mockResolvedValue(undefined);
    requestMutateAsyncMock.mockResolvedValue("2999-01-15T00:00:00.000Z");

    renderPage();
    fireEvent.change(screen.getByLabelText("输入当前密码确认身份"), {
      target: { value: "correct-password" }
    });
    fireEvent.change(screen.getByLabelText(/请输入"注销"确认操作/), {
      target: { value: "注销" }
    });
    fireEvent.click(screen.getByRole("button", { name: "确认注销账号" }));

    await vi.waitFor(() => {
      expect(verifyCurrentPasswordMock).toHaveBeenCalledWith("barry@example.com", "correct-password");
    });
    await vi.waitFor(() => {
      expect(requestMutateAsyncMock).toHaveBeenCalled();
    });
  });

  it("shows the AppError message when password verification fails", async () => {
    useAccountDeletionStatusQuery.mockReturnValue({ data: null, isPending: false, isError: false });
    verifyCurrentPasswordMock.mockRejectedValue(
      new AppError("密码不正确，请重新输入。", "AUTH_REAUTH_FAILED")
    );

    renderPage();
    fireEvent.change(screen.getByLabelText("输入当前密码确认身份"), {
      target: { value: "wrong-password" }
    });
    fireEvent.change(screen.getByLabelText(/请输入"注销"确认操作/), {
      target: { value: "注销" }
    });
    fireEvent.click(screen.getByRole("button", { name: "确认注销账号" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("密码不正确，请重新输入。");
    expect(requestMutateAsyncMock).not.toHaveBeenCalled();
  });
});
