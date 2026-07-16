import { MemoryRouter } from "react-router-dom";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { updatePassword } = vi.hoisted(() => ({ updatePassword: vi.fn() }));

vi.mock("../../services/auth/auth-service", () => ({
  authService: { updatePassword }
}));

import { AppError } from "../../utils/app-error";
import { useAuthStore } from "../../store/auth-store";
import { ResetPasswordPage } from "./reset-password-page";

const initialAuthState = useAuthStore.getState();

function renderPage() {
  return render(
    <MemoryRouter>
      <ResetPasswordPage />
    </MemoryRouter>
  );
}

describe("ResetPasswordPage", () => {
  afterEach(() => {
    cleanup();
  });

  beforeEach(() => {
    updatePassword.mockReset();
    useAuthStore.setState(initialAuthState, true);
  });

  it("shows an error and a link back to /forgot-password when there is no recovery session", () => {
    renderPage();

    expect(screen.getByRole("alert")).toHaveTextContent(
      "这个重置密码链接无效或已经过期，请重新发起一次找回密码。"
    );
    expect(
      screen.getByRole("link", { name: "重新发送重置邮件" })
    ).toHaveAttribute("href", "/forgot-password");
    expect(screen.queryByLabelText("新密码")).not.toBeInTheDocument();
  });

  it("renders the password fields when a recovery session exists", () => {
    useAuthStore.setState({ session: { access_token: "token" } as never });
    renderPage();

    expect(screen.getByLabelText("新密码")).toBeInTheDocument();
    expect(screen.getByLabelText("确认新密码")).toBeInTheDocument();
  });

  it("blocks submission when the password is shorter than the minimum length", async () => {
    useAuthStore.setState({ session: { access_token: "token" } as never });
    renderPage();

    fireEvent.change(screen.getByLabelText("新密码"), {
      target: { value: "short1" }
    });
    fireEvent.change(screen.getByLabelText("确认新密码"), {
      target: { value: "short1" }
    });
    fireEvent.click(screen.getByRole("button", { name: "更新密码" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("密码至少需要 8 位。");
    expect(updatePassword).not.toHaveBeenCalled();
  });

  it("blocks submission when the passwords do not match", async () => {
    useAuthStore.setState({ session: { access_token: "token" } as never });
    renderPage();

    fireEvent.change(screen.getByLabelText("新密码"), {
      target: { value: "password123" }
    });
    fireEvent.change(screen.getByLabelText("确认新密码"), {
      target: { value: "different123" }
    });
    fireEvent.click(screen.getByRole("button", { name: "更新密码" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "两次输入的密码不一致。"
    );
    expect(updatePassword).not.toHaveBeenCalled();
  });

  it("disables the submit button and shows a loading label while pending", async () => {
    useAuthStore.setState({ session: { access_token: "token" } as never });
    let resolveUpdate: (user: unknown) => void = () => {};
    updatePassword.mockReturnValue(
      new Promise((resolve) => {
        resolveUpdate = resolve;
      })
    );

    renderPage();
    fireEvent.change(screen.getByLabelText("新密码"), {
      target: { value: "password123" }
    });
    fireEvent.change(screen.getByLabelText("确认新密码"), {
      target: { value: "password123" }
    });
    fireEvent.click(screen.getByRole("button", { name: "更新密码" }));

    const pendingButton = await screen.findByRole("button", { name: "更新中…" });
    expect(pendingButton).toBeDisabled();

    resolveUpdate({ id: "user-1" });
    await waitFor(() => {
      expect(screen.getByRole("status")).toBeInTheDocument();
    });
  });

  it("updates the password and shows a confirmation with a link to /login on success", async () => {
    useAuthStore.setState({ session: { access_token: "token" } as never });
    updatePassword.mockResolvedValue({ id: "user-1" });

    renderPage();
    fireEvent.change(screen.getByLabelText("新密码"), {
      target: { value: "password123" }
    });
    fireEvent.change(screen.getByLabelText("确认新密码"), {
      target: { value: "password123" }
    });
    fireEvent.click(screen.getByRole("button", { name: "更新密码" }));

    await waitFor(() => {
      expect(updatePassword).toHaveBeenCalledWith("password123");
    });
    expect(screen.getByRole("status")).toHaveTextContent("密码已更新，请重新登录。");
    expect(screen.getByRole("link", { name: "去登录" })).toHaveAttribute(
      "href",
      "/login"
    );
  });

  it("shows a friendly message instead of the raw Supabase error on failure", async () => {
    useAuthStore.setState({ session: { access_token: "token" } as never });
    updatePassword.mockRejectedValue(new AppError("Weak password", "weak_password"));

    renderPage();
    fireEvent.change(screen.getByLabelText("新密码"), {
      target: { value: "password123" }
    });
    fireEvent.change(screen.getByLabelText("确认新密码"), {
      target: { value: "password123" }
    });
    fireEvent.click(screen.getByRole("button", { name: "更新密码" }));

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("密码强度不够，请更换更复杂的密码。");
    expect(alert.textContent).not.toContain("Weak password");
  });
});
