import { type FormEvent, useState } from "react";
import { Link } from "react-router-dom";

import { authService } from "../../services/auth/auth-service";

const CONFIRMATION_MESSAGE = "如果该邮箱已注册，我们已发送重置密码邮件。";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (submitting) return;

    setError(null);
    const trimmedEmail = email.trim();
    if (!trimmedEmail || !EMAIL_PATTERN.test(trimmedEmail)) {
      setError("请填写正确的邮箱地址。");
      return;
    }

    setSubmitting(true);
    try {
      await authService.resetPassword(
        trimmedEmail,
        `${window.location.origin}/reset-password`
      );
    } catch {
      // 不区分邮箱是否存在、请求是否成功，统一展示同一条提示，
      // 避免被用来枚举已注册邮箱（见 PRD 找回密码需求的安全惯例）。
    } finally {
      setSubmitting(false);
      setSubmitted(true);
    }
  }

  return (
    <main className="flex justify-center px-4 py-10 pb-20 md:pb-10">
      <div className="w-full max-w-sm rounded-lg border border-border bg-white p-6 shadow-sm">
        <h1 className="mb-6 text-xl font-bold text-text">找回密码</h1>
        {submitted ? (
          <p className="mb-4 rounded border border-success bg-success/10 px-3 py-2 text-sm text-success" role="status">
            {CONFIRMATION_MESSAGE}
          </p>
        ) : (
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
            <button
              type="submit"
              disabled={submitting}
              className="w-full rounded bg-primary px-4 py-2 font-semibold text-white hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-60"
            >
              {submitting ? "发送中…" : "发送重置邮件"}
            </button>
          </form>
        )}
        <p className="mt-4 text-center text-sm text-text-muted">
          <Link to="/login" className="text-primary hover:underline">返回登录</Link>
        </p>
      </div>
    </main>
  );
}
