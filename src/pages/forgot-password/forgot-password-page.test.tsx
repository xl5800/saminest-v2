import { MemoryRouter } from "react-router-dom";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { resetPassword } = vi.hoisted(() => ({ resetPassword: vi.fn() }));

vi.mock("../../services/auth/auth-service", () => ({
  authService: { resetPassword }
}));

import { ForgotPasswordPage } from "./forgot-password-page";

function renderPage() {
  return render(
    <MemoryRouter>
      <ForgotPasswordPage />
    </MemoryRouter>
  );
}

describe("ForgotPasswordPage", () => {
  afterEach(() => {
    cleanup();
  });

  beforeEach(() => {
    resetPassword.mockReset();
  });

  it("renders the email field and a link back to login", () => {
    renderPage();

    expect(screen.getByLabelText("邮箱")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "返回登录" })).toHaveAttribute(
      "href",
      "/login"
    );
  });

  it("blocks submission and shows an error for a malformed email", async () => {
    renderPage();
    fireEvent.change(screen.getByLabelText("邮箱"), {
      target: { value: "not-an-email" }
    });
    fireEvent.click(screen.getByRole("button", { name: "发送重置邮件" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "请填写正确的邮箱地址。"
    );
    expect(resetPassword).not.toHaveBeenCalled();
  });

  it("disables the submit button and shows a loading label while the request is pending", async () => {
    let resolveReset: () => void = () => {};
    resetPassword.mockReturnValue(
      new Promise<void>((resolve) => {
        resolveReset = resolve;
      })
    );

    renderPage();
    fireEvent.change(screen.getByLabelText("邮箱"), {
      target: { value: "user@example.com" }
    });
    fireEvent.click(screen.getByRole("button", { name: "发送重置邮件" }));

    const pendingButton = await screen.findByRole("button", { name: "发送中…" });
    expect(pendingButton).toBeDisabled();

    resolveReset();
    await waitFor(() => {
      expect(screen.getByRole("status")).toBeInTheDocument();
    });
  });

  it("calls resetPassword with the email and the /reset-password redirect URL, then shows the generic confirmation", async () => {
    resetPassword.mockResolvedValue(undefined);

    renderPage();
    fireEvent.change(screen.getByLabelText("邮箱"), {
      target: { value: "user@example.com" }
    });
    fireEvent.click(screen.getByRole("button", { name: "发送重置邮件" }));

    await waitFor(() => {
      expect(resetPassword).toHaveBeenCalledWith(
        "user@example.com",
        `${window.location.origin}/reset-password`
      );
    });
    expect(screen.getByRole("status")).toHaveTextContent(
      "如果该邮箱已注册，我们已发送重置密码邮件。"
    );
  });

  it("shows the exact same generic confirmation even when the request fails, so registered emails can't be enumerated", async () => {
    resetPassword.mockRejectedValue(new Error("boom"));

    renderPage();
    fireEvent.change(screen.getByLabelText("邮箱"), {
      target: { value: "user@example.com" }
    });
    fireEvent.click(screen.getByRole("button", { name: "发送重置邮件" }));

    await waitFor(() => {
      expect(screen.getByRole("status")).toHaveTextContent(
        "如果该邮箱已注册，我们已发送重置密码邮件。"
      );
    });
  });
});
