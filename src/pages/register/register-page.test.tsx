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

function renderRegisterPage(initialEntry = "/register") {
  return render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <RegisterPage />
    </MemoryRouter>
  );
}

const validValues = {
  email: "user@example.com",
  password: "password123"
};

function fillForm(overrides: Partial<typeof validValues> = {}) {
  const values = { ...validValues, ...overrides };
  fireEvent.change(screen.getByLabelText("邮箱或手机号"), {
    target: { value: values.email }
  });
  fireEvent.change(screen.getByLabelText("密码"), {
    target: { value: values.password }
  });
}

const DEFAULT_NICKNAME = expect.stringMatching(/^同城用户\d{4}$/);

describe("RegisterPage", () => {
  afterEach(() => {
    cleanup();
  });

  beforeEach(() => {
    signUp.mockReset();
    navigateMock.mockReset();
  });

  // 注册登录简化任务卡：表单只剩两项，没有显示名称/确认密码/协议勾选框。
  it("renders only the identifier and password fields", () => {
    renderRegisterPage();

    expect(screen.getByLabelText("邮箱或手机号")).toBeInTheDocument();
    expect(screen.getByLabelText("密码")).toBeInTheDocument();
    expect(screen.queryByLabelText("显示名称")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("确认密码")).not.toBeInTheDocument();
    expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
  });

  it("shows a 注册即表示同意 line with links that navigate in-app (no target=_blank)", () => {
    renderRegisterPage();

    // 不能再用 target="_blank"：/terms 和 /privacy 是应用内部路由，Capacitor 的原生
    // WebView 没有"新标签页"，target="_blank" 在 App 里点了没反应。
    expect(screen.getByText(/注册即表示同意/)).toBeInTheDocument();
    const termsLink = screen.getByRole("link", { name: "《用户协议》" });
    expect(termsLink).toHaveAttribute("href", "/terms");
    expect(termsLink).not.toHaveAttribute("target");
    const privacyLink = screen.getByRole("link", { name: "《隐私政策》" });
    expect(privacyLink).toHaveAttribute("href", "/privacy");
    expect(privacyLink).not.toHaveAttribute("target");
  });

  it("links to the login page, carrying the redirect param", () => {
    renderRegisterPage("/register?redirect=%2Factivities%2Fact-1");

    expect(screen.getByRole("link", { name: "去登录" })).toHaveAttribute(
      "href",
      "/login?redirect=%2Factivities%2Fact-1"
    );
  });

  it("blocks submission when the password is shorter than the minimum length", async () => {
    renderRegisterPage();
    fillForm({ password: "short1" });

    fireEvent.click(screen.getByRole("button", { name: "注册" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("密码至少需要 8 位。");
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

  it("calls authService.signUp with a default nickname and redirects home on success", async () => {
    signUp.mockResolvedValue({ user: null, session: null });
    renderRegisterPage();
    fillForm();

    fireEvent.click(screen.getByRole("button", { name: "注册" }));

    await waitFor(() => {
      expect(signUp).toHaveBeenCalledWith({
        email: "user@example.com",
        password: "password123",
        displayName: DEFAULT_NICKNAME
      });
    });
    expect(navigateMock).toHaveBeenCalledWith("/", { replace: true });
  });

  it("returns to the page in ?redirect= after a successful signup", async () => {
    signUp.mockResolvedValue({ user: null, session: null });
    renderRegisterPage("/register?redirect=%2Factivities%2Fact-1");
    fillForm();

    fireEvent.click(screen.getByRole("button", { name: "注册" }));

    await waitFor(() => {
      expect(navigateMock).toHaveBeenCalledWith("/activities/act-1", { replace: true });
    });
  });

  it("maps a known Supabase error code to a friendly message instead of the raw error", async () => {
    signUp.mockRejectedValue(new AppError("User already registered", "email_exists"));
    renderRegisterPage();
    fillForm();

    fireEvent.click(screen.getByRole("button", { name: "注册" }));

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("该邮箱或手机号已经注册，请直接登录或使用找回密码。");
    expect(alert.textContent).not.toContain("User already registered");
  });

  // 登录/注册支持手机号任务卡：影子邮箱方案——用户输入手机号时，
  // authService.signUp 收到的是算出来的影子邮箱 + 归一化后的真实手机号，
  // 不是用户输入的原始字符串。
  it("derives a shadow email and passes the phone digits when the identifier looks like a phone number", async () => {
    signUp.mockResolvedValue({ user: null, session: null });
    renderRegisterPage();
    fillForm({ email: "703-555-0199" });

    fireEvent.click(screen.getByRole("button", { name: "注册" }));

    await waitFor(() => {
      expect(signUp).toHaveBeenCalledWith({
        email: "7035550199@phone.saminest.internal",
        password: "password123",
        displayName: DEFAULT_NICKNAME,
        phone: "7035550199"
      });
    });
    expect(navigateMock).toHaveBeenCalledWith("/", { replace: true });
  });

  it("shows a friendly error when the identifier looks like neither an email nor a phone number", async () => {
    renderRegisterPage();
    fillForm({ email: "not-an-identifier" });

    fireEvent.click(screen.getByRole("button", { name: "注册" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("请输入正确的邮箱或手机号。");
    expect(signUp).not.toHaveBeenCalled();
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
