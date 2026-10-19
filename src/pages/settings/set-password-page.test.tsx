import { cleanup, fireEvent, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { updatePasswordMock } = vi.hoisted(() => ({ updatePasswordMock: vi.fn() }));

vi.mock("../../services/auth/auth-service", () => ({
  authService: { updatePassword: updatePasswordMock }
}));

import { renderWithProviders } from "../../test/render-with-providers";
import { AppError } from "../../utils/app-error";
import { SetPasswordPage } from "./set-password-page";

function fill(password: string, confirm: string) {
  fireEvent.change(screen.getByLabelText("新密码"), { target: { value: password } });
  fireEvent.change(screen.getByLabelText("确认新密码"), { target: { value: confirm } });
  fireEvent.click(screen.getByRole("button", { name: "保存密码" }));
}

describe("SetPasswordPage", () => {
  afterEach(() => {
    cleanup();
  });

  beforeEach(() => {
    updatePasswordMock.mockReset();
  });

  it("saves the new password and confirms it can be used for phone + password login", async () => {
    updatePasswordMock.mockResolvedValue({ id: "user-1" });
    renderWithProviders(<SetPasswordPage />);
    fill("password123", "password123");

    expect(await screen.findByRole("status")).toHaveTextContent("密码已保存");
    expect(updatePasswordMock).toHaveBeenCalledWith("password123");
  });

  it("rejects a short password and mismatched confirmation without calling the API", async () => {
    renderWithProviders(<SetPasswordPage />);
    fill("short", "short");
    expect(await screen.findByRole("alert")).toHaveTextContent("密码至少需要 8 位。");

    fill("password123", "password124");
    expect(await screen.findByRole("alert")).toHaveTextContent("两次输入的密码不一致。");
    expect(updatePasswordMock).not.toHaveBeenCalled();
  });

  it("shows a friendly message when the API asks for re-authentication", async () => {
    updatePasswordMock.mockRejectedValue(new AppError("reauth", "reauthentication_needed"));
    renderWithProviders(<SetPasswordPage />);
    fill("password123", "password123");

    expect(await screen.findByRole("alert")).toHaveTextContent("请退出后用短信验证重新登录");
  });
});
