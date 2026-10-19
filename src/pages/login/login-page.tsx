import { type FormEvent, useEffect, useState } from "react";
import { Link } from "react-router-dom";

import {
  AuthLayout,
  authInputClassName,
  authLabelClassName,
  authSubmitButtonClassName
} from "../../components/auth-layout";
import { PasswordInput } from "../../components/password-input";
import { track } from "../../features/analytics/track";
import { useFinishAuth } from "../../router/use-finish-auth";
import { authService } from "../../services/auth/auth-service";
import { AppError } from "../../utils/app-error";
import { generateDefaultDisplayName } from "../../utils/default-display-name";
import { isLikelyEmail, toUsPhoneE164 } from "../../utils/phone-identity";

const DEFAULT_ERROR_MESSAGE = "登录失败，请稍后重试。";

/** 获取验证码之后多少秒内不能再点（Supabase 默认也限制 60 秒一条）。 */
export const OTP_RESEND_SECONDS = 60;

const OTP_LENGTH = 6;

/** 跟右边的 "+1" / "获取验证码" 并排的输入框：去掉 authInputClassName 自带的上边距。 */
const inlineInputClassName = `${authInputClassName.replace("mt-1 ", "")} min-w-0 flex-1`;

const FRIENDLY_ERROR_MESSAGES: Record<string, string> = {
  invalid_credentials: "账号或密码不正确，请重新输入。",
  email_not_confirmed: "邮箱还没有完成验证，请先查收验证邮件。",
  phone_not_confirmed: "这个手机号还没有验证，请用短信验证登录。",
  user_banned: "该账号已被限制，如有疑问请联系客服。",
  user_not_found: "账号或密码不正确，请重新输入。",
  otp_expired: "验证码不正确或已过期，请重新获取。",
  over_sms_send_rate_limit: "验证码发送太频繁，请稍后再试。",
  over_request_rate_limit: "操作过于频繁，请稍后再试。",
  sms_send_failed: "验证码发送失败，请检查手机号后重试。",
  phone_provider_disabled: "暂时无法使用短信登录，请稍后再试。",
  request_timeout: "网络请求超时，请稍后重试。",
  captcha_failed: "验证未通过，请刷新页面后重试。"
};

function friendlyErrorMessage(error: unknown, overrides: Record<string, string> = {}): string {
  if (error instanceof AppError) {
    return overrides[error.code] ?? FRIENDLY_ERROR_MESSAGES[error.code] ?? DEFAULT_ERROR_MESSAGE;
  }
  return DEFAULT_ERROR_MESSAGE;
}

/** 刚刚建出来的账号（验证码登录时自动注册）——用来区分"注册"和"登录"两个埋点。 */
function isJustCreated(createdAt: string | undefined): boolean {
  if (!createdAt) return false;
  return Date.now() - new Date(createdAt).getTime() < 2 * 60 * 1000;
}

type LoginMode = "sms" | "password" | "email";

const TABS: Array<{ key: Exclude<LoginMode, "email">; label: string }> = [
  { key: "sms", label: "短信验证" },
  { key: "password", label: "密码登录" }
];

/**
 * 登录页（/login）——短信验证码登录任务卡起，手机号是唯一的注册方式：
 *
 * - **短信验证**（默认）：手机号 → 获取验证码 → 输入 6 位码 → 登录。没注册过
 *   的号码在验证通过时自动建账号（"无需注册，手机号验证即可登录"），默认
 *   昵称"同城用户xxxx"，用户以后自己改。验证码由 Supabase Auth 通过 Twilio
 *   Verify 发送，只开放美国 / 加拿大号码，所以号码前面固定显示 "+1"。
 * - **密码登录**：手机号 + 密码。短信注册的账号默认没有密码，要先在
 *   "设置 → 登录密码"里设一个；忘了密码就切回短信验证登录。
 * - **邮箱登录**：页面底部一个不起眼的小链接，只给以前用邮箱注册的老账号用，
 *   保留"忘记密码"（邮件重置）。不再提供邮箱注册——/register 已经重定向到
 *   这里。
 *
 * 为什么二手交易要手机号：见面交易需要账号对应一个真实、验证过的手机号，
 * 一个号码只能注册一个账号，邮箱太容易批量注册。
 *
 * 注册即同意协议：沿用原来注册页"按钮下方一行说明"的做法，不加必须勾选的
 * 复选框（少一步操作）。
 */
