import { type FormEvent, useState } from "react";
import { Link, useNavigate } from "react-router-dom";

import { authService } from "../../services/auth/auth-service";
import { AppError } from "../../utils/app-error";

const DEFAULT_ERROR_MESSAGE = "登录失败，请稍后重试。";

/**
 * Supabase Auth 错误码 → 友好中文提示。
 * 未命中的错误码一律回退到 DEFAULT_ERROR_MESSAGE，不把原始 Supabase 报错露给用户。
 */
const FRIENDLY_ERROR_MESSAGES: Record<string, string> = {
  invalid_credentials: "邮箱或密码不正确，请重新输入。",
  email_not_confirmed: "邮箱还没有完成验证，请先查收验证邮件。",
  user_banned: "该账号已被限制，如有疑问请联系客服。",
  user_not_found: "邮箱或密码不正确，请重新输入。",
  over_request_rate_limit: "操作过于频繁，请稍后再试。",
  request_timeout: "网络请求超时，请稍后重试。",
  captcha_failed: "验证未通过，请刷新页面后重试。"
};

function friendlyErrorMessage(error: unknown): string {
  if (error instanceof AppError) {
    return FRIENDLY_ERROR_MESSAGES[error.code] ?? DEFAULT_ERROR_MESSAGE;
  }
  return DEFAULT_ERROR_MESSAGE;
}

export function LoginPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (submitting) return;

    setError(null);
    const trimmedEmail = email.trim();
    if (!trimmedEmail || !password) {
      setError("请填写邮箱和密码。");
      return;
    }

    setSubmitting(true);
    try {
      await authService.signIn({ email: trimmedEmail, password });
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
        <h1 className="mb-6 text-xl font-bold text-text">登录 Saminest</h1>
        <form onSubmit={handleSubmit} noValidate>
          {error ? (
            <p className="mb-4 rounded border border-danger bg-danger/10 px-3 py-2 text-sm text-danger" role="alert">
              {error}
            </p>
          ) : null}
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
              autoComplete="current-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
              className="mt-1 w-full rounded border border-border px-3 py-2 text-sm text-text focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </label>
          <button
            type="submit"
            disabled={submitting}
            className="w-full rounded bg-primary px-4 py-2 font-semibold text-white hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-60"
          >
            {submitting ? "登录中…" : "登录"}
          </button>
        </form>
        <p className="mt-4 text-center text-sm text-text-muted">
          <Link to="/forgot-password" className="text-primary hover:underline">忘记密码？</Link>
        </p>
        <p className="mt-4 text-center text-sm text-text-muted">
          还没有账号？<Link to="/register" className="text-primary hover:underline">去注册</Link>
        </p>
      </div>
    </main>
  );
}
