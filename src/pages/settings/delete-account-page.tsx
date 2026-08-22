import { type FormEvent, useState } from "react";

import { PasswordInput } from "../../components/password-input";
import { useAccountDeletionStatusQuery } from "../../features/profile/use-account-deletion-status-query";
import { useCancelAccountDeletionMutation } from "../../features/profile/use-cancel-account-deletion-mutation";
import { useRequestAccountDeletionMutation } from "../../features/profile/use-request-account-deletion-mutation";
import { authService } from "../../services/auth/auth-service";
import { useAuthStore } from "../../store/auth-store";
import { AppError } from "../../utils/app-error";

const GRACE_PERIOD_DAYS = 15;
const LOAD_ERROR_MESSAGE = "加载注销状态失败，请稍后重试。";
const CANCEL_ERROR_MESSAGE = "撤销失败，请稍后重试。";
const REQUEST_DEFAULT_ERROR_MESSAGE = "注销申请提交失败，请稍后重试。";
const PASSWORD_REQUIRED_MESSAGE = "请输入密码确认身份。";
const CONFIRM_TEXT = "注销";
const CONFIRM_TEXT_MISMATCH_MESSAGE = `请在下方输入"${CONFIRM_TEXT}"以确认。`;

function formatDate(iso: string): string {
  const date = new Date(iso);
  return `${date.getFullYear()}年${date.getMonth() + 1}月${date.getDate()}日`;
}

function daysRemaining(iso: string): number {
  const diffMs = new Date(iso).getTime() - Date.now();
  return Math.max(0, Math.ceil(diffMs / (24 * 60 * 60 * 1000)));
}

/**
 * 注销账号页（/settings/delete-account，路由已在 routes.tsx 用 RequireAuth
 * 包裹）。两种互斥的展示状态，由 useAccountDeletionStatusQuery 是否查到
 * 一条未撤销/未清除的请求决定：
 *
 * 1. 没有待处理请求——展示后果说明 + 密码确认 + 手动输入"注销"二次确认
 *    （比单纯一个"确认"弹窗更能防止误触，参照很多产品"删除前输入项目名"
 *    的做法，这里输入的是固定文案而不是账号名/邮箱，因为后者对着自己的
 *    邮箱抄一遍没有额外的防误触效果）+"确认注销"按钮。
 * 2. 有待处理请求——展示到期日期/剩余天数 + "撤销注销"按钮，缓冲期内
 *    账号本身完全正常使用，这个页面不做任何额外的功能限制。
 *
 * 密码确认走 authService.verifyCurrentPassword（内部用
 * supabase.auth.signInWithPassword 复核，见该函数注释），成功后才调用
 * requestAccountDeletion() 这个 RPC——避免"账号一旦被盗，攻击者能不需要
 * 密码就把受害者账号送进注销流程"这种风险，跟很多产品"删除账号前必须
 * 重新验证密码"是同一个考虑。
 */
