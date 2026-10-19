import { type FormEvent, useState } from "react";

import { authInputClassName, authLabelClassName, authSubmitButtonClassName } from "../../components/auth-layout";
import { PasswordInput } from "../../components/password-input";
import { TopBar } from "../../components/top-bar";
import { authService } from "../../services/auth/auth-service";
import { AppError } from "../../utils/app-error";
import { MIN_PASSWORD_LENGTH } from "../register/register-validation";

const DEFAULT_ERROR_MESSAGE = "密码保存失败，请稍后重试。";

const FRIENDLY_ERROR_MESSAGES: Record<string, string> = {
  same_password: "新密码不能和当前密码相同。",
  weak_password: "密码强度不够，请更换更复杂的密码。",
  reauthentication_needed: "为了账号安全，请退出后用短信验证重新登录，再来设置密码。",
  over_request_rate_limit: "操作过于频繁，请稍后再试。",
  request_timeout: "网络请求超时，请稍后重试。"
};

function friendlyErrorMessage(error: unknown): string {
  if (error instanceof AppError) {
    return FRIENDLY_ERROR_MESSAGES[error.code] ?? DEFAULT_ERROR_MESSAGE;
  }
  return DEFAULT_ERROR_MESSAGE;
}

/**
 * 设置 / 修改登录密码（/settings/password，RequireAuth）——短信验证码登录
 * 任务卡新增。短信注册的手机号账号默认没有密码，在这里设一个之后，就能在
 * 登录页"密码登录"里用手机号 + 密码登录（省得每次收验证码）。已经有密码的
 * 账号在这里直接改成新密码。
 *
 * 表单校验（至少 MIN_PASSWORD_LENGTH 位、两次一致）跟重置密码页
 * （reset-password-page.tsx）一样；没有复用那个页面，是因为它是邮件重置
 * 链接的落地页（AuthLayout、没有登录状态时提示链接失效、改完要求重新登录），
 * 这里是登录状态下的设置页，外壳和成功后的流程都不同。
 */
export function SetPasswordPage() {
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (submitting) return;

    setError(null);
    setSaved(false);
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
      setSaved(true);
      setPassword("");
      setConfirmPassword("");
    } catch (cause) {
      setError(friendlyErrorMessage(cause));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="min-h-screen pb-20 md:pb-6">
      <TopBar variant="nav-only" title="登录密码" />
      <div className="mx-auto max-w-md px-4 py-6">
        <p className="mb-5 text-sm text-text-muted">
          设置密码后，可以在登录页选"密码登录"，用手机号 + 密码登录。忘记密码时用短信验证登录，再回到这里改。
        </p>
        <form onSubmit={handleSubmit} noValidate>
          {error ? (
            <p className="mb-4 rounded border border-danger bg-danger/10 px-3 py-2 text-sm text-danger" role="alert">
              {error}
            </p>
          ) : null}
          {saved ? (
            <p className="mb-4 rounded border border-success bg-success/10 px-3 py-2 text-sm text-success" role="status">
              密码已保存，下次可以用手机号 + 密码登录。
            </p>
          ) : null}
          <div className="space-y-4">
            <PasswordInput
              id="set-password-new-password"
              label="新密码"
              value={password}
              onChange={setPassword}
              autoComplete="new-password"
              minLength={MIN_PASSWORD_LENGTH}
            />
            <label className={authLabelClassName}>
              确认新密码
              <input
                type="password"
                autoComplete="new-password"
                minLength={MIN_PASSWORD_LENGTH}
                value={confirmPassword}
                onChange={(event) => setConfirmPassword(event.target.value)}
                className={authInputClassName}
              />
            </label>
          </div>
          <button type="submit" disabled={submitting} className={`mt-6 ${authSubmitButtonClassName}`}>
            {submitting ? "保存中…" : "保存密码"}
          </button>
        </form>
      </div>
    </main>
  );
}
