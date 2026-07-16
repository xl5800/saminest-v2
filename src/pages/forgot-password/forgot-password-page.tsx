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
    <main>
      <h1>找回密码</h1>
      {submitted ? (
        <p role="status">{CONFIRMATION_MESSAGE}</p>
      ) : (
        <form onSubmit={handleSubmit} noValidate>
          {error ? <p role="alert">{error}</p> : null}
          <label>
            邮箱
            <input
              type="email"
              autoComplete="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              required
            />
          </label>
          <button type="submit" disabled={submitting}>
            {submitting ? "发送中…" : "发送重置邮件"}
          </button>
        </form>
      )}
      <p>
        <Link to="/login">返回登录</Link>
      </p>
    </main>
  );
}
