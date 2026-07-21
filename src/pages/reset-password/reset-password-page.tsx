import { type FormEvent, useState } from "react";
import { Link } from "react-router-dom";

import { authService } from "../../services/auth/auth-service";
import { useAuthStore } from "../../store/auth-store";
import { AppError } from "../../utils/app-error";
import { MIN_PASSWORD_LENGTH } from "../register/register-validation";

const DEFAULT_ERROR_MESSAGE = "密码更新失败，请稍后重试。";

/**
 * Supabase Auth 错误码 → 友好中文提示。
 * 未命中的错误码一律回退到 DEFAULT_ERROR_MESSAGE，不把原始 Supabase 报错露给用户。
 */
const FRIENDLY_ERROR_MESSAGES: Record<string, string> = {
  same_password: "新密码不能和当前密码相同。",
  weak_password: "密码强度不够，请更换更复杂的密码。",
  over_request_rate_limit: "操作过于频繁，请稍后再试。",
  request_timeout: "网络请求超时，请稍后重试。"
};

function friendlyErrorMessage(error: unknown): string {
  if (error instanceof AppError) {
    return FRIENDLY_ERROR_MESSAGES[error.code] ?? DEFAULT_ERROR_MESSAGE;
  }
  return DEFAULT_ERROR_MESSAGE;
}

export function ResetPasswordPage() {
  /**
   * Supabase client 默认 detectSessionInUrl: true，用户从邮件链接点进来时，
   * 会在 App 根部已注册的那一个 onAuthStateChange 监听器（useAuthBootstrap）
   * 完成初始化前自动用链接里的 token 换出一个临时 session 并写入 auth-store。
   * 这里不新开一个 Supabase 监听，直接读 store 里现成的 session 判断链接是否
   * 有效——没有 session 就说明链接无效或已过期。
   */
  const session = useAuthStore((s) => s.session);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  if (!session) {
    return (
      <main className="flex justify-center px-4 py-10 pb-20 md:pb-10">
        <div className="w-full max-w-sm rounded-lg border border-border bg-white p-6 shadow-sm">
          <h1 className="mb-6 text-xl font-bold text-text">重置密码</h1>
          <p className="mb-4 rounded border border-danger bg-danger/10 px-3 py-2 text-sm text-danger" role="alert">
            这个重置密码链接无效或已经过期，请重新发起一次找回密码。
          </p>
          <p className="mt-4 text-center text-sm text-text-muted">
            <Link to="/forgot-password" className="text-primary hover:underline">重新发送重置邮件</Link>
          </p>
        </div>
      </main>
    );
  }

  if (submitted) {
    return (
      <main className="flex justify-center px-4 py-10 pb-20 md:pb-10">
        <div className="w-full max-w-sm rounded-lg border border-border bg-white p-6 shadow-sm">
          <h1 className="mb-6 text-xl font-bold text-text">重置密码</h1>
          <p className="mb-4 rounded border border-success bg-success/10 px-3 py-2 text-sm text-success" role="status">
            密码已更新，请重新登录。
          </p>
          <p className="mt-4 text-center text-sm text-text-muted">
            <Link to="/login" className="text-primary hover:underline">去登录</Link>
          </p>
        </div>
      </main>
    );
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (submitting) return;

    setError(null);
    if (!password) {
      setError("请填写新密码。");
      return;
    }
    if (password.length < MIN_PASSWORD_LENGTH) {
      setError(`密码至少需要 ${MIN_PASSWORD_LENGTH} 位。`);
      return;
    }
    if (password !== confirmPassword) {
      setError("两次输入的密码不一致。");
      return;
    }

    setSubmitting(true);
    try {
      await authService.updatePassword(password);
      setSubmitted(true);
    } catch (cause) {
      setError(friendlyErrorMessage(cause));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="flex justify-center px-4 py-10 pb-20 md:pb-10">
      <div className="w-full max-w-sm rounded-lg border border-border bg-white p-6 shadow-sm">
        <h1 className="mb-6 text-xl font-bold text-text">重置密码</h1>
        <form onSubmit={handleSubmit} noValidate>
          {error ? (
            <p className="mb-4 rounded border border-danger bg-danger/10 px-3 py-2 text-sm text-danger" role="alert">
              {error}
            </p>
          ) : null}
          <label className="mb-4 block text-sm font-medium text-text">
            新密码
            <input
              type="password"
              autoComplete="new-password"
              minLength={MIN_PASSWORD_LENGTH}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
              className="mt-1 w-full rounded border border-border px-3 py-2 text-base text-text focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </label>
          <label className="mb-4 block text-sm font-medium text-text">
            确认新密码
            <input
              type="password"
              autoComplete="new-password"
              minLength={MIN_PASSWORD_LENGTH}
              value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.target.value)}
              required
              className="mt-1 w-full rounded border border-border px-3 py-2 text-base text-text focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </label>
          <button
            type="submit"
            disabled={submitting}
            className="w-full rounded bg-primary px-4 py-2 font-semibold text-white hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-60"
          >
            {submitting ? "更新中…" : "更新密码"}
          </button>
        </form>
      </div>
    </main>
  );
}
