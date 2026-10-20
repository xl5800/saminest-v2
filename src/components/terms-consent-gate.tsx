import { useState } from "react";
import { Link, matchPath, useLocation } from "react-router-dom";

import { useAcceptTermsMutation, useTermsAcceptanceQuery } from "../features/terms/use-terms-acceptance";
import { authService } from "../services/auth/auth-service";

/** 看协议原文的两个页面上不挡，用户可以先读完再回来同意。 */
const READABLE_PATHS = ["/terms", "/privacy"];

/**
 * 苹果审核 1.2 整改：已经登录、但从来没有同意过用户协议的用户（勾选框上线
 * 之前注册的老用户，或者登录时记录同意失败的），在任何页面都会看到这个
 * 必须处理的弹窗：同意才能继续用，不同意就退出登录。新用户在登录页勾选
 * 同意时已经记录过，不会看到它。
 *
 * 挂在 AppShell 上，全站一个实例。查询还没回来、或者查询失败时不弹——不能
 * 因为网络问题把所有老用户挡在门外；发内容时数据库层的敏感词过滤照样生效。
 */
export function TermsConsentGate() {
  const location = useLocation();
  const { data: acceptedAt, isSuccess } = useTermsAcceptanceQuery();
  const acceptTerms = useAcceptTermsMutation();
  const [error, setError] = useState<string | null>(null);

  const onReadablePage = READABLE_PATHS.some((path) => matchPath({ path, end: true }, location.pathname));
  if (!isSuccess || acceptedAt || onReadablePage) return null;

  function handleAccept(): void {
    setError(null);
    acceptTerms.mutate(undefined, {
      onError: () => setError("提交失败，请稍后重试。")
    });
  }

  return (
    <div role="dialog" aria-modal="true" aria-label="同意用户协议" className="fixed inset-0 z-40 flex items-end bg-overlay">
      <div className="w-full rounded-t-3xl bg-card p-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))] shadow-card">
        <p className="text-lg font-semibold text-text">请先同意用户协议</p>
        <p className="mt-3 text-sm leading-6 text-text-body">
          继续使用前，请阅读并同意
          <Link to="/terms" className="text-primary underline">
            《用户协议》
          </Link>
          和
          <Link to="/privacy" className="text-primary underline">
            《隐私政策》
          </Link>
          。平台对色情、暴力、仇恨、骚扰、诈骗等不良内容和滥用行为零容忍：违规内容会被删除，发布者会被封禁。
        </p>
        {error ? (
          <p role="alert" className="mt-3 text-sm text-danger">
            {error}
          </p>
        ) : null}
        <button
          type="button"
          onClick={handleAccept}
          disabled={acceptTerms.isPending}
          className="mt-5 w-full rounded-full bg-primary py-3 text-base font-semibold text-white hover:bg-primary-hover disabled:opacity-60"
        >
          {acceptTerms.isPending ? "提交中…" : "同意并继续"}
        </button>
        <button
          type="button"
          onClick={() => void authService.signOut()}
          className="mt-2 w-full py-2.5 text-sm text-text-muted"
        >
          不同意，退出登录
        </button>
      </div>
    </div>
  );
}