export function DeleteAccountPage() {
  const session = useAuthStore((s) => s.session);
  const email = session?.user.email ?? "";

  const { data: status, isPending, isError } = useAccountDeletionStatusQuery();
  const requestMutation = useRequestAccountDeletionMutation();
  const cancelMutation = useCancelAccountDeletionMutation();

  const [password, setPassword] = useState("");
  const [confirmText, setConfirmText] = useState("");
  const [validationError, setValidationError] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [verifyingPassword, setVerifyingPassword] = useState(false);
  const [cancelError, setCancelError] = useState<string | null>(null);

  async function handleCancel(): Promise<void> {
    setCancelError(null);
    try {
      await cancelMutation.mutateAsync();
    } catch {
      setCancelError(CANCEL_ERROR_MESSAGE);
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (verifyingPassword || requestMutation.isPending) return;

    setValidationError(null);
    setSubmitError(null);

    if (!password) {
      setValidationError(PASSWORD_REQUIRED_MESSAGE);
      return;
    }
    if (confirmText.trim() !== CONFIRM_TEXT) {
      setValidationError(CONFIRM_TEXT_MISMATCH_MESSAGE);
      return;
    }

    setVerifyingPassword(true);
    try {
      await authService.verifyCurrentPassword(email, password);
    } catch (error) {
      setVerifyingPassword(false);
      setSubmitError(error instanceof AppError ? error.message : REQUEST_DEFAULT_ERROR_MESSAGE);
      return;
    }
    setVerifyingPassword(false);

    try {
      await requestMutation.mutateAsync();
      setPassword("");
      setConfirmText("");
    } catch (error) {
      setSubmitError(error instanceof AppError ? error.message : REQUEST_DEFAULT_ERROR_MESSAGE);
    }
  }

  if (isPending) {
    return (
      <main className="flex justify-center px-4 py-10 pb-20 md:pb-10">
        <p role="status" className="text-sm text-text-muted">
          加载中…
        </p>
      </main>
    );
  }

  if (isError) {
    return (
      <main className="flex justify-center px-4 py-10 pb-20 md:pb-10">
        <p role="alert" className="rounded border border-danger bg-danger/10 px-3 py-2 text-sm text-danger">
          {LOAD_ERROR_MESSAGE}
        </p>
      </main>
    );
  }

  if (status) {
    return (
      <main className="flex justify-center px-4 py-10 pb-20 md:pb-10">
        <div className="w-full max-w-md rounded-lg border border-border bg-white p-6 shadow-sm">
          <h1 className="mb-6 text-xl font-bold text-text">注销账号</h1>
          <p className="mb-2 text-sm text-text">
            你的账号将在 <strong>{formatDate(status.scheduledPurgeAt)}</strong> 注销
            （还剩 {daysRemaining(status.scheduledPurgeAt)} 天）。
          </p>
          <p className="mb-6 text-sm text-text-muted">
            在此之前账号可以正常使用，随时可以撤销这次注销申请。
          </p>
          {cancelError ? (
            <p role="alert" className="mb-4 rounded border border-danger bg-danger/10 px-3 py-2 text-sm text-danger">
              {cancelError}
            </p>
          ) : null}
          <button
            type="button"
            onClick={() => void handleCancel()}
            disabled={cancelMutation.isPending}
            className="w-full rounded bg-primary px-4 py-2 font-semibold text-white hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-60"
          >
            {cancelMutation.isPending ? "撤销中…" : "撤销注销"}
          </button>
        </div>
      </main>
    );
  }

  return (
    <main className="flex justify-center px-4 py-10 pb-20 md:pb-10">
      <div className="w-full max-w-md rounded-lg border border-border bg-white p-6 shadow-sm">
        <h1 className="mb-4 text-xl font-bold text-text">注销账号</h1>
        <p className="mb-2 text-sm text-text">
          注销后你的账号将在 {GRACE_PERIOD_DAYS} 天后正式清除：昵称、头像、简介、地区等个人资料会被清空，且无法再用当前邮箱登录。
        </p>
        <p className="mb-6 text-sm text-text">
          {GRACE_PERIOD_DAYS} 天缓冲期内账号可以正常使用，你可以随时回到这个页面撤销。已发布的帖子和已发送的消息不会被删除，但会显示为"已注销用户"发布/发送。
        </p>

        <form onSubmit={handleSubmit} noValidate>
          {validationError ? (
            <p className="mb-4 rounded border border-danger bg-danger/10 px-3 py-2 text-sm text-danger" role="alert">
              {validationError}
            </p>
          ) : null}
          {submitError ? (
            <p className="mb-4 rounded border border-danger bg-danger/10 px-3 py-2 text-sm text-danger" role="alert">
              {submitError}
            </p>
          ) : null}

          <div className="mb-4">
            <PasswordInput
              id="delete-account-password"
              label="输入当前密码确认身份"
              value={password}
              onChange={setPassword}
              autoComplete="current-password"
            />
          </div>

          <label className="mb-6 block text-sm font-medium text-text">
            {`请输入"${CONFIRM_TEXT}"确认操作`}
            <input
              type="text"
              value={confirmText}
              onChange={(event) => setConfirmText(event.target.value)}
              className="mt-1 w-full rounded border border-border px-3 py-2 text-base text-text focus:border-danger focus:outline-none focus:ring-1 focus:ring-danger"
            />
          </label>

          <button
            type="submit"
            disabled={verifyingPassword || requestMutation.isPending}
            className="w-full rounded bg-danger px-4 py-2 font-semibold text-white hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {verifyingPassword || requestMutation.isPending ? "处理中…" : "确认注销账号"}
          </button>
        </form>
      </div>
    </main>
  );
}
