import { MemoryRouter } from "react-router-dom";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { acceptTerms, ensureProfileExists } = vi.hoisted(() => ({
  acceptTerms: vi.fn(),
  ensureProfileExists: vi.fn()
}));

const { authMock, navigateMock, triggerAuthEvent } = vi.hoisted(() => {
  let capturedCallback: ((event: string, session: unknown) => void) | null = null;
  const onAuthStateChange = vi.fn((callback: (event: string, session: unknown) => void) => {
    capturedCallback = callback;
    return { data: { subscription: { unsubscribe: vi.fn() } } };
  });
  const getSession = vi.fn(() => Promise.resolve({ data: { session: null } }));
  const triggerAuthEvent = (event: string, session: unknown) => {
    capturedCallback?.(event, session);
  };
  return {
    authMock: {
      signInWithPassword: vi.fn(),
      signInWithOtp: vi.fn(),
      verifyOtp: vi.fn(),
      getSession,
      onAuthStateChange
    },
    navigateMock: vi.fn(),
    triggerAuthEvent
  };
});

vi.mock("../../integrations/supabase/client", () => ({
  getSupabaseClient: () => ({ auth: authMock })
}));

// 苹果审核 1.2 整改：登录成功后记录"同意了用户协议"。
vi.mock("../../repositories/profiles-repository", () => ({ acceptTerms, ensureProfileExists }));

vi.mock("react-router-dom", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react-router-dom")>();
  return { ...actual, useNavigate: () => navigateMock };
});

import { useAuthBootstrap } from "../../app/use-auth-bootstrap";
import { useAuthStore } from "../../store/auth-store";
import { LoginPage, OTP_RESEND_SECONDS } from "./login-page";

const initialAuthState = useAuthStore.getState();
const OLD_USER = { id: "user-1", created_at: "2026-01-01T00:00:00.000Z" };

function renderLoginPage(
  initialEntry: string | { pathname: string; search?: string; state?: unknown } = "/login",
  { agree = true }: { agree?: boolean } = {}
) {
  const result = render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <LoginPage />
    </MemoryRouter>
  );
  // 苹果审核 1.2 整改：不勾选同意框不能获取验证码 / 登录，大部分用例默认先勾上。
  if (agree) fireEvent.click(screen.getByRole("checkbox"));
  return result;
}

function fillPhone(value = "(843) 748-1464") {
  fireEvent.change(screen.getByLabelText("手机号"), { target: { value } });
}

async function sendCode() {
  authMock.signInWithOtp.mockResolvedValue({ data: {}, error: null });
  fireEvent.click(screen.getByRole("button", { name: "获取验证码" }));
  await screen.findByText("验证码已发送，请查收短信。");
}

