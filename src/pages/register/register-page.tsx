import { type FormEvent, useState } from "react";
import { useNavigate } from "react-router-dom";

import { authService } from "../../services/auth/auth-service";
import { AppError } from "../../utils/app-error";
import { MIN_PASSWORD_LENGTH, validateRegisterInput } from "./register-validation";

const DEFAULT_ERROR_MESSAGE = "注册失败，请稍后重试。";

/**
 * Supabase Auth 错误码 → 友好中文提示。
 * 未命中的错误码一律回退到 DEFAULT_ERROR_MESSAGE，不把原始 Supabase 报错露给用户。
 */
const FRIENDLY_ERROR_MESSAGES: Record<string, string> = {
  email_exists: "该邮箱已经注册，请直接登录或使用找回密码。",
  user_already_exists: "该邮箱已经注册，请直接登录或使用找回密码。",
  weak_password: "密码强度不够，请更换更复杂的密码。",
  email_address_invalid: "邮箱格式不正确，请检查后重新输入。",
  over_email_send_rate_limit: "操作过于频繁，请稍后再试。",
  over_request_rate_limit: "操作过于频繁，请稍后再试。",
  signup_disabled: "当前暂不支持注册，请稍后再试。",
  captcha_failed: "验证未通过，请刷新页面后重试。",
  request_timeout: "网络请求超时，请稍后重试。",
  PROFILE_CREATE_FAILED: "账号已创建，但资料保存失败，请稍后在个人资料页重试。"
};

function friendlyErrorMessage(error: unknown): string {
  if (error instanceof AppError) {
    return FRIENDLY_ERROR_MESSAGES[error.code] ?? DEFAULT_ERROR_MESSAGE;
  }
  return DEFAULT_ERROR_MESSAGE;
}

export function RegisterPage() {
  const navigate = useNavigate();
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (submitting) return;

    setError(null);
    const validation = validateRegisterInput({
      email,
      password,
      confirmPassword,
      displayName
    });
    if (!validation.success) {
      setError(validation.error.message);
      return;
    }

    setSubmitting(true);
    try {
      await authService.signUp(validation.data);
      navigate("/", { replace: true });
    } catch (cause) {
      setError(friendlyErrorMessage(cause));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="flex justify-center px-4 py-10 pb-20 md:pb-10">
      <div className="w-full max-w-sm rounded-lg border border-border bg-white p-6 shadow-sm">
        <h1 className="mb-6 text-xl font-bold text-text">注册 Saminest 账号</h1>
        <form onSubmit={handleSubmit} noValidate>
          {error ? (
            <p className="mb-4 rounded border border-danger bg-danger/10 px-3 py-2 text-sm text-danger" role="alert">
              {error}
            </p>
          ) : null}
          <label className="mb-4 block text-sm font-medium text-text">
            显示名称
            <input
              type="text"
              autoComplete="nickname"
              value={displayName}
              onChange={(event) => setDisplayName(event.target.value)}
              required
              className="mt-1 w-full rounded border border-border px-3 py-2 text-sm text-text focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </label>
          <label className="mb-4 block text-sm font-medium text-text">
            邮箱
            <input
              type="email"
              autoComplete="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              required
              className="mt-1 w-full rounded border border-border px-3 py-2 text-sm text-text focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </label>
          <label className="mb-4 block text-sm font-medium text-text">
            密码
            <input
              type="password"
              autoComplete="new-password"
              minLength={MIN_PASSWORD_LENGTH}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
              className="mt-1 w-full rounded border border-border px-3 py-2 text-sm text-text focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </label>
          <label className="mb-4 block text-sm font-medium text-text">
            确认密码
            <input
              type="password"
              autoComplete="new-password"
              minLength={MIN_PASSWORD_LENGTH}
              value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.target.value)}
              required
              className="mt-1 w-full rounded border border-border px-3 py-2 text-sm text-text focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </label>
          <button
            type="submit"
            disabled={submitting}
            className="w-full rounded bg-primary px-4 py-2 font-semibold text-white hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-60"
          >
            {submitting ? "注册中…" : "注册"}
          </button>
        </form>
      </div>
    </main>
  );
}