export function LoginPage() {
  const { finishAuth } = useFinishAuth();
  const [mode, setMode] = useState<LoginMode>("sms");
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [sendingCode, setSendingCode] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  /** 验证码发到了哪个号码——用户改了号码就得重新获取。 */
  const [codeSentTo, setCodeSentTo] = useState<string | null>(null);

  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = window.setTimeout(() => setCooldown((value) => value - 1), 1000);
    return () => window.clearTimeout(timer);
  }, [cooldown]);

  function switchMode(next: LoginMode): void {
    setMode(next);
    setError(null);
    setNotice(null);
  }

  async function handleSendCode(): Promise<void> {
    if (sendingCode || cooldown > 0) return;
    setError(null);
    setNotice(null);

    const e164 = toUsPhoneE164(phone);
    if (!e164) {
      setError("请输入正确的 10 位美国或加拿大手机号。");
      return;
    }

    setSendingCode(true);
    try {
      await authService.sendPhoneOtp(e164, generateDefaultDisplayName());
      setCodeSentTo(e164);
      setCooldown(OTP_RESEND_SECONDS);
      setNotice("验证码已发送，请查收短信。");
    } catch (cause) {
      setError(friendlyErrorMessage(cause));
    } finally {
      setSendingCode(false);
    }
  }

  async function submitSms(): Promise<void> {
    const e164 = toUsPhoneE164(phone);
    if (!e164) {
      setError("请输入正确的 10 位美国或加拿大手机号。");
      return;
    }
    const token = code.trim();
    if (!/^\d{6}$/.test(token)) {
      setError("请输入 6 位短信验证码。");
      return;
    }
    if (codeSentTo !== e164) {
      setError("请先获取验证码。");
      return;
    }

    setSubmitting(true);
    try {
      const { user } = await authService.verifyPhoneOtp(e164, token);
      if (isJustCreated(user?.created_at)) {
        track("signed_up", { method: "phone" });
      } else {
        track("logged_in", { method: "phone" });
      }
      finishAuth();
    } catch (cause) {
      setError(friendlyErrorMessage(cause));
      setSubmitting(false);
    }
  }

  async function submitPassword(): Promise<void> {
    const e164 = toUsPhoneE164(phone);
    if (!e164) {
      setError("请输入正确的 10 位美国或加拿大手机号。");
      return;
    }
    if (!password) {
      setError("请填写密码。");
      return;
    }

    setSubmitting(true);
    try {
      await authService.signInWithPhonePassword(e164, password);
      track("logged_in", { method: "phone" });
      finishAuth();
    } catch (cause) {
      setError(
        friendlyErrorMessage(cause, {
          invalid_credentials: "手机号或密码不正确。还没设置过密码？请用短信验证登录。"
        })
      );
      setSubmitting(false);
    }
  }

  async function submitEmail(): Promise<void> {
    const trimmed = email.trim();
    if (!trimmed || !password) {
      setError("请填写邮箱和密码。");
      return;
    }
    if (!isLikelyEmail(trimmed)) {
      setError("请输入正确的邮箱地址。");
      return;
    }

    setSubmitting(true);
    try {
      await authService.signIn({ email: trimmed, password });
      track("logged_in", { method: "email" });
      finishAuth();
    } catch (cause) {
      setError(friendlyErrorMessage(cause, { invalid_credentials: "邮箱或密码不正确，请重新输入。" }));
      setSubmitting(false);
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (submitting) return;
    setError(null);
    setNotice(null);

    if (mode === "sms") await submitSms();
    else if (mode === "password") await submitPassword();
    else await submitEmail();
  }

  const phoneField = (
    <div>
      <span id="login-phone-label" className={authLabelClassName}>
        手机号
      </span>
      <div className="mt-1 flex gap-2">
        <span
          aria-hidden="true"
          className="flex h-11 w-16 shrink-0 items-center justify-center rounded-xl border border-border text-base text-text"
        >
          +1
        </span>
        <input
          type="tel"
          inputMode="numeric"
          autoComplete="tel-national"
          aria-labelledby="login-phone-label"
          placeholder="10 位手机号"
          value={phone}
          onChange={(event) => setPhone(event.target.value)}
          className={inlineInputClassName}
        />
      </div>
    </div>
  );

  return (
    <AuthLayout>
      <h1 className="mb-5 text-xl font-bold text-text">
        {mode === "email" ? "邮箱登录" : "登录华邻"}
      </h1>

      {mode !== "email" ? (
        <div role="tablist" aria-label="登录方式" className="mb-5 flex border-b border-border">
          {TABS.map((tab) => {
            const selected = tab.key === mode;
            return (
              <button
                key={tab.key}
                type="button"
                role="tab"
                aria-selected={selected}
                onClick={() => switchMode(tab.key)}
                className={`relative flex-1 pb-2.5 text-base ${
                  selected ? "font-semibold text-primary" : "text-text-muted"
                }`}
              >
                {tab.label}
                {selected ? (
                  <span aria-hidden="true" className="absolute inset-x-1/4 -bottom-px h-[3px] rounded-full bg-primary" />
                ) : null}
              </button>
            );
          })}
        </div>
      ) : null}

      {mode === "sms" ? (
        <p className="mb-4 text-sm text-primary">无需注册，手机号验证即可登录</p>
      ) : null}

      {error ? (
        <p className="mb-4 rounded border border-danger bg-danger/10 px-3 py-2 text-sm text-danger" role="alert">
          {error}
        </p>
      ) : null}
      {notice && !error ? (
        <p className="mb-4 rounded border border-success bg-success/10 px-3 py-2 text-sm text-success" role="status">
          {notice}
        </p>
      ) : null}

      <form onSubmit={handleSubmit} noValidate>
        <div className="space-y-4">
          {mode === "email" ? (
            <label className={authLabelClassName}>
              邮箱
              <input
                type="email"
                autoComplete="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                className={authInputClassName}
              />
            </label>
          ) : (
            phoneField
          )}

          {mode === "sms" ? (
            <div>
              <span id="login-code-label" className={authLabelClassName}>
                验证码
              </span>
              <div className="mt-1 flex gap-2">
                <input
                  type="text"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  maxLength={OTP_LENGTH}
                  aria-labelledby="login-code-label"
                  placeholder="6 位短信验证码"
                  value={code}
                  onChange={(event) => setCode(event.target.value.replace(/\D/g, ""))}
                  className={inlineInputClassName}
                />
                <button
                  type="button"
                  onClick={handleSendCode}
                  disabled={sendingCode || cooldown > 0}
                  className="h-11 w-28 shrink-0 rounded-xl border border-primary px-2 text-sm font-medium text-primary disabled:border-border disabled:text-text-muted"
                >
                  {sendingCode ? "发送中…" : cooldown > 0 ? `${cooldown} 秒后重发` : codeSentTo ? "重新获取" : "获取验证码"}
                </button>
              </div>
            </div>
          ) : (
            <PasswordInput
              id="login-password"
              label="密码"
              value={password}
              onChange={setPassword}
              autoComplete="current-password"
            />
          )}
        </div>

        <button type="submit" disabled={submitting} className={`mt-6 ${authSubmitButtonClassName}`}>
          {submitting ? "登录中…" : mode === "sms" ? "注册 / 登录" : "登录"}
        </button>

        <p className="mt-3 text-center text-xs text-text-muted">
          登录即表示同意
          <Link to="/terms" className="text-primary underline">
            《用户协议》
          </Link>
          和
          <Link to="/privacy" className="text-primary underline">
            《隐私政策》
          </Link>
        </p>
      </form>

      <div className="mt-8 space-y-2 text-center text-sm text-text-muted">
        {mode === "email" ? (
          <>
            <p>
              <Link to="/forgot-password" className="text-primary hover:underline">
                忘记密码？
              </Link>
            </p>
            <p>
              <button type="button" onClick={() => switchMode("sms")} className="text-primary hover:underline">
                返回手机号登录
              </button>
            </p>
          </>
        ) : (
          <p>
            <button type="button" onClick={() => switchMode("email")} className="text-xs text-text-muted hover:underline">
              以前用邮箱注册？邮箱登录
            </button>
          </p>
        )}
      </div>
    </AuthLayout>
  );
}
