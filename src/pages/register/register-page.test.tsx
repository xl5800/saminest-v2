import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { signUp, navigateMock } = vi.hoisted(() => ({
  signUp: vi.fn(),
  navigateMock: vi.fn()
}));

vi.mock("../../services/auth/auth-service", () => ({
  authService: { signUp }
}));

vi.mock("react-router-dom", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react-router-dom")>();
  return { ...actual, useNavigate: () => navigateMock };
});

import { AppError } from "../../utils/app-error";
import { RegisterPage } from "./register-page";

function renderRegisterPage() {
  return render(
    <MemoryRouter>
      <RegisterPage />
    </MemoryRouter>
  );
}

const validValues = {
  displayName: "小明",
  email: "user@example.com",
  password: "password123",
  confirmPassword: "password123",
  agreeToTerms: true
};

function fillForm(overrides: Partial<typeof validValues> = {}) {
  const values = { ...validValues, ...overrides };
  fireEvent.change(screen.getByLabelText("显示名称"), {
    target: { value: values.displayName }
  });
  fireEvent.change(screen.getByLabelText("邮箱"), {
    target: { value: values.email }
  });
  fireEvent.change(screen.getByLabelText("密码"), {
    target: { value: values.password }
  });
  fireEvent.change(screen.getByLabelText("确认密码"), {
    target: { value: values.confirmPassword }
  });
  if (values.agreeToTerms) {
    fireEvent.click(screen.getByRole("checkbox"));
  }
}

describe("RegisterPage", () => {
  afterEach(() => {
    cleanup();
  });

  beforeEach(() => {
    signUp.mockReset();
    navigateMock.mockReset();
  });

  it("renders the four required fields", () => {
    renderRegisterPage();

    expect(screen.getByLabelText("显示名称")).toBeInTheDocument();
    expect(screen.getByLabelText("邮箱")).toBeInTheDocument();
    expect(screen.getByLabelText("密码")).toBeInTheDocument();
    expect(screen.getByLabelText("确认密码")).toBeInTheDocument();
  });

  it("renders the terms/privacy checkbox with links that open in a new tab", () => {
    renderRegisterPage();

    expect(screen.getByRole("checkbox")).not.toBeChecked();
    const termsLink = screen.getByRole("link", { name: "《用户协议》" });
    expect(termsLink).toHaveAttribute("href", "/terms");
    expect(termsLink).toHaveAttribute("target", "_blank");
    const privacyLink = screen.getByRole("link", { name: "《隐私政策》" });
    expect(privacyLink).toHaveAttribute("href", "/privacy");
    expect(privacyLink).toHaveAttribute("target", "_blank");
  });

  it("blocks submission on the client and shows a friendly message when passwords mismatch", async () => {
    renderRegisterPage();
    fillForm({ confirmPassword: "different123" });

    fireEvent.click(screen.getByRole("button", { name: "注册" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("两次输入的密码不一致。");
    expect(signUp).not.toHaveBeenCalled();
  });

  it("blocks submission when the password is shorter than the minimum length", async () => {
    renderRegisterPage();
    fillForm({ password: "short1", confirmPassword: "short1" });

    fireEvent.click(screen.getByRole("button", { name: "注册" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("密码至少需要 8 位。");
    expect(signUp).not.toHaveBeenCalled();
  });

  it("blocks submission and shows a friendly message when the terms checkbox is not checked", async () => {
    renderRegisterPage();
    fillForm({ agreeToTerms: false });

    fireEvent.click(screen.getByRole("button", { name: "注册" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "请先阅读并同意用户协议和隐私政策。"
    );
    expect(signUp).not.toHaveBeenCalled();
  });

  it("disables the submit button and shows a loading label while signUp is pending", async () => {
    let resolveSignUp: () => void = () => {};
    signUp.mockReturnValue(
      new Promise<void>((resolve) => {
        resolveSignUp = resolve;
      })
    );

    renderRegisterPage();
    fillForm();
    fireEvent.click(screen.getByRole("button", { name: "注册" }));

    const pendingButton = await screen.findByRole("button", { name: "注册中…" });
    expect(pendingButton).toBeDisabled();

    resolveSignUp();

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "注册" })).not.toBeDisabled();
    });
  });

  it("calls authService.signUp with the validated fields and redirects home on success once the terms checkbox is checked", async () => {
    signUp.mockResolvedValue({ user: null, session: null });
    renderRegisterPage();
    fillForm();

    fireEvent.click(screen.getByRole("button", { name: "注册" }));

    await waitFor(() => {
      expect(signUp).toHaveBeenCalledWith({
        email: "user@example.com",
        password: "password123",
        displayName: "小明"
      });
    });
    expect(navigateMock).toHaveBeenCalledWith("/", { replace: true });
  });

  it("maps a known Supabase error code to a friendly message instead of the raw error", async () => {
    signUp.mockRejectedValue(new AppError("User already registered", "email_exists"));
    renderRegisterPage();
    fillForm();

    fireEvent.click(screen.getByRole("button", { name: "注册" }));

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("该邮箱已经注册，请直接登录或使用找回密码。");
    expect(alert.textContent).not.toContain("User already registered");
  });

  it("falls back to a generic message for an unmapped error code", async () => {
    signUp.mockRejectedValue(new AppError("boom", "some_unmapped_code"));
    renderRegisterPage();
    fillForm();

    fireEvent.click(screen.getByRole("button", { name: "注册" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("注册失败，请稍后重试。");
  });

  it("falls back to a generic message for a non-AppError rejection", async () => {
    signUp.mockRejectedValue(new Error("network down"));
    renderRegisterPage();
    fillForm();

    fireEvent.click(screen.getByRole("button", { name: "注册" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("注册失败，请稍后重试。");
  });
});
