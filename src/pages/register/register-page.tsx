import { type FormEvent, useState } from "react";
import { Link, useNavigate } from "react-router-dom";

import {
  AuthLayout,
  authInputClassName,
  authLabelClassName,
  authSubmitButtonClassName
} from "../../components/auth-layout";
import { PasswordInput } from "../../components/password-input";
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
  const [agreedToTerms, setAgreedToTerms] = useState(false);
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
      displayName,
      agreedToTerms
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
    <AuthLayout>
      <h1 className="mb-6 text-xl font-bold text-text">注册 Saminest 账号</h1>
      {error ? (
        <p className="mb-4 rounded border border-danger bg-danger/10 px-3 py-2 text-sm text-danger" role="alert">
          {error}
        </p>
      ) : null}
      <form onSubmit={handleSubmit} noValidate>
        <div className="space-y-4">
          <label className={authLabelClassName}>
            显示名称
            <input
              type="text"
              autoComplete="nickname"
              value={displayName}
              onChange={(event) => setDisplayName(event.target.value)}
              required
              className={authInputClassName}
            />
          </label>
          <label className={authLabelClassName}>
            邮箱
            <input
              type="email"
              autoComplete="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              required
              className={authInputClassName}
            />
          </label>
          <PasswordInput
            id="register-password"
            label="密码"
            value={password}
            onChange={setPassword}
            autoComplete="new-password"
            minLength={MIN_PASSWORD_LENGTH}
          />
          <PasswordInput
            id="register-confirm-password"
            label="确认密码"
            value={confirmPassword}
            onChange={setConfirmPassword}
            autoComplete="new-password"
            minLength={MIN_PASSWORD_LENGTH}
          />
          <label className="flex items-start gap-2 text-base font-normal text-text">
            <input
              type="checkbox"
              checked={agreedToTerms}
              onChange={(event) => setAgreedToTerms(event.target.checked)}
              className="mt-1 h-4 w-4 shrink-0 rounded border-border text-primary focus:outline-none focus:ring-1 focus:ring-primary"
            />
            <span>
              我已阅读并同意
              <Link
                to="/terms"
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary underline"
              >
                《用户协议》
              </Link>
              和
              <Link
                to="/privacy"
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary underline"
              >
                《隐私政策》
              </Link>
            </span>
          </label>
        </div>
        <button
          type="submit"
          disabled={submitting}
          className={`mt-6 ${authSubmitButtonClassName}`}
        >
          {submitting ? "注册中…" : "注册"}
        </button>
      </form>
    </AuthLayout>
  );
}