describe("LoginPage", () => {
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  beforeEach(() => {
    authMock.signInWithPassword.mockReset();
    authMock.signInWithOtp.mockReset();
    authMock.verifyOtp.mockReset();
    authMock.onAuthStateChange.mockClear();
    authMock.getSession.mockClear();
    navigateMock.mockReset();
    acceptTerms.mockReset();
    acceptTerms.mockResolvedValue("2026-10-20T00:00:00Z");
    ensureProfileExists.mockReset();
    ensureProfileExists.mockResolvedValue(undefined);
    useAuthStore.setState(initialAuthState, true);
  });

  // 苹果审核 1.2 整改
  it("requires ticking the terms checkbox before sending a code or logging in", () => {
    renderLoginPage("/login", { agree: false });

    expect(screen.getByRole("checkbox")).not.toBeChecked();
    expect(screen.getByText(/平台对不良内容和滥用行为零容忍/)).toBeInTheDocument();
    fillPhone();
    fireEvent.click(screen.getByRole("button", { name: "获取验证码" }));

    expect(screen.getByRole("alert")).toHaveTextContent("请先阅读并勾选同意《用户协议》和《隐私政策》。");
    expect(authMock.signInWithOtp).not.toHaveBeenCalled();
  });

  it("opens on 短信验证 with a fixed +1 prefix, a code field and the 无需注册 hint", () => {
    renderLoginPage();

    expect(screen.getByRole("tab", { name: "短信验证" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("tab", { name: "密码登录" })).toHaveAttribute("aria-selected", "false");
    expect(screen.getByText("+1")).toBeInTheDocument();
    expect(screen.getByLabelText("手机号")).toHaveAttribute("type", "tel");
    expect(screen.getByLabelText("验证码")).toBeInTheDocument();
    expect(screen.getByText("无需注册，手机号验证即可登录")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "注册 / 登录" })).toBeInTheDocument();
    expect(screen.queryByText("登录华邻")).not.toBeInTheDocument();
  });

  it("has no link to a separate register page, and shows the agreement line", () => {
    renderLoginPage();

    expect(screen.queryByRole("link", { name: /注册/ })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "《用户协议》" })).toHaveAttribute("href", "/terms");
    expect(screen.getByRole("link", { name: "《隐私政策》" })).toHaveAttribute("href", "/privacy");
  });

  it("rejects a phone number that is not a 10-digit US/Canada number before sending a code", async () => {
    renderLoginPage();
    fillPhone("12345");
    fireEvent.click(screen.getByRole("button", { name: "获取验证码" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("请输入正确的 10 位美国或加拿大手机号。");
    expect(authMock.signInWithOtp).not.toHaveBeenCalled();
  });

  it("sends the code to the +1 E.164 number with a default nickname for new accounts, then counts down", async () => {
    renderLoginPage();
    fillPhone();
    await sendCode();

    expect(authMock.signInWithOtp).toHaveBeenCalledWith({
      phone: "+18437481464",
      options: { data: { display_name: expect.stringMatching(/^同城用户\d{4}$/) } }
    });
    expect(screen.getByRole("button", { name: `${OTP_RESEND_SECONDS} 秒后重发` })).toBeDisabled();
  });

  it("re-enables the code button as 重新获取 when the countdown ends", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    renderLoginPage();
    fillPhone();
    await sendCode();

    // 倒计时每秒重渲染一次再排下一秒，所以一秒一秒地推进。
    for (let second = 0; second < OTP_RESEND_SECONDS; second += 1) {
      await act(async () => {
        await vi.advanceTimersByTimeAsync(1000);
      });
    }
    expect(screen.getByRole("button", { name: "重新获取" })).toBeEnabled();
  });

  it("shows a friendly message when sending the code fails", async () => {
    authMock.signInWithOtp.mockResolvedValue({
      data: {},
      error: { message: "Error sending confirmation OTP", code: "sms_send_failed" }
    });
    renderLoginPage();
    fillPhone();
    fireEvent.click(screen.getByRole("button", { name: "获取验证码" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("验证码发送失败，请检查手机号后重试。");
  });

  it("asks for the code to be requested first", async () => {
    renderLoginPage();
    fillPhone();
    fireEvent.change(screen.getByLabelText("验证码"), { target: { value: "123456" } });
    fireEvent.click(screen.getByRole("button", { name: "注册 / 登录" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("请先获取验证码。");
    expect(authMock.verifyOtp).not.toHaveBeenCalled();
  });

  it("verifies the code and redirects home", async () => {
    authMock.verifyOtp.mockResolvedValue({
      data: { user: OLD_USER, session: { access_token: "token" } },
      error: null
    });
    renderLoginPage();
    fillPhone();
    await sendCode();
    fireEvent.change(screen.getByLabelText("验证码"), { target: { value: "12a3456" } });
    expect(screen.getByLabelText("验证码")).toHaveValue("123456");
    fireEvent.click(screen.getByRole("button", { name: "注册 / 登录" }));

    await waitFor(() => {
      expect(authMock.verifyOtp).toHaveBeenCalledWith({ phone: "+18437481464", token: "123456", type: "sms" });
    });
    await waitFor(() => expect(navigateMock).toHaveBeenCalledWith("/", { replace: true }));
    // 苹果审核 1.2 整改：登录成功后记录同意了用户协议。
    expect(ensureProfileExists).toHaveBeenCalledWith(OLD_USER.id, expect.any(String));
    expect(acceptTerms).toHaveBeenCalled();
  });

  it("returns to the page in ?redirect= after logging in with a code", async () => {
    authMock.verifyOtp.mockResolvedValue({
      data: { user: OLD_USER, session: { access_token: "token" } },
      error: null
    });
    renderLoginPage("/login?redirect=%2Factivities%2Fact-1%3Fs%3D1");
    fillPhone();
    await sendCode();
    fireEvent.change(screen.getByLabelText("验证码"), { target: { value: "123456" } });
    fireEvent.click(screen.getByRole("button", { name: "注册 / 登录" }));

    await waitFor(() => {
      expect(navigateMock).toHaveBeenCalledWith("/activities/act-1?s=1", { replace: true });
    });
  });

  it("steps back over the auth pages when the source page is behind it in history", async () => {
    authMock.verifyOtp.mockResolvedValue({
      data: { user: OLD_USER, session: { access_token: "token" } },
      error: null
    });
    renderLoginPage({ pathname: "/login", search: "?redirect=%2Factivities%2Fact-1", state: { authDepth: 1 } });
    fillPhone();
    await sendCode();
    fireEvent.change(screen.getByLabelText("验证码"), { target: { value: "123456" } });
    fireEvent.click(screen.getByRole("button", { name: "注册 / 登录" }));

    await waitFor(() => {
      expect(navigateMock).toHaveBeenCalledWith(-1);
    });
  });

  it("shows a friendly message for a wrong or expired code", async () => {
    authMock.verifyOtp.mockResolvedValue({
      data: { user: null, session: null },
      error: { message: "Token has expired or is invalid", code: "otp_expired" }
    });
    renderLoginPage();
    fillPhone();
    await sendCode();
    fireEvent.change(screen.getByLabelText("验证码"), { target: { value: "000000" } });
    fireEvent.click(screen.getByRole("button", { name: "注册 / 登录" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("验证码不正确或已过期，请重新获取。");
    expect(navigateMock).not.toHaveBeenCalled();
  });

  it("logs in with phone + password on the 密码登录 tab", async () => {
    authMock.signInWithPassword.mockResolvedValue({
      data: { user: OLD_USER, session: { access_token: "token" } },
      error: null
    });
    renderLoginPage();
    fireEvent.click(screen.getByRole("tab", { name: "密码登录" }));
    expect(screen.queryByLabelText("验证码")).not.toBeInTheDocument();
    fillPhone("8437481464");
    fireEvent.change(screen.getByLabelText("密码"), { target: { value: "password123" } });
    fireEvent.click(screen.getByRole("button", { name: "登录" }));

    await waitFor(() => {
      expect(authMock.signInWithPassword).toHaveBeenCalledWith({ phone: "+18437481464", password: "password123" });
    });
    expect(navigateMock).toHaveBeenCalledWith("/", { replace: true });
  });

  it("points users without a password to SMS login when phone + password fails", async () => {
    authMock.signInWithPassword.mockResolvedValue({
      data: { user: null, session: null },
      error: { message: "Invalid login credentials", code: "invalid_credentials" }
    });
    renderLoginPage();
    fireEvent.click(screen.getByRole("tab", { name: "密码登录" }));
    fillPhone();
    fireEvent.change(screen.getByLabelText("密码"), { target: { value: "wrong-password" } });
    fireEvent.click(screen.getByRole("button", { name: "登录" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("还没设置过密码？请用短信验证登录。");
  });

  it("keeps email login for old accounts behind a small link, with 忘记密码", async () => {
    authMock.signInWithPassword.mockResolvedValue({
      data: { user: OLD_USER, session: { access_token: "token" } },
      error: null
    });
    renderLoginPage();
    fireEvent.click(screen.getByRole("button", { name: "以前用邮箱注册？邮箱登录" }));

    expect(screen.getByRole("heading", { name: "邮箱登录" })).toBeInTheDocument();
    expect(screen.queryByRole("tab")).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "忘记密码？" })).toHaveAttribute("href", "/forgot-password");

    fireEvent.change(screen.getByLabelText("邮箱"), { target: { value: "user@example.com" } });
    fireEvent.change(screen.getByLabelText("密码"), { target: { value: "password123" } });
    fireEvent.click(screen.getByRole("button", { name: "登录" }));

    await waitFor(() => {
      expect(authMock.signInWithPassword).toHaveBeenCalledWith({ email: "user@example.com", password: "password123" });
    });

    cleanup();
    renderLoginPage();
    fireEvent.click(screen.getByRole("button", { name: "以前用邮箱注册？邮箱登录" }));
    fireEvent.click(screen.getByRole("button", { name: "返回手机号登录" }));
    expect(screen.getByRole("tab", { name: "短信验证" })).toHaveAttribute("aria-selected", "true");
  });

  it("toggles the password field between hidden and visible text", () => {
    renderLoginPage();
    fireEvent.click(screen.getByRole("tab", { name: "密码登录" }));

    const passwordInput = screen.getByLabelText("密码");
    expect(passwordInput).toHaveAttribute("type", "password");
    fireEvent.click(screen.getByRole("button", { name: "显示密码" }));
    expect(passwordInput).toHaveAttribute("type", "text");
  });

  it("updates the shared auth store session through the existing single auth listener after login", async () => {
    const session = { access_token: "token", user: OLD_USER };
    authMock.signInWithOtp.mockResolvedValue({ data: {}, error: null });
    authMock.verifyOtp.mockImplementation(async () => {
      triggerAuthEvent("SIGNED_IN", session);
      return { data: { user: session.user, session }, error: null };
    });

    function Harness() {
      useAuthBootstrap();
      return <LoginPage />;
    }

    render(
      <MemoryRouter>
        <Harness />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(useAuthStore.getState().isInitializing).toBe(false);
    });
    fireEvent.click(screen.getByRole("checkbox"));

    fillPhone();
    await sendCode();
    fireEvent.change(screen.getByLabelText("验证码"), { target: { value: "123456" } });
    fireEvent.click(screen.getByRole("button", { name: "注册 / 登录" }));

    await waitFor(() => {
      expect(useAuthStore.getState().session).toEqual(session);
    });
  });
});
